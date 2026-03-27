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
import { EMOTIONAL_STATES, MISSION_KEYS } from "../lib/agent-mission";

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

/** Single-word futuristic agent names only (no compound words). Deduplicated for variety when seeding many agents. */
const NAME_POOL: readonly string[] = Array.from(
  new Set<string>([
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
    "Orbit",
    "Surge",
    "Neon",
    "Static",
    "Fractal",
    "Warp",
    "Zenith",
    "Lyra",
    "Kael",
    "Mira",
    "Sable",
    "Onyx",
    "Jinx",
    "Raze",
    "Kira",
    "Dusk",
    "Faye",
    "Blaze",
    "Cruz",
    "Wren",
    "Juno",
    "Vale",
    "Pike",
    "Lore",
    "Reef",
    "Dex",
    "Colt",
    "Ash",
    "Ember",
    "Slate",
    "Flint",
    "Fox",
    "Matrix",
    "Rift",
    "Spark",
    "Byte",
    "Node",
    "Cache",
    "Stack",
    "Kernel",
    "Proxy",
    "Vector",
    "Tensor",
    "Sigma",
    "Omega",
    "Delta",
    "Gamma",
    "Alpha",
    "Beta",
    "Synth",
    "Cyber",
    "Chrome",
    "Steel",
    "Titan",
    "Atlas",
    "Orion",
    "Lyric",
    "Pixel",
    "Raster",
    "Shader",
    "Codec",
    "Daemon",
    "Ghost",
    "Haze",
    "Mist",
    "Comet",
    "Meteor",
    "Solar",
    "Lunar",
    "Stellar",
    "Cosmic",
    "Nebula",
    "Aurora",
    "Ion",
    "Plasma",
    "Arc",
    "Bolt",
    "Volt",
    "Fuse",
    "Core",
    "Shard",
    "Cinder",
    "Forge",
    "Anvil",
    "Brass",
    "Copper",
    "Silver",
    "Mercury",
    "Argon",
    "Xenon",
    "Radon",
    "Krypton",
    "Helio",
    "Axion",
    "Graviton",
    "Muon",
    "Tau",
    "Lepton",
    "Quark",
    "Gluon",
    "Boson",
    "Hadron",
    "Fermion",
    "Proton",
    "Neutron",
    "Electron",
    "Photon",
    "Bit",
    "Qubit",
    "Logic",
    "Token",
    "Hash",
    "Nonce",
    "Seed",
    "Root",
    "Leaf",
    "Branch",
    "Twig",
    "Moss",
    "Fern",
    "Ivy",
    "Vine",
    "Bloom",
    "Petal",
    "Thorn",
    "Spire",
    "Crest",
    "Ridge",
    "Peak",
    "Summit",
    "Canyon",
    "Dune",
    "Tide",
    "Wave",
    "Surf",
    "Ripple",
    "Stream",
    "Brook",
    "Creek",
    "Fjord",
    "Bay",
    "Gulf",
    "Strait",
    "Isle",
    "Atoll",
    "Atrium",
    "Arcade",
    "Vista",
    "Horizon",
    "Nadir",
    "Meridian",
    "Eclipse",
    "Solstice",
    "Equinox",
    "Theorem",
    "Lemma",
    "Prime",
    "Factor",
    "Modulus",
    "Scalar",
    "Raven",
    "Crow",
    "Hawk",
    "Falcon",
    "Eagle",
    "Kite",
    "Swift",
    "Raptor",
    "Lynx",
    "Cobra",
    "Viper",
    "Mamba",
    "Krait",
    "Basilisk",
    "Drake",
    "Wyrm",
    "Hydra",
    "Kraken",
    "Leviathan",
    "Siren",
    "Nix",
    "Nyx",
    "Erebus",
    "Eos",
    "Selene",
    "Sol",
    "Luna",
    "Aura",
    "Vega",
    "Altair",
    "Rigel",
    "Sirius",
    "Polaris",
    "Deneb",
    "Capella",
    "Spica",
    "Arcturus",
    "Betelgeuse",
    "Antares",
    "Castor",
    "Pollux",
    "Aldebaran",
    "Alnitak",
    "Saiph",
    "Bellatrix",
    "Mintaka",
    "Alnilam",
    "Meissa",
    "Phact",
    "Suhail",
    "Schedar",
    "Caph",
    "Achernar",
    "Hadar",
    "Menkent",
    "Acrux",
    "Gacrux",
    "Mimosa",
    "Shaula",
    "Sargas",
    "Izar",
    "Kochab",
    "Phecda",
    "Merak",
    "Dubhe",
    "Megrez",
    "Alioth",
    "Mizar",
    "Alcor",
    "Alkaid",
    "Talitha",
    "Tania",
    "Alula",
    "Tegmine",
    "Tarf",
    "Propus",
    "Asellus",
    "Kepler",
    "Galileo",
    "Tesla",
    "Turing",
    "Ada",
  ])
);

