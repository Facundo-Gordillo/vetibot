import { db, now } from "../db/index.js";

/** Devuelve un resumen legible de las mascotas conocidas del usuario, o "" si no hay. */
export function getPetsSummary(userId: number): string {
  const pets = db
    .prepare("SELECT name, animal_type FROM pets WHERE user_id = ? ORDER BY id ASC")
    .all(userId) as Array<{ name: string; animal_type: string }>;

  if (pets.length === 0) return "";
  const parts = pets.map((p) => `${p.name} (${p.animal_type})`);
  return `el dueño tiene ${pets.length === 1 ? "1 mascota" : `${pets.length} mascotas`}: ${parts.join(", ")}.`;
}

/** Guarda (o actualiza) la mascota mencionada por el dueño para el contexto futuro. */
export function rememberPet(userId: number, name: string, animalType: string): void {
  const n = (name || "").trim();
  const t = (animalType || "").trim();
  if (!n || !t) return;

  const existing = db
    .prepare("SELECT id, name FROM pets WHERE user_id = ? AND lower(name) = lower(?)")
    .get(userId, n) as { id: number; name: string } | undefined;

  if (existing && existing.name !== n) {
    db.prepare("UPDATE pets SET name = ? WHERE id = ?").run(n, existing.id);
    return;
  }
  if (existing) return;

  db.prepare(
    "INSERT INTO pets (user_id, name, animal_type, created_at) VALUES (?, ?, ?, ?)"
  ).run(userId, n, t, now());
}