import { archiveUser as archiveUserAccount, authenticateLogin, bearerToken, confirmEmailManually, createUser, getAccesses, logout as endSession, permanentlyDeleteUser as permanentlyDeleteUserAccount, resetPassword as resetUserPasswordAccount, resendVerificationEmail as resendUserVerificationEmailAccount, restoreUser as restoreUserAccount, verifyEmail } from "../services/authService.js";
import { listUsersOverview } from "../services/accountService.js";

export async function login(req, res) {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const result = await authenticateLogin(email, password, req);
  if (!result) return res.status(401).json({ message: "E-mail ou senha inválidos." });
  res.json(result);
}

export async function logout(req, res) {
  await endSession(bearerToken(req));
  res.status(204).end();
}

export function me(req, res) {
  res.json(req.user);
}

export async function listUsers(req, res) {
  res.json(await listUsersOverview({ search: String(req.query.search || ""), archived: req.query.archived === "true", page: req.query.page, pageSize: req.query.pageSize }));
}

export async function archiveUser(req, res) {
  res.json(await archiveUserAccount(req.params.id, { actor: req.user, ip: req.ip }));
}

export async function restoreUser(req, res) {
  res.json(await restoreUserAccount(req.params.id, { actor: req.user, ip: req.ip }));
}

export async function permanentlyDeleteUser(req, res) {
  res.json(await permanentlyDeleteUserAccount(req.params.id, { actor: req.user, ip: req.ip }));
}

export async function resetUserPassword(req, res) {
  res.json(await resetUserPasswordAccount(req.params.id, req.body?.password, {
    actor: req.user,
    ip: req.ip,
    sessionToken: req.sessionToken
  }));
}

export async function listAccesses(_req, res) {
  res.json(await getAccesses());
}

export async function registerUser(req, res) {
  const fields = ["name", "cpf", "birthDate", "phone", "email", "password"];
  if (fields.some(field => !String(req.body?.[field] || "").trim())) {
    return res.status(400).json({ message: "Preencha todos os campos do usuário." });
  }
  res.status(201).json(await createUser(req.body, { actor: req.user, ip: req.ip }));
}

export async function confirmUserEmail(req, res) {
  res.json(await confirmEmailManually(req.params.id, { actor: req.user, ip: req.ip }));
}

export async function resendUserVerificationEmail(req, res) {
  res.json(await resendUserVerificationEmailAccount(req.params.id, { actor: req.user, ip: req.ip }));
}

export async function confirmEmail(req, res) {
  const verified = await verifyEmail(req.query.token);
  if (!verified) return res.status(400).send("Link de confirmação inválido ou expirado.");
  res.send("<h1>E-mail confirmado com sucesso!</h1><p>Agora você já pode entrar na Lanchonete Boca Cheia.</p>");
}
