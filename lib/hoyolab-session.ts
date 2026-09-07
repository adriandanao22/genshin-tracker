import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const sessionCookieName = "orbital_hoyolab_session";
const sessionSecret = process.env.HOYOLAB_SESSION_SECRET;

function getKey() {
  if (!sessionSecret) {
    throw new Error("HOYOLAB_SESSION_SECRET is not configured");
  }

  return createHash("sha256").update(sessionSecret).digest();
}

export type HoyoLabSession = {
  uid: string;
  server: string;
  ltuid: string;
  ltoken: string;
};

export function encryptSession(session: HoyoLabSession) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptSession(value: string): HoyoLabSession | null {
  try {
    const [ivValue, authTagValue, encryptedValue] = value.split(".");
    if (!ivValue || !authTagValue || !encryptedValue) return null;

    const decipher = createDecipheriv(
      "aes-256-gcm",
      getKey(),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]);
    const session = JSON.parse(decrypted.toString("utf8")) as HoyoLabSession;

    if (!session.uid || !session.server || !session.ltuid || !session.ltoken)
      return null;
    return session;
  } catch {
    return null;
  }
}

export { sessionCookieName };
