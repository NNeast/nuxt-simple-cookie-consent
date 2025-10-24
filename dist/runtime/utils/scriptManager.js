import { emitCookieConsentEvent } from "../composables/cookieConsentEvents.js";
import { sendConsentToGTM } from "./gtmConsent.js";
export function injectScripts(scripts, acceptedCategories, gtmConsentMapping) {
  const injected = /* @__PURE__ */ new Set();
  const injectedCategories = /* @__PURE__ */ new Set();
  for (const script of scripts) {
    if (!script.categories.some((cat) => acceptedCategories[cat])) continue;
    if (document.getElementById(`cookie-script-${script.id}`)) continue;
    if (injected.has(script.id)) continue;
    const el = document.createElement("script");
    el.id = `cookie-script-${script.id}`;
    el.setAttribute("data-type", "gdpr");
    el.setAttribute("data-categories", script.categories.join(","));
    el.src = script.src || "";
    el.async = script.async ?? true;
    el.defer = script.defer ?? false;
    el.type = script.type ?? "text/javascript";
    if (script.customContent) {
      const inline = document.createElement("script");
      inline.id = `cookie-script-inline-${script.id}`;
      inline.setAttribute("data-type", "gdpr");
      inline.setAttribute("data-categories", script.categories.join(","));
      inline.type = "text/javascript";
      inline.innerHTML = script.customContent;
      document.head.appendChild(inline);
    }
    if (script.customHTML) {
      const container = document.createElement("div");
      container.id = `cookie-html-${script.id}`;
      container.setAttribute("data-type", "gdpr");
      container.setAttribute("data-categories", script.categories.join(","));
      container.innerHTML = script.customHTML;
      document.body.appendChild(container);
    }
    document.head.appendChild(el);
    injected.add(script.id);
    script.categories.filter((cat) => acceptedCategories[cat]).forEach((cat) => injectedCategories.add(cat));
  }
  if (import.meta.client && gtmConsentMapping) {
    setTimeout(() => {
      if (gtmConsentMapping) {
        return sendConsentToGTM(acceptedCategories, gtmConsentMapping);
      }
    }, 300);
  }
  for (const category of injectedCategories) {
    if (category && typeof category === "string") {
      emitCookieConsentEvent({ type: "categoryAccepted", category });
    }
  }
}
export function removeScripts(acceptedCategories) {
  const removedCategories = /* @__PURE__ */ new Set();
  const allScripts = document.querySelectorAll('script[data-type="gdpr"]');
  allScripts.forEach((el) => {
    const isGTM = el.getAttribute("src")?.includes("googletagmanager.com/gtag/js");
    if (isGTM) return;
    const rawCategories = el.getAttribute("data-categories") || "";
    const categories = rawCategories.split(",").map((c) => c.trim()).filter(Boolean);
    const stillAllowed = categories.some((cat) => acceptedCategories[cat]);
    if (!stillAllowed) {
      el.remove();
      categories.forEach((cat) => removedCategories.add(cat));
    }
  });
  for (const category of removedCategories) {
    emitCookieConsentEvent({ type: "scriptsRemoved", category });
  }
}
