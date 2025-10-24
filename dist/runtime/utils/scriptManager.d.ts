import type { GTMConsentField } from '../../types/gtm.js';
import type { CookieScript } from '../../types/cookies.js';
export declare function injectScripts(scripts: CookieScript[], acceptedCategories: Record<string, boolean>, gtmConsentMapping?: Record<string, GTMConsentField>): void;
export declare function removeScripts(acceptedCategories: Record<string, boolean>): void;
