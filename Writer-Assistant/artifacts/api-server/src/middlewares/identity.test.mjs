import assert from "node:assert/strict";
import test from "node:test";
import { resolveIdentity, getSignedGuestId } from "./identity.ts";

async function resolve(req) {
  const cookies = [];
  const headers = {};
  let nextCalled = false;
  const res = {
    cookie: (...args) => cookies.push(args),
    setHeader: (name, value) => { headers[name] = value; },
  };
  await resolveIdentity(req, res, () => { nextCalled = true; });
  return { identity: req.identity, cookies, headers, nextCalled };
}

test("guest identity ignores a client-supplied UUID and issues a signed cookie", async () => {
  const forgedId = "11111111-1111-4111-8111-111111111111";
  const result = await resolve({
    headers: { "x-guest-id": forgedId },
    cookies: {},
    ip: "203.0.113.15",
  });

  assert.equal(result.nextCalled, true);
  assert.equal(result.identity.type, "guest");
  assert.notEqual(result.identity.id, forgedId);
  assert.equal(result.headers["X-Guest-Identity-Correction"], result.identity.id);
  assert.equal(result.cookies.length, 1);
  assert.equal(result.cookies[0][0], "wa_guest");
});

test("a valid signed cookie is authoritative over a conflicting client ID", async () => {
  const forgedId = "22222222-2222-4222-8222-222222222222";
  const first = await resolve({ headers: {}, cookies: {}, ip: "203.0.113.16" });
  const signedCookie = first.cookies[0][1];
  const result = await resolve({
    headers: { "x-guest-id": forgedId },
    cookies: { wa_guest: signedCookie },
    ip: "203.0.113.16",
  });

  assert.equal(getSignedGuestId({ cookies: { wa_guest: signedCookie } }), first.identity.id);
  assert.equal(result.identity.id, first.identity.id);
  assert.equal(result.headers["X-Guest-Identity-Correction"], first.identity.id);
  assert.equal(result.cookies.length, 0);
});

test("an invalid signed cookie cannot fall back to a caller-supplied ID", async () => {
  const forgedId = "33333333-3333-4333-8333-333333333333";
  const result = await resolve({
    headers: { "x-guest-id": forgedId },
    cookies: { wa_guest: "attacker.supplied.signature" },
    ip: "203.0.113.17",
  });

  assert.notEqual(result.identity.id, forgedId);
  assert.equal(getSignedGuestId({ cookies: { wa_guest: "attacker.supplied.signature" } }), null);
  assert.equal(result.headers["X-Guest-Identity-Correction"], result.identity.id);
});
