(() => {
  const CACHE = new Map();
  let popup = null;
  let hoverEnabled = false;
  let pageTranslated = false;

  chrome.storage.sync.get({ hoverEnabled: false }, (s) => {
    hoverEnabled = !!s.hoverEnabled;
  });

  function requestTranslate(text, source = "zh-CN", target = "ko") {
    const key = source + "|" + target + "|" + text;
    if (CACHE.has(key)) return Promise.resolve(CACHE.get(key));
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "translate", text, source, target }, (resp) => {
        if (resp?.ok) {
          CACHE.set(key, resp.translated);
          resolve(resp.translated);
        } else {
          resolve("[번역 실패]");
        }
      });
    });
  }

  function ensurePopup() {
    if (popup) return popup;
    popup = document.createElement("div");
    popup.className = "ctk-popup";
    popup.style.display = "none";
    popup.innerHTML =
      '<div class="ctk-close">×</div><div class="ctk-label">번역 (중→한)</div><div class="ctk-body"></div>';
    document.body.appendChild(popup);
    popup.querySelector(".ctk-close").addEventListener("click", hidePopup);
    return popup;
  }

  function showPopup(x, y, text) {
    const p = ensurePopup();
    p.querySelector(".ctk-body").textContent = text;
    p.style.left = Math.min(x, window.innerWidth - 380) + window.scrollX + "px";
    p.style.top = y + 8 + window.scrollY + "px";
    p.style.display = "block";
  }
  function hidePopup() {
    if (popup) popup.style.display = "none";
  }

  document.addEventListener("mouseup", async (e) => {
    if (e.target.closest?.(".ctk-popup")) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || text.length < 1) return;
    if (!/[㐀-鿿]/.test(text)) return; // 한자 포함시만
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    showPopup(rect.left, rect.bottom, "번역 중...");
    const t = await requestTranslate(text);
    showPopup(rect.left, rect.bottom, t);
  });

  document.addEventListener("mousedown", (e) => {
    if (popup && popup.style.display === "block" && !e.target.closest(".ctk-popup")) {
      const sel = window.getSelection();
      if (!sel || !sel.toString().trim()) hidePopup();
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "translate-selection") {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        showPopup(rect.left, rect.bottom, "번역 중...");
        requestTranslate(text).then((t) => showPopup(rect.left, rect.bottom, t));
      }
    } else if (msg?.type === "toggle-page-translate") {
      togglePageTranslate();
    } else if (msg?.type === "open-composer") {
      openComposer();
    } else if (msg?.type === "set-hover") {
      hoverEnabled = !!msg.value;
    }
  });

  // ── 한→중 입력 번역창 ─────────────────────────────────────
  let composer = null;
  function openComposer() {
    if (composer) {
      composer.style.display = "block";
      composer.querySelector(".ctk-c-src").focus();
      return;
    }
    composer = document.createElement("div");
    composer.className = "ctk-composer";
    composer.innerHTML = `
      <div class="ctk-c-head">
        <span class="ctk-c-title">한국어 → 중국어</span>
        <span class="ctk-c-swap" title="언어 바꾸기">⇅</span>
        <span class="ctk-c-close">×</span>
      </div>
      <textarea class="ctk-c-src" placeholder="여기에 한국어를 입력하세요..."></textarea>
      <div class="ctk-c-out" placeholder="번역 결과"></div>
      <div class="ctk-c-foot">
        <button class="ctk-c-copy">복사</button>
        <span class="ctk-c-status"></span>
      </div>
    `;
    document.body.appendChild(composer);

    let src = "ko", tgt = "zh-CN";
    const srcEl = composer.querySelector(".ctk-c-src");
    const outEl = composer.querySelector(".ctk-c-out");
    const statusEl = composer.querySelector(".ctk-c-status");
    const titleEl = composer.querySelector(".ctk-c-title");

    let timer = null;
    srcEl.addEventListener("input", () => {
      clearTimeout(timer);
      const text = srcEl.value;
      if (!text.trim()) { outEl.textContent = ""; statusEl.textContent = ""; return; }
      statusEl.textContent = "입력 중...";
      timer = setTimeout(async () => {
        statusEl.textContent = "번역 중...";
        const t = await requestTranslate(text, src, tgt);
        outEl.textContent = t;
        statusEl.textContent = "";
      }, 400);
    });

    composer.querySelector(".ctk-c-close").addEventListener("click", () => {
      composer.style.display = "none";
    });
    composer.querySelector(".ctk-c-swap").addEventListener("click", () => {
      [src, tgt] = [tgt, src];
      titleEl.textContent = (src === "ko" ? "한국어" : "중국어") + " → " + (tgt === "ko" ? "한국어" : "중국어");
      const a = srcEl.value, b = outEl.textContent;
      srcEl.value = b; outEl.textContent = a;
      srcEl.dispatchEvent(new Event("input"));
    });
    composer.querySelector(".ctk-c-copy").addEventListener("click", () => {
      navigator.clipboard.writeText(outEl.textContent || "").then(() => {
        statusEl.textContent = "복사됨";
        setTimeout(() => (statusEl.textContent = ""), 1200);
      });
    });

    // 드래그 이동
    const head = composer.querySelector(".ctk-c-head");
    let dragging = false, ox = 0, oy = 0;
    head.addEventListener("mousedown", (e) => {
      if (e.target.closest(".ctk-c-close, .ctk-c-swap")) return;
      dragging = true;
      const rect = composer.getBoundingClientRect();
      ox = e.clientX - rect.left; oy = e.clientY - rect.top;
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      composer.style.left = (e.clientX - ox) + "px";
      composer.style.top = (e.clientY - oy) + "px";
      composer.style.right = "auto"; composer.style.bottom = "auto";
    });
    document.addEventListener("mouseup", () => (dragging = false));

    srcEl.focus();
  }

  // 페이지 전체 번역: 텍스트 노드 단위로 원문 아래 번역 삽입
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "IFRAME",
  ]);
  const REPLACED = []; // { node, original }
  const TRANSLATED_NODES = new WeakSet();
  let observer = null;
  let pendingNodes = new Set();
  let flushTimer = null;

  function isTranslatableTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return false;
    if (TRANSLATED_NODES.has(node)) return false;
    if (!node.nodeValue || !node.nodeValue.trim()) return false;
    if (!/[㐀-鿿]/.test(node.nodeValue)) return false;
    const p = node.parentElement;
    if (!p || SKIP_TAGS.has(p.tagName)) return false;
    if (p.closest(".ctk-popup, .ctk-composer")) return false;
    return true;
  }

  function collectChineseTextNodesFrom(root) {
    const nodes = [];
    if (!root) return nodes;
    if (root.nodeType === Node.TEXT_NODE) {
      if (isTranslatableTextNode(root)) nodes.push(root);
      return nodes;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return nodes;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        return isTranslatableTextNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function collectChineseTextNodes() {
    return collectChineseTextNodesFrom(document.body);
  }

  async function togglePageTranslate() {
    if (pageTranslated) {
      stopObserver();
      REPLACED.forEach(({ node, original }) => { if (node) node.nodeValue = original; });
      REPLACED.length = 0;
      pageTranslated = false;
      return;
    }
    pageTranslated = true;
    const nodes = collectChineseTextNodes();
    const SEP = "\n¶¶¶\n";
    const MAX_CHARS = 1800; // 한 요청당 대략 글자 수 (URL 길이 안전선)
    const CONCURRENCY = 8;

    // 글자수 기반으로 배치 묶기
    const batches = [];
    let cur = [], curLen = 0;
    for (const n of nodes) {
      const len = (n.nodeValue || "").length + SEP.length;
      if (cur.length && curLen + len > MAX_CHARS) {
        batches.push(cur); cur = []; curLen = 0;
      }
      cur.push(n); curLen += len;
    }
    if (cur.length) batches.push(cur);

    await translateNodes(nodes);
    startObserver();
  }

  async function translateNodes(nodes) {
    if (!nodes.length) return;
    const SEP = "\n¶¶¶\n";
    const MAX_CHARS = 1800;
    const CONCURRENCY = 8;

    const batches = [];
    let cur = [], curLen = 0;
    for (const n of nodes) {
      const len = (n.nodeValue || "").length + SEP.length;
      if (cur.length && curLen + len > MAX_CHARS) {
        batches.push(cur); cur = []; curLen = 0;
      }
      cur.push(n); curLen += len;
    }
    if (cur.length) batches.push(cur);

    async function runBatch(slice) {
      const joined = slice.map((n) => n.nodeValue.trim()).join(SEP);
      const translated = await requestTranslate(joined);
      const parts = translated.split(/\n?¶¶¶\n?/);
      // 옵저버가 우리 변경을 다시 잡지 않도록 일시 정지
      if (observer) observer.disconnect();
      slice.forEach((node, idx) => {
        const t = parts[idx];
        if (t == null) return;
        if (!node.parentNode) return;
        const original = node.nodeValue;
        const m = original.match(/^(\s*)([\s\S]*?)(\s*)$/);
        const lead = m ? m[1] : "";
        const trail = m ? m[3] : "";
        REPLACED.push({ node, original });
        TRANSLATED_NODES.add(node);
        node.nodeValue = lead + t + trail;
      });
      if (observer && pageTranslated) attachObserver();
    }

    let idx = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (idx < batches.length) {
          const myIdx = idx++;
          await runBatch(batches[myIdx]);
        }
      })
    );
  }

  function attachObserver() {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          m.addedNodes.forEach((n) => {
            collectChineseTextNodesFrom(n).forEach((tn) => pendingNodes.add(tn));
          });
        } else if (m.type === "characterData") {
          if (isTranslatableTextNode(m.target)) pendingNodes.add(m.target);
        }
      }
      if (pendingNodes.size && !flushTimer) {
        flushTimer = setTimeout(flushPending, 250);
      }
    });
    attachObserver();
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    pendingNodes.clear();
  }

  async function flushPending() {
    flushTimer = null;
    const nodes = Array.from(pendingNodes).filter(isTranslatableTextNode);
    pendingNodes.clear();
    if (nodes.length) await translateNodes(nodes);
  }
})();
