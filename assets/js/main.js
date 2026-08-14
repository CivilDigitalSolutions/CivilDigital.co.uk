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
})();
