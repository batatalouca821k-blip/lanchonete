import test from "node:test";
import assert from "node:assert/strict";
import { buildVerificationEmail, sendWithResend } from "../src/services/emailService.js";

test("verification email has a styled confirmation link and safe password guidance", () => {
  const message = buildVerificationEmail({
    name: "Ana",
    verificationUrl: "https://example.com/api/auth/verify-email?token=abc123"
  });

  assert.equal(message.subject, "Confirme seu e-mail - Lanchonete Boca Cheia");
  assert.match(message.html, /Confirmar meu e-mail/);
  assert.match(message.html, /background-color:#a92d20/);
  assert.match(message.html, /sua senha.{0,80}não é enviada por e-mail/i);
  assert.match(message.text, /Use a senha inicial fornecida pelo administrador/);
  assert.equal("password" in message, false);
});

test("verification email escapes user-provided HTML", () => {
  const message = buildVerificationEmail({
    name: '<img src=x onerror="alert(1)">',
    verificationUrl: "https://example.com/verify?token=a&other=b"
  });

  assert.match(message.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(message.html, /<img src=x/);
  assert.match(message.html, /token=a&amp;other=b/);
});

test("sends confirmation through Resend HTTPS API without exposing the API key", async () => {
  let requestUrl;
  let requestOptions;
  const result = await sendWithResend({
    from: "Lanchonete <no-reply@example.com>",
    to: "cliente@example.com",
    subject: "Confirme seu e-mail",
    text: "Confirme",
    html: "<p>Confirme</p>"
  }, "re_test_secret", async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return { ok: true, status: 200, json: async () => ({ id: "email-id" }) };
  });

  assert.equal(requestUrl, "https://api.resend.com/emails");
  assert.equal(requestOptions.method, "POST");
  assert.equal(requestOptions.headers.Authorization, "Bearer re_test_secret");
  assert.deepEqual(JSON.parse(requestOptions.body), {
    from: "Lanchonete <no-reply@example.com>",
    to: ["cliente@example.com"],
    subject: "Confirme seu e-mail",
    text: "Confirme",
    html: "<p>Confirme</p>"
  });
  assert.deepEqual(result, { id: "email-id", status: 200 });
});

test("reports Resend API rejection instead of treating it as sent", async () => {
  await assert.rejects(
    sendWithResend({ from: "sender@example.com", to: "user@example.com", subject: "Test", text: "Test", html: "Test" }, "re_test_secret", async () => ({
      ok: false,
      status: 403,
      json: async () => ({ name: "domain_not_verified" })
    })),
    /Resend HTTP 403 \(domain_not_verified\)/
  );
});
