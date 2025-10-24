import { injectScripts } from "./utils/scriptManager.js";
import { defineNuxtPlugin, useCookie, useRuntimeConfig, useState } from "#app";
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig().public.cookieConsent;
  const cookieName = config.cookieName || "cookie_consent";
  const expiresInDays = config.expiresInDays ?? 180;
  const maxAgeInSeconds = expiresInDays * 24 * 60 * 60;
  const expiresDate = new Date(Date.now() + maxAgeInSeconds * 1e3);
  const stored = useCookie(cookieName, {
    sameSite: "lax",
    maxAge: maxAgeInSeconds,
    expires: expiresDate,
    path: "/"
  }, {
    watch: true
  });
  const versionCookie = useCookie("cookie_consent_version", {
    sameSite: "lax",
    maxAge: maxAgeInSeconds,
    expires: expiresDate,
    path: "/"
  });
  const timestampCookie = useCookie("cookie_consent_timestamp", {
    sameSite: "lax",
    maxAge: maxAgeInSeconds,
    expires: expiresDate,
    path: "/"
  });
  const expiresInMs = (config.expiresInDays ?? 180) * 24 * 60 * 60 * 1e3;
  const now = Date.now();
  const defaultPrefs = Object.entries(config.categories).reduce((acc, [key, meta]) => {
    acc[key] = meta.required ? true : null;
    return acc;
  }, {});
  const isExpired = timestampCookie.value ? now - timestampCookie.value > expiresInMs : false;
  const isOutdatedVersion = versionCookie.value !== config.consentVersion;
  const state = useState("cookieConsent", () => {
    if (isExpired || isOutdatedVersion) {
      stored.value = null;
      timestampCookie.value = null;
      versionCookie.value = null;
      return defaultPrefs;
    }
    return stored.value ?? defaultPrefs;
  });
  if (import.meta.client && Array.isArray(config.scripts)) {
    const hasUserMadeChoice = Object.entries(config.categories).some(([key, meta]) => {
      const categoryMeta = meta;
      if (categoryMeta.required) return false;
      return state.value[key] !== null && state.value[key] !== void 0;
    });
    if (hasUserMadeChoice) {
      const acceptedCategories = Object.fromEntries(
        Object.entries(state.value).filter(([_, v]) => v === true)
      );
      if (import.meta.client) {
        injectScripts(config.scripts, acceptedCategories, config.gtmConsentMapping);
      }
    }
  }
});
