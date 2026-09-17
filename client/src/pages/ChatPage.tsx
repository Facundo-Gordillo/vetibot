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

// Tope de duración de un mensaje de voz: mantiene el audio corto (costo y
// latencia de transcripción bajos) y evita grabaciones accidentales largas.
const MAX_RECORD_SECONDS = 60;

function formatRecordTime(totalSeconds: number): string {
  const s = totalSeconds % 60;
  return `0:${s.toString().padStart(2, "0")}`;
}

export default function ChatPage() {
  const { user, logout } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  // "Ubicación activa" es una confirmación puntual (tras otorgar permiso o
  // tocar el botón), no un cartel pegado en pantalla todo el tiempo — por eso
  // vive aparte de `coords` y se autoborra sola.
  const [locOk, setLocOk] = useState(false);
  const locOkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coordsRef = useRef<Coords | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirm, setConfirm] = useState<"clear" | "reset" | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { unread, markSeen } = useUnreadBadge(user?.id, messages);

  // --- Mensajes de voz: grabar con MediaRecorder y transcribir en el server ---
  const canRecordAudio =
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // El botón de micrófono solo se muestra si el browser soporta grabar Y el
  // server tiene un proveedor de transcripción configurado (si no, no tiene
  // sentido ofrecer algo que siempre va a fallar).
  useEffect(() => {
    if (!canRecordAudio) return;
    let cancelled = false;
    void api
      .getVoiceStatus()
      .then((res) => {
        if (!cancelled) setVoiceEnabled(res.enabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canRecordAudio]);

  // Libera el micrófono si el componente se desmonta a mitad de una grabación.
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stopRecording = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    setRecording(false);
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }, []);

  const handleTranscribe = useCallback(async (blob: Blob) => {
    if (blob.size === 0) return;
    setTranscribing(true);
    setVoiceError(null);
    try {
      const { text } = await api.transcribeAudio(blob);
      if (text) {
        setInput((prev) => (prev ? `${prev} ${text}` : text));
        inputRef.current?.focus();
      } else {
        setVoiceError("No se entendió el audio. Probá grabar de nuevo, más cerca del micrófono.");
      }
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : "No se pudo transcribir el audio.");
    } finally {
      setTranscribing(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferredType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) =>
        window.MediaRecorder.isTypeSupported?.(t)
      );
      const recorder = preferredType
        ? new MediaRecorder(stream, { mimeType: preferredType })
        : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        audioChunksRef.current = [];
        void handleTranscribe(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordSecs(0);
      recordTimerRef.current = setInterval(() => setRecordSecs((s) => s + 1), 1000);
      autoStopRef.current = setTimeout(() => stopRecording(), MAX_RECORD_SECONDS * 1000);
    } catch {
      setVoiceError("No pudimos acceder al micrófono. Revisá los permisos del navegador.");
    }
  }, [handleTranscribe, stopRecording]);

  const toggleRecording = () => {
    if (recording) stopRecording();
    else void startRecording();
  };

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

  // Muestra "Ubicación activa" unos segundos y se borra sola — es una
  // confirmación de que ya quedó guardada, no algo que deba quedar pegado
  // en pantalla (eso es justo lo que se siente como "estar pidiéndola" todo
  // el tiempo). Nunca se llama desde una actualización silenciosa de fondo.
  const flashLocOk = useCallback(() => {
    setLocOk(true);
    if (locOkTimerRef.current) clearTimeout(locOkTimerRef.current);
    locOkTimerRef.current = setTimeout(() => setLocOk(false), 3500);
  }, []);

  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  useEffect(() => {
    return () => {
      if (locOkTimerRef.current) clearTimeout(locOkTimerRef.current);
    };
  }, []);

  // Ubicación persistente: recupera la última conocida (caché local o perfil)
  // y, si hace falta, pide permiso UNA sola vez y la guarda. El navegador ya
  // no vuelve a preguntar después de este primer otorgamiento.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loc = await ensureLocation();
      if (!cancelled && loc) {
        setCoords(loc);
        flashLocOk();
        void api.updateLocation(loc).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flashLocOk]);

  // Mientras la app está abierta, la ubicación se sincroniza sola cuando cambia
  // de posición (silencioso: sin permiso de nuevo y sin mostrar ningún cartel).
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

  // Respaldo por tiempo: en un celular quieto, watchPosition puede no disparar
  // nunca (no hay movimiento que detectar). Este intervalo garantiza una
  // actualización real cada 5 minutos igual, sin pedir permiso de nuevo (ya
  // fue otorgado) y sin mostrar ningún aviso — puramente en segundo plano. Si
  // todavía no hay ubicación (permiso no otorgado), no insiste solo.
  useEffect(() => {
    const id = setInterval(() => {
      if (!coordsRef.current) return;
      void refreshLocation()
        .then((loc) => {
          setCoords(loc);
          void api.updateLocation(loc).catch(() => {});
        })
        .catch(() => {
          /* fallo puntual (GPS ocupado, sin señal): se reintenta en 5 min */
        });
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
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
      flashLocOk();
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

        {(voiceError || locError) && <div className="loc-toast">{voiceError || locError}</div>}
        {!voiceError && !locError && locOk && (
          <div className="loc-toast ok">📍 Ubicación activa</div>
        )}

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
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              recording
                ? `🔴 Escuchando… ${formatRecordTime(recordSecs)} (tocá el micrófono para terminar)`
                : transcribing
                  ? "Transcribiendo tu nota de voz…"
                  : "Escribí qué le pasa a tu mascota…"
            }
            maxLength={2000}
            disabled={sending || recording || transcribing}
          />
          {voiceEnabled && (
            <button
              type="button"
              className={`composer-mic${recording ? " recording" : ""}`}
              onClick={toggleRecording}
              disabled={sending || transcribing}
              title={recording ? "Detener grabación" : "Mensaje de voz"}
              aria-label={
                recording
                  ? `Detener grabación (${formatRecordTime(recordSecs)})`
                  : "Grabar mensaje de voz"
              }
            >
              {transcribing ? "⏳" : recording ? "⏹" : "🎤"}
            </button>
          )}
          <button
            type="submit"
            className="send-btn"
            disabled={sending || recording || transcribing || !input.trim()}
            aria-label="Enviar mensaje"
          >
            ➤
          </button>
        </form>
      </div>
    </div>
  );
}