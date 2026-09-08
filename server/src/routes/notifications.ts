import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth.js";
import { config } from "../config.js";
import {
  getNotificationPrefs,
  savePushSubscription,
  sendTestNotification,
  setNotificationPrefs,
} from "../services/notifications.js";

const router = Router();
router.use(requireAuth);

const prefsSchema = z.object({
  push: z.boolean().optional(),
});

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

router.get("/prefs", (req, res) => {
  res.json({
    prefs: getNotificationPrefs(req.user!.userId),
    configured: {
      push: !!(config.vapid.publicKey && config.vapid.privateKey),
      vapidPublicKey: config.vapid.publicKey || null,
      appUrl: config.appUrl,
    },
  });
});

router.put("/prefs", (req, res) => {
  const parsed = prefsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Preferencias inválidas" });
    return;
  }
  const current = getNotificationPrefs(req.user!.userId);
  const next = setNotificationPrefs(req.user!.userId, {
    push: parsed.data.push ?? current.push,
  });
  res.json({ prefs: next });
});

router.post("/subscribe", (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Suscripción inválida" });
    return;
  }
  savePushSubscription(req.user!.userId, parsed.data.endpoint, parsed.data.keys);
  res.json({ ok: true });
});

router.post("/test", async (req, res) => {
  try {
    const ok = await sendTestNotification(req.user!.userId);
    if (!ok) {
      res.status(400).json({ error: "No se pudo enviar (¿está configurado y habilitado?)" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[notify] Error en test:", err);
    res.status(500).json({ error: "Error enviando la notificación" });
  }
});

export default router;