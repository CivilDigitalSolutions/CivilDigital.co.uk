/* Civil Digital — first-load logo trace (home page only).

   Plays once per browser session over the page, then hands over to the page's
   own logos: the white ground fades to reveal the page while the traced
   logotype drops back onto the hero logo and the knot flies up into the
   header's brand mark. Both land on identical geometry (CivilDigital.svg and
   CivilDigitalIcon.svg), so the real images swap in underneath without a jump.

   A white cover set by the inline script in index.html's <head> hides the page
   until this takes over, and that script lifts the cover by itself after 5s if
   this never runs. A click, a tap or a non-scrolling key skips to a quick fade;
   scrolling (wheel, touch drag, scrollbar, arrow/page keys) does not stop the
   sequence — it winds it on faster, the rate easing up with the distance
   scrolled to RATE_MAX, so the whole thing still plays through, just sooner.
   Reduced motion never sees it (the head script checks).

   The sequence is docs/brand-motion/civil-digital-logo-trace.html ("Blueprint"),
   rebuilt on the Web Animations API so the site stays dependency-free:
     guides draw on the knot's 45-degree grid, the knot's outline traces, a pen
     paints the ribbon as one figure-of-eight, the real mark fills in and the
     ribbon lifts to reveal the over-under weave; the logotype traces and fills,
     and the lavender dots on the i and the A land last.

   The lockup is three layers in one box: the guides, the knot and the
   logotype, each its own <svg> so each can fly to its own target. Logotype
   caps are scaled to the knot's height, so the cap line (y=49) and baseline
   (y=131) run through both. */

