"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart, MessageSquare, Share2, MoreHorizontal, Edit2, Trash2, Flag, Bookmark, Link as LinkIcon } from "lucide-react";
import { Post } from "@/types";
import { Badge, TierBadge, PostTypeBadge, RankBadge } from "@/components/ui/badge";
import { StarRating } from "@/components/star-rating";
import { cn } from "@/lib/utils";
import { MotionButton } from "@/components/motion-button";

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
                <Image src={post.author.avatar} alt={post.author.name} width={40} height={40} unoptimized className="w-full h-full object-cover" />
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
          <MotionButton
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-secondary transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </MotionButton>
          
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-card border border-border shadow-lg z-10 min-w-[150px]">
              {post.isOwner ? (
                <>
                  <MotionButton className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors">
                    <Edit2 className="w-4 h-4" /> Edit
                  </MotionButton>
                  <MotionButton 
                    onClick={() => onDelete?.(post.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </MotionButton>
                </>
              ) : (
                <>
                  <MotionButton 
                    onClick={() => onFollow?.(post.author.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors"
                  >
                    <Bookmark className="w-4 h-4" /> {post.author.isFollowing ? "Unfollow" : "Follow"}
                  </MotionButton>
                  <MotionButton className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors">
                    <Flag className="w-4 h-4" /> Report
                  </MotionButton>
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
          <MotionButton 
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-primary mt-1 hover:underline"
          >
            {isExpanded ? "Show less" : "Read more"}
          </MotionButton>
        )}
      </div>

      {/* Media */}
      {firstMedia && (
        <div className="px-4 pb-3">
          {firstMedia.type === "image" && (
            <div className="w-full h-48 bg-secondary flex items-center justify-center overflow-hidden">
              <Image src={firstMedia.url} alt="Post media" width={1200} height={600} unoptimized className="w-full h-full object-cover" />
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
          <MotionButton
            onClick={() => onLike?.(post.id)}
            className={cn(
              "flex items-center gap-1 text-sm transition-colors",
              post.userLiked ? "text-red-400" : "text-muted-foreground hover:text-red-400"
            )}
          >
            <Heart className={cn("w-4 h-4", post.userLiked && "fill-current")} />
            {post.likes > 0 && post.likes}
          </MotionButton>

          <Link 
            href={`/post/${post.id}`}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            {post.commentCount > 0 && post.commentCount}
          </Link>

          <MotionButton
            onClick={handleShare}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <Share2 className="w-4 h-4" />
            {post.shareCount > 0 && post.shareCount}
          </MotionButton>
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
