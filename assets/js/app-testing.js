/* App Testing Service — booking form (/app-testing/book/).
   Details first, then payment: the form is sent to the booking endpoint, which returns a booking
   reference, and the visitor is taken to the Stripe Payment Link for their option with that reference
   (client_reference_id) and their email filled in. Vanilla JS, progressive enhancement only: without
   it the form falls back to the visitor's email app and we reply with a payment link. */

(function () {
  "use strict";

  var cfg = window.CD_APP_TESTING || { links: {} };
  // A real URL is https://, or a local emulator address while testing; anything else is a placeholder
  var isLive = function (url) {
    return typeof url === "string" && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])/.test(url);
  };
  var LINK_KEYS = {
    "quick-check": "QUICK_CHECK",
    "feature-test": "FEATURE_TEST",
    "rolling": "ROLLING",
    "launch-pack": "LAUNCH_PACK",
    "extra-journey": "EXTRA_JOURNEY"
  };

  var form = document.getElementById("intake");
  if (!form) return;
  var status = document.getElementById("intake-status");
  var submit = form.querySelector("button[type=submit]");
  var submitLabel = submit.textContent;

  // Book buttons link here with ?option=<value>
  var option = new URLSearchParams(location.search).get("option");
  if (option && LINK_KEYS[option]) form.option.value = option;

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

  function paymentUrl(d, ref) {
    var link = cfg.links[LINK_KEYS[d.option]];
    if (!isLive(link)) return null;
    return link + (link.indexOf("?") < 0 ? "?" : "&") +
      "client_reference_id=" + encodeURIComponent(ref) + "&prefilled_email=" + encodeURIComponent(d.email);
  }

  function asEmail(d) {
    var lines = [
      "Name: " + d.name,
      "Email: " + d.email,
      "Option: " + form.option.options[form.option.selectedIndex].text,
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
    return "mailto:info@civildigital.co.uk?subject=" + encodeURIComponent("App testing booking: " + d.name) +
      "&body=" + encodeURIComponent(lines.join("\n"));
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var d = collect();
    if (d.website) return; // honeypot: bots fill it, people never see it

    if (!isLive(cfg.intakeEndpoint)) {
      location.href = asEmail(d);
      show("ok", "Your email app should now open with these details filled in. Press send and we'll reply with a payment link. If nothing opens, email info@civildigital.co.uk.");
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
      return res.json();
    }).then(function (body) {
      var pay = paymentUrl(d, body.ref);
      if (pay) {
        show("ok", "Thanks, we have your details (booking reference " + body.ref + "). Taking you to secure payment…");
        location.href = pay;
      } else {
        show("ok", "Thanks, we have your details (booking reference " + body.ref + "). We'll email you a payment link shortly.");
        submit.disabled = false;
        submit.textContent = submitLabel;
      }
    }).catch(function () {
      show("err", "Sorry, that didn't send. Please try again, or email the details to info@civildigital.co.uk.");
      submit.disabled = false;
      submit.textContent = submitLabel;
    });
  });
})();
