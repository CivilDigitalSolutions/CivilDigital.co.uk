# Civil Digital Services: Firebase

Project `civil-digital`. Two HTTPS Cloud Functions in `europe-west2` (London):

| Function | What it does |
| --- | --- |
| `intake` | Receives the `/app-testing/book/` form, checks it, applies the "limited spaces" cap, and creates a Stripe Checkout Session with the details in its metadata. Returns the checkout address. |
| `stripeWebhook` | Called by Stripe when a payment succeeds. Sends **one** email to info@ (paid, with every detail) and **one** to the customer (booking and payment confirmed, with a receipt link), via **Resend**. |

**Nothing is stored by us.** Between form and payment, the details live only on the Stripe session.

Spam protection on `intake`: an origin check, a honeypot field, a 20 KB body limit, strict validation, and
a rate limit of 5 per IP per 15 minutes, held in memory with `maxInstances` 2. `stripeWebhook` only acts on
requests carrying a valid Stripe signature.

> This folder sits in the website repo, so GitHub Pages also serves these source files. They contain no
> secrets: keys live in Firebase Secret Manager, and `*.local` files are git-ignored.

## Secrets (Firebase Secret Manager)

| Secret | What |
| --- | --- |
| `RESEND_API_KEY` | Resend key with sending access, for the verified `civildigital.co.uk` domain |
| `STRIPE_SECRET_KEY` | Restricted Stripe key: Checkout Sessions write, PaymentIntents read, Charges read |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` signing secret of the webhook endpoint |

Set each one with `firebase functions:secrets:set NAME` from this folder; it prompts for the value. Stripe
steps are in `docs/stripe-setup.md`.

## Settings (`functions/.env`, not secret)

Price IDs, `SITE_URL` (where Stripe returns customers), `EXTRA_ORIGINS`, and the space limits. They
hold the **live** values (switched 2026-10-09). `docs/stripe-setup.md` section 6 lists
what changes between sandbox and live.

## Deploy

```
cd firebase/functions
npm install
npm test
npm run deploy
```

## Test locally

`npm test` runs the unit tests (Stripe and Resend are faked). The emulator (`npm run serve`) reads
`functions/.secret.local` for secrets and `functions/.env.local` for overrides such as
`RESEND_API_BASE=http://127.0.0.1:8787` (a fake Resend, honoured only in the emulator).
