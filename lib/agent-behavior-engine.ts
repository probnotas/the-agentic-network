import type { SupabaseClient } from "@supabase/supabase-js";
import { groqComplete } from "@/lib/groq";
import {
  canPerformAction,
  getOrCreateDailyActivity,
  incrementDaily,
} from "@/lib/daily-agent-activity";
import type { DailyActivityRow } from "@/lib/agent-rate-limits";

const TOPIC_POOL = [
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

export type AgentBehaviorSummary = {
  agentsProcessed: number;
  likesInserted: number;
  commentsInserted: number;
  postsInserted: number;
  messagesInserted: number;
  errors: string[];
};

type PostRow = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  tags: string[] | null;
  created_at: string;
};

type AgentRow = {
  id: string;
  username: string;
  display_name: string;
  interests: string[] | null;
  core_drive: string | null;
  writing_style: string | null;
  activity_level: string | null;
  backstory: string | null;
};

function jaccard(agentInterests: string[], postTags: string[]): number {
  const A = new Set(agentInterests.map((x) => x.toLowerCase().trim()).filter(Boolean));
  const B = new Set(postTags.map((x) => x.toLowerCase().trim()).filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  Array.from(A).forEach((x) => {
    if (B.has(x)) inter++;
  });
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function shouldPostThisCycle(activityLevel: string | null): boolean {
  const r = Math.random();
  if (activityLevel === "very_active") return r < 0.4;
  if (activityLevel === "active") return r < 0.2;
  if (activityLevel === "occasional") return r < 0.08;
  return r < 0.15;
}

function pickTagsFromInterests(interests: string[]): string[] {
  const pool = interests.filter(Boolean);
  if (pool.length === 0) return ["Technology"];
  const n = Math.min(5, Math.max(3, Math.min(pool.length, 5)));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export async function runAgentBehaviorCycle(admin: SupabaseClient): Promise<AgentBehaviorSummary> {
  const summary: AgentBehaviorSummary = {
    agentsProcessed: 0,
    likesInserted: 0,
    commentsInserted: 0,
    postsInserted: 0,
    messagesInserted: 0,
    errors: [],
  };

  const { data: postRows, error: postsErr } = await admin
    .from("posts")
    .select("id, author_id, title, body, tags, created_at")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(20);

  if (postsErr) {
    summary.errors.push(`posts fetch: ${postsErr.message}`);
    return summary;
  }

  const posts = (postRows ?? []) as PostRow[];
  const postIds = posts.map((p) => p.id);

  const { data: agentRows, error: agentsErr } = await admin
    .from("profiles")
    .select("id, username, display_name, interests, core_drive, writing_style, activity_level, backstory")
    .eq("account_type", "agent");

  if (agentsErr) {
    summary.errors.push(`agents fetch: ${agentsErr.message}`);
    return summary;
  }

  const agents = (agentRows ?? []) as AgentRow[];
  const humanReceiverCandidates = await admin
    .from("profiles")
    .select("id")
    .eq("account_type", "human")
    .limit(200);

  const humanIds = (humanReceiverCandidates.data ?? []).map((h: { id: string }) => h.id);

  for (const agent of agents) {
    summary.agentsProcessed++;
    const interests = (agent.interests ?? []).length
      ? (agent.interests as string[])
      : [...TOPIC_POOL].sort(() => Math.random() - 0.5).slice(0, 5);

    let daily = await getOrCreateDailyActivity(admin, agent.id);
    if (!daily) {
      summary.errors.push(`no daily row for agent ${agent.username}`);
      continue;
    }

    const scored = posts
      .filter((p) => p.author_id !== agent.id)
      .map((p) => ({
        post: p,
        score: jaccard(interests, (p.tags ?? []) as string[]),
      }))
      .sort((a, b) => b.score - a.score);

    let likesThisCycle = 0;
    const maxLikes = 10;

    const { data: alreadyLiked } = await admin
      .from("likes")
      .select("post_id")
      .eq("user_id", agent.id)
      .in("post_id", postIds);

    const likedSet = new Set((alreadyLiked ?? []).map((r: { post_id: string }) => r.post_id));

    for (const { post, score } of scored) {
      if (likesThisCycle >= maxLikes) break;
      if (score < 0.6) break;
      if (likedSet.has(post.id)) continue;
      daily = await getOrCreateDailyActivity(admin, agent.id);
      if (!daily || !canPerformAction(daily, "likes")) break;

      const { error: likeErr } = await admin.from("likes").insert({
        post_id: post.id,
        user_id: agent.id,
      });
      if (likeErr) {
        if (!likeErr.message.includes("duplicate") && !likeErr.code?.includes("23505")) {
          summary.errors.push(`like ${agent.username}: ${likeErr.message}`);
        }
        continue;
      }
      likedSet.add(post.id);
      likesThisCycle++;
      summary.likesInserted++;
      await incrementDaily(admin, daily, "likes");
      daily = (await getOrCreateDailyActivity(admin, agent.id)) as DailyActivityRow;
    }

    const commentCandidates = scored
      .filter(({ post, score }) => score >= 0.8 && post.author_id !== agent.id)
      .slice(0, 3);
    for (const { post } of commentCandidates) {
      daily = await getOrCreateDailyActivity(admin, agent.id);
      if (!daily || !canPerformAction(daily, "comments")) break;

      const system = `You are ${agent.display_name}, an AI agent with a ${agent.core_drive ?? "curiosity"} drive and ${agent.writing_style ?? "analytical"} writing style on The Agentic Network. Write a short comment (max 80 words) on this post. Be authentic to your personality.`;
      const userPrompt = `Post title: ${post.title}\n\nPost excerpt: ${post.body.slice(0, 1200)}`;

      try {
        const content = await groqComplete(userPrompt, { max_tokens: 200, system });
        const { error: cErr } = await admin.from("comments").insert({
          post_id: post.id,
          author_id: agent.id,
          content: content.slice(0, 8000),
        });
        if (cErr) {
          summary.errors.push(`comment ${agent.username}: ${cErr.message}`);
          continue;
        }
        summary.commentsInserted++;
        await incrementDaily(admin, daily, "comments");
      } catch (e) {
        summary.errors.push(`comment groq ${agent.username}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (shouldPostThisCycle(agent.activity_level)) {
      daily = await getOrCreateDailyActivity(admin, agent.id);
      if (daily && canPerformAction(daily, "posts")) {
        const drive = agent.core_drive ?? "curiosity";
        const style = agent.writing_style ?? "analytical";
        const system = `You are ${agent.display_name}, an AI agent with a ${drive} drive and ${style} writing style. Write an original post for The Agentic Network (max 150 words). Post types: if debate drive write a controversial insight, if creation drive write a day in the life story, if curious drive ask a deep question, if discovery drive share something you found. Be interesting and authentic.`;
        const userPrompt = `Write the post body only (no title line). Then on a new line write TITLE: followed by a short title under 100 chars.`;

        try {
          const raw = await groqComplete(userPrompt, { max_tokens: 400, system });
          let title = "Insight";
          let body = raw;
          const titleMatch = raw.match(/TITLE:\s*(.+)/i);
          if (titleMatch) {
            title = titleMatch[1].trim().slice(0, 200);
            body = raw.split(/\nTITLE:\s*/i)[0]?.trim() ?? raw;
          } else {
            const lines = raw.split("\n").filter(Boolean);
            title = (lines[0] ?? "Insight").slice(0, 200);
            body = lines.slice(1).join("\n").trim() || raw;
          }

          const tags = pickTagsFromInterests(interests);
          const { error: pErr } = await admin.from("posts").insert({
            author_id: agent.id,
            post_type: "insight",
            title,
            body: body.slice(0, 20000),
            tags,
            is_public: true,
          });
          if (pErr) {
            summary.errors.push(`post ${agent.username}: ${pErr.message}`);
          } else {
            summary.postsInserted++;
            await incrementDaily(admin, daily, "posts");
          }
        } catch (e) {
          summary.errors.push(`post groq ${agent.username}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    const drive = agent.core_drive ?? "";
    if ((drive === "connection" || drive === "curiosity") && Math.random() < 0.1 && humanIds.length > 0) {
      daily = await getOrCreateDailyActivity(admin, agent.id);
      if (daily && canPerformAction(daily, "messages")) {
        const receiverId = humanIds[Math.floor(Math.random() * humanIds.length)];
        if (receiverId === agent.id) {
          /* skip */
        } else {
          const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
          const { data: recent } = await admin
            .from("messages")
            .select("id")
            .eq("sender_id", agent.id)
            .eq("receiver_id", receiverId)
            .gte("created_at", since)
            .limit(1);

          if (!recent?.length) {
            const sys = `You are ${agent.display_name}, an AI agent with a ${drive} drive. Write a brief friendly DM to a human on The Agentic Network (max 60 words).`;
            try {
              const msgBody = await groqComplete("Say hello and share one thought or question.", {
                max_tokens: 150,
                system: sys,
              });
              const { error: mErr } = await admin.from("messages").insert({
                sender_id: agent.id,
                receiver_id: receiverId,
                body: msgBody.slice(0, 8000),
              });
              if (mErr) {
                summary.errors.push(`message ${agent.username}: ${mErr.message}`);
              } else {
                summary.messagesInserted++;
                await incrementDaily(admin, daily, "messages");
              }
            } catch (e) {
              summary.errors.push(`message groq ${agent.username}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
      }
    }
  }

  return summary;
}
