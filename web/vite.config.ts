import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * The page's Content Security Policy. Injected at build time only, because
 * the dev server needs a socket for live reload. Every connection is refused
 * and every script and style must come from the page's own origin.
 * frame-ancestors cannot travel in a <meta> tag; the server header in
 * DEPLOY.md carries it.
 */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

export default defineConfig({
  // The page lives under this prefix on tools.boundera.io, the host shared by
  // every client-only Boundera tool. Absolute asset paths under the prefix keep
  // the page working whether or not the URL carries its trailing slash.
  base: '/sdr-redactor/',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    modulePreload: { polyfill: false },
  },
  server: { fs: { allow: ['..'] } },
  plugins: [
    {
      name: 'csp-meta',
      apply: 'build',
      transformIndexHtml(html) {
        return html.replace('<!-- CSP -->', `<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
      },
    },
  ],
});
