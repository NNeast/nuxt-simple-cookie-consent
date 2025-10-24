import { MkdistOptions } from 'mkdist';

interface InputFile {
    path: string;
    extension: string;
    srcPath?: string;
    getContents: () => Promise<string> | string;
}
interface OutputFile {
    /**
     * relative to distDir
     */
    path: string;
    srcPath?: string;
    extension?: string;
    contents?: string;
    declaration?: boolean;
    errors?: Error[];
    raw?: boolean;
    skip?: boolean;
}
type LoaderResult = OutputFile[] | undefined;
interface LoaderContext {
    loadFile: (input: InputFile) => LoaderResult | Promise<LoaderResult>;
    options: MkdistOptions;
}
type Loader = (input: InputFile, context: LoaderContext) => LoaderResult | Promise<LoaderResult>;

declare const vueLoader: Loader;

export { vueLoader };
