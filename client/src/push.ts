import { api } from "./api";

let regPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/** Registra el service worker una sola vez (para recibir push). */
function ensureSW(): Promise<ServiceWorkerRegistration | null> {
  if (regPromise) return regPromise;
  regPromise = (async () => {
    if (!("serviceWorker" in navigator)) return null;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      return reg;
    } catch {
      return null;
    }
  })();
  return regPromise;
}

/** Pide permiso de notificaciones del navegador y suscribe el endpoint en el server. */
export async function enablePush(vapidPublicKey: string | null): Promise<boolean> {
  if (!("Notification" in window) || !("PushManager" in window)) return false;
  if (Notification.permission === "denied") return false;

  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return false;

  const reg = await ensureSW();
  if (!reg) return false;

  // VAPID público requerido para una suscripción válida.
  if (!vapidPublicKey) return false;

  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  }));
  if (!sub) return false;

  await api.subscribePush({
    endpoint: sub.endpoint,
    keys: {
      p256dh: toBase64(sub.getKey("p256dh")),
      auth: toBase64(sub.getKey("auth")),
    },
  });
  return true;
}

/** Envía una notificación local inmediata (cuando la app está abierta). */
export function showLocalNotification(title: string, body: string): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/veti-icon.png" });
  } catch {
    /* algunos navegadores requieren SW para mostrar notificaciones */
  }
}

function toBase64(arr: ArrayBuffer | null): string {
  if (!arr) return "";
  const bytes = new Uint8Array(arr);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Url = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Url);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}