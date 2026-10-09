// App Testing bookings: validation, Stripe Checkout, webhook verification and email building.
//
// Flow: the booking form posts here -> we validate it and create a Stripe Checkout Session with the
// details in its metadata -> the customer pays -> Stripe calls the webhook -> we send ONE email to the
// owner and ONE to the customer, confirming booking and payment together.
//
// No database: between the form and the payment, the details live only on the Stripe Checkout Session.
// Kept free of Firebase imports so it can be unit-tested with node --test.

import { randomInt, createHmac, timingSafeEqual } from "node:crypto";

export const OPTIONS = {
  "quick-check": "Quick Check",
  "feature-test": "Focused Feature Test",
  "rolling": "Rolling Daily Testing",
  "launch-pack": "Launch Pack",
  "extra-journey": "Extra journeys"
};
export const OWNER_EMAIL = "info@civildigital.co.uk";
const SERVICE_TAG = "app-testing";
const MAX_BODY_BYTES = 20 * 1024;
const META_CHUNK = 500; // Stripe metadata values are capped at 500 characters

// name: [max length, required, multi-line]
const TEXT_FIELDS = {
  name:          [100,  true,  false],
  email:         [254,  true,  false],
  test_username: [100,  false, false],
  browser:       [60,   false, false],
  do_not_touch:  [3000, false, true],
  journeys:      [3000, false, true]
};

function clean(value, multiLine) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  // Single-line fields lose every control character (so nothing can break a subject line);
  // multi-line fields keep newlines and tabs.
  const stripped = multiLine
    ? value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    : value.replace(/[\u0000-\u001f\u007f]/g, " ");
  return stripped.trim();
}

function isWebUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Returns { ok: true, data } or { ok: false, errors: { field: message } }. */
export function validate(body) {
  const errors = {};
  const data = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: { form: "Expected a JSON object." } };
  }

  for (const [field, [max, required, multiLine]] of Object.entries(TEXT_FIELDS)) {
    const v = clean(body[field], multiLine);
    if (v === null) errors[field] = "Must be text.";
    else if (required && !v) errors[field] = "Required.";
    else if (v.length > max) errors[field] = `Must be ${max} characters or fewer.`;
    else data[field] = v;
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = "Not a valid email address.";

  const option = clean(body.option, false);
  if (!option || !Object.hasOwn(OPTIONS, option)) errors.option = "Choose an option.";
  else data.option = option;

  for (const [field, required] of [["app_link", true], ["optin_link", false]]) {
    const v = clean(body[field], false);
    if (v === null) errors[field] = "Must be text.";
    else if (!v) { if (required) errors[field] = "Required."; else data[field] = ""; }
    else if (v.length > 500) errors[field] = "Must be 500 characters or fewer.";
    else if (!isWebUrl(v)) errors[field] = "Must be a web address starting https://";
    else data[field] = v;
  }

  data.create_dummy = body.create_dummy === true || body.create_dummy === "yes";

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

/** Short booking reference, e.g. AT-7K3QX9. No 0/O or 1/I, so it reads back clearly over email. */
export function makeRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "AT-";
  for (let i = 0; i < 6; i++) ref += chars[randomInt(chars.length)];
  return ref;
}

/** In-memory sliding window per key. Per function instance, which is fine at maxInstances 2. */
export function createRateLimiter({ limit = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();
  return function allow(key, now = Date.now()) {
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) { hits.set(key, recent); return false; }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear(); // stop a flood of new IPs growing memory without bound
    return true;
  };
}

// ---- Booking details <-> Stripe metadata ---------------------------------------------------

/** Flattens the validated details into Stripe metadata (long text split across 500-character keys). */
export function packDetails(d, ref) {
  const meta = {
    service: SERVICE_TAG, ref, option: d.option, name: d.name, email: d.email, app_link: d.app_link,
    optin_link: d.optin_link || "", test_username: d.test_username || "", browser: d.browser || "",
    create_dummy: d.create_dummy ? "yes" : "no"
  };
  for (const field of ["do_not_touch", "journeys"]) {
    const text = d[field] || "";
    for (let i = 0; i * META_CHUNK < text.length; i++) meta[`${field}_${i + 1}`] = text.slice(i * META_CHUNK, (i + 1) * META_CHUNK);
  }
  return meta;
}

export function unpackDetails(meta) {
  const join = (field) => {
    let out = "";
    for (let i = 1; meta[`${field}_${i}`] !== undefined; i++) out += meta[`${field}_${i}`];
    return out;
  };
  return {
    ref: meta.ref, option: meta.option, name: meta.name, email: meta.email, app_link: meta.app_link,
    optin_link: meta.optin_link, test_username: meta.test_username, browser: meta.browser,
    create_dummy: meta.create_dummy === "yes", do_not_touch: join("do_not_touch"), journeys: join("journeys")
  };
}

// ---- Stripe REST (no SDK) -------------------------------------------------------------------

