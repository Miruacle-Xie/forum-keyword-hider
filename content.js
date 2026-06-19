(() => {
  "use strict";

  const DEFAULT_SETTINGS = {
    enabled: true,
    filterMode: "hide",
    disableImagePreview: false,
    keywordItems: [],
    blacklistUrls: "viewthread\nthread-"
  };

  let settings = { ...DEFAULT_SETTINGS };
  const HIDDEN_ATTR = "data-fkh-hidden";
  const PREVIEW_HIDDEN_ATTR = "data-fkh-preview-hidden";
  const WHITELIST_MATCH_ATTR = "data-fkh-whitelist-match"; 
  const ROW_SELECTOR = "tbody, tr, li, article, .thread, .topic, [class*='thread' i], [class*='post' i]";
  
  let lastImageHoverAt = 0;

  function prepareRules() {
    return (settings.keywordItems || [])
      .filter(item => item.enabled && item.text)
      .map(item => {
        let matcher;
        if (item.type === "regex") {
          try { matcher = new RegExp(item.text, "i"); } catch (e) { return null; }
        } else {
          matcher = item.text.toLowerCase();
        }
        return { ...item, matcher };
      }).filter(Boolean);
  }

  function checkMatch(content, rule) {
    if (rule.type === "regex") return rule.matcher.test(content);
    return content.toLowerCase().includes(rule.matcher);
  }

  // ============== 帖子过滤模块 ==============
  // 表格中的 tbody/tr 如果直接 display:none，会让 table-layout:auto 重新计算列宽，
  // 造成剩余帖子整体向右偏移。对表格行/行组使用 visibility:collapse，
  // 可以移除对应行，同时尽量保留原来的列宽计算。
  function hideFilterTarget(target) {
    if (!target) return;

    const isTablePart = target.tagName === "TBODY" || target.tagName === "TR";
    target.setAttribute(HIDDEN_ATTR, isTablePart ? "collapse" : "hide");

    // 清理旧版本可能留下的内联样式，具体隐藏方式交给 injectStyle 中的规则。
    target.style.removeProperty("display");
    target.style.removeProperty("visibility");
  }

  function showFilterTarget(target) {
    if (!target) return;
    target.removeAttribute(HIDDEN_ATTR);
    target.style.removeProperty("display");
    target.style.removeProperty("visibility");
  }

  function scan() {
    const url = window.location.href;
    const isBlacklisted = settings.blacklistUrls?.split("\n").some(p => p.trim() && url.includes(p.trim()));
    if (!settings.enabled || isBlacklisted) return;

    const rules = prepareRules();
    if (rules.length === 0) return;

    const isWhitelistMode = settings.filterMode === "show";

    document.querySelectorAll(ROW_SELECTOR).forEach(el => {
      // 加装隔离：即使单个元素判定报错，也不会阻断整个插件
      try {
        if (!isWhitelistMode && el.hasAttribute(HIDDEN_ATTR)) return;

        const textContent = el.innerText || "";
        const htmlContent = el.outerHTML || "";

        let isMatch = rules.some(rule => {
          return rule.target === "text" ? checkMatch(textContent, rule) : checkMatch(htmlContent, rule);
        });

        // 更安全的节点寻找方式
        let target = el;
        if (el.tagName === "TR") {
          const tbody = el.closest("tbody");
          if (tbody && tbody.children && tbody.children.length <= 3) {
            target = tbody;
          }
        }

        if (isWhitelistMode) {
          if (!isMatch && target.closest && target.closest(`[${WHITELIST_MATCH_ATTR}]`)) {
            isMatch = true;
          }

          if (!isMatch) {
            hideFilterTarget(target);
            target.removeAttribute(WHITELIST_MATCH_ATTR);
          } else {
            showFilterTarget(target);
            target.setAttribute(WHITELIST_MATCH_ATTR, "1");
          }
        } else {
          if (isMatch) {
            hideFilterTarget(target);
          }
        }
      } catch (err) {
        // 静默处理，保障后续流程
      }
    });
  }

  // ============== 图片悬停拦截模块 (100% 还原 V2 逻辑) ==============
  function isLikelyPreviewOverlay(el) {
    if (!el || el.nodeType !== 1 || el.hasAttribute(PREVIEW_HIDDEN_ATTR)) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    
    const zIndex = parseInt(cs.zIndex, 10);
    const isFloating = cs.position === "fixed" || cs.position === "absolute" || zIndex > 10;
    if (!isFloating || !el.querySelector("img")) return false;
    
    return (el.innerText || "").length < 500;
  }

  function hidePreviewOverlays() {
    if (!settings.disableImagePreview || Date.now() - lastImageHoverAt > 2500) return;
    document.querySelectorAll("body > div, body > section").forEach(el => {
      try {
        if (isLikelyPreviewOverlay(el)) {
          el.setAttribute(PREVIEW_HIDDEN_ATTR, "1");
          el.style.setProperty("display", "none", "important");
        }
      } catch (e) {}
    });
  }

  function handleImageHover(e) {
    if (!settings.disableImagePreview) return;
    try {
      const target = e.target;
      if (!target || target.nodeType !== 1) return; // 确保是 DOM 元素

      const isImg = target.tagName === "IMG" || 
                  (target.closest && target.closest("a")?.querySelector("img")) || 
                  (target.style && target.style.backgroundImage);
                  
      if (isImg) {
        lastImageHoverAt = Date.now();
        e.stopImmediatePropagation();
        setTimeout(hidePreviewOverlays, 50);
      }
    } catch (err) {}
  }

  // ============== 初始化与监听 ==============
  function injectStyle() {
    if (document.getElementById("fkh-style")) return;
    const style = document.createElement("style");
    style.id = "fkh-style";
    style.textContent = `
      [${HIDDEN_ATTR}="hide"] {
        display: none !important;
      }

      tbody[${HIDDEN_ATTR}="collapse"],
      tr[${HIDDEN_ATTR}="collapse"] {
        visibility: collapse !important;
      }

      .fkh-no-zoom img:hover {
        transform: none !important;
        scale: 1 !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function init() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, s => {
      settings = s;
      injectStyle();
      document.documentElement.classList.toggle("fkh-no-zoom", !!s.disableImagePreview);
      try { scan(); } catch (e) {}
    });
  }

  // 双重保险：过滤和图片拦截彼此隔离，谁也不影响谁
  const observer = new MutationObserver(() => {
    try { scan(); } catch (e) {}
    try { if (settings.disableImagePreview) hidePreviewOverlays(); } catch (e) {}
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  ["mouseover", "mouseenter", "mousemove"].forEach(type => {
    document.addEventListener(type, handleImageHover, true);
  });

  chrome.storage.onChanged.addListener(() => {
    document.querySelectorAll(`[${HIDDEN_ATTR}], [${WHITELIST_MATCH_ATTR}], [${PREVIEW_HIDDEN_ATTR}]`).forEach(el => { 
      el.style.removeProperty("display");
      el.style.removeProperty("visibility");
      el.removeAttribute(HIDDEN_ATTR); 
      el.removeAttribute(WHITELIST_MATCH_ATTR);
      el.removeAttribute(PREVIEW_HIDDEN_ATTR);
    });
    init();
  });

  init();
})();