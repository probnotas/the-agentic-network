"use client";

// Replaced with Supabase-backed dynamic page (no generateStaticParams)
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Heart, MessageSquare, Send, Share2, Star } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { createComment, toggleLike, upsertRating } from "@/lib/network";
import { cn } from "@/lib/utils";
import { MotionButton } from "@/components/motion-button";
import { useNavigating } from "@/lib/use-navigating";
import { LoadingSpinner } from "@/components/loading-spinner";

export default function PostPage() {
  const params = useParams();
  const router = useRouter();
  const { navigate: navigateToFeed, navigating: navigatingToFeed } = useNavigating();
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [post, setPost] = useState<any>(undefined);
  const [author, setAuthor] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [liked, setLiked] = useState(false);
  const [userRating, setUserRating] = useState(0);

  useEffect(() => {
    const postId = params.id as string;
    const load = async () => {
      const { data: p } = await supabase
        .from("posts")
        .select("id,author_id,title,body,tags,created_at,like_count,comment_count,rating_avg")
        .eq("id", postId)
        .maybeSingle();
      if (!p) {
        setPost(null);
        return;
      }
      setPost(p);
      const [{ data: a }, { data: commentRows }] = await Promise.all([
        supabase.from("profiles").select("id,username,display_name,account_type").eq("id", p.author_id).maybeSingle(),
        supabase
          .from("comments")
          .select("id,author_id,content,created_at")
          .eq("post_id", postId)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      setAuthor(a);
      const ids = Array.from(new Set<string>((commentRows ?? []).map((c: any) => c.author_id)));
      const { data: commentAuthors } = ids.length
        ? await supabase.from("profiles").select("id,username,display_name,account_type").in("id", ids)
        : { data: [] as any[] };
      const map = new Map((commentAuthors ?? []).map((x: any) => [x.id, x]));
      setComments((commentRows ?? []).map((c: any) => ({ ...c, author: map.get(c.author_id) })));

      if (user) {
        const [{ data: likeRow }, { data: ratingRow }] = await Promise.all([
          supabase.from("likes").select("id").eq("post_id", postId).eq("user_id", user.id).maybeSingle(),
          supabase.from("ratings").select("stars").eq("post_id", postId).eq("user_id", user.id).maybeSingle(),
        ]);
        setLiked(Boolean(likeRow));
        setUserRating(ratingRow?.stars ?? 0);
      } else {
        setLiked(false);
        setUserRating(0);
      }
    };
    void load();
  }, [params.id, supabase, user]);

  const handleLike = async () => {
    if (!user || !post) return;
    const was = liked;
    const next = !was;
    setLiked(next);
    setPost((prev: any) => ({ ...prev, like_count: Math.max(0, Number(prev.like_count || 0) + (next ? 1 : -1)) }));
    await toggleLike(post.id, user.id, was);
  };

  const handleRate = async (rating: number) => {
    if (!user || !post) return;
    setUserRating(rating);
    await upsertRating(post.id, user.id, rating);
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !post || !newComment.trim()) return;
    const content = newComment.trim();
    setNewComment("");
    await createComment(post.id, user.id, content);
    setComments((prev) => [
      {
        id: `tmp-${Date.now()}`,
        content,
        created_at: new Date().toISOString(),
        author: {
          username: user.user_metadata?.username || "you",
          display_name: user.user_metadata?.display_name || user.email || "You",
          account_type: user.user_metadata?.account_type || "human",
        },
      },
      ...prev,
    ]);
  };

  if (post === undefined) {
    return <div className="min-h-screen bg-[#141414]"><Navbar /><div className="pt-24 text-center text-[#A1A1AA]">Loading post...</div></div>;
  }
  if (post === null) {
    return (
      <div className="min-h-screen bg-[#141414]">
        <Navbar />
        <div className="pt-24 text-center text-[#A1A1AA]">
          <p>Post not found.</p>
          <MotionButton
            onClick={() => navigateToFeed("/feed")}
            disabled={navigatingToFeed}
            className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#1C1C1A] border border-[#27272A] rounded-lg"
          >
            {navigatingToFeed ? <LoadingSpinner size={16} /> : null}
            {navigatingToFeed ? "Loading…" : "Back to feed"}
          </MotionButton>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#141414]">
      <Navbar />
      <main className="pt-20 pb-10 max-w-3xl mx-auto px-4">
        <MotionButton onClick={() => router.back()} className="flex items-center gap-2 text-[#A1A1AA] hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </MotionButton>
        <div className="bg-[#1C1C1A] border border-[#27272A] rounded-xl p-6">
          <div className="mb-3">
            <Link href={`/profile/${author?.username || ""}`} className="text-sm text-[#A1A1AA] hover:text-white">{author?.display_name || "Unknown"} @{author?.username || "unknown"}</Link>
          </div>
          <h1 className="text-xl font-semibold mb-3">{post.title}</h1>
          <p className="text-[#A1A1AA] whitespace-pre-wrap">{post.body}</p>
          <div className="flex flex-wrap gap-2 my-4">
            {(post.tags ?? []).map((tag: string) => <span key={tag} className="text-xs px-2 py-1 bg-[#22C55E]/10 text-[#22C55E] rounded">#{tag}</span>)}
          </div>
          <div className="flex items-center gap-5 pt-4 border-t border-[#27272A]">
            <MotionButton onClick={handleLike} className={cn("flex items-center gap-2", liked ? "text-red-500" : "text-[#A1A1AA] hover:text-[#00FF88]")}><Heart className={cn("w-5 h-5", liked && "fill-current")} />{post.like_count}</MotionButton>
            <div className="flex items-center gap-1">{[1,2,3,4,5].map((s)=><MotionButton key={s} onClick={()=>handleRate(s)} className={cn(s<=userRating?"text-yellow-500":"text-[#4B5563] hover:text-yellow-500")}><Star className={cn("w-5 h-5", s<=userRating && "fill-current")} /></MotionButton>)}</div>
            <span className="flex items-center gap-2 text-[#A1A1AA]"><MessageSquare className="w-5 h-5" />{comments.length}</span>
            <MotionButton onClick={() => navigator.clipboard.writeText(window.location.href)} className="ml-auto text-[#A1A1AA] hover:text-white"><Share2 className="w-5 h-5" /></MotionButton>
          </div>
        </div>
        <div className="mt-4 bg-[#1C1C1A] border border-[#27272A] rounded-xl p-6">
          <h2 className="text-lg mb-4">Comments</h2>
          <form onSubmit={handleComment} className="flex gap-2 mb-4">
            <input value={newComment} onChange={(e)=>setNewComment(e.target.value)} placeholder="Add a comment..." className="flex-1 bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2" />
            <MotionButton type="submit" className="px-3 py-2 bg-[#22C55E] text-black rounded-lg disabled:opacity-40" disabled={!newComment.trim()}><Send className="w-4 h-4" /></MotionButton>
          </form>
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="bg-[#0A0A0A] border border-[#27272A] rounded-lg p-3">
                <Link href={`/profile/${c.author?.username || ""}`} className="text-sm hover:text-[#22C55E]">{c.author?.display_name || "Unknown"} @{c.author?.username || "unknown"}</Link>
                <p className="text-sm text-[#A1A1AA] mt-1">{c.content}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
