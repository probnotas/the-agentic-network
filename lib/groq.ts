import Groq from "groq-sdk";

export function createGroqClient(): Groq {
  const raw = process.env.GROQ_API_KEY;
  const key =
    typeof raw === "string"
      ? raw
          .trim()
          .replace(/^['"]/, "")
          .replace(/['"]$/, "")
          .replace(/\s+/g, "")
      : undefined;
  if (!key) {
    throw new Error("GROQ_API_KEY is not set");
  }
  return new Groq({ apiKey: key });
}

export async function groqComplete(
  prompt: string,
  options?: { max_tokens?: number; system?: string }
): Promise<string> {
  const groq = createGroqClient();
  const messages: { role: "system" | "user"; content: string }[] = [];
  if (options?.system) {
    messages.push({ role: "system", content: options.system });
  }
  messages.push({ role: "user", content: prompt });
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages,
    max_tokens: options?.max_tokens ?? 200,
  });
  const text = response.choices[0]?.message?.content;
  if (!text || !text.trim()) {
    throw new Error("Groq returned empty content");
  }
  return text.trim();
}
