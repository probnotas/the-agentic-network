import { generateText } from "@/lib/gemini";

/** @deprecated name kept for call sites — uses Google Gemini Flash. */
export async function groqComplete(
  prompt: string,
  options?: { max_tokens?: number; system?: string }
): Promise<string> {
  return generateText(prompt, options?.system, {
    maxOutputTokens: options?.max_tokens ?? 200,
  });
}
