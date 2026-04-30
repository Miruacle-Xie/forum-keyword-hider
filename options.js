(() => {
  "use strict";
  const DEFAULT_SETTINGS = {
    enabled: true,
    filterMode: "hide",
    disableImagePreview: false,
    keywordItems: [{ text: "topicrow", enabled: true, target: "html", type: "normal" }],
    blacklistUrls: "viewthread\nthread-\nread.php?tid="
  };

  const $ = id => document.getElementById(id);
  const els = {
    keywordList: $("keywordList"),
    template: $("keywordRowTemplate"),
    blacklistUrls: $("blacklistUrls"),
    enabled: $("enabled"),
    disableImagePreview: $("disableImagePreview"),
    filterModes: document.querySelectorAll('input[name="filterMode"]'),
    selectAllRules: $("selectAllRules") // 绑定全选框
  };

  // 动态更新全选框的状态 (勾选、未勾选、或半选状态)
  function updateSelectAllState() {
    const checkboxes = Array.from(els.keywordList.querySelectorAll(".keyword-enabled"));
    if (checkboxes.length === 0) {
      els.selectAllRules.checked = false;
      els.selectAllRules.indeterminate = false;
      return;
    }
    const checkedCount = checkboxes.filter(cb => cb.checked).length;
    
    if (checkedCount === 0) {
      els.selectAllRules.checked = false;
      els.selectAllRules.indeterminate = false; // 全不选
    } else if (checkedCount === checkboxes.length) {
      els.selectAllRules.checked = true;
      els.selectAllRules.indeterminate = false; // 全选
    } else {
      els.selectAllRules.checked = false;
      els.selectAllRules.indeterminate = true;  // 半选状态（横线）
    }
  }

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

    const activeMode = document.querySelector('input[name="filterMode"]:checked').value;

    chrome.storage.sync.set({
      enabled: els.enabled.checked,
      filterMode: activeMode,
      disableImagePreview: els.disableImagePreview.checked,
      keywordItems: items,
      blacklistUrls: els.blacklistUrls.value
    });

    // 保存数据的同时，同步更新全选框的 UI 状态
    updateSelectAllState();
  }

  function load() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, s => {
      els.enabled.checked = !!s.enabled;
      els.disableImagePreview.checked = !!s.disableImagePreview;
      els.blacklistUrls.value = s.blacklistUrls;
      
      const mode = s.filterMode || "hide";
      document.querySelector(`input[name="filterMode"][value="${mode}"]`).checked = true;

      els.keywordList.innerHTML = "";
      s.keywordItems.forEach(createRow);
      
      // 数据加载完毕后，计算并显示全选框状态
      updateSelectAllState();
    });
  }

  // ================= 添加全选框的点击事件 =================
  els.selectAllRules.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    // 把底下所有的规则复选框都改成一致的状态
    els.keywordList.querySelectorAll(".keyword-enabled").forEach(cb => {
      cb.checked = isChecked;
    });
    // 触发保存
    saveSettings();
  });

  $("addKeyword").onclick = () => {
    createRow({ text: "", enabled: true, target: "text", type: "normal" });
    updateSelectAllState(); // 新增行后，由于默认是勾选的，需要重新判定一下全选状态
  };
  
  els.enabled.onchange = saveSettings;
  els.disableImagePreview.onchange = saveSettings;
  els.blacklistUrls.oninput = saveSettings;
  els.filterModes.forEach(radio => radio.addEventListener("change", saveSettings));
  
  load();
})();