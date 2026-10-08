/* LEVEL-UP: language (Dutch by default, English with the NL | EN switch).
   Loaded first in <head>, after i18n-nl.js. In Dutch it translates every English text the site shows, the moment it
   appears (page, pop-ups, messages), using the dictionary in i18n-nl.js. Dates and numbers follow nl-BE.
   The choice is remembered per browser ("levelup.lang"); ?lang=en or ?lang=nl in the address sets it too. */
(function () {
  const KEY = "levelup.lang";
  const asked = /[?&]lang=(nl|en)\b/.exec(location.search);
  let lang = asked ? asked[1] : null;
  try {
    if (asked) localStorage.setItem(KEY, lang);
    else lang = localStorage.getItem(KEY);
  } catch { /* storage unavailable */ }
  if (lang !== "en") lang = "nl";
  const root = document.documentElement;
  root.lang = lang;
  root.setAttribute("data-lang", lang);

  const dict = window.LEVELUP_NL;
  const t = (s) => (lang === "nl" && dict ? dict.translate(s) ?? s : s);
  window.LEVELUP_LANG = lang;
  window.t = t;
  window.setLang = (next) => {
    try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
    location.reload();
  };
  // The service worker translates push notifications: tell it the language
  try { if ("caches" in window) caches.open("levelup-prefs").then((c) => c.put("lang", new Response(lang))).catch(() => {}); } catch { /* ignore */ }

  // NL | EN switch: any element with [data-lang-switch] becomes one
  const switchHtml = () => `<button type="button" data-set-lang="nl" aria-pressed="${lang === "nl"}">NL</button><span aria-hidden="true">|</span><button type="button" data-set-lang="en" aria-pressed="${lang === "en"}">EN</button>`;
  document.addEventListener("click", (event) => {
    const b = event.target.closest?.("[data-set-lang]");
    if (b && b.dataset.setLang !== lang) window.setLang(b.dataset.setLang);
  });

  if (lang !== "nl" || !dict) {
    document.addEventListener("DOMContentLoaded", () => document.querySelectorAll("[data-lang-switch]").forEach((el) => { el.innerHTML = switchHtml(); }));
    return;
  }

  // Dates and numbers in Dutch / Belgian format
  const loc = (l) => (l === undefined || /^en/i.test(String(l)) ? "nl-BE" : l);
  ["toLocaleDateString", "toLocaleTimeString", "toLocaleString"].forEach((fn) => {
    const orig = Date.prototype[fn];
    Date.prototype[fn] = function (l, o) { return orig.call(this, loc(l), o); };
  });
  const numOrig = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (l, o) { return numOrig.call(this, loc(l), o); };

  // Pop-up messages
  ["alert", "confirm", "prompt"].forEach((fn) => {
    const orig = window[fn];
    window[fn] = function (msg, ...rest) { return orig.call(this, msg == null ? msg : t(String(msg)), ...rest); };
  });

  // Translate the page as it appears
  const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "NOSCRIPT", "CODE", "PRE"]);
  const ATTRS = ["placeholder", "title", "aria-label", "alt"];
  const seen = new WeakMap();
  const letters = /[A-Za-z]{2}/;
  function doText(n) {
    const v = n.nodeValue;
    if (!v || seen.get(n) === v || !letters.test(v)) return;
    const p = n.parentNode;
    if (!p || SKIP.has(p.nodeName) || p.closest?.("[data-no-i18n]")) { seen.set(n, v); return; }
    const out = dict.translate(v);
    if (out != null) {
      const lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
      n.nodeValue = lead + out + trail;
    }
    seen.set(n, n.nodeValue);
  }
  function doAttrs(el) {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || !letters.test(v) || el["_i18n_" + a] === v) continue;
      const out = dict.translate(v);
      if (out != null) el.setAttribute(a, out);
      el["_i18n_" + a] = el.getAttribute(a);
    }
  }
  function walk(node) {
    if (node.nodeType === 3) { doText(node); return; }
    if (node.nodeType !== 1 || node.hasAttribute("data-no-i18n")) return;
    if (SKIP.has(node.nodeName)) { doAttrs(node); return; }
    if (node.hasAttribute("data-lang-switch")) node.innerHTML = switchHtml();
    doAttrs(node);
    const it = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (n.nodeType !== 1) return NodeFilter.FILTER_ACCEPT;
        if (n.hasAttribute("data-no-i18n")) return NodeFilter.FILTER_REJECT;
        if (SKIP.has(n.nodeName)) { doAttrs(n); return NodeFilter.FILTER_REJECT; }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = it.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else { doAttrs(n); if (n.hasAttribute("data-lang-switch")) n.innerHTML = switchHtml(); }
    }
  }
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") doText(m.target);
      else if (m.type === "attributes") doAttrs(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  walk(root);
  document.addEventListener("DOMContentLoaded", () => {
    walk(document.body);
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = t(meta.content);
  });
})();
