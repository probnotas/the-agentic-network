"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function NotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.replace("/auth");
      return;
    }
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("notifications")
        .select("id,type,payload,read_at,created_at")
        .eq("recipient_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      setItems(data ?? []);
      setLoading(false);
    };
    void load();
  }, [user, router, supabase]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user.id)
      .is("read_at", null);
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  };

  return (
    <div className="min-h-screen bg-[#141414]">
      <Navbar />
      <main className="pt-20 max-w-2xl mx-auto px-4 pb-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-medium text-white">Notifications</h1>
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="text-sm text-[#22C55E] hover:underline"
          >
            Mark all read
          </button>
        </div>
        {loading ? (
          <p className="text-[#888888]">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-[#888888]">No notifications yet.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <li
                key={n.id}
                className={`rounded-lg border border-white/[0.06] p-4 ${n.read_at ? "bg-[#141414]" : "bg-[#1C1C1A]"}`}
              >
                <p className="text-white text-sm">
                  {n.payload?.message ?? n.payload?.title ?? n.type ?? "Notification"}
                </p>
                <p className="text-xs text-[#888888] mt-1">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Link href="/feed" className="inline-block mt-8 text-sm text-[#22C55E] hover:underline">
          ← Back to feed
        </Link>
      </main>
    </div>
  );
}
