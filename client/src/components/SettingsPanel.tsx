import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { enablePush } from "../push";
import {
  applyAppearance,
  applyAccessibility,
  CHAT_COLORS,
  FONT_SIZES,
  getAccessibility,
  getAppearance,
  MODES,
  MOTIFS,
  saveAccessibility,
  saveAppearance,
  type Accessibility,
  type Appearance,
} from "../themes";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="settings-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export default function SettingsPanel({ onClose }: { onClose?: () => void }) {
  const [app, setApp] = useState<Appearance>(() => getAppearance());
  const [acc, setAcc] = useState<Accessibility>(() => getAccessibility());

  const [prefs, setPrefs] = useState<{ push: boolean } | null>(null);
  const [notifyInfo, setNotifyInfo] = useState<{
    push: boolean;
    vapidPublicKey: string | null;
  } | null>(null);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getNotificationPrefs()
      .then((res) => {
        setPrefs(res.prefs);
        setNotifyInfo(res.configured);
      })
      .catch(() => {});
  }, []);

  const updateApp = (next: Appearance) => {
    setApp(next);
    saveAppearance(next);
    applyAppearance(next);
  };
  const updateAcc = (next: Accessibility) => {
    setAcc(next);
    saveAccessibility(next);
    applyAccessibility(next);
  };

  const togglePref = useCallback(
    async (value: boolean) => {
      if (!prefs) return;
      setNotifyMsg(null);
      if (value) {
        // Activar push requiere permiso del navegador + suscripción.
        const ok = await enablePush(notifyInfo?.vapidPublicKey ?? null);
        if (!ok) {
          setNotifyMsg("El navegador no dio permiso para notificaciones.");
          return;
        }
      }
      const next = { ...prefs, push: value };
      setPrefs(next);
      try {
        const res = await api.setNotificationPrefs({ push: value });
        setPrefs(res.prefs);
        if (value) setNotifyMsg("Notificaciones push activadas ✅");
      } catch (err) {
        setPrefs(prefs);
        setNotifyMsg(err instanceof Error ? err.message : "No se pudieron guardar las preferencias.");
      }
    },
    [prefs, notifyInfo]
  );

  const testNotify = useCallback(async () => {
    setNotifyMsg(null);
    try {
      const res = await api.testNotification();
      if (res.ok) setNotifyMsg("Notificación de prueba enviada ✅");
    } catch (err) {
      setNotifyMsg(err instanceof Error ? err.message : "No se pudo enviar la prueba.");
    }
  }, []);

  return (
    <div className="settings-panel">
      <div className="settings-head">
        <h2>⚙️ Configuración del chat</h2>
        {onClose && (
          <button className="icon-btn" onClick={onClose} title="Cerrar">
            ✕
          </button>
        )}
      </div>

      <Section title="Modo de luz">
        <div className="seg">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={app.mode === m.id ? "active" : ""}
              onClick={() => updateApp({ ...app, mode: m.id })}
            >
              {m.emoji} {m.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Motivo de fondo">
        <div className="seg">
          {MOTIFS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={app.motif === m.id ? "active" : ""}
              onClick={() => updateApp({ ...app, motif: m.id })}
            >
              {m.emoji} {m.label}
            </button>
          ))}
        </div>
        <p className="settings-hint">
          El motivo (huellitas) se combina con el modo claro u oscuro que elijas.
        </p>
      </Section>

      <Section title="Color del chat">
        <div className="swatches">
          {CHAT_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={app.color === c.id ? "active" : ""}
              onClick={() => updateApp({ ...app, color: c.id })}
              title={c.label}
            >
              {c.emoji}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Accesibilidad">
        <label className="settings-row">
          <span>Tamaño de texto</span>
          <div className="seg small">
            {FONT_SIZES.map((f) => (
              <button
                key={f.id}
                type="button"
                className={acc.fontSize === f.id ? "active" : ""}
                onClick={() => updateAcc({ ...acc, fontSize: f.id })}
              >
                {f.label}
              </button>
            ))}
          </div>
        </label>
        <label className="settings-row switch-row">
          <span>Alto contraste</span>
          <input
            type="checkbox"
            checked={acc.highContrast}
            onChange={(e) => updateAcc({ ...acc, highContrast: e.target.checked })}
          />
        </label>
        <label className="settings-row switch-row">
          <span>Reducir animaciones</span>
          <input
            type="checkbox"
            checked={acc.reduceMotion}
            onChange={(e) => updateAcc({ ...acc, reduceMotion: e.target.checked })}
          />
        </label>
      </Section>

      <Section title="Notificaciones">
        {!prefs ? (
          <p className="settings-hint">Cargando preferencias…</p>
        ) : (
          <>
            <label className="settings-row switch-row">
              <span>🔔 Push del navegador</span>
              <input
                type="checkbox"
                checked={prefs.push}
                disabled={!!notifyInfo && !notifyInfo.push && !prefs.push}
                onChange={(e) => void togglePref(e.target.checked)}
              />
            </label>
            <div className="notify-test-row">
              <button type="button" className="seg-btn" onClick={() => void testNotify()}>
                Probar push
              </button>
            </div>
          </>
        )}
        {notifyMsg && <p className="notify-msg">{notifyMsg}</p>}
      </Section>
    </div>
  );
}