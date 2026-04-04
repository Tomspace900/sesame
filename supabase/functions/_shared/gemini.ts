// Gemini API client — text + multimodal (inlineData)

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Tiering des modèles : classification cheap + rapide, extraction meilleure qualité
export const GEMINI_MODELS = {
  classification: "gemini-2.5-flash-lite",
  extraction: "gemini-2.5-flash",
} as const;

export type GeminiTextPart = { text: string };
export type GeminiInlineDataPart = {
  inlineData: { mimeType: string; data: string };
};
export type GeminiPart = GeminiTextPart | GeminiInlineDataPart;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Appel Gemini avec un tableau de parts (texte + inlineData pour les attachments).
export async function callGeminiWithParts(
  apiKey: string,
  parts: GeminiPart[],
  model: string
): Promise<string> {
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await sleep(Math.pow(2, attempt - 1) * 1000); // 1s, 2s
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Gemini attempt ${attempt + 1} failed (${res.status}): ${body}`);
      if (attempt === 2) {
        throw new Error(`Gemini API error (${res.status}): ${body}`);
      }
      continue;
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      if (attempt === 2) throw new Error("Gemini returned empty response");
      continue;
    }

    return text;
  }

  throw new Error("Gemini failed after 3 attempts");
}

// Appel Gemini texte seul (wrapper de commodité)
export async function callGemini(apiKey: string, prompt: string, model: string): Promise<string> {
  return callGeminiWithParts(apiKey, [{ text: prompt }], model);
}

// Strip markdown code fences si Gemini entoure le JSON de ```json ... ```
export function extractJson(raw: string): string {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : raw.trim();
}
