import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  validate, createRateLimiter, makeRef, packDetails, unpackDetails, formEncode,
  verifyStripeSignature, buildPaidEmails, createBookingHandler, createWebhookHandler
} from "../lib.js";

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
function fakeReq(body, { method = "POST", origin = "https://civildigital.co.uk", ip = "1.2.3.4", headers = {}, raw } = {}) {
  const rawBody = Buffer.from(raw ?? JSON.stringify(body || {}));
  const h = { origin, ...headers };
  return { method, body, ip, rawBody, get: (k) => h[k.toLowerCase()] };
}

/** Fake Stripe + Resend. paidCount = what the search API reports for the capped options. */
function fakeApis({ paidCount = 0, stripeStatus = 200, resendStatus = 200, session = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, ...opts });
    if (url.includes("/payment_intents/search")) return { ok: true, status: 200, json: async () => ({ data: Array(paidCount).fill({}) }) };
    if (url.endsWith("/checkout/sessions") && opts.method === "POST") {
      return { ok: stripeStatus < 300, status: stripeStatus, json: async () => (stripeStatus < 300 ? { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" } : { error: { message: "bad" } }) };
    }
    if (url.includes("/checkout/sessions/")) return { ok: true, status: 200, json: async () => session };
    if (url.includes("/emails")) return { ok: resendStatus < 300, status: resendStatus, json: async () => ({}) };
    throw new Error("unexpected " + url);
  };
  return { calls, fetchImpl };
}

function booking(apis) {
  return createBookingHandler({
    stripeKey: () => "rk_test_x",
    prices: { "quick-check": "price_qc", "feature-test": "price_ft", "extra-journey": "price_ej", rolling: "price_r", "launch-pack": "price_lp" },
    limits: { rolling: 5, "launch-pack": 5 },
    siteUrl: "https://civildigital.co.uk",
    allowedOrigins: ["https://civildigital.co.uk"],
    fetchImpl: apis.fetchImpl,
    log: { error() {}, warn() {} }
  });
}

// ---- validation and helpers ----

test("accepts a complete submission and keeps only known fields", () => {
  const r = validate({ ...good, password: "hunter2" });
  assert.equal(r.ok, true);
  assert.equal(r.data.password, undefined);
  assert.equal(r.data.create_dummy, true);
});

test("rejects missing required fields, bad email, bad option and non-web links", () => {
  const r = validate({ email: "nope", option: "free", app_link: "javascript:alert(1)" });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ["app_link", "email", "name", "option"]);
});

