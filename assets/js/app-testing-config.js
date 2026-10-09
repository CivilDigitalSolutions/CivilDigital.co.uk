/* App Testing Service — the one place to put live URLs.

   Paste each Stripe Payment Link over its placeholder (they start
   https://buy.stripe.com/...). Any value that does not start with https://
   is treated as a placeholder, and that Book button stays as an email link
   (mailto:info@civildigital.co.uk?subject=Book%20<option>).

   intakeEndpoint is where the thank-you page form posts. While it is a
   placeholder the form opens the visitor's email app with the details
   filled in instead. See docs/stripe-payment-links.md. */

window.CD_APP_TESTING = {
  links: {
    QUICK_CHECK:   "QUICK_CHECK_URL",
    FEATURE_TEST:  "FEATURE_TEST_URL",
    ROLLING:       "ROLLING_URL",
    LAUNCH_PACK:   "LAUNCH_PACK_URL",
    EXTRA_JOURNEY: "EXTRA_JOURNEY_URL"
  },
  intakeEndpoint: "INTAKE_ENDPOINT_URL"
};
