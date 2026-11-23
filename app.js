/* Lotto Lab app. Generic over two games; all text through t(). */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k) { try { return localStorage.getItem("ll." + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem("ll." + k, v); } catch (e) {} },
    getJ(k, d) { try { const v = JSON.parse(this.get(k)); return v == null ? d : v; } catch (e) { return d; } },
    setJ(k, v) { this.set(k, JSON.stringify(v)); }
  };

  /* ---------------- games ---------------- */
  const GAMES = {
    lotto: {
      id: "lotto", name: "Lotto 6aus49", n: 49, k: 6, en: 10, ek: 1, emin: 0, price: 1.2,
      extraKey: "sz", cols: 7,
      classes: [[6,1],[6,0],[5,1],[5,0],[4,1],[4,0],[3,1],[3,0],[2,1]],
      quota: [null, 1000000, 10000, 4000, 150, 50, 17, 11, 6],
      jackpot: 10000000, jackpotMax: 50000000, sold: 30000000, real: true
    },
    ej: {
      id: "ej", name: "Eurojackpot", n: 50, k: 5, en: 12, ek: 2, emin: 1, price: 2,
      extraKey: "ez", cols: 10,
      classes: [[5,2],[5,1],[5,0],[4,2],[4,1],[4,0],[3,2],[2,2],[3,1],[3,0],[1,2],[2,1]],
      quota: [null, 470000, 150000, 6800, 340, 160, 120, 26, 20, 19, 12, 9.5],
      jackpot: 10000000, jackpotMax: 120000000, sold: 30000000, real: false
    }
  };
  const PER_YEAR = 104;

  /* ---------------- state ---------------- */
  let lang = store.get("lang") || "ar";
  let gameId = store.get("game") || "lotto";
  if (!GAMES[gameId]) gameId = "lotto";
  const G = () => GAMES[gameId];
  let tickets = store.getJ("tickets", {});
  let sel = store.getJ("sel", {});
  function myTickets() {
    if (!Array.isArray(tickets[gameId]) || !tickets[gameId].length) {
      tickets[gameId] = gameId === "lotto" ? [{ main: [3, 7, 12, 18, 24, 29], extra: [5] }] : [{ main: [4, 11, 23, 37, 45], extra: [3, 9] }];
    }
    return tickets[gameId];
  }
  function selIdx() { const i = sel[gameId] || 0; return Math.min(i, myTickets().length - 1); }
  function cur() { return myTickets()[selIdx()]; }
  function saveTickets() { store.setJ("tickets", tickets); store.setJ("sel", sel); }
  const complete = tk => tk && tk.main.length === G().k && tk.extra.length === G().ek;

  /* ---------------- text & numbers ---------------- */
  function t(key, vars) {
    const d = window.I18N;
    let s = (d[lang] && d[lang][key]) != null ? d[lang][key] : (d.ar[key] != null ? d.ar[key] : key);
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, x) => (vars[x] != null ? vars[x] : ""));
    return s;
  }
  const loc = () => (lang === "de" ? "de-DE" : "en-US");
  const fmt = (n, d = 0) => Number(n).toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = (n, d = 0) => "\u2066" + fmt(n, d) + " €\u2069";
  const oneIn = x => t("oneIn", { x: "\u2066" + fmt(x) + "\u2069" });
  const pct = (x, d = 1) => fmt(x * 100, d) + "%";
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const isRTL = () => lang === "ar";

  /* ---------------- math ---------------- */
  function C(n, k) { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
  function pMain(g, m) { return C(g.k, m) * C(g.n - g.k, g.k - m) / C(g.n, g.k); }
  function pExtra(g, e) { return C(g.ek, e) * C(g.en - g.ek, g.ek - e) / C(g.en, g.ek); }
  function classProb(g, i) { const [m, e] = g.classes[i]; return pMain(g, m) * pExtra(g, e); }
  function classOf(g, m, e) { return g.classes.findIndex(c => c[0] === m && c[1] === e); }
  const jackpotOdds = g => 1 / classProb(g, 0);
  function randomK(n, k, min) {
    const a = [], seen = new Uint8Array(n + min + 1);
    while (a.length < k) { const x = min + Math.floor(Math.random() * n); if (!seen[x]) { seen[x] = 1; a.push(x); } }
    return a.sort((x, y) => x - y);
  }
  const drawOnce = g => ({ main: randomK(g.n, g.k, 1), extra: randomK(g.en, g.ek, g.emin) });
  const countHits = (a, b) => a.filter(x => b.includes(x)).length;
  function maxRun(a) { let r = 1, m = 1; for (let i = 1; i < a.length; i++) { r = a[i] === a[i - 1] + 1 ? r + 1 : 1; m = Math.max(m, r); } return m; }
  // regularized lower incomplete gamma P(a,x)
  function gammaln(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp); let s = 1.000000000190015; for (const ci of c) s += ci / ++y; return -tmp + Math.log(2.5066282746310005 * s / x); }
  function gammaP(a, x) {
    if (x <= 0) return 0;
    if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break; } return sum * Math.exp(-x + a * Math.log(x) - gammaln(a)); }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break; }
    return 1 - Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
  }

  /* ---------------- smart ticket & popularity ---------------- */
  function smartTicket(g) {
    for (let tries = 0; tries < 5000; tries++) {
      const a = randomK(g.n, g.k, 1);
      const high = a.filter(n => n > 31).length;
      const cols = new Set(a.map(n => (n - 1) % g.cols)).size, rows = new Set(a.map(n => Math.floor((n - 1) / g.cols))).size;
      const digits = new Set(a.map(n => n % 10)).size;
      if (high >= Math.ceil(g.k / 2) && maxRun(a) <= 2 && cols >= g.k - 2 && rows >= g.k - 2 && digits >= g.k - 1) return { main: a, extra: randomK(g.en, g.ek, g.emin) };
    }
    return drawOnce(g);
  }
  function popularity(g, tk) {
    const a = tk.main.slice().sort((x, y) => x - y), reasons = [];
    let f = 1;
    const b = a.filter(n => n <= 31).length, expB = g.k * 31 / g.n;
    f *= Math.pow(1.35, b - expB);
    if (b === g.k) reasons.push(t("popBirthday"));
    if (a.every(n => n <= 12)) { f *= 3; reasons.push(t("popMonths")); }
    const run = maxRun(a);
    if (run >= 3) { f *= Math.pow(4, run - 2); reasons.push(t("popRun", { n: run })); }
    const diffs = a.slice(1).map((x, i) => x - a[i]);
    if (diffs.every(d => d === diffs[0])) { f *= 40; reasons.push(t("popArith")); }
    const rows = new Set(a.map(n => Math.floor((n - 1) / g.cols))).size, cols = new Set(a.map(n => (n - 1) % g.cols)).size;
    if (rows === 1 || cols === 1) { f *= 15; reasons.push(t("popLine")); }
    else if (rows <= 2 || cols <= 2) { f *= 2.5; reasons.push(t("popCluster")); }
    if (a.includes(7)) f *= 1.15;
    if (a.includes(13)) f *= 0.85;
    const last = lastReal();
    if (g.real && last && countHits(a, last.main) === g.k) { f *= 25; reasons.push(t("popLastDraw")); }
    const high = a.filter(n => n > 31).length;
    if (high >= Math.ceil(g.k / 2) && run <= 2) reasons.push(t("popGood"));
    f = Math.max(0.3, Math.min(f, 500));
    const lambda = g.sold * f * classProb(g, 0);
    const share = lambda > 1e-9 ? (1 - Math.exp(-lambda)) / lambda : 1;
    const level = f < 0.9 ? "low" : f < 2 ? "mid" : "high";
    return { f, share, others: lambda, level, reasons };
  }

  /* ---------------- real data ---------------- */
  let REAL = null;
  function parseCompact(raw) {
    const out = [], base = Date.UTC(1955, 0, 1);
    for (let i = 0; i + 16 <= raw.length; i += 16) {
      const days = parseInt(raw.substr(i, 3), 36);
      const main = []; for (let j = 0; j < 6; j++) main.push(+raw.substr(i + 3 + j * 2, 2));
      const z = raw[i + 15];
      out.push({ date: new Date(base + days * 864e5), main, sz: z === "-" ? null : +z });
    }
    return out;
  }
  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/).slice(1), out = [];
    for (const l of lines) {
      const p = l.split(","); if (p.length < 7) continue;
      const main = p.slice(1, 7).map(Number).sort((a, b) => a - b);
      if (main.some(n => !(n >= 1 && n <= 49))) continue;
      const [y, m, d] = p[0].split("-").map(Number);
      out.push({ date: new Date(Date.UTC(y, m - 1, d)), main, sz: p[7] === "" || p[7] == null ? null : +p[7] });
    }
    return out;
  }
  function loadReal() {
    const cached = store.get("realcsv");
    if (cached) { try { const r = parseCSV(cached); if (r.length > window.LOTTO_DATA.count) { REAL = r; return; } } catch (e) {} }
    REAL = parseCompact(window.LOTTO_DATA.raw);
  }
  const lastReal = () => (REAL && REAL.length ? REAL[REAL.length - 1] : null);
  const fmtDate = d => d.toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : loc(), { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

  /* ---------------- UI helpers ---------------- */
  const ball = (n, cls = "") => `<span class="ball ${cls}">${n}</span>`;
  function ticketBalls(tk, drawn) {
    const d = drawn || { main: [], extra: [] };
    return tk.main.map(n => ball(n, d.main.includes(n) ? "hit" : "")).join("") + tk.extra.map(n => ball(n, "x" + (d.extra.includes(n) ? " hit" : ""))).join("");
  }
  const card = (inner, id, cls = "") => `<section class="card ${cls}" ${id ? `id="${id}"` : ""}>${inner}</section>`;
  const tile = (label, value, cls = "") => `<div class="tile ${cls}"><span class="small">${label}</span><b>${value}</b></div>`;
  function classLabel(g, i) { const [m, e] = g.classes[i]; return e ? t(g.extraKey === "sz" ? "clsSZ" : "clsEZ", { m, e }) : t("clsPlain", { m }); }
  function setupCanvas(c) {
    const w = c.clientWidth; if (!w) return null;
    const h = +c.dataset.h, dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = h * dpr; c.style.height = h + "px";
    const ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  const cssv = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function freqChart(canvas, freq, n, expected, highlight) {
    const s = setupCanvas(canvas); if (!s) return;
    const { ctx, w, h } = s, rtl = isRTL();
    let mx = 0; for (let i = 1; i <= n; i++) mx = Math.max(mx, freq[i]);
    const top = 8, bottom = h - 20, yMax = Math.max(mx, expected) * 1.08, left = 4, right = w - 4, bw = (right - left) / n;
    const y = v => bottom - (bottom - top) * v / yMax;
    ctx.strokeStyle = cssv("--line"); [0, .5, 1].forEach(f => { const Y = y(yMax * f); ctx.beginPath(); ctx.moveTo(left, Y); ctx.lineTo(right, Y); ctx.stroke(); });
    ctx.font = "11px " + cssv("--body");
    for (let i = 1; i <= n; i++) {
      const X = rtl ? right - i * bw : left + (i - 1) * bw;
      const hl = highlight && highlight(i);
      ctx.fillStyle = hl === "hot" ? cssv("--accent") : hl === "cold" ? cssv("--muted") : cssv("--ball");
      ctx.fillRect(X + bw * .15, y(freq[i]), bw * .7, bottom - y(freq[i]));
      if (i === 1 || i % 10 === 0 || i === n) { ctx.fillStyle = cssv("--muted"); ctx.textAlign = "center"; ctx.fillText(String(i), X + bw / 2, h - 5); }
    }
    ctx.strokeStyle = cssv("--accent"); ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(left, y(expected)); ctx.lineTo(right, y(expected)); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
  }
  function hbarChart(canvas, items, max, ref) {
    const s = setupCanvas(canvas); if (!s) return;
    const { ctx, w, h } = s, rtl = isRTL(), font = cssv("--body");
    const labelW = 86, top = 6, rowH = (h - 30) / items.length;
    const a0 = rtl ? w - labelW - 6 : labelW + 6, a1 = rtl ? 36 : w - 36;
    const x = v => a0 + (a1 - a0) * (v / max);
    ctx.font = "11px " + font; ctx.strokeStyle = cssv("--line"); ctx.fillStyle = cssv("--muted"); ctx.textAlign = "center";
    for (let i = 0; i <= 4; i++) { const v = max * i / 4, X = x(v); ctx.beginPath(); ctx.moveTo(X, top); ctx.lineTo(X, h - 20); ctx.stroke(); ctx.fillText(fmt(v, 2), X, h - 5); }
    items.forEach((it, i) => {
      const yy = top + i * rowH + rowH * .2, bh = rowH * .6;
      ctx.fillStyle = cssv("--ball"); const xa = x(0), xb = x(it.v); ctx.fillRect(Math.min(xa, xb), yy, Math.abs(xb - xa), bh);
      ctx.fillStyle = cssv("--ink"); ctx.font = "12px " + font; ctx.textAlign = rtl ? "right" : "left";
      ctx.fillText(it.label, rtl ? w - 2 : 2, yy + bh / 2 + 4);
      ctx.fillStyle = cssv("--muted"); ctx.font = "11px " + font; ctx.textAlign = rtl ? "right" : "left";
      ctx.fillText(fmt(it.v, 3), xb + (rtl ? -4 : 4), yy + bh / 2 + 4);
    });
    if (ref != null) { ctx.strokeStyle = cssv("--accent"); ctx.lineWidth = 2; ctx.setLineDash([5, 4]); const X = x(ref); ctx.beginPath(); ctx.moveTo(X, top); ctx.lineTo(X, h - 20); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1; }
  }

  /* ---------------- navigation ---------------- */
  const VIEWS = ["home", "ticket", "real", "lab", "calc"];
  let view = "home";
  const rendered = {};
  function show(v, anchor) {
    if (!VIEWS.includes(v)) v = "home";
    view = v;
    $$(".view").forEach(s => s.classList.toggle("active", s.id === "v-" + v));
    $$("nav.tabs button").forEach(b => b.toggleAttribute("aria-current", false));
    const nb = $(`nav.tabs button[data-view="${v}"]`); if (nb) nb.setAttribute("aria-current", "page");
    if (!rendered[v]) { RENDER[v](); rendered[v] = true; }
    afterShow[v] && afterShow[v]();
    if (anchor) { const el = document.getElementById(anchor); if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 30); }
    else window.scrollTo(0, 0);
  }
  function go(v, anchor) { if (location.hash === "#" + v) show(v, anchor); else { pendingAnchor = anchor; location.hash = v; } }
  let pendingAnchor = null;
  window.addEventListener("hashchange", () => { const a = pendingAnchor; pendingAnchor = null; show(location.hash.slice(1), a); });
  function rerenderAll() { for (const v of VIEWS) rendered[v] = false; applyChrome(); show(view); }

  function applyChrome() {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL() ? "rtl" : "ltr";
    document.title = t("appName");
    $("#appTitle").textContent = t("appName");
    $("#gameSel").innerHTML = Object.values(GAMES).map(g => `<option value="${g.id}" ${g.id === gameId ? "selected" : ""}>${g.name}</option>`).join("");
    $("#langSel").value = lang;
    $("#gameSel").setAttribute("aria-label", t("game"));
    $("#langSel").setAttribute("aria-label", t("language"));
    $$("nav.tabs button").forEach(b => { $("span", b).textContent = t("nav_" + b.dataset.view); });
  }

  /* ================= HOME ================= */
  const RENDER = {}, afterShow = {};
  RENDER.home = function () {
    const g = G(), last = g.real ? lastReal() : null, tk = cur();
    const tools = [
      ["ticket", "picker", "toolTicket", "toolTicketD"],
      ["ticket", "pop", "toolPop", "toolPopD"],
      ["real", "timemachine", "toolTime", "toolTimeD"],
      ["real", "tests", "toolTests", "toolTestsD"],
      ["lab", "compare", "toolCompare", "toolCompareD"],
      ["lab", "topnums", "toolTop", "toolTopD"],
      ["lab", "untilwin", "toolWin", "toolWinD"],
      ["lab", "intuition", "toolIntu", "toolIntuD"],
      ["calc", "ev", "toolEV", "toolEVD"],
      ["calc", "checker", "toolCheck", "toolCheckD"],
      ["calc", "system", "toolSystem", "toolSystemD"],
      ["calc", "invest", "toolInvest", "toolInvestD"],
      ["calc", "budget", "toolBudget", "toolBudgetD"]
    ];
    let html = card(`<h2>${t("homeTitle")}</h2><p class="muted">${t("homeIntro", { game: g.name })}</p>
      <div class="tiles">${tile(t("jackpotOdds"), oneIn(jackpotOdds(g)))}${tile(t("pricePerTip"), eur(g.price, 2))}${tile(t("payoutShare"), "50%")}</div>`);
    if (last) {
      const m = complete(tk) ? countHits(tk.main, last.main) : 0;
      html += card(`<div class="row between"><h2>${t("lastDraw")}</h2><span class="small">${fmtDate(last.date)}</span></div>
        <div class="balls">${last.main.map(n => ball(n, tk.main.includes(n) ? "hit" : "")).join("")}${last.sz != null ? ball(last.sz, "x" + (tk.extra[0] === last.sz ? " hit" : "")) : ""}</div>
        <p class="small">${complete(tk) ? t("lastDrawYou", { m }) : t("pickFirst")}</p>`);
    } else if (!g.real) {
      html += card(`<p class="small">${t("ejNoReal")}</p>`);
    }
    html += `<div class="toolgrid">${tools.filter(x => g.real || x[0] !== "real").map(([v, a, k, d]) => `<button class="toolbtn" data-go="${v}" data-anchor="${a}"><b>${t(k)}</b><span>${t(d)}</span></button>`).join("")}</div>`;
    html += card(`<p class="small">${t("honest")}</p>`, null, "note");
    $("#v-home").innerHTML = html;
    $$("#v-home [data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go, b.dataset.anchor)));
  };

  /* ================= TICKET ================= */
  let tally = null;
  RENDER.ticket = function () {
    const g = G();
    tally = tally && tally.g === gameId ? tally : { g: gameId, n: 0, best: 0, cls: new Array(g.classes.length).fill(0) };
    let html = card(`<div class="row between"><h2>${t("myTicket")}</h2><span class="small" id="pickStatus"></span></div>
      <div class="grid" id="gridMain" style="--cols:${g.cols}" role="group" aria-label="${t("pickMain", { k: g.k, n: g.n })}"></div>
      <span class="small">${t(g.extraKey === "sz" ? "pickSZ" : "pickEZ")}</span>
      <div class="grid small-balls" id="gridExtra" style="--cols:${g.en}" role="group"></div>
      <div class="row"><button class="btn ghost f1" id="bRandom">${t("random")}</button><button class="btn ghost f1" id="bSmart">${t("smart")}</button><button class="btn ghost f1" id="bClear">${t("clear")}</button></div>
      <p class="small">${t("smartNote")}</p>`, "picker");
    html += card(`<div class="row between"><h2>${t("myTickets")}</h2><button class="btn ghost sm" id="bAdd">${t("addTicket")}</button></div><div id="ticketList" class="tlist"></div>`, "tickets");
    html += card(`<h2>${t("popTitle")}</h2><div id="popBox"></div>`, "pop");
    html += card(`<h2>${t("demoDraw")}</h2><div class="balls big" id="drawBalls" aria-live="polite"></div>
      <p class="muted" id="drawMsg">${t("demoIntro", { n: g.n, k: g.k })}</p>
      <button class="btn primary block" id="bDraw">${t("drawNow")}</button><div class="tiles" id="drawTally"></div>`, "demo");
    $("#v-ticket").innerHTML = html;

    const gm = $("#gridMain"), ge = $("#gridExtra");
    for (let n = 1; n <= g.n; n++) gm.insertAdjacentHTML("beforeend", `<button data-n="${n}">${n}</button>`);
    for (let n = g.emin; n < g.emin + g.en; n++) ge.insertAdjacentHTML("beforeend", `<button data-n="${n}">${n}</button>`);
    gm.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; toggle(cur().main, +b.dataset.n, g.k); });
    ge.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return; const n = +b.dataset.n, tk = cur();
      if (g.ek === 1) tk.extra = [n]; else toggle(tk.extra, n, g.ek, true);
      changed();
    });
    function toggle(arr, n, max, noChange) {
      const i = arr.indexOf(n);
      if (i >= 0) arr.splice(i, 1); else if (arr.length < max) { arr.push(n); arr.sort((a, b) => a - b); }
      if (!noChange) changed();
    }
    $("#bRandom").onclick = () => { Object.assign(cur(), drawOnce(g)); changed(); };
    $("#bSmart").onclick = () => { Object.assign(cur(), smartTicket(g)); changed(); };
    $("#bClear").onclick = () => { cur().main = []; cur().extra = []; changed(); };
    $("#bAdd").onclick = () => { const l = myTickets(); if (l.length >= 12) return; l.push({ main: [], extra: [] }); sel[gameId] = l.length - 1; changed(); };
    $("#bDraw").onclick = demoDraw;
    paintTicket(); paintTally();
  };
  function changed() { saveTickets(); rendered.home = false; paintTicket(); }
  function paintTicket() {
    const g = G(), tk = cur();
    $$("#gridMain button").forEach(b => b.setAttribute("aria-pressed", String(tk.main.includes(+b.dataset.n))));
    $$("#gridExtra button").forEach(b => b.setAttribute("aria-pressed", String(tk.extra.includes(+b.dataset.n))));
    const ok = complete(tk), st = $("#pickStatus");
    st.textContent = ok ? t("ready") : t("pickedOf", { a: tk.main.length, k: g.k, b: tk.extra.length, e: g.ek });
    st.classList.toggle("err", !ok);
    $("#bDraw").disabled = !ok;
    const l = myTickets();
    $("#ticketList").innerHTML = l.map((x, i) => `<div class="trow ${i === selIdx() ? "on" : ""}">
      <button class="tsel" data-i="${i}" aria-label="${t("editTicket")} ${i + 1}"><span class="tnum">${i + 1}</span><span class="balls">${complete(x) ? ticketBalls(x) : `<span class="small err">${t("incomplete")}</span>`}</span></button>
      ${l.length > 1 ? `<button class="tdel" data-i="${i}" aria-label="${t("delete")}">✕</button>` : ""}</div>`).join("");
    $$("#ticketList .tsel").forEach(b => b.onclick = () => { sel[gameId] = +b.dataset.i; saveTickets(); paintTicket(); });
    $$("#ticketList .tdel").forEach(b => b.onclick = () => { l.splice(+b.dataset.i, 1); sel[gameId] = Math.max(0, Math.min(selIdx(), l.length - 1)); changed(); });
    // popularity
    if (!ok) { $("#popBox").innerHTML = `<p class="small">${t("pickFirst")}</p>`; return; }
    const p = popularity(g, tk);
    const meter = Math.min(1, Math.log10(p.f * 10) / Math.log10(5000));
    $("#popBox").innerHTML = `<div class="meter"><div style="width:${(meter * 100).toFixed(0)}%" class="lv-${p.level}"></div></div>
      <div class="tiles">${tile(t("popLevel"), t("lv_" + p.level))}${tile(t("popFactor"), "× " + fmt(p.f, p.f < 10 ? 1 : 0))}${tile(t("popShare"), pct(p.share, 0))}</div>
      <p class="small">${t("popExplain", { sold: fmt(g.sold / 1e6) })}</p>
      ${p.reasons.length ? `<ul class="reasons">${p.reasons.map(r => `<li>${r}</li>`).join("")}</ul>` : ""}
      <p class="small">${t("popDisclaimer")}</p>`;
  }
  function paintTally() {
    if (!$("#drawTally")) return;
    $("#drawTally").innerHTML = tile(t("draws"), fmt(tally.n)) + tile(t("best"), tally.best + " / " + G().k) + tile(t("paid"), eur(tally.n * G().price, 2));
  }
  let drawing = false;
  function demoDraw() {
    const g = G(), tk = cur(); if (drawing || !complete(tk)) return; drawing = true;
    const btn = $("#bDraw"); btn.disabled = true;
    const d = drawOnce(g), box = $("#drawBalls"); box.innerHTML = "";
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = d.main.map(n => ball(n, "pop" + (tk.main.includes(n) ? " hit" : ""))).concat(d.extra.map(n => ball(n, "pop x" + (tk.extra.includes(n) ? " hit" : ""))));
    let i = 0;
    (function step() {
      if (i < items.length) { box.insertAdjacentHTML("beforeend", items[i++]); reduce ? step() : setTimeout(step, 300); return; }
      const m = countHits(tk.main, d.main), e = countHits(tk.extra, d.extra), ci = classOf(g, m, e);
      tally.n++; tally.best = Math.max(tally.best, m); if (ci >= 0) tally.cls[ci]++;
      let msg = t("demoResult", { m, k: g.k, e, ek: g.ek });
      if (ci === 0) msg = t("demoJackpot", { odds: fmt(jackpotOdds(g)) });
      else if (ci > 0) msg += " " + t("demoWin", { cls: ci + 1, q: eur(g.quota[ci]) });
      else msg += " " + t("demoNoWin");
      $("#drawMsg").textContent = msg;
      paintTally(); drawing = false; btn.disabled = false;
    })();
  }

  /* ================= REAL DATA ================= */
  let realCache = null;
  function realStats() {
    if (realCache && realCache.len === REAL.length) return realCache;
    const N = REAL.length, freq = new Float64Array(50);
    let consec = 0;
    for (const d of REAL) { for (const n of d.main) freq[n]++; if (maxRun(d.main) >= 2) consec++; }
    const exp = N * 6 / 49; let chi = 0; for (let n = 1; n <= 49; n++) chi += (freq[n] - exp) ** 2 / exp;
    const p = 1 - gammaP(24, chi / 2);
    // backtests on real draws, window 100
    const W = 100, win = new Int32Array(50), last = new Int32Array(50).fill(-1);
    const sums = { hot: 0, cold: 0, due: 0, repeat: 0, rand: 0 }; let M = 0;
    const pick = (score) => { const tk = new Uint8Array(50), o = []; for (let k = 0; k < 6; k++) { let b = -1, bv = -Infinity; for (let n = 1; n <= 49; n++) if (!tk[n] && score(n) > bv) { bv = score(n); b = n; } tk[b] = 1; o.push(b); } return o; };
    for (let i = 0; i < N; i++) {
      const d = REAL[i];
      if (i >= W) {
        const jit = new Float64Array(50).map(() => Math.random() * .5);
        const hot = pick(n => win[n] + jit[n]), cold = pick(n => -win[n] + jit[n]), due = pick(n => (i - last[n]) + jit[n]);
        sums.hot += countHits(hot, d.main); sums.cold += countHits(cold, d.main); sums.due += countHits(due, d.main);
        sums.repeat += countHits(REAL[i - 1].main, d.main); sums.rand += countHits(randomK(49, 6, 1), d.main); M++;
      }
      for (const n of d.main) { win[n]++; last[n] = i; }
      if (i >= W) for (const n of REAL[i - W].main) win[n]--;
    }
    const seen = new Map(), repeats = [];
    for (const d of REAL) { const k = d.main.join("-"); if (seen.has(k)) repeats.push([seen.get(k), d]); else seen.set(k, d); }
    const order = [...Array(49)].map((_, i) => i + 1).sort((a, b) => freq[b] - freq[a]);
    realCache = { len: N, N, freq, exp, chi, p, consec, M, sums, repeats, order };
    return realCache;
  }
  RENDER.real = function () {
    const g = G();
    if (!g.real) {
      $("#v-real").innerHTML = card(`<h2>${t("realTitle")}</h2><p class="muted">${t("ejNoReal")}</p><button class="btn primary" id="bToLotto">${t("switchLotto")}</button>`);
      $("#bToLotto").onclick = () => setGame("lotto");
      return;
    }
    const s = realStats(), first = REAL[0].date, last = lastReal();
    const se = Math.sqrt(6 * (6 / 49) * (43 / 49) * (43 / 48) / s.M), ex = 36 / 49;
    let html = card(`<h2>${t("realTitle")}</h2>
      <p class="muted">${t("realIntro", { n: fmt(s.N), a: fmtDate(first), b: fmtDate(last.date) })}</p>
      <div class="row"><button class="btn ghost sm" id="bUpdate">${t("updateData")}</button><span class="small" id="updMsg"></span></div>
      <p class="small">${t("realSource")}</p>`, "archive");
    html += card(`<h2>${t("lastDraws")}</h2><div class="draws">${REAL.slice(-6).reverse().map(d => `<div class="drow"><span class="small">${fmtDate(d.date)}</span><span class="balls">${d.main.map(n => ball(n, cur().main.includes(n) ? "hit" : "")).join("")}${d.sz != null ? ball(d.sz, "x") : ""}</span></div>`).join("")}</div>`);
    html += card(`<h2>${t("timeTitle")}</h2><p class="small">${t("timeIntro")}</p>
      <div class="seg" role="group" id="tmRange">
        <button data-y="0" aria-pressed="true">${t("since1955")}</button><button data-y="30" aria-pressed="false">${t("lastYears", { y: 30 })}</button><button data-y="10" aria-pressed="false">${t("lastYears", { y: 10 })}</button>
      </div><div id="tmOut"></div>`, "timemachine");
    html += card(`<h2>${t("testsTitle")}</h2>
      <div class="test"><h3>${t("chiTitle")}</h3><p class="small">${t("chiText", { chi: fmt(s.chi, 1), p: fmt(s.p, 2) })}</p>
        <span class="pill ${s.p > 0.05 ? "ok" : "warn"}">${s.p > 0.05 ? t("chiOk") : t("chiWarn")}</span></div>
      <div class="test"><h3>${t("btTitle")}</h3><p class="small">${t("btText", { m: fmt(s.M) })}</p>
        <canvas id="btChart" data-h="200"></canvas>
        <p class="small">${t("btNote", { ex: fmt(ex, 3), lo: fmt(ex - 2 * se, 3), hi: fmt(ex + 2 * se, 3) })}</p></div>
      <div class="test"><h3>${t("consecTitle")}</h3>
        <div class="tiles">${tile(t("consecReal"), pct(s.consec / s.N))}${tile(t("consecTheory"), pct(1 - C(44, 6) / C(49, 6)), "ref")}</div>
        <p class="small">${t("consecText")}</p></div>`, "tests");
    html += card(`<h2>${t("realFreqTitle")}</h2><canvas id="realFreq" data-h="200"></canvas>
      <p class="small">${t("realFreqNote", { exp: fmt(s.exp) })}</p>
      <div class="row"><span class="small">${t("mostDrawn")}</span><div class="balls">${s.order.slice(0, 6).map(n => ball(n, "hot")).join("")}</div></div>
      <div class="row"><span class="small">${t("leastDrawn")}</span><div class="balls">${s.order.slice(-6).reverse().map(n => ball(n, "cold")).join("")}</div></div>
      <p class="small">${t("realFreqSpread", { a: s.order[0], fa: fmt(s.freq[s.order[0]]), b: s.order[48], fb: fmt(s.freq[s.order[48]]), d: fmt((s.freq[s.order[0]] - s.freq[s.order[48]]) / s.N * 100, 2) })}</p>`, "realfreq");
    html += card(`<h2>${t("repeatTitle")}</h2><p class="small">${s.repeats.length ? t("repeatYes") : t("repeatNo")}</p>
      ${s.repeats.map(([a, b]) => `<div class="drow"><span class="balls">${a.main.map(n => ball(n)).join("")}</span><span class="small">${fmtDate(a.date)} · ${fmtDate(b.date)}</span></div>`).join("")}
      <p class="small">${t("repeatMath")}</p>`);
    $("#v-real").innerHTML = html;
    $$("#tmRange button").forEach(b => b.onclick = () => { $$("#tmRange button").forEach(x => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); timeMachine(+b.dataset.y); });
    $("#bUpdate").onclick = updateData;
    timeMachine(0);
  };
  afterShow.real = function () {
    if (!G().real || !REAL) return;
    const s = realStats(), ex = 36 / 49;
    const items = [["btHot", "hot"], ["btCold", "cold"], ["btDue", "due"], ["btRepeat", "repeat"], ["btRandom", "rand"]].map(([k, f]) => ({ label: t(k), v: s.sums[f] / s.M }));
    const c1 = $("#btChart"); if (c1) hbarChart(c1, items, 1, ex);
    const pr = $("#tmRange [aria-pressed=true]"); if (pr) timeMachine(+pr.dataset.y);
    const c2 = $("#realFreq"); if (c2) freqChart(c2, s.freq, 49, s.exp, n => s.order.indexOf(n) < 6 ? "hot" : s.order.indexOf(n) > 42 ? "cold" : null);
  };
  function timeMachine(years) {
    const g = GAMES.lotto, tk = cur(), out = $("#tmOut"); if (!out) return;
    if (!complete(tk)) { out.innerHTML = `<p class="small err">${t("pickFirst")}</p>`; return; }
    const from = years ? Date.now() - years * 365.25 * 864e5 : 0;
    const draws = REAL.filter(d => d.date.getTime() >= from);
    const cls = new Array(g.classes.length).fill(0), main = new Array(7).fill(0);
    let best = { m: -1 }, won = 0, withSZ = 0;
    for (const d of draws) {
      const m = countHits(tk.main, d.main); main[m]++;
      if (m > best.m) best = { m, d };
      if (d.sz == null) continue;
      withSZ++;
      const e = tk.extra[0] === d.sz ? 1 : 0, ci = classOf(g, m, e);
      if (ci >= 0) { cls[ci]++; won += ci === 0 ? g.jackpot : g.quota[ci]; }
    }
    const paid = withSZ * g.price, wins = cls.reduce((a, b) => a + b, 0);
    out.innerHTML = `<div class="tiles">${tile(t("tmDraws"), fmt(draws.length))}${tile(t("tmPaid"), eur(paid))}${tile(t("tmWon"), eur(won))}${tile(t("tmNet"), eur(won - paid), won - paid >= 0 ? "" : "neg")}</div>
      <p class="small">${t("tmBest", { m: best.m, date: best.d ? fmtDate(best.d.date) : "" })} ${main[6] ? t("tmSix") : t("tmNoSix")}</p>
      <div class="tablewrap"><table><thead><tr><th>${t("cls")}</th><th>${t("hitsCol")}</th><th>${t("timesCol")}</th></tr></thead><tbody>
      ${g.classes.map((c, i) => `<tr><td>${i + 1}</td><td>${classLabel(g, i)}</td><td>${fmt(cls[i])}</td></tr>`).join("")}</tbody></table></div>
      <p class="small">${t("tmNote", { n: fmt(withSZ), w: fmt(wins) })}</p>`;
  }
  async function updateData() {
    const msg = $("#updMsg"); msg.textContent = t("updating");
    try {
      const r = await fetch("https://raw.githubusercontent.com/daowa89/lottery-archive/main/de/lotto_6aus49/results.csv", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const txt = await r.text(), rows = parseCSV(txt);
      if (rows.length < 1000) throw new Error("short");
      const added = rows.length - REAL.length;
      store.set("realcsv", txt); REAL = rows; realCache = null; rendered.real = false; rendered.home = false;
      show("real", "archive");
      $("#updMsg").textContent = added > 0 ? t("updated", { n: added }) : t("upToDate");
    } catch (e) { msg.textContent = t("updateFail"); }
  }

  /* ================= LAB ================= */
  const lab = {};
  function labState() { return lab[gameId] || (lab[gameId] = {}); }
  RENDER.lab = function () {
    const g = G(), L = labState();
    let html = card(`<h2>${t("cmpTitle")}</h2><p class="small">${t("cmpIntro")}</p>
      <div class="seg" role="group" id="cmpN"><button data-n="10000">${t("n10k")}</button><button data-n="100000">${t("n100k")}</button><button data-n="1000000">${t("n1m")}</button></div>
      <button class="btn primary block" id="bCmp">${t("runAgain")}</button>
      <div class="progress"><div id="cmpBar"></div></div><p class="small" id="cmpStatus"></p>
      <div id="cmpOut"></div>`, "compare");
    html += card(`<h2>${t("topTitle")}</h2><p class="small">${t("topIntro")}</p>
      <button class="btn primary block" id="bTop">${t("runAgain")}</button>
      <div class="progress"><div id="topBar"></div></div><p class="small" id="topStatus"></p><div id="topOut"></div>`, "topnums");
    html += card(`<h2>${t("winTitle")}</h2><div class="row"><span class="small">${t("yourTicket")}</span><span class="balls" id="winTicket"></span></div>
      <div class="seg" role="group" id="winTarget"><button data-x="0" aria-pressed="true">${t("winMain", { k: g.k })}</button><button data-x="1" aria-pressed="false">${t("winAll")}</button></div>
      <p class="small">${t("winAssume", { p: eur(g.price, 2) })}</p>
      <button class="btn primary block" id="bWin">${t("startPlay")}</button>
      <p class="bigmsg" id="winMsg">${t("notStarted")}</p><div class="tiles" id="winTiles"></div><p class="small" id="winNote"></p>`, "untilwin");
    html += card(`<h2>${t("intuTitle")}</h2><p class="small">${t("intuIntro")}</p><div id="intuBox"></div>`, "intuition");
    $("#v-lab").innerHTML = html;
    const nBtns = $$("#cmpN button");
    const curN = L.cmp ? L.cmp.N : 100000;
    nBtns.forEach(b => { b.setAttribute("aria-pressed", String(+b.dataset.n === curN)); b.onclick = () => { if (cmpRunning) return; nBtns.forEach(x => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); runCompare(+b.dataset.n); }; });
    $("#bCmp").onclick = () => { if (!cmpRunning) runCompare(+$("#cmpN [aria-pressed=true]").dataset.n); };
    $("#bTop").onclick = runTop;
    $$("#winTarget button").forEach(b => b.onclick = () => { if (winRunning) return; $$("#winTarget button").forEach(x => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); winNote(); });
    $("#bWin").onclick = () => { if (winRunning) { winRunning = false; return; } runWin(); };
    winNote(); intuStart();
    if (L.cmp) paintCompare(); else runCompare(100000);
    if (L.top) paintTop();
  };
  afterShow.lab = function () {
    const tk = cur(); const w = $("#winTicket"); if (w) w.innerHTML = complete(tk) ? ticketBalls(tk) : `<span class="small err">${t("pickFirst")}</span>`;
    if (labState().cmp) drawCmpChart();
    if (labState().top === undefined && !topRunning && $("#topOut")) runTop();
  };

  let cmpRunning = false;
  function runCompare(N) {
    const g = G(), L = labState(); cmpRunning = true; $("#bCmp").disabled = true;
    const tk = cur(), fixed = complete(tk) ? tk.main.slice() : randomK(g.n, g.k, 1);
    const n = g.n, k = g.k, W = 100;
    const pool = new Int8Array(n + 1); for (let i = 0; i < n; i++) pool[i] = i + 1;
    const mark = new Int32Array(n + 1).fill(-1), ring = new Int8Array(W * k), win = new Int32Array(n + 1), last = new Int32Array(n + 1).fill(-1), score = new Float64Array(n + 1);
    const hits = [0, 1, 2, 3, 4].map(() => new Float64Array(k + 1));
    let prevHot = null, prevCold = null, hotNext = 0, coldNext = 0, blocks = 0, d = 0;
    const top = (sf) => { const taken = new Uint8Array(n + 1), o = []; for (let j = 0; j < k; j++) { let b = -1, bv = -Infinity; for (let x = 1; x <= n; x++) if (!taken[x] && score[x] > bv) { bv = score[x]; b = x; } taken[b] = 1; o.push(b); } return o; };
    const fill = f => { for (let x = 1; x <= n; x++) score[x] = f(x) + Math.random() * .5; };
    const runId = (L.runId = (L.runId || 0) + 1);
    (function step() {
      if (L.runId !== runId) return;
      const end = Math.min(N, d + 12000);
      for (; d < end; d++) {
        if (d >= W && d % W === 0) {
          if (prevHot) { for (const x of prevHot) hotNext += win[x]; for (const x of prevCold) coldNext += win[x]; blocks++; }
          fill(x => win[x]); prevHot = top(); fill(x => -win[x]); prevCold = top();
        }
        const picks = [randomK(n, k, 1), fixed];
        fill(x => win[x]); picks.push(top()); fill(x => -win[x]); picks.push(top()); fill(x => d - last[x]); picks.push(top());
        for (let i = 0; i < k; i++) { const j = i + Math.floor(Math.random() * (n - i)); const tt = pool[i]; pool[i] = pool[j]; pool[j] = tt; const x = pool[i]; mark[x] = d; last[x] = d; }
        for (let s = 0; s < 5; s++) { let m = 0; const p = picks[s]; for (let i = 0; i < k; i++) if (mark[p[i]] === d) m++; hits[s][m]++; }
        const slot = (d % W) * k;
        if (d >= W) for (let i = 0; i < k; i++) win[ring[slot + i]]--;
        for (let i = 0; i < k; i++) { ring[slot + i] = pool[i]; win[pool[i]]++; }
      }
      const bar = $("#cmpBar"), st = $("#cmpStatus");
      if (bar) bar.style.width = (100 * d / N) + "%";
      if (st) st.textContent = t("progress", { a: fmt(d), b: fmt(N) });
      if (d < N) { requestAnimationFrame(step); return; }
      cmpRunning = false; const b = $("#bCmp"); if (b) b.disabled = false;
      L.cmp = { N, hits, k, hotAvg: blocks ? hotNext / (blocks * k) : 0, coldAvg: blocks ? coldNext / (blocks * k) : 0, blocks, W, game: gameId };
      if (gameId === L.cmp.game) paintCompare();
    })();
  }
  const STRAT_KEYS = ["stRandom", "stMine", "stHot", "stCold", "stDue"];
  function paintCompare() {
    const g = G(), R = labState().cmp, out = $("#cmpOut"); if (!out || !R) return;
    const k = g.k, ex = k * k / g.n, avgs = R.hits.map(h => { let s = 0; for (let m = 0; m <= k; m++) s += m * h[m]; return s / R.N; });
    const spread = Math.max(...avgs.map(a => Math.abs(a - ex))), bi = avgs.indexOf(Math.max(...avgs));
    const cols = [k - 3, k - 2, k - 1, k].filter(x => x >= 2);
    const theo = m => R.N * pMain(g, m);
    out.innerHTML = `<p class="verdict">${t("cmpVerdict", { n: fmt(R.N), ex: fmt(ex, 3), s: fmt(spread, 4), best: t(STRAT_KEYS[bi]) })}</p>
      <canvas id="cmpChart" data-h="200"></canvas>
      <div class="tablewrap"><table><thead><tr><th>${t("strategy")}</th><th>${t("avg")}</th>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>
      ${R.hits.map((h, i) => `<tr><td>${t(STRAT_KEYS[i])}</td><td>${fmt(avgs[i], 3)}</td>${cols.map(c => `<td>${fmt(h[c])}</td>`).join("")}</tr>`).join("")}
      <tr class="theory"><td>${t("expected")}</td><td>${fmt(ex, 3)}</td>${cols.map(c => `<td>${fmt(theo(c), theo(c) < 10 ? 2 : 0)}</td>`).join("")}</tr></tbody></table></div>
      <p class="small">${t("cmpCols")}</p>
      <h3>${t("persistTitle")}</h3>
      <div class="tiles">${tile(t("persistHot"), fmt(R.hotAvg, 2))}${tile(t("persistCold"), fmt(R.coldAvg, 2))}${tile(t("persistExp"), fmt(R.W * k / g.n, 2), "ref")}</div>
      <p class="small">${t("persistNote", { n: fmt(R.blocks) })}</p>`;
    drawCmpChart();
  }
  function drawCmpChart() {
    const R = labState().cmp, c = $("#cmpChart"); if (!R || !c) return;
    const g = G(), k = g.k;
    const items = R.hits.map((h, i) => { let s = 0; for (let m = 0; m <= k; m++) s += m * h[m]; return { label: t(STRAT_KEYS[i]), v: s / R.N }; });
    hbarChart(c, items, 1, k * k / g.n);
  }

  let topRunning = false;
  function simFreq(g, n, onProg) {
    return new Promise(res => {
      const f = new Float64Array(g.n + 1), pool = new Int8Array(g.n + 1); for (let i = 0; i < g.n; i++) pool[i] = i + 1;
      let d = 0;
      (function step() {
        const end = Math.min(n, d + 150000);
        for (; d < end; d++) for (let i = 0; i < g.k; i++) { const j = i + Math.floor(Math.random() * (g.n - i)); const tt = pool[i]; pool[i] = pool[j]; pool[j] = tt; f[pool[i]]++; }
        onProg(d); if (d < n) requestAnimationFrame(step); else res(f);
      })();
    });
  }
  async function runTop() {
    if (topRunning) return; topRunning = true;
    const g = G(), L = labState(), gid = gameId; L.top = null; $("#bTop").disabled = true;
    const sizes = [10000, 100000, 1000000], total = sizes.reduce((a, b) => a + 2 * b, 0); let done = 0; const res = [];
    const rank = f => { const a = []; for (let x = 1; x <= g.n; x++) a.push(x); return a.sort((x, y) => f[y] - f[x] || Math.random() - .5); };
    const prog = base => d => { const b = $("#topBar"), s = $("#topStatus"); if (b) b.style.width = (100 * (base + d) / total) + "%"; if (s) s.textContent = t("progress", { a: fmt(base + d), b: fmt(total) }); };
    for (const n of sizes) {
      const fA = await simFreq(g, n, prog(done)); done += n;
      const rA = rank(fA), top = rA.slice(0, g.k);
      const fB = await simFreq(g, n, prog(done)); done += n;
      const rB = rank(fB), ranks = top.map(x => rB.indexOf(x) + 1);
      res.push({ n, top, ranks, avgRank: ranks.reduce((a, b) => a + b, 0) / g.k, hi: fA[rA[0]] / n, lo: fA[rA[g.n - 1]] / n, loN: rA[g.n - 1] });
    }
    lab[gid].top = res; topRunning = false;
    const b = $("#bTop"); if (b) b.disabled = false;
    if (gid === gameId) paintTop();
  }
  function paintTop() {
    const g = G(), res = labState().top, out = $("#topOut"); if (!out || !res) return;
    const st = $("#topStatus"); if (st) st.textContent = t("doneDraws", { n: fmt(res.reduce((a, r) => a + 2 * r.n, 0)) });
    const sets = res.map(r => new Set(r.top)), common = [...sets[0]].filter(x => sets[1].has(x) && sets[2].has(x));
    const overall = res.reduce((a, r) => a + r.avgRank, 0) / res.length, mid = (g.n + 1) / 2;
    out.innerHTML = res.map(r => `<div class="sub"><div class="row between"><h3>${t(r.n === 10000 ? "n10k" : r.n === 100000 ? "n100k" : "n1m")}</h3><span class="small">${t("expectedEach", { p: pct(g.k / g.n, 2) })}</span></div>
      <div class="balls">${r.top.map(x => ball(x, "hot")).join("")}</div>
      <p class="small">${t("topSpread", { hi: pct(r.hi, 2), lo: pct(r.lo, 2), ln: r.loN })}</p>
      <div class="tiles">${tile(t("newRanks"), r.ranks.join(isRTL() ? "، " : ", "))}${tile(t("avgRank"), fmt(r.avgRank, 1) + " / " + g.n)}${tile(t("expRank"), fmt(mid, 0) + " / " + g.n, "ref")}</div></div>`).join("")
      + `<p class="verdict">${t("topVerdict", { common: common.length ? common.join(", ") : t("none"), r: fmt(overall, 1), n: g.n })}</p>`;
  }

  let winRunning = false;
  function winNote() {
    const g = G(), all = $("#winTarget [aria-pressed=true]").dataset.x === "1";
    const odds = all ? jackpotOdds(g) : 1 / pMain(g, g.k);
    $("#winNote").textContent = t("winTheory", { odds: fmt(odds), y: fmt(odds / PER_YEAR) }) + (all ? " " + t("winSlow") : "");
  }
  function runWin() {
    const g = G(), tk = cur(); if (!complete(tk)) return;
    const all = $("#winTarget [aria-pressed=true]").dataset.x === "1";
    winRunning = true; $("#bWin").textContent = t("stop");
    const isMain = new Uint8Array(g.n + 1); tk.main.forEach(x => isMain[x] = 1);
    const pool = new Int8Array(g.n + 1); for (let i = 0; i < g.n; i++) pool[i] = i + 1;
    const pe = pExtra(g, g.ek);
    const h = new Float64Array(g.k + 1); let draws = 0, won = false, mainOnly = 0;
    $("#winMsg").textContent = t("playing");
    const paint = () => {
      const tl = $("#winTiles"); if (!tl) return;
      tl.innerHTML = tile(t("draws"), fmt(draws)) + tile(t("years"), fmt(draws / PER_YEAR)) + tile(t("paid"), eur(draws * g.price))
        + [g.k - 3, g.k - 2, g.k - 1].filter(x => x >= 2).map(m => tile(t("mHits", { m }), fmt(h[m]))).join("");
    };
    (function step() {
      const t0 = performance.now();
      while (!won && winRunning && performance.now() - t0 < 35) {
        for (let r = 0; r < 20000; r++) {
          let m = 0;
          for (let i = 0; i < g.k; i++) { const j = i + Math.floor(Math.random() * (g.n - i)); const tt = pool[i]; pool[i] = pool[j]; pool[j] = tt; m += isMain[pool[i]]; }
          draws++; h[m]++;
          if (m === g.k) { if (!all || Math.random() < pe) { won = true; break; } mainOnly++; }
        }
      }
      paint();
      const msg = $("#winMsg"), btn = $("#bWin");
      if (won) { winRunning = false; if (btn) btn.textContent = t("playAgain"); if (msg) msg.textContent = t("winDone", { n: fmt(draws), y: fmt(draws / PER_YEAR), p: eur(draws * g.price) }) + (all && mainOnly ? " " + t("winBefore", { n: fmt(mainOnly), k: g.k }) : ""); return; }
      if (!winRunning) { if (btn) btn.textContent = t("startPlay"); if (msg) msg.textContent = t("winStopped", { n: fmt(draws) }); return; }
      requestAnimationFrame(step);
    })();
  }

  // intuition game: which ticket is truly random?
  let intu = null;
  function humanLike(g) {
    for (let tries = 0; tries < 2000; tries++) {
      const a = [], bin = g.n / g.k;
      for (let i = 0; i < g.k; i++) a.push(1 + Math.floor(i * bin + Math.random() * bin));
      const digits = new Set(a.map(x => x % 10)).size;
      if (maxRun(a) === 1 && digits === g.k && new Set(a).size === g.k) return a;
    }
    return randomK(g.n, g.k, 1);
  }
  function realLooking(g) {
    // a genuinely random ticket; prefer one with a typical clump so rounds teach something
    for (let i = 0; i < 50; i++) { const a = randomK(g.n, g.k, 1); if (maxRun(a) >= 2 || new Set(a.map(x => x % 10)).size < g.k) return a; }
    return randomK(g.n, g.k, 1);
  }
  function intuStart() { intu = { round: 0, score: 0, total: 8 }; intuRound(); }
  function intuRound() {
    const g = G(), box = $("#intuBox"); if (!box) return;
    if (intu.round >= intu.total) {
      box.innerHTML = `<p class="bigmsg">${t("intuScore", { s: intu.score, n: intu.total })}</p><p class="small">${t("intuLesson")}</p><button class="btn primary block" id="bIntu">${t("playAgain")}</button>`;
      $("#bIntu").onclick = intuStart; return;
    }
    const realA = Math.random() < .5, real = realLooking(g), fake = humanLike(g);
    const A = realA ? real : fake, B = realA ? fake : real;
    box.innerHTML = `<p class="small">${t("intuRound", { r: intu.round + 1, n: intu.total })}</p>
      <div class="pick2"><button class="pickbtn" data-a="1"><span class="small">A</span><span class="balls">${A.map(x => ball(x)).join("")}</span></button>
      <button class="pickbtn" data-a="0"><span class="small">B</span><span class="balls">${B.map(x => ball(x)).join("")}</span></button></div><p class="small" id="intuMsg"></p>`;
    $$("#intuBox .pickbtn").forEach(b => b.onclick = () => {
      if (b.dataset.done) return; $$("#intuBox .pickbtn").forEach(x => { x.dataset.done = 1; x.disabled = true; });
      const right = (b.dataset.a === "1") === realA; if (right) intu.score++;
      const run = maxRun(real) >= 2, dig = new Set(real.map(x => x % 10)).size < g.k;
      $("#intuMsg").innerHTML = (right ? `<b class="okc">${t("intuRight")}</b> ` : `<b class="err">${t("intuWrong")}</b> `) + t("intuWhy", { s: realA ? "A" : "B" }) + " " + (run ? t("intuRun") : dig ? t("intuDigit") : "") + ` <button class="btn ghost sm" id="bNext">${t("next")}</button>`;
      $("#bNext").onclick = () => { intu.round++; intuRound(); };
    });
  }

  /* ================= CALC ================= */
  RENDER.calc = function () {
    const g = G(), last = g.real ? lastReal() : null;
    let html = card(`<h2>${t("evTitle")}</h2><p class="small">${t("evIntro")}</p>
      <div class="form"><label>${t("jackpotIn")}<input id="evJack" type="number" inputmode="numeric" min="1" value="${g.jackpot / 1e6}"></label>
      <label>${t("soldIn")}<input id="evSold" type="number" inputmode="numeric" min="1" value="${g.sold / 1e6}"></label></div>
      <div id="evOut"></div>`, "ev");
    html += card(`<h2>${t("checkTitle")}</h2><p class="small">${t("checkIntro")}</p>
      <label class="small" for="chkMain">${t("drawnMain", { k: g.k })}</label><input id="chkMain" type="text" inputmode="numeric" value="${last ? last.main.join(" ") : ""}">
      <label class="small" for="chkExtra">${t(g.extraKey === "sz" ? "drawnSZ" : "drawnEZ")}</label><input id="chkExtra" type="text" inputmode="numeric" value="${last && last.sz != null ? last.sz : ""}">
      ${last ? `<p class="small">${t("prefilled", { d: fmtDate(last.date) })}</p>` : ""}
      <button class="btn primary block" id="bChk">${t("checkBtn")}</button><div id="chkOut"></div>`, "checker");
    const maxSys = g.id === "lotto" ? 14 : 12;
    html += card(`<h2>${t("sysTitle")}</h2><p class="small">${t("sysIntro", { k: g.k })}</p>
      <div class="form"><label>${t("sysMain")}<select id="sysM">${range(g.k + 1, maxSys).map(m => `<option ${m === g.k + 2 ? "selected" : ""}>${m}</option>`).join("")}</select></label>
      ${g.ek > 1 ? `<label>${t("sysExtra")}<select id="sysE">${range(g.ek, 5).map(m => `<option>${m}</option>`).join("")}</select></label>` : ""}
      <label>${t("sysHits")}<select id="sysH"></select></label>
      ${g.ek > 1 ? `<label>${t("sysEHits")}<select id="sysEH"></select></label>` : `<label>${t("sysSZHit")}<select id="sysEH"><option value="0">${t("no")}</option><option value="1">${t("yes")}</option></select></label>`}</div>
      <div id="sysOut"></div>`, "system");
    html += card(`<h2>${t("invTitle")}</h2><p class="small">${t("invIntro")}</p>
      <div class="form"><label>${t("invTips")}<input id="invT" type="number" min="1" value="2"></label><label>${t("invDraws")}<input id="invD" type="number" min="1" max="2" value="2"></label>
      <label>${t("invYears")}<input id="invY" type="number" min="1" max="60" value="20"></label><label>${t("invRate")}<input id="invR" type="number" step="0.5" value="5"></label></div>
      <div id="invOut"></div>`, "invest");
    html += card(`<h2>${t("budTitle")}</h2><p class="small">${t("budIntro")}</p>
      <div class="form"><label>${t("budLimit")}<input id="budL" type="number" min="0" step="1"></label>
      <label>${t("budAdd")}<input id="budA" type="number" min="0" step="0.1" placeholder="${fmt(g.price, 2)}"></label></div>
      <button class="btn primary block" id="bBud">${t("budAddBtn")}</button><div id="budOut"></div>
      <p class="small">${t("help")}</p>`, "budget");
    $("#v-calc").innerHTML = html;
    ["evJack", "evSold"].forEach(id => $("#" + id).addEventListener("input", paintEV)); paintEV();
    $("#bChk").onclick = paintCheck; if (last) paintCheck();
    const sysUpd = () => { fillSysHits(); paintSys(); };
    ["sysM", "sysE"].forEach(id => { const el = $("#" + id); if (el) el.addEventListener("change", sysUpd); });
    ["sysH", "sysEH"].forEach(id => { const el = $("#" + id); if (el) el.addEventListener("change", paintSys); });
    sysUpd();
    ["invT", "invD", "invY", "invR"].forEach(id => $("#" + id).addEventListener("input", paintInv)); paintInv();
    const bud = store.getJ("budget", { limit: 20, items: [] });
    $("#budL").value = bud.limit;
    $("#budL").addEventListener("input", () => { const b = store.getJ("budget", { limit: 20, items: [] }); b.limit = +$("#budL").value || 0; store.setJ("budget", b); paintBud(); });
    $("#bBud").onclick = () => { const v = parseFloat($("#budA").value) || g.price; const b = store.getJ("budget", { limit: 20, items: [] }); b.items.push({ d: Date.now(), v, g: g.name }); store.setJ("budget", b); $("#budA").value = ""; paintBud(); };
    paintBud();
  };
  afterShow.calc = function () {
    if (!$("#evOut")) return;
    paintEV();
    if ($("#chkMain").value.trim()) paintCheck();
  };
  const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };
  function paintEV() {
    const g = G(), J = (+$("#evJack").value || 0) * 1e6, S = (+$("#evSold").value || 0) * 1e6, tk = cur();
    const pop = complete(tk) ? popularity(Object.assign({}, g, { sold: S }), tk) : null;
    let ev = 0;
    const rows = g.classes.map((c, i) => {
      const p = classProb(g, i);
      let q = i === 0 ? Math.min(J, g.jackpotMax) : g.quota[i];
      if (i === 0 && pop) q *= pop.share;
      ev += p * q;
      return `<tr><td>${i + 1}</td><td>${classLabel(g, i)}</td><td>${oneIn(1 / p)}</td><td>${eur(q)}</td><td>${fmt(p * q * 100, 2)} ¢</td></tr>`;
    }).join("");
    const ret = ev / g.price;
    $("#evOut").innerHTML = `<div class="tiles">${tile(t("evValue"), eur(ev, 2))}${tile(t("evPrice"), eur(g.price, 2))}${tile(t("evReturn"), pct(ret, 0), ret < 1 ? "neg" : "")}</div>
      <p class="small">${t("evSummary", { r: pct(ret, 0), l: eur(g.price - ev, 2) })} ${pop ? t("evShareUsed", { s: pct(pop.share, 0) }) : ""}</p>
      <div class="tablewrap"><table><thead><tr><th>${t("cls")}</th><th>${t("hitsCol")}</th><th>${t("odds")}</th><th>${t("quota")}</th><th>${t("valueCol")}</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small">${t("evNote")}</p>`;
  }
  function parseNums(s) { return [...new Set((String(s).match(/\d+/g) || []).map(Number))]; }
  function paintCheck() {
    const g = G(), mainD = parseNums($("#chkMain").value), exD = parseNums($("#chkExtra").value), out = $("#chkOut");
    const okMain = mainD.length === g.k && mainD.every(x => x >= 1 && x <= g.n);
    const okEx = exD.length === g.ek && exD.every(x => x >= g.emin && x < g.emin + g.en);
    if (!okMain || !okEx) { out.innerHTML = `<p class="small err">${t("checkErr", { k: g.k, n: g.n, e: g.ek })}</p>`; return; }
    const d = { main: mainD, extra: exD };
    out.innerHTML = myTickets().map((tk, i) => {
      if (!complete(tk)) return "";
      const m = countHits(tk.main, mainD), e = countHits(tk.extra, exD), ci = classOf(g, m, e);
      return `<div class="drow"><span class="tnum">${i + 1}</span><span class="balls">${ticketBalls(tk, d)}</span>
        <span class="pill ${ci >= 0 ? "ok" : ""}">${ci >= 0 ? t("classWin", { c: ci + 1, q: ci === 0 ? t("jackpot") : "≈ " + eur(g.quota[ci]) }) : t("noWin")}</span></div>`;
    }).join("") + `<p class="small">${t("quotaNote")}</p>`;
  }
  function fillSysHits() {
    const g = G(), m = +$("#sysM").value, h = $("#sysH"), prev = h.value === "" ? 3 : +h.value;
    h.innerHTML = range(0, Math.min(g.k, m)).map(x => `<option ${x === Math.min(prev, g.k) ? "selected" : ""}>${x}</option>`).join("");
    if (g.ek > 1) { const e = +$("#sysE").value, eh = $("#sysEH"), pe = +eh.value || 0; eh.innerHTML = range(0, Math.min(g.ek, e)).map(x => `<option ${x === pe ? "selected" : ""}>${x}</option>`).join(""); }
  }
  function paintSys() {
    const g = G(), m = +$("#sysM").value, e = g.ek > 1 ? +$("#sysE").value : 1, h = +$("#sysH").value, eh = +$("#sysEH").value;
    const tipsMain = C(m, g.k), tipsEx = g.ek > 1 ? C(e, g.ek) : 1, tips = tipsMain * tipsEx, cost = tips * g.price;
    const cls = new Array(g.classes.length).fill(0);
    for (let j = 0; j <= g.k; j++) {
      const nm = C(h, j) * C(m - h, g.k - j); if (!nm) continue;
      for (let f = 0; f <= g.ek; f++) {
        const ne = g.ek > 1 ? C(eh, f) * C(e - eh, g.ek - f) : (f === eh ? 1 : 0); if (!ne) continue;
        const ci = classOf(g, j, f); if (ci >= 0) cls[ci] += nm * ne;
      }
    }
    let won = 0; cls.forEach((c, i) => { if (i > 0) won += c * g.quota[i]; });
    $("#sysOut").innerHTML = `<div class="tiles">${tile(t("sysTips"), fmt(tips))}${tile(t("sysCost"), eur(cost, 2))}${tile(t("sysJack"), oneIn(jackpotOdds(g) / tips))}</div>
      <div class="tablewrap"><table><thead><tr><th>${t("cls")}</th><th>${t("hitsCol")}</th><th>${t("sysWins")}</th></tr></thead><tbody>
      ${cls.map((c, i) => c ? `<tr><td>${i + 1}</td><td>${classLabel(g, i)}</td><td>${fmt(c)}</td></tr>` : "").join("") || `<tr><td colspan="3">${t("noWin")}</td></tr>`}</tbody></table></div>
      <p class="small">${t("sysSummary", { w: eur(won), c: eur(cost, 2) })} ${cls[0] ? t("sysPlusJack") : ""}</p><p class="small">${t("sysNote")}</p>`;
  }
  function paintInv() {
    const g = G(), tips = +$("#invT").value || 0, dw = +$("#invD").value || 0, y = +$("#invY").value || 0, r = (+$("#invR").value || 0) / 100;
    const perMonth = tips * dw * g.price * 52 / 12, months = y * 12, paid = perMonth * months;
    const fv = r ? perMonth * ((Math.pow(1 + r / 12, months) - 1) / (r / 12)) : paid;
    $("#invOut").innerHTML = `<div class="tiles">${tile(t("invPerMonth"), eur(perMonth, 2))}${tile(t("invPaid"), eur(paid))}${tile(t("invBack"), "≈ " + eur(paid * 0.5))}${tile(t("invFV"), eur(fv), "ref")}</div>
      <p class="small">${t("invText", { y, fv: eur(fv), b: eur(paid * .5) })}</p><p class="small">${t("invNote")}</p>`;
  }
  function paintBud() {
    const b = store.getJ("budget", { limit: 20, items: [] }), now = new Date();
    const mItems = b.items.filter(x => { const d = new Date(x.d); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    const spent = mItems.reduce((a, x) => a + x.v, 0), total = b.items.reduce((a, x) => a + x.v, 0), lim = b.limit || 0;
    const ratio = lim ? spent / lim : 0;
    $("#budOut").innerHTML = `<div class="meter"><div style="width:${Math.min(100, ratio * 100).toFixed(0)}%" class="lv-${ratio > 1 ? "high" : ratio > .75 ? "mid" : "low"}"></div></div>
      <div class="tiles">${tile(t("budMonth"), eur(spent, 2))}${tile(t("budLeft"), eur(Math.max(0, lim - spent), 2))}${tile(t("budTotal"), eur(total, 2))}</div>
      ${ratio > 1 ? `<p class="pill warn">${t("budOver")}</p>` : ratio > .75 ? `<p class="small err">${t("budNear")}</p>` : ""}
      ${b.items.length ? `<div class="row"><button class="btn ghost sm" id="bBudUndo">${t("budUndo")}</button><button class="btn ghost sm" id="bBudReset">${t("budReset")}</button></div>` : ""}`;
    const u = $("#bBudUndo"); if (u) u.onclick = () => { const x = store.getJ("budget", { limit: 20, items: [] }); x.items.pop(); store.setJ("budget", x); paintBud(); };
    const rs = $("#bBudReset"); if (rs) rs.onclick = () => { const x = store.getJ("budget", { limit: 20, items: [] }); if (rs.dataset.armed) { x.items = []; store.setJ("budget", x); paintBud(); } else { rs.dataset.armed = 1; rs.textContent = t("budResetSure"); } };
  }

  /* ================= boot ================= */
  function setGame(id) { gameId = id; store.set("game", id); lab[id] = lab[id] || {}; rerenderAll(); }
  $("#gameSel").addEventListener("change", e => setGame(e.target.value));
  $("#langSel").addEventListener("change", e => { lang = e.target.value; store.set("lang", lang); realCache = null; rerenderAll(); });
  $$("nav.tabs button").forEach(b => b.addEventListener("click", () => go(b.dataset.view)));
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { afterShow[view] && afterShow[view](); }, 200); });
  loadReal();
  applyChrome();
  show(location.hash.slice(1) || "home");
  if ("serviceWorker" in navigator && location.protocol === "https:" && !/claude\.ai|claudeusercontent/.test(location.hostname)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
