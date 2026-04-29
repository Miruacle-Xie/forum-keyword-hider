(() => {
  "use strict";

  let settings = {};
  const HIDDEN_ATTR = "data-fkh-hidden";
  const ROW_SELECTOR = "tbody, tr, li, article, .thread, .topic, [class*='thread' i]";

  // 1. 预编译匹配规则
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
    if (rule.type === "regex") {
      return rule.matcher.test(content);
    } else {
      return content.toLowerCase().includes(rule.matcher);
    }
  }

  function scan() {
    const url = window.location.href;
    const isBlacklisted = settings.blacklistUrls?.split("\n").some(p => p.trim() && url.includes(p.trim()));
    if (!settings.enabled || isBlacklisted) return;

    const rules = prepareRules();
    if (rules.length === 0) return;

    document.querySelectorAll(ROW_SELECTOR).forEach(el => {
      if (el.hasAttribute(HIDDEN_ATTR)) return;

      const textContent = el.innerText || "";
      const htmlContent = el.outerHTML || "";

      const shouldHide = rules.some(rule => {
        if (rule.target === "text") {
          return checkMatch(textContent, rule);
        } else {
          // 匹配代码属性
          return checkMatch(htmlContent, rule);
        }
      });

      if (shouldHide) {
        // 向上寻找最合适的隐藏容器（防止只隐藏了半行）
        const target = el.tagName === "TR" && el.closest("tbody")?.children.length <= 3 
                       ? el.closest("tbody") : el;
        target.setAttribute(HIDDEN_ATTR, "1");
        target.style.display = "none";
      }
    });
  }

  // 2. 监听与初始化
  function init() {
    chrome.storage.sync.get(null, s => {
      settings = s;
      if (!document.getElementById("fkh-style")) {
        const style = document.createElement("style");
        style.id = "fkh-style";
        style.textContent = `[${HIDDEN_ATTR}] { display: none !important; }`;
        document.documentElement.appendChild(style);
      }
      scan();
    });
  }

  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  chrome.storage.onChanged.addListener(() => {
    // 设置改变时，先清理旧的隐藏痕迹再重扫
    document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach(el => {
      el.removeAttribute(HIDDEN_ATTR);
      el.style.display = "";
    });
    init();
  });

  init();
})();(() => {
  "use strict";

  const DEFAULT_SETTINGS = {
    enabled: true,
    disableImagePreview: false,
    keywordItems: [],
    blacklistUrls: "viewthread\nthread-"
  };

  let settings = { ...DEFAULT_SETTINGS };
  const HIDDEN_ATTR = "data-fkh-hidden";
  const PREVIEW_HIDDEN_ATTR = "data-fkh-preview-hidden";
  const ROW_SELECTOR = "tbody, tr, li, article, .thread, .topic, [class*='thread' i], [class*='post' i]";
  
  let lastImageHoverAt = 0;
  let scanTimer = null;

  // --- 1. 规则预编译 ---
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

  // --- 2. 核心扫描逻辑 ---
  function scan() {
    const url = window.location.href;
    const isBlacklisted = settings.blacklistUrls?.split("\n").some(p => p.trim() && url.includes(p.trim()));
    if (!settings.enabled || isBlacklisted) return;

    const rules = prepareRules();
    if (rules.length === 0) return;

    document.querySelectorAll(ROW_SELECTOR).forEach(el => {
      if (el.hasAttribute(HIDDEN_ATTR)) return;

      const textContent = el.innerText || "";
      const htmlContent = el.outerHTML || "";

      const shouldHide = rules.some(rule => {
        return rule.target === "text" ? checkMatch(textContent, rule) : checkMatch(htmlContent, rule);
      });

      if (shouldHide) {
        const target = (el.tagName === "TR" && el.closest("tbody")?.children.length <= 3) ? el.closest("tbody") : el;
        target.setAttribute(HIDDEN_ATTR, "1");
        target.style.setProperty("display", "none", "important");
      }
    });
  }

  // --- 3. 恢复：图片预览拦截逻辑 ---
  function isLikelyPreviewOverlay(el) {
    if (!el || el.nodeType !== 1 || el.hasAttribute(PREVIEW_HIDDEN_ATTR)) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    
    // 通用识别规则：高层级、绝对/固定定位、包含图片、文本较少
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

  // --- 4. 初始化 ---
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

  // 监听
  const observer = new MutationObserver(() => {
    scan();
    if (settings.disableImagePreview) hidePreviewOverlays();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  ["mouseover", "mouseenter", "mousemove"].forEach(type => {
    document.addEventListener(type, handleImageHover, true);
  });

  chrome.storage.onChanged.addListener(() => {
    document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach(el => { el.style.display = ""; el.removeAttribute(HIDDEN_ATTR); });
    init();
  });

  init();
})();