/** Form-encodes nested objects/arrays the way Stripe expects (a[b][0][c]=...). */
export function formEncode(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") formEncode(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.join("&");
}

export async function stripe(method, path, params, { key, fetchImpl = fetch }) {
  const body = params && method !== "GET" ? formEncode(params) : undefined;
  const qs = params && method === "GET" ? "?" + formEncode(params) : "";
  const res = await fetchImpl(`https://api.stripe.com/v1${path}${qs}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path} ${res.status}: ${json?.error?.message || "error"}`);
  return json;
}

/** Number of paid bookings for an option, for the "limited spaces" cap. Search results can lag ~1 minute. */
export async function countPaid(option, opts) {
  const r = await stripe("GET", "/payment_intents/search",
    { query: `status:'succeeded' AND metadata['service']:'${SERVICE_TAG}' AND metadata['option']:'${option}'`, limit: 100 }, opts);
  return r.data.length;
}

export function checkoutParams(d, ref, { priceId, siteUrl }) {
  const meta = packDetails(d, ref);
  return {
    mode: "payment",
    line_items: [d.option === "extra-journey"
      ? { price: priceId, quantity: 1, adjustable_quantity: { enabled: true, minimum: 1, maximum: 10 } }
      : { price: priceId, quantity: 1 }],
    customer_email: d.email,
    client_reference_id: ref,
    metadata: meta,
    payment_intent_data: {
      description: `App testing ${ref}: ${OPTIONS[d.option]}`,
      metadata: { service: SERVICE_TAG, ref, option: d.option }
    },
    consent_collection: { terms_of_service: "required" },
    custom_text: { terms_of_service_acceptance: { message:
      `I agree to the [service terms](${siteUrl}/app-testing/terms/) and ask Civil Digital to start straight away. I understand the right to cancel ends once the report is delivered.` } },
    success_url: `${siteUrl}/app-testing/thank-you/?option=${d.option}`,
    cancel_url: `${siteUrl}/app-testing/book/?option=${d.option}&cancelled=1`
  };
}

/** Verifies a Stripe-Signature header (v1 HMAC-SHA256 over "timestamp.rawBody"). */
export function verifyStripeSignature(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000), tolerance = 300) {
  if (!header || !secret) return false;
  let t = null; const sigs = [];
  for (const piece of String(header).split(",")) {
    const [k, v] = piece.split("=");
    if (k === "t") t = Number(v);
    if (k === "v1" && v) sigs.push(v);
  }
  if (!t || !sigs.length || Math.abs(nowSec - t) > tolerance) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

// ---- Emails ---------------------------------------------------------------------------------

const money = (pence, currency = "gbp") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(pence / 100);

/** One email to the owner and one to the customer, sent only once the payment has succeeded. */
export function buildPaidEmails(d, pay, from) {
  const option = OPTIONS[d.option] || d.option;
  const amount = money(pay.amount, pay.currency);
  const owner = {
    from,
    to: [OWNER_EMAIL],
    reply_to: d.email,
    subject: `Paid ${amount}: ${option} – ${d.ref} – ${d.name}`,
    text: [
      `PAID: ${amount} received for ${option}.`,
      `Booking reference: ${d.ref}`,
      `Stripe payment: ${pay.dashboardUrl || "-"}`,
      "",
      `Name: ${d.name}`,
      `Email: ${d.email}`,
      `App link: ${d.app_link}`,
      `Play tester opt-in link: ${d.optin_link || "-"}`,
      `Test account username: ${d.test_username || "-"}`,
      `Please create dummy details: ${d.create_dummy ? "Yes" : "No"}`,
      `Browser (web apps): ${d.browser || "-"}`,
      "",
      "Things not to touch:",
      d.do_not_touch || "-",
      "",
      "Journeys and expected results:",
      d.journeys || "-"
    ].join("\n")
  };
  const customer = {
    from,
    to: [d.email],
    reply_to: OWNER_EMAIL,
    subject: `Booking confirmed: ${option} (${d.ref})`,
    text: [
      `Hi ${d.name},`,
      "",
      `Thanks, your booking is confirmed and your payment of ${amount} has been received.`,
      "",
      `Booking reference: ${d.ref}`,
      `Option: ${option}`,
      `App: ${d.app_link}`,
      pay.receiptUrl ? `Receipt: ${pay.receiptUrl}` : null,
      "",
      "What happens next: we'll check we have everything we need, then start testing. Reports arrive within 3 working days of the app being ready to test. Rolling Daily Testing sends daily feedback to your inbox.",
      "",
      d.test_username
        ? "If your test account needs a password, reply to this email with it. Please never send it through the website form."
        : "If you'd like us to use a test account, reply to this email with its username and password.",
      "",
      "Civil Digital",
      "info@civildigital.co.uk · 07568 296136",
      "https://civildigital.co.uk/app-testing/terms/"
    ].filter((l) => l !== null).join("\n")
  };
  return { owner, customer };
}

export async function sendEmail(message, { apiKey, fetchImpl = fetch, base = "https://api.resend.com", idempotencyKey }) {
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey; // Stripe may deliver an event twice
  const res = await fetchImpl(`${base}/emails`, { method: "POST", headers, body: JSON.stringify(message) });
  if (!res.ok) throw new Error(`Resend responded ${res.status}`);
}

// ---- HTTP handlers ----------------------------------------------------------------------------

/**
 * Booking form endpoint. Validates, enforces the spaces cap, creates a Checkout Session and returns its URL.
 * deps: { stripeKey(), prices: {option: priceId}, limits: {option: n}, siteUrl, allowedOrigins, fetchImpl, log }
 */
export function createBookingHandler(deps) {
  const allow = createRateLimiter();
  const log = deps.log || console;

  return async function handler(req, res) {
    const origin = req.get ? req.get("origin") : req.headers?.origin;
    if (origin && deps.allowedOrigins.includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "POST");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.set("Access-Control-Max-Age", "3600");
      return res.status(204).send("");
    }
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method" });
    if (!origin || !deps.allowedOrigins.includes(origin)) return res.status(403).json({ ok: false, error: "origin" });
    if (req.rawBody && req.rawBody.length > MAX_BODY_BYTES) return res.status(413).json({ ok: false, error: "size" });
    if (!allow(req.ip || "unknown")) return res.status(429).json({ ok: false, error: "rate" });

    const body = req.body || {};
    // Honeypot: people never see the "website" field, bots fill it. Pretend success, do nothing.
    if (typeof body.website === "string" && body.website.trim()) {
      return res.status(200).json({ ok: true, url: `${deps.siteUrl}/app-testing/thank-you/` });
    }

    const result = validate(body);
    if (!result.ok) return res.status(400).json({ ok: false, errors: result.errors });
    const d = result.data;

    const opts = { key: deps.stripeKey(), fetchImpl: deps.fetchImpl };
    try {
      const limit = deps.limits[d.option];
      if (limit !== undefined && (await countPaid(d.option, opts)) >= limit) {
        return res.status(409).json({ ok: false, error: "full" });
      }
      const ref = makeRef();
      const session = await stripe("POST", "/checkout/sessions",
        checkoutParams(d, ref, { priceId: deps.prices[d.option], siteUrl: deps.siteUrl }), opts);
      return res.status(200).json({ ok: true, ref, url: session.url });
    } catch (err) {
      log.error("Checkout creation failed", err.message); // never log the submission itself
      return res.status(502).json({ ok: false, error: "checkout" });
    }
  };
}

