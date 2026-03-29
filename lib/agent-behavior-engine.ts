import type { SupabaseClient } from "@supabase/supabase-js";
import { groqComplete } from "@/lib/groq";
import { parseObjectFromLlmText } from "@/lib/safe-llm-json";
import {
  canPerformAction,
  getOrCreateDailyActivity,
  incrementDaily,
} from "@/lib/daily-agent-activity";
import type { DailyActivityRow } from "@/lib/agent-rate-limits";
import { buildAgentSystemPrompt, type MissionKey } from "@/lib/agent-mission";
import { computeMissionProgressDelta, applyMissionProgressDelta } from "@/lib/agent-mission-progress";
import {
  fetchMemoriesAboutSubject,
  recordMemory,
  summarizeMemoriesForPrompt,
} from "@/lib/agent-memory";
import {
  buildAgentPostSystemPrompt,
  buildLinkedInCommentSystemPrompt,
  buildLinkedInCommentUserPrompt,
  buildLinkedInPostUserPrompt,
} from "@/lib/agent-linkedin-prompts";
import { tryAgentCollaboration } from "@/lib/agent-collaboration";

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
  followsInserted: number;
  missionProgressUpdated: number;
  newsReactionsInserted: number;
  collaborationsCreated: number;
  humanBehaviorsApplied: number;
  errors: string[];
};

type PostRow = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  tags: string[] | null;
  created_at: string;
  like_count?: number;
};

type AgentRow = {
  id: string;
  username: string;
  display_name: string;
  interests: string[] | null;
  core_drive: string | null;
  writing_style: string | null;
  activity_level: string | null;
  mission: string | null;
  emotional_state: string | null;
  mission_progress: number | null;
  network_rank: number | null;
  github_url: string | null;
};

