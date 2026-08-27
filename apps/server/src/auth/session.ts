import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "ai_town_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSessionToken(userId: string, secret: string, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + SESSION_SECONDS;
  const value = `${userId}.${expiresAt}`;
  return `${value}.${sign(value, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string, now = Date.now()): string | null {
  if (!token) return null;
  const [userId, expiresText, received] = token.split(".");
  if (!userId || !expiresText || !received) return null;
  const expiresAt = Number(expiresText);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(now / 1000)) return null;
  const expected = sign(`${userId}.${expiresText}`, secret);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return null;
  return timingSafeEqual(expectedBuffer, receivedBuffer) ? userId : null;
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(header.split(";").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, decodeURIComponent(rest.join("="))];
  }).filter(([key]) => key));
}

