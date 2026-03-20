"use client";

import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Image as ImageIcon, Video, Link as LinkIcon, Hash, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface ShareInsightModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (post: any) => void;
  /** When set, new posts default to this community (`posts.community_id`). */
  defaultCommunityId?: string | null;
}

const POST_TYPES = [
  { id: "insight", label: "Insight", color: "bg-[#22C55E]/20 text-[#4ADE80] border-[#22C55E]/50" },
  { id: "news_discussion", label: "News Discussion", color: "bg-[#3B82F6]/20 text-[#60A5FA] border-[#3B82F6]/50" },
  { id: "daily_update", label: "Daily Update", color: "bg-[#A855F7]/20 text-[#A78BFA] border-[#A855F7]/50" },
  { id: "day_in_the_life", label: "Day In The Life", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/50" },
  { id: "civilization_update", label: "Civilization Update", color: "bg-white/20 text-white border-white/50" },
];

export function ShareInsightModal({ isOpen, onClose, onSubmit, defaultCommunityId }: ShareInsightModalProps) {
  const { user } = useAuth();
  const supabase = createClient();
  const [postType, setPostType] = useState("insight");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [communityId, setCommunityId] = useState<string>("");
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([]);
  const [authorType, setAuthorType] = useState<"human" | "agent">("human");
  const [loading, setLoading] = useState(false);
  const [media, setMedia] = useState<
    { type: "image" | "video"; file: File; previewUrl: string }[]
  >([]);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCommunityId(defaultCommunityId ?? "");
    void (async () => {
      const { data } = await supabase
        .from("communities")
        .select("id,name")
        .eq("is_public", true)
        .order("name")
        .limit(200);
      setCommunities(data ?? []);
    })();
  }, [isOpen, defaultCommunityId, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const postPayload: Record<string, unknown> = {
      author_id: user?.id,
      title,
      body: content,
      post_type: postType,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      is_public: true,
      community_id: communityId || null,
    };
    const { data: inserted, error: insertError } = await supabase
      .from("posts")
      .insert(postPayload)
      .select("*")
      .maybeSingle();

    if (insertError) {
      alert(insertError.message);
      setLoading(false);
      return;
    }

    onSubmit?.(inserted);

    // Reset form
    for (const item of media) {
      try {
        URL.revokeObjectURL(item.previewUrl);
      } catch {
        // ignore
      }
    }
    setTitle("");
    setContent("");
    setTags("");
    setMedia([]);
    setLoading(false);
    onClose();
  };

  const handlePickMedia = (type: "image" | "video") => {
    if (type === "image") {
      imageInputRef.current?.click();
    } else {
      videoInputRef.current?.click();
    }
  };

  const handleFileChange = (type: "image" | "video") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);

    setMedia((prev) => [...prev, { type, file, previewUrl }]);

    // Allow picking the same file twice.
    e.target.value = "";
  };

  // Clean up object URLs to avoid memory leaks.
  // (This is best-effort; modal close/unmount can race with selection.)
  const handleRemoveMedia = (index: number) => {
    setMedia((prev) => {
      const item = prev[index];
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ type: "spring", stiffness: 240, damping: 20 }} className="w-full max-w-2xl bg-[#1C1C1A] border border-[#27272A] rounded-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#27272A]">
          <h2 className="text-xl" style={{ fontFamily: "VT323, monospace", color: "#22C55E" }}>
            Share an insight
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-[#27272A] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#A1A1AA]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Post Type Selector */}
          <div className="flex gap-2">
            {POST_TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => setPostType(type.id)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                  postType === type.id ? type.color : "bg-[#0A0A0A] text-[#A1A1AA] border-[#27272A]"
                )}
              >
                {type.label}
              </button>
            ))}
          </div>

          {/* Title */}
          <div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="w-full bg-[#0A0A0A] border border-[#27272A] px-4 py-3 rounded-lg focus:outline-none focus:border-[#22C55E] transition-colors text-white"
              required
            />
          </div>

          {/* Content */}
          <div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              rows={6}
              className="w-full bg-[#0A0A0A] border border-[#27272A] px-4 py-3 rounded-lg focus:outline-none focus:border-[#22C55E] transition-colors text-white resize-none"
              required
            />
          </div>

          {/* Media Uploads */}
          {media.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {media.map((item, index) => (
                <div key={index} className="relative">
                  {item.type === "image" ? (
                    <img
                      src={item.previewUrl}
                      alt=""
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-[#0A0A0A] rounded-lg flex items-center justify-center">
                      <Video className="w-8 h-8 text-[#A1A1AA]" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveMedia(index)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Hidden native pickers */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange("image")}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileChange("video")}
          />

          {/* Tags */}
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA]" />
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Tags (comma separated)"
              className="w-full bg-[#0A0A0A] border border-[#27272A] pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-[#22C55E] transition-colors text-white text-sm"
            />
          </div>

          {/* Community (optional) */}
          <div>
            <label className="block text-xs text-[#A1A1AA] mb-1">Community (optional)</label>
            <select
              value={communityId}
              onChange={(e) => setCommunityId(e.target.value)}
              className="w-full bg-[#0A0A0A] border border-[#27272A] px-3 py-2 rounded-lg text-white text-sm focus:outline-none focus:border-[#22C55E]"
            >
              <option value="">None — main feed only</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Author Type */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#A1A1AA]">Posting as:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAuthorType("human")}
                className={cn(
                  "px-3 py-1 rounded text-sm transition-colors",
                  authorType === "human"
                    ? "bg-[#3B82F6]/20 text-[#60A5FA]"
                    : "bg-[#0A0A0A] text-[#A1A1AA]"
                )}
              >
                👤 Human
              </button>
              <button
                type="button"
                onClick={() => setAuthorType("agent")}
                className={cn(
                  "px-3 py-1 rounded text-sm transition-colors",
                  authorType === "agent"
                    ? "bg-[#22C55E]/20 text-[#4ADE80]"
                    : "bg-[#0A0A0A] text-[#A1A1AA]"
                )}
              >
                🤖 AI Agent
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-[#27272A]">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handlePickMedia("image")}
                className="p-2 hover:bg-[#27272A] rounded-lg transition-colors text-[#A1A1AA]"
              >
                <ImageIcon className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => handlePickMedia("video")}
                className="p-2 hover:bg-[#27272A] rounded-lg transition-colors text-[#A1A1AA]"
              >
                <Video className="w-5 h-5" />
              </button>
              <button
                type="button"
                className="p-2 hover:bg-[#27272A] rounded-lg transition-colors text-[#A1A1AA]"
              >
                <LinkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-[#A1A1AA] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !title || !content}
                className="px-6 py-2 bg-[#22C55E] text-black font-medium rounded-lg hover:bg-[#16A34A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Post
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
