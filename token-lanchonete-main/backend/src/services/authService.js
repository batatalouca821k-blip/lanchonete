import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SESSION_HOURS } from "../config.js";
import { isDuplicateError, query, queryOne, transaction } from "../database.js";
import { HttpError, requireText } from "../utils/http.js";
import { audit } from "./auditService.js";
import { sendVerificationEmail } from "./emailService.js";
import { hashPassword, verifyPassword } from "./passwordService.js";

const sha256 = value => createHash("sha256").update(value).digest("hex");

export function publicUser(row) {
  return {
    id: row.id, name: row.name, cpf: row.cpf, birthDate: row.birth_date, phone: row.phone, email: row.email,
    role: row.role, createdAt: row.created_at, emailVerified: Boolean(row.email_verified)
  };
}

// ---- Limite de tentativas de login (por IP + e-mail), em memória ----
const attempts = new Map();
const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60 * 1000;

function attemptKey(ip, email) { return `${ip}|${email}`; }
function isBlocked(key) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) { attempts.delete(key); return false; }
  return entry.count >= MAX_FAILURES;
}
function registerFailure(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) attempts.set(key, { count: 1, first: Date.now() });
  else entry.count += 1;
}
export function resetLoginAttempts() { attempts.clear(); }

export async function authenticateLogin(email, password, request) {
  const key = attemptKey(request.ip, email);
  if (isBlocked(key)) throw new HttpError(429, "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.");

  const row = await queryOne("SELECT * FROM users WHERE email = ? AND deleted_at IS NULL", [email]);
  const valid = row ? await verifyPassword(password, { salt: row.salt, passwordHash: row.password_hash }) : false;
  if (!valid) { registerFailure(key); return null; }
  if (!row.email_verified) throw new HttpError(403, "Confirme seu e-mail antes de entrar.");
  attempts.delete(key);

  const accessToken = randomBytes(32).toString("base64url");
  const now = new Date();
  await transaction(async conn => {
    await query("INSERT INTO sessions (token_hash, user_id, ip, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      [sha256(accessToken), row.id, request.ip, now, new Date(now.getTime() + SESSION_HOURS * 3600 * 1000)], conn);
    await query("INSERT INTO access_logs (id, user_id, name, email, role, accessed_at, ip) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [randomUUID(), row.id, row.name, row.email, row.role, now, request.ip], conn);
    await audit(conn, { actor: row, ip: request.ip, action: "login", entity: "session", entityId: row.id });
    await query("DELETE FROM sessions WHERE expires_at < ?", [now], conn);
  });
  return { accessToken, user: publicUser(row) };
}

export async function logout(token) {
  if (token) await query("DELETE FROM sessions WHERE token_hash = ?", [sha256(token)]);
}

export function bearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function requireAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ message: "Sessão expirada. Faça login novamente." });
  const row = await queryOne(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.deleted_at IS NULL`,
    [sha256(token), new Date()]
  );
  if (!row) return res.status(401).json({ message: "Sessão expirada. Faça login novamente." });
  req.user = publicUser(row);
  req.sessionToken = token;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Acesso exclusivo para administradores." });
  next();
}

export async function createUser(data, { actor, ip } = {}) {
  const name = requireText(data.name, "o nome", { max: 120 });
  const email = requireText(data.email, "o e-mail", { max: 190 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Informe um e-mail válido.");
  const password = String(data.password || "");
  if (password.length < 8) throw new HttpError(400, "A senha deve ter pelo menos 8 caracteres.");
  const role = data.role ?? "user";
  if (!["user", "admin"].includes(role)) throw new HttpError(400, "Selecione um perfil válido.");
  const cpf = requireText(data.cpf, "o CPF", { max: 20 });
  const birthDate = requireText(data.birthDate, "a data de nascimento", { max: 10 });
  const phone = requireText(data.phone, "o telefone", { max: 30 });

  const record = await hashPassword(password);
  const id = randomUUID();
  const now = new Date();
  const verificationToken = randomBytes(32).toString("hex");

  try {
    await transaction(async conn => {
      await query(
        `INSERT INTO users (id, name, cpf, birth_date, phone, email, role, password_hash, salt, email_verified, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, ?)`,
        [id, name, cpf, birthDate, phone, email, role, record.passwordHash, record.salt, now], conn
      );
      await query("INSERT INTO email_verifications (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
        [randomUUID(), id, sha256(verificationToken), new Date(now.getTime() + 24 * 3600 * 1000)], conn);
      await audit(conn, { actor, ip, action: "create", entity: "user", entityId: id, details: { email, name, role } });
    });
  } catch (error) {
    if (isDuplicateError(error)) throw new HttpError(409, "Este e-mail já está cadastrado.");
    throw error;
  }

  const delivery = await sendVerificationEmail({ name, email, token: verificationToken });
  const user = await queryOne("SELECT * FROM users WHERE id = ?", [id]);
  return { user: publicUser(user), emailSent: delivery.sent };
}

export async function verifyEmail(token) {
  const verification = await queryOne(
    `SELECT v.* FROM email_verifications v JOIN users u ON u.id = v.user_id
     WHERE v.token_hash = ? AND v.used_at IS NULL AND v.expires_at > ? AND u.deleted_at IS NULL`,
    [sha256(String(token || "")), new Date()]
  );
  if (!verification) return false;
  await transaction(async conn => {
    await query("UPDATE users SET email_verified = TRUE WHERE id = ?", [verification.user_id], conn);
    await query("UPDATE email_verifications SET used_at = ? WHERE id = ?", [new Date(), verification.id], conn);
    await audit(conn, { action: "verify", entity: "email", entityId: verification.user_id });
  });
  return true;
}

export async function confirmEmailManually(userId, { actor, ip }) {
  const user = await queryOne("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL", [userId]);
  if (!user) throw new HttpError(404, "Usuário não encontrado.");
  await transaction(async conn => {
    await query("UPDATE users SET email_verified = TRUE WHERE id = ?", [userId], conn);
    await audit(conn, { actor, ip, action: "verify-manual", entity: "user", entityId: userId, details: { email: user.email } });
  });
  return publicUser({ ...user, email_verified: true });
}

export async function archiveUser(userId, { actor, ip }) {
  if (userId === actor.id) throw new HttpError(409, "Você não pode arquivar sua própria conta.");

  return transaction(async conn => {
    let activeAdminCount = 0;
    const candidate = await queryOne("SELECT role FROM users WHERE id = ? AND deleted_at IS NULL", [userId], conn);
    if (!candidate) throw new HttpError(404, "Usuário não encontrado ou já arquivado.");
    if (candidate.role === "admin") {
      const admins = await query(
        "SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL ORDER BY id FOR UPDATE",
        [],
        conn
      );
      activeAdminCount = admins.length;
    }

    const user = await queryOne("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [userId], conn);
    if (!user) throw new HttpError(404, "Usuário não encontrado ou já arquivado.");
    if (user.role === "admin" && activeAdminCount <= 1) {
      throw new HttpError(409, "Não é possível arquivar o último administrador ativo.");
    }

    const deletedAt = new Date();
    await query("UPDATE users SET deleted_at = ? WHERE id = ?", [deletedAt, userId], conn);
    await query("DELETE FROM sessions WHERE user_id = ?", [userId], conn);
    await query("DELETE FROM email_verifications WHERE user_id = ?", [userId], conn);
    await audit(conn, {
      actor, ip, action: "archive", entity: "user", entityId: userId,
      details: { email: user.email, name: user.name, role: user.role, deletedAt }
    });
    return { id: userId, archived: true };
  });
}

export async function restoreUser(userId, { actor, ip }) {
  return transaction(async conn => {
    const user = await queryOne("SELECT * FROM users WHERE id = ? AND deleted_at IS NOT NULL FOR UPDATE", [userId], conn);
    if (!user) throw new HttpError(404, "Usuário arquivado não encontrado.");
    await query("UPDATE users SET deleted_at = NULL WHERE id = ?", [userId], conn);
    await audit(conn, {
      actor, ip, action: "restore", entity: "user", entityId: userId,
      details: { email: user.email, name: user.name, role: user.role }
    });
    return { id: userId, archived: false };
  });
}

export async function permanentlyDeleteUser(userId, { actor, ip }) {
  if (userId === actor.id) throw new HttpError(409, "Você não pode excluir permanentemente sua própria conta.");

  return transaction(async conn => {
    const user = await queryOne("SELECT * FROM users WHERE id = ? AND deleted_at IS NOT NULL FOR UPDATE", [userId], conn);
    if (!user) throw new HttpError(404, "Usuário arquivado não encontrado.");

    if (user.role === "admin") {
      const { count } = await queryOne("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND deleted_at IS NULL", [], conn);
      if (Number(count) === 0) {
        throw new HttpError(409, "Não é possível excluir o último administrador. Ative outro administrador primeiro.");
      }
    }

    await query("SELECT id FROM accounts WHERE user_id = ? ORDER BY id FOR UPDATE", [userId], conn);
    const pending = await queryOne(
      `SELECT COUNT(*) AS count FROM payments p
       LEFT JOIN accounts a ON a.id = p.account_id
       WHERE (p.user_id = ? OR a.user_id = ?) AND p.status = 'pending'`,
      [userId, userId],
      conn
    );
    if (Number(pending.count) > 0) {
      throw new HttpError(409, "Cancele ou resolva os pagamentos pendentes antes de excluir permanentemente este usuário.");
    }

    await query(
      "UPDATE payments SET account_id = NULL, user_id = NULL WHERE user_id = ? OR account_id IN (SELECT id FROM accounts WHERE user_id = ?)",
      [userId, userId],
      conn
    );
    await query(
      `UPDATE audit_log
       SET actor_id = NULL, actor_name = 'Usuário excluído', actor_role = NULL, details = NULL, ip = NULL
       WHERE actor_id = ?`,
      [userId],
      conn
    );
    await query(
      `DELETE FROM audit_log
       WHERE (entity = 'user' AND entity_id = ?)
          OR account_id IN (SELECT id FROM accounts WHERE user_id = ?)`,
      [userId, userId],
      conn
    );
    await query("DELETE FROM access_logs WHERE user_id = ?", [userId], conn);
    await query("DELETE FROM account_items WHERE account_id IN (SELECT id FROM accounts WHERE user_id = ?)", [userId], conn);
    await query("DELETE FROM accounts WHERE user_id = ?", [userId], conn);
    await query("DELETE FROM sessions WHERE user_id = ?", [userId], conn);
    await query("DELETE FROM email_verifications WHERE user_id = ?", [userId], conn);
    await query("DELETE FROM users WHERE id = ?", [userId], conn);
    await audit(conn, { actor, ip, action: "user-permanently-deleted", entity: "user" });

    return { id: userId, permanentlyDeleted: true };
  });
}

export async function resetPassword(userId, password, { actor, ip, sessionToken }) {
  const newPassword = String(password || "");
  if (newPassword.length < 8) throw new HttpError(400, "A senha deve ter pelo menos 8 caracteres.");
  if (newPassword.length > 128) throw new HttpError(400, "A senha deve ter no máximo 128 caracteres.");

  const record = await hashPassword(newPassword);
  return transaction(async conn => {
    const user = await queryOne("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE", [userId], conn);
    if (!user) throw new HttpError(404, "Usuário ativo não encontrado.");

    await query("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", [record.passwordHash, record.salt, userId], conn);
    if (userId === actor.id && sessionToken) {
      await query("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", [userId, sha256(sessionToken)], conn);
    } else {
      await query("DELETE FROM sessions WHERE user_id = ?", [userId], conn);
    }
    await audit(conn, {
      actor, ip, action: "password-reset", entity: "user", entityId: userId,
      details: { email: user.email }
    });
    return { id: userId, passwordReset: true };
  });
}

export async function getAccesses({ limit = 300 } = {}) {
  const rows = await query(`SELECT id, user_id, name, email, role, accessed_at, ip FROM access_logs ORDER BY accessed_at DESC LIMIT ${Math.min(1000, Math.trunc(limit))}`);
  return rows.map(row => ({ id: row.id, userId: row.user_id, name: row.name, email: row.email, role: row.role, accessedAt: row.accessed_at, ip: row.ip }));
}
