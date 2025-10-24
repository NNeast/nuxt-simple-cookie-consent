const listeners = [];
export function emitCookieConsentEvent(event) {
  listeners.forEach((listener) => listener(event));
}
export function onCookieConsentEvent(callback) {
  listeners.push(callback);
}
export function onConsentAccepted(cb) {
  onCookieConsentEvent((event) => {
    if (event.type === "consentAccepted") cb();
  });
}
export function onConsentDenied(cb) {
  onCookieConsentEvent((event) => {
    if (event.type === "consentDenied") cb();
  });
}
export function onCategoryAccepted(cb) {
  onCookieConsentEvent((event) => {
    if (event.type === "categoryAccepted") cb(event.category);
  });
}
export function onScriptsInjected(cb) {
  onCookieConsentEvent((event) => {
    if (event.type === "scriptsInjected") cb(event.category);
  });
}
export function onScriptsRemoved(cb) {
  onCookieConsentEvent((event) => {
    if (event.type === "scriptsRemoved") cb(event.category);
  });
}
