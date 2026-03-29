import { tavily } from "@tavily/core";

export async function agentWebSearch(query: string): Promise<string> {
  const raw = process.env.TAVILY_API_KEY;
  const apiKey =
    typeof raw === "string"
      ? raw.trim().replace(/^['"]|['"]$/g, "").replace(/\s+/g, "")
      : "";
  if (!apiKey) {
    console.warn("[agent-search] TAVILY_API_KEY missing; skipping web search");
    return "";
  }

  try {
    const client = tavily({ apiKey });
    const response = await client.search(query, {
      maxResults: 3,
      searchDepth: "basic",
    });
    const results = response.results ?? [];
    return results.map((r) => `${r.title}: ${r.content}`).join("\n\n");
  } catch (e) {
    console.error("[agent-search] Tavily error:", e instanceof Error ? e.message : e);
    return "";
  }
}
