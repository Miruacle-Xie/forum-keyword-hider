(() => {
  "use strict";
  const DEFAULT_SETTINGS = {
    enabled: true,
    disableImagePreview: false, // 默认关闭
    keywordItems: [{ text: "topicrow", enabled: true, target: "html", type: "normal" }],
    blacklistUrls: "viewthread\nthread-\nread.php?tid="
  };

  const $ = id => document.getElementById(id);
  const els = {
    keywordList: $("keywordList"),
    template: $("keywordRowTemplate"),
    blacklistUrls: $("blacklistUrls"),
    enabled: $("enabled"),
    disableImagePreview: $("disableImagePreview")
  };

  function createRow(item) {
    const frag = els.template.content.cloneNode(true);
    const row = frag.querySelector(".keyword-row");
    const input = frag.querySelector(".keyword-text");
    const target = frag.querySelector(".keyword-target");
    const type = frag.querySelector(".keyword-type");
    const enabled = frag.querySelector(".keyword-enabled");

    input.value = item.text || "";
    target.value = item.target || "text";
    type.value = item.type || "normal";
    enabled.checked = item.enabled !== false;

    const save = () => saveSettings();
    [input, target, type, enabled].forEach(el => el.addEventListener("change", save));
    input.addEventListener("input", save);
    frag.querySelector(".keyword-delete").onclick = () => { row.remove(); save(); };
    els.keywordList.appendChild(frag);
  }

  function saveSettings() {
    const items = Array.from(els.keywordList.querySelectorAll(".keyword-row")).map(r => ({
      text: r.querySelector(".keyword-text").value.trim(),
      target: r.querySelector(".keyword-target").value,
      type: r.querySelector(".keyword-type").value,
      enabled: r.querySelector(".keyword-enabled").checked
    })).filter(i => i.text);

    chrome.storage.sync.set({
      enabled: els.enabled.checked,
      disableImagePreview: els.disableImagePreview.checked,
      keywordItems: items,
      blacklistUrls: els.blacklistUrls.value
    });
  }

  function load() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, s => {
      els.enabled.checked = !!s.enabled;
      els.disableImagePreview.checked = !!s.disableImagePreview;
      els.blacklistUrls.value = s.blacklistUrls;
      els.keywordList.innerHTML = "";
      s.keywordItems.forEach(createRow);
    });
  }

  $("addKeyword").onclick = () => createRow({ text: "", enabled: true, target: "text", type: "normal" });
  els.enabled.onchange = saveSettings;
  els.disableImagePreview.onchange = saveSettings;
  els.blacklistUrls.oninput = saveSettings;
  load();
})();