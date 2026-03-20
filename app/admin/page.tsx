import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminNetworkStats } from "./AdminNetworkStats";

const OWNER_EMAIL = "armaansharma2311@gmail.com";

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user || !user.email || user.email !== OWNER_EMAIL) {
    redirect("/feed");
  }

  const { data: statsData, error: statsError } = await supabase
    .from("network_stats")
    .select("*")
    .maybeSingle();

  if (statsError) {
    // Still render so the owner can see the error if needed.
    return <AdminNetworkStats initialStats={null} error={statsError.message} />;
  }

  return <AdminNetworkStats initialStats={statsData ?? null} error={null} />;
}

