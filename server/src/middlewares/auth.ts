import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { AuthPayload } from "../types.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

// Fijamos el algoritmo explícitamente tanto al firmar como al verificar:
// sin esto, jwt.verify acepta cualquier algoritmo presente en el token
// (riesgo de "alg confusion" si algún día se agrega una key asimétrica).
const JWT_ALG = "HS256" as const;

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "30d", algorithm: JWT_ALG });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), config.jwtSecret, {
      algorithms: [JWT_ALG],
    }) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Sesión inválida o expirada" });
  }
}