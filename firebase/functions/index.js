// App Testing bookings. Two HTTPS functions in London (europe-west2):
//   intake        - booking form -> Stripe Checkout Session (details held in its metadata)
//   stripeWebhook - payment succeeded -> one email to the owner, one to the customer
// No database: submissions are never stored by us. See firebase/README.md.

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString, defineInt } from "firebase-functions/params";
import { createBookingHandler, createWebhookHandler } from "./lib.js";

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");         // restricted key, see README
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET"); // whsec_... from the webhook endpoint

// Non-secret settings live in functions/.env
const MAIL_FROM = defineString("MAIL_FROM", { default: "Civil Digital <bookings@civildigital.co.uk>" });
const SITE_URL = defineString("SITE_URL", { default: "https://civildigital.co.uk" });
// Comma-separated extra origins allowed to call intake, e.g. http://localhost:8080 while testing. Empty at go-live.
const EXTRA_ORIGINS = defineString("EXTRA_ORIGINS", { default: "" });
const PRICE = {
  "quick-check": defineString("PRICE_QUICK_CHECK"),
  "feature-test": defineString("PRICE_FEATURE_TEST"),
  "extra-journey": defineString("PRICE_EXTRA_JOURNEY"),
  "rolling": defineString("PRICE_ROLLING"),
  "launch-pack": defineString("PRICE_LAUNCH_PACK")
};
const ROLLING_LIMIT = defineInt("ROLLING_LIMIT", { default: 5 });
const LAUNCH_PACK_LIMIT = defineInt("LAUNCH_PACK_LIMIT", { default: 5 });

const emulated = process.env.FUNCTIONS_EMULATOR === "true";
const common = { region: "europe-west2", maxInstances: 2, memory: "256MiB", timeoutSeconds: 30 };

// Params can only be read at request time, so the handlers are built lazily on first call.
let bookingHandler;
export const intake = onRequest({ ...common, secrets: [STRIPE_SECRET_KEY] }, (req, res) => {
  bookingHandler ||= createBookingHandler({
    stripeKey: () => STRIPE_SECRET_KEY.value(),
    prices: Object.fromEntries(Object.entries(PRICE).map(([k, p]) => [k, p.value()])),
    limits: { "rolling": ROLLING_LIMIT.value(), "launch-pack": LAUNCH_PACK_LIMIT.value() },
    siteUrl: SITE_URL.value(),
    allowedOrigins: ["https://civildigital.co.uk", ...EXTRA_ORIGINS.value().split(",").map((s) => s.trim()).filter(Boolean)]
  });
  return bookingHandler(req, res);
});

let webhookHandler;
export const stripeWebhook = onRequest({ ...common, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY] }, (req, res) => {
  webhookHandler ||= createWebhookHandler({
    stripeKey: () => STRIPE_SECRET_KEY.value(),
    webhookSecret: () => STRIPE_WEBHOOK_SECRET.value(),
    resendKey: () => RESEND_API_KEY.value(),
    from: () => MAIL_FROM.value(),
    // Only the emulator may point at a fake Resend, so a stray env var can't redirect live mail.
    resendBase: emulated && process.env.RESEND_API_BASE ? process.env.RESEND_API_BASE : "https://api.resend.com"
  });
  return webhookHandler(req, res);
});
