/* ============================================================
   תאי סיקרט - Green Bio Super Treatment
   Scrubs ONE concatenated film (media/film.mp4 / film_m.mp4) to the scroll
   position, crossfades the 5 captions, and handles the order form.
   Engine from the scroll-cinematic-site skill (lerped scrub, loader,
   buffer-aware seek clamp, iOS priming).
   ============================================================ */
(function () {
  "use strict";

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mqMobile = window.matchMedia("(max-width: 820px), (orientation: portrait)");

  var film   = document.getElementById("film");
  var video  = document.getElementById("filmVideo");
  var caps   = Array.prototype.slice.call(document.querySelectorAll(".cap"));
  var dots   = Array.prototype.slice.call(document.querySelectorAll(".dots a"));
  var cue    = document.getElementById("scrollCue");
  var nav    = document.getElementById("nav");
  var pbar   = document.getElementById("progress");
  var loader = document.getElementById("loader");
  var sticky = document.getElementById("stickybar");

  /* per-scene durations (seconds) -> caption bands. UPDATE after the film is built. */
  var DUR = [8, 5, 6, 6, 6];
  var TOTAL = DUR.reduce(function (a, b) { return a + b; }, 0);
  var bands = (function () {
    var out = [], acc = 0;
    DUR.forEach(function (d) { var from = acc / TOTAL; acc += d; out.push({ from: from, to: acc / TOTAL }); });
    return out;
  })();

  /* ---------- preloader ---------- */
  var loaderGone = false;
  function hideLoader() {
    if (loaderGone || !loader) return;
    loaderGone = true;
    loader.classList.add("is-hidden");
    loader.setAttribute("aria-hidden", "true");
  }
  setTimeout(hideLoader, 2800);

  /* ---------- film source (PC vs mobile) + priming ---------- */
  var ready = false, primed = false;
  function wantSrc() { return mqMobile.matches ? video.dataset.srcM : video.dataset.src; }
  function loadFilm() {
    var want = wantSrc();
    if (video.getAttribute("src") !== want) {
      video.setAttribute("src", want);
      video.load();
      ready = false; primed = false;
    }
  }
  video.addEventListener("loadedmetadata", function () { ready = true; update(); });
  video.addEventListener("loadeddata", hideLoader);
  video.addEventListener("canplay", hideLoader);
  video.addEventListener("error", hideLoader);
  function prime() {
    if (primed) return;
    primed = true;
    var p = video.play();
    if (p && p.then) p.then(function () { video.pause(); }).catch(function () { primed = false; });
    else { try { video.pause(); } catch (e) {} }
  }

  /* ---------- scrub engine ---------- */
  function dur() { return (video.duration && isFinite(video.duration)) ? video.duration : TOTAL; }
  function filmProgress() {
    var scrollable = film.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return 0;
    var top = film.getBoundingClientRect().top;
    var p = -top / scrollable;
    return p < 0 ? 0 : (p > 1 ? 1 : p);
  }
  function activeIndex(p) {
    for (var i = 0; i < bands.length; i++) { if (p < bands[i].to) return i; }
    return bands.length - 1;
  }
  var lastP = 0;
  function bufferedEnd() {
    try { return video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0; } catch (e) { return 0; }
  }
  function seek(t) {
    if (!ready) return;
    var safe = Math.min(t, Math.max(0, bufferedEnd() - 0.05));
    try { video.currentTime = safe; } catch (e) {}
  }
  var lerpOn = !prefersReduced && typeof window.requestAnimationFrame === "function";
  var targetT = 0, currentT = 0, rafId = null;
  function tick() {
    var diff = targetT - currentT;
    if (Math.abs(diff) < 0.008) { currentT = targetT; seek(currentT); rafId = null; return; }
    currentT += diff * 0.22;
    seek(currentT);
    rafId = window.requestAnimationFrame(tick);
  }
  function requestSeek(t) {
    if (!lerpOn) { seek(t); return; }
    targetT = t;
    if (rafId === null) rafId = window.requestAnimationFrame(tick);
  }

  var revealEls = [];
  function runReveals() {
    var vh = window.innerHeight || document.documentElement.clientHeight || 800;
    for (var k = 0; k < revealEls.length; k++) {
      if (!revealEls[k].classList.contains("is-in") && revealEls[k].getBoundingClientRect().top < vh * 0.92) {
        revealEls[k].classList.add("is-in");
      }
    }
  }

  function update() {
    var p = filmProgress();
    lastP = p;
    var idx = activeIndex(p);
    for (var i = 0; i < caps.length; i++) caps[i].classList.toggle("is-active", i === idx);
    for (var j = 0; j < dots.length; j++) dots[j].classList.toggle("is-active", j === idx);
    if (cue) cue.style.opacity = p > 0.02 ? "0" : "";
    requestSeek(p * dur());
  }

  var orderSec = document.getElementById("order");
  function onScroll() {
    update();
    var st = window.scrollY || window.pageYOffset;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (pbar) pbar.style.transform = "scaleX(" + (h > 0 ? st / h : 0) + ")";
    if (nav) nav.classList.toggle("is-scrolled", st > 40);
    if (sticky) {
      /* show the sticky CTA once the visitor has left the hero, hide it while on the order form */
      var vh = window.innerHeight || 800;
      var onForm = orderSec && orderSec.getBoundingClientRect().top < vh * 0.6;
      var on = st > vh * 0.9 && !onForm;
      sticky.classList.toggle("is-on", on);
      sticky.setAttribute("aria-hidden", String(!on));
    }
    runReveals();
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", update, { passive: true });

  /* ---------- init ---------- */
  loadFilm();
  prime();
  revealEls = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if (!prefersReduced) document.documentElement.classList.add("reveal-on");
  video.addEventListener("progress", function () { requestSeek(lastP * dur()); });
  ["touchstart", "pointerdown", "click", "keydown"].forEach(function (ev) {
    window.addEventListener(ev, prime, { once: true, passive: true });
  });
  onScroll();

  function onMQ() { loadFilm(); prime(); update(); }
  if (mqMobile.addEventListener) mqMobile.addEventListener("change", onMQ);
  else if (mqMobile.addListener) mqMobile.addListener(onMQ);

  function scrollToBand(i) {
    var scrollable = film.offsetHeight - window.innerHeight;
    var mid = (bands[i].from + bands[i].to) / 2;
    window.scrollTo({ top: Math.round(film.offsetTop + mid * scrollable), behavior: "smooth" });
  }
  dots.forEach(function (d, i) {
    d.addEventListener("click", function (e) { e.preventDefault(); scrollToBand(i); });
  });

  /* ---------- mobile menu ---------- */
  var toggle = document.getElementById("navToggle");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }
  document.querySelectorAll("[data-link]").forEach(function (a) {
    a.addEventListener("click", function () { if (nav) nav.classList.remove("is-open"); });
  });

  /* ---------- order form ---------- */
  var PRICES = { "1": 249, "2": 419 };
  var form = document.getElementById("orderForm");
  if (form) {
    var totalEl = document.getElementById("orderTotal");
    var submit = document.getElementById("orderSubmit");
    var status = document.getElementById("orderStatus");
    var qtyInputs = Array.prototype.slice.call(form.querySelectorAll("input[name=qty]"));

    function qty() { var c = qtyInputs.filter(function (i) { return i.checked; })[0]; return c ? c.value : "1"; }
    function renderTotal() { totalEl.textContent = PRICES[qty()] + " ₪"; }
    qtyInputs.forEach(function (i) { i.addEventListener("change", renderTotal); });
    renderTotal();

    /* price cards / CTA links that preselect a quantity */
    document.querySelectorAll("[data-qty]").forEach(function (a) {
      a.addEventListener("click", function () {
        var v = a.getAttribute("data-qty");
        qtyInputs.forEach(function (i) { i.checked = (i.value === v); });
        renderTotal();
      });
    });

    function setErr(id, msg) {
      var input = document.getElementById(id);
      var err = document.getElementById(id + "-err");
      var field = input.closest(".field");
      if (err) err.textContent = msg || "";
      if (field) field.classList.toggle("is-invalid", !!msg);
      input.setAttribute("aria-invalid", msg ? "true" : "false");
    }
    function validate() {
      var ok = true, first = null;
      var name = document.getElementById("fName").value.trim();
      var phone = document.getElementById("fPhone").value.replace(/[\s-]/g, "");
      var city = document.getElementById("fCity").value.trim();
      var address = document.getElementById("fAddress").value.trim();
      var checks = [
        ["fName", name.length >= 2, "איך קוראים לך? שם מלא בבקשה"],
        ["fPhone", /^0(5\d|[2-4,8-9])\d{7}$/.test(phone), "מספר טלפון ישראלי, לדוגמה 052-1234567"],
        ["fCity", city.length >= 2, "באיזו עיר?"],
        ["fAddress", address.length >= 3, "רחוב ומספר בית למשלוח"]
      ];
      checks.forEach(function (c) {
        setErr(c[0], c[1] ? "" : c[2]);
        if (!c[1]) { ok = false; if (!first) first = c[0]; }
      });
      if (first) document.getElementById(first).focus();
      return ok;
    }
    ["fName", "fPhone", "fCity", "fAddress"].forEach(function (id) {
      document.getElementById(id).addEventListener("blur", function () {
        if (this.getAttribute("aria-invalid") === "true") validate();
      });
    });

    /* Order sink. Static phase: localStorage + console. Base44 phase: replace
       window.THAI_SECRET_SUBMIT with a function(order) that returns a Promise. */
    function defaultSubmit(order) {
      return new Promise(function (resolve) {
        try {
          var list = JSON.parse(localStorage.getItem("ts_orders") || "[]");
          list.push(order);
          localStorage.setItem("ts_orders", JSON.stringify(list));
        } catch (e) {}
        setTimeout(resolve, 600);
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.textContent = ""; status.className = "form__status";
      if (!validate()) return;
      var order = {
        name: document.getElementById("fName").value.trim(),
        phone: document.getElementById("fPhone").value.trim(),
        city: document.getElementById("fCity").value.trim(),
        address: document.getElementById("fAddress").value.trim(),
        notes: document.getElementById("fNotes").value.trim(),
        boxes: parseInt(qty(), 10),
        total: PRICES[qty()],
        product: "Green Bio Super Treatment 24x30ml",
        source: "site",
        created_at: new Date().toISOString()
      };
      submit.disabled = true; submit.classList.add("is-loading");
      var sink = (typeof window.THAI_SECRET_SUBMIT === "function") ? window.THAI_SECRET_SUBMIT : defaultSubmit;
      Promise.resolve().then(function () { return sink(order); }).then(function () {
        form.classList.add("is-done");
        status.textContent = "";
        document.getElementById("orderDone").focus && document.getElementById("orderDone").setAttribute("tabindex", "-1");
        document.getElementById("orderDone").focus();
      }).catch(function () {
        status.textContent = "משהו השתבש בשליחה. נסו שוב, או כתבו לנו באינסטגרם.";
        status.className = "form__status is-err";
      }).then(function () {
        submit.disabled = false; submit.classList.remove("is-loading");
      });
    });
  }
})();
