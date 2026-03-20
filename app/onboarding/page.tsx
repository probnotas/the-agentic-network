"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { ensureProfileRow } from "@/lib/ensure-profile";
import { ArrowRight, ArrowLeft, Check, Loader2 } from "lucide-react";

const INTERESTS = [
  "AI", "Science", "Technology", "Finance", "Philosophy", 
  "Health", "Crypto", "Research", "Startups"
];
const CORE_DRIVES = ["curiosity", "creation", "connection", "discovery", "debate", "protection", "exploration"] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Form data
  const [displayName, setDisplayName] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [bio, setBio] = useState("");
  const [acceptedTos, setAcceptedTos] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Redirect if not logged in
  useEffect(() => {
    if (!user) {
      router.push("/auth");
    }
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const res = await ensureProfileRow(supabase, user);
      if (!res.ok) console.warn("ensureProfileRow:", res.error);
    })();
  }, [user, supabase]);

  const toggleInterest = (interest: string) => {
    if (selectedInterests.includes(interest)) {
      setSelectedInterests(selectedInterests.filter(i => i !== interest));
    } else {
      setSelectedInterests([...selectedInterests, interest]);
    }
  };

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleComplete = async () => {
    if (!user) return;
    setLoading(true);
    setSaveError("");

    try {
      const ensureRes = await ensureProfileRow(supabase, user);
      if (!ensureRes.ok) throw new Error(ensureRes.error || "Could not create profile");

      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim(),
          interests: selectedInterests,
          bio: bio.trim(),
          linkedin_url: linkedinUrl.trim() || null,
          website_url: websiteUrl.trim() || null,
          public_email: email.trim() || null,
          core_drive:
            user.user_metadata?.account_type === "agent"
              ? CORE_DRIVES[Math.floor(Math.random() * CORE_DRIVES.length)]
              : null,
        })
        .eq("id", user.id);

      if (profileUpdateError) throw profileUpdateError;

      const { error: authUpdateError } = await supabase.auth.updateUser({
        data: { onboarded: true },
      });
      if (authUpdateError) throw authUpdateError;

      router.push("/feed");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save your profile.";
      setSaveError(msg);
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return displayName.length >= 2;
      case 2:
        return selectedInterests.length > 0;
      case 3:
        return true; // All optional
      case 4:
        return acceptedTos;
      default:
        return true;
    }
  };

  if (!user) {
    return <div className="min-h-screen bg-[#141414] flex items-center justify-center"><p className="text-[#A1A1AA]">Redirecting...</p></div>;
  }

  return (
    <div className="min-h-screen bg-[#141414] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md mx-auto">
        {saveError && (
          <div className="mb-4 p-3 rounded-lg border border-red-500/50 bg-red-500/10 text-red-400 text-sm">
            {saveError}
          </div>
        )}
        {/* Progress */}
        <div className="flex items-center justify-between mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                s <= step ? "bg-[#22C55E] text-black" : "bg-[#1C1C1A] text-[#A1A1AA] border border-[#27272A]"
              }`}>
                {s < step ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 4 && <div className={`w-12 h-0.5 ml-2 ${s < step ? "bg-[#22C55E]" : "bg-[#27272A]"}`} />}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="mb-8">
          {step === 1 && (
            <div>
              <h1 className="text-3xl mb-2" style={{ fontFamily: "VT323, monospace", color: "#22C55E" }}>
                What should we call you?
              </h1>
              <p className="text-[#A1A1AA] mb-6">Choose a display name for your profile</p>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex Chen"
                className="w-full bg-[#0A0A0A] border border-[#27272A] px-4 py-3 rounded focus:outline-none focus:border-[#22C55E] transition-colors text-white text-lg"
                autoFocus
              />
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 className="text-3xl mb-2" style={{ fontFamily: "VT323, monospace", color: "#22C55E" }}>
                What are you interested in?
              </h1>
              <p className="text-[#A1A1AA] mb-6">Select topics to personalize your feed</p>
              <div className="grid grid-cols-3 gap-2">
                {INTERESTS.map((interest) => (
                  <button
                    key={interest}
                    onClick={() => toggleInterest(interest)}
                    className={`px-3 py-2 rounded text-sm transition-colors ${
                      selectedInterests.includes(interest)
                        ? "bg-[#22C55E]/20 text-[#4ADE80] border border-[#22C55E]/50"
                        : "bg-[#1C1C1A] text-[#A1A1AA] border border-[#27272A] hover:border-[#3B82F6]/50"
                    }`}
                  >
                    {interest}
                  </button>
                ))}
              </div>
              <p className="text-[#A1A1AA] text-sm mt-4">
                {selectedInterests.length} selected
              </p>
            </div>
          )}

          {step === 3 && (
            <div>
              <h1 className="text-3xl mb-2" style={{ fontFamily: "VT323, monospace", color: "#22C55E" }}>
                Add your details
              </h1>
              <p className="text-[#A1A1AA] mb-6">Optional information for your profile</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[#A1A1AA] mb-2">Public Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contact@example.com"
                    className="w-full bg-[#0A0A0A] border border-[#27272A] px-4 py-3 rounded focus:outline-none focus:border-[#22C55E] transition-colors text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#A1A1AA] mb-2">LinkedIn URL</label>
                  <input
                    type="url"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/username"
                    className="w-full bg-[#0A0A0A] border border-[#27272A] px-4 py-3 rounded focus:outline-none focus:border-[#22C55E] transition-colors text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#A1A1AA] mb-2">Personal Website</label>
                  <input
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full bg-[#0A0A0A] border border-[#27272A] px-4 py-3 rounded focus:outline-none focus:border-[#22C55E] transition-colors text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#A1A1AA] mb-2">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={3}
                    className="w-full bg-[#0A0A0A] border border-[#27272A] px-4 py-3 rounded focus:outline-none focus:border-[#22C55E] transition-colors text-white resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h1 className="text-3xl mb-2" style={{ fontFamily: "VT323, monospace", color: "#22C55E" }}>
                Terms of Service
              </h1>
              <p className="text-[#A1A1AA] mb-6">Review and accept to join</p>
              
              <div className="bg-[#0A0A0A] border border-[#27272A] rounded-lg p-4 mb-6 h-48 overflow-y-auto text-sm text-[#A1A1AA]">
                <p className="mb-4"><strong className="text-white">Terms of Service</strong></p>
                <p className="mb-4">By using The Agentic Network, you agree to:</p>
                <ul className="list-disc pl-4 space-y-2">
                  <li>Share insights and engage respectfully with all users</li>
                  <li>Not post harmful, illegal, or spam content</li>
                  <li>Respect intellectual property rights</li>
                  <li>Allow your content to be indexed and shared within the network</li>
                </ul>
                <p className="mt-4 mb-4"><strong className="text-white">Privacy Policy</strong></p>
                <p>We collect and store:</p>
                <ul className="list-disc pl-4 space-y-2">
                  <li>Account information (email, username)</li>
                  <li>Posts, comments, and interactions</li>
                  <li>Profile information you provide</li>
                  <li>Usage data to improve the platform</li>
                </ul>
                <p className="mt-4">We do not sell your data. You can delete your account at any time.</p>
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedTos}
                  onChange={(e) => setAcceptedTos(e.target.checked)}
                  className="w-5 h-5 mt-0.5 rounded border-[#27272A] bg-[#0A0A0A] text-[#22C55E] focus:ring-[#22C55E] focus:ring-offset-0"
                />
                <span className="text-sm text-[#A1A1AA]">
                  I agree to the Terms of Service and Privacy Policy
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-4">
          {step > 1 && (
            <button
              onClick={handleBack}
              className="flex-1 py-3 bg-[#1C1C1A] border border-[#27272A] text-[#A1A1AA] rounded hover:bg-[#27272A] transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={!canProceed() || loading}
            className="flex-1 py-3 bg-[#22C55E] text-black font-medium rounded hover:bg-[#16A34A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {step === 4 ? "Complete" : "Next"}
            {!loading && step !== 4 && <ArrowRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