(function () {
  "use strict";

  var root = document.documentElement;

  /* ?intro=debug forces the sequence on (index.html's head script bypasses its own guards for the
     same query) and pins a trace to the corner: what the environment looked like at start, every
     gesture and scroll with the rate it produced, and whatever ended it. A report of "it just
     cancels" can then be read off the page rather than guessed at. */
  var DEBUG = /[?&]intro=debug\b/.test(location.search);
  var trace = DEBUG ? (function () {
    var p = document.createElement("div"), t0 = performance.now();
    p.setAttribute("style", "position:fixed;left:8px;bottom:8px;z-index:1001;max-width:min(92vw,560px);" +
      "max-height:62vh;overflow:auto;font:12px/1.5 ui-monospace,Consolas,monospace;background:#fff;color:#2A3038;" +
      "border:1px solid #7d0a70;border-radius:4px;padding:8px 10px;white-space:pre-wrap");
    p.textContent = "intro trace\n";
    document.body.appendChild(p);
    return function (msg) {
      p.textContent += String(Math.round(performance.now() - t0)).padStart(5) + "ms  " + msg + "\n";
      p.scrollTop = p.scrollHeight;
    };
  })() : function () {};
  if (DEBUG) {
    var flag, rm;
    try { flag = sessionStorage.getItem("cd-intro"); } catch (e) { flag = "unreadable (" + e.name + ")"; }
    try { rm = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { rm = "unknown"; }
    trace("reduced motion : " + rm + (rm === true ? "   <- this alone means NO intro on a normal visit" : ""));
    trace("session flag   : " + (flag || "none") + (flag ? "   <- set, so NO intro on a normal visit in this tab" : ""));
    trace("scrollY        : " + (window.scrollY || 0) + "   scrollRestoration: " + (history.scrollRestoration || "n/a"));
    trace("animate()      : " + !!Element.prototype.animate + "   cd-intro class: " + root.classList.contains("cd-intro"));
    root.classList.add("cd-intro");
  }

  if (!root.classList.contains("cd-intro") || !Element.prototype.animate) {
    trace("not running: " + (!Element.prototype.animate ? "no Web Animations API" : "cd-intro class absent"));
    root.classList.remove("cd-intro");
    return;
  }

  var WORD = {"letters":[{"d":"M0 0 C3.47727851 2.860342 6.77856568 5.85543287 10 9 C5.17917294 14.96260189 -0.22494276 19.96679794 -6 25 C-6.94875 24.113125 -7.8975 23.22625 -8.875 22.3125 C-18.32525522 14.43416842 -26.86028572 12.66915971 -38.95166016 13.71337891 C-46.86270958 14.82036008 -53.224224 19.80542582 -58 26 C-63.55281183 33.6618917 -63.14777064 43.96558893 -62 53 C-59.73289366 61.66514202 -53.55549231 67.41308431 -46.203125 72.16015625 C-39.09942894 75.53912672 -28.75945947 75.13416907 -21.24609375 73.34375 C-15.62762981 71.07682194 -11.30904053 67.17988673 -7 63 C-3.93233936 64.35672137 -1.96343247 65.8627493 0.3125 68.3125 C3.61265404 71.72694508 7.06539298 74.35016262 11 77 C2.9769184 87.34555259 -8.09696892 94.44895512 -21.08203125 96.68359375 C-37.98432114 98.51637217 -54.78083025 96.40230503 -68.72265625 85.9609375 C-79.75759018 76.540466 -87.38872641 64.54304758 -88.796875 49.89208984 C-89.7174618 36.27827329 -86.51635022 22.94959314 -78 12 C-77.49339844 11.31550781 -76.98679687 10.63101562 -76.46484375 9.92578125 C-58.89482873 -12.04606344 -22.72511755 -15.64022796 0 0 Z","t":[89,9]},{"d":"M0 0 C8.25 0 16.5 0 25 0 C25 33.66 25 67.32 25 102 C16.75 102 8.5 102 0 102 C0 68.34 0 34.68 0 0 Z","t":[110,2]},{"d":"M0 0 C8.58 0 17.16 0 26 0 C32.21589944 14.19451662 38.31384587 28.42909493 44.26831055 42.73461914 C48.0758018 51.86942705 52.00841924 60.9443291 56 70 C56.22835541 69.46225449 56.45671082 68.92450897 56.69198608 68.37046814 C59.12535371 62.64076734 61.56011904 56.91166181 63.99560547 51.18286133 C64.89763814 49.06060996 65.79934437 46.9382198 66.70068359 44.81567383 C73.05884046 29.84381283 79.49716493 14.90965338 86 0 C94.25 0 102.5 0 111 0 C106.75937516 11.55159356 102.16842521 22.88314373 97.3125 34.1875 C95.81748577 37.68164057 94.32482604 41.17678575 92.83203125 44.671875 C92.44552399 45.57586533 92.05901672 46.47985565 91.66079712 47.41123962 C88.65075831 54.45730417 85.66986935 61.51537378 82.69921875 68.578125 C82.26346024 69.61354935 81.82770172 70.64897369 81.3787384 71.71577454 C79.65940378 75.80174465 77.94033741 79.88781988 76.22549438 83.97567749 C75.03786496 86.8062958 73.84732939 89.63567579 72.65625 92.46484375 C72.12151314 93.74316071 72.12151314 93.74316071 71.57597351 95.04730225 C69.11361635 100.88638365 69.11361635 100.88638365 68 102 C66.14630389 102.08737645 64.28932459 102.10698153 62.43359375 102.09765625 C61.30888672 102.09443359 60.18417969 102.09121094 59.02539062 102.08789062 C57.84138672 102.07951172 56.65738281 102.07113281 55.4375 102.0625 C54.24962891 102.05798828 53.06175781 102.05347656 51.83789062 102.04882812 C48.89187774 102.03699675 45.94596319 102.02051287 43 102 C38.10390154 91.67578023 33.47034385 81.26484456 29 70.75 C28.3551636 69.23857527 27.7100566 67.72726597 27.06469727 66.21606445 C25.72325455 63.07433108 24.38296705 59.93210863 23.04345703 56.78955078 C20.00648412 49.66765208 16.95375345 42.55250664 13.90209961 35.43688965 C12.96766654 33.25784659 12.03355633 31.07866551 11.09960938 28.89941406 C10.80599518 28.21450897 10.51238098 27.52960388 10.20986938 26.82394409 C9.63705578 25.48677625 9.06491483 24.14932003 8.49349976 22.81155396 C7.09044062 19.52915659 5.67469051 16.25327081 4.23486328 12.98681641 C3.95405411 12.34513016 3.67324493 11.70344391 3.38392639 11.04231262 C2.61586484 9.28870324 1.84241797 7.53745537 1.06860352 5.78637695 C0 3 0 3 0 0 Z","t":[143,2]},{"d":"M0 0 C8.25 0 16.5 0 25 0 C25 33.66 25 67.32 25 102 C16.75 102 8.5 102 0 102 C0 68.34 0 34.68 0 0 Z","t":[261,2]},{"d":"M0 0 C8.25 0 16.5 0 25 0 C25 26.73 25 53.46 25 81 C41.83 81 58.66 81 76 81 C76 87.93 76 94.86 76 102 C50.92 102 25.84 102 0 102 C0 68.34 0 34.68 0 0 Z","t":[303,2]},{"d":"M0 0 C63.15813953 0 63.15813953 0 77 12 C77.680625 12.57492187 78.36125 13.14984375 79.0625 13.7421875 C88.62580371 22.4723246 93.11315824 34.63889251 94.31640625 47.33984375 C94.85323571 62.73472724 90.32176149 76.2933477 80 87.6875 C74.45947742 93.0018788 67.97917013 95.95714925 61 99 C60.18015625 99.37253906 59.3603125 99.74507813 58.515625 100.12890625 C42.31211603 105.73974864 5.28962437 102 0 102 C0 68.34 0 34.68 0 0 Z M14 12 C14 37.74 14 63.48 14 90 C43.44408077 91.98085549 43.44408077 91.98085549 68 80 C68.62777344 79.46375 69.25554687 78.9275 69.90234375 78.375 C76.76150941 72.11039204 79.68980277 64.55372345 80.203125 55.36328125 C80.45516497 42.39917493 78.60470525 32.01528793 69.3359375 22.24609375 C53.68935485 7.99269997 35.09270224 12 14 12 Z","t":[423,2]},{"d":"M0 0 C4.95 0 9.9 0 15 0 C15 33.66 15 67.32 15 102 C10.05 102 5.1 102 0 102 C0 68.34 0 34.68 0 0 Z","t":[533,2]},{"d":"M0 0 C1.36533506 1.12289238 2.68271389 2.30387898 3.984375 3.5 C3.07810716 4.7989839 2.15887963 6.08893167 1.234375 7.375 C0.46867188 8.45394531 0.46867188 8.45394531 -0.3125 9.5546875 C-2.09066047 11.58570565 -3.54264107 12.47855012 -6.015625 13.5 C-6.77875 12.778125 -7.541875 12.05625 -8.328125 11.3125 C-17.86015634 3.34644524 -29.00780233 1.72936961 -41.015625 2.5 C-52.48734506 4.5665368 -61.12481929 10.17163037 -68.015625 19.5 C-74.31913426 29.61928342 -75.73348607 41.1937513 -73.328125 52.82421875 C-69.8476267 64.15034029 -63.64297408 73.06122758 -53.140625 78.75 C-43.69484783 83.09288605 -32.22432726 84.25257338 -22.16796875 81.33984375 C-14.02602236 78.33694163 -14.02602236 78.33694163 -7.015625 73.5 C-6.85559012 70.83573315 -6.75619611 68.19439572 -6.69921875 65.52734375 C-6.6680471 64.33087975 -6.6680471 64.33087975 -6.63624573 63.11024475 C-6.57066342 60.55275389 -6.51182533 57.9951572 -6.453125 55.4375 C-6.40994801 53.70767118 -6.36633399 51.97785321 -6.32226562 50.24804688 C-6.21497328 45.9988074 -6.11373074 41.7494611 -6.015625 37.5 C-1.395625 37.5 3.224375 37.5 7.984375 37.5 C8.18286031 43.21065148 8.32763666 48.9192764 8.42382812 54.63256836 C8.46394108 56.5736795 8.51844856 58.51455068 8.58789062 60.45483398 C9.14587006 76.45161196 9.14587006 76.45161196 6.44262695 81.21899414 C4.37939997 83.09545591 2.48657687 84.28310143 -0.015625 85.5 C-0.99619873 86.10074341 -0.99619873 86.10074341 -1.99658203 86.71362305 C-3.90177777 87.85824754 -5.82591525 88.84891188 -7.828125 89.8125 C-8.52679687 90.15152344 -9.22546875 90.49054688 -9.9453125 90.83984375 C-23.75034816 97.29744791 -40.67713743 97.59312896 -55.015625 92.5 C-68.72849579 86.97028992 -78.69416032 77.55014218 -84.94921875 64.15234375 C-91.2015556 48.60165979 -90.07663971 33.95143685 -83.8359375 18.59765625 C-77.96045036 6.4816369 -67.63123564 -2.89635207 -55.015625 -7.5 C-36.46991301 -13.63489332 -15.87793946 -11.816141 0 0 Z","t":[652.015625,10.5]},{"d":"M0 0 C0 25.74 0 51.48 0 78 C-4.62 78 -9.24 78 -14 78 C-14.18120715 69.40241755 -14.32776747 60.80633494 -14.41449738 52.20735168 C-14.45613752 48.2138438 -14.51255097 44.22171696 -14.60351562 40.22900391 C-14.69085611 36.37093685 -14.73835808 32.51419223 -14.75901794 28.6552124 C-14.77372722 27.187919 -14.80245367 25.72069285 -14.84584045 24.25396729 C-15.17093059 12.8018128 -15.17093059 12.8018128 -12.26904297 8.33642578 C-4.09347261 0 -4.09347261 0 0 0 Z","t":[692,26]},{"d":"M0 0 C27.39 0 54.78 0 83 0 C83 3.96 83 7.92 83 12 C71.45 12 59.9 12 48 12 C48.33 41.7 48.66 71.4 49 102 C44.05 102 39.1 102 34 102 C34 72.63 34 43.26 34 13 C22.78 13 11.56 13 0 13 C0 8.71 0 4.42 0 0 Z","t":[707,2]},{"d":"M0 0 C4.62 0 9.24 0 14 0 C22.06922682 15.80909744 29.51043122 31.91104452 37 48 C37.29471191 48.63280884 37.58942383 49.26561768 37.89306641 49.91760254 C41.40315838 57.45458856 44.90416194 64.99574431 48.39746094 72.54052734 C49.79800857 75.56395207 51.2005706 78.586428 52.60398865 81.60852051 C54.00844371 84.63409765 55.41028376 87.66088463 56.8125 90.6875 C57.33481201 91.81140137 57.85712402 92.93530273 58.39526367 94.09326172 C59.10646362 95.63071045 59.10646362 95.63071045 59.83203125 97.19921875 C60.25202393 98.10502686 60.6720166 99.01083496 61.10473633 99.9440918 C62 102 62 102 62 103 C56.72 103 51.44 103 46 103 C40.8113825 92.81691971 36.03440074 82.52359945 31.4375 72.0625 C30.04083325 68.8976539 28.64163466 65.73392996 27.2421875 62.5703125 C26.89130569 61.77638596 26.54042389 60.98245941 26.1789093 60.16447449 C21.93280504 50.56795572 17.59721458 41.01194981 13.25366211 31.45922852 C12.70165966 30.24235049 12.14965767 29.02547225 11.59765625 27.80859375 C11.11820557 26.75470459 10.63875488 25.70081543 10.14477539 24.61499023 C9 22 9 22 8 19 C7.34 18.67 6.68 18.34 6 18 C5.608125 19.25039063 5.21625 20.50078125 4.8125 21.7890625 C2.9074211 27.48879276 0.47747155 32.90481372 -2 38.375 C-3.06198406 40.74053677 -4.12314641 43.1064312 -5.18359375 45.47265625 C-5.47326523 46.11786728 -5.76293671 46.76307831 -6.06138611 47.42784119 C-8.70159176 53.31505827 -11.30822537 59.2168765 -13.91015625 65.12109375 C-14.33444916 66.08356018 -14.75874207 67.04602661 -15.19589233 68.03765869 C-16.9105127 71.92769985 -18.62479171 75.81788944 -20.3371582 79.70892334 C-21.54765371 82.45888418 -22.75999339 85.20802561 -23.97265625 87.95703125 C-24.33472672 88.78101913 -24.69679718 89.60500702 -25.06983948 90.45396423 C-25.4116777 91.22817215 -25.75351593 92.00238007 -26.10571289 92.80004883 C-26.54772789 93.8037426 -26.54772789 93.8037426 -26.99867249 94.82771301 C-28.26839098 97.58224929 -29.64355943 100.28711885 -31 103 C-35.95 103 -40.9 103 -46 103 C-44.10286894 97.04134355 -41.95982108 91.4029811 -39.296875 85.75 C-38.94224182 84.9865477 -38.58760864 84.2230954 -38.222229 83.43650818 C-37.4629005 81.80304523 -36.70143359 80.17057488 -35.93798828 78.53903198 C-33.90219792 74.18803214 -31.88228591 69.82965478 -29.859375 65.47265625 C-29.44941284 64.59094254 -29.03945068 63.70922882 -28.61706543 62.80079651 C-24.69814788 54.36740823 -20.83983492 45.90712968 -17 37.4375 C-16.38567299 36.08340918 -15.77133396 34.72932383 -15.15698242 33.37524414 C-13.98939936 30.80117466 -12.82238978 28.22684618 -11.65576172 25.65234375 C-9.12960136 20.07849077 -6.59573687 14.50813936 -4.0625 8.9375 C-3.26168399 7.17579705 -2.46089843 5.41408026 -1.66015625 3.65234375 C-1.11230469 2.44707031 -0.56445312 1.24179687 0 0 Z","t":[828,1]},{"d":"M0 0 C4.62 0 9.24 0 14 0 C14 29.7 14 59.4 14 90 C32.81 90 51.62 90 71 90 C71 93.96 71 97.92 71 102 C47.57 102 24.14 102 0 102 C0 68.34 0 34.68 0 0 Z","t":[903,2]}],"dots":[{"d":"M0 0 C6.25254479 0.08336726 6.25254479 0.08336726 8.90625 2.09375 C10.28081269 5.66761298 10.48093609 7.70813348 9.84375 11.53125 C6.03169692 17.50346649 0.48232032 21.41779662 -5.15625 25.53125 C-5.24349706 22.1147448 -5.29672325 18.69852687 -5.34375 15.28125 C-5.36888672 14.31316406 -5.39402344 13.34507813 -5.41992188 12.34765625 C-5.42958984 11.41308594 -5.43925781 10.47851562 -5.44921875 9.515625 C-5.4649292 8.65678711 -5.48063965 7.79794922 -5.49682617 6.91308594 C-4.98463213 3.33103213 -3.60831133 0.88900424 0 0 Z","t":[683.15625,0.46875]},{"d":"M0 0 C3.63312845 2.90650276 5.57459043 5.42904128 6.17578125 10.12109375 C6.34919403 15.28879461 6.39348674 19.43686086 2.8359375 23.46875 C-1.87717963 27.97582922 -5.45360862 29.80158798 -12.109375 29.6796875 C-16.84198134 29.19383058 -19.94447059 26.95132414 -22.9765625 23.46875 C-26.47206688 18.67491542 -26.99462255 14.24534181 -26.1640625 8.46875 C-24.0605392 3.41505709 -21.27474841 -0.30351512 -16.1640625 -2.53125 C-9.91762617 -4.74772741 -5.31941138 -3.66855957 0 0 Z","t":[845.1640625,77.53125]}]};
  var KNOT = "M34.5 49H63.5L130.25 115.75L155.75 90.25L130 64.5L107.5 87L93 72.5L116.5 49H145.5L171 74.5V105.5L145.5 131H116.5L49.75 64.25L24.25 89.75L50 115.5L72.5 93L87 107.5L63.5 131H34.5L9 105.5V74.5Z";
  /* The knot's centreline as one figure-of-eight, from the crossing, down-right first. */
  var RIBBON = "M90 90L120.75 120.75H141.25L160.75 101.25V78.75L141.25 59.25H120.75L90 90L59.25 120.75H38.75L19.25 101.25V78.75L38.75 59.25H59.25Z";

  /* Lockup units: the knot's 180 grid. The logotype (974 x 107) sits at WX,WY scaled by WS. */
  var WS = 82 / 102, WX = 211, WY = 49 - 2 * WS, END = WX + 974 * WS;
  var X0 = -40, W = END + 80, H = 180;
  var pct = function (v, of) { return (v / of * 100) + "%"; };
  var box = function (x, y, w, h) {
    return "left:" + pct(x - X0, W) + ";top:" + pct(y, H) + ";width:" + pct(w, W) + ";height:" + pct(h, H);
  };
  var GUIDES = [
    "M-30 49H" + (END + 30), "M-30 131H" + (END + 30), "M-30 90H" + (END + 30),
    "M0 0L180 180", "M180 0L0 180", "M9 10V170", "M171 10V170"
  ];

  var html =
    '<div class="cd-intro__bg"></div>' +
    '<div class="cd-intro__lockup" style="aspect-ratio:' + W + "/" + H + '">' +
      '<svg class="cd-intro__guides" viewBox="' + X0 + " 0 " + W + " " + H + '" aria-hidden="true" focusable="false" style="' + box(X0, 0, W, H) + '">' +
        '<g class="g" fill="none" stroke="rgba(125,10,112,.35)" stroke-width="1.2">' +
          GUIDES.map(function (d) { return '<path pathLength="1" d="' + d + '"/>'; }).join("") +
        "</g>" +
      "</svg>" +
      '<svg class="cd-intro__knot" viewBox="0 0 180 180" aria-hidden="true" focusable="false" style="' + box(0, 0, 180, 180) + '">' +
        '<path class="knot" d="' + KNOT + '" fill="#7d0a70"/>' +
        '<path class="knot-line" pathLength="1" d="' + KNOT + '" fill="none" stroke="#7d0a70" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<path class="lead" pathLength="1" d="' + RIBBON + '" fill="none" stroke="#A78ADE" stroke-width="20.5"/>' +
        '<path class="ribbon" pathLength="1" d="' + RIBBON + '" fill="none" stroke="#7d0a70" stroke-width="20.5"/>' +
      "</svg>" +
      '<svg class="cd-intro__word" viewBox="0 0 974 107" aria-hidden="true" focusable="false" style="' + box(WX, WY, 974 * WS, 107 * WS) + '">' +
        WORD.letters.map(function (l) {
          return '<g transform="translate(' + l.t + ')"><path class="lf" d="' + l.d + '" fill="#2A3038"/>' +
            '<path class="ll" pathLength="1" d="' + l.d + '" fill="none" stroke="#2A3038" stroke-width="2.2" stroke-linejoin="round"/></g>';
        }).join("") +
        '<circle class="ring" cx="835.5" cy="90.5" r="16.5" fill="none" stroke="#A78ADE" stroke-width="2.5"/>' +
        WORD.dots.map(function (l) {
          return '<g transform="translate(' + l.t + ')"><path class="dot" d="' + l.d + '" fill="#A78ADE"/></g>';
        }).join("") +
      "</svg>" +
    "</div>" +
    '<button type="button" class="cd-intro__skip">Skip intro</button>';

  var overlay = document.createElement("div");
  overlay.className = "cd-intro-overlay";
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  try { sessionStorage.setItem("cd-intro", "1"); } catch (e) { /* private mode: plays again next time */ }

  /* Where the two halves land: the hero logotype and the header's brand mark. Hidden until they do. */
  var targets = [
    { el: overlay.querySelector(".cd-intro__word"), to: document.querySelector(".hero-logo"), delay: 0 },
    { el: overlay.querySelector(".cd-intro__knot"), to: document.querySelector(".site-header .brand__mark"), delay: 90 }
  ].filter(function (t) { return t.to; });
  targets.forEach(function (t) { t.to.style.visibility = "hidden"; });

  var q = function (s) { return [].slice.call(overlay.querySelectorAll(s)); };
  var EASE = { inOut: "cubic-bezier(.45,0,.55,1)", sine: "cubic-bezier(.37,0,.63,1)", out: "cubic-bezier(.25,1,.5,1)", in: "cubic-bezier(.5,0,.75,0)", move: "cubic-bezier(.65,0,.25,1)" };
  /* Scrolling winds the sequence on instead of ending it: every animation below, and the clock that
     fires the hand-off, share one playback rate that each scroll nudges up (see hurry()). Anything
     started later — the merge included — picks up the rate as it stands, via track(). */
  var anims = [], rate = 1, clock = null;
  function track(a) { a.playbackRate = rate; anims.push(a); return a; }

  /* Draw a stroke between [start, end] fractions of its length (pathLength="1"). A second animation on
     the same stroke (a retract) must fill "forwards" only, or its first frame overrides the draw-in. */
  function seg(a) { return { strokeDasharray: (a[1] - a[0]) + " 2", strokeDashoffset: -a[0] }; }
  function draw(els, from, to, t, dur, gap, ease, fill) {
    els.forEach(function (el, i) {
      track(el.animate([seg(from), seg(to)], { delay: t + i * (gap || 0), duration: dur, easing: ease || EASE.inOut, fill: fill || "both" }));
    });
  }
  function fade(els, from, to, t, dur, gap, ease) {
    els.forEach(function (el, i) {
      track(el.animate([{ opacity: from }, { opacity: to }], { delay: t + i * (gap || 0), duration: dur, easing: ease || EASE.out, fill: "both" }));
    });
  }

  var guides = q(".g path"), letters = q(".ll");
  draw(guides, [0, 0], [0, 1], 0, 600, 50);
  draw(q(".knot-line"), [0, 0], [0, 1], 150, 750, 0, EASE.sine);
  /* one continuous stroke round the figure-of-eight, lavender tip leading */
  draw(q(".lead"), [0, 0], [0, 1], 650, 850, 0, EASE.sine);
  draw(q(".ribbon"), [0, 0], [0, 1], 720, 850, 0, EASE.sine);
  fade(q(".knot-line"), 1, 0, 1400, 250);
  fade(q(".knot"), 0, 1, 1550, 200);
  fade(q(".ribbon, .lead"), 1, 0, 1650, 350, 0, EASE.in);   // lifting the ribbon reveals the weave
  draw(letters, [0, 0], [0, 1], 950, 700, 45, EASE.sine);
  fade(q(".lf"), 0, 1, 1750, 350, 35);
  draw(letters, [0, 1], [1, 1], 1900, 450, 35, EASE.sine, "forwards");
  q(".dot").forEach(function (el, i) {
    track(el.animate(
      [{ transform: "scale(0)" }, { transform: "scale(1.25)", offset: 0.45 }, { transform: "scale(.92)", offset: 0.7 }, { transform: "scale(1)" }],
      { delay: 2250 + i * 120, duration: 600, easing: "ease-out", fill: "both" }));
  });
  q(".ring").forEach(function (el) {
    track(el.animate(
      [{ transform: "scale(.8)", opacity: 0 }, { transform: "scale(.8)", opacity: 0.9, strokeWidth: 2.5, offset: 0.01 }, { transform: "scale(2.6)", opacity: 0, strokeWidth: 0.5 }],
      { delay: 2370, duration: 800, easing: EASE.out, fill: "both" }));
  });
  draw(guides, [0, 1], [1, 1], 2400, 500, 40, EASE.in, "forwards");

  var done = false;
  var timers = [];

  /* Scrolling means "get on with it", not "stop": wind the sequence on faster. The rate follows how
     far the page has been scrolled, not how many events arrived — one flick of a wheel or trackpad
     fires a scroll and a wheel and often dozens of each, so counting events pinned the rate at its
     cap instantly and the sequence blinked past, which reads as a cancel rather than a wind-on.
     The fast end has to stay slow enough to read as a wind-on. Two and a half times was not: it
     compressed the three seconds left into one and whipped the hand-off past, which is exactly the
     cancel this was meant to replace. FIRST is the bump a reader feels the moment they scroll,
     RATE_MAX the ceiling however far they go, FULL the distance that reaches it, CAP_PER_EVENT the
     most one event may contribute (a restored or smooth scroll can land as one 900px jump, and no
     single event should spend the whole budget), and MERGE_MAX holds the landing back to a pace the
     eye can follow whatever the rest ran at. STEP_MS eases between rates so the change of pace
     isn't a jolt - a timer rather than rAF, which never fires in a background tab. */
  var FIRST = 1.35, RATE_MAX = 1.9, FULL = 1200, CAP_PER_EVENT = 240, MERGE_MAX = 1.4, STEP_MS = 40;
  var scrolled = 0, want = 1, lastY = window.scrollY || 0, step = 0, pending = 0;
  function apply() {
    anims.forEach(function (a) { a.playbackRate = rate; });
    if (clock) clock.playbackRate = rate;
  }
  function ramp() {
    if (step || done || rate === want) return;
    step = setTimeout(function () {
      step = 0;
      rate += (want - rate) * 0.18;
      if (want - rate < 0.01) rate = want;
      apply();
      ramp();
    }, STEP_MS);
  }
  function hurry(px) {
    if (done) return;
    scrolled += Math.min(px, CAP_PER_EVENT);
    want = Math.max(FIRST, 1 + (RATE_MAX - 1) * Math.min(1, scrolled / FULL));
    trace("hurry " + Math.round(px) + "px (total " + Math.round(scrolled) + ") -> rate " + want.toFixed(2));
    ramp();
  }
  /* A wheel tick or a touch drag normally lands as a scroll, and that scroll's distance is what
     counts; the gesture only stands in for distance when the page itself cannot move (already at
     the end, or too short to scroll), so the same flick is never counted twice.

     A scroll with no gesture behind it is not the reader hurrying: the browser restoring the
     position on reload fires one, and on a page that was left scrolled it is a jump of hundreds of
     pixels, which used to slam the rate to its cap before anyone had touched anything. Those are
     ignored, so the sequence only ever responds to a real gesture. */
  var GESTURE_WINDOW = 600, gestureAt = -Infinity;
  function onScroll() {
    clearTimeout(pending);
    var y = window.scrollY || 0, d = Math.abs(y - lastY);
    lastY = y;
    if (performance.now() - gestureAt > GESTURE_WINDOW) {
      trace("ignored a " + Math.round(d) + "px scroll to " + y + ": no gesture behind it (restored or scripted)");
      return;
    }
    hurry(d);
  }
  function onGesture(e) {
    gestureAt = performance.now();
    trace("gesture: " + (e && e.type) + (e && e.key ? " (" + e.key + ")" : ""));
    clearTimeout(pending);
    pending = setTimeout(function () { trace("no scroll followed it; counting the gesture itself"); hurry(60); }, 120);
  }
  /* Keys that scroll the page hurry it along; any other key is a skip, as a click is. */
  var SCROLL_KEYS = { ArrowDown: 1, ArrowUp: 1, PageDown: 1, PageUp: 1, Home: 1, End: 1, " ": 1, Spacebar: 1 };
  function onKey(e) { if (SCROLL_KEYS[e.key]) onGesture(e); else skip(e); }
  var LISTEN = [["pointerdown", skip], ["keydown", onKey], ["wheel", onGesture], ["touchmove", onGesture], ["scroll", onScroll]];
  function events(on) {
    LISTEN.forEach(function (l) {
      if (on) window.addEventListener(l[0], l[1], { capture: true, passive: true });
      else window.removeEventListener(l[0], l[1], true);
    });
    if (!on) {   // no more rate changes once we're handing over or skipping
      clearTimeout(pending);
      clearTimeout(step);
      step = 0;
    }
  }
  function cleanup() {
    if (clock) clock.cancel();
    anims.forEach(function (a) { a.cancel(); });
    targets.forEach(function (t) { t.to.style.visibility = ""; });
    overlay.remove();
  }

  /* The merge: fly each half onto its target (FLIP: from its box to the target's box) while the ground fades. */
  function handOff() {
    if (done) return;
    done = true;
    trace("hand-off: the sequence played out, final rate " + rate.toFixed(2));
    events(false);
    if (rate > MERGE_MAX) { rate = MERGE_MAX; apply(); }   // the landing stays legible, however fast the trace ran
    if (clock) clock.cancel();
    timers.forEach(clearTimeout);
    root.classList.remove("cd-intro");
    var MOVE = 950, last = 0, vh = window.innerHeight || root.clientHeight;
    targets.forEach(function (t) {
      var a = t.el.getBoundingClientRect(), b = t.to.getBoundingClientRect();
      if (!a.width || !b.width) return;   // target not laid out (e.g. hidden): it just fades with the ground
      if (b.bottom < 0 || b.top > vh) return;   // scrolled past its target: fade rather than fly off-screen
      var dx = b.left - a.left, dy = b.top - a.top, sx = b.width / a.width, sy = b.height / a.height;
      track(t.el.animate(
        [{ transform: "none" }, { transform: "translate(" + dx + "px," + dy + "px) scale(" + sx + "," + sy + ")" }],
        { delay: t.delay, duration: MOVE, easing: EASE.move, fill: "forwards" }));
      last = Math.max(last, t.delay + MOVE);
    });
    /* the ground trails the move, so the page appears as the logo settles rather than under it mid-flight */
    track(overlay.querySelector(".cd-intro__bg").animate([{ opacity: 1 }, { opacity: 0 }], { delay: 250, duration: 750, easing: EASE.inOut, fill: "forwards" }));
    track(overlay.querySelector(".cd-intro__skip").animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" }));
    overlay.classList.add("is-merging");
    timers.push(setTimeout(cleanup, (Math.max(last, 1000) + 30) / rate));
  }

  /* Skip: a quick fade, the page's own logos straight back. */
  function skip(e) {
    if (done) return;
    done = true;
    trace("SKIPPED by " + (e && e.type ? e.type + (e.key ? " (" + e.key + ")" : "") : "code"));
    events(false);
    timers.forEach(clearTimeout);
    root.classList.remove("cd-intro");
    targets.forEach(function (t) { t.to.style.visibility = ""; });
    overlay.style.transitionDuration = ".2s";
    overlay.classList.add("is-leaving");
    setTimeout(cleanup, 220);
  }

  events(true);
  /* The hand-off is driven by an animation rather than a timer, so hurry() moves it in with the rest.
     The timer behind it is only a backstop if the clock never fires; handOff is idempotent. */
  clock = overlay.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 3050, fill: "none" });
  clock.onfinish = handOff;
  timers.push(setTimeout(handOff, 6000));
})();
