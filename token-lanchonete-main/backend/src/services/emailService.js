import { APP_URL, MAIL_FROM, RESEND_API_KEY } from "../config.js";

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export async function sendWithResend(message, apiKey, fetchImplementation = fetch) {
  const response = await fetchImplementation("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: message.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html
    })
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(`Resend HTTP ${response.status} (${result?.name || "erro desconhecido"})`);
  }
  if (!result.id) throw new Error("Resend não retornou o identificador do e-mail.");
  return { id: result.id, status: response.status };
}

export function buildVerificationEmail({ name, verificationUrl }) {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(verificationUrl);

  return {
    from: MAIL_FROM,
    subject: "Confirme seu e-mail - Lanchonete Boca Cheia",
    text: `Olá, ${name}!\n\nSeu cadastro na Lanchonete Boca Cheia foi criado. Para ativar sua conta, confirme seu e-mail neste link:\n${verificationUrl}\n\nO link expira em 24 horas e só pode ser usado uma vez.\n\nPor segurança, sua senha não é enviada por e-mail. Use a senha inicial fornecida pelo administrador.\n\nSe você não esperava esta mensagem, ignore este e-mail.`,
    html: `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background-color:#f4f1ed;font-family:Arial,Helvetica,sans-serif;color:#292522;">
    <div style="display:none;font-size:1px;color:#f4f1ed;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Seu cadastro está quase pronto. Confirme seu e-mail para ativar a conta.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f1ed;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;">
          <tr><td style="background-color:#a92d20;padding:28px 36px;text-align:center;">
            <div style="font-size:13px;font-weight:bold;letter-spacing:3px;color:#ffe1b8;">LANCHONETE</div>
            <div style="margin-top:5px;font-size:28px;font-weight:bold;letter-spacing:1px;color:#ffffff;">BOCA CHEIA</div>
          </td></tr>
          <tr><td style="padding:36px 36px 24px;">
            <div style="display:inline-block;padding:7px 12px;background-color:#fff1df;border-radius:20px;color:#8a3a20;font-size:12px;font-weight:bold;letter-spacing:1px;">CADASTRO CRIADO</div>
            <h1 style="margin:20px 0 12px;font-size:26px;line-height:1.3;color:#292522;">Olá, ${safeName}!</h1>
            <p style="margin:0;font-size:16px;line-height:1.7;color:#625b55;">Que bom ter você com a gente. Confirme seu endereço de e-mail para ativar sua conta e começar a usar o sistema.</p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px auto;">
              <tr><td align="center" style="border-radius:8px;background-color:#c83b28;">
                <a href="${safeUrl}" style="display:inline-block;padding:15px 26px;border:1px solid #c83b28;border-radius:8px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">Confirmar meu e-mail</a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#625b55;">O link expira em 24 horas e só pode ser usado uma vez.</p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#625b55;">Se o botão não funcionar, copie este endereço para o navegador:</p>
            <p style="margin:8px 0 0;word-break:break-all;font-size:12px;line-height:1.6;"><a href="${safeUrl}" style="color:#a92d20;">${safeUrl}</a></p>
          </td></tr>
          <tr><td style="padding:0 36px;"><div style="height:1px;background-color:#eee8e2;"></div></td></tr>
          <tr><td style="padding:22px 36px 30px;">
            <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#625b55;"><strong style="color:#292522;">Sobre sua senha:</strong> por segurança, ela não é enviada por e-mail. Use a senha inicial fornecida pelo administrador.</p>
            <p style="margin:0;font-size:12px;line-height:1.6;color:#8a817a;">Se você não esperava esta mensagem, pode ignorá-la. Não responda a este e-mail.</p>
          </td></tr>
        </table>
        <p style="margin:18px 0 0;font-size:11px;color:#8a817a;">Lanchonete Boca Cheia</p>
      </td></tr>
    </table>
  </body>
</html>`
  };
}

export async function sendVerificationEmail({ name, email, token }) {
  const verificationUrl = `${APP_URL.replace(/\/+$/, "")}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const message = { ...buildVerificationEmail({ name, verificationUrl }), to: email };

  if (!RESEND_API_KEY || !MAIL_FROM) {
    console.warn("Resend não configurado. Defina RESEND_API_KEY e MAIL_FROM para enviar e-mails de confirmação.");
    return { accepted: false };
  }
  try {
    const result = await sendWithResend(message, RESEND_API_KEY);
    console.info("Resend aceitou o e-mail de confirmação:", { status: result.status, emailId: result.id });
    return { accepted: true };
  } catch (error) {
    console.error("Falha ao enviar e-mail de confirmação pelo Resend:", error.message);
    return { accepted: false };
  }
}