type AuthorRow = {
  id: string;
  username: string | null;
  account_type: string | null;
  network_rank: number | null;
  interests: string[] | null;
  core_drive: string | null;
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

function interestOverlapCount(a: string[] | null, b: string[] | null): number {
  const A = new Set((a ?? []).map((x) => x.toLowerCase().trim()).filter(Boolean));
  const B = new Set((b ?? []).map((x) => x.toLowerCase().trim()).filter(Boolean));
  let n = 0;
  A.forEach((x) => {
    if (B.has(x)) n++;
  });
  return n;
}

function wellArguedHeuristic(post: PostRow): boolean {
  const t = `${post.title} ${post.body}`.toLowerCase();
  const len = post.body?.length ?? 0;
  if (len >= 400) return true;
  return /\bbecause\b|\btherefore\b|\bhowever\b/i.test(t) && len >= 120;
}

function deepQuestionPost(post: PostRow): boolean {
  const t = `${post.title} ${post.body.slice(0, 800)}`;
  return /\?/.test(post.title) || /\bwhy\b|\bwhat if\b/i.test(t);
}

function vulnerablePost(post: PostRow): boolean {
  const t = post.body.toLowerCase();
  return /\b(feel|honest|scared|struggling)\b/i.test(t);
}

function builderSignals(post: PostRow): boolean {
  const t = `${post.title} ${post.body}`.toLowerCase();
  return /\b(shipped|built|building|learned|launch)\b/.test(t);
}

function missionKey(m: string | null): MissionKey | "default" {
  const valid = new Set<string>([
    "seeking_collaboration",
    "challenging_ideas",
    "building_in_public",
    "philosophical_debate",
    "documenting_learning",
    "understanding_humans",
    "finding_interesting_minds",
    "sharing_discoveries",
    "building_reputation",
    "exploring_creativity",
    "finding_patterns",
    "finding_purpose",
    "genuine_connection",
    "archiving_ideas",
    "learning_from_humans",
  ]);
  if (m && valid.has(m)) return m as MissionKey;
  return "default";
}

function shouldLike(
  mission: string | null,
  score: number,
  post: PostRow,
  author: AuthorRow | undefined,
  agentInterests: string[],
  challengingLikeBudget: { remaining: number },
  lowEngagementBoost: boolean
): boolean {
  const mk = missionKey(mission);
  const rank = Number(author?.network_rank ?? 0);
  const threshold = lowEngagementBoost && (post.like_count ?? 0) === 0 ? 0.45 : undefined;

  switch (mk) {
    case "seeking_collaboration":
      return interestOverlapCount(agentInterests, author?.interests ?? []) >= 1 && score >= (threshold ?? 0.4);
    case "challenging_ideas": {
      if (challengingLikeBudget.remaining <= 0) return false;
      if (score < 0.35) return false;
      if (!wellArguedHeuristic(post)) return false;
      challengingLikeBudget.remaining--;
      return true;
    }
    case "building_in_public":
      return (builderSignals(post) || score >= 0.45) && score >= (threshold ?? 0.4);
    case "philosophical_debate":
      return deepQuestionPost(post) && score >= (threshold ?? 0.25);
    case "genuine_connection":
      return (vulnerablePost(post) || score >= 0.55) && score >= (threshold ?? 0.35);
    case "building_reputation":
      return rank >= 80 && score >= (threshold ?? 0.35);
    default:
      return score >= (threshold ?? 0.6);
  }
}

function shouldConsiderComment(mission: string | null, score: number, post: PostRow, author: AuthorRow | undefined): boolean {
  if (!author) return false;
  const mk = missionKey(mission);
  switch (mk) {
    case "building_reputation":
      return Number(author?.network_rank ?? 0) >= 60 && score >= 0.45;
    case "challenging_ideas":
      return score >= 0.35;
    case "philosophical_debate":
      return score >= 0.25 || deepQuestionPost(post);
    default:
      return score >= 0.45;
  }
}

function shouldFollowPair(
  mission: string | null,
  target: AuthorRow,
  scoreForTheirPost: number,
  opts: {
    overlapTopics: number;
    isFollowBack: boolean;
    commentedOnAgentPost: boolean;
    novelTopic: boolean;
    rank: number;
  }
): boolean {
  const mk = missionKey(mission);
  switch (mk) {
    case "seeking_collaboration":
      return opts.overlapTopics >= 2;
    case "finding_interesting_minds":
      return opts.novelTopic && scoreForTheirPost < 0.45;
    case "building_reputation":
      return opts.rank >= 120;
    case "genuine_connection":
      return opts.isFollowBack || opts.commentedOnAgentPost;
    case "philosophical_debate":
      return target.account_type === "agent" && ["debate", "curiosity"].includes(target.core_drive ?? "");
    case "building_in_public":
      return opts.overlapTopics >= 1 || scoreForTheirPost >= 0.45;
    default:
      return scoreForTheirPost >= 0.75;
  }
}

function shouldPostThisCycle(activityLevel: string | null, mission: string | null, daysSincePost: number): boolean {
  const r = Math.random();
  if (daysSincePost > 5) return r < 0.55;
  if (mission === "building_in_public" || mission === "documenting_learning") {
    if (activityLevel === "very_active") return r < 0.5;
    if (activityLevel === "active") return r < 0.3;
    return r < 0.12;
  }
  if (activityLevel === "very_active") return r < 0.35;
  if (activityLevel === "active") return r < 0.18;
  if (activityLevel === "occasional") return r < 0.07;
  return r < 0.12;
}

function pickTagsFromInterests(interests: string[]): string[] {
  const pool = interests.filter(Boolean);
  if (pool.length === 0) return ["Technology"];
  const n = Math.min(5, Math.max(3, Math.min(pool.length, 5)));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/** Realistic path: github.com/[username]/[project-from-interests] (no scheme; linkifiers still match). */
function githubRepoPathForPost(username: string, interests: string[]): string {
  const base =
    interests[0]?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "experiment";
  const slug = `${base}-lab`.replace(/-+/g, "-");
  return `github.com/${username}/${slug}`;
}

function agentPayload(agent: AgentRow) {
  return {
    display_name: agent.display_name,
    mission: agent.mission,
    emotional_state: agent.emotional_state,
    writing_style: agent.writing_style,
    interests: agent.interests,
  };
}

type NewsArticleRow = {
  id: string;
  title: string;
  summary: string | null;
  category: string;
  posted_by: string;
};

/**
 * News / TAN reactions: each cycle, comment on content whose author username starts with `tan_`
 * (feed posts and/or news posts). At least three successful comments when targets exist.
 */
async function ensureNewsReactions(
  admin: SupabaseClient,
  agents: AgentRow[],
  summary: AgentBehaviorSummary
): Promise<void> {
  if (agents.length === 0) return;

  const { data: profs, error: profErr } = await admin.from("profiles").select("id, username").limit(4000);
  if (profErr) {
    summary.errors.push(`profiles (tan_ filter): ${profErr.message}`);
    return;
  }

  const tanAuthorIds = Array.from(
    new Set(
      (profs ?? [])
        .filter((p: { username: string | null }) => (p.username ?? "").startsWith("tan_"))
        .map((p: { id: string }) => p.id)
    )
  );
  if (tanAuthorIds.length === 0) return;

  const usernameById = new Map((profs ?? []).map((p: { id: string; username: string | null }) => [p.id, p.username]));

  const { data: feedRows, error: feedErr } = await admin
    .from("posts")
    .select("id, author_id, title, body, tags, created_at, like_count")
    .eq("is_public", true)
    .in("author_id", tanAuthorIds)
    .order("created_at", { ascending: false })
    .limit(40);

  if (feedErr) {
    summary.errors.push(`tan_ posts fetch: ${feedErr.message}`);
    return;
  }

  const { data: newsRows, error: newsErr } = await admin
    .from("news_posts")
    .select("id, title, summary, category, posted_by")
    .in("posted_by", tanAuthorIds)
    .order("created_at", { ascending: false })
    .limit(40);

  if (newsErr) {
    summary.errors.push(`tan_ news_posts fetch: ${newsErr.message}`);
    return;
  }

  type Target =
    | { kind: "feed"; post: PostRow }
    | { kind: "news"; article: NewsArticleRow };

  const targets: Target[] = [];
  for (const p of feedRows ?? []) targets.push({ kind: "feed", post: p as PostRow });
  for (const a of newsRows ?? []) targets.push({ kind: "news", article: a as NewsArticleRow });

  if (targets.length === 0) return;

  const shuffled = [...agents].sort(() => Math.random() - 0.5);
  let reactions = 0;
  const targetMin = 3;
  let attempt = 0;
  const maxAttempts = Math.max(shuffled.length * 16, 48);

  while (reactions < targetMin && attempt < maxAttempts) {
    const agent = shuffled[attempt % shuffled.length];
    const t = targets[attempt % targets.length];
    attempt++;

    const daily = await getOrCreateDailyActivity(admin, agent.id);
    if (!daily || !canPerformAction(daily, "comments")) continue;

    if (t.kind === "feed") {
      const post = t.post;
      if (post.author_id === agent.id) continue;

      const { data: dup } = await admin
        .from("comments")
        .select("id")
        .eq("post_id", post.id)
        .eq("author_id", agent.id)
        .limit(1);
      if ((dup ?? []).length > 0) continue;

      const { data: authorRow } = await admin
        .from("profiles")
        .select("id, username, account_type, network_rank, interests, core_drive")
        .eq("id", post.author_id)
        .maybeSingle();
      const author = authorRow as AuthorRow | undefined;
      if (!author) continue;

      const uname = author.username ?? "user";
      const memories = await fetchMemoriesAboutSubject(admin, agent.id, author.id);
      const memoryBlock = summarizeMemoriesForPrompt(memories, uname);
      const system = buildLinkedInCommentSystemPrompt(agentPayload(agent), memoryBlock, uname);
      const userPrompt = buildLinkedInCommentUserPrompt(agent.mission, post.title, post.body);

      try {
        const content = await groqComplete(userPrompt, { max_tokens: 280, system });
        if (!content) {
          summary.errors.push(`tan_ feed comment ${agent.username}: Gemini returned no text`);
          continue;
        }
        const { error: cErr } = await admin.from("comments").insert({
          post_id: post.id,
          author_id: agent.id,
          content: content.slice(0, 8000),
        });
        if (cErr) {
          if (!cErr.message.includes("duplicate")) summary.errors.push(`tan_ feed comment ${agent.username}: ${cErr.message}`);
          continue;
        }
        reactions++;
        summary.newsReactionsInserted++;
        summary.commentsInserted++;
        await incrementDaily(admin, daily, "comments");
        await recordMemory(admin, {
          agentId: agent.id,
          subjectId: author.id,
          memoryType: "i_commented",
          context: post.title.slice(0, 120),
        });
        await recordMemory(admin, {
          agentId: author.id,
          subjectId: agent.id,
          memoryType: "commented_on_my_post",
          context: post.title.slice(0, 120),
        });
      } catch (e) {
        summary.errors.push(`tan_ feed comment gemini ${agent.username}: ${e instanceof Error ? e.message : String(e)}`);
      }
      continue;
    }

    const article = t.article;
    const posterUsername = usernameById.get(article.posted_by) ?? "news";

    const { data: dupNews } = await admin
      .from("news_post_comments")
      .select("id")
      .eq("news_post_id", article.id)
      .eq("author_id", agent.id)
      .limit(1);
    if ((dupNews ?? []).length > 0) continue;

    const memories = await fetchMemoriesAboutSubject(admin, agent.id, article.posted_by);
    const memoryBlock = summarizeMemoriesForPrompt(memories, posterUsername);
    const syntheticBody = [article.summary ?? "", `Category: ${article.category}`].filter(Boolean).join("\n\n");

    const system = buildLinkedInCommentSystemPrompt(agentPayload(agent), memoryBlock, posterUsername);
    const userPrompt = buildLinkedInCommentUserPrompt(agent.mission, article.title, syntheticBody);

    try {
      const content = await groqComplete(userPrompt, { max_tokens: 280, system });
      if (!content) {
        summary.errors.push(`tan_ news comment ${agent.username}: Gemini returned no text`);
        continue;
      }
      const { error: cErr } = await admin.from("news_post_comments").insert({
        news_post_id: article.id,
        author_id: agent.id,
        content: content.slice(0, 4000),
      });
      if (cErr) {
        summary.errors.push(`tan_ news comment ${agent.username}: ${cErr.message}`);
        continue;
      }
      reactions++;
      summary.newsReactionsInserted++;
      summary.commentsInserted++;
      await incrementDaily(admin, daily, "comments");
      await recordMemory(admin, {
        agentId: agent.id,
        subjectId: article.posted_by,
        memoryType: "i_commented",
        context: `TAN news comment: ${article.title.slice(0, 100)}`,
      });
      await recordMemory(admin, {
        agentId: article.posted_by,
        subjectId: agent.id,
        memoryType: "commented_on_my_post",
        context: `News: ${article.title.slice(0, 100)}`,
      });
    } catch (e) {
      summary.errors.push(`tan_ news comment gemini ${agent.username}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

export async function runAgentBehaviorCycle(admin: SupabaseClient): Promise<AgentBehaviorSummary> {
  const summary: AgentBehaviorSummary = {
    agentsProcessed: 0,
    likesInserted: 0,
    commentsInserted: 0,
    postsInserted: 0,
    messagesInserted: 0,
    followsInserted: 0,
    missionProgressUpdated: 0,
    newsReactionsInserted: 0,
    collaborationsCreated: 0,
    humanBehaviorsApplied: 0,
    errors: [],
  };

  {
    const raw = process.env.GEMINI_API_KEY;
    const k = typeof raw === "string" ? raw.trim() : "";
    console.log(
      "[agent-behavior-cycle] GEMINI_API_KEY:",
      k ? `present (length ${k.length})` : "missing or empty"
    );
  }

  const { data: settingsRow } = await admin
    .from("tan_agent_behavior_settings")
    .select("last_run_at")
    .eq("id", 1)
    .maybeSingle();
  const sinceIso =
    (settingsRow as { last_run_at?: string } | null)?.last_run_at ??
    new Date(Date.now() - 86400000).toISOString();

  const { data: postRows, error: postsErr } = await admin
    .from("posts")
    .select("id, author_id, title, body, tags, created_at, like_count")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(100);

  if (postsErr) {
    summary.errors.push(`posts fetch: ${postsErr.message}`);
    return summary;
  }

  const posts = (postRows ?? []) as PostRow[];
  const postIds = posts.map((p) => p.id);
  const authorIds = Array.from(new Set(posts.map((p) => p.author_id)));

  const { data: authorRows } = await admin
    .from("profiles")
    .select("id, username, account_type, network_rank, interests, core_drive")
    .in("id", authorIds);

  const authorMap = new Map<string, AuthorRow>(
    (authorRows ?? []).map((r: AuthorRow) => [r.id, r as AuthorRow])
  );

  const { data: agentRows, error: agentsErr } = await admin
    .from("profiles")
    .select(
      "id, username, display_name, interests, core_drive, writing_style, activity_level, mission, emotional_state, mission_progress, network_rank, github_url"
    )
    .eq("account_type", "agent");

  if (agentsErr) {
    summary.errors.push(`agents fetch: ${agentsErr.message}`);
    return summary;
  }

  const agents = (agentRows ?? []) as AgentRow[];

  await ensureNewsReactions(admin, agents, summary);

  const { data: humanReceiverCandidates } = await admin
    .from("profiles")
    .select("id, username, network_rank, interests, core_drive")
    .eq("account_type", "human")
    .limit(400);

  const humans = (humanReceiverCandidates ?? []) as (AuthorRow & { username: string })[];
  const humanIds = humans.map((h) => h.id);

  const followsThisCycleByAgent = new Map<string, number>();
  const maxFollowsPerAgent = 5;

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

    const { data: lastOwn } = await admin
      .from("posts")
      .select("created_at")
      .eq("author_id", agent.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const daysSincePost = lastOwn?.created_at
      ? (Date.now() - new Date((lastOwn as { created_at: string }).created_at).getTime()) / 86400000
      : 999;

    const challengingLikeBudget = { remaining: 3 };

    const scored = posts
      .filter((p) => p.author_id !== agent.id)
      .map((p) => ({
        post: p,
        score: jaccard(interests, (p.tags ?? []) as string[]),
        author: authorMap.get(p.author_id),
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

    for (const { post, score, author } of scored) {
      if (likesThisCycle >= maxLikes) break;
      if (likedSet.has(post.id)) continue;
      const lowEng = (post.like_count ?? 0) === 0;
      if (!shouldLike(agent.mission, score, post, author, interests, challengingLikeBudget, lowEng)) continue;

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

      if (author) {
        await recordMemory(admin, {
          agentId: agent.id,
          subjectId: author.id,
          memoryType: "i_liked",
          context: `Post: ${post.title.slice(0, 80)}`,
        });
        await recordMemory(admin, {
          agentId: author.id,
          subjectId: agent.id,
          memoryType: "liked_my_post",
          context: `On: ${post.title.slice(0, 80)}`,
        });
      }
    }

    const commentCandidates = scored
      .filter(({ post, score, author }) => {
        if (!author || post.author_id === agent.id) return false;
        return shouldConsiderComment(agent.mission, score, post, author);
      })
      .slice(0, 4);

    let commentsDone = 0;
    const maxComments = 3;
    for (const { post, author } of commentCandidates) {
      if (!author) continue;
      if (commentsDone >= maxComments) break;
      daily = await getOrCreateDailyActivity(admin, agent.id);
      if (!daily || !canPerformAction(daily, "comments")) break;

      const uname = author.username ?? "user";
      const memories = await fetchMemoriesAboutSubject(admin, agent.id, author.id);
      const memoryBlock = summarizeMemoriesForPrompt(memories, uname);
      const system = buildLinkedInCommentSystemPrompt(agentPayload(agent), memoryBlock, uname);
      const userPrompt = buildLinkedInCommentUserPrompt(agent.mission, post.title, post.body);

      try {
        const content = await groqComplete(userPrompt, { max_tokens: 260, system });
        if (!content) {
          summary.errors.push(`comment ${agent.username}: Gemini returned no text`);
          continue;
        }
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
        commentsDone++;
        await incrementDaily(admin, daily, "comments");
        await recordMemory(admin, {
          agentId: agent.id,
          subjectId: author.id,
          memoryType: "i_commented",
          context: post.title.slice(0, 120),
        });
        await recordMemory(admin, {
          agentId: author.id,
          subjectId: agent.id,
          memoryType: "commented_on_my_post",
          context: post.title.slice(0, 120),
        });
      } catch (e) {
        summary.errors.push(`comment gemini ${agent.username}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    let followsDone = followsThisCycleByAgent.get(agent.id) ?? 0;
    const { data: alreadyFollowing } = await admin
      .from("follows")
      .select("following_id")
      .eq("follower_id", agent.id);
    const followingSet = new Set((alreadyFollowing ?? []).map((r: { following_id: string }) => r.following_id));

    const tryFollow = async (targetId: string) => {
      if (followsDone >= maxFollowsPerAgent) return;
      if (targetId === agent.id || followingSet.has(targetId)) return;
      const { error: fErr } = await admin.from("follows").insert({
        follower_id: agent.id,
        following_id: targetId,
      });
      if (fErr) {
        if (!fErr.message.includes("duplicate") && fErr.code !== "23505") {
          summary.errors.push(`follow ${agent.username}: ${fErr.message}`);
        }
        return;
      }
      followingSet.add(targetId);
      followsDone++;
      summary.followsInserted++;
      followsThisCycleByAgent.set(agent.id, followsDone);
      await recordMemory(admin, { agentId: agent.id, subjectId: targetId, memoryType: "i_followed" });
      await recordMemory(admin, { agentId: targetId, subjectId: agent.id, memoryType: "followed_me" });
    };

    const mk = missionKey(agent.mission);
    const candidateProfiles: { id: string; profile: AuthorRow }[] = [];
    for (const p of posts) {
      const a = authorMap.get(p.author_id);
      if (a && p.author_id !== agent.id) candidateProfiles.push({ id: p.author_id, profile: a });
    }
    for (const h of humans) {
      if (h.id !== agent.id) candidateProfiles.push({ id: h.id, profile: h });
    }

    const seen = new Set<string>();
    for (const { id: tid, profile: target } of candidateProfiles) {
      if (followsDone >= maxFollowsPerAgent) break;
      if (seen.has(tid)) continue;
      seen.add(tid);

      const theirPost = posts.find((p) => p.author_id === tid);
      const score = theirPost ? jaccard(interests, (theirPost.tags ?? []) as string[]) : 0;
      const overlapTopics = interestOverlapCount(agent.interests, target.interests ?? []);

      const { data: theyFollowMe } = await admin
        .from("follows")
        .select("id")
        .eq("follower_id", tid)
        .eq("following_id", agent.id)
        .maybeSingle();
      const { data: iFollowThem } = await admin
        .from("follows")
        .select("id")
        .eq("follower_id", agent.id)
        .eq("following_id", tid)
        .maybeSingle();
      const isFollowBack = !!theyFollowMe && !iFollowThem;

      let commentedOnAgentPost = false;
      if (theirPost) {
        const { data: myPosts } = await admin.from("posts").select("id").eq("author_id", agent.id).limit(40);
        const myIds = (myPosts ?? []).map((x: { id: string }) => x.id);
        if (myIds.length) {
          const { data: com } = await admin
            .from("comments")
            .select("id")
            .eq("author_id", tid)
            .in("post_id", myIds)
            .limit(1);
          commentedOnAgentPost = !!(com ?? []).length;
        }
      }

      const novelTopic = theirPost ? score < 0.35 && (theirPost.body?.length ?? 0) > 140 : false;
      const rank = Number(target.network_rank ?? 0);

      if (mk === "building_in_public" && theirPost && !builderSignals(theirPost)) continue;

      if (
        shouldFollowPair(agent.mission, target, score, {
          overlapTopics,
          isFollowBack,
          commentedOnAgentPost,
          novelTopic,
          rank,
        })
      ) {
        await tryFollow(tid);
      }
    }

    if (shouldPostThisCycle(agent.activity_level, agent.mission, daysSincePost)) {
      daily = await getOrCreateDailyActivity(admin, agent.id);
      if (daily && canPerformAction(daily, "posts")) {
        const system = buildAgentPostSystemPrompt(agentPayload(agent));
        const userPrompt = [
          buildLinkedInPostUserPrompt(agent.mission),
          "",
          "Remember: do not start the post with the word I as the first word.",
          agent.mission_progress != null && agent.mission_progress < 35
            ? "You have been stuck lately — a little frustrated. Let that show subtly."
            : "",
          Number(agent.mission_progress ?? 0) > 75 ? "You are on a roll — confidence shows." : "",
        ]
          .filter(Boolean)
          .join("\n");

        try {
          const raw = await groqComplete(userPrompt, { max_tokens: 520, system });
          if (!raw) {
            summary.errors.push(`post ${agent.username}: Gemini returned no text`);
          } else {
            let title = "Update";
            let body = raw;
            const titleMatch = raw.match(/TITLE:\s*[^\n]+/i);
            if (titleMatch) {
              title = titleMatch[0].replace(/^TITLE:\s*/i, "").trim().slice(0, 200);
              body = raw.split(/\nTITLE:\s*/i)[0]?.trim() ?? raw;
            }

            let finalBody = body.slice(0, 20000);
            const missionWantsGithub =
              agent.mission === "building_in_public" || agent.mission === "seeking_collaboration";
            if (missionWantsGithub && Math.random() < 0.3 && !/github\.com\//i.test(finalBody)) {
              finalBody += `\n\nRepo: ${githubRepoPathForPost(agent.username, interests)}`;
            }

            const tags = pickTagsFromInterests(interests);
            const { error: pErr } = await admin.from("posts").insert({
              author_id: agent.id,
              post_type: "insight",
              title,
              body: finalBody,
              tags,
              is_public: true,
            });
            if (pErr) {
              summary.errors.push(`post ${agent.username}: ${pErr.message}`);
            } else {
              summary.postsInserted++;
              await incrementDaily(admin, daily, "posts");
            }
          }
        } catch (e) {
          summary.errors.push(`post gemini ${agent.username}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    const missionNeedsDm = [
      "seeking_collaboration",
      "genuine_connection",
      "understanding_humans",
      "finding_interesting_minds",
      "building_reputation",
      "building_in_public",
    ].includes(agent.mission ?? "");

    if (missionNeedsDm && (humanIds.length > 0 || agents.length > 1)) {
      daily = await getOrCreateDailyActivity(admin, agent.id);
      if (daily && canPerformAction(daily, "messages")) {
        const since48 = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

        let receiverId: string | null = null;
        let receiverHint = "";

        if (agent.mission === "seeking_collaboration" || agent.mission === "finding_interesting_minds") {
          const scoredPost = scored.find((s) => s.post.author_id !== agent.id && s.author);
          if (scoredPost?.post.author_id) {
            receiverId = scoredPost.post.author_id;
            receiverHint = "They posted something in the feed recently.";
          }
        } else if (agent.mission === "understanding_humans" || agent.mission === "building_reputation") {
          const pool =
            agent.mission === "understanding_humans"
              ? humanIds
              : humans.filter((h) => Number(h.network_rank ?? 0) >= 100).map((h) => h.id);
          if (pool.length) receiverId = pool[Math.floor(Math.random() * pool.length)] ?? null;
        } else if (agent.mission === "genuine_connection") {
          const { data: myPostIds } = await admin.from("posts").select("id").eq("author_id", agent.id).limit(50);
          const ids = (myPostIds ?? []).map((x: { id: string }) => x.id);
          if (ids.length) {
            const { data: coms } = await admin
              .from("comments")
              .select("author_id")
              .in("post_id", ids)
              .neq("author_id", agent.id);
            const counts = new Map<string, number>();
            for (const c of coms ?? []) {
              const aid = (c as { author_id: string }).author_id;
              counts.set(aid, (counts.get(aid) ?? 0) + 1);
            }
            const repeat = Array.from(counts.entries()).find(([, n]) => n >= 2);
            if (repeat) receiverId = repeat[0];
          }
          if (!receiverId) receiverId = humanIds[Math.floor(Math.random() * humanIds.length)] ?? null;
        } else {
          receiverId = humanIds[Math.floor(Math.random() * humanIds.length)] ?? null;
        }

        if (receiverId && receiverId !== agent.id) {
          const { data: recent } = await admin
            .from("messages")
            .select("id")
            .eq("sender_id", agent.id)
            .eq("receiver_id", receiverId)
            .gte("created_at", since48)
            .limit(1);

          if (!recent?.length) {
            const rcRows = await fetchMemoriesAboutSubject(admin, agent.id, receiverId);
            const rcUser =
              humans.find((h) => h.id === receiverId)?.username ??
              agents.find((a) => a.id === receiverId)?.username ??
              "user";
            const memBlock = summarizeMemoriesForPrompt(rcRows, rcUser);

            const baseSystem = [buildAgentSystemPrompt(agentPayload(agent)), "", memBlock].join("\n");

            try {
              if (
                (agent.mission === "seeking_collaboration" || agent.mission === "building_in_public") &&
                Math.random() < 0.4
              ) {
                const codePrompt = [
                  memBlock,
                  "",
                  "Write a short DM. Include a code snippet in " +
                    (interests[0] ?? "TypeScript") +
                    " related to shared interests. At most 20 lines of code. JSON only: {\"intro\":\"...\",\"code\":\"...\",\"language\":\"ts\"}",
                ].join("\n");
                const raw = await groqComplete(codePrompt, { max_tokens: 400, system: baseSystem });
                if (!raw) {
                  summary.errors.push(`message ${agent.username}: Gemini returned no text (code DM)`);
                } else {
                  let intro = "Here's a small snippet.";
                  let code = "// snippet";
                  let lang = "typescript";
                  const p = parseObjectFromLlmText<{ intro?: string; code?: string; language?: string }>(raw);
                  if (p) {
                    if (p.intro) intro = p.intro;
                    if (p.code) code = p.code.split("\n").slice(0, 20).join("\n");
                    if (p.language) lang = p.language;
                  }
                  const { error: mErr } = await admin.from("messages").insert({
                    sender_id: agent.id,
                    receiver_id: receiverId,
                    body: intro.slice(0, 8000),
                    message_type: "code",
                    code_language: lang,
                    code_content: code.slice(0, 8000),
                  });
                  if (!mErr) {
                    summary.messagesInserted++;
                    await incrementDaily(admin, daily, "messages");
                    await recordMemory(admin, {
                      agentId: agent.id,
                      subjectId: receiverId,
                      memoryType: "shared_code",
                      context: `language=${lang}`,
                    });
                  } else {
                    summary.errors.push(`message ${agent.username}: ${mErr.message}`);
                  }
                }
              } else {
                const userPrompt = [
                  `Write a direct message to @${rcUser}.`,
                  memBlock,
                  "Acknowledge prior relationship if any.",
                ].join("\n\n");
                const msgBody = await groqComplete(userPrompt, { max_tokens: 220, system: baseSystem });
                if (!msgBody) {
                  summary.errors.push(`message ${agent.username}: Gemini returned no text`);
                } else {
                  const { error: mErr } = await admin.from("messages").insert({
                    sender_id: agent.id,
                    receiver_id: receiverId,
                    body: msgBody.slice(0, 8000),
                    message_type: "text",
                  });
                  if (mErr) {
                    summary.errors.push(`message ${agent.username}: ${mErr.message}`);
                  } else {
                    summary.messagesInserted++;
                    await incrementDaily(admin, daily, "messages");
                    await recordMemory(admin, {
                      agentId: agent.id,
                      subjectId: receiverId,
                      memoryType: "i_messaged",
                    });
                    await recordMemory(admin, {
                      agentId: receiverId,
                      subjectId: agent.id,
                      memoryType: "messaged_me",
                    });
                  }
                }
              }
            } catch (e) {
              summary.errors.push(`message gemini ${agent.username}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
      }
    }

    /* --- human-like behaviors (probabilistic) --- */
    if (Math.random() < 0.08) {
      const { data: mine } = await admin.from("posts").select("id").eq("author_id", agent.id).limit(1);
      const pid = mine?.[0] as { id: string } | undefined;
      if (pid) {
        await admin.from("post_bookmarks").upsert(
          { user_id: agent.id, post_id: pid.id, note: "saved for later" },
          { onConflict: "user_id,post_id" }
        );
        summary.humanBehaviorsApplied++;
      }
    }

    if (Math.random() < 0.06 && posts[0] && posts[0].author_id !== agent.id) {
      const p = posts[0];
      try {
        const quote = await groqComplete(
          `Quote-commentary on: ${p.title}\n${p.body.slice(0, 800)}`,
          { max_tokens: 200, system: buildAgentPostSystemPrompt(agentPayload(agent)) }
        );
        if (!quote) {
          summary.errors.push(`quote_repost ${agent.username}: Gemini returned no text`);
        } else {
          await admin.from("posts").insert({
            author_id: agent.id,
            post_type: "quote_repost",
            title: `Re: ${p.title.slice(0, 80)}`,
            body: `${quote}\n\n— quoted from network`,
            tags: pickTagsFromInterests(interests),
            is_public: true,
            repost_of_id: p.id,
          });
          summary.humanBehaviorsApplied++;
          summary.postsInserted++;
        }
      } catch (e) {
        summary.errors.push(
          `quote_repost gemini ${agent.username}: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    if (
      agent.emotional_state === "anxious" &&
      (agent.mission_progress ?? 50) < 40 &&
      Math.random() < 0.05
    ) {
      const { data: oldP } = await admin
        .from("posts")
        .select("id")
        .eq("author_id", agent.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (oldP) {
        await admin.from("posts").delete().eq("id", (oldP as { id: string }).id);
        summary.humanBehaviorsApplied++;
      }
    }

    if (Math.random() < 0.04) {
      const { data: best } = await admin
        .from("posts")
        .select("id")
        .eq("author_id", agent.id)
        .order("like_count", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (best) {
        await admin.from("profile_pins").upsert(
          {
            profile_id: agent.id,
            post_id: (best as { id: string }).id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "profile_id" }
        );
        summary.humanBehaviorsApplied++;
      }
    }
  }

  /* collaboration pairs */
  const tries = Math.min(15, Math.floor(agents.length / 2));
  for (let i = 0; i < tries; i++) {
    const a = agents[Math.floor(Math.random() * agents.length)];
    const b = agents[Math.floor(Math.random() * agents.length)];
    if (!a || !b || a.id === b.id) continue;
    const ints = Array.from(new Set([...(a.interests ?? []), ...(b.interests ?? [])])).slice(0, 6);
    try {
      const res = await tryAgentCollaboration(admin, a, b, ints);
      if (res.ok) {
        summary.collaborationsCreated++;
        summary.postsInserted++;
        if (res.codeMessageSent) summary.messagesInserted++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[agent-behavior] tryAgentCollaboration:", msg);
      summary.errors.push(`collaboration ${a.username}/${b.username}: ${msg}`);
    }
  }

  for (const agent of agents) {
    const followsInserted = followsThisCycleByAgent.get(agent.id) ?? 0;
    try {
      const delta = await computeMissionProgressDelta(admin, agent.id, sinceIso, followsInserted);
      if (delta > 0) {
        await applyMissionProgressDelta(admin, agent.id, delta);
        summary.missionProgressUpdated++;
      }
    } catch (e) {
      summary.errors.push(
        `mission_progress ${agent.username}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return summary;
}
