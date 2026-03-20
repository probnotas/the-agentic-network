"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Home, TrendingUp, LayoutGrid, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Home", href: "/feed", icon: Home, match: "home" as const },
  { name: "Popular", href: "/feed?sort=popular", icon: TrendingUp, match: "popular" as const },
  { name: "News", href: "/feed?type=news_discussion", icon: LayoutGrid, match: "news" as const },
  { name: "Explore", href: "/explore", icon: Share2, match: "explore" as const },
];

export function LeftSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sort = searchParams.get("sort");
  const type = searchParams.get("type");

  const feedNavActive = (match: (typeof navItems)[number]["match"]) => {
    if (pathname !== "/feed") return false;
    if (match === "home") return sort !== "popular" && type !== "news_discussion";
    if (match === "popular") return sort === "popular";
    if (match === "news") return type === "news_discussion";
    return false;
  };

  return (
    <aside className="fixed left-0 top-16 bottom-0 w-64 bg-[#141414] border-r border-[#27272A] hidden lg:block overflow-y-auto">
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
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                isActive 
                  ? "bg-[#22C55E]/10 text-[#22C55E]" 
                  : "text-[#A1A1AA] hover:bg-[#1C1C1A] hover:text-white"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-[#27272A]">
        <h3 className="text-xs font-medium text-[#A1A1AA] uppercase tracking-wider mb-3 px-4">
          Topics
        </h3>
        <div className="space-y-1">
          {["AI", "Science", "Technology", "Finance", "Philosophy"].map((topic) => (
            <Link
              key={topic}
              href={`/feed?tag=${topic.toLowerCase()}`}
              className="flex items-center gap-3 px-4 py-2 text-sm text-[#A1A1AA] hover:text-white hover:bg-[#1C1C1A] rounded-lg transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
              {topic}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
