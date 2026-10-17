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
//   ui        – words on the Listen screen, in that language
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
    ui: { start: "Empezar a escuchar", listening: "Escuchando…", waiting: "Esperando a que empiece la reunión…", ended: "La reunión terminó.", keepOpen: "Mantenga esta pantalla abierta.", tapSound: "Toque aquí para activar el sonido otra vez.", leave: "Salir", notFound: "No encontramos esa sala. Revise el código." },
  },
  fr: {
    name: "French",
    native: "Français",
    speechTag: "fr-FR",
    dir: "ltr",
    guidance:
      'Use clear, standard French that is understood by speakers from France, Haiti, and West and Central Africa. Address the group as "vous". Avoid regional slang.',
    test: "Bonjour l'équipe. Ceci est un test de ma voix.",
    ui: { start: "Commencer l'écoute", listening: "Écoute en cours…", waiting: "En attente du début de la réunion…", ended: "La réunion est terminée.", keepOpen: "Gardez cet écran ouvert.", tapSound: "Touchez ici pour réactiver le son.", leave: "Quitter", notFound: "Salle introuvable. Vérifiez le code." },
  },
  pt: {
    name: "Portuguese",
    native: "Português",
    speechTag: "pt-BR",
    dir: "ltr",
    guidance: 'Use clear Brazilian Portuguese. Address the group as "vocês". Avoid slang.',
    test: "Olá, equipe. Este é um teste da minha voz.",
    ui: { start: "Começar a ouvir", listening: "Ouvindo…", waiting: "Aguardando a reunião começar…", ended: "A reunião terminou.", keepOpen: "Mantenha esta tela aberta.", tapSound: "Toque aqui para ativar o som de novo.", leave: "Sair", notFound: "Sala não encontrada. Confira o código." },
  },
  zh: {
    name: "Chinese (Mandarin)",
    native: "中文",
    speechTag: "zh-CN",
    dir: "ltr",
    guidance:
      "Write in Simplified Chinese characters, as spoken Mandarin. Use plain, everyday wording that sounds natural when read aloud. Write numbers, times and room numbers as digits.",
    test: "大家好。这是我的声音测试。",
    ui: { start: "开始收听", listening: "正在收听…", waiting: "等待会议开始…", ended: "会议已结束。", keepOpen: "请保持此页面打开。", tapSound: "点这里重新打开声音。", leave: "离开", notFound: "找不到这个房间。请检查代码。" },
  },
  ar: {
    name: "Arabic",
    native: "العربية",
    speechTag: "ar-SA",
    dir: "rtl",
    guidance:
      "Use simple Modern Standard Arabic that speakers of different dialects (Egyptian, Levantine, Iraqi, Gulf, North African) can all follow when they hear it. Prefer common everyday words over formal or literary ones. Write numbers, times and room numbers as Western digits (0-9).",
    test: "مرحباً يا فريق. هذا اختبار لصوتي.",
    ui: { start: "ابدأ الاستماع", listening: "جارٍ الاستماع…", waiting: "بانتظار بدء الاجتماع…", ended: "انتهى الاجتماع.", keepOpen: "أبقِ هذه الشاشة مفتوحة.", tapSound: "اضغط هنا لتشغيل الصوت مرة أخرى.", leave: "خروج", notFound: "لم يتم العثور على الغرفة. تحقق من الرمز." },
  },
  hi: {
    name: "Hindi",
    native: "हिन्दी",
    speechTag: "hi-IN",
    dir: "ltr",
    guidance:
      'Use everyday spoken Hindi in Devanagari script. Common English workplace words that Hindi speakers already use (like "room", "checkout", "VIP") may stay in English. Address the group respectfully with "आप".',
    test: "नमस्ते टीम। यह मेरी आवाज़ का परीक्षण है।",
    ui: { start: "सुनना शुरू करें", listening: "सुन रहे हैं…", waiting: "मीटिंग शुरू होने का इंतज़ार…", ended: "मीटिंग खत्म हो गई।", keepOpen: "यह स्क्रीन खुली रखें।", tapSound: "आवाज़ फिर से चालू करने के लिए यहाँ दबाएँ।", leave: "बाहर निकलें", notFound: "यह रूम नहीं मिला। कोड जाँचें।" },
  },
  fil: {
    name: "Filipino (Tagalog)",
    native: "Filipino",
    speechTag: "fil-PH",
    dir: "ltr",
    guidance:
      'Use natural everyday Filipino (Tagalog). Common English workplace words that Filipinos already use in conversation may stay in English (Taglish is fine where it sounds natural). Use "kayo" and "po" for respect.',
    test: "Magandang araw po, team. Ito ay pagsubok ng aking boses.",
    ui: { start: "Simulan ang pakikinig", listening: "Nakikinig…", waiting: "Hinihintay magsimula ang meeting…", ended: "Tapos na ang meeting.", keepOpen: "Panatilihing bukas ang screen na ito.", tapSound: "Pindutin dito para ibalik ang tunog.", leave: "Umalis", notFound: "Hindi mahanap ang room. Tingnan ang code." },
  },
  ko: {
    name: "Korean",
    native: "한국어",
    speechTag: "ko-KR",
    dir: "ltr",
    guidance: "Use polite, clear Korean (해요체 or 합니다체), suitable for a manager speaking to their team.",
    test: "여러분 안녕하세요. 제 목소리 테스트입니다.",
    ui: { start: "듣기 시작", listening: "듣는 중…", waiting: "회의 시작을 기다리는 중…", ended: "회의가 끝났습니다.", keepOpen: "이 화면을 켜 두세요.", tapSound: "소리를 다시 켜려면 여기를 누르세요.", leave: "나가기", notFound: "방을 찾을 수 없습니다. 코드를 확인하세요." },
  },
  ru: {
    name: "Russian",
    native: "Русский",
    speechTag: "ru-RU",
    dir: "ltr",
    guidance: 'Use clear, standard Russian. Address the group as "вы".',
    test: "Здравствуйте, команда. Это проверка моего голоса.",
    ui: { start: "Начать слушать", listening: "Слушаем…", waiting: "Ждём начала встречи…", ended: "Встреча окончена.", keepOpen: "Не закрывайте этот экран.", tapSound: "Нажмите здесь, чтобы снова включить звук.", leave: "Выйти", notFound: "Комната не найдена. Проверьте код." },
  },
  uk: {
    name: "Ukrainian",
    native: "Українська",
    speechTag: "uk-UA",
    dir: "ltr",
    guidance: 'Use clear, standard Ukrainian. Address the group as "ви".',
    test: "Привіт, командо. Це перевірка мого голосу.",
    ui: { start: "Почати слухати", listening: "Слухаємо…", waiting: "Чекаємо початку зустрічі…", ended: "Зустріч завершено.", keepOpen: "Не закривайте цей екран.", tapSound: "Натисніть тут, щоб знову увімкнути звук.", leave: "Вийти", notFound: "Кімнату не знайдено. Перевірте код." },
  },
  tr: {
    name: "Turkish",
    native: "Türkçe",
    speechTag: "tr-TR",
    dir: "ltr",
    guidance: 'Use clear, standard Turkish. Address the group as "siz".',
    test: "Merhaba ekip. Bu benim sesimin bir testi.",
    ui: { start: "Dinlemeye başla", listening: "Dinleniyor…", waiting: "Toplantının başlaması bekleniyor…", ended: "Toplantı bitti.", keepOpen: "Bu ekranı açık tutun.", tapSound: "Sesi tekrar açmak için buraya dokunun.", leave: "Çık", notFound: "Oda bulunamadı. Kodu kontrol edin." },
  },
};

export const DEFAULT_LANGUAGE = "es";

export function getLanguage(code) {
  return LANGUAGES[code] ? { code, ...LANGUAGES[code] } : { code: DEFAULT_LANGUAGE, ...LANGUAGES[DEFAULT_LANGUAGE] };
}
