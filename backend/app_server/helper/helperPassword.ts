import crypto from "crypto";
import { promisify } from "util";

const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number
) => Promise<Buffer>;

const PREFIX = "scrypt";
const KEY_LENGTH = 64;

// Stored as `scrypt$<salt>$<hash>`, both hex encoded
const hashPassword = async (password: string) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `${PREFIX}$${salt}$${hash.toString("hex")}`;
};

// Accounts created before the switch still hold an unsalted md5 hex digest
const isLegacyHash = (stored: string) => !String(stored).startsWith(`${PREFIX}$`);

const verifyPassword = async (password: string, stored: string) => {
  if (!stored) return false;

  if (isLegacyHash(stored)) {
    const md5 = Buffer.from(crypto.createHash("md5").update(password).digest("hex"));
    const expected = Buffer.from(stored);
    return md5.length === expected.length && crypto.timingSafeEqual(md5, expected);
  }

  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = await scrypt(password, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

export { hashPassword, verifyPassword, isLegacyHash };
