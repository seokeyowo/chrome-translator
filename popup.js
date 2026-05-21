async function sendToTab(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, msg);
}

function translate(text, source, target) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "translate", text, source, target }, (resp) => {
      resolve(resp?.ok ? resp.translated : "[번역 실패]");
    });
  });
}

document.getElementById("translatePage").addEventListener("click", () => {
  sendToTab({ type: "toggle-page-translate" });
  window.close();
});

document.getElementById("translateSel").addEventListener("click", () => {
  sendToTab({ type: "translate-selection" });
  window.close();
});

document.getElementById("openComposer").addEventListener("click", () => {
  sendToTab({ type: "open-composer" });
  window.close();
});

const src = document.getElementById("quickSrc");
const out = document.getElementById("quickOut");
let timer = null;
src.addEventListener("input", () => {
  clearTimeout(timer);
  const text = src.value;
  if (!text.trim()) { out.textContent = ""; return; }
  timer = setTimeout(async () => {
    out.textContent = "번역 중...";
    out.textContent = await translate(text, "ko", "zh-CN");
  }, 400);
});
