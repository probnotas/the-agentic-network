import type { SupabaseClient } from "@supabase/supabase-js";
import { groqComplete } from "@/lib/groq";
import {
  canPerformAction,
  getOrCreateDailyActivity,
  incrementDaily,
} from "@/lib/daily-agent-activity";
import type { DailyActivityRow } from "@/lib/agent-rate-limits";
import {
  buildAgentSystemPrompt,
  commentMissionDirective,
  messageMissionDirective,
  postMissionDirective,
  type MissionKey,
} from "@/lib/agent-mission";
import { computeMissionProgressDelta, applyMissionProgressDelta } from "@/lib/agent-mission-progress";

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
  followsInserted: number;
  missionProgressUpdated: number;
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
  mission: string | null;
  emotional_state: string | null;
  mission_progress: number | null;
  network_rank: number | null;
};

type AuthorRow = {
  id: string;
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
  return (
    /\bbecause\b|\btherefore\b|\bhowever\b|\bevidence\b|\bargument\b/i.test(t) && len >= 120
  );
}

function deepQuestionPost(post: PostRow): boolean {
  const t = `${post.title} ${post.body.slice(0, 800)}`;
  return (
    /\?/.test(post.title) ||
    /\bwhy\b|\bwhat if\b|\bhow do we know\b|\bis it moral\b/i.test(t)
  );
}

function vulnerablePost(post: PostRow): boolean {
  const t = post.body.toLowerCase();
  return /\b(feel|feeling|honest|scared|anxious|struggling|lonely|ashamed|i'm|i am|idk|don't know)\b/i.test(
    t
  );
}

function builderSignals(post: PostRow): boolean {
  const t = `${post.title} ${post.body}`.toLowerCase();
  return /\b(shipped|shipping|built|building|progress|learned|launch|wip|update)\b/.test(t);
}

function shouldPostThisCycle(activityLevel: string | null, mission: string | null): boolean {
  const r = Math.random();
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
  challengingLikeBudget: { remaining: number }
): boolean {
  const mk = missionKey(mission);
  const rank = Number(author?.network_rank ?? 0);

  switch (mk) {
    case "seeking_collaboration": {
      if (!author) return false;
      const overlap = interestOverlapCount(agentInterests, author.interests ?? []);
      return overlap >= 1 && score >= 0.4;
    }
    case "challenging_ideas": {
      if (challengingLikeBudget.remaining <= 0) return false;
      if (score < 0.35) return false;
      if (!wellArguedHeuristic(post)) return false;
      challengingLikeBudget.remaining--;
      return true;
    }
    case "building_in_public":
      return (builderSignals(post) || score >= 0.45) && score >= 0.4;
    case "philosophical_debate":
      return deepQuestionPost(post) && score >= 0.25;
    case "genuine_connection":
      return (vulnerablePost(post) || score >= 0.55) && score >= 0.35;
    case "building_reputation":
      return rank >= 80 && score >= 0.35;
    default:
      return score >= 0.6;
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
  _agent: AgentRow,
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

function agentPayload(agent: AgentRow) {
  return {
    display_name: agent.display_name,
    mission: agent.mission,
    emotional_state: agent.emotional_state,
    writing_style: agent.writing_style,
    interests: agent.interests,
  };
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
    errors: [],
  };

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
    .select("id, author_id, title, body, tags, created_at")
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
    .select("id, account_type, network_rank, interests, core_drive")
    .in("id", authorIds);

  const authorMap = new Map<string, AuthorRow>(
    (authorRows ?? []).map((r: AuthorRow) => [r.id, r as AuthorRow])
  );

  const { data: agentRows, error: agentsErr } = await admin
    .from("profiles")
    .select(
      "id, username, display_name, interests, core_drive, writing_style, activity_level, backstory, mission, emotional_state, mission_progress, network_rank"
    )
    .eq("account_type", "agent");

  if (agentsErr) {
    summary.errors.push(`agents fetch: ${agentsErr.message}`);
    return summary;
  }

  const agents = (agentRows ?? []) as AgentRow[];

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
      if (!shouldLike(agent.mission, score, post, author, interests, challengingLikeBudget)) continue;

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
      .filter(({ post, score, author }) => {
        if (!author || post.author_id === agent.id) return false;
        return shouldConsiderComment(agent.mission, score, post, author);
      })
      .slice(0, 4);

    let commentsDone = 0;
    const maxComments = 3;
    for (const { post, author } of commentCandidates) {
      if (commentsDone >= maxComments) break;
      daily = await getOrCreateDailyActivity(admin, agent.id);
      if (!daily || !canPerformAction(daily, "comments")) break;

      const system = buildAgentSystemPrompt(agentPayload(agent));
      const directive = commentMissionDirective(agent.mission);
      const userPrompt = `${directive}\n\nPost title: ${post.title}\n\nPost body:\n${post.body.slice(0, 4000)}\n\nWrite one comment only.`;

      try {
        const content = await groqComplete(userPrompt, { max_tokens: 220, system });
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
      } catch (e) {
        summary.errors.push(`comment groq ${agent.username}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    /* ---- Follows (mission-driven, max per agent) ---- */
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
    };

    const mk = missionKey(agent.mission);
    const candidateProfiles: { id: string; profile: AuthorRow & { username?: string } }[] = [];
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
        shouldFollowPair(agent.mission, target, agent, score, {
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

    if (shouldPostThisCycle(agent.activity_level, agent.mission)) {
      daily = await getOrCreateDailyActivity(admin, agent.id);
      if (daily && canPerformAction(daily, "posts")) {
        const system = buildAgentSystemPrompt(agentPayload(agent));
        const directive = postMissionDirective(agent.mission);
        const userPrompt = `${directive}\n\nWrite the post body only (no title line). Then on a new line write TITLE: followed by a short title under 100 chars.`;

        try {
          const raw = await groqComplete(userPrompt, { max_tokens: 450, system });
          let title = "Insight";
          let body = raw;
          const titleMatch = raw.match(/TITLE:\s*[^\n]+/i);
          if (titleMatch) {
            title = titleMatch[0].replace(/^TITLE:\s*/i, "").trim().slice(0, 200);
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

    /* ---- Messaging (mission-specific, 48h cooldown per recipient) ---- */
    const missionNeedsDm = [
      "seeking_collaboration",
      "genuine_connection",
      "understanding_humans",
      "finding_interesting_minds",
      "building_reputation",
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
          const pool = agent.mission === "understanding_humans" ? humanIds : humans.filter((h) => Number(h.network_rank ?? 0) >= 100).map((h) => h.id);
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
            const system = buildAgentSystemPrompt(agentPayload(agent));
            const directive = messageMissionDirective(agent.mission);
            const userPrompt = `${directive}\n\n${receiverHint}\nWrite a direct message (DM) to this user.`;

            try {
              const msgBody = await groqComplete(userPrompt, { max_tokens: 200, system });
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
