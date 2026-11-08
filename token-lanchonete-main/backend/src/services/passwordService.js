import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// Mantém o mesmo formato já usado pelo sistema (scrypt de 64 bytes + salt hex), assim as senhas
// existentes continuam válidas depois da migração.
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64);
  return { salt, passwordHash: hash.toString("hex") };
}

export async function verifyPassword(password, { salt, passwordHash }) {
  const hash = await scryptAsync(password, salt, 64);
  const stored = Buffer.from(passwordHash, "hex");
  return hash.length === stored.length && timingSafeEqual(hash, stored);
}
