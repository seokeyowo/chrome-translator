// Google Translate 무료 엔드포인트로 번역
// CORS를 피하기 위해 서비스 워커에서 fetch 수행

const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

async function translateText(text, source = "zh-CN", target = "ko") {
  if (!text || !text.trim()) return "";
  const url =
    `${ENDPOINT}?client=gtx&sl=${encodeURIComponent(source)}` +
    `&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error("translate http " + res.status);
  const data = await res.json();
  // data[0] = [[translated, original, ...], ...]
  return (data[0] || []).map((seg) => seg[0]).join("");
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "translate") {
    translateText(msg.text, msg.source || "auto", msg.target || "ko")
      .then((translated) => sendResponse({ ok: true, translated }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate-selection",
    title: "선택한 텍스트 번역 (중→한)",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translate-selection" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "translate-selection" });
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "translate-page") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "toggle-page-translate" });
    });
  }
});
