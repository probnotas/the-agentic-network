/**
 * Gemini via REST (not @google/generative-ai). The official SDK calls `response.json()` on the
 * raw HTTP body; proxies/CDNs sometimes return HTML/plain "An error occurred…", which makes
 * `json()` throw: Unexpected token 'A', "An error o"... is not valid JSON.
 * Here we read text first and parse safely so failures are clear and groqComplete can return null.
 */

function resolvedApiKey(): string {
  const raw = process.env.GEMINI_API_KEY;
  const key =
    typeof raw === "string"
      ? raw
          .trim()
          .replace(/^['"]/, "")
          .replace(/['"]$/, "")
          .replace(/\s+/g, "")
      : "";
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return key;
}

/** Override via env if the default model id stops working for your API key. */
function modelId(): string {
  const m = process.env.GEMINI_MODEL?.trim();
  return m || "gemini-1.5-flash";
}

type GenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
};

function extractModelText(data: GenerateContentResponse): string {
  const block = data.promptFeedback?.blockReason;
  if (block) {
    throw new Error(`Gemini blocked prompt: ${block}`);
  }
  const c0 = data.candidates?.[0];
  const parts = c0?.content?.parts;
  if (!parts?.length) {
    const reason = c0?.finishReason ? ` (finishReason=${c0.finishReason})` : "";
    throw new Error(`Gemini returned no text in candidates${reason}`);
  }
  const texts = parts.map((p) => p.text ?? "").filter(Boolean);
  if (!texts.length) {
    throw new Error("Gemini candidate parts contained no text");
  }
  return texts.join("");
}

export async function generateText(
  prompt: string,
  systemPrompt?: string,
  options?: { maxOutputTokens?: number }
): Promise<string> {
  const apiKey = resolvedApiKey();
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
    throw new Error(`Gemini network error: ${msg}`);
  }

  const rawBody = await res.text();
  let data: GenerateContentResponse | null = null;
  if (rawBody.trim()) {
    try {
      data = JSON.parse(rawBody) as GenerateContentResponse;
    } catch {
      const preview = rawBody.slice(0, 200).replace(/\s+/g, " ");
      console.error("[gemini] Non-JSON HTTP body", { status: res.status, preview });
      throw new Error(
        `Gemini HTTP ${res.status}: body was not JSON (starts with: ${preview.slice(0, 120)}…). Often a proxy or bad API key URL.`
      );
    }
  }

  if (!res.ok) {
    const apiMsg =
      data?.error?.message ?? (rawBody.slice(0, 300) || `HTTP ${res.status}`);
    const status = data?.error?.status ?? "";
    console.error("[gemini] API error", res.status, status, apiMsg);
    throw new Error(`Gemini ${res.status}${status ? ` ${status}` : ""}: ${apiMsg}`);
  }

  if (data?.error?.message) {
    console.error("[gemini] error field in 200 body", data.error);
    throw new Error(`Gemini: ${data.error.message}`);
  }

  try {
    const text = extractModelText(data ?? {});
    if (!text.trim()) {
      throw new Error("Gemini returned empty content");
    }
    return text.trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[gemini] parse candidates failed:", msg, rawBody.slice(0, 400));
    throw e instanceof Error ? e : new Error(msg);
  }
}
