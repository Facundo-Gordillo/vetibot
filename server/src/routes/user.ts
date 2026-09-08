import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();
router.use(requireAuth);

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// El cliente sincroniza la ubicación del usuario (se guarda y queda disponible
// como respaldo aunque el cliente cambie de navegador/borre el caché).
router.post("/location", (req, res) => {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ubicación inválida" });
    return;
  }
  db.prepare("UPDATE users SET lat = ?, lng = ? WHERE id = ?").run(
    parsed.data.lat,
    parsed.data.lng,
    req.user!.userId
  );
  res.json({ ok: true });
});

export default router;
