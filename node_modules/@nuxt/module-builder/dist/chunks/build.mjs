import { existsSync, promises } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, basename, normalize, extname, join, dirname } from 'pathe';
import { filename } from 'pathe/utils';
import { readPackageJSON } from 'pkg-types';
import { parse } from 'tsconfck';
import { defu } from 'defu';
import { createJiti } from 'jiti';
import { createRegExp, anyOf } from 'magic-regexp';
import { consola } from 'consola';
import { resolvePath, findExports, findTypeExports } from 'mlly';
import { defineCommand } from 'citty';
import { convertCompilerOptionsFromJson } from 'typescript';
import { v as version, n as name } from '../shared/module-builder.WIar1ojq.mjs';

const build = defineCommand({
  meta: {
    name: "build",
    description: "Build module for distribution"
  },
  args: {
    cwd: {
      type: "string",
      description: "Current working directory"
    },
    rootDir: {
      type: "positional",
      description: "Root directory",
      required: false
    },
    outDir: {
      type: "string"
    },
    sourcemap: {
      type: "boolean"
    },
    stub: {
      type: "boolean"
    }
  },
  async run(context) {
    const { build } = await import('unbuild');
    const cwd = resolve(context.args.cwd || context.args.rootDir || ".");
    const jiti = createJiti(cwd);
    const outDir = context.args.outDir || "dist";
    await build(cwd, false, {
      declaration: "node16",
      sourcemap: context.args.sourcemap,
      stub: context.args.stub,
      stubOptions: { absoluteJitiPath: true },
      outDir,
      entries: [
        "src/module",
        {
          input: "src/runtime/",
          outDir: `${outDir}/runtime`,
          addRelativeDeclarationExtensions: true,
          ext: "js",
          pattern: [
            "**",
            "!**/*.stories.{js,cts,mts,ts,jsx,tsx}",
            // ignore storybook files
            "!**/*.{spec,test}.{js,cts,mts,ts,jsx,tsx}"
            // ignore tests
          ],
          esbuild: {
            jsxImportSource: "vue",
            jsx: "automatic",
            jsxFactory: "h"
          }
        }
      ],
      rollup: {
        esbuild: {
          target: "esnext"
        },
        emitCJS: false,
        cjsBridge: false
      },
      externals: [
        /dist[\\/]runtime[\\/]/,
        "@nuxt/schema",
        "@nuxt/schema-nightly",
        "@nuxt/schema-edge",
        "@nuxt/kit",
        "@nuxt/kit-nightly",
        "@nuxt/kit-edge",
        "#app",
        "#app/nuxt",
        "nuxt",
        "nuxt-nightly",
        "nuxt-edge",
        "nuxt3",
        "vue",
        "vue-demi"
      ],
      hooks: {
        async "mkdist:entry:options"(_ctx, entry, options) {
          options.typescript = defu(options.typescript, {
            compilerOptions: await loadTSCompilerOptions(entry.input)
          });
        },
        async "rollup:options"(ctx, options) {
          const [entry] = ctx.buildEntries;
          const mergedCompilerOptions = defu({
            noEmit: false,
            paths: {
              "#app/nuxt": ["./node_modules/nuxt/dist/app/nuxt"]
            }
          }, ctx.options.rollup.dts.compilerOptions, await loadTSCompilerOptions(entry.path));
          ctx.options.rollup.dts.compilerOptions = convertCompilerOptionsFromJson(mergedCompilerOptions, entry.path).options;
          options.plugins ||= [];
          if (!Array.isArray(options.plugins))
            options.plugins = [options.plugins];
          const runtimeEntries = ctx.options.entries.filter((entry2) => entry2.builder === "mkdist");
          const runtimeDirs = runtimeEntries.map((entry2) => basename(entry2.input));
          const RUNTIME_RE = createRegExp(anyOf(...runtimeDirs).and(anyOf("/", "\\")));
          options.plugins.unshift({
            name: "nuxt-module-builder:runtime-externals",
            async resolveId(id, importer) {
              if (!RUNTIME_RE.test(id))
                return;
              const resolved = await this.resolve(id, importer, { skipSelf: true });
              if (!resolved)
                return;
              const normalizedId = normalize(resolved.id);
              for (const entry2 of runtimeEntries) {
                if (!entry2.outDir || !normalizedId.includes(entry2.input))
                  continue;
                const name2 = filename(normalizedId) || basename(normalizedId, extname(normalizedId));
                const distFile = await resolvePath(join(dirname(pathToFileURL(normalizedId).href.replace(entry2.input, entry2.outDir)), name2));
                if (distFile) {
                  return {
                    external: true,
                    id: distFile
                  };
                }
              }
            }
          });
        },
        async "rollup:done"(ctx) {
          const moduleEntryPath = resolve(ctx.options.outDir, "module.mjs");
          const moduleFn = await jiti.import(pathToFileURL(moduleEntryPath).toString(), { default: true }).catch((err) => {
            consola.error(err);
            consola.error("Cannot load module. Please check dist:", moduleEntryPath);
            return null;
          });
          if (!moduleFn) {
            return;
          }
          const moduleMeta = await moduleFn.getMeta?.() || {};
          if (ctx.pkg) {
            if (!moduleMeta.name) {
              moduleMeta.name = ctx.pkg.name;
            }
            if (!moduleMeta.version) {
              moduleMeta.version = ctx.pkg.version;
            }
          }
          moduleMeta.builder = {
            [name]: version,
            unbuild: await readPackageJSON("unbuild").then((r) => r.version).catch(() => "unknown")
          };
          const metaFile = resolve(ctx.options.outDir, "module.json");
          await promises.writeFile(metaFile, JSON.stringify(moduleMeta, null, 2), "utf8");
          await writeTypes(ctx.options.outDir, ctx.options.stub);
        },
        async "build:done"(ctx) {
          const logs = [...ctx.warnings].filter((l) => l.startsWith("Potential missing package.json files:"));
          if (logs.filter((l) => l.match(/\.d\.ts/)).length > 0) {
            consola.warn(`\`@nuxt/module-builder\` will no longer generate \`.d.ts\` declaration files. You can update these paths to use the \`.d.mts\` extension instead.`);
          }
          if (logs.filter((l) => l.match(/module\.cjs/)).length > 0) {
            consola.warn(`\`@nuxt/module-builder\` will no longer generate \`module.cjs\` as this is not required for Nuxt v3+. You can safely remove replace this with \`module.mjs\` in your \`package.json\`.`);
          }
          const pkg = await readPackageJSON(cwd);
          if (pkg?.types && !existsSync(resolve(cwd, pkg.types))) {
            consola.warn(`Please remove the \`types\` field from package.json as it is no longer required for Bundler TypeScript module resolution. Instead, you can use \`typesVersions\` to support subpath export types for Node10, if required.`);
          }
        }
      }
    });
  }
});
async function writeTypes(distDir, isStub) {
  const dtsFile = resolve(distDir, "types.d.mts");
  if (existsSync(dtsFile)) {
    return;
  }
  const moduleReExports = [];
  if (!isStub) {
    const moduleTypesFile = resolve(distDir, "module.d.mts");
    const moduleTypes = await promises.readFile(moduleTypesFile, "utf8").catch(() => "");
    const normalisedModuleTypes = moduleTypes.replace(/export\s*\{.*?\}/gs, (match) => match.replace(/\b(type|interface)\b/g, ""));
    for (const e of findExports(normalisedModuleTypes)) {
      moduleReExports.push(e);
    }
    for (const i of findTypeExports(normalisedModuleTypes)) {
      moduleReExports.push(i);
    }
  }
  const appShims = [];
  const schemaShims = [];
  const moduleImports = [];
  const schemaImports = [];
  const moduleExports = [];
  const hasTypeExport = (name2) => isStub || moduleReExports.find((exp) => exp.names?.includes(name2));
  if (!hasTypeExport("ModuleOptions")) {
    schemaImports.push("NuxtModule");
    moduleImports.push("default as Module");
    moduleExports.push(`export type ModuleOptions = typeof Module extends NuxtModule<infer O> ? Partial<O> : Record<string, any>`);
  }
  if (hasTypeExport("ModuleHooks")) {
    moduleImports.push("ModuleHooks");
    schemaShims.push("  interface NuxtHooks extends ModuleHooks {}");
  }
  if (hasTypeExport("ModuleRuntimeHooks")) {
    moduleImports.push("ModuleRuntimeHooks");
    appShims.push(`  interface RuntimeNuxtHooks extends ModuleRuntimeHooks {}`);
  }
  if (hasTypeExport("ModuleRuntimeConfig")) {
    moduleImports.push("ModuleRuntimeConfig");
    schemaShims.push("  interface RuntimeConfig extends ModuleRuntimeConfig {}");
  }
  if (hasTypeExport("ModulePublicRuntimeConfig")) {
    moduleImports.push("ModulePublicRuntimeConfig");
    schemaShims.push("  interface PublicRuntimeConfig extends ModulePublicRuntimeConfig {}");
  }
  const dtsContents = `
  ${schemaImports.length ? `import type { ${schemaImports.join(", ")} } from '@nuxt/schema'` : ""}

${moduleImports.length ? `import type { ${moduleImports.join(", ")} } from './module.mjs'` : ""}

${appShims.length ? `declare module '#app' {
${appShims.join("\n")}
}
` : ""}
${schemaShims.length ? `declare module '@nuxt/schema' {
${schemaShims.join("\n")}
}
` : ""}
${moduleExports.length ? `
${moduleExports.join("\n")}` : ""}
${isStub ? 'export * from "./module.mjs"' : ""}
${moduleReExports.filter((e) => e.type === "named" || e.type === "default").map((e) => `
export { ${e.names.map((n) => (n === "default" ? "" : "type ") + n).join(", ")} } from '${e.specifier || "./module.mjs"}'`).join("\n")}
${moduleReExports.filter((e) => e.type === "star").map((e) => `
export * from '${e.specifier || "./module.mjs"}'`).join("\n")}
`.trim().replace(/[\n\r]{3,}/g, "\n\n") + "\n";
  await promises.writeFile(dtsFile, dtsContents, "utf8");
}
async function loadTSCompilerOptions(path) {
  const config = await parse(path);
  const resolvedCompilerOptions = config?.tsconfig.compilerOptions || {};
  for (const { tsconfig, tsconfigFile } of config.extended || []) {
    for (const alias in tsconfig.compilerOptions?.paths || {}) {
      resolvedCompilerOptions.paths[alias] = resolvedCompilerOptions.paths[alias].map((p) => {
        if (!/^\.{1,2}(?:\/|$)/.test(p)) return p;
        return resolve(dirname(tsconfigFile), p);
      });
    }
  }
  return resolvedCompilerOptions;
}

export { build as default };
