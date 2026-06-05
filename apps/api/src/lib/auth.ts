import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

/**
 * JWT secret. MUST be set in production via env. We fall back to a dev-only
 * default so local setup doesn't break, but log a warning — a real secret is
 * required for tokens to be secure.
 */
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-insecure-secret-change-me";
if (!process.env.JWT_SECRET) {
  console.warn("[auth] JWT_SECRET not set — using insecure dev default. Set JWT_SECRET in .env.");
}

const TOKEN_TTL = "30d"; // how long a login stays valid

export async function hashPassword(plain: string): Promise<string> {
  // 10 salt rounds is the standard cost factor — secure and fast enough.
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/** Verify a token and return the user id, or null if invalid/expired. */
export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
