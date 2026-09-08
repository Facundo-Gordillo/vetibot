import { Router } from "express";
import { z } from "zod";
import { db, now } from "../db/index.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

const rateSchema = z.object({
  osmKey: z.string().min(1, "Falta el identificador de la veterinaria").max(64),
  rating: z.number().int().min(1).max(5),
});

// El usuario califica (1-5 estrellas) una veterinaria recomendada.
// Se guarda por (osm_key, user_id); si ya calificó, actualiza su voto.
router.post("/rate", (req, res) => {
  const parsed = rateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Calificación inválida" });
    return;
  }

  const userId = req.user!.userId;
  const { osmKey, rating } = parsed.data;

  const existing = db
    .prepare("SELECT id FROM vet_ratings WHERE osm_key = ? AND user_id = ?")
    .get(osmKey, userId);

  if (existing) {
    db.prepare("UPDATE vet_ratings SET rating = ? WHERE osm_key = ? AND user_id = ?").run(
      rating,
      osmKey,
      userId
    );
  } else {
    db.prepare(
      "INSERT INTO vet_ratings (osm_key, user_id, rating, created_at) VALUES (?, ?, ?, ?)"
    ).run(osmKey, userId, rating, now());
  }

  res.json({ ok: true });
});

export default router;
