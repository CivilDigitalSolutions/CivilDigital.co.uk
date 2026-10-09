// App Testing intake: validation, rate limiting and email building.
// Kept free of Firebase imports so it can be unit-tested with node --test.
// Nothing here stores a submission: it is validated, emailed and dropped.

export const OPTIONS = {
  "quick-check": "Quick Check (£19)",
  "feature-test": "Focused Feature Test (£29)",
  "rolling": "Rolling Daily Testing (£39)",
  "launch-pack": "Launch Pack (£69)",
  "extra-journey": "Extra journeys only (£12 each)"
};

export const OWNER_EMAIL = "info@civildigital.co.uk";
const MAX_BODY_BYTES = 20 * 1024;

// name: [max length, required, multi-line]
const TEXT_FIELDS = {
  name:          [100,  true,  false],
  email:         [254,  true,  false],
  receipt:       [50,   false, false],
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

  const session = clean(body.session_id, false);
  data.session_id = session && /^cs_(test|live)_[A-Za-z0-9]{1,200}$/.test(session) ? session : "";

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
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

export function buildEmails(d, from) {
  const optionLabel = OPTIONS[d.option];
  const owner = {
    from,
    to: [OWNER_EMAIL],
    reply_to: d.email,
    subject: `App testing booking: ${optionLabel} – ${d.name}`,
    text: [
      `Name: ${d.name}`,
      `Email: ${d.email}`,
      `Stripe receipt number: ${d.receipt || "-"}`,
      `Option booked: ${optionLabel}`,
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
      d.journeys || "-",
      "",
      `Checkout reference: ${d.session_id || "-"}`
    ].join("\n")
  };
  const customer = {
    from,
    to: [d.email],
    reply_to: OWNER_EMAIL,
    subject: "We have your app testing details",
    text: [
      `Hi ${d.name},`,
      "",
      `Thanks for booking ${optionLabel}. We have the details you sent for ${d.app_link}.`,
      "",
      "Next, we'll check we have everything we need and then start testing. Reports arrive within 3 working days of the app being ready to test.",
      "",
      d.test_username
        ? "If your test account needs a password, reply to this email with it. Please never send it through the website form."
        : "If you'd like us to use a test account, reply to this email with its username and password.",
      "",
      "Civil Digital",
      "info@civildigital.co.uk · 07568 296136",
      "https://civildigital.co.uk/app-testing/terms/"
    ].join("\n")
  };
  return { owner, customer };
}

export async function sendEmail(message, { apiKey, fetchImpl = fetch, base = "https://api.resend.com" }) {
  const res = await fetchImpl(`${base}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(message)
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}`);
}

/**
 * Builds the HTTP handler. Dependencies are injected so tests can run it without Firebase or Resend.
 * deps: { apiKey(), from(), allowedOrigins, fetchImpl, resendBase, log }
 */
export function createHandler(deps) {
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
    // Honeypot: people never see the "website" field, bots fill it. Pretend success, send nothing.
    if (typeof body.website === "string" && body.website.trim()) return res.status(200).json({ ok: true });

    const result = validate(body);
    if (!result.ok) return res.status(400).json({ ok: false, errors: result.errors });

    const { owner, customer } = buildEmails(result.data, deps.from());
    const opts = { apiKey: deps.apiKey(), fetchImpl: deps.fetchImpl, base: deps.resendBase };
    try {
      await sendEmail(owner, opts);
    } catch (err) {
      log.error("Owner email failed", err.message); // never log the submission itself
      return res.status(502).json({ ok: false, error: "send" });
    }
    try {
      await sendEmail(customer, opts);
    } catch (err) {
      log.warn("Customer confirmation failed", err.message); // we still have the details, so report success
    }
    return res.status(200).json({ ok: true });
  };
}
