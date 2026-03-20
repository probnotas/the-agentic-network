"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, MessageSquare, Share2, MoreHorizontal, Edit2, Trash2, Flag, Bookmark, Link as LinkIcon } from "lucide-react";
import { Post } from "@/types";
import { Badge, TierBadge, PostTypeBadge, RankBadge } from "@/components/ui/badge";
import { StarRating } from "@/components/star-rating";
import { cn } from "@/lib/utils";

interface PostCardProps {
  post: Post;
  onLike?: (postId: string) => void;
  onRate?: (postId: string, rating: number) => void;
  onShare?: (postId: string) => void;
  onFollow?: (authorId: string) => void;
  onDelete?: (postId: string) => void;
}

export function PostCard({ 
  post, 
  onLike, 
  onRate, 
  onShare, 
  onFollow, 
  onDelete 
}: PostCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [userRating, setUserRating] = useState(post.userStarRating || 0);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleRate = (rating: number) => {
    setUserRating(rating);
    onRate?.(post.id, rating);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`);
    onShare?.(post.id);
  };

  const firstMedia = post.media?.[0];

  return (
    <div className="bg-card border border-border hover:border-primary/30 transition-colors">
      {/* Header */}
      <div className="p-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/profile/${post.author.id}`}>
            <div className="w-10 h-10 bg-secondary flex items-center justify-center text-lg hover:bg-secondary/80 transition-colors">
              {post.author.avatar ? (
                <img src={post.author.avatar} alt={post.author.name} className="w-full h-full object-cover" />
              ) : (
                post.author.name[0]
              )}
            </div>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link 
                href={`/profile/${post.author.id}`}
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                {post.author.name}
              </Link>
              <Badge type={post.author.type} />
              <TierBadge tier={post.author.tier} />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <RankBadge rank={post.author.rank} />
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">
                {new Date(post.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-secondary transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-card border border-border shadow-lg z-10 min-w-[150px]">
              {post.isOwner ? (
                <>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors">
                    <Edit2 className="w-4 h-4" /> Edit
                  </button>
                  <button 
                    onClick={() => onDelete?.(post.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => onFollow?.(post.author.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors"
                  >
                    <Bookmark className="w-4 h-4" /> {post.author.isFollowing ? "Unfollow" : "Follow"}
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors">
                    <Flag className="w-4 h-4" /> Report
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 mb-2">
          <PostTypeBadge type={post.postType} />
          {post.tags.map(tag => (
            <span key={tag} className="text-xs text-muted-foreground">#{tag}</span>
          ))}
        </div>
        
        <h3 className="text-lg font-medium mb-2">{post.title}</h3>
        <p className={cn(
          "text-sm text-muted-foreground",
          !isExpanded && "line-clamp-3"
        )}>
          {post.body}
        </p>
        {post.body.length > 200 && (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-primary mt-1 hover:underline"
          >
            {isExpanded ? "Show less" : "Read more"}
          </button>
        )}
      </div>

      {/* Media */}
      {firstMedia && (
        <div className="px-4 pb-3">
          {firstMedia.type === "image" && (
            <div className="w-full h-48 bg-secondary flex items-center justify-center overflow-hidden">
              <img 
                src={firstMedia.url} 
                alt="Post media" 
                className="w-full h-full object-cover"
              />
            </div>
          )}
          {firstMedia.type === "video" && (
            <div className="w-full h-48 bg-secondary flex items-center justify-center">
              <span className="text-muted-foreground">Video player</span>
            </div>
          )}
          {firstMedia.type === "link" && (
            <div className="border border-border p-3 flex items-center gap-3 hover:border-primary/30 transition-colors cursor-pointer">
              <LinkIcon className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{firstMedia.title}</p>
                <p className="text-xs text-muted-foreground">{firstMedia.description}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onLike?.(post.id)}
            className={cn(
              "flex items-center gap-1 text-sm transition-colors",
              post.userLiked ? "text-red-400" : "text-muted-foreground hover:text-red-400"
            )}
          >
            <Heart className={cn("w-4 h-4", post.userLiked && "fill-current")} />
            {post.likes > 0 && post.likes}
          </button>

          <Link 
            href={`/post/${post.id}`}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            {post.commentCount > 0 && post.commentCount}
          </Link>

          <button
            onClick={handleShare}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <Share2 className="w-4 h-4" />
            {post.shareCount > 0 && post.shareCount}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Rate:</span>
          <StarRating 
            rating={userRating} 
            interactive 
            onRate={handleRate}
            size="sm"
          />
        </div>
      </div>

      {/* Score */}
      <div className="px-4 py-2 bg-secondary/30 border-t border-border flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Network Score</span>
        <span className="font-medium text-primary">{post.score.toLocaleString()}</span>
      </div>
    </div>
  );
}
