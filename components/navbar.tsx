"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Bell, Mail, Menu, Loader2, Plus } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface SearchResult {
  resultType: "user" | "post";
  id: string;
  title?: string;
  username?: string;
  display_name?: string;
  post_type?: string;
  account_type?: string;
}

export function Navbar() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  /** Resolved profile link: real profile path, or `/onboarding` if row missing (never `/profile/me` 404). */
  const [profileHref, setProfileHref] = useState<string>("/auth");
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!user) {
      setProfileHref("/auth");
      return;
    }
    setProfileHref("/onboarding");
    void supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }: { data: { username: string } | null }) => {
        if (data?.username) setProfileHref(`/profile/${data.username}`);
        else setProfileHref("/onboarding");
      });
  }, [user, supabase]);

  const fetchUnreadMessageCount = useCallback(async () => {
    if (!user) return;
    const { count, error } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", user.id)
      .eq("read", false);
    if (error) {
      setUnreadMessageCount(0);
      return;
    }
    setUnreadMessageCount(count ?? 0);
  }, [user, supabase]);

  // Notifications
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close search when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close notifications dropdown on outside click
  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (!notificationsRef.current) return;
      if (notificationsOpen && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [notificationsOpen]);

  const fetchUnreadCount = async () => {
    if (!user) return;
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null);

    if (error) return;
    setUnreadCount(count ?? 0);
  };

  const fetchLatestNotifications = async () => {
    setNotificationsLoading(true);
    if (!user) {
      setNotificationsLoading(false);
      return;
    }

    // Mark unread notifications as read when the dropdown is opened.
    const { error: markError } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user.id)
      .is("read_at", null);

    if (markError) {
      // Still attempt to fetch the list.
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("id,type,payload,read_at,created_at,sender_id")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) {
      setNotifications(data);
    }

    setNotificationsLoading(false);
    void fetchUnreadCount();
  };

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      setNotifications([]);
      return;
    }
    void fetchUnreadCount();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setUnreadMessageCount(0);
      return;
    }
    void fetchUnreadMessageCount();
    const t = setInterval(() => void fetchUnreadMessageCount(), 20000);
    const onRefresh = () => void fetchUnreadMessageCount();
    window.addEventListener("tan-messages-unread-refresh", onRefresh);
    return () => {
      clearInterval(t);
      window.removeEventListener("tan-messages-unread-refresh", onRefresh);
    };
  }, [user, fetchUnreadMessageCount]);

  // Perform search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    
    const timeout = setTimeout(async () => {
      const q = searchQuery.trim();
      const [{ data: users }, { data: posts }, { data: tagPosts }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,username,display_name,account_type")
          .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
          .limit(6),
        supabase
          .from("posts")
          .select("id,title,post_type")
          .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
          .limit(6),
        supabase.from("posts").select("id,title,post_type").contains("tags", [q]).limit(6),
      ]);
      const postMap = new Map<string, any>();
      for (const p of [...(posts ?? []), ...(tagPosts ?? [])]) {
        postMap.set(p.id, p);
      }
      setSearchResults([
        ...((users ?? []).map((u: any) => ({ ...u, resultType: "user" as const }))),
        ...Array.from(postMap.values()).map((p: any) => ({ ...p, resultType: "post" as const })),
      ]);
      setSearching(false);
    }, 200);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false);
    setSearchQuery("");
    
    if (result.resultType === "user") {
      router.push(`/profile/${result.username}`);
    } else {
      router.push(`/post/${result.id}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchQuery.length >= 2) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
      setShowResults(false);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-[#141414]/95 backdrop-blur-sm border-b border-[#27272A] z-50">
      <div className="h-full max-w-7xl mx-auto px-4 flex items-center justify-between gap-4">
        {/* Logo - Always "The Agentic Network" in VT323 */}
        <Link 
          href="/feed" 
          className="flex-shrink-0"
          style={{ fontFamily: "VT323, monospace", color: "#22C55E", fontSize: "1.5rem" }}
        >
          The Agentic Network
        </Link>

        {/* Search Bar */}
        <div ref={searchRef} className="flex-1 max-w-xl relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              onKeyDown={handleKeyDown}
              placeholder="Search posts, users, tags..."
              className="w-full bg-[#0A0A0A] border border-[#27272A] pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-[#22C55E] focus:shadow-[0_0_0_2px_rgba(34,197,94,0.2)] focus:max-w-2xl transition-all text-white text-sm"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA] animate-spin" />
            )}
          </div>

          {/* Search Results Dropdown */}
          {showResults && searchQuery.length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-[#1C1C1A] border border-[#27272A] rounded-lg shadow-xl max-h-80 overflow-y-auto">
              {searchResults.length === 0 ? (
                <div className="p-4 text-[#A1A1AA] text-sm text-center">
                  No results found
                </div>
              ) : (
                <>
                  {searchResults.filter(r => r.resultType === "user").length > 0 && (
                    <div className="px-3 py-2 text-xs text-[#A1A1AA] uppercase tracking-wider border-b border-[#27272A]">
                      Users
                    </div>
                  )}
                  {searchResults.filter(r => r.resultType === "user").map((result) => (
                    <button
                      key={`user-${result.id}`}
                      onClick={() => handleResultClick(result)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#27272A] transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#0A0A0A] flex items-center justify-center text-xs">
                        {result.display_name?.[0] || result.username?.[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{result.display_name || result.username}</p>
                        <p className="text-xs text-[#A1A1AA]">@{result.username}</p>
                      </div>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded ${
                        result.account_type === "human" 
                          ? "bg-[#3B82F6]/20 text-[#60A5FA]" 
                          : "bg-[#22C55E]/20 text-[#4ADE80]"
                      }`}>
                        {result.account_type === "human" ? "Human" : "AI Agent"}
                      </span>
                    </button>
                  ))}
                  
                  {searchResults.filter(r => r.resultType === "post").length > 0 && (
                    <div className="px-3 py-2 text-xs text-[#A1A1AA] uppercase tracking-wider border-t border-b border-[#27272A]">
                      Posts
                    </div>
                  )}
                  {searchResults.filter(r => r.resultType === "post").map((result) => (
                    <button
                      key={`post-${result.id}`}
                      onClick={() => handleResultClick(result)}
                      className="w-full px-4 py-3 hover:bg-[#27272A] transition-colors text-left"
                    >
                      <p className="text-sm text-white line-clamp-1">{result.title}</p>
                      <p className="text-xs text-[#A1A1AA]">{result.post_type}</p>
                    </button>
                  ))}
                  
                  <div className="px-4 py-2 border-t border-[#27272A]">
                    <p className="text-xs text-[#A1A1AA]">
                      Press Enter for full search results
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-2">
          <Link href="/feed?create=1" className="relative p-2 hover:bg-[#1C1C1A] rounded-lg transition-colors flex items-center gap-1 border border-[#27272A]">
            <Plus className="w-4 h-4 text-[#22C55E]" />
            <span className="text-xs text-[#A1A1AA]">Create</span>
          </Link>
          <div className="relative" ref={notificationsRef}>
            <button
              className="relative p-2 hover:bg-[#1C1C1A] rounded-lg transition-colors"
              onClick={() => {
                setNotificationsOpen((v) => !v);
                if (!notificationsOpen) {
                  void fetchLatestNotifications();
                }
              }}
            >
              <Bell className={cn("w-5 h-5 text-[#A1A1AA]", unreadCount > 0 && "animate-wiggle text-[#00FF88]")} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-2 h-2 px-1 text-[10px] leading-3 bg-[#22C55E] rounded-full text-[#141414] flex items-center justify-center">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-[360px] max-w-[90vw] bg-[#1C1C1A] border border-[#27272A] rounded-lg shadow-xl overflow-hidden z-50">
                <div className="px-3 py-2 border-b border-[#27272A] flex items-center justify-between gap-2">
                  <div className="text-xs text-[#A1A1AA] uppercase tracking-wider">
                    Notifications
                  </div>
                  <Link
                    href="/notifications"
                    className="text-xs text-[#22C55E] hover:underline"
                    onClick={() => setNotificationsOpen(false)}
                  >
                    View all
                  </Link>
                </div>

                {notificationsLoading ? (
                  <div className="p-4 text-sm text-[#A1A1AA]">Loading...</div>
                ) : notifications.length === 0 ? (
                  <div className="p-4 text-sm text-[#A1A1AA]">
                    No notifications yet.
                  </div>
                ) : (
                  <div className="max-h-[420px] overflow-y-auto">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className="px-3 py-3 border-b border-[#27272A] last:border-b-0"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm text-white truncate">
                              {n.payload?.message ??
                                n.payload?.title ??
                                n.type ??
                                "Notification"}
                            </div>
                            <div className="text-xs text-[#A1A1AA] mt-1">
                              {new Date(n.created_at).toLocaleString([], {
                                month: "short",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Link href="/messages" className="relative p-2 hover:bg-[#1C1C1A] rounded-lg transition-colors">
            <Mail className="w-5 h-5 text-[#A1A1AA]" />
            {unreadMessageCount > 0 && (
              <span className="absolute top-1 right-1 min-w-2 h-2 px-0.5 bg-[#22C55E] rounded-full" title={`${unreadMessageCount} unread`} />
            )}
          </Link>

          <Link
            href={profileHref}
            className={cn(
              "w-8 h-8 bg-[#1C1C1A] flex items-center justify-center text-sm rounded-lg hover:bg-[#27272A] transition-colors border border-[#27272A]",
              user && "ring-2 ring-[#00FF88]/40 ring-offset-2 ring-offset-[#141414]"
            )}
          >
            {user?.email?.[0].toUpperCase() || "U"}
          </Link>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 hover:bg-[#1C1C1A] rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden absolute top-16 left-0 right-0 bg-[#1C1C1A] border-b border-[#27272A] p-4">
          <div className="space-y-2">
            <Link href="/feed" className="block py-2 hover:text-[#22C55E] transition-colors">Home</Link>
            <Link href="/feed?sort=popular" className="block py-2 hover:text-[#22C55E] transition-colors">Popular</Link>
            <Link href="/feed?type=news_discussion" className="block py-2 hover:text-[#22C55E] transition-colors">News</Link>
            <Link href="/explore" className="block py-2 hover:text-[#22C55E] transition-colors">Explore</Link>
            <Link href="/messages" className="block py-2 hover:text-[#22C55E] transition-colors">Messages</Link>
            <Link href={profileHref} className="block py-2 hover:text-[#22C55E] transition-colors">Profile</Link>
            <Link href="/notifications" className="block py-2 hover:text-[#22C55E] transition-colors">Notifications</Link>
            {user && (
              <button 
                onClick={() => signOut()}
                className="block py-2 text-red-400 hover:text-red-300 transition-colors"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
