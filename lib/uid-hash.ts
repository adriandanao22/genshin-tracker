import "server-only";
import { createHmac, hkdfSync } from "node:crypto";

/**
 * Pseudonymise a HoYoLAB game UID before it ever touches the database.
 *
 * We use a DETERMINISTIC keyed hash (HMAC-SHA256), not reversible encryption:
 * the same UID must map to the same row key so we can look it up, but the real
 * UID is never stored and can't be recovered from the hash. A plain SHA-256
 * would be brute-forceable (UIDs are ~9 digits), so the HMAC key — derived
 * from the server secret — is what makes enumeration impossible without it.
 *
 * The HMAC key is an HKDF subkey of HOYOLAB_SESSION_SECRET with a distinct
 * label, so the cookie key and the UID key are never the same bytes. Keep the
 * secret STABLE: rotating it changes every pseudonym and orphans saved rows.
 */
function uidHashKey(): Buffer {
  const secret = process.env.HOYOLAB_SESSION_SECRET;
  if (!secret) throw new Error("HOYOLAB_SESSION_SECRET is not configured");
  // hkdfSync returns an ArrayBuffer; wrap it as a Buffer for createHmac.
  return Buffer.from(
    hkdfSync("sha256", secret, "", "orbital-uid-pseudonym", 32),
  );
}

export function uidHash(uid: string): string {
  return createHmac("sha256", uidHashKey()).update(uid).digest("base64url");
}
