/* Civil Digital — site behaviour.
   Vanilla JS, no dependencies. Progressive enhancement only:
   the site works fully without it. */

(function () {
  "use strict";

  /* Footer year */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* Mobile nav toggle */
  var toggle = document.querySelector(".nav__toggle");
  var links = document.getElementById("primary-nav");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // Close menu when a link is chosen (mobile)
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A" && links.classList.contains("is-open")) {
        links.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* Contact form.
     Default: posts to a form backend (see data-endpoint on the <form>).
     If no real endpoint is configured (placeholder), fall back to a
     pre-filled mailto: so enquiries still reach the inbox on a static host. */
  var form = document.getElementById("contact-form");
  if (form) {
    var statusEl = document.getElementById("form-status");
    var endpoint = form.getAttribute("data-endpoint") || "";
    var mailto = form.getAttribute("data-mailto") || "";
    var configured = endpoint.indexOf("YOUR_FORM_ID") === -1 && endpoint !== "";

    form.addEventListener("submit", function (e) {
      // If a real backend is configured, let the browser submit normally.
      if (configured) return;

      // Otherwise: build a mailto so the message is not lost on a static host.
      e.preventDefault();
      var get = function (id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : "";
      };
      var subject = get("subject") || "Website enquiry";
      var bodyLines = [
        "Name: " + get("name"),
        "Organisation: " + get("organisation"),
        "Email: " + get("email"),
        "",
        get("message")
      ];
      var href = "mailto:" + mailto +
        "?subject=" + encodeURIComponent(subject) +
        "&body=" + encodeURIComponent(bodyLines.join("\n"));

      if (statusEl) {
        statusEl.className = "form-status is-error";
        statusEl.textContent =
          "This demo build isn't connected to a form service yet, so your email app " +
          "has been opened with the message ready to send. See the README to connect a backend.";
      }
      window.location.href = href;
    });
  }
})();
