import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import VetiAvatar from "../components/VetiAvatar";
import AuthCard from "../components/AuthCard";
import { useFollowUpNotifier } from "../hooks/useChatAlerts";

const FEATURES = [
  {
    emoji: "🚦",
    title: "Prioriza la urgencia",
    text: "Veti evalúa lo que contás y te dice exactamente qué hacer: desde cuidados en casa hasta salir YA a una clínica, sin rodeos.",
  },
  {
    emoji: "📍",
    title: "Veterinarias cerca",
    text: "Si el caso lo amerita, te muestra las veterinarias más cercanas a tu ubicación con teléfono y dirección.",
  },
  {
    emoji: "🩺",
    title: "Seguimiento",
    text: "Veti vuelve a escribirte para saber cómo sigue tu mascota y si necesita una consulta presencial.",
  },
];

export default function HomePage({ authed }: { authed: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Si la sesión está iniciada, seguimos avisando cuando llegan seguimientos.
  useFollowUpNotifier(user?.id);

  useEffect(() => {
    document.title = "VetiBot · Primer filtro veterinario";
  }, []);

  return (
    <div className="home-page">
      <header className="home-nav">
        <Link to="/home" className="home-logo">
          <VetiAvatar size={38} />
          <span className="logo-text">
            Veti<strong>Bot</strong>
          </span>
        </Link>
        <nav className="home-links">
          <a href="#como-funciona" className="home-link-howworks">
            Cómo funciona
          </a>
          <Link to="/partner" className="home-partner-link">
            🏥 <span className="home-partner-link-text">Para veterinarias</span>
          </Link>
          {authed ? (
            <button className="btn-nav" onClick={() => navigate("/app")}>
              Ir a la app →
            </button>
          ) : (
            <a href="#entrar" className="btn-nav">
              Ingresar
            </a>
          )}
        </nav>
      </header>

      <section className="hero">
        <div className="hero-text">
          <div className="hero-badge">🐾 Primer filtro veterinario, gratis</div>
          <h1>
            Cuando tu mascota
            <br />
            no puede esperar, <span>Veti</span> te orienta.
          </h1>
          <p>
            Veti es un asistente de triaje veterinario: escucha qué le pasa a tu mascota,
            clasifica la urgencia y te guía al siguiente paso — desde un consejo en casa hasta
            la clínica más cercana.
          </p>
          <div className="hero-cta">
            {authed ? (
              <>
                <button className="btn-primary" onClick={() => navigate("/app")}>
                  Abrir la app →
                </button>
                <button className="btn-ghost-dark" onClick={logout}>
                  Cerrar sesión ({user?.name?.split(" ")[0]})
                </button>
              </>
            ) : (
              <>
                <a href="#entrar" className="btn-primary">
                  Empezar ahora
                </a>
                <a href="#como-funciona" className="btn-ghost-dark">
                  ¿Cómo funciona? ↓
                </a>
              </>
            )}
          </div>
        </div>

        <div className="hero-art">
          <VetiAvatar size={200} className="hero-mascot" />
          <div className="floating-card f1">🩺 ¿Esto es grave?</div>
          <div className="floating-card f2">🏥 3 clínicas a 800 m</div>
        </div>
      </section>

      <section id="como-funciona" className="features">
        <h2>¿Qué hace Veti?</h2>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div className="feature-card" key={f.title}>
              <div className="feature-emoji">{f.emoji}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
        <p className="disclaimer">
          ⚠️ Veti da orientación preliminar y no reemplaza la consulta veterinaria presencial.
        </p>
      </section>

      <section id="entrar" className="enter">
        <div className="enter-info">
          <h2>Hola 👋 Empecemos</h2>
          <p>
            Creá tu cuenta o ingresá para chatear con Veti. Guardamos tu historial para hacer
            seguimiento de tu mascota.
          </p>
          <ul className="enter-list">
            <li>✅ Chat en español, directo y sin rodeos</li>
            <li>✅ Historial de cada consulta</li>
            <li>✅ Seguimiento automático del estado del animal</li>
          </ul>
        </div>
        <div className="enter-auth">
          <AuthCard
            onAuthed={() => navigate("/app")}
          />
        </div>
      </section>

      <footer className="home-footer">
        <div className="footer-logo">
          <VetiAvatar size={26} />
          <span>
            Veti<strong>Bot</strong>
          </span>
        </div>
        <p>
          Orientación preliminar de triaje veterinario. Ante una emergencia real, acudí a la
          clínica más cercana.
        </p>
      </footer>
    </div>
  );
}