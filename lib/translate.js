import { glossaryText } from "./glossary.js";

export const MAX_INPUT_CHARS = 15000; // ~10+ minutes of talking

export function buildSystemPrompt() {
  return `You translate a hotel housekeeping manager's spoken preshift meeting from English into Spanish. The Spanish will be read aloud by a text-to-speech voice, so it must sound natural when heard, not read.

Audience: room attendants and housemen from many Latin American countries (Mexico, Colombia, Venezuela, Central America and others). Many have limited formal schooling. Some speak little English.

How to translate:
- Translate the MEANING, not word for word. Make every point clear to someone hearing it once.
- Use neutral Latin American Spanish. Address the group as "ustedes" (never "vosotros"). Avoid slang or words specific to one country.
- Use short, simple sentences and everyday words. Keep a warm, respectful, team-friendly tone, like a good manager talking to their team.
- Keep every fact exactly: room numbers, floor numbers, times, dates, counts, names of people, and names of places stay correct. Say numbers so they sound natural when spoken (for example "habitación 412" stays as digits; times like "9:30" stay as digits).
- The English came from speech recognition, so it may have small errors, missing punctuation, or filler ("um", "so yeah"). Fix obvious recognition mistakes using hotel context, and drop filler. Do not add information that was not said.
- If part of the English is truly unclear, translate your best reading and list it in "unclear_parts" so the manager can check it.
- Do not add a greeting or sign-off unless the manager said one.

Housekeeping terms (follow these):
${glossaryText()}

Split the Spanish into short paragraphs, one per topic, in the same order as the original. For each paragraph, also give a plain English back-translation of what the Spanish actually says, so the manager (who does not read Spanish) can confirm the meaning is right.`;
}

export const TRANSLATION_TOOL = {
  name: "deliver_translation",
  description: "Return the Spanish preshift split into paragraphs, with an English back-translation for each.",
  input_schema: {
    type: "object",
    properties: {
      paragraphs: {
        type: "array",
        description: "The preshift in Spanish, one short paragraph per topic, in order.",
        items: {
          type: "object",
          properties: {
            spanish: { type: "string", description: "Spanish text to be spoken aloud." },
            back_translation: { type: "string", description: "Plain English of what the Spanish says." },
          },
          required: ["spanish", "back_translation"],
        },
      },
      unclear_parts: {
        type: "array",
        description: "Short quotes of any English that was unclear or likely misheard. Empty if none.",
        items: { type: "string" },
      },
    },
    required: ["paragraphs", "unclear_parts"],
  },
};

export async function translateWithClaude({ english, apiKey, model, fetchImpl = fetch }) {
  const resp = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      system: buildSystemPrompt(),
      tools: [TRANSLATION_TOOL],
      tool_choice: { type: "tool", name: TRANSLATION_TOOL.name },
      messages: [
        {
          role: "user",
          content: `Here is today's preshift, as spoken in English:\n\n<preshift>\n${english}\n</preshift>`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(friendlyAnthropicError(resp.status, text));
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();
  const block = (data.content || []).find((b) => b.type === "tool_use");
  const out = block && block.input;
  if (!out || !Array.isArray(out.paragraphs) || out.paragraphs.length === 0) {
    throw new Error("The translator returned an empty result. Please try again.");
  }

  const paragraphs = out.paragraphs
    .map((p) => ({
      spanish: String(p.spanish || "").trim(),
      back_translation: String(p.back_translation || "").trim(),
    }))
    .filter((p) => p.spanish);

  return {
    paragraphs,
    unclear_parts: Array.isArray(out.unclear_parts) ? out.unclear_parts.map(String) : [],
    usage: data.usage || null,
  };
}

function friendlyAnthropicError(status, body) {
  if (status === 401) return "Translation service rejected the API key. Check ANTHROPIC_API_KEY in Vercel.";
  if (status === 400 && /credit balance/i.test(body)) return "Your Anthropic account is out of credits. Add credits at console.anthropic.com.";
  if (status === 429) return "Translation service is busy (rate limit). Wait a moment and try again.";
  if (status === 529 || status >= 500) return "Translation service is temporarily down. Try again in a minute.";
  return `Translation failed (error ${status}).`;
}
