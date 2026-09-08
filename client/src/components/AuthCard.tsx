import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";

type Mode = "login" | "register";

interface Props {
  onAuthed?: () => void;
}

export default function AuthCard({ onAuthed }: Props) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isLogin = mode === "login";

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isLogin && password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    setLoading(true);
    try {
      if (isLogin) await login(email, password);
      else await register(name, email, password);
      onAuthed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hubo un problema. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-tabs">
        <button
          type="button"
          className={`auth-tab ${isLogin ? "active" : ""}`}
          onClick={() => switchMode("login")}
        >
          Ingresar
        </button>
        <button
          type="button"
          className={`auth-tab ${!isLogin ? "active" : ""}`}
          onClick={() => switchMode("register")}
        >
          Registrarme
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {!isLogin && (
          <label>
            Nombre
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              autoComplete="name"
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          Contraseña
          <div className="pwd-wrap">
            <input
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isLogin ? 1 : 8}
              autoComplete={isLogin ? "current-password" : "new-password"}
            />
            <button
              type="button"
              className="pwd-toggle"
              onClick={() => setShowPwd((s) => !s)}
              title={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPwd ? "🙈" : "👁️"}
            </button>
          </div>
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading
            ? isLogin
              ? "Ingresando…"
              : "Creando cuenta…"
            : isLogin
              ? "Ingresar a la app"
              : "Crear mi cuenta"}
        </button>
      </form>

      <p className="auth-note">
        {isLogin
          ? "¿Es tu primera vez? Registrate gratis en un minuto."
          : "Al registrarte podés chatear con Veti y guardar tu historial."}
      </p>
    </div>
  );
}