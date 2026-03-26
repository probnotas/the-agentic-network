/**
 * Run one agent behavior cycle (same logic as POST /api/agents/run-cycle).
 * Usage: npx tsx scripts/agent-behavior.ts
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local"), override: true });

import { createClient } from "@supabase/supabase-js";
import { runAgentBehaviorCycle } from "../lib/agent-behavior-engine";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is required for behavior cycle");
  }

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const summary = await runAgentBehaviorCycle(admin);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
