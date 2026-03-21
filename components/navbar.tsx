"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search, Bell, Mail, Menu, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import {
  NAVBAR_AVATAR_UPDATE_EVENT,
  type NavbarAvatarUpdateDetail,
} from "@/lib/navbar-avatar-events";
import { CreateCommunityModal } from "@/components/create-community-modal";
import { MotionButton } from "@/components/motion-button";
import { useNavigating } from "@/lib/use-navigating";
import { LoadingSpinner } from "@/components/loading-spinner";

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
  const { navigate: navigateFromSearch, navigating: searchResultNavigating } = useNavigating();
  const { navigate: navigateViewProfile, navigating: viewProfileNavigating } = useNavigating();
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [showCreateCommunity, setShowCreateCommunity] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [navAvatarUrl, setNavAvatarUrl] = useState<string | null>(null);
  /** Loaded from `profiles` after login; used for `/profile/[username]`. */
  const [navUsername, setNavUsername] = useState<string | null>(null);
  /** True while fetching profile row for navbar (don’t navigate to a broken URL). */
  const [navProfileLoading, setNavProfileLoading] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!user) {
      setNavAvatarUrl(null);
      setNavUsername(null);
      setNavProfileLoading(false);
      return;
    }
    setNavProfileLoading(true);
    setNavAvatarUrl(null);
    setNavUsername(null);
    void (async () => {
      try {
        const { data: profileData, error } = await supabase
          .from("profiles")
          .select("username,avatar_url")
          .eq("id", user.id)
          .maybeSingle();

        console.log("[Navbar] Profile data from query:", profileData, "error:", error);

        if (error) {
          console.error("Navbar profile fetch:", error);
          setNavAvatarUrl(null);
          setNavUsername(null);
          return;
        }

        if (profileData?.username) {
          const u = String(profileData.username).trim();
          if (u.length) {
            setNavUsername(u);
            setNavAvatarUrl(profileData.avatar_url ?? null);
            console.log("[Navbar] Set nav username from DB:", u);
          } else {
            console.error("[Navbar] Profile row has empty username for user:", user.id);
            setNavUsername(null);
            setNavAvatarUrl(profileData.avatar_url ?? null);
          }
        } else {
          console.error("[Navbar] No profile found for user:", user.id);
          setNavUsername(null);
          setNavAvatarUrl(null);
        }
      } finally {
        setNavProfileLoading(false);
      }
    })();
  }, [user, supabase]);

  useEffect(() => {
    if (!user) return;
    console.log("[Navbar] Nav username:", navUsername, "| Nav user id:", user.id);
    if (navUsername) {
      console.log("[Navbar] Would navigate to:", "/profile/" + encodeURIComponent(navUsername));
    }
  }, [user, navUsername]);

  const handleViewProfile = useCallback(async () => {
    if (!user) return;
    setProfileMenuOpen(false);
    setMobileMenuOpen(false);

    console.log("[Navbar] View Profile click — navUsername:", navUsername, "| user.id:", user.id);

    if (navUsername && navUsername.trim()) {
      const path = "/profile/" + encodeURIComponent(navUsername.trim());
      console.log("[Navbar] Navigating to:", path);
      navigateViewProfile(path);
      return;
    }

    const { data, error } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
    console.log("[Navbar] View Profile re-fetch username:", data, "error:", error);

    if (data?.username) {
      const u = String(data.username).trim();
      if (u.length) {
        setNavUsername(u);
        navigateViewProfile("/profile/" + encodeURIComponent(u));
        return;
      }
    }

    console.error("[Navbar] No username in profiles; redirecting to onboarding");
    router.push("/onboarding");
  }, [user, navUsername, supabase, navigateViewProfile, router]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const d = (ev as CustomEvent<NavbarAvatarUpdateDetail>).detail;
      if (d && "avatar_url" in d) setNavAvatarUrl(d.avatar_url);
    };
    window.addEventListener(NAVBAR_AVATAR_UPDATE_EVENT, handler);
    return () => window.removeEventListener(NAVBAR_AVATAR_UPDATE_EVENT, handler);
  }, []);

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

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (profileMenuOpen && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [profileMenuOpen]);

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
      const [{ data: users }, { data: posts }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,username,display_name,account_type")
          .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
          .limit(6),
        supabase
          .from("posts")
          .select("id,title,post_type")
          .or(`title.ilike.%${q}%,tags.cs.{${q}},tags.cs.{${q.toLowerCase()}},tags.cs.{${q.toUpperCase()}}`)
          .limit(6),
      ]);
      setSearchResults([
        ...((users ?? []).map((u: any) => ({ ...u, resultType: "user" as const }))),
        ...((posts ?? []).map((p: any) => ({ ...p, resultType: "post" as const }))),
      ]);
      setSearching(false);
    }, 200);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false);
    setSearchQuery("");

    if (result.resultType === "user") {
      navigateFromSearch(`/profile/${result.username}`);
    } else {
      navigateFromSearch(`/post/${result.id}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchQuery.length >= 2) {
      navigateFromSearch(`/search?q=${encodeURIComponent(searchQuery)}`);
      setShowResults(false);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 glass border-b border-white/10 z-50">
      <div className="h-full max-w-7xl mx-auto px-4 flex items-center justify-between gap-4">
        {/* Brand — text only (VT323 green) */}
        <Link href="/feed" className="flex-shrink-0 font-pixel tracking-wider text-[#22C55E] text-2xl">
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
              className="w-full bg-[#0A0A0A] border border-[rgba(255,255,255,0.1)] pl-10 pr-4 py-2 rounded-md focus:outline-none focus:border-[rgba(255,255,255,0.3)] transition-colors text-white text-sm"
            />
            {(searching || searchResultNavigating) && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
                {searchResultNavigating ? (
                  <LoadingSpinner size={16} />
                ) : (
                  <Loader2 className="w-4 h-4 text-[#A1A1AA] animate-spin" />
                )}
              </span>
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
                    <MotionButton
                      key={`user-${result.id}`}
                      variant="plain"
                      disabled={searchResultNavigating}
                      onClick={() => handleResultClick(result)}
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[#27272A] transition-colors text-left rounded-none"
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
                    </MotionButton>
                  ))}
                  
                  {searchResults.filter(r => r.resultType === "post").length > 0 && (
                    <div className="px-3 py-2 text-xs text-[#A1A1AA] uppercase tracking-wider border-t border-b border-[#27272A]">
                      Posts
                    </div>
                  )}
                  {searchResults.filter(r => r.resultType === "post").map((result) => (
                    <MotionButton
                      key={`post-${result.id}`}
                      variant="plain"
                      disabled={searchResultNavigating}
                      onClick={() => handleResultClick(result)}
                      className="w-full px-4 py-3 hover:bg-[#27272A] transition-colors text-left rounded-none"
                    >
                      <p className="text-sm text-white line-clamp-1">{result.title}</p>
                      <p className="text-xs text-[#A1A1AA]">{result.post_type}</p>
                    </MotionButton>
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
          <div className="relative">
            <MotionButton
              type="button"
              variant="plain"
              onClick={() => setCreateOpen((v) => !v)}
              className="relative p-2 rounded-full transition-colors flex items-center gap-1 glass-pill shimmer-on-hover"
            >
              <Plus className="w-4 h-4 text-[#22C55E]" />
              <span className="text-xs text-[#A1A1AA]">Create</span>
            </MotionButton>
            {createOpen && (
              <div
                className="absolute right-0 mt-2 w-44 rounded-lg overflow-hidden z-50"
                style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <Link
                  href="/feed?create=1"
                  className="block px-3 py-2 text-sm text-white hover:bg-[rgba(255,255,255,0.05)]"
                  onClick={() => setCreateOpen(false)}
                >
                  Create Post
                </Link>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-white hover:bg-[rgba(255,255,255,0.05)]"
                  onClick={() => {
                    setCreateOpen(false);
                    setShowCreateCommunity(true);
                  }}
                >
                  Create Community
                </button>
              </div>
            )}
          </div>
          <div className="relative" ref={notificationsRef}>
            <MotionButton
              variant="plain"
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
            </MotionButton>

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

          {user ? (
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                onClick={() => setProfileMenuOpen((v) => !v)}
                className={cn(
                  "h-9 w-9 shrink-0 overflow-hidden bg-[#1C1C1A] flex items-center justify-center text-sm rounded-full hover:bg-[#27272A] transition-colors border border-[#27272A]",
                  "ring-2 ring-[#00FF88]/40 ring-offset-2 ring-offset-[#141414]"
                )}
              >
                {navAvatarUrl ? (
                  <Image
                    src={navAvatarUrl}
                    alt=""
                    width={36}
                    height={36}
                    unoptimized
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-medium text-white">{user.email?.[0]?.toUpperCase() ?? "U"}</span>
                )}
              </button>
              {profileMenuOpen && (
                <div
                  className="absolute right-0 mt-2 z-[60] min-w-[200px] overflow-hidden rounded-[12px] py-1"
                  style={{
                    background: "#0a0a0a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                  }}
                  role="menu"
                >
                  {navProfileLoading ? (
                    <div
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#888888] cursor-wait"
                      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
                    >
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      Loading profile…
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={viewProfileNavigating}
                      className="block w-full text-left px-4 py-2.5 text-sm text-white hover:bg-[rgba(255,255,255,0.05)] bg-transparent border-0 disabled:opacity-60 inline-flex items-center gap-2"
                      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
                      onClick={() => void handleViewProfile()}
                    >
                      {viewProfileNavigating ? <LoadingSpinner size={16} /> : null}
                      {viewProfileNavigating ? "Loading…" : "View Profile"}
                    </button>
                  )}
                  <Link
                    href="/settings"
                    className="block px-4 py-2.5 text-sm text-white hover:bg-[rgba(255,255,255,0.05)]"
                    style={{ fontFamily: "Inter, system-ui, sans-serif" }}
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    Settings
                  </Link>
                  <div className="my-1 h-px bg-white/10 mx-2" />
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-[rgba(255,255,255,0.05)] text-red-500"
                    style={{ fontFamily: "Inter, system-ui, sans-serif" }}
                    onClick={() => {
                      setProfileMenuOpen(false);
                      void signOut().then(() => router.push("/"));
                    }}
                  >
                    Log Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/auth"
              className="w-8 h-8 bg-[#1C1C1A] flex items-center justify-center text-sm rounded-lg hover:bg-[#27272A] transition-colors border border-[#27272A]"
            >
              U
            </Link>
          )}

          <MotionButton
            variant="plain"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 hover:bg-[#1C1C1A] rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </MotionButton>
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
            {user && navProfileLoading ? (
              <span className="block py-2 text-[#666]">Profile…</span>
            ) : user ? (
              <button
                type="button"
                disabled={viewProfileNavigating}
                className="block w-full text-left py-2 hover:text-[#22C55E] transition-colors text-white disabled:opacity-50 bg-transparent border-0"
                onClick={() => void handleViewProfile()}
              >
                {viewProfileNavigating ? "Opening…" : "Profile"}
              </button>
            ) : null}
            <Link href="/settings" className="block py-2 hover:text-[#22C55E] transition-colors">Settings</Link>
            <Link href="/notifications" className="block py-2 hover:text-[#22C55E] transition-colors">Notifications</Link>
            {user && (
              <MotionButton
                variant="plain"
                onClick={() => signOut()}
                className="block py-2 text-red-400 hover:text-red-300 transition-colors w-full text-left"
              >
                Sign Out
              </MotionButton>
            )}
          </div>
        </div>
      )}
      <CreateCommunityModal isOpen={showCreateCommunity} onClose={() => setShowCreateCommunity(false)} />
    </nav>
  );
}
