import { GoogleGenerativeAI } from "@google/generative-ai";

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

export async function generateText(
  prompt: string,
  systemPrompt?: string,
  options?: { maxOutputTokens?: number }
): Promise<string> {
  const genAI = new GoogleGenerativeAI(resolvedApiKey());
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    ...(options?.maxOutputTokens != null
      ? { generationConfig: { maxOutputTokens: options.maxOutputTokens } }
      : {}),
  });
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  const result = await model.generateContent(fullPrompt);
  const response = result.response;
  const text = response.text();
  if (!text || !text.trim()) {
    throw new Error("Gemini returned empty content");
  }
  return text.trim();
}
