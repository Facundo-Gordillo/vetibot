import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, type ChatMessage } from "../api";
import { useAuth } from "../auth";
import Message from "../components/Message";
import SettingsPanel from "../components/SettingsPanel";
import ConfirmDialog from "../components/ConfirmDialog";
import TriageIndicator, { currentLevel } from "../components/TriageIndicator";
import VetiAvatar from "../components/VetiAvatar";
import { useUnreadBadge } from "../hooks/useChatAlerts";
import {
  ensureLocation,
  getCachedLocation,
  refreshLocation,
  type Coords,
} from "../location";

const SUGGESTIONS = [
  "Mi gato no come hace 2 días",
  "Mi perro se atragantó con algo",
  "Mi perro comió chocolate",
  "Mi conejo está decaído",
  "¿Qué comida le doy a mi gato?",
  "Mi perro vomita y tiene diarrea",
];

export default function ChatPage() {
  const { user, logout } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirm, setConfirm] = useState<"clear" | "reset" | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { unread, markSeen } = useUnreadBadge(user?.id, messages);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api.getHistory();
      setMessages((prev) =>
        prev.length === res.messages.length &&
        prev.at(-1)?.id === res.messages.at(-1)?.id
          ? prev
          : res.messages
      );
    } catch {
      /* errores transitorios */
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Polling para detectar follow-ups del bot.
  useEffect(() => {
    const id = setInterval(loadHistory, 5000);
    return () => clearInterval(id);
  }, [loadHistory]);

  // Al volver a la ventana marcamos como leído.
  useEffect(() => {
    const onFocus = () => markSeen();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [markSeen]);

  // Ubicación persistente: recupera la última conocida (caché local o perfil) y,
  // si hace falta, pide permiso UNA sola vez y la guarda.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loc = await ensureLocation();
      if (!cancelled && loc) {
        setCoords(loc);
        void api.updateLocation(loc).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mientras la app está abierta, la ubicación se sincroniza sola cuando cambia.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    let lastSync = 0;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(loc);
        if (Date.now() - lastSync > 5 * 60 * 1000) {
          lastSync = Date.now();
          void api.updateLocation(loc).catch(() => {});
        }
      },
      () => {
        /* sin permiso: se mantiene el caché */
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // Cerrar menú al hacer click afuera.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  // Cerrar el panel de configuración (u otro overlay abierto) con Escape,
  // como se espera de cualquier diálogo modal accesible.
  useEffect(() => {
    if (!settingsOpen && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSettingsOpen(false);
      setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, menuOpen]);

  const handleShareLocation = async () => {
    if (!("geolocation" in navigator)) {
      setLocError("Tu navegador no soporta geolocalización.");
      return;
    }
    setLocating(true);
    setLocError(null);
    try {
      const loc = await refreshLocation();
      setCoords(loc);
      void api.updateLocation(loc).catch(() => {});
    } catch (err) {
      setLocError(err instanceof Error ? err.message : "No pudimos obtener tu ubicación.");
    } finally {
      setLocating(false);
    }
  };

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;

      const optimistic: ChatMessage = {
        id: Date.now(),
        role: "user",
        category: null,
        content: text,
        created_at: new Date().toISOString(),
        vets: [],
      };
      setMessages((prev) => [...prev, optimistic]);
      setInput("");
      setSending(true);
      markSeen();

      try {
        // Usa la ubicación guardada; si está vencida, la renueva sola.
        let loc = coords ?? getCachedLocation();
        if (!loc) {
          try {
            loc = await refreshLocation();
            setCoords(loc);
            void api.updateLocation(loc).catch(() => {});
          } catch {
            /* sin permiso: se manda sin ubicación y Veti la pedirá */
          }
        }
        const res = await api.sendMessage({ message: text, location: loc ?? undefined });
        setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), ...res.messages]);
      } catch (err) {
        const fail: ChatMessage = {
          id: Date.now() + 1,
          role: "assistant",
          category: null,
          content:
            err instanceof Error ? err.message : "Disculpá, hubo un problema. Intentá de nuevo.",
          created_at: new Date().toISOString(),
          vets: [],
        };
        setMessages((prev) => [...prev, fail]);
      } finally {
        setSending(false);
      }
    },
    [sending, coords, markSeen]
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const handleClear = async () => {
    setMenuOpen(false);
    setConfirmError(null);
    setConfirm("clear");
  };

  const handleReset = async () => {
    setMenuOpen(false);
    setConfirmError(null);
    setConfirm("reset");
  };

  const confirmAction = async () => {
    if (!confirm) return;
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      if (confirm === "clear") {
        await api.clearChat();
        setMessages([]);
        markSeen();
      } else {
        await api.resetChat();
        setMessages([]);
        markSeen();
      }
      setConfirm(null);
    } catch (err) {
      // Dejamos el modal abierto con el error adentro (en vez de un window.alert
      // nativo, que rompe el look & feel del resto de la app) para que el
      // usuario pueda reintentar o cancelar sin perder el contexto.
      setConfirmError(
        err instanceof Error ? err.message : "No se pudo completar la acción. Intentá de nuevo."
      );
    } finally {
      setConfirmBusy(false);
    }
  };

  const isEmpty = messages.length === 0;
  const level = currentLevel(messages);

  return (
    <div className="shell">
      <div className="chat-page">
        <header className="chat-header">
          <div className="header-left">
            <div className="avatar">
              <VetiAvatar size={38} />
              <i className="avatar-dot" />
            </div>
            <div className="header-meta">
              <strong>Veti</strong>
              <span className="status">VetBot · online</span>
            </div>
          </div>
          <div className="header-right">
            <TriageIndicator level={level} />
            <button
              className="icon-btn"
              onClick={() => setSettingsOpen((o) => !o)}
              title="Configuración"
              aria-label="Configuración"
              aria-haspopup="dialog"
              aria-expanded={settingsOpen}
            >
              ⚙️
            </button>
            <button
              className="icon-btn"
              onClick={handleShareLocation}
              disabled={locating}
              title="Compartir ubicación"
              aria-label={locating ? "Buscando tu ubicación…" : "Compartir ubicación"}
            >
              {locating ? "⏳" : "📍"}
            </button>
            <div className="menu-wrap">
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((o) => !o);
                }}
                title="Opciones del chat"
                aria-label="Opciones del chat"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="menu-pop" role="menu" onClick={(e) => e.stopPropagation()}>
                  <button role="menuitem" onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}>
                    ⚙️ Configuración
                  </button>
                  <button role="menuitem" onClick={handleClear}>🧹 Vaciar el chat</button>
                  <button role="menuitem" onClick={handleReset} className="danger">
                    🗑 Olvidar todo y empezar de cero
                  </button>
                </div>
              )}
            </div>
            {unread > 0 && (
              <span className="unread-badge" aria-label={`${unread} mensajes nuevos`}>
                {unread}
              </span>
            )}
            <button className="icon-btn" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión">
              ⏻
            </button>
          </div>
        </header>

        {settingsOpen && (
          <div
            className="settings-backdrop"
            onClick={() => setSettingsOpen(false)}
            role="presentation"
          >
            <div
              className="settings-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Configuración del chat"
              onClick={(e) => e.stopPropagation()}
            >
              <SettingsPanel onClose={() => setSettingsOpen(false)} />
            </div>
          </div>
        )}

        {confirm && (
          <ConfirmDialog
            title={confirm === "clear" ? "¿Vaciar el chat?" : "¿Borrar todo y empezar de cero?"}
            message={
              confirm === "clear"
                ? "Se borra el historial actual de la conversación. Tu cuenta queda igual."
                : "Se borra TODO el historial y el seguimiento de tus consultas. Esta acción no se puede deshacer."
            }
            confirmLabel={confirm === "clear" ? "Vaciar chat" : "Sí, borrar todo"}
            danger={confirm === "reset"}
            busy={confirmBusy}
            error={confirmError}
            onConfirm={() => void confirmAction()}
            onCancel={() => !confirmBusy && setConfirm(null)}
          />
        )}

        {locError && <div className="loc-toast">{locError}</div>}
        {coords && <div className="loc-toast ok">📍 Ubicación activa</div>}

        <main className="chat-main">
          {isEmpty ? (
            <div className="welcome">
              <div className="welcome-avatar">
                <VetiAvatar size={80} />
              </div>
              <h2>¡Hola, {user?.name?.split(" ")[0]}! 👋</h2>
              <p>
                Soy <strong>Veti</strong>, tu primer filtro veterinario. Contame qué le pasa a
                tu mascota y te digo cómo actuar.
              </p>
              <div className="chips">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="chip"
                    onClick={() => void send(s)}
                    disabled={sending}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button className="loc-cta" onClick={handleShareLocation} disabled={locating}>
                {locating ? "Buscando…" : "📍 Compartí tu ubicación"}
              </button>
            </div>
          ) : (
            <div className="messages">
              {messages.map((m) => (
                <Message key={m.id} message={m} />
              ))}
              {sending && (
                <div className="msg msg-bot">
                  <div className="msg-avatar">
                    <VetiAvatar size={30} />
                  </div>
                  <div className="bubble bubble-bot typing" role="status" aria-label="Veti está escribiendo…">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        <form className="composer" onSubmit={handleSubmit}>
          <button
            type="button"
            className="composer-loc"
            onClick={handleShareLocation}
            disabled={locating}
            title="Compartir ubicación"
            aria-label="Compartir ubicación"
          >
            📍
          </button>
          <label className="sr-only" htmlFor="chat-input">
            Escribí qué le pasa a tu mascota
          </label>
          <input
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribí qué le pasa a tu mascota…"
            maxLength={2000}
            disabled={sending}
          />
          <button
            type="submit"
            className="send-btn"
            disabled={sending || !input.trim()}
            aria-label="Enviar mensaje"
          >
            ➤
          </button>
        </form>
      </div>
    </div>
  );
}