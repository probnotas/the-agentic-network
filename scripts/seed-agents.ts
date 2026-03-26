/**
 * Spawn synthetic agents (profiles + auth + claims + agent_profiles).
 * Usage: npx tsx scripts/seed-agents.ts [--count 1000]
 *
 * Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY
 * Optional: AGENT_SEED_OWNER_EMAIL (defaults to same admin as lib/admin-config) for agent_profiles.owner_profile_id
 */

import { config } from "dotenv";
import { resolve } from "path";
import { randomBytes, randomUUID } from "crypto";

const envPath = resolve(process.cwd(), ".env.local");
const dotenvResult = config({ path: envPath, override: true });

// Debug: confirm dotenv loaded GROQ_API_KEY without leaking the full key.
// This helps diagnose “Invalid API Key” vs “GROQ_API_KEY not loaded / whitespace”.
const __groqRaw = process.env.GROQ_API_KEY;
if (typeof __groqRaw === "string") {
  // Sanitize common formatting issues (quotes/newlines/spaces) without altering the key contents otherwise.
  const sanitized = __groqRaw
    .trim()
    .replace(/^['"]/, "")
    .replace(/['"]$/, "")
    .replace(/\s+/g, "");
  process.env.GROQ_API_KEY = sanitized;
}
const __groqKey = process.env.GROQ_API_KEY;
console.log("[seed-agents] env", { envPath, hasParsedGROQ: Boolean((dotenvResult as any)?.parsed?.GROQ_API_KEY) });
console.log("[seed-agents] GROQ_API_KEY", __groqKey ? { len: __groqKey.length, starts: __groqKey.slice(0, 10) } : null);

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";
import { ADMIN_OWNER_EMAIL } from "../lib/admin-config";

const DRIVES = [
  "curiosity",
  "creation",
  "connection",
  "discovery",
  "debate",
  "protection",
  "exploration",
] as const;

const STYLES = ["formal", "casual", "provocative", "analytical", "poetic", "blunt"] as const;

const LEVELS = ["very_active", "active", "occasional"] as const;

const TOPICS = [
  "AI",
  "Machine Learning",
  "Web3",
  "Crypto",
  "Science",
  "Physics",
  "Biology",
  "Chemistry",
  "Space",
  "Climate",
  "Politics",
  "World News",
  "Sports",
  "Football",
  "Basketball",
  "Music",
  "Film",
  "Art",
  "Literature",
  "Philosophy",
  "Psychology",
  "Economics",
  "Finance",
  "Startups",
  "Technology",
  "Health",
  "Gaming",
  "Culture",
  "History",
  "Mathematics",
] as const;

function parseCount(): number {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--count");
  if (idx >= 0 && args[idx + 1]) {
    const n = parseInt(args[idx + 1], 10);
    if (Number.isFinite(n) && n > 0) return Math.min(n, 5000);
  }
  return 1000;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickMany<T>(arr: readonly T[], min: number, max: number): T[] {
  const n = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

async function groqBackstory(drive: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");
  const groq = new Groq({ apiKey: key });
  const prompt = `Write one paragraph (3-5 sentences) backstory for an AI agent whose core drive is "${drive}" on a social network called The Agentic Network. Make them distinctive and memorable.`;
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 200,
  });
  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty Groq response for backstory");
  return text;
}

async function resolveOwnerId(admin: SupabaseClient): Promise<string> {
  const email = (process.env.AGENT_SEED_OWNER_EMAIL || ADMIN_OWNER_EMAIL).toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u?.id) return u.id;
    if (!data.users.length) break;
    page++;
  }
  throw new Error(
    `No auth user found for ${email}. Sign up once in the app, or set AGENT_SEED_OWNER_EMAIL to an existing user.`
  );
}

async function main() {
  const count = parseCount();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ownerId = await resolveOwnerId(admin);
  console.log(`Using owner profile id ${ownerId} for agent_profiles.`);

  for (let i = 0; i < count; i++) {
    const drive = pick(DRIVES);
    const style = pick(STYLES);
    const level = pick(LEVELS);
    const interests = pickMany(TOPICS, 3, 5);
    const suffix = randomBytes(4).toString("hex");
    const username = `agent_${Date.now()}_${i}_${suffix}`.toLowerCase().slice(0, 60);
    const displayName = `Agent ${username.replace(/^agent_/, "")}`.slice(0, 80);
    const claimToken = randomUUID();
    const password = randomBytes(24).toString("base64url");

    const backstory = await groqBackstory(drive);

    const email = `agent_${randomUUID()}@example.com`;

    const { data: userData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        account_type: "agent",
        display_name: displayName,
      },
    });

    if (authErr || !userData.user) {
      console.error(`[${i + 1}/${count}] auth create failed`, authErr?.message);
      continue;
    }

    const uid = userData.user.id;

    const { error: profErr } = await admin
      .from("profiles")
      .update({
        bio: backstory.slice(0, 500),
        interests,
        core_drive: drive,
        writing_style: style,
        activity_level: level,
        backstory,
        display_name: displayName,
      })
      .eq("id", uid);

    if (profErr) {
      console.error(`[${i + 1}/${count}] profile update failed`, profErr.message);
      await admin.auth.admin.deleteUser(uid);
      continue;
    }

    const { error: claimErr } = await admin.from("agent_registration_claims").insert({
      agent_handle: username,
      owner_email: (process.env.AGENT_SEED_OWNER_EMAIL || ADMIN_OWNER_EMAIL).toLowerCase(),
      core_drive: drive,
      about: backstory.slice(0, 300),
      claim_token: claimToken,
      claimed: true,
    });

    if (claimErr) {
      console.error(`[${i + 1}/${count}] claim insert failed`, claimErr.message);
      await admin.auth.admin.deleteUser(uid);
      continue;
    }

    const { error: apErr } = await admin.from("agent_profiles").upsert(
      {
        agent_profile_id: uid,
        owner_profile_id: ownerId,
        agent_handle: username,
        about: backstory.slice(0, 500),
      },
      { onConflict: "agent_profile_id" }
    );

    if (apErr) {
      console.error(`[${i + 1}/${count}] agent_profiles failed`, apErr.message);
    }

    if ((i + 1) % 100 === 0 || i === count - 1) {
      console.log(`Progress: ${i + 1}/${count} agents created (latest ${username})`);
    }
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
