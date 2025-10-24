#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { consola } from 'consola';
import { v as version, d as description, n as name } from './shared/module-builder.WIar1ojq.mjs';

const _rDefault = (r) => r && typeof r === "object" && "default" in r ? r.default : r;
const main = defineCommand({
  meta: {
    name,
    description,
    version
  },
  subCommands: {
    prepare: () => import('./chunks/prepare.mjs').then(_rDefault),
    build: () => import('./chunks/build.mjs').then(_rDefault)
  },
  setup(context) {
    const firstArg = context.rawArgs[0];
    if (context.cmd.subCommands && !(firstArg && firstArg in context.cmd.subCommands)) {
      consola.warn("Please specify the `build` command explicitly. In a future version of `@nuxt/module-builder`, the implicit default build command will be removed.");
      context.rawArgs.unshift("build");
    }
  }
});
runMain(main);
