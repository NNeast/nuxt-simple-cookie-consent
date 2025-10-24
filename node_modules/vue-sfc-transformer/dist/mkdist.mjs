import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { t as transpileVueTemplate, p as preTranspileScriptSetup } from './shared/vue-sfc-transformer.anO7Uufk.mjs';
import { parse } from 'vue/compiler-sfc';
import '@babel/parser';
import '@vue/compiler-core';

function toOmit(record, toRemove) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !toRemove.includes(key)));
}

const scriptValidExtensions = /* @__PURE__ */ new Set([".js", ".cjs", ".mjs"]);
const scriptLoader = async (block, { isTs, loadFile }) => {
  if (block.type !== "script") {
    return;
  }
  const extension = isTs ? ".ts" : ".js";
  const input = { extension, content: block.content };
  const context = { isTs, block };
  const files = await loadFile(input, context) || [];
  const output = files.find((file) => scriptValidExtensions.has(file.extension));
  if (!output) {
    return;
  }
  return {
    type: block.type,
    attrs: toOmit(block.attrs, ["lang", "generic"]),
    content: output.content
  };
};

function defineDefaultBlockLoader(options) {
  return async (block, { isTs, loadFile }) => {
    if (options.type !== block.type) {
      return;
    }
    const lang = typeof block.attrs.lang === "string" ? block.attrs.lang : options.defaultLang;
    const extension = `.${lang}`;
    const input = { extension, content: block.content };
    const context = { isTs, block };
    const files = await loadFile(input, context) || [];
    const output = files.find(
      (file) => file.extension === `.${options.defaultLang}` || options.validExtensions?.includes(file.extension)
    );
    if (!output) {
      return;
    }
    return {
      type: block.type,
      attrs: toOmit(block.attrs, ["lang", "generic"]),
      content: output.content
    };
  };
}

const styleLoader = defineDefaultBlockLoader({
  defaultLang: "css",
  type: "style"
});

const templateJsSnippetValidExtensions = /* @__PURE__ */ new Set([".js", ".cjs", ".mjs"]);
const templateLoader = async (block, { isTs, loadFile }) => {
  if (block.type !== "template") {
    return;
  }
  if (!isTs) {
    return;
  }
  const typedBlock = block;
  const snippetExtension = isTs ? ".ts" : ".js";
  const context = { isTs, block };
  const transformed = await transpileVueTemplate(
    // for lower version of @vue/compiler-sfc, `ast.source` is the whole .vue file
    typedBlock.content,
    typedBlock.ast,
    typedBlock.loc.start.offset,
    async (code) => {
      const res = await loadFile(
        { extension: snippetExtension, content: code },
        context
      );
      return res?.find((f) => templateJsSnippetValidExtensions.has(f.extension))?.content || code;
    }
  );
  return {
    type: "template",
    attrs: typedBlock.attrs,
    content: transformed
  };
};

function cleanupBreakLine(str) {
  return str.replaceAll(/(\n\n)\n+/g, "\n\n").replace(/^\s*\n|\n\s*$/g, "");
}

function defineVueSFCTransformer(options) {
  const { blockLoaders = {} } = options || {};
  return async (input, { path, srcPath, loadFile, verifySFC }) => {
    let modified = false;
    const sfc = parse(input, { filename: srcPath, ignoreEmpty: true });
    if (sfc.errors.length > 0) {
      for (const error of sfc.errors) {
        console.error(error);
      }
      throw new Error(`[vue-sfc-transformer] ${srcPath} has errors`);
    }
    const isTs = [sfc.descriptor.script, sfc.descriptor.scriptSetup].some(
      (block) => block?.lang === "ts"
    );
    const blocks = [
      ...sfc.descriptor.styles,
      ...sfc.descriptor.customBlocks
    ].filter((item) => !!item);
    if (sfc.descriptor.template) {
      blocks.unshift(sfc.descriptor.template);
    }
    if (sfc.descriptor.script) {
      blocks.unshift(sfc.descriptor.script);
    }
    if (sfc.descriptor.scriptSetup && srcPath) {
      blocks.unshift(
        isTs ? await preTranspileScriptSetup(sfc.descriptor, srcPath) : sfc.descriptor.scriptSetup
      );
    }
    const loaderContext = { isTs, path, srcPath, raw: input, sfc, loadFile };
    const results = await Promise.all(blocks.map(async (block) => {
      const blockLoader = blockLoaders[block.type];
      const result = await blockLoader?.(block, loaderContext).catch((cause) => {
        throw new Error(`[vue-sfc-transformer] Failed to load the ${block.type} block in ${srcPath}`, { cause });
      });
      if (result) {
        modified = true;
      }
      return { block: result || block, offset: block.loc.start.offset };
    }));
    if (!modified) {
      return input;
    }
    const contents = results.sort((a, b) => a.offset - b.offset).map(({ block }) => {
      const attrs = Object.entries(block.attrs).map(([key, value]) => {
        if (!value) {
          return void 0;
        }
        return value === true ? key : `${key}="${value}"`;
      }).filter((item) => !!item).join(" ");
      const header = `<${`${block.type} ${attrs}`.trim()}>`;
      const footer = `</${block.type}>`;
      return `${header}
${cleanupBreakLine(block.content)}
${footer}
`;
    }).filter((item) => !!item).join("\n");
    if (verifySFC || process.env.VERIFY_VUE_FILES) {
      const { errors } = parse(contents, {
        filename: srcPath,
        ignoreEmpty: true
      });
      if (errors.length > 0) {
        for (const error of errors) {
          console.error(error);
        }
        throw new Error(`[vue-sfc-transformer] ${srcPath} has errors`);
      }
    }
    return contents;
  };
}

