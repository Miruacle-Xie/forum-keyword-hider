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
  // 新增：用于给命中白名单的父级容器打上“免死金牌”标记
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

  function scan() {
    const url = window.location.href;
    const isBlacklisted = settings.blacklistUrls?.split("\n").some(p => p.trim() && url.includes(p.trim()));
    if (!settings.enabled || isBlacklisted) return;

    const rules = prepareRules();
    if (rules.length === 0) return;

    const isWhitelistMode = settings.filterMode === "show";

    document.querySelectorAll(ROW_SELECTOR).forEach(el => {
      // 避免重复扫描已经加上隐藏标记的元素（黑名单模式下）
      if (!isWhitelistMode && el.hasAttribute(HIDDEN_ATTR)) return;

      const textContent = el.innerText || "";
      const htmlContent = el.outerHTML || "";

      let isMatch = rules.some(rule => {
        return rule.target === "text" ? checkMatch(textContent, rule) : checkMatch(htmlContent, rule);
      });

      const target = (el.tagName === "TR" && el.closest("tbody")?.children.length <= 3) ? el.closest("tbody") : el;

      if (isWhitelistMode) {
        // 【关键修复】如果自身的父级/祖先已经被白名单命中保留，那么子元素也继承保留状态
        if (!isMatch && target.closest(`[${WHITELIST_MATCH_ATTR}]`)) {
          isMatch = true;
        }

        if (!isMatch) {
          target.setAttribute(HIDDEN_ATTR, "1");
          target.style.setProperty("display", "none", "important");
          target.removeAttribute(WHITELIST_MATCH_ATTR); // 清除可能残留的标记
        } else {
          target.removeAttribute(HIDDEN_ATTR);
          target.style.display = "";
          target.setAttribute(WHITELIST_MATCH_ATTR, "1"); // 给命中的容器打上保留标记，庇护它的子元素
        }
      } else {
        // 黑名单模式：命中规则，则隐藏
        if (isMatch) {
          target.setAttribute(HIDDEN_ATTR, "1");
          target.style.setProperty("display", "none", "important");
        }
      }
    });
  }

  // ============== 图片悬停拦截模块 ==============
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
      if (isLikelyPreviewOverlay(el)) {
        el.setAttribute(PREVIEW_HIDDEN_ATTR, "1");
        el.style.setProperty("display", "none", "important");
      }
    });
  }

  function handleImageHover(e) {
    if (!settings.disableImagePreview) return;
    const target = e.target;
    const isImg = target.tagName === "IMG" || target.closest("a")?.querySelector("img") || target.style.backgroundImage;
    if (isImg) {
      lastImageHoverAt = Date.now();
      e.stopImmediatePropagation();
      setTimeout(hidePreviewOverlays, 50);
    }
  }

  // ============== 初始化与监听 ==============
  function injectStyle() {
    if (document.getElementById("fkh-style")) return;
    const style = document.createElement("style");
    style.id = "fkh-style";
    style.textContent = `
      [${HIDDEN_ATTR}] { display: none !important; }
      .fkh-no-zoom img:hover { transform: none !important; scale: 1 !important; }
    `;
    document.documentElement.appendChild(style);
  }

  function init() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, s => {
      settings = s;
      injectStyle();
      document.documentElement.classList.toggle("fkh-no-zoom", !!s.disableImagePreview);
      scan();
    });
  }

  const observer = new MutationObserver(() => {
    scan();
    if (settings.disableImagePreview) hidePreviewOverlays();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  
  ["mouseover", "mouseenter", "mousemove"].forEach(type => {
    document.addEventListener(type, handleImageHover, true);
  });

  chrome.storage.onChanged.addListener(() => {
    // 设置更改时，同时清理隐藏属性和白名单保留标记
    document.querySelectorAll(`[${HIDDEN_ATTR}], [${WHITELIST_MATCH_ATTR}]`).forEach(el => { 
      el.style.display = ""; 
      el.removeAttribute(HIDDEN_ATTR); 
      el.removeAttribute(WHITELIST_MATCH_ATTR);
    });
    init();
  });

  init();
})();