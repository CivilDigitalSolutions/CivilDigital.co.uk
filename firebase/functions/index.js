// App Testing intake form endpoint: validates the thank-you page form and emails it via Resend.
// No database: submissions are never stored. See firebase/README.md.

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { createHandler } from "./lib.js";

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
// Must be an address on a domain verified in Resend.
const MAIL_FROM = defineString("MAIL_FROM", { default: "Civil Digital <bookings@civildigital.co.uk>" });

const emulated = process.env.FUNCTIONS_EMULATOR === "true";

export const intake = onRequest(
  { region: "europe-west2", secrets: [RESEND_API_KEY], maxInstances: 2, memory: "256MiB", timeoutSeconds: 30 },
  createHandler({
    apiKey: () => RESEND_API_KEY.value(),
    from: () => MAIL_FROM.value(),
    allowedOrigins: emulated
      ? ["https://civildigital.co.uk", "http://localhost:8080"]
      : ["https://civildigital.co.uk"],
    // Only the emulator may point at a fake Resend, so a stray env var can't redirect live mail.
    resendBase: emulated && process.env.RESEND_API_BASE ? process.env.RESEND_API_BASE : "https://api.resend.com"
  })
);
