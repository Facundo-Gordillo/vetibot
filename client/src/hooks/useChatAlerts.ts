import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ChatMessage } from "../api";

const keyFor = (userId: number, suffix: string) => `veti_${suffix}_${userId}`;

function snippet(text: string): string {
  return text.replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
}

function requestPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function notify(text: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification("Veti te escribió 🐾", { body: snippet(text), tag: "veti-followup" });
  } catch {
    /* algunos navegadores bloquean en incógnito */
  }
}

/**
 * Contador de mensajes nuevos del bot + notificaciones del navegador.
 * El último mensaje "visto" se guarda por usuario en localStorage, así los
 * seguimientos llegan aunque la sesión siga abierta tras recargar la página.
 */
export function useUnreadBadge(userId: number | undefined, messages: ChatMessage[]) {
  const [unread, setUnread] = useState(0);
  const seenRef = useRef<number | null>(null);
  const notifiedRef = useRef(0);

  useEffect(() => {
    requestPermission();
  }, []);

  useEffect(() => {
    if (!userId) return;
    seenRef.current = null;
    const s = localStorage.getItem(keyFor(userId, "lastseen"));
    seenRef.current = s ? Number(s) : null;
    notifiedRef.current = Number(localStorage.getItem(keyFor(userId, "notified")) ?? 0);
    setUnread(0);
  }, [userId]);

  useEffect(() => {
    if (!userId || messages.length === 0) return;
    const latest = messages[messages.length - 1].id;

    if (seenRef.current == null) {
      // Primera visita: marcamos todo como visto para no alertar por el pasado.
      seenRef.current = latest;
      localStorage.setItem(keyFor(userId, "lastseen"), String(latest));
      return;
    }

    const fresh = messages.filter((m) => m.role === "assistant" && m.id > seenRef.current!);
    setUnread(fresh.length);

    const toNotify = fresh.filter((m) => m.id > notifiedRef.current);
    if (toNotify.length > 0) {
      const maxId = Math.max(...toNotify.map((m) => m.id));
      notifiedRef.current = maxId;
      localStorage.setItem(keyFor(userId, "notified"), String(maxId));
      if (document.hidden) notify(toNotify[toNotify.length - 1].content);
    }
  }, [messages, userId]);

  const markSeen = useCallback(() => {
    if (!userId || messages.length === 0) return;
    const latest = messages[messages.length - 1].id;
    seenRef.current = latest;
    localStorage.setItem(keyFor(userId, "lastseen"), String(latest));
    setUnread(0);
  }, [messages, userId]);

  return { unread, markSeen };
}

/**
 * Notificador ligero para usar fuera del chat (ej. home con sesión activa):
 * consulta el historial y dispara notificaciones si llegan seguimientos.
 */
export function useFollowUpNotifier(userId: number | undefined) {
  useEffect(() => {
    if (!userId) return;
    requestPermission();

    let seen = Number(localStorage.getItem(keyFor(userId, "lastseen")) ?? 0);
    let active = true;

    const tick = async () => {
      try {
        const res = await api.getHistory();
        if (!active) return;
        const latest = res.messages.at(-1);
        if (!latest) return;
        if (seen === 0) {
          seen = latest.id;
          localStorage.setItem(keyFor(userId, "lastseen"), String(seen));
          return;
        }
        const fresh = res.messages.filter((m) => m.role === "assistant" && m.id > seen);
        if (fresh.length > 0) {
          seen = latest.id;
          localStorage.setItem(keyFor(userId, "lastseen"), String(seen));
          if (document.hidden) notify(fresh[fresh.length - 1].content);
        }
      } catch {
        /* errores transitorios */
      }
    };

    void tick();
    const id = setInterval(tick, 15_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [userId]);
}