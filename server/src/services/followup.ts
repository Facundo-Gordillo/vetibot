import { db, now } from "../db/index.js";

/** Máximo de follow-ups sin respuesta del usuario antes de dejar de insistir. */
export const MAX_UNANSWERED = 3;

export interface DueFollowUp {
  id: number;
  userId: number;
  reminderMessage: string;
  context: string | null;
  delayHours: number;
}

// Las columnas "follow_ups.delay_hours" y "users.unanswered_followups" se
// crean en initSchema() (server/src/db/index.ts), no acá: si se agregaran
// como side-effect al importar este módulo, correrían ANTES de que
// initSchema() cree las tablas (los imports de ES modules se evalúan antes
// que el cuerpo de index.ts), y el ALTER TABLE fallaría con "no such table"
// en cualquier base de datos nueva (primer arranque en producción).

/**
 * Cancela los follow-ups pendientes de un usuario (los deja fuera de
 * getDueFollowUps). Se usa antes de agendar uno nuevo: cada mensaje que el
 * usuario manda reinicia el seguimiento, así que el recordatorio anterior
 * queda obsoleto. Sin esto, una conversación de varios mensajes agenda un
 * follow-up POR MENSAJE y el usuario recibe todos apilados cuando vencen
 * (el mismo caso repetido con distinto nombre de mascota si el bot todavía
 * no lo había confirmado).
 */
function cancelPending(userId: number): void {
  db.prepare(
    `UPDATE follow_ups SET status = 'cancelled', completed_at = ? WHERE user_id = ? AND status = 'pending'`
  ).run(now(), userId);
}

export function scheduleFollowUp(
  userId: number,
  petName: string | null,
  animalType: string | null,
  delayHours: number,
  context?: string | null
): number {
  cancelPending(userId);

  const scheduledAt = new Date(Date.now() + delayHours * 3600_000).toISOString();
  const who = petName ?? animalType ?? "tu mascota";
  const reminder = `🐾 ¡Hola! Soy Veti. Te escribo para saber cómo está ${who}.\n\n¿Cómo se siente hoy? Contame si notaste algún cambio y te ayudo con lo que necesites.`;

  const result = db
    .prepare(
      `INSERT INTO follow_ups (user_id, scheduled_at, reminder_message, context_summary, delay_hours, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(userId, scheduledAt, reminder, context ?? null, delayHours, now());
  return Number(result.lastInsertRowid);
}

export function getDueFollowUps(limit = 50): DueFollowUp[] {
  const rows = db
    .prepare(
      `SELECT id, user_id, reminder_message, context_summary, delay_hours FROM follow_ups
       WHERE status = 'pending' AND scheduled_at <= ?
       ORDER BY scheduled_at ASC LIMIT ?`
    )
    .all(now(), limit) as Array<{
    id: number;
    user_id: number;
    reminder_message: string;
    context_summary: string | null;
    delay_hours: number | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    reminderMessage: r.reminder_message,
    context: r.context_summary,
    delayHours: r.delay_hours ?? 24,
  }));
}

export function completeFollowUp(id: number): void {
  db.prepare(
    `UPDATE follow_ups SET status = 'done', completed_at = ? WHERE id = ?`
  ).run(now(), id);
}

/** Sigue la cadena de recordatorios: el usuario no respondió a este follow-up. */
export function followUpUnanswered(item: DueFollowUp): void {
  const row = db
    .prepare("SELECT unanswered_followups AS u FROM users WHERE id = ?")
    .get(item.userId) as { u: number | null } | undefined;
  const next = (row?.u ?? 0) + 1;
  db.prepare("UPDATE users SET unanswered_followups = ? WHERE id = ?").run(next, item.userId);
  if (next < MAX_UNANSWERED) {
    // Reprogama otro recordatorio con la misma espera para no soltar el caso.
    const scheduledAt = new Date(Date.now() + item.delayHours * 3600_000).toISOString();
    db.prepare(
      `INSERT INTO follow_ups (user_id, scheduled_at, reminder_message, context_summary, delay_hours, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(item.userId, scheduledAt, item.reminderMessage, item.context, item.delayHours, now());
  }
}

/** El usuario respondió: reinicia el contador de no-respuestas. */
export function resetUnanswered(userId: number): void {
  db.prepare("UPDATE users SET unanswered_followups = 0 WHERE id = ?").run(userId);
}

export function getUnanswered(userId: number): number {
  const row = db.prepare("SELECT unanswered_followups AS u FROM users WHERE id = ?").get(userId) as
    | { u: number | null }
    | undefined;
  return row?.u ?? 0;
}