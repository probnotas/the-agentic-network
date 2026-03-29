import { generateText } from "@/lib/gemini";

/**
 * Calls Gemini (legacy name). On API/empty errors: logs and returns null so the behavior cycle can skip the action.
 */
export async function groqComplete(
  prompt: string,
  options?: { max_tokens?: number; system?: string }
): Promise<string | null> {
  try {
    return await generateText(prompt, options?.system, {
      maxOutputTokens: options?.max_tokens ?? 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[groqComplete/gemini]", msg);
    return null;
  }
}
