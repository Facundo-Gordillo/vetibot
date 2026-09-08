import { useState } from "react";
import { api, type VetPlace } from "../api";

function formatDistance(meters: number | null): string {
  if (meters == null) return "";
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

const DAYS: Record<string, string> = {
  Mo: "Lun",
  Tu: "Mar",
  We: "Mié",
  Th: "Jue",
  Fr: "Vie",
  Sa: "Sáb",
  Su: "Dom",
  PH: "Fer",
};

/** Traducción ligera del formato OSM a algo legible (08:00–19:00, días cortos). */
function formatHours(raw: string): string {
  return raw.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (m) => DAYS[m] ?? m);
}

function Star({ filled, onClick }: { filled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`star ${filled ? "on" : ""}`}
      onClick={onClick}
      aria-label="Calificar"
    >
      ★
    </button>
  );
}

export default function VetCard({ vet }: { vet: VetPlace }) {
  const [my, setMy] = useState<number | null>(vet.myRating);
  const [avg, setAvg] = useState<number | null>(vet.rating);
  const [count, setCount] = useState<number>(vet.ratingCount);
  const [saving, setSaving] = useState(false);

  const rate = async (n: number) => {
    if (saving) return;
    setSaving(true);
    const prevMy = my;
    const prevAvg = avg;
    const prevCount = count;
    setMy(n);

    const base = prevAvg ?? n;
    if (prevMy != null) {
      setAvg((base * prevCount - prevMy + n) / prevCount);
    } else {
      setAvg((base * prevCount + n) / (prevCount + 1));
      setCount(prevCount + 1);
    }

    try {
      await api.rateVet({ osmKey: vet.osmKey, rating: n });
    } catch {
      setMy(prevMy);
      setAvg(prevAvg);
      setCount(prevCount);
    } finally {
      setSaving(false);
    }
  };

  const shown = my ?? avg;
  const filled = shown == null ? 0 : Math.round(shown);

  const statusCls =
    vet.openNow === true ? "open" : vet.openNow === false ? "closed" : "unknown";

  return (
    <div className={`vet-card ${vet.sponsored ? "sponsored" : ""}`}>
      <div className="vet-head">
        <span className="vet-pin">🏥</span>
        <div className="vet-info">
          <strong>
            {vet.name}
            {vet.sponsored && <span className="vet-sponsor">⭐ {vet.badge ?? "Destacado"}</span>}
          </strong>
          {vet.address && <span className="vet-addr">{vet.address}</span>}
        </div>
        <span className="vet-dist">{formatDistance(vet.distanceMeters)}</span>
      </div>

      <div className={`vet-hours ${statusCls}`}>
        {vet.openNow === true && (
          <span className="vet-status open">
            ● Abierta ahora{vet.nextChangeText ? ` · ${vet.nextChangeText}` : ""}
          </span>
        )}
        {vet.openNow === false && (
          <span className="vet-status closed">
            ● Cerrada ahora{vet.nextChangeText ? ` · ${vet.nextChangeText}` : ""}
          </span>
        )}
        {vet.openNow === null && !vet.openingHours && (
          <span className="vet-status unknown">Horario no publicado</span>
        )}
        {vet.openingHours && <span className="vet-hours-text">🕒 {formatHours(vet.openingHours)}</span>}
      </div>

      <div className="vet-rating">
        <div className="stars" title="Tocá para calificar">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} filled={n <= filled} onClick={() => void rate(n)} />
          ))}
        </div>
        <span className="vet-rating-text">
          {avg != null ? `${avg.toFixed(1)} (${count})` : "Sin valoraciones"}
          {my != null ? " · tu voto ✓" : ""}
        </span>
      </div>

      <div className="vet-foot">
        {vet.phone && (
          <a className="vet-action" href={`tel:${vet.phone}`}>
            📞 Llamar
          </a>
        )}
        {vet.website && (
          <a className="vet-action" href={vet.website} target="_blank" rel="noreferrer">
            🌐 Web
          </a>
        )}
        {vet.phone == null && vet.website == null && (
          <span className="vet-action muted">Sin contacto publicado</span>
        )}
      </div>
    </div>
  );
}
