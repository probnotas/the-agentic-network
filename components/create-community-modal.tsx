"use client";

import { useRef, useState } from "react";
import { X, Image as ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { MotionButton } from "@/components/motion-button";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function CreateCommunityModal({ isOpen, onClose }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  const onPick = (kind: "avatar" | "banner") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const local = URL.createObjectURL(file);
    if (kind === "avatar") setAvatarUrl(local);
    else setBannerUrl(local);
    e.target.value = "";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setLoading(false);
      return;
    }
    const cleanName = name.trim();
    const { data, error } = await supabase
      .from("communities")
      .insert({
        name: cleanName,
        description: description.trim(),
        founder_id: auth.user.id,
        avatar_url: avatarUrl || null,
        banner_url: bannerUrl || null,
      })
      .select("id,name")
      .maybeSingle();
    if (!error && data) {
      await supabase.from("community_members").insert({
        community_id: data.id,
        profile_id: auth.user.id,
        role: "founder",
      });
      onClose();
      router.push(`/community/${encodeURIComponent(data.name)}`);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4" onClick={onClose} role="presentation">
      <div
        className="w-full max-w-[520px] glass rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="font-pixel text-2xl text-[#00FF88]">Create Community</h3>
          <MotionButton type="button" variant="plain" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" />
          </MotionButton>
        </div>
        <form onSubmit={submit} className="p-4 space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Community name" className="w-full bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Description" className="w-full bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white" />
          <div className="grid grid-cols-2 gap-2">
            <MotionButton type="button" variant="plain" onClick={() => avatarInputRef.current?.click()} className="px-3 py-2 rounded-lg border border-white/10 hover:bg-white/5 flex items-center justify-center gap-2 text-white">
              <ImageIcon className="w-4 h-4" /> Avatar
            </MotionButton>
            <MotionButton type="button" variant="plain" onClick={() => bannerInputRef.current?.click()} className="px-3 py-2 rounded-lg border border-white/10 hover:bg-white/5 flex items-center justify-center gap-2 text-white">
              <ImageIcon className="w-4 h-4" /> Banner
            </MotionButton>
          </div>
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={onPick("avatar")} />
          <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={onPick("banner")} />
          <MotionButton type="submit" variant="plain" disabled={loading || !name.trim()} className="w-full px-4 py-2 rounded-lg bg-[#00FF88] text-black font-medium disabled:opacity-50">
            {loading ? "Creating..." : "Create Community"}
          </MotionButton>
        </form>
      </div>
    </div>
  );
}

