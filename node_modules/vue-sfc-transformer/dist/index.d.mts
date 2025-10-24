import { SFCDescriptor, SFCScriptBlock } from 'vue/compiler-sfc';
import { RootNode } from '@vue/compiler-dom';

/**
 * Pre-transpile script setup block to remove type syntax and replace it with runtime declarations.
 * This function only performs minimal error checking, it means that it will preserve all errors that can be triggered at runtime
 */
declare function preTranspileScriptSetup(sfc: SFCDescriptor, id: string): Promise<SFCScriptBlock>;

declare function transpileVueTemplate(content: string, root: RootNode, offset: number | undefined, transform: (code: string) => Promise<string>): Promise<string>;

export { preTranspileScriptSetup, transpileVueTemplate };
