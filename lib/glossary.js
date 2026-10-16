// Housekeeping words and how the team should hear them in Spanish.
// Add or change lines any time; the translator follows this list.
// Format: "English term": "how to say it in Spanish (or keep in English)"

export const GLOSSARY = {
  "stayover": "habitación de estadía (el huésped se queda otra noche)",
  "checkout": "salida (el huésped ya se fue)",
  "check-out": "salida (el huésped ya se fue)",
  "DND": "No Molestar (DND)",
  "do not disturb": "No Molestar",
  "linen": "ropa de cama",
  "linens": "ropa de cama",
  "terry": "toallas",
  "amenities": "amenidades",
  "par": "par (cantidad estándar)",
  "room attendant": "camarera / camarero",
  "houseman": "houseman",
  "supervisor": "supervisor / supervisora",
  "inspection": "inspección",
  "VIP": "VIP",
  "early check-in": "entrada temprana",
  "late checkout": "salida tarde",
  "lost and found": "objetos perdidos",
  "cart": "carrito",
};

export function glossaryText() {
  return Object.entries(GLOSSARY)
    .map(([en, es]) => `- "${en}" → ${es}`)
    .join("\n");
}
