/* App Testing Service — booking form (/app-testing/book/).
   Details first, then payment: the form goes to the booking function, which creates a Stripe Checkout
   with the details attached and returns its address. Once the payment succeeds, Stripe tells the
   function, which sends one confirmation email to the customer and one to us. Vanilla JS, progressive
   enhancement only: without it the form falls back to the visitor's email app. */

(function () {
  "use strict";

  var cfg = window.CD_APP_TESTING || {};
  // A real URL is https://, or a local emulator address while testing; anything else is a placeholder
  var isLive = function (url) {
    return typeof url === "string" && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])/.test(url);
  };

  var form = document.getElementById("intake");
  if (!form) return;
  var status = document.getElementById("intake-status");
  var submit = form.querySelector("button[type=submit]");
  var submitLabel = submit.textContent;

  function show(kind, msg) {
    status.className = "status status--" + kind;
    status.textContent = msg;
    status.focus();
  }

  // Book buttons link here with ?option=<value>; Stripe sends people back with &cancelled=1
  var params = new URLSearchParams(location.search);
  var option = params.get("option");
  if (option && form.option.querySelector('option[value="' + option.replace(/[^a-z-]/g, "") + '"]')) form.option.value = option;
  if (params.get("cancelled")) show("err", "Payment wasn't completed, so nothing has been charged and no booking was made. You can try again below.");

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

  function reset() {
    submit.disabled = false;
    submit.textContent = submitLabel;
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
    submit.textContent = "Please wait…";
    fetch(cfg.intakeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d)
    }).then(function (res) {
      return res.json().then(function (body) { return { status: res.status, body: body }; });
    }).then(function (r) {
      if (r.status === 200 && r.body.url) {
        show("ok", "Taking you to secure payment…");
        location.href = r.body.url;
        return;
      }
      reset();
      if (r.status === 409) {
        show("err", "Sorry, this option is full at the moment. Email info@civildigital.co.uk to join the waiting list, or choose another option.");
      } else {
        show("err", "Sorry, something went wrong and you have not been charged. Please try again, or email info@civildigital.co.uk.");
      }
    }).catch(function () {
      reset();
      show("err", "Sorry, something went wrong and you have not been charged. Please try again, or email info@civildigital.co.uk.");
    });
  });
})();
