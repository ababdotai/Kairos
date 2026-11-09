import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Production content scripts are classic scripts injected by Chrome, not page-loaded modules. */
export function standaloneContent(manifest) {
  let config;
  return {
    name: 'kairos-standalone-content',
    apply: 'build',
    enforce: 'post',
    configResolved(value) { config = value; },
    async writeBundle() {
      const result = await build({
        configFile: false,
        root: config.root,
        publicDir: false,
        logLevel: 'silent',
        build: {
          write: false,
          target: config.build.target,
          minify: config.build.minify,
          lib: { entry: resolve(config.root, 'src/content.js'), name: 'KairosContent', formats: ['iife'] },
          rollupOptions: { output: { inlineDynamicImports: true } },
        },
      });
      const outputs = (Array.isArray(result) ? result : [result]).flatMap(output => output.output);
      const chunks = outputs.filter(output => output.type === 'chunk');
      if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.length) {
        throw new Error('Content script must be a single self-contained classic script');
      }
      const outDir = resolve(config.root, config.build.outDir);
      const script = 'assets/kairos-content.js';
      await writeFile(resolve(outDir, script), chunks[0].code);
      const css = outputs.filter(output => output.type === 'asset' && output.fileName.endsWith('.css'));
      const cssPath = 'assets/kairos-content.css';
      if (css.length) await writeFile(resolve(outDir, cssPath), css.map(asset => asset.source).join('\n'));
      const path = resolve(outDir, 'manifest.json');
      const built = JSON.parse(await readFile(path, 'utf8'));
      if (built.content_scripts?.length !== 1 || manifest.content_scripts?.[0]?.js?.[0] !== 'src/content.js') {
        throw new Error('Update standalone content bundling for the new content-script entries');
      }
      built.content_scripts[0].js = [script];
      built.content_scripts[0].css = css.length ? [cssPath] : [];
      // Keep explicitly public assets; content code no longer needs to be exposed to webpages.
      built.web_accessible_resources = structuredClone(manifest.web_accessible_resources || []);
      await writeFile(path, JSON.stringify(built, null, 2) + '\n');
    },
  };
}
