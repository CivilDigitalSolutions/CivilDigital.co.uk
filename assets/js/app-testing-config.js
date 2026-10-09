/* App Testing Service — where the booking form sends its details.

   The booking function (firebase/) creates the Stripe Checkout and returns its address, so no Stripe
   links live here. Prices, sandbox/live mode and the space limits are set in firebase/functions/.env.
   While intakeEndpoint is a placeholder the form opens the visitor's email app instead. */

window.CD_APP_TESTING = {
  intakeEndpoint: "https://europe-west2-civil-digital.cloudfunctions.net/intake"
};
