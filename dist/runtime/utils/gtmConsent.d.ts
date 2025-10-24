import type { GTMConsentField } from '../../types/gtm.js';
type GtagConsentCommands = ['consent', 'update', Record<string, 'granted' | 'denied'>];
type GtagConfigCommand = ['config', string, Record<string, unknown>?];
type GtagEventCommand = ['event', string, Record<string, unknown>?];
type GtagFunction = (...args: GtagConsentCommands | GtagConfigCommand | GtagEventCommand) => void;
declare global {
    interface Window {
        gtag?: GtagFunction;
    }
}
export declare function sendConsentToGTM(preferences: Record<string, boolean>, mapping: Record<string, GTMConsentField>): void;
export {};
