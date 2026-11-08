import nodemailer from "nodemailer";
import { APP_URL, MAIL_FROM, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER } from "../config.js";

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

function transporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
}

// A senha NUNCA é enviada por e-mail: o administrador a repassa diretamente ao cliente.
export async function sendVerificationEmail({ name, email, token }) {
  const verificationUrl = `${APP_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const message = {
    from: MAIL_FROM,
    to: email,
    subject: "Confirme seu e-mail - Lanchonete Boca Cheia",
    text: `Olá, ${name}!\n\nConfirme seu cadastro acessando:\n${verificationUrl}\n\nEste link expira em 24 horas.`,
    html: `<h2>Olá, ${escapeHtml(name)}!</h2><p>Seu cadastro na Lanchonete Boca Cheia foi criado.</p><p><a href="${verificationUrl}">Confirmar meu e-mail</a></p><p>Este link expira em 24 horas.</p>`
  };

  const mailer = transporter();
  if (!mailer) {
    console.warn("SMTP não configurado. Link de confirmação para", email, "->", verificationUrl);
    return { sent: false, verificationUrl };
  }
  try {
    await mailer.sendMail(message);
    return { sent: true, verificationUrl };
  } catch (error) {
    console.error("Falha ao enviar e-mail de confirmação:", error.message);
    return { sent: false, verificationUrl };
  }
}
