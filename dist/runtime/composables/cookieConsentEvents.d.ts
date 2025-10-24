type CookieConsentEvent = {
    type: 'consentAccepted';
} | {
    type: 'consentDenied';
} | {
    type: 'categoryAccepted';
    category: string;
} | {
    type: 'scriptsInjected';
    category: string;
} | {
    type: 'scriptsRemoved';
    category: string;
};
type Listener = (event: CookieConsentEvent) => void;
export declare function emitCookieConsentEvent(event: CookieConsentEvent): void;
export declare function onCookieConsentEvent(callback: Listener): void;
export declare function onConsentAccepted(cb: () => void): void;
export declare function onConsentDenied(cb: () => void): void;
export declare function onCategoryAccepted(cb: (category: string) => void): void;
export declare function onScriptsInjected(cb: (category: string) => void): void;
export declare function onScriptsRemoved(cb: (category: string) => void): void;
export {};
