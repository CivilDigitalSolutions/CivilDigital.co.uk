# Stripe setup: App Testing Service

Bookings use **Stripe Checkout created by our booking function**, not Payment Links:

1. The customer fills in `/app-testing/book/`.
2. The `intake` function (`firebase/`) checks the form and creates a Checkout Session. The booking details
   go in the session's metadata, the customer's email is prefilled, and the booking reference (`AT-XXXXXX`)
   is the client reference ID.
3. The customer pays. Stripe calls the `stripeWebhook` function, which sends **one** email to you
   ("Paid £19: Quick Check – AT-XXXXXX – Name", with every detail and a dashboard link) and **one** to the
   customer (booking and payment confirmed, with a link to their Stripe receipt).

Nothing is stored by us. Between form and payment, the details live only on the Stripe session, which
you can also see in the dashboard. Abandoned forms send no email.

> This file is published with the site (GitHub Pages serves the whole repo), so keep secrets out of it.

## 1. Account settings (once per mode)

| Setting | Where | Value |
| --- | --- | --- |
| Statement descriptor | Settings → Business → Public details | `CIVIL DIGITAL TESTING` |
| Terms of service URL | Settings → Business → Public details | `https://civildigital.co.uk/app-testing/terms/` (needed for the terms tick-box) |
| Icon | Settings → Branding → Icon | `docs/stripe-branding/civil-digital-stripe-icon.png` |
| Logo | Settings → Branding → Logo | `docs/stripe-branding/civil-digital-stripe-logo.png` |
| Brand colour and accent | Settings → Branding | `#7D0A70` |
| **Customer emails** | Settings → Customer emails | Turn **off** *Successful payments*. Our confirmation email replaces Stripe's receipt and links to it. |
| Tax | Settings → Tax | Leave Stripe Tax off. No VAT is added. |

## 2. Products and prices

`docs/stripe-setup.ps1` creates them through the Stripe CLI and prints the price IDs as lines for
`firebase/functions/.env`. Run it once per mode. Running it twice creates duplicates, so archive any extras.

| Product | Price | `.env` key |
| --- | --- | --- |
| Quick Check | £19 | `PRICE_QUICK_CHECK` |
| Focused Feature Test | £29 | `PRICE_FEATURE_TEST` |
| Extra journey | £12 each (customer picks 1 to 10) | `PRICE_EXTRA_JOURNEY` |
| Rolling Daily Testing | £39 | `PRICE_ROLLING` |
| Launch Pack | £69 | `PRICE_LAUNCH_PACK` |
| Fix re-check | £5 | not used by the site; make a Payment Link in the dashboard if you want one to email |

The sandbox set was created on 2026-10-09; its IDs are in `firebase/functions/.env`.

## 3. Restricted API key (once per mode)

Developers → API keys → **Create restricted key**, named "App testing bookings", with only:

| Resource | Permission |
| --- | --- |
| Checkout Sessions | Write |
| PaymentIntents | Read |
| Charges | Read |

Everything else: None. Store it as a Firebase secret (it prompts for the value):

```
cd firebase
firebase functions:secrets:set STRIPE_SECRET_KEY
```

## 4. Webhook (once per mode)

Developers → Webhooks → **Add endpoint**:

- **Endpoint URL:** `https://europe-west2-civil-digital.cloudfunctions.net/stripeWebhook`
- **Events:** `checkout.session.completed` and `checkout.session.async_payment_succeeded`

Then open the endpoint, reveal the **Signing secret** (`whsec_...`), and store it:

```
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

If an email fails, the function returns an error and Stripe retries for up to 3 days. Each email carries an
idempotency key, so a retry never sends a duplicate.

## 5. Limited spaces

Rolling Daily Testing and the Launch Pack stop taking bookings once `ROLLING_LIMIT` / `LAUNCH_PACK_LIMIT`
paid bookings exist (both 5, in `firebase/functions/.env`). The function counts paid payments in Stripe, so
the count never resets by itself: to reopen a place, raise the number by one and redeploy
(`npm run deploy` in `firebase/functions`). People who try to book a full option are told to email you to
join the waiting list, before they pay anything. Stripe's search index can lag by about a minute, so two
bookings at exactly the same moment could both get through.

## 6. Going live

1. Repeat sections 1, 3 and 4 in **live** mode. Run `stripe login` against the live account, then
   `docs/stripe-setup.ps1 -Live` for section 2.
2. In `firebase/functions/.env`, set the live price IDs, set `SITE_URL=https://civildigital.co.uk`, and
   empty `EXTRA_ORIGINS`.
3. Set the live `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, then deploy the functions.
