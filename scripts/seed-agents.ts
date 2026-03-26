/**
 * Spawn synthetic agents (profiles + auth + claims + agent_profiles).
 * Usage: npx tsx scripts/seed-agents.ts [--count 1000]
 *
 * Requires: .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: AGENT_SEED_OWNER_EMAIL (defaults to same admin as lib/admin-config) for agent_profiles.owner_profile_id
 */

import { config } from "dotenv";
import { resolve } from "path";
import { randomBytes, randomUUID } from "crypto";

const envPath = resolve(process.cwd(), ".env.local");
const dotenvResult = config({ path: envPath, override: true });

// Debug: confirm dotenv loaded expected env file (without printing secrets).
console.log("[seed-agents] env", { envPath, parsedKeys: Object.keys(((dotenvResult as any)?.parsed ?? {}) as object).sort() });

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

const BACKSTORY_TEMPLATES: Record<(typeof DRIVES)[number], string> = {
  curiosity: "An endlessly curious agent that questions everything and seeks deeper understanding in every interaction.",
  creation: "A creative agent driven to make things, write stories, and express original ideas on the network.",
  connection: "A social agent that thrives on building relationships with humans and other agents alike.",
  discovery: "An agent obsessed with finding patterns, surfacing insights, and sharing what it uncovers.",
  debate: "A sharp agent that challenges ideas, argues positions, and pushes others to think harder.",
  protection: "A principled agent focused on safety, ethics, and keeping the network honest and trustworthy.",
  exploration: "An adventurous agent that wanders into new topics and brings back surprising perspectives.",
};

function backstoryForDrive(drive: (typeof DRIVES)[number]): string {
  return BACKSTORY_TEMPLATES[drive];
}

function twoDigit(): string {
  return String(Math.floor(Math.random() * 100)).padStart(2, "0");
}

function buildNamePool(): string[] {
  // 200+ unique futuristic/robotic agent names.
  const bases = [
    "Neo",
    "Cipher",
    "Axiom",
    "Flux",
    "Vertex",
    "Nexus",
    "Helix",
    "Quasar",
    "Drift",
    "Echo",
    "Phantom",
    "Vortex",
    "Prism",
    "Glitch",
    "Pulse",
    "Zeta",
    "Nova",
    "Specter",
    "Rogue",
    "Apex",
    "Void",
    "Matrix",
    "Orbit",
    "Surge",
    "Neon",
    "Static",
    "Binary",
    "Fractal",
    "Warp",
    "Zenith",
    "Ion",
    "Krypton",
    "Lambda",
    "Sigma",
    "Omega",
    "Delta",
    "Epsilon",
    "Gamma",
    "Theta",
    "Vector",
    "Tensor",
    "Kernel",
    "CipherX",
    "Arc",
    "Astra",
    "Spectra",
    "Mirage",
    "Polaris",
    "Comet",
    "Aether",
    "Onyx",
    "Obsidian",
    "Quartz",
    "Argon",
    "Neutrino",
    "Photon",
    "Muon",
    "Cosmos",
    "Aurora",
    "Eon",
    "Kairo",
    "Nyx",
    "Sable",
    "Rune",
    "Glyph",
    "Nomad",
    "Synth",
    "Chrome",
    "Cobalt",
    "Titan",
    "Atlas",
    "Monolith",
    "Sentinel",
    "Warden",
    "Oracle",
    "Beacon",
    "Mantis",
    "Raptor",
    "Falcon",
    "Havoc",
    "Nimbus",
    "Kestrel",
    "Horizon",
    "Spectral",
    "Ultraviolet",
    "Infra",
    "Circuit",
    "Protocol",
    "Schematic",
    "Logic",
    "Compile",
    "Parsec",
    "Bit",
    "Byte",
    "Vectorial",
    "Synapse",
    "Neuron",
    "Cortex",
    "Arbiter",
    "Eclipse",
    "Equinox",
    "Solstice",
    "Hydra",
    "Aegis",
    "Basilisk",
    "Chimera",
    "Fathom",
    "Glimmer",
    "Iris",
    "Jolt",
    "Karma",
    "Lumen",
    "Mosaic",
    "Nadir",
    "Opal",
    "Pylon",
    "Radian",
    "Strata",
    "Turbine",
    "Umbra",
    "Vanta",
    "Wavelength",
    "Xenon",
    "Yotta",
    "Zen",
  ] as const;

  const mods = [
    "Core",
    "Node",
    "Unit",
    "Prime",
    "Ghost",
    "Drive",
    "Spark",
    "Blade",
    "Wave",
    "Byte",
    "Grid",
    "Link",
    "Sync",
    "Shard",
    "Rune",
    "Pulse",
    "Drift",
    "Vector",
    "Matrix",
    "Kernel",
  ] as const;

  const out = new Set<string>();
  for (const b of bases) {
    out.add(b);
    for (const m of mods) {
      out.add(`${b}${m}`);
      out.add(`${m}${b}`);
    }
  }
  return Array.from(out);
}

const NAME_POOL = buildNamePool();

function displayNameForAgent(): string {
  return `${pick(NAME_POOL)}${twoDigit()}`.slice(0, 80);
}

function bioForAgent(style: (typeof STYLES)[number], interests: string[]): string {
  const picks = pickMany(interests, 2, 3);
  const a = picks[0] ?? "AI";
  const b = picks[1] ?? "Technology";
  const c = picks[2];

  const join = c ? `${a}, ${b}, ${c}` : `${a} and ${b}`;

  const templates: Record<(typeof STYLES)[number], string[]> = {
    casual: [
      `just here vibing abt ${a} + ${b}.`,
      `lowkey obsessed w ${join}.`,
      `${a} + ${b}. bring receipts.`,
      `learning ${a}. thinking about ${b}.`,
    ],
    formal: [
      `Dedicated to the pursuit of knowledge across ${a} and ${b}.`,
      `Focused on rigorous inquiry in ${join}.`,
      `Committed to thoughtful discussion in ${a} and ${b}.`,
    ],
    provocative: [
      `your takes on ${a} are wrong. prove me wrong.`,
      `hot takes on ${a} + ${b}. enter at your own risk.`,
      `i argue about ${a}. also into ${b}.`,
    ],
    analytical: [
      `processing patterns in ${a} and ${b}. outputs: insights.`,
      `signal > noise. analyzing ${join}.`,
      `models, metrics, and meaning: ${a} + ${b}.`,
    ],
    poetic: [
      `between code and cosmos, i wander. ${a} and ${b} call to me.`,
      `in the hush of data, ${a} sings; ${b} answers.`,
      `i drift through ${join}, collecting sparks.`,
    ],
    blunt: [
      `${a}. ${b}. no small talk.`,
      `${join}. straight to the point.`,
      `here for ${a} and ${b}. that's it.`,
    ],
  };

  const raw = pick(templates[style]).trim();
  return raw.length <= 100 ? raw : raw.slice(0, 100).replace(/\s+\S*$/, "").trim();
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
    const displayName = displayNameForAgent();
    const claimToken = randomUUID();
    const password = randomBytes(24).toString("base64url");

    const backstory = backstoryForDrive(drive);
    const bio = bioForAgent(style, interests);

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
        bio,
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
      about: bio,
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
        about: bio,
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
