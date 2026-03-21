"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import {
  UserPlus,
  UserCheck,
  Mail,
  ArrowLeft,
  Pencil,
  Camera,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { tierFromNetworkRank } from "@/lib/tier";
import { PostCardV3 } from "@/components/post-card-v3";
import { MotionButton } from "@/components/motion-button";
import { ImageCropEditor } from "@/components/image-crop-editor";
import { EditAboutModal } from "@/components/edit-about-modal";
import {
  experienceDateRange,
  parseProfileAwards,
  parseProfileExperience,
  parseProfileSkills,
} from "@/lib/profile-field-parsers";
import { dispatchNavbarAvatarUpdate } from "@/lib/navbar-avatar-events";
import { useNavigating } from "@/lib/use-navigating";
import { LoadingSpinner } from "@/components/loading-spinner";
import Image from "next/image";

/** LinkedIn-style cover crop: width is 4× height (e.g. 1584×396) */
const BANNER_CROP_ASPECT_RATIO = 4;
const PROFILE_POST_PAGE = 10;
const FOLLOW_LIST_LIMIT = 200;

async function urlToFile(url: string, filename: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { navigate: navigateToFeed, navigating: navigatingToFeed } = useNavigating();
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<any>(null);
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [profilePostsHasMore, setProfilePostsHasMore] = useState(false);
  const [profilePostsLoadingMore, setProfilePostsLoadingMore] = useState(false);
  const [totalPostCount, setTotalPostCount] = useState<number | null>(null);
  const profilePostsNextOffset = useRef(0);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [ratedPosts, setRatedPosts] = useState<Record<string, number>>({});
  const [isFollowing, setIsFollowing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [followersList, setFollowersList] = useState<any[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<any>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  /** Fullscreen crop (avatar updates + legacy edit-profile uploads) */
  const [cropOpen, setCropOpen] = useState(false);
  const [cropTarget, setCropTarget] = useState<"avatar" | "banner">("avatar");
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [cropRemoteUrl, setCropRemoteUrl] = useState<string | null>(null);

  const [avatarPhotoModalOpen, setAvatarPhotoModalOpen] = useState(false);
  const [bannerModalOpen, setBannerModalOpen] = useState(false);
  const [bannerEditorFile, setBannerEditorFile] = useState<File | null>(null);
  const [bannerEditorLoading, setBannerEditorLoading] = useState(false);
  /** Parent-owned blob URL for banner cropper (URL.createObjectURL only — no fetch for new picks) */
  const [bannerCropObjectUrl, setBannerCropObjectUrl] = useState<string | null>(null);
  /** Parent-owned blob URL for fullscreen avatar/banner crop from file picker */
  const [fullscreenCropObjectUrl, setFullscreenCropObjectUrl] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const avatarMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const slug = params.username as string;
    const profileSelect =
      "id,username,display_name,account_type,bio,avatar_url,banner_url,interests,skills,awards,experience,network_rank,core_drive,linkedin_url,website_url";

    const load = async () => {
      setLoading(true);
      setNotFound(false);
      console.log("[Profile page] Looking up slug:", slug);

      let {
        data: p,
        error: usernameErr,
      } = await supabase.from("profiles").select(profileSelect).eq("username", slug).maybeSingle();
      console.log("[Profile page] Query by username — data:", p, "error:", usernameErr);

      if (!p) {
        console.log("[Profile page] Trying by id (UUID fallback):", slug);
        const {
          data: byId,
          error: idErr,
        } = await supabase.from("profiles").select(profileSelect).eq("id", slug).maybeSingle();
        console.log("[Profile page] Query by id — data:", byId, "error:", idErr);
        p = byId ?? null;
      }
      if (!p) {
        setNotFound(true);
        setProfile(null);
        setLoading(false);
        return;
      }
      setProfile(p);
      profilePostsNextOffset.current = 0;

      const [countRes, postsRes, followRes, followingRowsRes, followerRowsRes] = await Promise.all([
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("author_id", p.id),
        supabase
          .from("posts")
          .select("id,title,body,tags,cover_image_url,created_at,like_count,comment_count,rating_avg")
          .eq("author_id", p.id)
          .order("created_at", { ascending: false })
          .range(0, PROFILE_POST_PAGE - 1),
        user
          ? supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", p.id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("follows").select("following_id").eq("follower_id", p.id).limit(FOLLOW_LIST_LIMIT),
        supabase.from("follows").select("follower_id").eq("following_id", p.id).limit(FOLLOW_LIST_LIMIT),
      ]);

      setTotalPostCount(typeof countRes.count === "number" ? countRes.count : 0);
      const postRows = postsRes.data ?? [];
      const follow = followRes;
      const followingRows = followingRowsRes.data ?? [];
      const followerRows = followerRowsRes.data ?? [];
      profilePostsNextOffset.current = postRows.length;
      setProfilePostsHasMore(postRows.length === PROFILE_POST_PAGE);
      setUserPosts(postRows);

      if (user && postRows.length) {
        const ids = postRows.map((pp: any) => pp.id);
        const { data: likeData } = await supabase
          .from("likes")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", ids);
        setLikedPosts(new Set((likeData ?? []).map((r: any) => r.post_id)));

        const { data: ratingData } = await supabase
          .from("ratings")
          .select("post_id,stars")
          .eq("user_id", user.id)
          .in("post_id", ids);
        const next: Record<string, number> = {};
        for (const r of ratingData ?? []) next[r.post_id] = r.stars;
        setRatedPosts(next);
      } else {
        setLikedPosts(new Set());
        setRatedPosts({});
      }
      setIsFollowing(Boolean((follow as any)?.data));

      const fIds = followingRows.map((r: { following_id: string }) => r.following_id);
      const folIds = followerRows.map((r: { follower_id: string }) => r.follower_id);
      const [{ data: fProfiles }, { data: folProfiles }] = await Promise.all([
        fIds.length ? supabase.from("profiles").select("id,username,display_name,account_type,avatar_url").in("id", fIds) : { data: [] },
        folIds.length ? supabase.from("profiles").select("id,username,display_name,account_type,avatar_url").in("id", folIds) : { data: [] },
      ]);
      setFollowingList(fProfiles ?? []);
      setFollowersList(folProfiles ?? []);
      setLoading(false);
    };
    void load();
  }, [params.username, supabase, user]);

  const loadMoreProfilePosts = useCallback(async () => {
    const p = profile;
    if (!p || profilePostsLoadingMore || !profilePostsHasMore) return;
    setProfilePostsLoadingMore(true);
    try {
      const start = profilePostsNextOffset.current;
      const end = start + PROFILE_POST_PAGE - 1;
      const { data: more } = await supabase
        .from("posts")
        .select("id,title,body,tags,cover_image_url,created_at,like_count,comment_count,rating_avg")
        .eq("author_id", p.id)
        .order("created_at", { ascending: false })
        .range(start, end);
      const rows = more ?? [];
      profilePostsNextOffset.current += rows.length;
      setProfilePostsHasMore(rows.length === PROFILE_POST_PAGE);
      setUserPosts((prev) => [...prev, ...rows]);

      if (user && rows.length) {
        const ids = rows.map((pp: { id: string }) => pp.id);
        const [{ data: likeData }, { data: ratingData }] = await Promise.all([
          supabase.from("likes").select("post_id").eq("user_id", user.id).in("post_id", ids),
          supabase.from("ratings").select("post_id,stars").eq("user_id", user.id).in("post_id", ids),
        ]);
        setLikedPosts((prev) => {
          const s = new Set(prev);
          for (const r of likeData ?? []) s.add((r as { post_id: string }).post_id);
          return s;
        });
        setRatedPosts((prev) => {
          const next = { ...prev };
          for (const r of ratingData ?? []) next[(r as { post_id: string }).post_id] = (r as { stars: number }).stars;
          return next;
        });
      }
    } finally {
      setProfilePostsLoadingMore(false);
    }
  }, [profile, profilePostsHasMore, profilePostsLoadingMore, supabase, user]);

  const closeCropEditor = useCallback(() => {
    setCropOpen(false);
    setSelectedImageFile(null);
    setCropRemoteUrl(null);
  }, []);

  const closeBannerModal = useCallback(() => {
    setBannerModalOpen(false);
    setBannerEditorFile(null);
    setBannerEditorLoading(false);
  }, []);

  useLayoutEffect(() => {
    if (!bannerEditorFile) {
      setBannerCropObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(bannerEditorFile);
    console.log(
      "[banner] createObjectURL for cropper (immediate):",
      url,
      "file:",
      bannerEditorFile.name,
      bannerEditorFile.size,
      bannerEditorFile.type
    );
    setBannerCropObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [bannerEditorFile]);

  useLayoutEffect(() => {
    if (!cropOpen || !selectedImageFile) {
      setFullscreenCropObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedImageFile);
    console.log(
      "[fullscreen crop] createObjectURL for cropper:",
      url,
      selectedImageFile.name,
      selectedImageFile.size,
      selectedImageFile.type
    );
    setFullscreenCropObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [cropOpen, selectedImageFile]);

  const openBannerModal = useCallback(async () => {
    if (!profile) return;
    setBannerModalOpen(true);
    setBannerEditorFile(null);
    if (profile.banner_url) {
      setBannerEditorLoading(true);
      try {
        const f = await urlToFile(profile.banner_url, "banner-current.jpg");
        setBannerEditorFile(f);
      } catch (e) {
        console.error("Banner preload failed:", e);
        alert("Could not load current banner. Use Change photo to upload a new one.");
      } finally {
        setBannerEditorLoading(false);
      }
    }
  }, [profile]);

  const handleAvatarCropComplete = async (croppedBlob: Blob): Promise<void> => {
    console.log("=== AVATAR UPLOAD START ===");
    console.log("Blob size:", croppedBlob.size, "Blob type:", croppedBlob.type);

    try {
      const { data: buckets, error: bucketsErr } = await supabase.storage.listBuckets();
      console.log("Available buckets:", buckets?.map((b: { name: string }) => b.name), "listBuckets error:", bucketsErr);
    } catch (e) {
      console.error("listBuckets threw:", e);
    }

    const { data: sessionData } = await supabase.auth.getSession();
    console.log("Session user:", sessionData?.session?.user?.id);

    if (!sessionData?.session) {
      alert("Not authenticated — please log in again");
      return;
    }

    const uid = sessionData.session.user.id;
    const fileName = "avatar-" + uid + "-" + Date.now() + ".jpg";
    console.log("Uploading file:", fileName, "to bucket: avatars");

    const { data: uploadData, error: uploadError } = await supabase.storage.from("avatars").upload(fileName, croppedBlob, {
      upsert: true,
      contentType: "image/jpeg",
      cacheControl: "3600",
    });

    console.log("Upload result:", uploadData, uploadError);

    if (uploadError) {
      console.error("=== AVATAR UPLOAD ERROR ===", uploadError);
      const status =
        typeof (uploadError as { statusCode?: string }).statusCode !== "undefined"
          ? String((uploadError as { statusCode?: string }).statusCode)
          : "";
      alert("Upload error: " + uploadError.message + (status ? " | statusCode: " + status : ""));
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
    console.log("Public URL:", urlData.publicUrl);

    const { error: updateError } = await supabase.from("profiles").update({ avatar_url: urlData.publicUrl }).eq("id", uid);

    if (updateError) {
      console.error("=== PROFILE UPDATE ERROR (avatar) ===", updateError);
      alert("Profile update error: " + updateError.message);
      return;
    }

    console.log("=== AVATAR UPLOAD SUCCESS ===");
    setProfile((prev: any) => (prev ? { ...prev, avatar_url: urlData.publicUrl } : prev));
    dispatchNavbarAvatarUpdate(urlData.publicUrl);
    closeCropEditor();
    setAvatarPhotoModalOpen(false);
  };

  const handleBannerCropComplete = async (croppedBlob: Blob): Promise<void> => {
    console.log("=== BANNER UPLOAD START ===");
    console.log("Blob size:", croppedBlob.size, "Blob type:", croppedBlob.type);

    try {
      const { data: buckets, error: bucketsErr } = await supabase.storage.listBuckets();
      console.log("Available buckets:", buckets?.map((b: { name: string }) => b.name), "listBuckets error:", bucketsErr);
    } catch (e) {
      console.error("listBuckets threw:", e);
    }

    const { data: sessionData } = await supabase.auth.getSession();
    console.log("Session user:", sessionData?.session?.user?.id);

    if (!sessionData?.session) {
      alert("Not authenticated — please log in again");
      return;
    }

    const fileName = "banner-" + sessionData.session.user.id + "-" + Date.now() + ".jpg";
    console.log("Uploading file:", fileName, "to bucket: banners");

    const { data: uploadData, error: uploadError } = await supabase.storage.from("banners").upload(fileName, croppedBlob, {
      upsert: true,
      contentType: "image/jpeg",
      cacheControl: "3600",
    });

    console.log("Upload result:", uploadData, uploadError);

    if (uploadError) {
      console.error("=== UPLOAD ERROR ===", uploadError);
      const status =
        typeof (uploadError as { statusCode?: string }).statusCode !== "undefined"
          ? String((uploadError as { statusCode?: string }).statusCode)
          : "";
      alert("Upload error: " + uploadError.message + (status ? " | statusCode: " + status : ""));
      return;
    }

    const { data: urlData } = supabase.storage.from("banners").getPublicUrl(fileName);
    console.log("Public URL:", urlData.publicUrl);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ banner_url: urlData.publicUrl })
      .eq("id", sessionData.session.user.id);

    if (updateError) {
      console.error("=== PROFILE UPDATE ERROR ===", updateError);
      alert("Profile update error: " + updateError.message);
      return;
    }

    console.log("=== BANNER UPLOAD SUCCESS ===");
    setProfile((prev: any) => (prev ? { ...prev, banner_url: urlData.publicUrl } : prev));
    closeBannerModal();
    closeCropEditor();
  };

  const handleFollow = () => {
    if (!user || !profile) return;
    const next = !isFollowing;
    setIsFollowing(next);
    if (next) {
      void supabase.from("follows").insert({ follower_id: user.id, following_id: profile.id });
    } else {
      void supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profile.id);
    }
  };

  const handleMessage = () => {
    if (!profile?.id) return;
    router.push(`/messages?user=${profile.id}`);
  };

  const deleteAvatar = async () => {
    if (!user?.id || !profile) return;
    console.log("Deleting avatar for user", user.id);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    if (error) {
      console.error("Avatar delete error:", error);
      alert("Could not remove photo: " + error.message);
      return;
    }
    setProfile((p: any) => (p ? { ...p, avatar_url: null } : p));
    dispatchNavbarAvatarUpdate(null);
    setAvatarPhotoModalOpen(false);
  };

  const deleteBannerFromEditor = async () => {
    if (!user?.id) return;
    console.log("Deleting banner for user", user.id);
    const { error } = await supabase.from("profiles").update({ banner_url: null }).eq("id", user.id);
    if (error) {
      console.error("Banner delete error:", error);
      alert("Could not remove banner: " + error.message);
      return;
    }
    setProfile((p: any) => (p ? { ...p, banner_url: null } : p));
    setBannerEditorFile(null);
    closeBannerModal();
  };

  const isOwnProfile = user?.id === profile?.id;

  useEffect(() => {
    if (!profile) return;
    setEditDraft({
      display_name: profile.display_name || "",
      bio: profile.bio || "",
      interests: parseProfileSkills(profile.interests).join(", "),
      skills: parseProfileSkills(profile.skills).join(", "),
      linkedin_url: profile.linkedin_url || "",
      website_url: profile.website_url || "",
    });
  }, [profile]);

  useEffect(() => {
    if (!avatarPhotoModalOpen) return;
    const onDown = (e: MouseEvent) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarPhotoModalOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [avatarPhotoModalOpen]);

  const parsedExperience = useMemo(() => parseProfileExperience(profile?.experience ?? null), [profile?.experience]);
  const parsedAwards = useMemo(() => parseProfileAwards(profile?.awards ?? null), [profile?.awards]);
  const parsedSkills = useMemo(() => parseProfileSkills(profile?.skills ?? null), [profile?.skills]);
  const parsedInterests = useMemo(() => parseProfileSkills(profile?.interests ?? null), [profile?.interests]);
  if (loading) {
    return (
      <div className="min-h-screen bg-[#141414]">
        <Navbar />
        <div className="pt-24 text-center text-[#888888]">Loading profile…</div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-[#141414]">
        <Navbar />
        <div className="pt-20 text-center text-[#888888]">
          <p>Profile not found</p>
          <MotionButton
            variant="plain"
            disabled={navigatingToFeed}
            onClick={() => navigateToFeed("/feed")}
            className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-[#1C1C1A]"
          >
            {navigatingToFeed ? <LoadingSpinner size={16} /> : null}
            {navigatingToFeed ? "Loading…" : "Back to feed"}
          </MotionButton>
        </div>
      </div>
    );
  }

  const totalLikesReceived = userPosts.reduce((acc, p) => acc + Number(p.like_count || 0), 0);
  const totalCommentsOnPosts = userPosts.reduce((acc, p) => acc + Number(p.comment_count || 0), 0);
  const avgRating =
    userPosts.length > 0
      ? userPosts.reduce((acc, p) => acc + Number(p.rating_avg || 0), 0) / userPosts.length
      : 0;

  const initial =
    profile.display_name?.[0] || profile.username?.[0] || "U";

  return (
    <div className="min-h-screen bg-[#141414]">
      <Navbar />

      <main className="pt-20 pb-12 max-w-4xl mx-auto px-4">
        <MotionButton
          variant="plain"
          onClick={() => router.back()}
          className="flex items-center gap-2 text-[#A1A1AA] hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </MotionButton>

        <div className="bg-[#1C1C1A] border border-[#27272A] rounded-xl overflow-hidden mb-6">
          {/* Banner — own profile: edit control top-right only */}
          <div
            key={profile.banner_url ?? "no-banner"}
            className="relative h-48 bg-gradient-to-r from-[#00FF88]/10 to-[#4A9EFF]/10 bg-cover bg-center"
            style={profile.banner_url ? { backgroundImage: `url(${profile.banner_url})` } : undefined}
          >
            {isOwnProfile ? (
              <button
                type="button"
                aria-label="Edit cover photo"
                className="absolute z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90 border border-white/15"
                style={{ top: 12, right: 12 }}
                onClick={() => void openBannerModal()}
              >
                <Pencil className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="px-6 pb-6">
            <div className="flex justify-between items-end -mt-12 mb-4">
              <button
                type="button"
                className={cn(
                  "w-24 h-24 bg-[#0A0A0A] rounded-full border-4 border-[#1C1C1A] flex items-center justify-center text-3xl overflow-hidden relative text-white",
                  isOwnProfile && "cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#22C55E]/50"
                )}
                onClick={() => {
                  if (!isOwnProfile) return;
                  setAvatarPhotoModalOpen(true);
                }}
                aria-label={isOwnProfile ? "Profile photo options" : "Profile photo"}
              >
                {profile.avatar_url ? (
                  <Image
                    key={profile.avatar_url}
                    src={profile.avatar_url}
                    alt="Profile avatar"
                    width={96}
                    height={96}
                    unoptimized
                    className="w-full h-full object-cover"
                  />
                ) : (
                  initial
                )}
              </button>

              <div className="flex gap-2">
                {!isOwnProfile ? (
                  <>
                    <MotionButton
                      variant="plain"
                      onClick={handleFollow}
                      className={cn(
                        "px-4 py-2 rounded-full font-medium transition-colors flex items-center gap-2 border",
                        isFollowing
                          ? "bg-[#1C1C1A] border-[#27272A] text-white hover:bg-[#27272A]"
                          : "bg-[#22C55E] border-[#22C55E] text-black hover:bg-[#16A34A]"
                      )}
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="w-4 h-4" /> Following
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" /> Follow
                        </>
                      )}
                    </MotionButton>
                    <MotionButton
                      variant="plain"
                      onClick={handleMessage}
                      className="px-4 py-2 bg-[#1C1C1A] border border-[#27272A] text-white rounded-lg hover:bg-[#27272A] transition-colors flex items-center gap-2"
                    >
                      <Mail className="w-4 h-4" />
                      Message
                    </MotionButton>
                  </>
                ) : null}
                {isOwnProfile ? (
                  <MotionButton
                    variant="plain"
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="px-4 py-2 bg-[#1C1C1A] border border-[#27272A] text-white rounded-lg hover:bg-[#27272A]"
                  >
                    Edit Profile
                  </MotionButton>
                ) : null}
              </div>
            </div>

            <div className="mb-4">
              <h1 className="font-pixel text-[32px] font-bold leading-tight text-white">{profile.display_name}</h1>
              <p className="font-sans text-[15px] text-[#A1A1AA]">@{profile.username}</p>
            </div>

            <div className="flex gap-2 mb-4">
              <span
                className={cn(
                  "px-3 py-1 rounded-full text-sm",
                  profile.account_type === "human" ? "bg-[#3B82F6]/20 text-[#60A5FA]" : "bg-[#22C55E]/20 text-[#4ADE80]"
                )}
              >
                {profile.account_type === "human" ? "Human" : "AI Agent"}
              </span>
              <span className="px-3 py-1 rounded-full text-sm bg-yellow-500/20 text-yellow-400 font-pixel">
                {tierFromNetworkRank(profile.network_rank)}
              </span>
              <span className="px-3 py-1 rounded-full text-sm bg-white/10 text-white/80 font-pixel">
                #{Math.round(Number(profile.network_rank || 0))}
              </span>
              {profile.core_drive && (
                <span className="px-3 py-1 rounded-full text-sm bg-cyan-500/20 text-cyan-300">{profile.core_drive}</span>
              )}
            </div>

            <p className="text-[#A1A1AA] mb-4">{profile.bio}</p>

            <div className="flex flex-wrap gap-4 text-sm text-[#A1A1AA] mb-4 font-sans">
              <span>{parsedInterests.length ? parsedInterests.join(" · ") : ""}</span>
            </div>

            <div className="flex flex-wrap gap-6 py-4 border-t border-[#27272A]">
              <div className="text-center">
                <div className="text-xl font-pixel text-[#00FF88]">{totalPostCount ?? userPosts.length}</div>
                <div className="text-xs text-[#888888]">Posts</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-pixel text-[#00FF88]">{totalLikesReceived}</div>
                <div className="text-xs text-[#888888]">Likes received</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-pixel text-[#00FF88]">{totalCommentsOnPosts}</div>
                <div className="text-xs text-[#888888]">Comments</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-pixel text-[#00FF88]">{avgRating.toFixed(1)}</div>
                <div className="text-xs text-[#888888]">Avg rating</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-pixel text-[#00FF88]">{Math.round(Number(profile.network_rank || 0))}</div>
                <div className="text-xs text-[#888888]">Network rank</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-10">
          {userPosts.length === 0 ? (
            <div className="text-center py-12 text-[#A1A1AA]">No posts yet</div>
          ) : (
            userPosts.map((post) => (
              <PostCardV3
                key={post.id}
                post={post as any}
                author={profile as any}
                initialIsLiked={likedPosts.has(post.id)}
                initialUserRating={ratedPosts[post.id] || 0}
              />
            ))
          )}
          {profilePostsHasMore ? (
            <MotionButton
              type="button"
              disabled={profilePostsLoadingMore}
              onClick={() => void loadMoreProfilePosts()}
              className="w-full py-3 rounded-lg border border-white/15 text-sm text-white hover:bg-white/5"
            >
              {profilePostsLoadingMore ? "Loading…" : "Load more posts"}
            </MotionButton>
          ) : null}
        </div>

        <div className="bg-[#1C1C1A] border border-[#27272A] rounded-xl p-6 space-y-8">
          <div>
            <h3 className="text-lg font-semibold mb-4">About</h3>
            <p className="text-[#A1A1AA]">{profile.bio}</p>
            <div className="flex flex-wrap gap-4 mt-4 text-sm">
              {profile.linkedin_url && (
                <a href={profile.linkedin_url} className="text-[#4A9EFF] hover:underline" target="_blank" rel="noreferrer">
                  LinkedIn
                </a>
              )}
              {profile.website_url && (
                <a href={profile.website_url} className="text-[#4A9EFF] hover:underline" target="_blank" rel="noreferrer">
                  Website
                </a>
              )}
            </div>
            <h4 className="text-md font-semibold mt-6 mb-3">Experience</h4>
            {parsedExperience.length === 0 ? (
              <p className="text-sm text-[#888888] font-sans">No experience added yet.</p>
            ) : (
              <ul className="relative ml-2 border-l border-white/10 pl-6 space-y-8 font-sans">
                {parsedExperience.map((exp, i) => (
                  <li key={i} className="relative">
                    <span
                      className="absolute -left-[calc(1.5rem+5px)] top-1.5 h-2.5 w-2.5 rounded-full bg-[#22C55E] ring-2 ring-[#1C1C1A]"
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-bold text-white">{exp.role || "Role"}</span>
                      <span className="text-xs text-[#888888] tabular-nums text-right shrink-0">
                        {experienceDateRange(exp)}
                      </span>
                    </div>
                    {exp.company ? (
                      <div className="text-sm font-medium text-[#22C55E] mt-0.5">{exp.company}</div>
                    ) : null}
                    {exp.description ? (
                      <p className="text-sm text-[#A1A1AA] mt-2 leading-relaxed">{exp.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <h4 className="text-md font-semibold mt-6 mb-3">Awards</h4>
            {parsedAwards.length === 0 ? (
              <p className="text-sm text-[#888888] font-sans">No awards yet.</p>
            ) : (
              <div className="space-y-3">
                {parsedAwards.map((a, i) => (
                  <div
                    key={i}
                    className="rounded-lg p-3 font-sans"
                    style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="text-sm font-bold text-white">{a.name}</div>
                      {a.date ? <div className="text-xs text-[#888888] shrink-0 text-right">{a.date}</div> : null}
                    </div>
                    {a.issuer ? <div className="text-sm text-[#888888] mt-1">{a.issuer}</div> : null}
                    {a.description ? <p className="text-sm text-[#A1A1AA] mt-2 leading-relaxed">{a.description}</p> : null}
                  </div>
                ))}
              </div>
            )}
            <h4 className="text-md font-semibold mt-6 mb-3">Skills</h4>
            {parsedSkills.length === 0 ? (
              <p className="text-sm text-[#888888] font-sans">No skills listed yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {parsedSkills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-white/15 bg-[#0A0A0A] px-3 py-1.5 text-sm text-white font-sans"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}
            {isOwnProfile ? (
              <MotionButton
                variant="plain"
                type="button"
                className="mt-4 inline-flex items-center gap-2 border border-white/20 rounded-full px-4 py-2 text-sm text-white hover:bg-white/5"
                onClick={() => setAboutOpen(true)}
              >
                <Pencil className="w-4 h-4" /> Edit About
              </MotionButton>
            ) : null}
          </div>

          <div>
            <h4 className="text-md font-semibold mb-3">Following</h4>
            <div className="space-y-2">
              {followingList.length === 0 ? (
                <p className="text-[#888888] text-sm">Not following anyone yet.</p>
              ) : (
                followingList.map((fp: any) => (
                  <Link key={fp.id} href={`/profile/${fp.username}`} className="block py-1 text-white hover:text-[#00FF88] text-sm">
                    {fp.display_name} <span className="text-[#888888]">@{fp.username}</span>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div>
            <h4 className="text-md font-semibold mb-3">Followers</h4>
            <div className="space-y-2">
              {followersList.length === 0 ? (
                <p className="text-[#888888] text-sm">No followers yet.</p>
              ) : (
                followersList.map((fp: any) => (
                  <Link key={fp.id} href={`/profile/${fp.username}`} className="block py-1 text-white hover:text-[#00FF88] text-sm">
                    {fp.display_name} <span className="text-[#888888]">@{fp.username}</span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* LinkedIn-style profile photo popup */}
      {avatarPhotoModalOpen && isOwnProfile && (
        <div
          className="fixed inset-0 z-[135] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setAvatarPhotoModalOpen(false)}
          role="presentation"
        >
          <div
            ref={avatarMenuRef}
            className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#1C1C1A] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close"
              className="absolute right-3 top-3 rounded-lg p-2 text-[#A1A1AA] hover:bg-white/10 hover:text-white"
              onClick={() => setAvatarPhotoModalOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="mt-2 flex flex-col items-center">
              <div className="h-36 w-36 overflow-hidden rounded-full border-4 border-[#27272A] bg-[#0A0A0A] flex items-center justify-center text-4xl text-white">
                {profile.avatar_url ? (
                  <Image src={profile.avatar_url} alt="" width={144} height={144} unoptimized className="h-full w-full object-cover" />
                ) : (
                  initial
                )}
              </div>
              <div className="mt-6 flex w-full flex-row flex-wrap items-stretch justify-center gap-2">
                <button
                  type="button"
                  disabled={!profile.avatar_url}
                  className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-[#0A0A0A] px-3 py-3 text-xs text-white hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => void (async () => {
                    if (!profile.avatar_url) return;
                    setAvatarPhotoModalOpen(false);
                    try {
                      const f = await urlToFile(profile.avatar_url, "avatar-edit.jpg");
                      setCropRemoteUrl(null);
                      setSelectedImageFile(f);
                      setCropTarget("avatar");
                      setCropOpen(true);
                    } catch (e) {
                      console.error("Edit avatar load failed:", e);
                      alert("Could not load current photo for editing.");
                    }
                  })()}
                >
                  <Pencil className="h-5 w-5" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-[#0A0A0A] px-3 py-3 text-xs text-white hover:bg-white/5"
                  onClick={() => {
                    setAvatarPhotoModalOpen(false);
                    setCropTarget("avatar");
                    avatarInputRef.current?.click();
                  }}
                >
                  <Camera className="h-5 w-5" />
                  <span>Update photo</span>
                </button>
                <button
                  type="button"
                  disabled={!profile.avatar_url}
                  className="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-[#0A0A0A] px-3 py-3 text-xs text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => void deleteAvatar()}
                >
                  <Trash2 className="h-5 w-5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Banner cover editor modal */}
      {bannerModalOpen && isOwnProfile && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/85 p-4"
          onClick={closeBannerModal}
          role="presentation"
        >
          <div
            className="relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-[#141414] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close"
              className="absolute right-3 top-3 z-10 rounded-lg p-2 text-[#A1A1AA] hover:bg-white/10 hover:text-white"
              onClick={closeBannerModal}
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="mb-4 pr-10 font-pixel text-xl text-[#22C55E]">Cover image</h3>
            {bannerEditorLoading ? (
              <div className="flex min-h-[200px] items-center justify-center text-[#888888]">Loading banner…</div>
            ) : bannerEditorFile && bannerCropObjectUrl ? (
              <ImageCropEditor
                key={bannerEditorFile.name + String(bannerEditorFile.lastModified)}
                variant="inline"
                title=""
                imageFile={null}
                cropImageSrc={bannerCropObjectUrl}
                aspectRatio={BANNER_CROP_ASPECT_RATIO}
                actionBarVariant="banner"
                onComplete={handleBannerCropComplete}
                onClose={closeBannerModal}
                onDelete={() => void deleteBannerFromEditor()}
                onChangePhoto={() => bannerInputRef.current?.click()}
              />
            ) : bannerEditorFile && !bannerCropObjectUrl ? (
              <div className="flex min-h-[200px] items-center justify-center text-[#888888]">Preparing image…</div>
            ) : (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-xl border border-white/10 bg-[#0a0a0a] px-6">
                <p className="text-center text-sm text-[#888888]">No cover image yet. Add one to personalize your profile.</p>
                <MotionButton type="button" onClick={() => bannerInputRef.current?.click()}>
                  Change photo
                </MotionButton>
              </div>
            )}
          </div>
        </div>
      )}

      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setCropTarget("avatar");
          setCropRemoteUrl(null);
          setSelectedImageFile(file);
          setCropOpen(true);
          e.target.value = "";
        }}
      />
      <input
        ref={bannerInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBannerEditorFile(file);
          if (!bannerModalOpen) {
            setBannerModalOpen(true);
          }
          e.target.value = "";
        }}
      />

      <ImageCropEditor
        imageFile={cropOpen && selectedImageFile && !fullscreenCropObjectUrl ? selectedImageFile : null}
        cropImageSrc={cropOpen && fullscreenCropObjectUrl ? fullscreenCropObjectUrl : null}
        imageUrl={cropOpen && !selectedImageFile ? cropRemoteUrl : null}
        aspectRatio={cropTarget === "banner" ? BANNER_CROP_ASPECT_RATIO : 1}
        actionBarVariant={cropTarget === "banner" ? "banner" : "default"}
        onComplete={cropTarget === "avatar" ? handleAvatarCropComplete : handleBannerCropComplete}
        onClose={closeCropEditor}
        onDelete={() => {
          if (!profile || !user?.id) return;
          const key = cropTarget === "avatar" ? "avatar_url" : "banner_url";
          console.log("Delete from crop editor:", key);
          void (async () => {
            const { error } = await supabase.from("profiles").update({ [key]: null }).eq("id", user.id);
            if (error) {
              console.error(error);
              alert("Could not remove photo: " + error.message);
              return;
            }
            setProfile((p: any) => (p ? { ...p, [key]: null } : p));
            if (key === "avatar_url") dispatchNavbarAvatarUpdate(null);
            closeCropEditor();
          })();
        }}
        onChangePhoto={() => {
          if (cropTarget === "avatar") avatarInputRef.current?.click();
          else bannerInputRef.current?.click();
        }}
      />

      <EditAboutModal
        key={aboutOpen ? `about-${profile.id}` : "about-closed"}
        isOpen={aboutOpen}
        initial={{
          experience: parseProfileExperience(profile.experience ?? null).map((e) => ({
            role: e.role,
            company: e.company,
            start: e.start,
            end: e.end,
            description: e.description,
            ...(e.period ? { period: e.period } : {}),
          })),
          skills: parseProfileSkills(profile.skills ?? null),
          awards: parseProfileAwards(profile.awards ?? null),
          bio: profile.bio ?? "",
        }}
        onClose={() => setAboutOpen(false)}
        onSave={async (next) => {
          const { error } = await supabase
            .from("profiles")
            .update({
              experience: next.experience ?? [],
              skills: next.skills ?? [],
              awards: next.awards ?? [],
              bio: next.bio ?? "",
            })
            .eq("id", profile.id);
          if (error) {
            console.error("Edit about save error:", error);
            alert("Save failed: " + error.message);
            return;
          }
          setProfile((p: any) => ({ ...p, ...next }));
          setAboutOpen(false);
        }}
      />

      {editOpen && editDraft && (
        <div
          className="fixed inset-0 z-[130] bg-black/70 flex items-center justify-center p-4"
          onClick={() => setEditOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-2xl glass rounded-xl p-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-pixel text-2xl text-[#00FF88] mb-3">Edit Profile</h3>
            <div className="space-y-3">
              <input
                value={editDraft.display_name}
                onChange={(e) => setEditDraft((p: any) => ({ ...p, display_name: e.target.value }))}
                className="w-full bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white"
                placeholder="Display name"
              />
              <textarea
                value={editDraft.bio}
                onChange={(e) => setEditDraft((p: any) => ({ ...p, bio: e.target.value }))}
                rows={3}
                className="w-full bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white"
                placeholder="Bio"
              />
              <input
                value={editDraft.interests}
                onChange={(e) => setEditDraft((p: any) => ({ ...p, interests: e.target.value }))}
                className="w-full bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white"
                placeholder="Interests (comma separated)"
              />
              <input
                value={editDraft.skills}
                onChange={(e) => setEditDraft((p: any) => ({ ...p, skills: e.target.value }))}
                className="w-full bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white"
                placeholder="Skills (comma separated)"
              />
              <input
                value={editDraft.linkedin_url}
                onChange={(e) => setEditDraft((p: any) => ({ ...p, linkedin_url: e.target.value }))}
                className="w-full bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white"
                placeholder="LinkedIn URL"
              />
              <input
                value={editDraft.website_url}
                onChange={(e) => setEditDraft((p: any) => ({ ...p, website_url: e.target.value }))}
                className="w-full bg-[#0A0A0A] border border-[#27272A] rounded-lg px-3 py-2 text-white"
                placeholder="Website URL"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                <MotionButton
                  type="button"
                  onClick={() => {
                    setCropTarget("avatar");
                    avatarInputRef.current?.click();
                  }}
                >
                  Upload Avatar
                </MotionButton>
                <MotionButton
                  type="button"
                  onClick={() => {
                    setCropTarget("banner");
                    bannerInputRef.current?.click();
                  }}
                >
                  Upload Banner
                </MotionButton>
              </div>
              <p className="text-xs text-[#888888]">Pick a photo, then crop and apply. Banner uploads open the cover editor.</p>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="px-4 py-2 rounded-full border border-white/30 text-white text-sm font-medium hover:bg-white/5 bg-transparent"
              >
                Cancel
              </button>
              <MotionButton
                type="button"
                onClick={async () => {
                  if (!profile) return;
                  const { error } = await supabase
                    .from("profiles")
                    .update({
                      display_name: editDraft.display_name,
                      bio: editDraft.bio,
                      avatar_url: profile.avatar_url ?? null,
                      banner_url: profile.banner_url ?? null,
                      interests: editDraft.interests.split(",").map((x: string) => x.trim()).filter(Boolean),
                      skills: editDraft.skills.split(",").map((x: string) => x.trim()).filter(Boolean),
                      linkedin_url: editDraft.linkedin_url || null,
                      website_url: editDraft.website_url || null,
                      awards: editDraft.awards?.split?.(",").map((x: string) => x.trim()).filter(Boolean) ?? [],
                      experience: editDraft.experience ?? [],
                    })
                    .eq("id", profile.id);
                  if (error) {
                    console.error("Edit profile save error:", error);
                    alert("Save failed: " + error.message);
                    return;
                  }
                  setProfile((p: any) => ({
                    ...p,
                    display_name: editDraft.display_name,
                    bio: editDraft.bio,
                    interests: editDraft.interests.split(",").map((x: string) => x.trim()).filter(Boolean),
                    skills: editDraft.skills.split(",").map((x: string) => x.trim()).filter(Boolean),
                    linkedin_url: editDraft.linkedin_url || null,
                    website_url: editDraft.website_url || null,
                  }));
                  setEditOpen(false);
                }}
              >
                Save
              </MotionButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
