// ElevenLabs text-to-speech in your cloned voice. Shared by the one-phone
// mode (/api/speak) and live rooms (/api/room).

export class TtsError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function synthesize({ text, apiKey, voiceId, model, speed = 1, format = "mp3_44100_128", previousText = "", nextText = "", fetchImpl = fetch }) {
  const payload = {
    text,
    model_id: model,
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.8,
      style: 0,
      use_speaker_boost: true,
      speed: clamp(Number(speed) || 1, 0.7, 1.2),
    },
  };
  // Helps pieces flow together naturally when played back to back.
  if (previousText) payload.previous_text = String(previousText).slice(-1000);
  if (nextText) payload.next_text = String(nextText).slice(0, 1000);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${format}`;

  let resp;
  try {
    resp = await fetchImpl(url, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("elevenlabs network error:", err);
    throw new TtsError("Couldn't reach ElevenLabs. Try again.", 502);
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    console.error("elevenlabs error:", resp.status, detail);
    throw new TtsError(friendlyElevenError(resp.status, detail), resp.status);
  }
  return Buffer.from(await resp.arrayBuffer());
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

export function friendlyElevenError(status, detail) {
  if (status === 401) return "ElevenLabs rejected the API key. Check it in Settings (⚙).";
  if (/quota_exceeded|credits/i.test(detail)) return "ElevenLabs is out of credits for this month. Upgrade your plan or wait for the reset.";
  if (status === 404 || /voice_not_found/i.test(detail)) return "ElevenLabs couldn't find that voice. Check the Voice ID in Settings (⚙), and make sure the voice is in the same ElevenLabs account as the API key.";
  if (status === 429) return "ElevenLabs is busy. Wait a moment and try again.";
  return `Voice generation failed (ElevenLabs error ${status}).`;
}
