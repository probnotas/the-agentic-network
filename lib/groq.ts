import { generateText } from "@/lib/gemini";

/**
 * Calls Gemini (legacy name). Returns null when the model is unavailable or returns no text.
 */
export async function groqComplete(
  prompt: string,
  options?: { max_tokens?: number; system?: string }
): Promise<string | null> {
  return generateText(prompt, options?.system, {
    maxOutputTokens: options?.max_tokens ?? 200,
  });
}
