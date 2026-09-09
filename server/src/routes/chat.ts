import { Router, raw } from "express";
import { z } from "zod";
import { db, now, withTransaction } from "../db/index.js";
import { requireAuth } from "../middlewares/auth.js";
import { getAiReply } from "../services/ai.js";
import { findNearbyVets } from "../services/places.js";
import { resetUnanswered, scheduleFollowUp } from "../services/followup.js";
import { getPetsSummary, rememberPet } from "../services/pets.js";
import { transcribeAudio, transcriptionEnabled } from "../services/transcribe.js";
import type { VetPlace } from "../types.js";

const router = Router();

const sendSchema = z.object({
  message: z.string().trim().min(1, "El mensaje no puede estar vacío").max(2000),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
});

interface MessageRow {
  id: number;
  role: "user" | "assistant";
  category: string | null;
  content: string;
  created_at: string;
}

interface MessageWithVets extends MessageRow {
  vets: VetPlace[];
}

const LOCATION_PROMPT_YELLOW =
  "📍 Para mostrarte veterinarias cerca, compartí tu ubicación con el botón de abajo. Mientras tanto, observá a tu mascota: si aparecen signos de alarma, avisame de nuevo.";

const LOCATION_PROMPT_RED =
  "🚨 **Andá YA a la clínica veterinaria más cercana**, no esperes. Compartí tu ubicación (botón de abajo) y te muestro las opciones más cerca de donde estás.";

router.use(requireAuth);

function getHistory(userId: number): MessageRow[] {
  return db
    .prepare(
      `SELECT id, role, category, content, created_at FROM messages
       WHERE user_id = ? ORDER BY id ASC LIMIT 200`
    )
    .all(userId) as unknown as MessageRow[];
}

/** Ratings agregados por osm_key (promedio, cantidad y voto del usuario). */
function getVetRatings(osmKeys: string[], userId: number): Map<string, { avg: number | null; count: number; mine: number | null }> {
  const map = new Map<string, { avg: number | null; count: number; mine: number | null }>();
  if (osmKeys.length === 0) return map;

  const placeholders = osmKeys.map(() => "?").join(",");
  const agg = db
    .prepare(
      `SELECT osm_key, AVG(rating) AS avg, COUNT(*) AS cnt FROM vet_ratings
       WHERE osm_key IN (${placeholders}) GROUP BY osm_key`
    )
    .all(...osmKeys) as Array<{ osm_key: string; avg: number; cnt: number }>;

  const mine = db
    .prepare(
      `SELECT osm_key, rating FROM vet_ratings
       WHERE user_id = ? AND osm_key IN (${placeholders})`
    )
    .all(userId, ...osmKeys) as Array<{ osm_key: string; rating: number }>;

  const mineMap = new Map(mine.map((m) => [m.osm_key, m.rating]));
  for (const a of agg) {
    map.set(a.osm_key, {
      avg: a.avg,
      count: a.cnt,
      mine: mineMap.get(a.osm_key) ?? null,
    });
  }
  for (const k of osmKeys) {
    if (!map.has(k)) map.set(k, { avg: null, count: 0, mine: mineMap.get(k) ?? null });
  }
  return map;
}

