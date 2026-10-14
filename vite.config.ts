import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// SPEC, privacy rule 1: the app only talks to its own origin. GitHub Pages cannot send
// headers, so the policy goes in a meta tag. It is added only to the build, because the
// dev server injects inline styles.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function contentSecurityPolicy(): Plugin {
  return {
    name: 'carteira:csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig({
  base: '/carteira/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from src/main.tsx, so the page carries no inline script.
      injectRegister: false,
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        id: '/carteira/',
        name: 'Carteira',
        short_name: 'Carteira',
        description: 'Carteira de investimentos pessoal. Os dados ficam só no aparelho.',
        lang: 'pt-BR',
        start_url: '/carteira/',
        scope: '/carteira/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f7f5',
        theme_color: '#0f6e56',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // A new version takes over at once; registerSW then reloads the page. This also
        // replaces the milestone 0 probe's worker, which lived at the same address.
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
