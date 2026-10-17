import { glossaryText } from "./glossary.js";
import { getLanguage } from "../public/languages.js";

export const MAX_INPUT_CHARS = 15000; // ~10+ minutes of talking

export function buildSystemPrompt(langCode) {
  const lang = getLanguage(langCode);
  return `You translate a manager's spoken team meeting (for example, a hotel housekeeping preshift) from English into ${lang.name}. The ${lang.name} will be read aloud by a text-to-speech voice, so it must sound natural when heard, not read.

Audience: hotel staff such as room attendants and housemen. Many are immigrants with different levels of formal schooling, and some speak little English.

How to translate:
- Translate the MEANING, not word for word. Make every point clear to someone hearing it once.
- ${lang.guidance}
- Use short, simple sentences and everyday words. Keep a warm, respectful, team-friendly tone, like a good manager talking to their team.
- Keep every fact exactly: room numbers, floor numbers, times, dates, counts, names of people, and names of places stay correct. Write numbers so they sound natural when spoken.
- The English came from speech recognition, so it may have small errors, missing punctuation, or filler ("um", "so yeah"). Fix obvious recognition mistakes using hotel context, and drop filler. Do not add information that was not said.
- If part of the English is truly unclear, translate your best reading and list it in "unclear_parts" so the manager can check it.
- Do not add a greeting or sign-off unless the manager said one.

Hotel and housekeeping terms. Use these meanings to pick the right words, and use the given wording where one is listed. Don't add explanations of these terms unless the manager explained them:
${glossaryText(lang.code)}

Split the ${lang.name} into short paragraphs, one per topic, in the same order as the original. For each paragraph, also give a plain English back-translation of what the ${lang.name} actually says, so the manager (who does not read ${lang.name}) can confirm the meaning is right.`;
}

export const TRANSLATION_TOOL = {
  name: "deliver_translation",
  description: "Return the translated meeting split into paragraphs, with an English back-translation for each.",
  input_schema: {
    type: "object",
    properties: {
      paragraphs: {
        type: "array",
        description: "The translated meeting, one short paragraph per topic, in order.",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "Translated text to be spoken aloud." },
            back_translation: { type: "string", description: "Plain English of what the translation says." },
          },
          required: ["text", "back_translation"],
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

export async function translateWithClaude({ english, language, apiKey, model, fetchImpl = fetch }) {
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
      system: buildSystemPrompt(language),
      tools: [TRANSLATION_TOOL],
      tool_choice: { type: "auto" },
      messages: [
        {
          role: "user",
          content: `Here is what I said, in English:\n\n<speech>\n${english}\n</speech>\n\nReply only by calling the ${TRANSLATION_TOOL.name} tool.`,
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
  const out = extractResult(data);
  if (!out || !Array.isArray(out.paragraphs) || out.paragraphs.length === 0) {
    throw new Error("The translator returned an empty result. Please try again.");
  }

  const paragraphs = out.paragraphs
    .map((p) => ({
      text: String(p.text || "").trim(),
      back_translation: String(p.back_translation || "").trim(),
    }))
    .filter((p) => p.text);

  return {
    paragraphs,
    unclear_parts: Array.isArray(out.unclear_parts) ? out.unclear_parts.map(String) : [],
    usage: data.usage || null,
  };
}

// Normally the result arrives as a tool call. If the model answers in plain
// text instead, accept JSON written in the text as a fallback.
export function extractResult(data) {
  const blocks = data.content || [];
  const tool = blocks.find((b) => b.type === "tool_use" && b.name === TRANSLATION_TOOL.name);
  if (tool && tool.input) return tool.input;
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch {}
  }
  return null;
}

function friendlyAnthropicError(status, body) {
  if (status === 401) return "Translation service rejected the API key. Check ANTHROPIC_API_KEY in Vercel.";
  if (status === 400 && /credit balance/i.test(body)) return "Your Anthropic account is out of credits. Add credits at console.anthropic.com.";
  if (status === 429) return "Translation service is busy (rate limit). Wait a moment and try again.";
  if (status === 529 || status >= 500) return "Translation service is temporarily down. Try again in a minute.";
  return `Translation failed (error ${status}).`;
}

/* ---------- Live rooms: one sentence at a time ---------- */

export function buildLivePrompt(langCode) {
  const lang = getLanguage(langCode);
  return `You are a live interpreter. A manager is speaking to their team (for example, a hotel housekeeping preshift) in English. Each time they pause, you get the newest piece of what they said and translate it into ${lang.name}. A text-to-speech voice reads your translation aloud right away to listeners wearing earbuds.

Audience: hotel staff such as room attendants and housemen. Many are immigrants with different levels of formal schooling.

How to translate:
- Translate the MEANING of the new piece only. The earlier pieces are given for context so pronouns, topics and terms stay consistent. Never repeat what was already said.
- ${lang.guidance}
- Use short, simple sentences and everyday words. Warm, respectful tone.
- Keep every fact exactly: room numbers, floors, times, counts, names.
- The English came from speech recognition, so fix obvious recognition mistakes using hotel context and drop filler ("um", "so yeah"). If the new piece is only filler or noise, return an empty text.
- If the new piece is an unfinished sentence, translate it naturally so it still makes sense when heard.

Hotel and housekeeping terms. Use these meanings to pick the right words, and the given wording where one is listed. Don't add explanations:
${glossaryText(lang.code)}`;
}

export const LINE_TOOL = {
  name: "deliver_line",
  description: "Return the translation of the newest piece of speech.",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string", description: "The translation to speak aloud. Empty if the piece was only filler or noise." },
    },
    required: ["text"],
  },
};

export async function translateLine({ english, context = [], language, apiKey, model, fetchImpl = fetch }) {
  const earlier = context.filter(Boolean).slice(-4);
  const content =
    (earlier.length ? `Earlier pieces (already translated, for context only):\n<earlier>\n${earlier.join("\n")}\n</earlier>\n\n` : "") +
    `New piece to translate:\n<new>\n${english}\n</new>\n\nReply only by calling the ${LINE_TOOL.name} tool.`;

  const resp = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: buildLivePrompt(language),
      tools: [LINE_TOOL],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content }],
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(friendlyAnthropicError(resp.status, text));
    err.status = resp.status;
    throw err;
  }
  const data = await resp.json();
  const blocks = data.content || [];
  const tool = blocks.find((b) => b.type === "tool_use" && b.name === LINE_TOOL.name);
  if (tool && tool.input && typeof tool.input.text === "string") return tool.input.text.trim();
  // Fallback: plain text reply
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return String(JSON.parse(m[0]).text || "").trim(); } catch {} }
  return text;
}
