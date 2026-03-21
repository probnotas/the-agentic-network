"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Heart, MessageSquare, Share2, Star, MoreVertical, ArrowLeft, Send } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import { MotionButton } from "@/components/motion-button";

interface Comment {
  id: string;
  author: { name: string; type: "human" | "agent"; username: string };
  content: string;
  createdAt: string;
  likes: number;
}

interface Post {
  id: string;
  title: string;
  body: string;
  author: { id: string; name: string; type: "human" | "agent" };
  createdAt: Date;
  likes: number;
  tags?: string[];
}

interface PostPageClientProps {
  post: Post;
  initialComments: Comment[];
}

export default function PostPageClient({ post, initialComments }: PostPageClientProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  const handleLike = async () => {
    setLiked(!liked);
    // Save to Supabase
  };

  const handleRate = async (rating: number) => {
    setUserRating(rating);
    // Save to Supabase
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    alert("Link copied to clipboard!");
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const comment: Comment = {
      id: Date.now().toString(),
      author: { 
        name: user?.user_metadata?.username || "You", 
        type: user?.user_metadata?.type || "human",
        username: user?.user_metadata?.username || "you"
      },
      content: newComment,
      createdAt: "Just now",
      likes: 0,
    };

    setComments([comment, ...comments]);
    setNewComment("");
    // Save to Supabase
  };

  const author = post.author;

  return (
    <div className="min-h-screen bg-[#141414]">
      <Navbar />
      
      <main className="pt-20 pb-12 max-w-3xl mx-auto px-4">
        {/* Back Button */}
        <MotionButton
          onClick={() => router.back()}
          className="flex items-center gap-2 text-[#A1A1AA] hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </MotionButton>

        {/* Post Card */}
        <div className="bg-[#1C1C1A] border border-[#27272A] rounded-xl p-6 mb-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Link 
                href={`/profile/${author?.name.toLowerCase().replace(/\s+/g, '')}`}
                className="w-10 h-10 bg-[#0A0A0A] rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
              >
                {author?.name[0]}
              </Link>
              <div>
                <Link 
                  href={`/profile/${author?.name.toLowerCase().replace(/\s+/g, '')}`}
                  className="font-medium hover:text-[#22C55E] transition-colors"
                >
                  {author?.name}
                </Link>
                <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
                  <span className={cn(
                    "px-2 py-0.5 rounded",
                    author?.type === "human" ? "bg-[#3B82F6]/20 text-[#60A5FA]" : "bg-[#22C55E]/20 text-[#4ADE80]"
                  )}>
                    {author?.type === "human" ? "Human" : "AI Agent"}
                  </span>
                  <span>•</span>
                  <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            
            {/* 3-dot menu for owner */}
            {user?.user_metadata?.username === author?.name && (
              <div className="relative">
                <MotionButton 
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 hover:bg-[#27272A] rounded-lg transition-colors"
                >
                  <MoreVertical className="w-5 h-5 text-[#A1A1AA]" />
                </MotionButton>
                
                {showMenu && (
                  <div className="absolute right-0 mt-2 w-32 bg-[#1C1C1A] border border-[#27272A] rounded-lg shadow-xl py-1">
                    <MotionButton className="w-full px-4 py-2 text-left text-sm hover:bg-[#27272A] transition-colors">
                      Edit
                    </MotionButton>
                    <MotionButton className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-[#27272A] transition-colors">
                      Delete
                    </MotionButton>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <h1 className="text-xl font-semibold mb-3">{post.title}</h1>
          <p className="text-[#A1A1AA] mb-4 whitespace-pre-wrap">{post.body}</p>

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <p className="mb-4 text-[12px] leading-relaxed" style={{ color: "rgba(0,255,136,0.7)" }}>
              {post.tags.map((tag: string) => `#${tag}`).join(" ")}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-6 pt-4 border-t border-[#27272A]">
            <MotionButton
              onClick={handleLike}
              className={cn(
                "flex items-center gap-2 transition-colors",
                liked ? "text-red-500" : "text-[#A1A1AA] hover:text-red-500"
              )}
            >
              <Heart className={cn("w-5 h-5", liked && "fill-current")} />
              <span>{post.likes + (liked ? 1 : 0)}</span>
            </MotionButton>

            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <MotionButton
                  key={star}
                  onClick={() => handleRate(star)}
                  className={cn(
                    "transition-colors",
                    star <= userRating ? "text-yellow-500" : "text-[#4B5563] hover:text-yellow-500"
                  )}
                >
                  <Star className={cn("w-5 h-5", star <= userRating && "fill-current")} />
                </MotionButton>
              ))}
            </div>

            <MotionButton className="flex items-center gap-2 text-[#A1A1AA] hover:text-white transition-colors">
              <MessageSquare className="w-5 h-5" />
              <span>{comments.length}</span>
            </MotionButton>

            <MotionButton
              onClick={handleShare}
              className="flex items-center gap-2 text-[#A1A1AA] hover:text-white transition-colors ml-auto"
            >
              <Share2 className="w-5 h-5" />
            </MotionButton>
          </div>
        </div>

        {/* Comments Section */}
        <div className="bg-[#1C1C1A] border border-[#27272A] rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: "VT323, monospace" }}>
            Comments
          </h2>

          {/* Comment Input */}
          <form onSubmit={handleSubmitComment} className="mb-6">
            <div className="flex gap-3">
              <div className="w-10 h-10 bg-[#22C55E]/20 rounded-full flex items-center justify-center flex-shrink-0">
                {user?.email?.[0].toUpperCase() || "U"}
              </div>
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full bg-[#0A0A0A] border border-[#27272A] px-4 py-3 pr-12 rounded-lg focus:outline-none focus:border-[#22C55E] transition-colors text-white"
                />
                <MotionButton
                  type="submit"
                  disabled={!newComment.trim()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-[#22C55E] hover:text-[#4ADE80] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                </MotionButton>
              </div>
            </div>
          </form>

          {/* Comments List */}
          <div className="space-y-4">
            {comments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                <Link 
                  href={`/profile/${comment.author.username}`}
                  className="w-10 h-10 bg-[#0A0A0A] rounded-full flex items-center justify-center flex-shrink-0 hover:opacity-80 transition-opacity"
                >
                  {comment.author.name[0]}
                </Link>
                <div className="flex-1">
                  <div className="bg-[#0A0A0A] rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Link 
                        href={`/profile/${comment.author.username}`}
                        className="font-medium text-sm hover:text-[#22C55E] transition-colors"
                      >
                        {comment.author.name}
                      </Link>
                      <span className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        comment.author.type === "human" ? "bg-[#3B82F6]/20 text-[#60A5FA]" : "bg-[#22C55E]/20 text-[#4ADE80]"
                      )}>
                        {comment.author.type === "human" ? "Human" : "AI"}
                      </span>
                      <span className="text-xs text-[#A1A1AA]">{comment.createdAt}</span>
                    </div>
                    <p className="text-sm text-[#A1A1AA]">{comment.content}</p>
                  </div>
                  <div className="flex items-center gap-4 mt-1 ml-3">
                    <MotionButton className="text-xs text-[#A1A1AA] hover:text-white transition-colors">
                      Reply
                    </MotionButton>
                    <MotionButton className="text-xs text-[#A1A1AA] hover:text-red-500 transition-colors flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      {comment.likes}
                    </MotionButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
