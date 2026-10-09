# Stripe Payment Links: App Testing Service

Set these up in the **Civil Digital Services** Stripe account. The site needs no Stripe keys or SDK.
Each Book button reads its URL from `assets/js/app-testing-config.js`. Any value there that does not start
with `https://` counts as a placeholder, and that button stays an email link
(`mailto:info@civildigital.co.uk?subject=Book%20<option>`).

> This file is published with the site (GitHub Pages serves everything in the repo root), so keep
> secrets out of it. Payment Link URLs are public anyway.

## 1. Account settings (once)

| Setting | Where | Value |
| --- | --- | --- |
| Statement descriptor | Settings → Business → Public details | `CIVIL DIGITAL TESTING` (21 of 22 characters allowed) |
| Terms of service URL | Settings → Business → Public details | `https://civildigital.co.uk/app-testing/terms/` |
| Brand colour and accent | Settings → Branding | `#7D0A70` |
| Icon | Settings → Branding → Icon | `docs/stripe-branding/civil-digital-stripe-icon.png` (512×512, plum mark on white) |
| Logo | Settings → Branding → Logo | `docs/stripe-branding/civil-digital-stripe-logo.png` (2100×300 wordmark on white) |

Stripe does not take SVG, so both PNGs are rendered from `assets/brand/CivilDigitalIcon.svg` and
`assets/brand/CivilDigital.svg`. Re-render them if the brand files change.
| Tax | Settings → Tax | Leave Stripe Tax off. No VAT is added. |
| Customer emails | Settings → Customer emails | Turn on **Successful payments** so the receipt is sent |

## 2. Products and prices

Create one product each, one-off price in GBP:

| Product | Price | Config key |
| --- | --- | --- |
| Quick Check | £19 | `QUICK_CHECK` |
| Focused Feature Test | £29 | `FEATURE_TEST` |
| Extra journey | £12 | `EXTRA_JOURNEY` |
| Rolling Daily Testing | £39 | `ROLLING` |
| Launch Pack | £69 | `LAUNCH_PACK` |
| Fix re-check (optional) | £5 | not on the site; send the link by email when a re-check is chargeable |

## 3. Settings for every Payment Link

Payment Links → **New** → pick the product, then:

- **Quantity:** fixed at 1, except **Extra journey**: tick *Let customers adjust quantity*, min 1, max 10.
- **Custom field** (Options → Add custom fields): type *Text*, **required**. Label:
  `App link (Play testing link, store listing or web address)`.
  Stripe caps custom field labels at 50 characters, and this one is 58. If the dashboard rejects it, use
  `App link (Play test link, store or web URL)` instead.
- **Require customers to accept your terms of service:** on. It uses the terms URL from section 1.
  The terms page says that by ticking the box the customer asks you to start straight away. Use
  Options → *Add custom text* → *Terms of service acceptance* to make that true at checkout, for example:
  *"I agree to the [service terms](https://civildigital.co.uk/app-testing/terms/) and ask Civil Digital to start
  straight away. I understand the right to cancel ends once the report is delivered."*
- **Collect:** customer name and email (email is always collected). No address or phone needed.
- **Promotion codes:** off, unless you are running one.
- **After payment:** *Don't show confirmation page* → *Redirect customers to your website*. Use a different
  URL per link so the intake form picks the right option for them:

| Link | Redirect URL |
| --- | --- |
| Quick Check | `https://civildigital.co.uk/app-testing/thank-you/?option=quick-check&session_id={CHECKOUT_SESSION_ID}` |
| Focused Feature Test | `https://civildigital.co.uk/app-testing/thank-you/?option=feature-test&session_id={CHECKOUT_SESSION_ID}` |
| Extra journey | `https://civildigital.co.uk/app-testing/thank-you/?option=extra-journey&session_id={CHECKOUT_SESSION_ID}` |
| Rolling Daily Testing | `https://civildigital.co.uk/app-testing/thank-you/?option=rolling&session_id={CHECKOUT_SESSION_ID}` |
| Launch Pack | `https://civildigital.co.uk/app-testing/thank-you/?option=launch-pack&session_id={CHECKOUT_SESSION_ID}` |

`{CHECKOUT_SESSION_ID}` is filled in by Stripe. The thank-you page puts it in a hidden form field so each
submission can be matched to its payment. Keep the trailing slash after `thank-you/` and `terms/`, because
GitHub Pages redirects the URL without the slash to the one with it.

## 4. Put the links on the site

Copy each link (`https://buy.stripe.com/...`) into `assets/js/app-testing-config.js` over its placeholder,
commit and push. Buttons whose value is still a placeholder keep falling back to email.

Before going live, build the links in **test mode** first. Paste the test-mode URLs into the config on a
branch, pay with card `4242 4242 4242 4242`, and check that the redirect lands on the thank-you page with
the right option selected. Then build the live links and swap them in.

## 5. Pausing Rolling Daily Testing when spaces are full

Rolling Daily Testing and the Launch Pack are marked "Limited spaces". To stop new bookings:

1. **Automatically:** on the Payment Link, Options → *Limit the number of payments*, set the number of
   spaces, and write the message customers see when it is full (for example "Rolling Daily Testing is full
   at the moment. Email info@civildigital.co.uk to join the waiting list."). Reset the limit when spaces free up.
2. **By hand:** Payment Links → open the link → **Deactivate**. Reactivate it later from the same menu.
   The URL does not change.
3. **Optional, on the site:** to make the button email you instead of opening a closed Stripe page, set its
   value in `app-testing-config.js` back to a placeholder (for example `"ROLLING_URL"`) and push.

Do this for both **Rolling Daily Testing** and **Launch Pack**, because the pack includes rolling testing.
