import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

process.env.RESEND_API_KEY = "re_test_key";
process.env.MAIL_FROM = "Lanchonete <no-reply@example.com>";

const { createUserDirect, query, resetDatabase, shutdown, startServer } = await import("./helpers.js");

let server;
let adminToken;

before(async () => {
  await resetDatabase();
  server = await startServer();
  const admin = await createUserDirect({ name: "Admin", email: "admin-resend@teste.com", role: "admin" });
  adminToken = await server.login(admin);
});

after(() => shutdown(server));

async function addExistingVerification(userId, token) {
  await query(
    "INSERT INTO email_verifications (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    [randomUUID(), userId, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + 24 * 3600 * 1000)]
  );
}

async function withResendResponse(response, callback) {
  const originalFetch = globalThis.fetch;
  const messages = [];
  globalThis.fetch = async (input, options) => {
    if (String(input) === "https://api.resend.com/emails") {
      messages.push(JSON.parse(options.body));
      return response(messages.length);
    }
    return originalFetch(input, options);
  };
  try {
    return await callback(messages);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("admin can resend a confirmation and the new link invalidates old links", async () => {
  const user = await createUserDirect({ name: "Cliente pendente", verified: false });
  const oldToken = randomUUID();
  await addExistingVerification(user.id, oldToken);

  await withResendResponse(count => ({
    ok: true,
    status: 200,
    json: async () => ({ id: `resend-${count}` })
  }), async messages => {
    const result = await server.api("POST", `/api/admin/users/${user.id}/resend-verification-email`, { token: adminToken });
    assert.equal(result.status, 200);
    assert.equal(result.data.emailAccepted, true);
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].to, [user.email]);

    const tokenMatch = messages[0].text.match(/\/api\/auth\/verify-email\?token=([^\s]+)/);
    assert.ok(tokenMatch, "the email contains a verification link");
    const newToken = tokenMatch[1];

    assert.equal((await server.api("GET", `/api/auth/verify-email?token=${oldToken}`)).status, 400);
    assert.equal((await server.api("GET", `/api/auth/verify-email?token=${newToken}`)).status, 200);
  });
});

test("a rejected resend leaves the previously delivered confirmation link usable", async () => {
  const user = await createUserDirect({ name: "Cliente com link anterior", verified: false });
  const oldToken = randomUUID();
  await addExistingVerification(user.id, oldToken);

  await withResendResponse(() => ({
    ok: false,
    status: 403,
    json: async () => ({ name: "domain_not_verified" })
  }), async messages => {
    const result = await server.api("POST", `/api/admin/users/${user.id}/resend-verification-email`, { token: adminToken });
    assert.equal(result.status, 200);
    assert.equal(result.data.emailAccepted, false);
    assert.equal(messages.length, 1);
    assert.equal((await server.api("GET", `/api/auth/verify-email?token=${oldToken}`)).status, 200);
  });
});
