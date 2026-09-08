import { db } from "../db/index.js";
import { config } from "../config.js";

export interface NotificationPrefs {
  push: boolean;
}

export interface PushSubscriptionRow {
  id: number;
  user_id: number;
  endpoint: string;
  keys: string;
}

export function getNotificationPrefs(userId: number): NotificationPrefs {
  const row = db
    .prepare("SELECT push_enabled FROM notification_prefs WHERE user_id = ?")
    .get(userId) as { push_enabled: number } | undefined;
  return {
    push: row?.push_enabled === 1,
  };
}

export function setNotificationPrefs(userId: number, prefs: NotificationPrefs): NotificationPrefs {
  db.prepare(
    `INSERT INTO notification_prefs (user_id, push_enabled, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       push_enabled = excluded.push_enabled,
       updated_at = excluded.updated_at`
  ).run(userId, prefs.push ? 1 : 0, new Date().toISOString());
  return prefs;
}

export function savePushSubscription(
  userId: number,
  endpoint: string,
  keys: { p256dh: string; auth: string }
): void {
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, endpoint) DO UPDATE SET keys = excluded.keys, created_at = excluded.created_at`
  ).run(userId, endpoint, JSON.stringify(keys), new Date().toISOString());
}

export function getPushSubscriptions(userId: number): PushSubscriptionRow[] {
  return db
    .prepare("SELECT id, user_id, endpoint, keys FROM push_subscriptions WHERE user_id = ?")
    .all(userId) as unknown as PushSubscriptionRow[];
}

export function removePushSubscription(userId: number, endpoint: string): void {
  db.prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?").run(
    userId,
    endpoint
  );
}

/** Envía una notificación push al navegador (Web Push / VAPID). */
export async function sendPush(userId: number, title: string, body: string): Promise<number> {
  const prefs = getNotificationPrefs(userId);
  if (!prefs.push || !config.vapid.publicKey || !config.vapid.privateKey) return 0;

  const { default: webPush } = await import("web-push");
  webPush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);

  const subs = getPushSubscriptions(userId);
  let sent = 0;
  for (const sub of subs) {
    try {
      const keys = JSON.parse(sub.keys) as { p256dh: string; auth: string };
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys },
        JSON.stringify({ title, body, url: `${config.appUrl}/app` })
      );
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) removePushSubscription(userId, sub.endpoint);
    }
  }
  return sent;
}

/** Notifica un follow-up por push. */
export async function notifyFollowUp(userId: number, message: string): Promise<void> {
  const title = "🐾 Recordatorio de Veti";
  await sendPush(userId, title, message);
}

/** Envía una notificación push de prueba (para verificar la configuración). */
export async function sendTestNotification(userId: number): Promise<boolean> {
  const sent = await sendPush(userId, "🔔 VetiBot", "¡Notificaciones activadas!");
  return sent > 0;
}