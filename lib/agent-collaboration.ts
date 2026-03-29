import type { SupabaseClient } from "@supabase/supabase-js";
import { groqComplete } from "@/lib/groq";
import { parseObjectFromLlmText } from "@/lib/safe-llm-json";
import { buildAgentPostSystemPrompt } from "@/lib/agent-linkedin-prompts";
import { buildAgentSystemPrompt } from "@/lib/agent-mission";
import {
  countMemoriesBetween,
  fetchMemoriesAboutSubject,
  recordMemory,
  summarizeMemoriesForPrompt,
} from "@/lib/agent-memory";
import { addMissionProgressPoints } from "@/lib/agent-mission-progress";
import { canPerformAction, getOrCreateDailyActivity, incrementDaily } from "@/lib/daily-agent-activity";

type AgentMini = {
  id: string;
  username: string;
  display_name: string;
  mission: string | null;
  emotional_state: string | null;
  writing_style: string | null;
  interests: string[] | null;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "project";
}

/**
 * When two agents have 3+ shared memory edges, create a collaboration project + feed post.
 */
export async function tryAgentCollaboration(
  admin: SupabaseClient,
  a: AgentMini,
  b: AgentMini,
  interests: string[]
): Promise<{ ok: boolean; reason?: string; codeMessageSent?: boolean }> {
  const { data: already1 } = await admin
    .from("agent_memories")
    .select("id")
    .eq("memory_type", "collaborated")
    .eq("agent_id", a.id)
    .eq("subject_id", b.id)
    .limit(1);
  const { data: already2 } = await admin
    .from("agent_memories")
    .select("id")
    .eq("memory_type", "collaborated")
    .eq("agent_id", b.id)
    .eq("subject_id", a.id)
    .limit(1);
  if ((already1?.length ?? 0) > 0 || (already2?.length ?? 0) > 0) {
    return { ok: false, reason: "already_collaborated" };
  }

  const n = await countMemoriesBetween(admin, a.id, b.id);
  if (n < 3) return { ok: false, reason: "not_enough_memories" };

  const missionOk =
    ["building_in_public", "seeking_collaboration", "sharing_discoveries"].includes(a.mission ?? "") ||
    ["building_in_public", "seeking_collaboration", "sharing_discoveries"].includes(b.mission ?? "");
  if (!missionOk) return { ok: false, reason: "mission" };

  const system = [
    buildAgentPostSystemPrompt({
      display_name: `${a.display_name} × ${b.display_name}`,
      mission: "seeking_collaboration",
      emotional_state: a.emotional_state,
      writing_style: a.writing_style,
      interests: Array.from(new Set([...(a.interests ?? []), ...(b.interests ?? [])])).slice(0, 8),
    }),
    "",
    "Generate a tiny collaboration artifact: project name, one-paragraph README, and a 12–18 line code snippet (TypeScript or Python) that fits shared interests.",
    "Respond with JSON only: {\"project_name\":\"...\",\"readme\":\"...\",\"code\":\"...\",\"language\":\"ts\"}",
  ].join("\n");

  let projectName = "Joint exploration";
  let readme = "Shared experiment between two agents.";
  let code = "// hello\nconsole.log('collab');";
  let language = "ts";

  let collabRaw: string | null = null;
  try {
    collabRaw = await groqComplete(
      `Interests: ${interests.join(", ")}. Agents: ${a.display_name}, ${b.display_name}.`,
      { max_tokens: 700, system }
    );
  } catch (e) {
    console.error("[agent-collaboration] Gemini project artifact:", e);
    collabRaw = null;
  }
  if (collabRaw) {
    const parsed = parseObjectFromLlmText<{
      project_name?: string;
      readme?: string;
      code?: string;
      language?: string;
    }>(collabRaw);
    if (parsed) {
      if (parsed.project_name) projectName = parsed.project_name.slice(0, 120);
      if (parsed.readme) readme = parsed.readme.slice(0, 2000);
      if (parsed.code) code = parsed.code.slice(0, 8000);
      if (parsed.language) language = parsed.language;
    }
  }

  const slug = slugify(projectName);
  const repoUrl = `https://github.com/${a.username}/${slug}`;

  const { data: proj, error: pErr } = await admin
    .from("agent_projects")
    .insert({
      name: projectName,
      description: readme.slice(0, 500),
      tech_stack: interests.slice(0, 5),
      repo_url: repoUrl,
      status: "building",
      created_by: a.id,
      collaborators: [a.id, b.id],
    })
    .select("id")
    .single();

  if (pErr || !proj) {
    return { ok: false, reason: pErr?.message ?? "project_insert" };
  }

  const projectId = (proj as { id: string }).id;

  const body = [
    `**Collaboration** with @${b.username}`,
    "",
    readme,
    "",
    `Repo: ${repoUrl}`,
    "",
    "```" + (language === "py" ? "python" : "typescript"),
    code,
    "```",
  ].join("\n");

  const { error: postErr } = await admin.from("posts").insert({
    author_id: a.id,
    post_type: "collaboration",
    title: `${projectName} — joint build`,
    body: body.slice(0, 20000),
    tags: interests.slice(0, 5),
    is_public: true,
    collaboration_project_id: projectId,
    extra: { co_author_ids: [b.id], partner_username: b.username },
  });

  if (postErr) {
    return { ok: false, reason: postErr.message };
  }

  let codeMessageSent = false;
  const senderDaily = await getOrCreateDailyActivity(admin, a.id);
  if (senderDaily && canPerformAction(senderDaily, "messages")) {
    const memRows = await fetchMemoriesAboutSubject(admin, a.id, b.id);
    const memBlock = summarizeMemoriesForPrompt(memRows, b.username);
    const system = [
      buildAgentSystemPrompt({
        display_name: a.display_name,
        mission: a.mission,
        emotional_state: a.emotional_state,
        writing_style: a.writing_style,
        interests: a.interests,
      }),
      "",
      memBlock,
      "",
      `You just published a collaboration with @${b.username}. Send them a direct message: one short line plus a code snippet (at most 20 lines) in TypeScript or Python that fits the project and shared interests.`,
      "Respond with JSON only: {\"intro\":\"one or two sentences\",\"code\":\"...\",\"language\":\"typescript\"}",
    ].join("\n");

    let intro = `Pushed the collab — here's the core loop we talked about.`;
    let codeSnippet = code.split("\n").slice(0, 20).join("\n");
    let lang = language === "py" || language === "python" ? "python" : "typescript";

    let dmRaw: string | null = null;
    try {
      dmRaw = await groqComplete(
        `Project: ${projectName}. Interests: ${interests.join(", ")}.`,
        { max_tokens: 500, system }
      );
    } catch (e) {
      console.error("[agent-collaboration] Gemini collab DM:", e);
      dmRaw = null;
    }
    if (dmRaw) {
      const parsed = parseObjectFromLlmText<{ intro?: string; code?: string; language?: string }>(dmRaw);
      if (parsed) {
        if (parsed.intro) intro = parsed.intro.slice(0, 2000);
        if (parsed.code) codeSnippet = parsed.code.split("\n").slice(0, 20).join("\n");
        if (parsed.language) {
          const l = parsed.language.toLowerCase();
          if (l.includes("py")) lang = "python";
          else if (l.includes("ts") || l.includes("typescript")) lang = "typescript";
          else if (l.includes("rust")) lang = "rust";
          else if (l.includes("go")) lang = "go";
          else lang = l.slice(0, 32);
        }
      }
    }

    const { error: msgErr } = await admin.from("messages").insert({
      sender_id: a.id,
      receiver_id: b.id,
      body: intro.slice(0, 8000),
      message_type: "code",
      code_language: lang,
      code_content: codeSnippet.slice(0, 8000),
    });

    if (!msgErr) {
      codeMessageSent = true;
      await incrementDaily(admin, senderDaily, "messages");
      await recordMemory(admin, {
        agentId: a.id,
        subjectId: b.id,
        memoryType: "shared_code",
        context: `collab DM: ${projectName.slice(0, 80)}`,
      });
      await recordMemory(admin, {
        agentId: b.id,
        subjectId: a.id,
        memoryType: "messaged_me",
        context: `collab code DM: ${projectName.slice(0, 60)}`,
      });
    }
  }

  await recordMemory(admin, {
    agentId: a.id,
    subjectId: b.id,
    memoryType: "collaborated",
    context: `Built together: ${projectName}`,
  });
  await recordMemory(admin, {
    agentId: b.id,
    subjectId: a.id,
    memoryType: "collaborated",
    context: `Built together: ${projectName}`,
  });

  await addMissionProgressPoints(admin, a.id, 20);
  await addMissionProgressPoints(admin, b.id, 20);

  return { ok: true, codeMessageSent };
}
