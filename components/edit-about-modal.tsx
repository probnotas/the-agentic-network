"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { MotionButton } from "@/components/motion-button";
import { cn } from "@/lib/utils";

type Props = {
  isOpen: boolean;
  initial: any;
  onClose: () => void;
  onSave: (next: any) => Promise<void>;
};

export function EditAboutModal({ isOpen, initial, onClose, onSave }: Props) {
  const [tab, setTab] = useState<"experience" | "skills" | "awards" | "bio">("experience");
  const [draft, setDraft] = useState<any>(initial);
  const [skillInput, setSkillInput] = useState("");
  const [saving, setSaving] = useState(false);

  const prevOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpen.current) {
      setDraft(initial);
      setSkillInput("");
      setTab("experience");
    }
    prevOpen.current = isOpen;
  }, [isOpen, initial]);

  const bioCount = (draft?.bio ?? "").length;
  const overWarn = bioCount > 140;

  const tabOrder = useMemo(() => ["experience", "skills", "awards", "bio"] as const, []);

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-[9998] bg-black/70 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            className="w-full max-w-3xl glass rounded-2xl overflow-hidden"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-pixel text-2xl text-[#00FF88]">Edit About</h3>
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-[#A1A1AA] hover:text-white bg-transparent border-0"
              >
                Close
              </button>
            </div>
            <div className="p-4">
              <div className="flex flex-wrap gap-6 border-b border-white/10 mb-4">
                {tabOrder.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      "pb-2 text-sm font-medium transition-colors bg-transparent border-0 border-b-2 -mb-px",
                      tab === t
                        ? "text-white border-white"
                        : "text-[#888888] border-transparent hover:text-[#d4d4d8]"
                    )}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {tab === "experience" ? (
                <div className="space-y-3">
                  {(draft.experience ?? []).map((e: any, i: number) => (
                    <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-2 border border-white/10 rounded-xl p-3">
                      <input className="bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white" placeholder="Job Title" value={e.role ?? ""} onChange={(ev) => setDraft((p: any) => ({ ...p, experience: p.experience.map((x: any, ix: number) => ix === i ? { ...x, role: ev.target.value } : x) }))} />
                      <input className="bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white" placeholder="Company" value={e.company ?? ""} onChange={(ev) => setDraft((p: any) => ({ ...p, experience: p.experience.map((x: any, ix: number) => ix === i ? { ...x, company: ev.target.value } : x) }))} />
                      <input type="month" className="bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white" value={e.start ?? ""} onChange={(ev) => setDraft((p: any) => ({ ...p, experience: p.experience.map((x: any, ix: number) => ix === i ? { ...x, start: ev.target.value } : x) }))} />
                      <input type="month" className="bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white" value={e.end ?? ""} onChange={(ev) => setDraft((p: any) => ({ ...p, experience: p.experience.map((x: any, ix: number) => ix === i ? { ...x, end: ev.target.value } : x) }))} />
                      <textarea className="md:col-span-2 bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white" rows={2} placeholder="Description" value={e.description ?? ""} onChange={(ev) => setDraft((p: any) => ({ ...p, experience: p.experience.map((x: any, ix: number) => ix === i ? { ...x, description: ev.target.value } : x) }))} />
                      <div className="md:col-span-2 flex gap-2">
                        <button type="button" className="text-sm text-[#A1A1AA] border border-white/15 rounded-lg px-2 py-1 hover:bg-white/5 bg-transparent" onClick={() => setDraft((p: any) => ({ ...p, experience: p.experience.filter((_: any, ix: number) => ix !== i) }))}>Remove</button>
                        <button type="button" className="text-sm text-[#A1A1AA] border border-white/15 rounded-lg px-2 py-1 hover:bg-white/5 bg-transparent" onClick={() => i > 0 && setDraft((p: any) => { const a = [...p.experience]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return { ...p, experience: a }; })}>Up</button>
                        <button type="button" className="text-sm text-[#A1A1AA] border border-white/15 rounded-lg px-2 py-1 hover:bg-white/5 bg-transparent" onClick={() => setDraft((p: any) => { const a = [...p.experience]; if (i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]]; return { ...p, experience: a }; })}>Down</button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDraft((p: any) => ({ ...p, experience: [...(p.experience ?? []), { role: "", company: "", start: "", end: "", description: "" }] }))}
                    className="inline-flex items-center gap-1.5 text-sm text-[#A1A1AA] hover:text-white bg-transparent border-0 p-0"
                  >
                    <Plus className="w-4 h-4" />
                    Add entry
                  </button>
                </div>
              ) : null}

              {tab === "skills" ? (
                <div>
                  <div className="flex gap-2">
                    <input value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (!skillInput.trim() || (draft.skills ?? []).length >= 20) return;
                        setDraft((p: any) => ({ ...p, skills: [...(p.skills ?? []), skillInput.trim()] }));
                        setSkillInput("");
                      }
                    }} className="flex-1 bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white" placeholder="Add a skill..." />
                    <button
                      type="button"
                      onClick={() => {
                        if (!skillInput.trim() || (draft.skills ?? []).length >= 20) return;
                        setDraft((p: any) => ({ ...p, skills: [...(p.skills ?? []), skillInput.trim()] }));
                        setSkillInput("");
                      }}
                      className="inline-flex items-center gap-1 px-3 py-2 text-sm text-[#A1A1AA] hover:text-white border border-white/15 rounded-lg bg-transparent"
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  </div>
                  {(draft.skills ?? []).length >= 20 ? <p className="text-sm text-red-400 mt-2">Max 20 skills reached</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(draft.skills ?? []).map((s: string) => (
                      <span key={s} className="px-3 py-1 rounded-md bg-white/5 border border-white/10 text-[#d4d4d8] text-sm inline-flex items-center gap-2">
                        {s}
                        <button type="button" className="text-[#888] hover:text-white bg-transparent border-0 p-0 text-xs" onClick={() => setDraft((p: any) => ({ ...p, skills: (p.skills ?? []).filter((x: string) => x !== s) }))}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {tab === "awards" ? (
                <div className="space-y-3">
                  {(draft.awards ?? []).map((a: any, i: number) => (
                    <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-2 border border-white/10 rounded-xl p-3">
                      <input className="bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white" placeholder="Award Name" value={a.name ?? ""} onChange={(ev) => setDraft((p: any) => ({ ...p, awards: p.awards.map((x: any, ix: number) => ix === i ? { ...x, name: ev.target.value } : x) }))} />
                      <input className="bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white" placeholder="Issued By" value={a.issuer ?? ""} onChange={(ev) => setDraft((p: any) => ({ ...p, awards: p.awards.map((x: any, ix: number) => ix === i ? { ...x, issuer: ev.target.value } : x) }))} />
                      <input type="month" className="bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white" value={a.date ?? ""} onChange={(ev) => setDraft((p: any) => ({ ...p, awards: p.awards.map((x: any, ix: number) => ix === i ? { ...x, date: ev.target.value } : x) }))} />
                      <textarea className="md:col-span-2 bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white" rows={2} placeholder="Description" value={a.description ?? ""} onChange={(ev) => setDraft((p: any) => ({ ...p, awards: p.awards.map((x: any, ix: number) => ix === i ? { ...x, description: ev.target.value } : x) }))} />
                      <button type="button" className="md:col-span-2 text-sm text-[#A1A1AA] border border-white/15 rounded-lg px-2 py-1 hover:bg-white/5 bg-transparent w-fit" onClick={() => setDraft((p: any) => ({ ...p, awards: p.awards.filter((_: any, ix: number) => ix !== i) }))}>Delete</button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDraft((p: any) => ({ ...p, awards: [...(p.awards ?? []), { name: "", issuer: "", date: "", description: "" }] }))}
                    className="inline-flex items-center gap-1.5 text-sm text-[#A1A1AA] hover:text-white bg-transparent border-0 p-0"
                  >
                    <Plus className="w-4 h-4" />
                    Add award
                  </button>
                </div>
              ) : null}

              {tab === "bio" ? (
                <div>
                  <textarea className="w-full bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white" rows={5} placeholder="Write a short bio..." value={draft.bio ?? ""} onChange={(e) => setDraft((p: any) => ({ ...p, bio: e.target.value.slice(0, 160) }))} />
                  <p className={`text-right text-xs mt-1 ${overWarn ? "text-red-400" : "text-[#A1A1AA]"}`}>{bioCount} / 160</p>
                </div>
              ) : null}
            </div>

            <div className="px-4 py-3 border-t border-white/10 flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-full border border-white/30 text-white text-sm font-medium hover:bg-white/5 bg-transparent transition-colors"
                onClick={onClose}
              >
                Cancel
              </button>
              <MotionButton
                type="button"
                onClick={async () => {
                  setSaving(true);
                  await onSave(draft);
                  setSaving(false);
                }}
              >
                {saving ? "Saving..." : "Save"}
              </MotionButton>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
