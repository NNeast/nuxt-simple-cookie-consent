import * as citty from 'citty';

declare const _default$1: citty.CommandDef<{
    cwd: {
        type: "string";
        description: string;
    };
    rootDir: {
        type: "positional";
        description: string;
        required: false;
    };
    outDir: {
        type: "string";
    };
    sourcemap: {
        type: "boolean";
    };
    stub: {
        type: "boolean";
    };
}>;

declare const _default: citty.CommandDef<{
    cwd: {
        type: "string";
        description: string;
    };
    rootDir: {
        type: "positional";
        description: string;
        required: false;
    };
}>;

export { _default$1 as build, _default as prepare };