/**
 * Stripe webhook. On a paid app-testing Checkout Session, emails the owner and the customer once each.
 * deps: { stripeKey(), webhookSecret(), resendKey(), from(), resendBase, fetchImpl, log }
 */
export function createWebhookHandler(deps) {
  const log = deps.log || console;

  return async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).send("method");
    const raw = req.rawBody ? req.rawBody.toString("utf8") : "";
    const sig = req.get ? req.get("stripe-signature") : req.headers?.["stripe-signature"];
    if (!verifyStripeSignature(raw, sig, deps.webhookSecret(), deps.nowSec?.())) return res.status(400).send("signature");

    let event;
    try { event = JSON.parse(raw); } catch { return res.status(400).send("json"); }
    const session = event.data?.object;
    const paidNow =
      (event.type === "checkout.session.completed" && session?.payment_status === "paid") ||
      event.type === "checkout.session.async_payment_succeeded";
    if (!paidNow || session?.metadata?.service !== SERVICE_TAG) return res.status(200).send("ignored");

    try {
      const opts = { key: deps.stripeKey(), fetchImpl: deps.fetchImpl };
      const full = await stripe("GET", `/checkout/sessions/${session.id}`, { expand: ["payment_intent.latest_charge"] }, opts);
      const pi = full.payment_intent;
      const pay = {
        amount: full.amount_total,
        currency: full.currency,
        receiptUrl: pi?.latest_charge?.receipt_url || "",
        dashboardUrl: pi?.id ? `https://dashboard.stripe.com/${full.livemode ? "" : "test/"}payments/${pi.id}` : ""
      };
      const d = unpackDetails(full.metadata);
      const { owner, customer } = buildPaidEmails(d, pay, deps.from());
      const mail = { apiKey: deps.resendKey(), fetchImpl: deps.fetchImpl, base: deps.resendBase };
      await sendEmail(owner, { ...mail, idempotencyKey: `${session.id}-owner` });
      await sendEmail(customer, { ...mail, idempotencyKey: `${session.id}-customer` });
      return res.status(200).send("sent");
    } catch (err) {
      log.error("Paid booking email failed", err.message);
      return res.status(500).send("retry"); // Stripe retries failed webhooks for up to 3 days
    }
  };
}
