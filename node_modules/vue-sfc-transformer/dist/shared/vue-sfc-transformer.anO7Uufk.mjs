import { parse } from '@babel/parser';
import { MagicString, extractRuntimeProps, extractRuntimeEmits, inferRuntimeType } from 'vue/compiler-sfc';
import { isMemberExpressionBrowser, isFnExpressionBrowser } from '@vue/compiler-core';

const DEFINE_EMITS = "defineEmits";
const DEFINE_PROPS = "defineProps";
const WITH_DEFAULTS = "withDefaults";
const DEFINE_MODEL = "defineModel";
async function preTranspileScriptSetup(sfc, id) {
  if (!sfc.scriptSetup) {
    throw new Error("[vue-sfc-transformer] No script setup block found");
  }
  const context = await prepareContext(sfc, id);
  const resultBuilder = new MagicString(sfc.scriptSetup.content);
  for (const node of context.ctx.ast) {
    if (node.type === "ExpressionStatement") {
      const processedTypeSyntax = processDefineProps(node.expression, context) || processDefineEmits(node.expression, context) || processWithDefaults(node.expression, context) || processDefineModel(node.expression, context);
      if (processedTypeSyntax !== void 0) {
        resultBuilder.overwrite(node.start, node.end, processedTypeSyntax);
      }
    }
    if (node.type === "VariableDeclaration" && !node.declare) {
      const total = node.declarations.length;
      for (let i = 0; i < total; i += 1) {
        const decl = node.declarations[i];
        if (!decl.init) {
          continue;
        }
        const processedTypeSyntax = processDefineProps(decl.init, context) || processDefineEmits(decl.init, context) || processWithDefaults(decl.init, context) || processDefineModel(decl.init, context);
        if (processedTypeSyntax !== void 0) {
          resultBuilder.overwrite(
            decl.init.start,
            decl.init.end,
            processedTypeSyntax
          );
        }
      }
    }
  }
  return {
    ...sfc.scriptSetup,
    content: resultBuilder.toString()
  };
}
function processDefineProps(node, context) {
  if (!isCallOf(node, DEFINE_PROPS)) {
    return;
  }
  const propsRuntimeDecl = node.arguments[0];
  if (!node.typeParameters) {
    return;
  }
  if (propsRuntimeDecl) {
    context.ctx.error(
      `${DEFINE_PROPS}() cannot accept both type and non-type arguments at the same time. Use one or the other.`,
      node
    );
  }
  const propsTypeDecl = node.typeParameters.params[0];
  if (!propsTypeDecl) {
    return;
  }
  context.ctx.propsTypeDecl = propsTypeDecl;
  const propsStr = extractRuntimeProps(context.ctx) || "{}";
  return `${DEFINE_PROPS}(${propsStr})`;
}
function processDefineEmits(node, context) {
  if (!isCallOf(node, DEFINE_EMITS)) {
    return;
  }
  if (!node.typeParameters) {
    return;
  }
  const emitsRuntimeDecl = node.arguments[0];
  if (emitsRuntimeDecl) {
    context.ctx.error(
      `${DEFINE_EMITS}() cannot accept both type and non-type arguments at the same time. Use one or the other.`,
      node
    );
  }
  const emitsTypeDecl = node.typeParameters.params[0];
  if (!emitsTypeDecl) {
    return;
  }
  context.ctx.emitsTypeDecl = emitsTypeDecl;
  const emits = extractRuntimeEmits(context.ctx);
  return `defineEmits([${[...emits].map((emit) => `"${emit}"`).join(", ")}])`;
}
function processWithDefaults(node, context) {
  if (!isCallOf(node, WITH_DEFAULTS)) {
    return;
  }
  context.ctx.propsRuntimeDefaults = node.arguments[1];
  const res = processDefineProps(node.arguments[0], context);
  if (!res) {
    context.ctx.error(
      `${WITH_DEFAULTS}' first argument must be a ${DEFINE_PROPS} call.`,
      node.arguments[0] || node
    );
  }
  if (!context.ctx.propsTypeDecl) {
    context.ctx.error(
      `${WITH_DEFAULTS} can only be used with type-based ${DEFINE_PROPS} declaration.`,
      node
    );
  }
  if (!context.ctx.propsRuntimeDefaults) {
    context.ctx.error(
      `The 2nd argument of ${WITH_DEFAULTS} is required.`,
      node
    );
  }
  return res;
}
function processDefineModel(node, context) {
  if (!isCallOf(node, DEFINE_MODEL)) {
    return;
  }
  const [modelNameDecl, modelRuntimeDecl] = getDefineModelRuntimeDecl(
    node,
    context
  );
  const modelTypeDecl = node.typeParameters?.params[0];
  if (!modelTypeDecl) {
    return;
  }
  let model = inferRuntimeType(context.ctx, modelTypeDecl);
  let skipCheck = false;
  const hasBoolean = model.includes("Boolean");
  const hasFunction = model.includes("Function");
  const hasUnknownType = model.includes("Unknown");
  if (hasUnknownType) {
    if (hasBoolean || hasFunction) {
      skipCheck = true;
      model = model.filter((t) => t !== "Unknown");
    } else {
      model = ["null"];
    }
  }
  if (!model || model.length === 0) {
    return;
  }
  model.length === 1 ? { name: model[0] } : {
    elements: model.map(
      (name) => ({ type: "Identifier", name })
    )
  };
  const codegenArgs = [];
  if (modelNameDecl) {
    codegenArgs.push(`"${modelNameDecl.value}"`);
  }
  const codegenType = model.length === 1 ? model[0] : `[${model.join(", ")}]`;
  const codegenSkipCheck = skipCheck ? "skipCheck: true" : "";
  const codegenExtra = modelRuntimeDecl ? `...${context.ctx.getString(modelRuntimeDecl)}` : "";
  codegenArgs.push(`{ ${[`type: ${codegenType}`, codegenSkipCheck, codegenExtra].filter((s) => !!s).join(", ")} }`);
  return `${DEFINE_MODEL}(${codegenArgs.join(", ")})`;
}
function getDefineModelRuntimeDecl(node, context) {
  const [arg0, arg1] = node.arguments;
  if (arg0 && arg0.type === "StringLiteral") {
    if (arg1 && arg1.type !== "ObjectExpression") {
      context.ctx.error(`${DEFINE_MODEL}()'s second argument must be an object.`, arg1);
    }
    return [arg0, arg1];
  }
  if (arg0 && arg0.type !== "ObjectExpression" && !(arg0.type === "Identifier" && arg0.name === "undefined")) {
    context.ctx.error(`Unexpected argument type for ${DEFINE_MODEL}().`, arg0);
  }
  return [void 0, arg0];
}
async function prepareContext({ script, scriptSetup }, id) {
  const helper = /* @__PURE__ */ new Set();
  const ast = parse(`${scriptSetup.content}
${script?.content}`, {
    sourceType: "module",
    plugins: ["tsx", "jsx"].includes(scriptSetup.lang) ? ["typescript", "jsx"] : ["typescript"]
  });
  const ctx = {
    filename: id,
    source: scriptSetup.content,
    ast: ast.program.body,
    error: (msg) => {
      throw new Error(`[vue-sfc-transformer] ${msg}`);
    },
    helper: (key) => {
      helper.add(key);
      return `_${key}`;
    },
    getString: (node) => {
      return scriptSetup.content.slice(node.start, node.end);
    },
    propsTypeDecl: void 0,
    propsRuntimeDefaults: void 0,
    propsDestructuredBindings: /* @__PURE__ */ Object.create(null),
    emitsTypeDecl: void 0,
    isCE: false,
    options: {}
  };
  return {
    ctx
  };
}
function isCallOf(node, test) {
  return !!(node && node.type === "CallExpression" && node.callee.type === "Identifier" && (typeof test === "string" ? node.callee.name === test : test(node.callee.name)));
}