let cachedEsbuild;
function importEsbuild() {
  if (cachedEsbuild) {
    return cachedEsbuild;
  }
  return (async () => {
    const esbuild = await import('esbuild');
    cachedEsbuild = esbuild;
    return esbuild;
  })();
}
function isMkdistSupportDualVueDts() {
  try {
    const require = createRequire(import.meta.url);
    const mkdistPath = require.resolve("mkdist").replace(/\\/g, "/");
    const lastNodeModules = mkdistPath.lastIndexOf("/mkdist/");
    const withoutDist = lastNodeModules !== -1 ? mkdistPath.slice(0, lastNodeModules) : mkdistPath;
    const packageJson = readFileSync(join(withoutDist, "mkdist/package.json"), "utf-8");
    const { version = "0.0.0" } = JSON.parse(packageJson);
    const [major = 0, minor = 0, patch = 0] = version.split(".").map((n) => Number.parseInt(n));
    const normalizedVersion = major * 1e6 + minor * 1e3 + patch;
    return !Number.isNaN(normalizedVersion) && normalizedVersion > 2003e3;
  } catch (error) {
    console.error(`Error checking mkdist version: ${error}`);
    return false;
  }
}
const vueSFCTransformer = defineVueSFCTransformer({
  blockLoaders: {
    template: templateLoader,
    script: scriptLoader,
    style: styleLoader
  }
});
const vueLoader = async (input, mkdistContext) => {
  if (input.extension !== ".vue") {
    return;
  }
  const { transform } = await importEsbuild();
  const path = input.path;
  const srcPath = input.srcPath || resolve(input.path);
  const loadFile = async (file, context) => {
    if (context.block.type === "script") {
      const { code } = await transform(file.content, {
        ...mkdistContext.options.esbuild,
        loader: "ts",
        tsconfigRaw: { compilerOptions: { target: "ESNext", verbatimModuleSyntax: true } }
      });
      return [{ extension: ".js", content: code }];
    }
    const result2 = await mkdistContext.loadFile({
      getContents: () => file.content,
      path: `${path}.${file.extension}`,
      srcPath: `${srcPath}.${file.extension}`,
      extension: file.extension
    });
    return result2?.filter((res) => res.contents).map((res) => ({
      extension: res.extension || file.extension,
      content: res.contents
    })) || [];
  };
  const result = await vueSFCTransformer(await input.getContents(), {
    path: input.path,
    srcPath: input.srcPath || resolve(input.path),
    loadFile,
    // @ts-expect-error internal flag for testing
    verifySFC: mkdistContext.options._verify
  });
  const dts = (await mkdistContext.loadFile({
    path: `${input.path}.js`,
    srcPath: `${input.srcPath}.js`,
    extension: ".js",
    getContents: () => "export default {}"
  }))?.filter((f) => f.declaration) || [];
  if (dts.length && isMkdistSupportDualVueDts()) {
    dts.push({
      contents: await input.getContents(),
      path: input.path,
      srcPath: input.srcPath,
      extension: ".d.vue.ts",
      declaration: true
    });
  }
  return [
    {
      path: input.path,
      srcPath: input.srcPath,
      extension: ".vue",
      contents: result,
      declaration: false
    },
    ...dts
  ];
};

export { vueLoader };
