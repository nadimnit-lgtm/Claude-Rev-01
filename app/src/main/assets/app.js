/* ==========================================================================
   Azkar TV Display — Version 01
   Reading engine, navigation, settings and compact prayer ribbon.
   Offline-first. All assets served from the bundled origin.
   ========================================================================== */
(function () {
  "use strict";

  var LS = "azkartv.v01.settings";
  var LS_POS = "azkartv.v01.pos";

  var THEMES = [
    { id: "dark-ambient",  name: "Dark Ambient",  a: "#0e1413", b: "#c9a85a" },
    { id: "gold-navy",     name: "Gold & Navy",   a: "#0a1428", b: "#e6c168" },
    { id: "haram-light",   name: "Haram Light",   a: "#f4efe6", b: "#b08828" },
    { id: "green-classic", name: "Green Classic", a: "#0c1b14", b: "#57b489" },
    { id: "high-contrast", name: "High Contrast", a: "#000000", b: "#ffe14d" }
  ];

  var CITY_LABEL = {
    auto: "Auto", riyadh: "Riyadh", jeddah: "Jeddah",
    makkah: "Makkah", madinah: "Madinah", dammam: "Dammam"
  };
  // Offline approximate prayer windows (local clock, KSA) — clearly labelled approx.
  var APPROX = {
    riyadh:  { Fajr:"04:30", Dhuhr:"11:55", Asr:"15:20", Maghrib:"18:35", Isha:"20:05" },
    jeddah:  { Fajr:"04:45", Dhuhr:"12:10", Asr:"15:35", Maghrib:"18:50", Isha:"20:20" },
    makkah:  { Fajr:"04:42", Dhuhr:"12:08", Asr:"15:33", Maghrib:"18:48", Isha:"20:18" },
    madinah: { Fajr:"04:38", Dhuhr:"12:05", Asr:"15:28", Maghrib:"18:45", Isha:"20:15" },
    dammam:  { Fajr:"04:18", Dhuhr:"11:45", Asr:"15:10", Maghrib:"18:25", Isha:"19:55" }
  };

  var DEFAULTS = {
    theme: "dark-ambient",
    arScale: 1.0, tlScale: 1.0, trScale: 1.0,
    showTranslit: true, showTranslation: true, showSource: true,
    showRibbon: true, tajweed: false,
    autoRotate: false, interval: 25,
    city: "riyadh", deviceMode: "auto",
    section: "quranic_duas"
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var state = {
    content: null, sections: null, items: [],
    settings: load(), draft: null,
    index: 0, autoTimer: null
  };

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS) || "{}");
      var s = {}; for (var k in DEFAULTS) s[k] = (k in raw) ? raw[k] : DEFAULTS[k];
      return s;
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(state.settings)); } catch (e) {} }
  function savePos() {
    try { localStorage.setItem(LS_POS, JSON.stringify({ section: state.settings.section, index: state.index })); } catch (e) {}
  }

  /* ---- boot -------------------------------------------------------------- */
  function boot() {
    Promise.all([
      fetch("content/content.json").then(function (r) { return r.json(); }),
      fetch("content/sections.json").then(function (r) { return r.json(); })
    ]).then(function (res) {
      state.content = res[0];
      state.sections = res[1];
      applyTheme(state.settings.theme);
      buildSectionList();
      buildSettings();
      bindGlobal();
      restorePosition();
      selectSection(state.settings.section, true);
      setupPrayer();
      setTimeout(function () { var s = $("#splash"); s.classList.add("gone"); setTimeout(function(){ s.remove(); }, 500); }, 550);
    }).catch(function (err) {
      var s = $("#splash"); if (s) s.innerHTML = '<div style="color:var(--muted);font-size:14px;padding:24px;text-align:center">Unable to load content.<br>' + (err && err.message || "") + '</div>';
    });
  }

  /* ---- theme ------------------------------------------------------------- */
  function applyTheme(id) { document.body.setAttribute("data-theme", id); }

  /* ---- section selection ------------------------------------------------- */
  function selectSection(key, keepIndex) {
    state.settings.section = key;
    state.items = state.content.items.filter(function (it) { return it.section === key; });
    if (!state.items.length) { state.items = state.content.items.slice(); }
    if (!keepIndex || state.index >= state.items.length) state.index = 0;
    var meta = (state.sections.sections || []).filter(function (s) { return s.key === key; })[0];
    $("#curSection").textContent = meta ? meta.label : key;
    $$(".sec-item").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-key") === key);
    });
    render();
    save();
  }

  function buildSectionList() {
    var wrap = $("#secList"); wrap.innerHTML = "";
    (state.sections.sections || []).forEach(function (s) {
      if (!s.count) return;
      var b = document.createElement("button");
      b.className = "sec-item"; b.setAttribute("data-key", s.key);
      b.innerHTML = '<span class="sec-name">' + esc(s.label) + '</span><span class="sec-count">' + s.count + '</span>';
      b.addEventListener("click", function () {
        selectSection(s.key, false);
        closeSheets();
      });
      wrap.appendChild(b);
    });
  }

  /* ---- rendering --------------------------------------------------------- */
  function autoSize(mode, scale) {
    // Base Arabic px per length mode; scaled by user multiplier; bounded.
    var base = { short: 46, normal: 36, long: 30, very_long: 25 }[mode] || 34;
    var w = window.innerWidth, h = window.innerHeight;
    var minDim = Math.min(w, h);
    // Tablet bump only for genuinely large screens (both dimensions sizable),
    // so a landscape phone (wide but short) is not mistaken for a tablet.
    if (minDim >= 820) base += 8;
    else if (minDim >= 680) base += 4;
    // Short-height viewport (landscape phone): reduce hero to avoid overflow.
    if (h < 460) base = Math.round(base * 0.72);
    else if (h < 560) base = Math.round(base * 0.85);
    return Math.round(base * scale);
  }

  function render() {
    var it = state.items[state.index];
    if (!it) return;
    var s = state.settings;
    var reader = $("#reader");
    reader.setAttribute("data-size", it.size_mode);

    // text + scale vars
    var ar = autoSize(it.size_mode, s.arScale);
    reader.style.setProperty("--ar-size", ar + "px");
    reader.style.setProperty("--tl-size", Math.round((it.size_mode === "short" ? 18 : 16) * s.tlScale) + "px");
    reader.style.setProperty("--tr-size", Math.round((it.size_mode === "short" ? 19 : 17) * s.trScale) + "px");

    // Tajweed: only when verified markup exists AND toggle on. None bundled -> plain.
    var arEl = $("#mArabic");
    if (s.tajweed && it.tajweed_html) { arEl.innerHTML = it.tajweed_html; }
    else { arEl.textContent = it.arabic; }

    $("#mCategory").textContent = it.category;
    $("#mType").textContent = it.type;
    $("#mTitle").textContent = it.title || "";
    $("#mTitle").classList.toggle("hidden", !it.title);

    setLine("#mTranslit", it.transliteration, s.showTranslit);
    setLine("#mTranslation", it.translation, s.showTranslation);
    $("#mSource").textContent = it.source || "";
    $("#mSource").parentElement.classList.toggle("hidden", !s.showSource || !it.source);

    var rep = $("#mRepeat");
    var r = parseInt(it.repeat, 10);
    if (r && r > 1) { rep.textContent = "×" + r; rep.classList.remove("hidden"); }
    else rep.classList.add("hidden");

    var v = $("#mVerify");
    v.className = "verify " + it.verification;
    $("#mVerifyText").textContent = ({ authentic: "Authentic", referenced: "Referenced", needs_review: "Needs review" })[it.verification] || "Referenced";

    // progress + counter
    var pct = state.items.length > 1 ? (state.index / (state.items.length - 1)) * 100 : 100;
    $("#progressFill").style.width = pct + "%";
    $("#counterText").textContent = (state.index + 1) + " / " + state.items.length;

    // scroll hint when content overflows
    requestAnimationFrame(function () {
      var sc = $("#readerScroll");
      reader.classList.toggle("can-scroll", sc.scrollHeight - sc.clientHeight > 24);
      sc.scrollTop = 0;
    });
    savePos();
  }

  function setLine(sel, text, show) {
    var el = $(sel);
    if (show && text) { el.textContent = text; el.classList.remove("hidden"); }
    else el.classList.add("hidden");
  }

  function go(delta) {
    if (!state.items.length) return;
    var ni = (state.index + delta + state.items.length) % state.items.length;
    if (ni === state.index) return;
    var sc = $("#readerScroll");
    var outClass = delta > 0 ? "swap-out-left" : "swap-out-right";
    var inClass = delta > 0 ? "swap-in-left" : "swap-in-right";
    sc.classList.add(outClass);
    setTimeout(function () {
      state.index = ni;
      render();
      sc.classList.remove(outClass);
      sc.classList.add(inClass);
      setTimeout(function () { sc.classList.remove(inClass); }, 280);
    }, 170);
  }

  /* ---- auto rotation ----------------------------------------------------- */
  function setAuto(on) {
    state.settings.autoRotate = on;
    $("#autoFlag").classList.toggle("on", on);
    clearInterval(state.autoTimer);
    if (on) {
      state.autoTimer = setInterval(function () { go(1); }, Math.max(5, state.settings.interval) * 1000);
    }
  }

  /* ---- gestures + keys --------------------------------------------------- */
  function bindGlobal() {
    $("#prevBtn").addEventListener("click", function () { go(-1); pokeAuto(); });
    $("#nextBtn").addEventListener("click", function () { go(1); pokeAuto(); });

    document.addEventListener("keydown", function (e) {
      if (anySheetOpen()) { if (e.key === "Escape") closeSheets(); return; }
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    });

    // horizontal swipe on the reader; vertical reserved for scrolling
    var sx = 0, sy = 0, t0 = 0, longTimer = null, moved = false;
    var reader = $("#reader");
    reader.addEventListener("touchstart", function (e) {
      var t = e.touches[0]; sx = t.clientX; sy = t.clientY; t0 = Date.now(); moved = false;
      longTimer = setTimeout(function () {
        if (!moved) { setAuto(!state.settings.autoRotate); toast(state.settings.autoRotate ? "Auto-rotation on" : "Auto-rotation paused"); save(); }
      }, 620);
    }, { passive: true });
    reader.addEventListener("touchmove", function (e) {
      var t = e.touches[0];
      if (Math.abs(t.clientX - sx) > 8 || Math.abs(t.clientY - sy) > 8) { moved = true; clearTimeout(longTimer); }
    }, { passive: true });
    reader.addEventListener("touchend", function (e) {
      clearTimeout(longTimer);
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy, dt = Date.now() - t0;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6 && dt < 700) {
        if (dx < 0) go(1); else go(-1);  // swipe left -> next, right -> prev
        pokeAuto();
      }
    }, { passive: true });

    // open sheets
    $("#sectionPick").addEventListener("click", function () { openSheet("#sectionSheet"); });
    $("#openSettings").addEventListener("click", openSettings);
    $("#scrim").addEventListener("click", closeSheets);
    $$("[data-close]").forEach(function (b) { b.addEventListener("click", closeSheets); });
    $("#applyBtn").addEventListener("click", applySettings);

    window.addEventListener("resize", function () { render(); });
    window.addEventListener("orientationchange", function () { setTimeout(render, 120); });
  }
  function pokeAuto() { if (state.settings.autoRotate) setAuto(true); }

  /* ---- sheets ------------------------------------------------------------ */
  function openSheet(sel) { $("#scrim").classList.add("open"); $(sel).classList.add("open"); }
  function anySheetOpen() { return $(".sheet.open") != null; }
  function closeSheets() { $("#scrim").classList.remove("open"); $$(".sheet").forEach(function (s) { s.classList.remove("open"); }); }

  function openSettings() {
    state.draft = Object.assign({}, state.settings);
    syncSettingsUI();
    openSheet("#settingsSheet");
  }

  /* ---- settings UI ------------------------------------------------------- */
  function buildSettings() {
    var body = $("#settingsBody");
    body.innerHTML = "";

    // DISPLAY
    var disp = group("Display");
    var tg = document.createElement("div"); tg.className = "theme-grid";
    THEMES.forEach(function (t) {
      var c = document.createElement("button");
      c.className = "theme-card"; c.setAttribute("data-theme-id", t.id);
      c.innerHTML = '<div class="swatch"><div class="a" style="background:' + t.a + '"></div><div class="b" style="background:' + t.b + '"></div></div><div class="tname">' + esc(t.name) + '</div>';
      c.addEventListener("click", function () {
        state.draft.theme = t.id; applyTheme(t.id); markThemes();
      });
      tg.appendChild(c);
    });
    disp.appendChild(rowCustom("Theme", "Live preview applies on tap.", tg, true));
    disp.appendChild(stepperRow("Arabic font", "Hero Arabic text size.", "arScale"));
    disp.appendChild(stepperRow("Translation font", "English translation size.", "trScale"));
    disp.appendChild(stepperRow("Transliteration font", "Latin transliteration size.", "tlScale"));
    body.appendChild(disp);

    // CONTENT
    var cont = group("Content");
    cont.appendChild(toggleRow("Show transliteration", "Latin reading aid below Arabic.", "showTranslit"));
    cont.appendChild(toggleRow("Show English translation", "Meaning below the Arabic text.", "showTranslation"));
    cont.appendChild(toggleRow("Show source reference", "Surah, ayah or hadith reference.", "showSource"));
    cont.appendChild(toggleRow("Tajweed colouring", "Applies only to verified Quranic markup. No verified markup is bundled in this version, so it stays off.", "tajweed"));
    cont.appendChild(segRow("Auto-rotation", "Advance items automatically.", "autoRotate",
      [["On", true], ["Off", false]]));
    cont.appendChild(segRow("Rotation interval", "Seconds per item when auto-rotation is on.", "interval",
      [["15s", 15], ["25s", 25], ["40s", 40], ["60s", 60]]));
    body.appendChild(cont);

    // PRAYER TIME
    var pr = group("Prayer Time");
    pr.appendChild(toggleRow("Compact prayer ribbon", "Slim next-prayer strip under the top bar.", "showRibbon"));
    pr.appendChild(segRow("City", "Manual city for prayer calculation.", "city",
      [["Auto", "auto"], ["Riyadh", "riyadh"], ["Jeddah", "jeddah"], ["Makkah", "makkah"], ["Madinah", "madinah"], ["Dammam", "dammam"]]));
    body.appendChild(pr);

    // DEVICE MODE
    var dm = group("Device Mode");
    dm.appendChild(segRow("Layout", "Force a layout or follow the screen size.", "deviceMode",
      [["Auto", "auto"], ["Mobile", "mobile"], ["Tablet", "tablet"]]));
    body.appendChild(dm);

    // ABOUT
    var ab = group("About");
    var about = document.createElement("div"); about.className = "about";
    about.innerHTML =
      '<strong>Azkar TV Display — Version 01.</strong> A calm, offline Islamic reading app for phones and tablets. ' +
      'Content shows one remembrance at a time with Arabic as the focus, optional transliteration and translation, and a source reference. ' +
      '<br><br>Every entry carries a source and a verification flag. Sources have not yet been confirmed by a qualified scholar, so treat the content as provisional until reviewed. ' +
      'Tajweed colouring is only enabled where verified markup is available; none is bundled in this version. ' +
      '<br><br>Prayer times use an online calculation when connected and a clearly marked approximate fallback when offline. Online prayer lookups send the chosen city name to a public prayer-times service. ' +
      '<span class="badge">Content review status: pending scholarly review</span>';
    ab.appendChild(about);
    body.appendChild(ab);
  }

  function group(title) {
    var g = document.createElement("div"); g.className = "set-group";
    var h = document.createElement("div"); h.className = "grp-title"; h.textContent = title;
    g.appendChild(h); return g;
  }
  function rowCustom(name, desc, control, stacked) {
    var r = document.createElement("div"); r.className = "set-row";
    if (stacked) r.style.flexDirection = "column", r.style.alignItems = "stretch";
    var lab = document.createElement("div"); lab.className = "label";
    lab.innerHTML = '<div class="name">' + esc(name) + '</div>' + (desc ? '<div class="desc">' + esc(desc) + '</div>' : "");
    r.appendChild(lab);
    if (stacked) control.style.marginTop = "12px";
    r.appendChild(control); return r;
  }
  function toggleRow(name, desc, key) {
    var sw = document.createElement("label"); sw.className = "switch";
    var inp = document.createElement("input"); inp.type = "checkbox"; inp.setAttribute("data-key", key);
    var tr = document.createElement("span"); tr.className = "track";
    inp.addEventListener("change", function () { state.draft[key] = inp.checked; });
    sw.appendChild(inp); sw.appendChild(tr);
    return rowCustom(name, desc, sw, false);
  }
  function segRow(name, desc, key, opts) {
    var seg = document.createElement("div"); seg.className = "seg"; seg.setAttribute("data-seg", key);
    opts.forEach(function (o) {
      var b = document.createElement("button"); b.textContent = o[0]; b.setAttribute("data-val", JSON.stringify(o[1]));
      b.addEventListener("click", function () {
        state.draft[key] = o[1];
        $$("button", seg).forEach(function (x) { x.classList.remove("active"); });
        b.classList.add("active");
      });
      seg.appendChild(b);
    });
    return rowCustom(name, desc, seg, false);
  }
  function stepperRow(name, desc, key) {
    var st = document.createElement("div"); st.className = "stepper";
    var minus = document.createElement("button"); minus.textContent = "−"; minus.setAttribute("aria-label", name + " smaller");
    var val = document.createElement("span"); val.className = "val"; val.setAttribute("data-val", key);
    var plus = document.createElement("button"); plus.textContent = "+"; plus.setAttribute("aria-label", name + " larger");
    function clamp(v) { return Math.min(2.0, Math.max(0.7, Math.round(v * 100) / 100)); }
    minus.addEventListener("click", function () { state.draft[key] = clamp(state.draft[key] - 0.1); val.textContent = pct(state.draft[key]); applyTheme(state.draft.theme); previewFonts(); });
    plus.addEventListener("click", function () { state.draft[key] = clamp(state.draft[key] + 0.1); val.textContent = pct(state.draft[key]); applyTheme(state.draft.theme); previewFonts(); });
    st.appendChild(minus); st.appendChild(val); st.appendChild(plus);
    return rowCustom(name, desc, st, false);
  }
  function pct(v) { return Math.round(v * 100) + "%"; }

  // Live preview of font changes while the sheet is open
  function previewFonts() {
    var saved = state.settings; state.settings = state.draft; render(); state.settings = saved;
  }

  function syncSettingsUI() {
    markThemes();
    $$("input[type=checkbox][data-key]").forEach(function (i) { i.checked = !!state.draft[i.getAttribute("data-key")]; });
    $$(".seg[data-seg]").forEach(function (seg) {
      var key = seg.getAttribute("data-seg");
      $$("button", seg).forEach(function (b) {
        b.classList.toggle("active", JSON.stringify(state.draft[key]) === b.getAttribute("data-val"));
      });
    });
    $$(".val[data-val]").forEach(function (v) { v.textContent = pct(state.draft[v.getAttribute("data-val")]); });
  }
  function markThemes() {
    $$(".theme-card").forEach(function (c) { c.classList.toggle("active", c.getAttribute("data-theme-id") === state.draft.theme); });
  }

  function applySettings() {
    state.settings = Object.assign({}, state.draft);
    save();
    applyTheme(state.settings.theme);
    $("#prayerRibbon").classList.toggle("hide", !state.settings.showRibbon);
    setAuto(state.settings.autoRotate);
    setupPrayer();
    render();
    closeSheets();
    toast("Settings saved");
  }

  /* ---- prayer ribbon ----------------------------------------------------- */
  function setupPrayer() {
    var s = state.settings;
    $("#prayerRibbon").classList.toggle("hide", !s.showRibbon);
    if (!s.showRibbon) return;
    var city = s.city === "auto" ? "riyadh" : s.city;
    $("#prayerCity").textContent = CITY_LABEL[s.city] || "Riyadh";
    // try online (HTTPS), method 4 = Umm al-Qura
    var online = navigator.onLine;
    if (online) {
      var url = "https://api.aladhan.com/v1/timingsByCity?city=" + encodeURIComponent(CITY_LABEL[city] || "Riyadh") +
                "&country=Saudi%20Arabia&method=4";
      fetch(url).then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.data && j.data.timings) { showPrayer(trim5(j.data.timings), false); }
        else showPrayer(APPROX[city], true);
      }).catch(function () { showPrayer(APPROX[city], true); });
    } else {
      showPrayer(APPROX[city], true);
    }
  }
  function trim5(t) { return { Fajr: t.Fajr, Dhuhr: t.Dhuhr, Asr: t.Asr, Maghrib: t.Maghrib, Isha: t.Isha }; }
  function showPrayer(timings, approx) {
    if (!timings) return;
    var order = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
    var now = new Date(); var nowMin = now.getHours() * 60 + now.getMinutes();
    var next = null;
    for (var i = 0; i < order.length; i++) {
      var p = timings[order[i]]; if (!p) continue;
      var hm = p.split(":"); var m = parseInt(hm[0], 10) * 60 + parseInt(hm[1], 10);
      if (m >= nowMin) { next = { name: order[i], time: p }; break; }
    }
    if (!next) next = { name: "Fajr", time: timings.Fajr };
    $("#prayerNext").textContent = next.name;
    $("#prayerTime").textContent = next.time;
    $("#prayerApprox").style.display = approx ? "inline-block" : "none";
  }

  /* ---- restore position -------------------------------------------------- */
  function restorePosition() {
    try {
      var p = JSON.parse(localStorage.getItem(LS_POS) || "null");
      if (p && p.section) { state.settings.section = p.section; state.index = p.index || 0; }
    } catch (e) {}
    $("#prayerRibbon").classList.toggle("hide", !state.settings.showRibbon);
    setAuto(state.settings.autoRotate);
  }

  /* ---- utils ------------------------------------------------------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  var toastTimer = null;
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  // Native back button hook (closes an open sheet before exiting)
  window.onTvBack = function () {
    if (anySheetOpen()) { closeSheets(); return true; }
    return false;
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
