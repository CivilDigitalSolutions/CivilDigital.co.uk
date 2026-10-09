/* App Testing Service — the one place to put live URLs.

   Booking runs details first, then payment. Book buttons open /app-testing/book/,
   whose form posts to intakeEndpoint. That returns a booking reference, and the
   visitor is sent to the Payment Link for their option below.

   Paste each Stripe Payment Link over its placeholder (they start
   https://buy.stripe.com/...). Any value that does not start with https://
   is treated as a placeholder: the details are still sent, and the visitor is
   told we'll email a payment link. While intakeEndpoint is a placeholder the
   form opens the visitor's email app instead. See docs/stripe-payment-links.md. */

// SANDBOX LINKS (buy.stripe.com/test_...): swap for the live links before merging to main.
window.CD_APP_TESTING = {
  links: {
    QUICK_CHECK:   "https://buy.stripe.com/test_5kQ9AV91d3Vv1RN9iDdby00",
    FEATURE_TEST:  "https://buy.stripe.com/test_00w28t5P1ajT2VR9iDdby01",
    ROLLING:       "https://buy.stripe.com/test_eVq3cxa5hbnXfID0M7dby03",
    LAUNCH_PACK:   "https://buy.stripe.com/test_00w9AVcdp2RrbsngL5dby04",
    EXTRA_JOURNEY: "https://buy.stripe.com/test_3cIcN70uHbnX7c766rdby02"
  },
  intakeEndpoint: "https://europe-west2-civil-digital.cloudfunctions.net/intake"
};
