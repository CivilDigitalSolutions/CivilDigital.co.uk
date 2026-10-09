/* App Testing Service — Book buttons and the thank-you page intake form.
   Vanilla JS, progressive enhancement only: without it, Book buttons are
   email links and the form falls back to the visitor's email app. */

(function () {
  "use strict";

  var cfg = window.CD_APP_TESTING || { links: {} };
  // A real URL is https://, or a local emulator address while testing; anything else is a placeholder
  var isLive = function (url) {
    return typeof url === "string" && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])/.test(url);
  };

  /* Book buttons: swap the mailto fallback for the Stripe Payment Link once it is set */
  var books = document.querySelectorAll("[data-book]");
  for (var i = 0; i < books.length; i++) {
    var url = cfg.links[books[i].getAttribute("data-book")];
    if (isLive(url)) books[i].href = url;
  }

  /* Intake form */
  var form = document.getElementById("intake");
  if (!form) return;
  var status = document.getElementById("intake-status");
  var submit = form.querySelector("button[type=submit]");

  // Stripe's redirect can carry ?option=<value>&session_id={CHECKOUT_SESSION_ID}
  var params = new URLSearchParams(location.search);
  var option = params.get("option");
  if (option && form.option.querySelector('option[value="' + option.replace(/[^a-z-]/g, "") + '"]')) {
    form.option.value = option;
  }
  var session = params.get("session_id");
  if (session && /^cs_[A-Za-z0-9_]+$/.test(session)) form.session_id.value = session;

  function show(kind, msg) {
    status.className = "status status--" + kind;
    status.textContent = msg;
    status.focus();
  }

  function collect() {
    var data = {};
    var els = form.elements;
    for (var j = 0; j < els.length; j++) {
      var el = els[j];
      if (!el.name) continue;
      data[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
    }
    return data;
  }

  function asEmail(d) {
    var lines = [
      "Name: " + d.name,
      "Email: " + d.email,
      "Stripe receipt number: " + (d.receipt || "-"),
      "Option booked: " + d.option,
      "App link: " + d.app_link,
      "Play tester opt-in link: " + (d.optin_link || "-"),
      "Test account username: " + (d.test_username || "-"),
      "Please create dummy details: " + (d.create_dummy ? "Yes" : "No"),
      "Browser (web apps): " + (d.browser || "-"),
      "",
      "Things not to touch:",
      d.do_not_touch || "-",
      "",
      "Journeys and expected results:",
      d.journeys || "-"
    ];
    if (d.session_id) lines.push("", "Checkout reference: " + d.session_id);
    return "mailto:info@civildigital.co.uk?subject=" + encodeURIComponent("App testing details: " + d.name) +
      "&body=" + encodeURIComponent(lines.join("\n"));
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var d = collect();
    if (d.website) return; // honeypot: bots fill it, people never see it

    if (!isLive(cfg.intakeEndpoint)) {
      location.href = asEmail(d);
      show("ok", "Your email app should now open with these details filled in. Press send to finish. If nothing opens, email info@civildigital.co.uk.");
      return;
    }

    submit.disabled = true;
    submit.textContent = "Sending…";
    fetch(cfg.intakeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d)
    }).then(function (res) {
      if (!res.ok) throw new Error(res.status);
      form.reset();
      show("ok", "Thanks, we have your details. A copy is on its way to your inbox. We'll be in touch to confirm we have everything.");
    }).catch(function () {
      show("err", "Sorry, that didn't send. Please try again, or email the details to info@civildigital.co.uk with your receipt number.");
    }).then(function () {
      submit.disabled = false;
      submit.textContent = "Send details";
    });
  });
})();
