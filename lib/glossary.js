// Housekeeping words and what they mean, so they translate correctly
// into any language. Add or change lines any time.
//
//   "English term": { meaning: "what it means", es: "preferred Spanish (optional)" }
//
// Add a language code (fr, zh, ar, ...) next to "es" to pin the exact
// wording for that language too. If there's no entry for a language,
// the translator uses the meaning to pick the right words.

export const GLOSSARY = {
  "stayover": { meaning: "a room where the guest is staying another night (light cleaning, guest still there)", es: "habitación de estadía" },
  "checkout": { meaning: "a room where the guest has left (full cleaning for the next guest)", es: "salida" },
  "DND": { meaning: "Do Not Disturb sign on the door; do not enter", es: "No Molestar" },
  "linen": { meaning: "sheets, pillowcases and bedding", es: "ropa de cama" },
  "terry": { meaning: "towels and bath mats", es: "toallas" },
  "amenities": { meaning: "small guest supplies like soap, shampoo, coffee", es: "amenidades" },
  "par": { meaning: "the standard number of each item to stock", es: "par" },
  "room attendant": { meaning: "the employee who cleans guest rooms", es: "camarera / camarero" },
  "houseman": { meaning: "employee who supports room attendants: carries linen, trash, supplies", es: "houseman" },
  "inspection": { meaning: "a supervisor checking a cleaned room", es: "inspección" },
  "VIP": { meaning: "important guest who needs extra care", es: "VIP" },
  "early check-in": { meaning: "guest arriving before normal check-in time; room needed early", es: "entrada temprana" },
  "late checkout": { meaning: "guest leaving after normal checkout time", es: "salida tarde" },
  "lost and found": { meaning: "items guests left behind", es: "objetos perdidos" },
  "cart": { meaning: "the housekeeping cart with supplies", es: "carrito" },
};

export function glossaryText(langCode) {
  return Object.entries(GLOSSARY)
    .map(([en, entry]) => {
      const pinned = entry[langCode];
      return pinned
        ? `- "${en}" (${entry.meaning}) → say: ${pinned}`
        : `- "${en}" means ${entry.meaning}`;
    })
    .join("\n");
}
