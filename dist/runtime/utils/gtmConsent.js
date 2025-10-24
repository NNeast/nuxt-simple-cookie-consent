export function sendConsentToGTM(preferences, mapping) {
  const gtmScript = document.querySelector('script[src*="googletagmanager.com/gtag/js"]');
  if (!gtmScript || typeof window.gtag !== "function") return;
  const consent = {};
  for (const [category, consentField] of Object.entries(mapping)) {
    if (preferences[category] !== void 0) {
      consent[consentField] = preferences[category] ? "granted" : "denied";
    }
  }
  window.gtag("consent", "update", consent);
  console.log("[DEBUG] Sending GTM consent update:", consent);
}
