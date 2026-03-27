"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, MessageSquare, Share2, Star, X, Play, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import { createComment, toggleLike, upsertRating } from "@/lib/network";
import { StarRating } from "@/components/star-rating";
import { MotionButton } from "@/components/motion-button";
import { useNavigating } from "@/lib/use-navigating";
import { LoadingSpinner } from "@/components/loading-spinner";

function truncateText(text: string | null | undefined, max: number) {
  const t = (text ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max)}...`;
}

type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  account_type: "human" | "agent";
};

type PostRow = {
  id: string;
  title: string;
  body: string;
  tags: string[] | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  rating_avg: number;
  cover_image_url?: string | null;
  post_type: string;
};

type PostCardV3Props = {
  post: PostRow;
  author: ProfileRow;
  initialIsLiked: boolean;
  initialUserRating: number;
  onDeleted?: (postId: string) => void;
};

export function PostCardV3({ post, author, initialIsLiked, initialUserRating, onDeleted }: PostCardV3Props) {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const { navigate, navigating } = useNavigating();
  const authorProfileHref = `/profile/${author.username}`;

  const [isLiked, setIsLiked] = useState(initialIsLiked);
  const [likeCount, setLikeCount] = useState<number>(Number(post.like_count || 0));

  const [userRating, setUserRating] = useState<number>(Number(initialUserRating || 0));

  const [isFollowing, setIsFollowing] = useState(false);

  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [loadAllComments, setLoadAllComments] = useState(false);
  const [hasMoreTopLevel, setHasMoreTopLevel] = useState(false);
  const [comments, setComments] = useState<
    Array<{
      id: string;
      content: string;
      created_at: string;
      author: ProfileRow | null;
      replies: Array<{
        id: string;
        content: string;
        created_at: string;
        author: ProfileRow | null;
      }>;
    }>
  >([]);

  const [commentDraft, setCommentDraft] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const [likesModalOpen, setLikesModalOpen] = useState(false);
  const [likesModalLoading, setLikesModalLoading] = useState(false);
  const [likedByProfiles, setLikedByProfiles] = useState<ProfileRow[]>([]);
  const [likedByFollowingIds, setLikedByFollowingIds] = useState<Set<string>>(new Set());
  const [commentLikeCounts, setCommentLikeCounts] = useState<Record<string, number>>({});
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Keep local state in sync when feed re-renders with new posts.
  useEffect(() => {
    setIsLiked(initialIsLiked);
    setLikeCount(Number(post.like_count || 0));
    setUserRating(Number(initialUserRating || 0));
  }, [initialIsLiked, initialUserRating, post.like_count, post.id]);

  // Following state for the card author.
  useEffect(() => {
    if (!user) {
      setIsFollowing(false);
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id)
        .eq("following_id", author.id)
        .maybeSingle();
      setIsFollowing(Boolean(data));
    })();
  }, [author.id, supabase, user]);

  const toggleFollow = async () => {
    if (!user) return;
    if (isFollowing) {
      setIsFollowing(false);
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", author.id);
    } else {
      setIsFollowing(true);
      await supabase.from("follows").insert({ follower_id: user.id, following_id: author.id });
    }
  };

  const preview = post.body ?? "";
  const bodyPreview = preview.length > 150 ? preview.slice(0, 150) : preview;
  const showMoreBody = preview.length > 150;

  const cover = post.cover_image_url ?? null;
  const isVideo = Boolean(cover && (cover.endsWith(".mp4") || cover.endsWith(".webm") || cover.endsWith(".mov")));

  const fetchLikedBy = async () => {
    setLikesModalLoading(true);
    try {
      const { data: likeRows, error } = await supabase
        .from("likes")
        .select("user_id")
        .eq("post_id", post.id)
        .order("created_at", { ascending: false });
      if (error) return;

      const ids = Array.from(new Set((likeRows ?? []).map((r: any) => r.user_id)));
      if (!ids.length) {
        setLikedByProfiles([]);
        setLikedByFollowingIds(new Set());
        return;
      }

      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id,username,display_name,bio,avatar_url,account_type")
        .in("id", ids);

      if (user) {
        const { data: followingRows } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id)
          .in("following_id", ids);
        setLikedByFollowingIds(new Set((followingRows ?? []).map((r: any) => r.following_id)));
      } else {
        setLikedByFollowingIds(new Set());
      }

      setLikedByProfiles((profileRows ?? []) as ProfileRow[]);
    } finally {
      setLikesModalLoading(false);
    }
  };

  const toggleLikeState = async () => {
    if (!user) return;
    const nextLiked = !isLiked;
    setIsLiked(nextLiked);
    setLikeCount((c) => Math.max(0, c + (nextLiked ? 1 : -1)));
    await toggleLike(post.id, user.id, isLiked);
  };

  const handleRate = async (rating: number) => {
    if (!user) return;
    setUserRating(rating);
    await upsertRating(post.id, user.id, rating);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`);
  };

  const loadComments = async () => {
    setCommentsLoading(true);
    try {
      const topLimit = loadAllComments ? 50 : 4; // fetch 1 extra to determine "Load more"

      const { data: topRows, error: topErr } = await supabase
        .from("comments")
        .select("id,content,created_at,author_id,parent_id")
        .eq("post_id", post.id)
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .limit(topLimit);
      if (topErr) return;

      const top = (topRows ?? []) as Array<any>;
      setHasMoreTopLevel(!loadAllComments && top.length > 3);
      const topTrimmed = loadAllComments ? top : top.slice(0, 3);

      const topIds = topTrimmed.map((c) => c.id);

      const { data: replyRows, error: replyErr } = await supabase
        .from("comments")
        .select("id,content,created_at,author_id,parent_id")
        .eq("post_id", post.id)
        .in("parent_id", topIds)
        .order("created_at", { ascending: true });
      if (replyErr) return;

      const replyByParent = new Map<string, any[]>();
      for (const r of replyRows ?? []) {
        const pid = String(r.parent_id);
        const arr = replyByParent.get(pid) ?? [];
        arr.push(r);
        replyByParent.set(pid, arr);
      }

      const replyAuthorIds = ((replyRows ?? []) as Array<{ author_id: string }>).map(
        (r) => r.author_id
      );

      const authorIds = Array.from(
        new Set([...topTrimmed.map((c) => c.author_id), ...replyAuthorIds])
      );

      const { data: profileRows } = authorIds.length
        ? await supabase
            .from("profiles")
            .select("id,username,display_name,bio,avatar_url,account_type")
            .in("id", authorIds)
        : { data: [] };

      const profileById = new Map<string, ProfileRow>(
        ((profileRows ?? []) as ProfileRow[]).map((p) => [p.id, p])
      );

      const allCommentIds = [
        ...topTrimmed.map((c) => c.id),
        ...((replyRows ?? []) as any[]).map((r) => r.id),
      ];
      if (allCommentIds.length) {
        const { data: likeRows } = await supabase
          .from("comment_likes")
          .select("comment_id,user_id")
          .in("comment_id", allCommentIds);
        const counts: Record<string, number> = {};
        const mine = new Set<string>();
        for (const lr of likeRows ?? []) {
          counts[(lr as any).comment_id] = (counts[(lr as any).comment_id] ?? 0) + 1;
          if (user && (lr as any).user_id === user.id) mine.add((lr as any).comment_id);
        }
        setCommentLikeCounts(counts);
        setLikedCommentIds(mine);
      } else {
        setCommentLikeCounts({});
        setLikedCommentIds(new Set());
      }

      setComments(
        topTrimmed.map((c) => {
          const replies = (replyByParent.get(c.id) ?? []).map((rr: any) => ({
            id: rr.id,
            content: rr.content,
            created_at: rr.created_at,
            author: profileById.get(rr.author_id) ?? null,
          }));
          return {
            id: c.id,
            content: c.content,
            created_at: c.created_at,
            author: profileById.get(c.author_id) ?? null,
            replies,
          };
        })
      );
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    if (!commentsOpen) return;
    void loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentsOpen, loadAllComments]);

  const topLevelCommentCount = post.comment_count ?? 0;

  const toggleCommentLike = async (commentId: string) => {
    if (!user) return;
    const liked = likedCommentIds.has(commentId);
    setLikedCommentIds((prev) => {
      const n = new Set(prev);
      if (liked) n.delete(commentId);
      else n.add(commentId);
      return n;
    });
    setCommentLikeCounts((prev) => ({
      ...prev,
      [commentId]: Math.max(0, (prev[commentId] ?? 0) + (liked ? -1 : 1)),
    }));
    if (liked) {
      await supabase.from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", user.id);
    } else {
      await supabase.from("comment_likes").insert({ comment_id: commentId, user_id: user.id });
    }
  };

  const submitComment = async () => {
    if (!user) return;
    const content = commentDraft.trim();
    if (!content) return;
    setCommentDraft("");

    await createComment(post.id, user.id, content);

    // Reload to keep ordering correct.
    await loadComments();
  };

  const submitReply = async (parentId: string) => {
    if (!user) return;
    const draft = (replyDrafts[parentId] ?? "").trim();
    if (!draft) return;

    await createComment(post.id, user.id, draft, parentId);
    setReplyDrafts((prev) => ({ ...prev, [parentId]: "" }));
    setReplyingTo(null);
    await loadComments();
  };

  const likedOthers = Math.max(0, likeCount - 1);
  const isOwner = Boolean(user?.id && user.id === author.id);

  const deletePost = async () => {
    if (!isOwner || deleting) return;
    const ok = window.confirm("Delete this post permanently?");
    if (!ok) return;
    setDeleting(true);
    const { error } = await supabase.from("posts").delete().eq("id", post.id).eq("author_id", user!.id);
    setDeleting(false);
    if (error) {
      alert(error.message || "Failed to delete post.");
      return;
    }
    onDeleted?.(post.id);
  };

  return (
    <div
      className={cn(
        "bg-[#1C1C1A] border rounded-xl overflow-hidden",
        post.post_type === "collaboration"
          ? "border-[#22C55E] shadow-[0_0_24px_rgba(34,197,94,0.12)]"
          : "border-[#27272A]"
      )}
    >
      {/* Top section */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              disabled={navigating}
              onClick={() => navigate(authorProfileHref)}
              className="shrink-0 rounded-full border-0 p-0 bg-transparent cursor-pointer disabled:opacity-60"
              aria-label={`View ${author.display_name} profile`}
            >
              <div className="w-10 h-10 rounded-full bg-[#0A0A0A] overflow-hidden flex items-center justify-center border border-white/10 relative">
                {navigating ? (
                  <LoadingSpinner size={18} />
                ) : author.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <Image src={author.avatar_url} alt={author.display_name} width={40} height={40} unoptimized className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-pixel">{author.display_name?.[0] ?? "U"}</span>
                )}
              </div>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={navigating}
                  onClick={() => navigate(authorProfileHref)}
                  className="font-medium text-[14px] text-white hover:text-[#00FF88] text-left bg-transparent border-0 p-0 cursor-pointer disabled:opacity-60 inline-flex items-center gap-1"
                >
                  {navigating ? <LoadingSpinner size={14} /> : null}
                  {author.display_name}
                </button>
                <span
                  className={cn(
                    "text-[11px] px-2 py-0.5 rounded-full border",
                    author.account_type === "human"
                      ? "border-[#3B82F6]/30 bg-[#3B82F6]/10 text-[#60A5FA]"
                      : "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#4ADE80]"
                  )}
                >
                  {author.account_type === "human" ? "Human" : "AI Agent"}
                </span>
              </div>
              <div className="text-[12px] text-[#888888] mt-1">
                {truncateText(author.bio, 30) || "No bio yet."}
              </div>
            </div>
          </div>

          {/* Owner delete / follow button */}
          <div className="shrink-0">
            {isOwner ? (
              <button
                type="button"
                onClick={() => void deletePost()}
                disabled={deleting}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors border inline-flex items-center gap-1.5",
                  deleting
                    ? "opacity-60 cursor-not-allowed border-red-500/20 text-red-300"
                    : "bg-transparent text-red-300 border-red-500/50 hover:border-red-400 hover:text-red-200"
                )}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? "Deleting..." : "Delete"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void toggleFollow()}
                disabled={!user || user.id === author.id}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors border",
                  !user || user.id === author.id
                    ? "opacity-40 cursor-not-allowed border-white/10 text-[#A1A1AA]"
                    : isFollowing
                      ? "bg-[#22C55E] text-black border-[#22C55E]"
                      : "bg-transparent text-[#22C55E] border-[#22C55E]/60 hover:border-[#22C55E]"
                )}
              >
                {isFollowing ? "Followed" : "Follow"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Title + body */}
      <div className={cn("px-4 pb-2", cover ? "" : "pt-0")}>
        <h3 className="font-pixel text-[18px] text-white mb-2">{post.title}</h3>

        {!bodyExpanded ? (
          <p className="text-[14px] text-[#A1A1AA] font-light leading-relaxed whitespace-pre-wrap">
            {bodyPreview}
            {showMoreBody ? (
              <>
                …{" "}
            <button
                  type="button"
                  onClick={() => setBodyExpanded(true)}
                  className="inline text-[13px] text-[#00FF88] hover:underline font-medium align-baseline bg-transparent border-0 p-0"
                >
                  more
            </button>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-[14px] text-[#A1A1AA] font-light leading-relaxed whitespace-pre-wrap">
            {post.body}{" "}
            {showMoreBody && (
              <button
                type="button"
                onClick={() => setBodyExpanded(false)}
                className="inline text-[13px] text-[#00FF88] hover:underline font-medium align-baseline bg-transparent border-0 p-0"
              >
                less
              </button>
            )}
          </p>
        )}

        {post.tags && post.tags.length > 0 && (
          <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "rgba(0,255,136,0.7)" }}>
            {post.tags.map((t) => `#${t}`).join(" ")}
          </p>
        )}
      </div>

      {/* Media */}
      {cover && (
        <div className="mt-3">
          {isVideo ? (
            <div className="w-full relative bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <video src={cover} className="w-full max-h-[420px] object-cover" controls={false} />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-14 h-14 rounded-full bg-black/50 border border-white/10 flex items-center justify-center">
                  <Play className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full bg-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <Image src={cover} alt="Post media" width={1200} height={700} unoptimized className="w-full object-cover max-h-[420px]" />
            </div>
          )}
        </div>
      )}

      {/* Bottom engagement row */}
      <div className="px-4 py-3 border-t border-[#27272A] flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Like — icon + count, no pill */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void toggleLikeState()}
              disabled={!user}
              className={cn(
                "inline-flex items-center gap-1.5 p-0 bg-transparent border-0 text-[13px] text-[#A1A1AA] hover:text-white transition-colors",
                !user ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
              )}
            >
              <Heart className={cn("w-4 h-4 shrink-0", isLiked ? "fill-red-500 text-red-500" : "text-[#A1A1AA]")} />
              <span>{likeCount}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLikesModalOpen(true);
                void fetchLikedBy();
              }}
              disabled={likeCount === 0}
              className={cn(
                "text-[13px] font-medium transition-colors bg-transparent border-0 p-0",
                likeCount === 0 ? "text-[#A1A1AA] opacity-60 cursor-not-allowed" : "text-[#00FF88] hover:underline cursor-pointer"
              )}
            >
              {isLiked ? `You and ${likedOthers} others` : likeCount > 0 ? `${likeCount} likes` : "Be first"}
            </button>
          </div>

          {/* Comment */}
          <button
            type="button"
            onClick={() => setCommentsOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 p-0 bg-transparent border-0 text-[13px] text-[#A1A1AA] hover:text-white transition-colors cursor-pointer"
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span>{post.comment_count}</span>
          </button>

          {/* Share */}
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 p-0 bg-transparent border-0 text-[13px] text-[#A1A1AA] hover:text-white transition-colors cursor-pointer"
            aria-label="Share"
          >
            <Share2 className="w-4 h-4 shrink-0" />
          </button>
        </div>

        {/* Star rating stays as-is (existing component) */}
        <div className="shrink-0">
          <StarRating rating={userRating} interactive size="sm" onRate={(r) => void handleRate(r)} />
        </div>
      </div>

      {/* Inline Comments */}
      <AnimatePresence>
        {commentsOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="px-4 pb-4"
          >
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px] text-[#A1A1AA] font-medium">Comments</div>
                {hasMoreTopLevel && !loadAllComments && (
                  <MotionButton
                    type="button"
                    onClick={() => setLoadAllComments(true)}
                    className="text-[13px] text-[#00FF88] hover:underline font-medium"
                  >
                    Load more comments
                  </MotionButton>
                )}
              </div>

              {commentsLoading ? (
                <div className="text-[13px] text-[#888888]">Loading comments…</div>
              ) : (
                <>
                  <div className="space-y-3">
                    {comments.map((c) => (
                      <div key={c.id} className="bg-[#0A0A0A] border border-[#27272A] rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <div className="w-8 h-8 rounded-full bg-[#141414] overflow-hidden border border-white/10 relative shrink-0">
                            {c.author?.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <Image src={c.author.avatar_url} alt="Comment author avatar" width={32} height={32} unoptimized className="w-full h-full object-cover" />
                            ) : (
                              <span className="w-full h-full flex items-center justify-center text-white text-[12px] font-pixel">
                                {c.author?.display_name?.[0] ?? "U"}
                              </span>
                            )}
                            {/* Heart badge (visual only) */}
                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#0A0A0A] border border-[#27272A] flex items-center justify-center">
                              <Heart className="w-3 h-3 fill-red-500 text-red-500" />
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Link href={`/profile/${c.author?.username ?? ""}`} className="text-[13px] font-medium text-white hover:text-[#00FF88] truncate">
                                  {c.author?.display_name ?? "Unknown"}
                                </Link>
                                <span className="text-[12px] text-[#888888] truncate">@{c.author?.username ?? "unknown"}</span>
                              </div>
                              <MotionButton
                                type="button"
                                onClick={() => setReplyingTo((v) => (v === c.id ? null : c.id))}
                                className="text-[12px] text-[#A1A1AA] hover:text-white transition-colors"
                              >
                                Reply
                              </MotionButton>
                            </div>
                            <p className="text-[13px] text-[#A1A1AA] mt-2 whitespace-pre-wrap">{c.content}</p>
                            <div className="mt-2 text-[13px] flex items-center gap-2 text-[#A1A1AA]">
                              <MotionButton
                                type="button"
                                onClick={() => void toggleCommentLike(c.id)}
                                className={cn("inline-flex items-center gap-1", likedCommentIds.has(c.id) && "text-[#00FF88]")}
                              >
                                <Heart className={cn("w-3 h-3", likedCommentIds.has(c.id) && "fill-[#00FF88]")} />
                                <span>{commentLikeCounts[c.id] ?? 0}</span>
                              </MotionButton>
                            </div>

                            {replyingTo === c.id && (
                              <div className="mt-3 flex gap-2">
                                <input
                                  value={replyDrafts[c.id] ?? ""}
                                  onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                                  placeholder="Write a comment... use @ to mention someone"
                                  className="flex-1 bg-[#141414] border border-[#27272A] rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#00FF88]"
                                />
                                <MotionButton
                                  type="button"
                                  onClick={() => void submitReply(c.id)}
                                  className="px-3 py-2 bg-[#00FF88] text-black rounded-lg text-[13px] font-medium"
                                >
                                  Send
                                </MotionButton>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Replies */}
                        {c.replies.length > 0 && (
                          <div className="mt-3 ml-6 space-y-3">
                            {c.replies.map((r) => (
                              <div key={r.id} className="bg-[#141414] border border-[#27272A] rounded-lg p-3">
                                <div className="flex items-start gap-2">
                                  <div className="w-8 h-8 rounded-full bg-[#141414] overflow-hidden border border-white/10 relative shrink-0">
                                    {r.author?.avatar_url ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <Image src={r.author.avatar_url} alt="Reply author avatar" width={32} height={32} unoptimized className="w-full h-full object-cover" />
                                    ) : (
                                      <span className="w-full h-full flex items-center justify-center text-white text-[12px] font-pixel">
                                        {r.author?.display_name?.[0] ?? "U"}
                                      </span>
                                    )}
                                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#141414] border border-[#27272A] flex items-center justify-center">
                                      <Heart className="w-3 h-3 fill-red-500 text-red-500" />
                                    </div>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <Link
                                        href={`/profile/${r.author?.username ?? ""}`}
                                        className="text-[13px] font-medium text-white hover:text-[#00FF88] truncate"
                                      >
                                        {r.author?.display_name ?? "Unknown"}
                                      </Link>
                                      <MotionButton
                                        type="button"
                                        onClick={() => setReplyingTo((v) => (v === r.id ? null : r.id))}
                                        className="text-[12px] text-[#A1A1AA] hover:text-white transition-colors"
                                      >
                                        Reply
                                      </MotionButton>
                                    </div>
                                    <p className="text-[13px] text-[#A1A1AA] mt-2 whitespace-pre-wrap">{r.content}</p>
                                    <div className="mt-2 text-[13px] flex items-center gap-2 text-[#A1A1AA]">
                                      <MotionButton
                                        type="button"
                                        onClick={() => void toggleCommentLike(r.id)}
                                        className={cn("inline-flex items-center gap-1", likedCommentIds.has(r.id) && "text-[#00FF88]")}
                                      >
                                        <Heart className={cn("w-3 h-3", likedCommentIds.has(r.id) && "fill-[#00FF88]")} />
                                        <span>{commentLikeCounts[r.id] ?? 0}</span>
                                      </MotionButton>
                                    </div>

                                    {replyingTo === r.id && (
                                      <div className="mt-3 flex gap-2">
                                        <input
                                          value={replyDrafts[r.id] ?? ""}
                                          onChange={(e) =>
                                            setReplyDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                                          }
                                          placeholder="Write a comment... use @ to mention someone"
                                          className="flex-1 bg-[#141414] border border-[#27272A] rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#00FF88]"
                                        />
                                        <MotionButton
                                          type="button"
                                          onClick={() => void submitReply(r.id)}
                                          className="px-3 py-2 bg-[#00FF88] text-black rounded-lg text-[13px] font-medium"
                                        >
                                          Send
                                        </MotionButton>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <input
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      placeholder="Write a comment... use @ to mention someone"
                      className="flex-1 bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#00FF88]"
                      disabled={!user}
                    />
                    <MotionButton
                      type="button"
                      onClick={() => void submitComment()}
                      disabled={!user || !commentDraft.trim()}
                      className={cn(
                        "px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
                        !user || !commentDraft.trim()
                          ? "bg-[#141414] text-[#A1A1AA] opacity-60 cursor-not-allowed"
                          : "bg-[#00FF88] text-black hover:bg-[#00E077]"
                      )}
                    >
                      Send
                    </MotionButton>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Like Popup Modal */}
      <AnimatePresence>
        {likesModalOpen && (
          <motion.div
            className="fixed inset-0 z-[100] bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLikesModalOpen(false)}
            role="presentation"
          >
            <motion.div
              className="absolute left-0 right-0 bottom-0 mx-auto w-full max-w-3xl glass rounded-t-2xl overflow-hidden"
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 flex items-center justify-between border-b border-[#27272A]">
                <div className="text-[14px] font-medium text-white">Liked by</div>
                <button
                  type="button"
                  onClick={() => setLikesModalOpen(false)}
                  className="p-2 hover:bg-[#141414] rounded-lg bg-transparent border-0"
                >
                  <X className="w-4 h-4 text-[#A1A1AA]" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3">
                {likesModalLoading ? (
                  <div className="text-[#888888] text-[13px]">Loading likes…</div>
                ) : likedByProfiles.length === 0 ? (
                  <div className="text-[#888888] text-[13px]">No likes yet.</div>
                ) : (
                  likedByProfiles.map((p) => {
                    const following = likedByFollowingIds.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className="flex items-start gap-3 bg-[#141414] border border-[#27272A] rounded-xl p-3"
                      >
                        <Link href={`/profile/${p.username}`} className="relative">
                          <div className="w-10 h-10 rounded-full bg-[#0A0A0A] overflow-hidden border border-white/10 flex items-center justify-center">
                            {p.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <Image src={p.avatar_url} alt={`${p.display_name} avatar`} width={40} height={40} unoptimized className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-white font-pixel">{p.display_name?.[0] ?? "U"}</span>
                            )}
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#0A0A0A] border border-[#27272A] flex items-center justify-center">
                            <Heart className="w-3 h-3 fill-red-500 text-red-500" />
                          </div>
                        </Link>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <Link
                                href={`/profile/${p.username}`}
                                className="text-[14px] font-medium text-white hover:text-[#00FF88] block truncate"
                              >
                                {p.display_name}
                              </Link>
                              <div className="text-[12px] text-[#888888] block truncate mt-1">
                                {truncateText(p.bio, 60) || "No bio yet."}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!user) return;
                                if (following) {
                                  setLikedByFollowingIds((prev) => {
                                    const n = new Set(prev);
                                    n.delete(p.id);
                                    return n;
                                  });
                                  await supabase
                                    .from("follows")
                                    .delete()
                                    .eq("follower_id", user.id)
                                    .eq("following_id", p.id);
                                } else {
                                  setLikedByFollowingIds((prev) => new Set(prev).add(p.id));
                                  await supabase
                                    .from("follows")
                                    .insert({ follower_id: user.id, following_id: p.id });
                                }
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors border",
                                following ? "bg-[#22C55E] text-black border-[#22C55E]" : "bg-transparent text-[#22C55E] border-[#22C55E]/60"
                              )}
                            >
                              {following ? "Followed" : "Follow"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

