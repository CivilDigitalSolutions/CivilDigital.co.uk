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
- **No custom fields.** Customers fill in their app details on `/app-testing/book/` *before* paying. That
  page adds `?client_reference_id=<booking ref>&prefilled_email=<email>` to the link, so each payment shows
  the same booking reference (for example `AT-7K3QX9`) as the details email. In the dashboard it appears
  on the payment's Checkout Session as *Client reference ID*.
- **Require customers to accept your terms of service:** on. It uses the terms URL from section 1.
  The terms page says that by ticking the box the customer asks you to start straight away. Use
  Options → *Add custom text* → *Terms of service acceptance* to make that true at checkout, for example:
  *"I agree to the [service terms](https://civildigital.co.uk/app-testing/terms/) and ask Civil Digital to start
  straight away. I understand the right to cancel ends once the report is delivered."*
- **Collect:** customer name and email (email is always collected). No address or phone needed.
- **Promotion codes:** off, unless you are running one.
- **After payment:** *Don't show confirmation page* → *Redirect customers to your website*:
  `https://civildigital.co.uk/app-testing/thank-you/?option=<option>`, where `<option>` is `quick-check`,
  `feature-test`, `extra-journey`, `rolling` or `launch-pack`.

Keep the trailing slash after `thank-you/` and `terms/`, because GitHub Pages redirects the URL without the
slash to the one with it.

**Abandoned bookings:** because details come first, you may get a details email (subject says *awaiting
payment*) with no matching payment. The customer's email invites them to reply for a payment link.

## Created by script (2026-10-09)

`docs/stripe-setup.ps1` creates all of the above (products, prices and Payment Links with the
terms consent text, redirects and limits) through the Stripe CLI. The sandbox set was created on
2026-10-09, and its `test_` links are in `assets/js/app-testing-config.js` on the feature branch. For live mode,
run it once with `-Live` after `stripe login` on the live account, and paste the `buy.stripe.com/...` links over
the sandbox ones. Running it twice creates duplicates, so archive any extras in the dashboard.

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
