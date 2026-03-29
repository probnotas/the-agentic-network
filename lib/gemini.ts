/**
 * Gemini via REST. Reads response as text first, then JSON.parse safely.
 * On any failure: logs full body, returns null (no throw) so the behavior cycle continues.
 */

function resolvedApiKey(): string | null {
  const raw = process.env.GEMINI_API_KEY;
  const key =
    typeof raw === "string"
      ? raw
          .trim()
          .replace(/^['"]/, "")
          .replace(/['"]$/, "")
          .replace(/\s+/g, "")
      : "";
  return key || null;
}

/** Default: gemini-2.0-flash (active free tier). Override with GEMINI_MODEL. */
function modelId(): string {
  const m = process.env.GEMINI_MODEL?.trim();
  return m || "gemini-2.0-flash";
}

type GenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

function extractModelText(data: GenerateContentResponse): string | null {
  const block = data.promptFeedback?.blockReason;
  if (block) {
    console.error("[gemini] prompt blocked:", block);
    return null;
  }
  const c0 = data.candidates?.[0];
  const parts = c0?.content?.parts;
  if (!parts?.length) {
    const reason = c0?.finishReason ? ` (finishReason=${c0.finishReason})` : "";
    console.error("[gemini] no candidate text", reason);
    return null;
  }
  const texts = parts.map((p) => p.text ?? "").filter(Boolean);
  if (!texts.length) return null;
  const t = texts.join("").trim();
  return t || null;
}

/**
 * Returns model text, or null on any API / parse / empty outcome (never throws for HTTP errors).
 */
export async function generateText(
  prompt: string,
  systemPrompt?: string,
  options?: { maxOutputTokens?: number }
): Promise<string | null> {
  const apiKey = resolvedApiKey();
  if (!apiKey) {
    console.error("[gemini] GEMINI_API_KEY is not set");
    return null;
  }

  const model = modelId();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body: Record<string, unknown> = {};
  if (systemPrompt?.trim()) {
    body.systemInstruction = { parts: [{ text: systemPrompt.trim() }] };
    body.contents = [{ role: "user", parts: [{ text: prompt }] }];
  } else {
    body.contents = [{ role: "user", parts: [{ text: prompt }] }];
  }
  if (options?.maxOutputTokens != null) {
    body.generationConfig = { maxOutputTokens: options.maxOutputTokens };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[gemini] fetch failed:", msg);
    return null;
  }

  const rawBody = await res.text();

  // Always log non-OK bodies in full for debugging (404 model name, etc.)
  if (!res.ok) {
    console.error("[gemini] non-OK response — full body:\n", rawBody);
  }

  if (!rawBody.trim()) {
    console.error("[gemini] empty HTTP body, status=", res.status);
    return null;
  }

  let data: GenerateContentResponse | null = null;
  try {
    data = JSON.parse(rawBody) as GenerateContentResponse;
  } catch {
    console.error("[gemini] response was not valid JSON — full body:\n", rawBody);
    return null;
  }

  if (!res.ok) {
    const apiMsg =
      data?.error?.message ?? (rawBody.slice(0, 500) || `HTTP ${res.status}`);
    const status = data?.error?.status ?? "";
    console.error("[gemini] API error", res.status, status, apiMsg);
    return null;
  }

  if (data?.error?.message) {
    console.error("[gemini] error field in body", data.error);
    return null;
  }

  const text = extractModelText(data ?? {});
  if (!text) {
    console.error("[gemini] could not extract text; raw snippet:\n", rawBody.slice(0, 800));
    return null;
  }
  return text;
}
