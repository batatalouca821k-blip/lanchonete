import test from "node:test";
import assert from "node:assert/strict";
import { buildVerificationEmail } from "../src/services/emailService.js";

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
