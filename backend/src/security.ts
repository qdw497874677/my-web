import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [, saltText, hashText] = encoded.split(":");
  if (!saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64");
  const actual = (await scrypt(
    password,
    Buffer.from(saltText, "base64"),
    expected.length,
  )) as Buffer;
  return timingSafeEqual(actual, expected);
}
