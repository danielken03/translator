// Languages the app can translate into.
// Used by both the phone app and the server, so this is the one list to edit.
//
// To add a language: copy an entry, change the fields, and redeploy.
//   name      – English name shown in menus
//   native    – the language's own name
//   speechTag – language tag for the phone's built-in voice (fallback voice)
//   dir       – "rtl" for right-to-left scripts (Arabic), otherwise "ltr"
//   guidance  – extra instructions for the translator for this language
//   test      – short sentence for "Test my voice"
//
// Every language here is supported by ElevenLabs' multilingual voice model,
// so your cloned voice can speak it.

export const LANGUAGES = {
  es: {
    name: "Spanish",
    native: "Español",
    speechTag: "es-US",
    dir: "ltr",
    guidance:
      'Use neutral Latin American Spanish that works for people from Mexico, Colombia, Venezuela, Central America and elsewhere. Address the group as "ustedes" (never "vosotros"). Avoid slang or words specific to one country.',
    test: "Hola equipo. Esta es una prueba de mi voz.",
  },
  fr: {
    name: "French",
    native: "Français",
    speechTag: "fr-FR",
    dir: "ltr",
    guidance:
      'Use clear, standard French that is understood by speakers from France, Haiti, and West and Central Africa. Address the group as "vous". Avoid regional slang.',
    test: "Bonjour l'équipe. Ceci est un test de ma voix.",
  },
  pt: {
    name: "Portuguese",
    native: "Português",
    speechTag: "pt-BR",
    dir: "ltr",
    guidance: 'Use clear Brazilian Portuguese. Address the group as "vocês". Avoid slang.',
    test: "Olá, equipe. Este é um teste da minha voz.",
  },
  zh: {
    name: "Chinese (Mandarin)",
    native: "中文",
    speechTag: "zh-CN",
    dir: "ltr",
    guidance:
      "Write in Simplified Chinese characters, as spoken Mandarin. Use plain, everyday wording that sounds natural when read aloud. Write numbers, times and room numbers as digits.",
    test: "大家好。这是我的声音测试。",
  },
  ar: {
    name: "Arabic",
    native: "العربية",
    speechTag: "ar-SA",
    dir: "rtl",
    guidance:
      "Use simple Modern Standard Arabic that speakers of different dialects (Egyptian, Levantine, Iraqi, Gulf, North African) can all follow when they hear it. Prefer common everyday words over formal or literary ones. Write numbers, times and room numbers as Western digits (0-9).",
    test: "مرحباً يا فريق. هذا اختبار لصوتي.",
  },
  hi: {
    name: "Hindi",
    native: "हिन्दी",
    speechTag: "hi-IN",
    dir: "ltr",
    guidance:
      'Use everyday spoken Hindi in Devanagari script. Common English workplace words that Hindi speakers already use (like "room", "checkout", "VIP") may stay in English. Address the group respectfully with "आप".',
    test: "नमस्ते टीम। यह मेरी आवाज़ का परीक्षण है।",
  },
  fil: {
    name: "Filipino (Tagalog)",
    native: "Filipino",
    speechTag: "fil-PH",
    dir: "ltr",
    guidance:
      'Use natural everyday Filipino (Tagalog). Common English workplace words that Filipinos already use in conversation may stay in English (Taglish is fine where it sounds natural). Use "kayo" and "po" for respect.',
    test: "Magandang araw po, team. Ito ay pagsubok ng aking boses.",
  },
  ko: {
    name: "Korean",
    native: "한국어",
    speechTag: "ko-KR",
    dir: "ltr",
    guidance: "Use polite, clear Korean (해요체 or 합니다체), suitable for a manager speaking to their team.",
    test: "여러분 안녕하세요. 제 목소리 테스트입니다.",
  },
  ru: {
    name: "Russian",
    native: "Русский",
    speechTag: "ru-RU",
    dir: "ltr",
    guidance: 'Use clear, standard Russian. Address the group as "вы".',
    test: "Здравствуйте, команда. Это проверка моего голоса.",
  },
  uk: {
    name: "Ukrainian",
    native: "Українська",
    speechTag: "uk-UA",
    dir: "ltr",
    guidance: 'Use clear, standard Ukrainian. Address the group as "ви".',
    test: "Привіт, командо. Це перевірка мого голосу.",
  },
  tr: {
    name: "Turkish",
    native: "Türkçe",
    speechTag: "tr-TR",
    dir: "ltr",
    guidance: 'Use clear, standard Turkish. Address the group as "siz".',
    test: "Merhaba ekip. Bu benim sesimin bir testi.",
  },
};

export const DEFAULT_LANGUAGE = "es";

export function getLanguage(code) {
  return LANGUAGES[code] ? { code, ...LANGUAGES[code] } : { code: DEFAULT_LANGUAGE, ...LANGUAGES[DEFAULT_LANGUAGE] };
}