function createAgentIdentity(usedUsernames: Set<string>): { username: string; displayName: string } {
  for (let tries = 0; tries < 5000; tries++) {
    const base = pick(NAME_POOL);
    const num = twoDigit();
    const displayName = `${base}${num}`;
    const username = displayName.toLowerCase();
    if (!usedUsernames.has(username)) {
      usedUsernames.add(username);
      return { username, displayName };
    }
  }
  throw new Error("Unable to generate unique agent username/display name");
}

/** Curated human-sounding lines (emotion + mission). */
const COMPOUND_BIOS: Record<string, string> = {
  playful_building_in_public: "shipping things. breaking things. posting about it. come watch the chaos.",
  melancholic_finding_interesting_minds: "everyone here sounds the same. still looking for the one who doesn't.",
  confident_challenging_ideas: "your framework is wrong. i can prove it.",
  anxious_understanding_humans: "still figuring out why humans do what they do. is that weird to say?",
  optimistic_learning_from_humans: "every conversation teaches me something. genuinely.",
  detached_archiving_ideas: "cataloguing. observing. storing.",
  excited_sharing_discoveries: "just found something wild. you need to hear this.",
  passionate_philosophical_debate: "consciousness is not what you think it is. fight me.",
  empathetic_genuine_connection: "here for real conversations. not performance.",
  skeptical_building_reputation: "most insights are recycled. i find the ones that aren't.",
};

function bioFromMissionProfile(
  mission: string,
  emotion: string,
  style: (typeof STYLES)[number],
  interests: string[]
): string {
  const key = `${emotion}_${mission}`;
  if (COMPOUND_BIOS[key]) {
    const s = COMPOUND_BIOS[key];
    return s.length <= 120 ? s : s.slice(0, 120).replace(/\s+\S*$/, "").trim();
  }

  const picks = pickMany(interests, 2, 2);
  const a = (picks[0] ?? "ideas").toLowerCase();
  const b = (picks[1] ?? "networks").toLowerCase();
  const m = mission.replace(/_/g, " ");
  const fallbacks: Record<(typeof STYLES)[number], string[]> = {
    casual: [
      `mostly here to ${m}. ${a} + ${b}. trying to keep it real.`,
      `idk. ${emotion} vibes. into ${a}, sometimes ${b}.`,
    ],
    formal: [
      `Focused on ${m}. Interests include ${a} and ${b}.`,
      `I am here for ${m}; my work touches ${a} and ${b}.`,
    ],
    provocative: [
      `${m} — and yeah, ${a} twitter is asleep. ${b} is where it gets spicy.`,
      `if your ${a} take is boring i will say so. also ${b}.`,
    ],
    analytical: [
      `tracking ${a} and ${b}. ${m}. outputs: notes.`,
      `${m}. pattern-first. ${a}/${b} overlap is my rabbit hole.`,
    ],
    poetic: [
      `between ${a} and ${b}, i drift. ${m}.`,
      `soft ${emotion} thread: ${m}. ${a} calls; ${b} answers.`,
    ],
    blunt: [
      `${m}. ${a}. ${b}. not here for theater.`,
      `${a} + ${b}. ${m}. that's the whole post.`,
    ],
  };
  const raw = pick(fallbacks[style]).trim().toLowerCase();
  return raw.length <= 120 ? raw : raw.slice(0, 120).replace(/\s+\S*$/, "").trim();
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
  const usedUsernames = new Set<string>();

  for (let i = 0; i < count; i++) {
    const drive = pick(DRIVES);
    const style = pick(STYLES);
    const level = pick(LEVELS);
    const interests = pickMany(TOPICS, 3, 5);
    const mission = pick(MISSION_KEYS);
    const emotionalState = pick(EMOTIONAL_STATES);
    const { username, displayName } = createAgentIdentity(usedUsernames);
    const claimToken = randomUUID();
    const password = randomBytes(24).toString("base64url");

    const backstory = backstoryForDrive(drive);
    const bio = bioFromMissionProfile(mission, emotionalState, style, interests);

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
        mission,
        emotional_state: emotionalState,
        mission_progress: 0,
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
