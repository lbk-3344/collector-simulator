import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

// AES-256-GCM encryption for per-user Bartender API keys, stored encrypted at
// rest (never plaintext) — see CLAUDE-CONCEPT.md section 7.1, BACKLOG.md
// BL-032. ENCRYPTION_KEY is a base64-encoded 32-byte key, generated via
// `openssl rand -base64 32` and set identically in every environment —
// rotating it makes previously-saved keys undecryptable.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended IV length for GCM

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not set — cannot encrypt/decrypt Bartender API keys.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must decode to 32 bytes for AES-256-GCM, got ${key.length}.`);
  }
  return key;
}

// Returns "iv:authTag:ciphertext", each segment base64-encoded.
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decrypt(payload: string): string {
  const key = getKey();
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed ciphertext — expected \"iv:authTag:ciphertext\".");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  // Throws if the auth tag doesn't match — tampered or corrupted ciphertext.
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
