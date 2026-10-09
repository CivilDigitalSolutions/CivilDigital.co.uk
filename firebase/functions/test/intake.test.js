import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, createRateLimiter, buildEmails, createHandler, makeRef } from "../lib.js";

const good = {
  name: "Test Person",
  email: "test@example.com",
  option: "feature-test",
  app_link: "https://play.google.com/apps/testing/com.example",
  create_dummy: true,
  journeys: "Sign up\nthen checkout",
  website: ""
};

function fakeRes() {
  return {
    statusCode: 0, headers: {}, body: undefined,
    set(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; }
  };
}
function fakeReq(body, { method = "POST", origin = "https://civildigital.co.uk", ip = "1.2.3.4" } = {}) {
  return { method, body, ip, rawBody: Buffer.from(JSON.stringify(body || {})), get: (h) => (h === "origin" ? origin : undefined) };
}
function setup(status = 200) {
  const sent = [];
  const handler = createHandler({
    apiKey: () => "re_test",
    from: () => "Civil Digital <bookings@civildigital.co.uk>",
    allowedOrigins: ["https://civildigital.co.uk"],
    resendBase: "https://resend.invalid",
    fetchImpl: async (url, opts) => { sent.push({ url, ...opts, json: JSON.parse(opts.body) }); return { ok: status < 300, status }; },
    log: { error() {}, warn() {} }
  });
  return { handler, sent };
}

test("accepts a complete submission and keeps only known fields", () => {
  const r = validate({ ...good, password: "hunter2" });
  assert.equal(r.ok, true);
  assert.equal(r.data.password, undefined);
  assert.equal(r.data.create_dummy, true);
  assert.equal(r.data.journeys, "Sign up\nthen checkout");
});

test("rejects missing required fields, bad email, bad option and non-web links", () => {
  const r = validate({ email: "nope", option: "free", app_link: "javascript:alert(1)" });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ["app_link", "email", "name", "option"]);
});

test("strips newlines from single-line fields so subjects can't be split", () => {
  const r = validate({ ...good, name: "Eve\r\nBcc: x@y.z" });
  assert.equal(r.ok, true);
  assert.ok(!/[\r\n]/.test(buildEmails(r.data, "f", "AT-ABCDEF").owner.subject));
});

test("enforces length limits", () => {
  assert.equal(validate({ ...good, journeys: "x".repeat(3001) }).ok, false);
});

test("booking references are AT- plus 6 unambiguous characters", () => {
  for (let i = 0; i < 200; i++) assert.match(makeRef(), /^AT-[A-HJ-NP-Z2-9]{6}$/);
});

test("rate limiter allows 5 per window per key", () => {
  const allow = createRateLimiter({ limit: 5, windowMs: 1000 });
  for (let i = 0; i < 5; i++) assert.equal(allow("a", 0), true);
  assert.equal(allow("a", 10), false);
  assert.equal(allow("b", 10), true);
  assert.equal(allow("a", 1001), true);
});

test("handler emails the owner then the customer", async () => {
  const { handler, sent } = setup();
  const res = fakeRes();
  await handler(fakeReq(good), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.ref, /^AT-/);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].url, "https://resend.invalid/emails");
  assert.equal(sent[0].headers.Authorization, "Bearer re_test");
  assert.deepEqual(sent[0].json.to, ["info@civildigital.co.uk"]);
  assert.equal(sent[0].json.reply_to, "test@example.com");
  assert.ok(sent[0].json.subject.includes(res.body.ref));
  assert.ok(sent[0].json.text.includes("Booking reference: " + res.body.ref));
  assert.ok(sent[1].json.text.includes(res.body.ref));
  assert.deepEqual(sent[1].json.to, ["test@example.com"]);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "https://civildigital.co.uk");
});

test("honeypot submissions get a 200 but send nothing", async () => {
  const { handler, sent } = setup();
  const res = fakeRes();
  await handler(fakeReq({ ...good, website: "http://spam" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(sent.length, 0);
});

test("rejects other origins, other methods and invalid input", async () => {
  const { handler, sent } = setup();
  let res = fakeRes(); await handler(fakeReq(good, { origin: "https://evil.example" }), res);
  assert.equal(res.statusCode, 403);
  res = fakeRes(); await handler(fakeReq(good, { method: "GET" }), res);
  assert.equal(res.statusCode, 405);
  res = fakeRes(); await handler(fakeReq({ ...good, email: "" }), res);
  assert.equal(res.statusCode, 400);
  res = fakeRes(); await handler(fakeReq(null, { method: "OPTIONS" }), res);
  assert.equal(res.statusCode, 204);
  assert.equal(sent.length, 0);
});

test("returns 502 when Resend fails, and 429 after 5 submissions from one IP", async () => {
  const failing = setup(500);
  let res = fakeRes(); await failing.handler(fakeReq(good), res);
  assert.equal(res.statusCode, 502);

  const { handler } = setup();
  for (let i = 0; i < 5; i++) { res = fakeRes(); await handler(fakeReq(good, { ip: "9.9.9.9" }), res); }
  assert.equal(res.statusCode, 200);
  res = fakeRes(); await handler(fakeReq(good, { ip: "9.9.9.9" }), res);
  assert.equal(res.statusCode, 429);
});
