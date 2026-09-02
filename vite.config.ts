/// <reference types="vitest/config" />
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Stamps today's date into the `__BUILD_DATE__` placeholder of public/sitemap.xml after it is copied to the output dir. */
function sitemapLastmod(): Plugin {
  let outDir = 'dist';
  return {
    name: 'sitemap-lastmod',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const file = resolve(outDir, 'sitemap.xml');
      const today = new Date().toISOString().slice(0, 10);
      writeFileSync(file, readFileSync(file, 'utf8').replace('__BUILD_DATE__', today));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [sitemapLastmod()],
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    // PDF/docx round-trips embed fonts and zip files; give them headroom on slow CI runners.
    testTimeout: 30000,
  },
});