function getVetsForMessages(
  messageIds: number[],
  userId: number
): Map<number, VetPlace[]> {
  const map = new Map<number, VetPlace[]>();
  if (messageIds.length === 0) return map;

  const placeholders = messageIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT message_id, osm_key, name, address, rating, distance_meters, phone, website,
              open_now, opening_hours, next_change, sponsored, badge
       FROM vet_recommendations WHERE message_id IN (${placeholders})`
    )
    .all(...messageIds) as Array<{
    message_id: number;
    osm_key: string | null;
    name: string;
    address: string | null;
    rating: number | null;
    distance_meters: number | null;
    phone: string | null;
    website: string | null;
    open_now: number | null;
    opening_hours: string | null;
    next_change: string | null;
    sponsored: number | null;
    badge: string | null;
  }>;

  const keys = [...new Set(rows.map((r) => r.osm_key).filter((k): k is string => Boolean(k)))];
  const ratings = getVetRatings(keys, userId);

  for (const r of rows) {
    if (!map.has(r.message_id)) map.set(r.message_id, []);
    const osmKey = r.osm_key ?? `${r.name}|${r.address ?? ""}`;
    const rating = ratings.get(osmKey);
    map.get(r.message_id)!.push({
      osmKey,
      name: r.name,
      address: r.address ?? null,
      rating: rating?.avg ?? r.rating ?? null,
      ratingCount: rating?.count ?? 0,
      myRating: rating?.mine ?? null,
      distanceMeters: r.distance_meters ?? null,
      phone: r.phone ?? null,
      website: r.website ?? null,
      openNow: r.open_now === null ? null : Boolean(r.open_now),
      openingHours: r.opening_hours ?? null,
      nextChangeText: r.next_change ?? null,
      sponsored: Boolean(r.sponsored),
      badge: r.badge ?? null,
    });
  }
  return map;
}

function insertVetRecommendations(messageId: number, vets: VetPlace[]) {
  const stmt = db.prepare(
    `INSERT INTO vet_recommendations
      (message_id, osm_key, name, address, rating, distance_meters, phone, website,
       open_now, opening_hours, next_change, sponsored, badge)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  withTransaction(() => {
    for (const v of vets) {
      stmt.run(
        messageId,
        v.osmKey,
        v.name,
        v.address,
        v.rating,
        v.distanceMeters ?? null,
        v.phone,
        v.website,
        v.openNow == null ? null : (v.openNow ? 1 : 0),
        v.openingHours,
        v.nextChangeText,
        v.sponsored ? 1 : 0,
        v.badge
      );
    }
  });
}

function vetsIntroMessage(vets: VetPlace[]): string {
  const openCount = vets.filter((v) => v.openNow === true).length;
  const sponsored = vets.filter((v) => v.sponsored).length;
  const base =
    openCount > 0
      ? `Encontré **${vets.length} veterinarias** cerca de tu ubicación y **${openCount} están abiertas ahora mismo**. Te las muestro priorizando las que están disponibles:`
      : `Encontré **${vets.length} veterinarias** cerca de tu ubicación. Mirá los horarios de cada una:`;
  if (sponsored > 0) return `🏥 ${base}\n_*${sponsored} son veterinarias aliadas*_ (marcadas con ⭐).`;
  return `🏥 ${base}`;
}

function insertAssistant(
  userId: number,
  category: string,
  content: string
): { id: number; row: MessageWithVets } {
  const id = Number(
    db
      .prepare(
        "INSERT INTO messages (user_id, role, category, content, created_at) VALUES (?, 'assistant', ?, ?, ?)"
      )
      .run(userId, category, content, now()).lastInsertRowid
  );
  return { id, row: { id, role: "assistant", category, content, created_at: now(), vets: [] } };
}

router.get("/history", (req, res) => {
  const rows = getHistory(req.user!.userId);
  const vetsMap = getVetsForMessages(
    rows.filter((r) => r.role === "assistant").map((r) => r.id),
    req.user!.userId
  );

  const enriched: MessageWithVets[] = rows.map((r) => ({
    ...r,
    vets: r.role === "assistant" ? (vetsMap.get(r.id) ?? []) : [],
  }));

  res.json({ messages: enriched });
});

router.get("/voice-status", (_req, res) => {
  res.json({ enabled: transcriptionEnabled() });
});

// El audio llega como body binario (no JSON), así que este endpoint tiene su
// propio parser scopeado a la ruta: express.json() de arriba solo intercepta
// Content-Type application/json, así que no pisa esto.
router.post(
  "/transcribe",
  raw({ type: () => true, limit: "10mb" }),
  async (req, res) => {
    try {
      if (!transcriptionEnabled()) {
        res.status(501).json({ error: "La transcripción de voz no está configurada." });
        return;
      }
      const buffer = req.body as Buffer;
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        res.status(400).json({ error: "No llegó audio para transcribir." });
        return;
      }
      const mimeType = req.headers["content-type"] || "audio/webm";
      const text = await transcribeAudio(buffer, mimeType);
      if (!text) {
        res.status(422).json({ error: "No se entendió el audio. Probá grabar de nuevo, más cerca del micrófono." });
        return;
      }
      res.json({ text });
    } catch (err) {
      console.error("[chat] Error en /transcribe:", err);
      res.status(502).json({ error: "No se pudo transcribir el audio. Probá de nuevo o escribí el mensaje." });
    }
  }
);