function handleNode(node, addExpression, track) {
  if (!node) {
    return;
  }
  const currentTrack = [...track, node];
  const search = (node2) => handleNode(node2, addExpression, currentTrack);
  switch (node.type) {
    case 0 /* ROOT */: {
      for (const child of node.children) {
        search(child);
      }
      return;
    }
    case 1 /* ELEMENT */: {
      const nodes = [...node.children, ...node.props];
      for (const child of nodes) {
        search(child);
      }
      return;
    }
    case 2 /* TEXT */: {
      return;
    }
    case 3 /* COMMENT */: {
      return;
    }
    case 4 /* SIMPLE_EXPRESSION */: {
      if (node.ast === null || node.ast === false) {
        return;
      }
      addExpression({ loc: node.loc, src: node.content, track: currentTrack });
      return;
    }
    case 5 /* INTERPOLATION */: {
      search(node.content);
      return;
    }
    case 6 /* ATTRIBUTE */: {
      search(node.value);
      return;
    }
    case 7 /* DIRECTIVE */: {
      const nodes = [
        ...node.forParseResult ? [
          node.forParseResult?.source,
          node.forParseResult?.value,
          node.forParseResult?.key,
          node.forParseResult?.index
        ] : [node.exp],
        // node.arg,
        ...node.modifiers
      ].filter((item) => !!item);
      for (const child of nodes) {
        search(child);
      }
      return;
    }
    case 8 /* COMPOUND_EXPRESSION */: {
      if (!node.ast) {
        return;
      }
      addExpression({ loc: node.loc, src: node.loc.source, track: currentTrack });
      return;
    }
    // case NodeTypes.IF:
    // case NodeTypes.FOR:
    // case NodeTypes.TEXT_CALL:
    default: {
      throw new Error(`Unexpected node type: ${node.type}`);
    }
  }
}
async function transpileVueTemplate(content, root, offset = 0, transform) {
  const expressions = [];
  handleNode(root, (...items) => expressions.push(...items), []);
  if (expressions.length === 0) {
    return content;
  }
  const s = new MagicString(content);
  const transformMap = await transformJsSnippets(expressions, transform);
  for (const item of expressions) {
    item.replacement = transformMap.get(item) ?? item.src;
    if (!shouldReplaceQuote(item)) {
      continue;
    }
    const sourceQuote = getSourceQuote(
      content,
      item.loc.start.offset - offset,
      item.loc.end.offset - offset
    );
    if (sourceQuote !== null) {
      const search = sourceQuote === `"` ? `'` : `"`;
      item.replacement = replaceQuote(
        item.replacement,
        search,
        sourceQuote
      );
    }
  }
  for (const item of expressions) {
    if (item.replacement && item.replacement !== item.src) {
      s.overwrite(
        item.loc.start.offset - offset,
        item.loc.end.offset - offset,
        item.replacement
      );
    }
  }
  return s.toString();
}
function replaceQuote(code, target, replace) {
  let res = code;
  if (res.includes(target)) {
    res = res.replaceAll(replace, `\\${replace}`);
    res = res.replaceAll(target, replace);
  }
  return res;
}
function shouldReplaceQuote(expression) {
  if (!expression.src.includes(`'`) && !expression.src.includes(`"`)) {
    return false;
  }
  const secondLastTrack = expression.track.at(-2);
  if (secondLastTrack?.type === 5 /* INTERPOLATION */) {
    return false;
  }
  return true;
}
function getSourceQuote(code, start, end) {
  const source = code.slice(start, end);
  const quotes = ['"', "'"];
  for (const quote of quotes) {
    if (source.includes(quote)) {
      return quote;
    }
  }
  return null;
}
const defaultSnippetHandler = {
  key: (node) => `default$:${node.src}`,
  prepare: (node, id) => `wrapper_${id}(${node.src});`,
  parse: (code) => {
    const wrapperRegex = /^(wrapper_\d+)\(([\s\S]*?)\);$/;
    const [_, wrapperName, res] = code.match(wrapperRegex) ?? [];
    if (!wrapperName || !res) {
      return void 0;
    }
    return res;
  },
  standalone: false
};
const multipleStatementsSnippetHandler = {
  key: (node) => {
    const key = `multipleStatements$:${node.src}`;
    const secondLastTrack = node.track.at(-2);
    const lastTrack = node.track.at(-1);
    if (lastTrack?.type === 4 /* SIMPLE_EXPRESSION */ && secondLastTrack?.type === 7 /* DIRECTIVE */ && secondLastTrack.name === "on") {
      const isMemberExp = isMemberExpressionBrowser(lastTrack);
      const isInlineStatement = !(isMemberExp || isFnExpressionBrowser(lastTrack));
      const hasMultipleStatements = node.src.includes(";");
      if ((isInlineStatement || isMemberExp) && hasMultipleStatements) {
        return key;
      }
    }
    return null;
  },
  prepare: (node, id) => `wrapper_${id}(() => {${node.src}});`,
  parse: (code) => {
    const wrapperRegex = /^(wrapper_\d+)\(\(\) => \{([\s\S]*?)\}\);$/;
    const [_, wrapperName, res] = code.trim().match(wrapperRegex) ?? [];
    if (!wrapperName || !res) {
      return void 0;
    }
    return res.trim().replace(/;$/, "");
  },
  standalone: false
};
const destructureSnippetHandler = {
  key: (node) => {
    const key = `destructure$:${node.src}`;
    const lastTrack = node.track.at(-1);
    const secondLastTrack = node.track.at(-2);
    if (secondLastTrack?.type === 7 /* DIRECTIVE */ && secondLastTrack.name === "slot") {
      return key;
    }
    if (secondLastTrack?.type === 7 /* DIRECTIVE */ && secondLastTrack.name === "for" && secondLastTrack?.forParseResult && lastTrack !== secondLastTrack.forParseResult.source) {
      return key;
    }
    return null;
  },
  prepare: (node, id) => `const ${node.src} = wrapper_${id}();`,
  parse: (code) => {
    const regex = /^const([\s\S]*?)=\s+wrapper_\d+\(\);$/;
    const [_, res] = code.match(regex) ?? [];
    if (!res) {
      return void 0;
    }
    return res.trim();
  },
  standalone: true
};
const snippetHandlers = [destructureSnippetHandler, multipleStatementsSnippetHandler, defaultSnippetHandler];
function getKey(expression) {
  for (const handler of snippetHandlers) {
    const key = handler.key(expression);
    if (key) {
      return { key, handler };
    }
  }
}
function generateSnippetSplitter() {
  const identify = Math.random().toString(36).substring(2, 15);
  return `
splitter(${JSON.stringify(identify)});
`;
}
async function transformJsSnippets(expressions, transform) {
  const transformMap = /* @__PURE__ */ new Map();
  let id = 0;
  for (const expression of expressions) {
    const res = getKey(expression);
    if (!res) {
      continue;
    }
    if (transformMap.has(res.key)) {
      const item = transformMap.get(res.key);
      item.nodes.push(expression);
      continue;
    }
    transformMap.set(res.key, { id, nodes: [expression], handler: res.handler });
    id += 1;
  }
  const resultMap = /* @__PURE__ */ new Map();
  const orders = Array.from(transformMap.values());
  const batch = orders.filter(({ handler }) => !handler.standalone);
  const standalone = orders.filter(({ handler }) => handler.standalone);
  try {
    const batchInputSplitter = generateSnippetSplitter();
    const batchInput = batch.map(({ nodes, handler }) => handler.prepare(nodes[0], id)).join(batchInputSplitter);
    const batchOutput = await transform(batchInput);
    const lines = batchOutput.split(batchInputSplitter).map((l) => l.trim()).filter((l) => !!l);
    if (lines.length !== batch.length) {
      throw new Error("[vue-sfc-transform] Syntax Error");
    }
    for (let i = 0; i < batch.length; i++) {
      const line = lines[i];
      const { id: id2, handler, nodes } = batch[i];
      const res = handler.parse(line, id2);
      if (!res) {
        continue;
      }
      for (const node of nodes) {
        resultMap.set(node, res);
      }
    }
    await Promise.all(standalone.map(async ({ id: id2, handler, nodes }) => {
      const prepared = handler.prepare(nodes[0], id2);
      const line = await transform(prepared);
      const res = handler.parse(line.trim(), id2);
      if (!res) {
        return;
      }
      for (const node of nodes) {
        resultMap.set(node, res);
      }
    }));
  } catch (error) {
    throw new Error("[vue-sfc-transform] Error parsing TypeScript expression in template", { cause: error });
  }
  return resultMap;
}

export { preTranspileScriptSetup as p, transpileVueTemplate as t };
