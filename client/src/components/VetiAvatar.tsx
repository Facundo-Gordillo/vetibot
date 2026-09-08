interface Props {
  size?: number;
  className?: string;
}

/**
 * Mascota de Veti: un perrito-gato médico con cara amable.
 * SVG puro (sin assets) para que se vea nítido en cualquier tamaño.
 */
export default function VetiAvatar({ size = 48, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label="Veti, tu asistente veterinario"
    >
      <defs>
        <linearGradient id="veti-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3ddc97" />
          <stop offset="100%" stopColor="#12b7b4" />
        </linearGradient>
      </defs>

      {/* orejas */}
      <path
        d="M30 46 C 22 18, 46 10, 50 26 C 46 36, 42 44, 42 46 Z"
        fill="url(#veti-body)"
      />
      <path
        d="M90 46 C 98 18, 74 10, 70 26 C 74 36, 78 44, 78 46 Z"
        fill="url(#veti-body)"
      />
      <ellipse cx="42" cy="26" rx="6" ry="9" fill="#ffd9d0" />
      <ellipse cx="78" cy="26" rx="6" ry="9" fill="#ffd9d0" />

      {/* cabeza */}
      <circle cx="60" cy="62" r="40" fill="url(#veti-body)" />

      {/* mancha del pecho */}
      <path
        d="M60 98 C 46 96, 38 86, 40 74 C 52 84, 68 84, 80 74 C 82 86, 74 96, 60 98 Z"
        fill="#ffffff"
        opacity="0.92"
      />

      {/* hocico */}
      <ellipse cx="60" cy="76" rx="23" ry="17" fill="#ffffff" />

      {/* ojos */}
      <ellipse cx="45" cy="57" rx="6.5" ry="8.5" fill="#17302f" />
      <ellipse cx="75" cy="57" rx="6.5" ry="8.5" fill="#17302f" />
      <circle cx="47" cy="54" r="2.3" fill="#ffffff" />
      <circle cx="77" cy="54" r="2.3" fill="#ffffff" />

      {/* nariz */}
      <path
        d="M60 69 L55 74 H65 Z"
        fill="#17302f"
        stroke="#17302f"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* boca */}
      <path
        d="M60 74 C 57 78, 53 79, 50 77.5"
        stroke="#17302f"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M60 74 C 63 78, 67 79, 70 77.5"
        stroke="#17302f"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />

      {/* cachetes */}
      <ellipse cx="37" cy="66" rx="5" ry="3.2" fill="#ffc9c0" opacity="0.85" />
      <ellipse cx="83" cy="66" rx="5" ry="3.2" fill="#ffc9c0" opacity="0.85" />

      {/* estetoscopio */}
      <path
        d="M70 94 C 78 88, 84 82, 86 76"
        stroke="#0e9491"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="87" cy="73" r="5" fill="#0e9491" />
      <circle cx="87" cy="73" r="2.2" fill="#ffffff" />
    </svg>
  );
}