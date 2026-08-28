import crypto from "crypto";

const ALGO = "aes-256-gcm";

function requireHexKey(name: string, bytes = 32): Buffer {
  const hex = process.env[name];
  if (!hex || !/^[0-9a-fA-F]+$/.test(hex) || hex.length !== bytes * 2) {
    throw new Error(`${name} must be a ${bytes}-byte hex string (${bytes * 2} chars)`);
  }
  return Buffer.from(hex, "hex");
}

export function getEncryptionKey(): Buffer {
  return requireHexKey("ENCRYPTION_KEY", 32);
}

export function getHmacKey(): Buffer {
  return requireHexKey("HMAC_KEY", 32);
}

export function encrypt(plain: string | null | undefined): string {
  if (plain == null || plain === "") return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getEncryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decrypt(value: string | null | undefined): string {
  if (!value) return "";
  if (!value.startsWith("enc:")) return value;
  const parts = value.split(":");
  if (parts.length !== 4) throw new Error("Malformed ciphertext");
  const [, ivH, tagH, dataH] = parts;
  const decipher = crypto.createDecipheriv(
    ALGO,
    getEncryptionKey(),
    Buffer.from(ivH, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagH, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataH, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function hmacIndex(value: string | null | undefined): string {
  const normalised = (value ?? "").trim().toLowerCase();
  if (!normalised) return "";
  return crypto.createHmac("sha256", getHmacKey()).update(normalised).digest("hex");
}

export function randomHex(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function isEncrypted(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith("enc:"));
}