router.post("/send", async (req, res) => {
  try {
    const parsed = sendSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Mensaje inválido" });
      return;
    }

    const { message, location } = parsed.data;
    const userId = req.user!.userId;

    if (location) {
      db.prepare("UPDATE users SET lat = ?, lng = ? WHERE id = ?").run(
        location.lat,
        location.lng,
        userId
      );
    }

    const userMsgId = Number(
      db
        .prepare("INSERT INTO messages (user_id, role, content, created_at) VALUES (?, 'user', ?, ?)")
        .run(userId, message, now()).lastInsertRowid
    );

    const history = getHistory(userId)
      .filter((m) => m.id !== userMsgId)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const nowLocal = new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());

    const stored = db
      .prepare("SELECT lat, lng FROM users WHERE id = ?")
      .get(userId) as { lat: number | null; lng: number | null } | undefined;

    const coords =
      location ??
      (stored?.lat != null && stored?.lng != null ? { lat: stored.lat, lng: stored.lng } : null);

    const locationCtx = coords ? "disponible (el dueño compartió su ubicación)" : undefined;

    // La búsqueda de veterinarias corre EN PARALELO con la IA para no sumar esperas.
    const vetsPromise: Promise<VetPlace[]> = coords
      ? findNearbyVets(coords.lat, coords.lng)
      : Promise.resolve([]);

    const reply = await getAiReply(message, history, {
      now: nowLocal,
      location: locationCtx,
      pets: getPetsSummary(userId) || undefined,
    });

    // Memoria: recordamos la mascota mencionada para próximas consultas.
    if (reply.petName) {
      rememberPet(userId, reply.petName, reply.animalType ?? "mascota");
    }

    const messagesOut: MessageWithVets[] = [];
    const advice = insertAssistant(userId, reply.category, reply.message);
    messagesOut.push(advice.row);

    if (reply.category === "yellow" || reply.category === "red") {
      const vets = await vetsPromise;
      if (vets.length > 0) {
        const vetMsg = insertAssistant(userId, reply.category, vetsIntroMessage(vets));
        vetMsg.row.vets = vets;
        insertVetRecommendations(vetMsg.id, vets);
        messagesOut.push(vetMsg.row);
      } else if (!coords) {
        messagesOut.push(
          insertAssistant(
            userId,
            reply.category,
            reply.category === "red" ? LOCATION_PROMPT_RED : LOCATION_PROMPT_YELLOW
          ).row
        );
      } else {
        // Había ubicación pero la búsqueda no trajo resultados (Overpass caído,
        // zona sin veterinarias mapeadas, etc). Sin este mensaje el usuario se
        // quedaba sin ninguna indicación de qué pasó, justo en un caso amarillo/rojo.
        messagesOut.push(
          insertAssistant(
            userId,
            reply.category,
            reply.category === "red"
              ? "🚨 No pude encontrar veterinarias cerca en este momento (puede ser un problema temporal del buscador). **No esperes**: buscá la clínica u hospital veterinario más cercano que conozcas, o llamá a información local."
              : "No encontré veterinarias cerca de tu ubicación en este momento. Probá buscar en tu zona o compartí de nuevo tu ubicación en unos minutos."
          ).row
        );
      }
    }

    // El usuario respondió: se reinicia el contador de follow-ups sin respuesta.
    resetUnanswered(userId);

    scheduleFollowUp(
      userId,
      reply.petName ?? null,
      reply.animalType ?? null,
      reply.followUpDelayHours,
      `Consulta previa: ${message.slice(0, 120)}`
    );

    res.json({ messages: messagesOut, category: reply.category });
  } catch (err) {
    console.error("[chat] Error en /send:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Error interno del servidor" });
    }
  }
});

// Vaciar el chat: borra el historial de mensajes (mantiene cuenta y seguimientos).
router.post("/clear", (req, res) => {
  const userId = req.user!.userId;
  withTransaction(() => {
    db.prepare("DELETE FROM messages WHERE user_id = ?").run(userId);
  });
  res.json({ ok: true });
});

// Olvidar todo: borra mensajes Y seguimientos pendientes. Comienza de cero.
router.post("/reset", (req, res) => {
  const userId = req.user!.userId;
  withTransaction(() => {
    db.prepare("DELETE FROM messages WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM follow_ups WHERE user_id = ?").run(userId);
  });
  res.json({ ok: true });
});

export default router;