import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, now } from "../db/index.js";
import { requireAuth, signToken } from "../middlewares/auth.js";

const router = Router();

/** Normaliza el email para evitar cuentas duplicadas (mayúsculas, espacios). */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const registerSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(60),
  email: z.string().trim().toLowerCase().email("Email inválido"),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(72, "La contraseña es muy larga"),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

router.post("/register", (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { name, password } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    res.status(409).json({ error: "Ya existe una cuenta con ese email" });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare("INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .run(name, email, passwordHash, now());

  const userId = Number(result.lastInsertRowid);
  const token = signToken({ userId, email, name });
  res.status(201).json({ token, user: { id: userId, name, email } });
});

router.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { password } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as
    | { id: number; name: string; email: string; password_hash: string }
    | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: "Email o contraseña incorrectos" });
    return;
  }

  const token = signToken({ userId: user.id, email: user.email, name: user.name });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

router.get("/me", requireAuth, (req, res) => {
  const user = db
    .prepare("SELECT id, name, email, created_at, lat, lng FROM users WHERE id = ?")
    .get(req.user!.userId);
  res.json({ user });
});

export default router;