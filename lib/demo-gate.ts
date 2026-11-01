/**
 * A demonstration gate, not production authentication: one shared password, whose
 * signed cookie keeps casual visitors out of the shared demo. Web Crypto, because
 * this also runs in the proxy.
 */
export const GATE_COOKIE = "cw-demo-gate";
const MESSAGE = "contractwatch-demo";

async function sign(password: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(MESSAGE),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function gateToken(password: string) {
  return sign(password);
}

export async function isGateOpen(
  password: string | undefined,
  cookie: string | undefined,
) {
  if (!password) return true;
  if (!cookie) return false;
  const expected = await sign(password);
  if (cookie.length !== expected.length) return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index++) {
    difference |= cookie.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

/** Keeps a return path on this site, so the form cannot send anyone elsewhere. */
export function safeReturnPath(value: unknown, fallback: string) {
  return typeof value === "string" && /^\/(?![/\\])/.test(value)
    ? value
    : fallback;
}
