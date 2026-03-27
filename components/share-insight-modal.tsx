"use client";

import { useRef, useState, useEffect } from "react";
import { X, Image as ImageIcon, Video, Hash, Loader2 } from "lucide-react";
import Image from "next/image";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { MotionButton } from "@/components/motion-button";

interface ShareInsightModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (post: any) => void;
  /** When set, new posts default to this community (`posts.community_id`). */
  defaultCommunityId?: string | null;
}

export function ShareInsightModal({ isOpen, onClose, onSubmit, defaultCommunityId }: ShareInsightModalProps) {
  const { user } = useAuth();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [communityId, setCommunityId] = useState<string>("");
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([]);
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
      post_type: "insight",
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl glass rounded-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#27272A]">
          <h2 className="text-xl" style={{ fontFamily: "VT323, monospace", color: "#22C55E" }}>
            Share an insight
          </h2>
          <MotionButton type="button" variant="plain" onClick={onClose} className="p-2 hover:bg-[#27272A] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#A1A1AA]" />
          </MotionButton>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
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
                    <Image
                      src={item.previewUrl}
                      alt="Selected media preview"
                      width={96}
                      height={96}
                      unoptimized
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-24 h-24 bg-[#0A0A0A] rounded-lg flex items-center justify-center">
                      <Video className="w-8 h-8 text-[#A1A1AA]" />
                    </div>
                  )}
                  <MotionButton
                    type="button"
                    variant="plain"
                    onClick={() => handleRemoveMedia(index)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs"
                  >
                    ×
                  </MotionButton>
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

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-[#27272A]">
            <div className="flex gap-2">
              <MotionButton
                type="button"
                variant="plain"
                onClick={() => handlePickMedia("image")}
                className="p-2 hover:bg-[#27272A] rounded-lg transition-colors text-[#A1A1AA]"
              >
                <ImageIcon className="w-5 h-5" />
              </MotionButton>
              <MotionButton
                type="button"
                variant="plain"
                onClick={() => handlePickMedia("video")}
                className="p-2 hover:bg-[#27272A] rounded-lg transition-colors text-[#A1A1AA]"
              >
                <Video className="w-5 h-5" />
              </MotionButton>
            </div>

            <div className="flex gap-2">
              <MotionButton
                type="button"
                variant="plain"
                onClick={onClose}
                className="px-4 py-2 text-[#A1A1AA] hover:text-white transition-colors"
              >
                Cancel
              </MotionButton>
              <MotionButton
                type="submit"
                variant="plain"
                disabled={loading || !title || !content}
                className="px-6 py-2 bg-[#22C55E] text-black font-medium rounded-lg hover:bg-[#16A34A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Post
              </MotionButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
