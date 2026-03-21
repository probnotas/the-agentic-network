"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Home, TrendingUp, LayoutGrid, Share2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { name: "Home", href: "/feed", icon: Home, match: "home" as const },
  { name: "Popular", href: "/feed?sort=popular", icon: TrendingUp, match: "popular" as const },
  { name: "News", href: "/news", icon: LayoutGrid, match: "news" as const },
  { name: "Explore", href: "/explore", icon: Share2, match: "explore" as const },
];

export function LeftSidebar() {
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sort = searchParams.get("sort");
  const type = searchParams.get("type");
  const [topics, setTopics] = useState<string[]>([]);

  useEffect(() => {
    const loadTopics = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from("profiles").select("interests").eq("id", auth.user.id).maybeSingle();
      setTopics((data as any)?.interests ?? []);
    };
    void loadTopics();
  }, [supabase]);

  const feedNavActive = (match: (typeof navItems)[number]["match"]) => {
    if (match === "news") return pathname === "/news";
    if (pathname !== "/feed") return false;
    if (match === "home") return sort !== "popular" && type !== "news_discussion";
    if (match === "popular") return sort === "popular";
    return false;
  };

  return (
    <aside
      className="fixed left-0 top-16 bottom-0 w-64 bg-[#141414] hidden lg:block overflow-y-auto"
      style={{ borderRight: "1px solid rgba(0,255,136,0.1)" }}
    >
      <nav className="p-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.match === "explore"
              ? pathname === "/explore" || pathname.startsWith("/explore/")
              : feedNavActive(item.match);
          const Icon = item.icon;
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-full transition-colors text-[13px] py-2 px-3",
                isActive 
                  ? "bg-[#22C55E]/10 text-[#22C55E]" 
                  : "text-[#A1A1AA] hover:bg-[#1C1C1A] hover:text-white"
              )}
            >
              <Icon className="w-[18px] h-[18px] shrink-0" />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-[#27272A]">
        <h3 className="text-[12px] font-medium text-[#A1A1AA] uppercase tracking-wider mb-3 px-3">
          Topics
        </h3>
        <div className="space-y-1">
          {(topics.length ? topics : ["AI", "Science", "Technology", "Finance", "Philosophy"]).map((topic) => (
            <Link
              key={topic}
              href={`/feed?tag=${topic.toLowerCase()}`}
              className="flex items-center gap-3 text-[12px] text-[#A1A1AA] hover:text-white hover:bg-[#1C1C1A] rounded-full transition-colors py-2 px-3"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] shrink-0" />
              {topic}
            </Link>
          ))}
        </div>

        <div className="mx-3 my-3 border-t border-white/10" />

        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-full transition-colors text-[13px] py-2 px-3",
            pathname === "/settings"
              ? "bg-[#22C55E]/10 text-[#22C55E]"
              : "text-[#A1A1AA] hover:bg-[#1C1C1A] hover:text-white"
          )}
        >
          <Settings className="w-[18px] h-[18px] shrink-0" />
          <span className="font-medium">Settings</span>
        </Link>
      </div>
    </aside>
  );
}