test("strips newlines from single-line fields and enforces length limits", () => {
  assert.equal(validate({ ...good, name: "Eve\r\nBcc: x@y.z" }).data.name.includes("\n"), false);
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

test("details survive the round trip through Stripe metadata, including long text", () => {
  const d = validate({ ...good, journeys: "j".repeat(2999), do_not_touch: "Billing" }).data;
  const meta = packDetails(d, "AT-ABCDEF");
  assert.ok(Object.values(meta).every((v) => String(v).length <= 500));
  assert.ok(Object.keys(meta).length <= 50);
  const back = unpackDetails(meta);
  assert.equal(back.journeys, d.journeys);
  assert.equal(back.do_not_touch, "Billing");
  assert.equal(back.ref, "AT-ABCDEF");
  assert.equal(back.create_dummy, true);
});

test("formEncode produces Stripe-style nested keys", () => {
  assert.equal(formEncode({ a: 1, b: { c: "x y" }, d: [{ e: 2 }] }), "a=1&b%5Bc%5D=x%20y&d%5B0%5D%5Be%5D=2");
});

test("Stripe signature check accepts valid, rejects tampered or stale", () => {
  const secret = "whsec_test", raw = '{"a":1}', t = 1_700_000_000;
  const sig = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  assert.equal(verifyStripeSignature(raw, `t=${t},v1=${sig}`, secret, t), true);
  assert.equal(verifyStripeSignature(raw + " ", `t=${t},v1=${sig}`, secret, t), false);
  assert.equal(verifyStripeSignature(raw, `t=${t},v1=${sig}`, secret, t + 301), false);
  assert.equal(verifyStripeSignature(raw, undefined, secret, t), false);
});

// ---- booking endpoint ----

test("booking creates a Checkout Session with the details attached and returns its URL", async () => {
  const apis = fakeApis();
  const res = fakeRes();
  await booking(apis)(fakeReq(good), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.url, "https://checkout.stripe.com/c/pay/cs_test_1");
  assert.match(res.body.ref, /^AT-/);
  const create = apis.calls.find((c) => c.url.endsWith("/checkout/sessions"));
  const p = new URLSearchParams(create.body);
  assert.equal(p.get("line_items[0][price]"), "price_ft");
  assert.equal(p.get("customer_email"), "test@example.com");
  assert.equal(p.get("client_reference_id"), res.body.ref);
  assert.equal(p.get("metadata[app_link]"), good.app_link);
  assert.equal(p.get("metadata[journeys_1]"), good.journeys);
  assert.equal(p.get("consent_collection[terms_of_service]"), "required");
  assert.equal(p.get("success_url"), "https://civildigital.co.uk/app-testing/thank-you/?option=feature-test");
  assert.equal(create.headers.Authorization, "Bearer rk_test_x");
  assert.equal(apis.calls.some((c) => c.url.includes("/emails")), false, "no email before payment");
});

test("capped options return 409 when full, and go through when not", async () => {
  let res = fakeRes();
  await booking(fakeApis({ paidCount: 5 }))(fakeReq({ ...good, option: "rolling" }), res);
  assert.equal(res.statusCode, 409);
  res = fakeRes();
  await booking(fakeApis({ paidCount: 4 }))(fakeReq({ ...good, option: "launch-pack" }), res);
  assert.equal(res.statusCode, 200);
});

test("extra journeys let the customer choose a quantity", async () => {
  const apis = fakeApis();
  await booking(apis)(fakeReq({ ...good, option: "extra-journey" }), fakeRes());
  const p = new URLSearchParams(apis.calls.find((c) => c.url.endsWith("/checkout/sessions")).body);
  assert.equal(p.get("line_items[0][adjustable_quantity][enabled]"), "true");
});

test("booking rejects other origins, other methods, invalid input and honeypots", async () => {
  const apis = fakeApis();
  const h = booking(apis);
  let res = fakeRes(); await h(fakeReq(good, { origin: "https://evil.example" }), res);
  assert.equal(res.statusCode, 403);
  res = fakeRes(); await h(fakeReq(good, { method: "GET" }), res);
  assert.equal(res.statusCode, 405);
  res = fakeRes(); await h(fakeReq({ ...good, email: "" }), res);
  assert.equal(res.statusCode, 400);
  res = fakeRes(); await h(fakeReq({ ...good, website: "spam" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(apis.calls.length, 0);
});

test("booking returns 502 when Stripe fails", async () => {
  const res = fakeRes();
  await booking(fakeApis({ stripeStatus: 400 }))(fakeReq(good), res);
  assert.equal(res.statusCode, 502);
});

// ---- webhook ----

const SECRET = "whsec_unit";
function signedEvent(event, t = 1_700_000_000) {
  const raw = JSON.stringify(event);
  const sig = createHmac("sha256", SECRET).update(`${t}.${raw}`).digest("hex");
  return fakeReq(null, { raw, origin: undefined, headers: { "stripe-signature": `t=${t},v1=${sig}` } });
}
function webhook(apis) {
  return createWebhookHandler({
    stripeKey: () => "rk_test_x", webhookSecret: () => SECRET, resendKey: () => "re_test",
    from: () => "Civil Digital <bookings@civildigital.co.uk>", resendBase: "https://resend.invalid",
    fetchImpl: apis.fetchImpl, nowSec: () => 1_700_000_000, log: { error() {} }
  });
}
const paidSession = (extra = {}) => {
  const d = validate(good).data;
  return {
    id: "cs_test_1", livemode: false, amount_total: 2900, currency: "gbp", payment_status: "paid",
    metadata: packDetails(d, "AT-ABCDEF"),
    payment_intent: { id: "pi_1", latest_charge: { receipt_url: "https://pay.stripe.com/receipts/r1" } },
    ...extra
  };
};

test("a paid session sends exactly one email to the owner and one to the customer", async () => {
  const s = paidSession();
  const apis = fakeApis({ session: s });
  const res = fakeRes();
  await webhook(apis)(signedEvent({ type: "checkout.session.completed", data: { object: s } }), res);
  assert.equal(res.statusCode, 200);
  const mails = apis.calls.filter((c) => c.url.includes("/emails")).map((c) => ({ ...JSON.parse(c.body), key: c.headers["Idempotency-Key"] }));
  assert.equal(mails.length, 2);
  const [owner, customer] = mails;
  assert.deepEqual(owner.to, ["info@civildigital.co.uk"]);
  assert.match(owner.subject, /^Paid £29\.00: Focused Feature Test – AT-ABCDEF – Test Person$/);
  assert.match(owner.text, /dashboard\.stripe\.com\/test\/payments\/pi_1/);
  assert.match(owner.text, /Sign up\nthen checkout/);
  assert.deepEqual(customer.to, ["test@example.com"]);
  assert.match(customer.subject, /^Booking confirmed: Focused Feature Test \(AT-ABCDEF\)$/);
  assert.match(customer.text, /payment of £29\.00 has been received/);
  assert.match(customer.text, /Receipt: https:\/\/pay\.stripe\.com\/receipts\/r1/);
  assert.equal(owner.key, "cs_test_1-owner");
  assert.equal(customer.key, "cs_test_1-customer");
});

test("webhook ignores bad signatures, unpaid sessions and other services", async () => {
  const apis = fakeApis({ session: paidSession() });
  const h = webhook(apis);
  let res = fakeRes();
  const bad = signedEvent({ type: "checkout.session.completed", data: { object: paidSession() } });
  bad.rawBody = Buffer.from(bad.rawBody.toString() + " ");
  await h(bad, res);
  assert.equal(res.statusCode, 400);
  res = fakeRes(); await h(signedEvent({ type: "checkout.session.completed", data: { object: paidSession({ payment_status: "unpaid" }) } }), res);
  assert.equal(res.body, "ignored");
  res = fakeRes(); await h(signedEvent({ type: "checkout.session.completed", data: { object: paidSession({ metadata: { service: "other" } }) } }), res);
  assert.equal(res.body, "ignored");
  assert.equal(apis.calls.length, 0);
});

test("webhook returns 500 so Stripe retries when email fails", async () => {
  const s = paidSession();
  const res = fakeRes();
  await webhook(fakeApis({ session: s, resendStatus: 500 }))(signedEvent({ type: "checkout.session.completed", data: { object: s } }), res);
  assert.equal(res.statusCode, 500);
});

test("paid emails format amounts in pounds", () => {
  const { owner } = buildPaidEmails(unpackDetails(packDetails(validate(good).data, "AT-X")), { amount: 6900, currency: "gbp" }, "f");
  assert.match(owner.subject, /£69\.00/);
});
