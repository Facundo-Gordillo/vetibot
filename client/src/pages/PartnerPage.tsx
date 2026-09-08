import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Partner, type PartnerPricing } from "../api";
import { useAuth } from "../auth";
import AuthCard from "../components/AuthCard";
import VetiAvatar from "../components/VetiAvatar";
import { refreshLocation } from "../location";

const TIER_DESC: Record<number, { emoji: string; name: string; text: string }> = {
  1: {
    emoji: "🌱",
    name: "Tier 1 · Básico",
    text: "Entrás en la rotación del pool de aliados de tu zona.",
  },
  2: {
    emoji: "🐾",
    name: "Tier 2 · Destacado",
    text: "Slot asegurado + doble frecuencia de aparición.",
  },
  3: {
    emoji: "🌟",
    name: "Tier 3 · Ancla",
    text: "Siempre primera entre las aliadas de tu zona (abiertas).",
  },
};

function money(amountCents: number, currency: string): string {
  const value = amountCents / 100;
  const symbol =
    currency === "usd" ? "$" : currency === "ars" ? "$" : currency === "eur" ? "€" : `${currency.toUpperCase()} `;
  return `${symbol}${value.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export default function PartnerPage() {
  const { user } = useAuth();

  const [pricing, setPricing] = useState<PartnerPricing | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);

  const [vetName, setVetName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [tier, setTier] = useState(1);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, pr] = await Promise.all([api.getPartner(), api.getPartnerPricing()]);
      setPartner(p.partner);
      setPricing(pr);
    } catch {
      setError("No se pudo cargar la información. Revisá tu conexión.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Vuelta de Stripe: éxito de pago.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("success") === "1") {
      setMsg("¡Pago confirmado! Tu veterinaria ya está listada como aliada.");
      void load();
      window.history.replaceState(null, "", "/partner");
    }
  }, [load]);

  const grabLocation = async () => {
    setLocating(true);
    setError(null);
    try {
      const c = await refreshLocation();
      setLat(c.lat);
      setLng(c.lng);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos obtener tu ubicación.");
    } finally {
      setLocating(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lat == null || lng == null) {
      setError("Para usar la cobertura por zona necesitás compartir la ubicación de tu local.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await api.applyPartner({ vetName, address: address || null, lat, lng, radiusKm, tier });
      setPartner(res.partner);
      if (pricing?.sandbox) {
        setMsg("Modo desarrollador: sin Stripe configurado, la suscripción se activó simulada.");
      } else {
        setMsg("Guardado. Ahora elegí tu plan y completá el pago 👇");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const payTier = async (t: number) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await api.createPartnerCheckout({ tier: t });
      if (res.sandbox) {
        setMsg("Modo desarrollador: pago simulado, veterinaria activada.");
        void load();
      } else if (res.url) {
        window.location.href = res.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el pago.");
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="partner-page">
        <div className="partner-card">
          <div className="partner-brand">
            <VetiAvatar size={52} />
            <h1>Para veterinarias</h1>
            <p>
              Registrate o ingresá para cargar tu local, elegir tu zona de cobertura y tu plan.
              Cuando el pago se active, tu veterinaria aparece destacada en VetiBot.
            </p>
          </div>
          <AuthCard />
          <Link to="/home" className="partner-back">
            ← Volver a la home
          </Link>
        </div>
      </div>
    );
  }

  const active = partner?.status === "active";

  return (
    <div className="partner-page">
      <div className="partner-card">
        <div className="partner-brand">
          <VetiAvatar size={52} />
          <h1>Administrá tu veterinaria</h1>
          <p>
            {user.name.split(" ")[0]}, tu local destacará en los resultados de VetiBot para los
            usuarios dentro de tu zona de cobertura.
          </p>
        </div>

        {error && <p className="partner-err">{error}</p>}
        {msg && <p className="partner-ok">{msg}</p>}

        {loading ? (
          <p className="partner-muted">Cargando…</p>
        ) : active ? (
          <div className="partner-status-wrap">
            <div className="partner-status active">✅ Plan activo · Tier {partner!.tier}</div>
            <p>
              {partner!.vetName} · radio {partner!.radiusKm} km, tier {partner!.tier} por{" "}
              {money((partner!.planAmount ?? 2900), pricing?.currency ?? "usd")}/mes.
            </p>
            <p>Podés cambiar tu plan o tu zona de cobertura más abajo.</p>
          </div>
        ) : partner ? (
          <div className="partner-status-wrap">
            <div className="partner-status pending">⏳ Ficha cargada — falta el pago</div>
          </div>
        ) : null}

        <form className="partner-form" onSubmit={submit}>
          <label>
            Nombre de la veterinaria
            <input
              value={vetName}
              onChange={(e) => setVetName(e.target.value)}
              required
              placeholder="Ej: Clínica Vet San Martín"
            />
          </label>

          <label>
            Dirección (opcional)
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Calle y número, barrio"
            />
          </label>

          <div className="partner-loc">
            <button type="button" className="loc-cta" onClick={grabLocation} disabled={locating}>
              {locating ? "Ubicando…" : "📍 Usar mi ubicación"}
            </button>
            {lat != null && lng != null && (
              <span className="partner-muted">
                Punto de cobertura: {lat.toFixed(4)}, {lng.toFixed(4)}
              </span>
            )}
          </div>

          <label>
            Zona de cobertura: <strong>{radiusKm} km a la redonda</strong>
            <input
              type="range"
              min={1}
              max={15}
              step={1}
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
            />
          </label>

          <div className="tier-grid">
            {(pricing?.tiers ?? [1, 2, 3].map((t) => ({ tier: t, amountCents: [2900, 7900, 14900][t - 1] })))
              .sort((a, b) => a.tier - b.tier)
              .map((t) => {
                const desc = TIER_DESC[t.tier];
                const selected = tier === t.tier;
                return (
                  <button
                    type="button"
                    key={t.tier}
                    className={`tier-card ${selected ? "selected" : ""}`}
                    onClick={() => setTier(t.tier)}
                  >
                    <span className="tier-emoji">{desc.emoji}</span>
                    <strong>{desc.name}</strong>
                    <span className="tier-price">
                      {money(t.amountCents, pricing?.currency ?? "usd")}/mes
                    </span>
                    <small>{desc.text}</small>
                  </button>
                );
              })}
          </div>

          <button type="submit" className="btn-primary" disabled={busy || !vetName.trim()}>
            {busy ? "Guardando…" : partner ? "Actualizar ficha" : "Cargar mi veterinaria"}
          </button>
        </form>

        {partner && !pricing?.sandbox && (
          <div className="partner-pay">
            <h3>Pagar con Stripe</h3>
            <div className="tier-pay-row">
              {(pricing?.tiers ?? [])
                .sort((a, b) => a.tier - b.tier)
                .map((t) => (
                  <button
                    key={t.tier}
                    className={tier === t.tier ? "selected" : ""}
                    onClick={() => void payTier(t.tier)}
                    disabled={busy}
                  >
                    Tier {t.tier} · {money(t.amountCents, pricing?.currency ?? "usd")}/mes
                  </button>
                ))}
            </div>
            <p className="partner-muted">
              Pagás una suscripción mensual. Podés cancelar cuando quieras.
            </p>
          </div>
        )}

        {partner && pricing?.sandbox && (
          <p className="partner-muted">
            🔧 El pago automático (Stripe) está desactivado en esta configuración: agregá
            STRIPE_SECRET_KEY en el server/.env para crear sesiones reales.
          </p>
        )}

        <Link to="/home" className="partner-back">
          ← Volver a la home
        </Link>
      </div>
    </div>
  );
}