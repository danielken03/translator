# Voice Translator

Speak in English (like a housekeeping preshift). The app translates the meaning into the language you pick (Spanish, French, Portuguese, Chinese, Arabic, Hindi, Filipino, Korean, Russian, Ukrainian or Turkish) and plays it through your Bluetooth speaker in your own cloned voice.

**Live at:** https://translate.kenndoesdev.com

## How it works

1. **Speak**: your phone's built-in voice typing turns your English into text (free). You can fix any mistakes before translating.
2. **Translate**: Claude translates the meaning, not word for word, split into short paragraphs. Each paragraph has a "What this says in English" check, and anything that sounded misheard gets flagged.
3. **Play**: ElevenLabs speaks each paragraph in your cloned voice. The audio is saved on your phone, so replays cost nothing.

Until your ElevenLabs voice is added, the app plays the Spanish with your phone's built-in Spanish voice (free), so you can start using it right away.

Works in Chrome on Android and Safari on iPhone. You can add it to your home screen like an app.

## Setup

### 1. Anthropic (translation)
- Log in at https://console.anthropic.com (or create a new account).
- **Billing** → add credits ($5 lasts a long time; each preshift costs a few cents at most).
- **API Keys** → Create key → copy it.

### 2. ElevenLabs (your voice)
You can add your voice right in the app: tap ⚙ → **Your ElevenLabs voice**, paste the Voice ID and API key, tap **Save**, then **Test my voice**. They're saved only on that phone. (Or put them in Vercel as below so every phone uses them.)

- Subscribe to **Starter** (Instant Voice Clone) or **Creator** (Professional Voice Clone, sounds more like you, more credits).
- **Voices → Add voice → Instant Voice Clone**: upload 1–3 minutes of clean recordings of you talking (quiet room, no music).
- Open your new voice → copy the **Voice ID**.
- **Developers → API Keys** → create a key → copy it.

### 3. Vercel
- **Add New → Project** → import this GitHub repo. Framework preset: **Other**. No build command needed.
- **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `APP_PASSCODE` | A passcode you choose (you'll type it once per phone) |
| `ANTHROPIC_API_KEY` | From step 1 |
| `ELEVENLABS_API_KEY` | From step 2 |
| `ELEVENLABS_VOICE_ID` | From step 2 |

Optional: `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `ELEVENLABS_MODEL` (default `eleven_multilingual_v2`; `eleven_flash_v2_5` uses about half the credits).

- Redeploy after adding variables.
- In the app, tap the ⚙ settings button to confirm everything shows ✓.

### 4. Move the subdomain (shoe → translate)
1. In Vercel, open the **old project** that uses `shoe.kenndoesdev.com` → Settings → Domains → remove it.
2. Open **this project** → Settings → Domains → add `translate.kenndoesdev.com`.
3. Vercel shows the DNS record it needs (usually a CNAME pointing to a `vercel-dns` address). In **Squarespace → Domains → kenndoesdev.com → DNS**:
   - Delete the `shoe` CNAME record.
   - Add a CNAME with host `translate` and the value Vercel shows.
4. Wait a few minutes until Vercel shows the domain as Valid.

## Adding a language

Edit `public/languages.js`. Copy an entry and change the name, voice tag and the short `guidance` line (which dialect, formal or informal "you", etc.). Stick to languages ElevenLabs' multilingual model supports so your cloned voice can speak them.

## Editing the translation

- **Housekeeping words**: edit `lib/glossary.js`. Each term has a meaning (used for every language) and optional exact wording per language.
- **Tone and style rules**: edit `buildSystemPrompt()` in `lib/translate.js`.

## Using it at preshift

- Some Android phones beep when voice typing starts. If the beep plays through the Bluetooth speaker, turn the speaker on after you finish speaking in English.
- Tap the big button, talk, tap again to stop. Fix anything misheard, then tap **Translate**.
- Glance at the yellow "double-check" box, if there is one, then tap **Play in Spanish**.
- If a preshift goes long, the app keeps listening. It restarts by itself if the browser pauses after silence.

## Future: user accounts

All keys are read in one place, `lib/config.js`. To let other managers use their own ElevenLabs account, add sign-in and look up that user's saved key and voice ID there. Nothing else needs to change.

## Development

```
npm test
```
