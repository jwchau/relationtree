/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { lazyRouteFor, lazyRouteModules } from './src/routes/routeChunks.ts'

/** Opens the connection to the API while the app's code is still loading: in production it's
 * another origin behind a tunnel, and a new connection costs ~300 ms. The app's requests send
 * cookies, so the preconnect must too, or the browser won't reuse it. Same fallback as
 * src/api/client.ts. */
function preconnectToApi(apiUrl: string): Plugin {
  return {
    name: 'preconnect-to-api',
    transformIndexHtml: () => [
      { tag: 'link', attrs: { rel: 'preconnect', href: apiUrl, crossorigin: 'use-credentials' }, injectTo: 'head' },
    ],
  }
}

/** Starts loading the opening page's code from index.html, alongside the main bundle. Lazy
 * pages (src/routes/lazy.ts) would otherwise start only once the main bundle has downloaded
 * and run: measured at 4x CPU and Fast 4G, the person page's chunks began at 1185 ms against
 * 241 ms for the main bundle, and its LCP got worse than with one bundle. An inline script
 * runs lazyRouteFor (from src/routes/routeChunks.ts) on the URL and adds a modulepreload for
 * that page's chunk and everything it imports. */
function preloadOpeningPage(): Plugin {
  return {
    name: 'preload-opening-page',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      const chunks = Object.values(ctx.bundle ?? {}).flatMap((c) => (c.type === 'chunk' ? [c] : []))
      const byFile = new Map(chunks.map((c) => [c.fileName, c]))
      const files: Record<string, string[]> = {}
      for (const [route, module] of Object.entries(lazyRouteModules)) {
        const chunk = chunks.find((c) => c.facadeModuleId?.replaceAll('\\', '/').endsWith(module))
        if (!chunk) throw new Error(`preload-opening-page: no chunk for ${module}`)
        const needed = new Set<string>()
        const add = (file: string) => {
          if (needed.has(file)) return
          needed.add(file)
          byFile.get(file)?.imports.forEach(add)
        }
        add(chunk.fileName)
        files[route] = [...needed]
      }
      const script = `(() => {
  const lazyRouteFor = ${lazyRouteFor.toString()};
  const files = ${JSON.stringify(files)}[lazyRouteFor(location.pathname)] || [];
  for (const file of files) {
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.crossOrigin = '';
    link.href = '/' + file;
    document.head.appendChild(link);
  }
})();`
      // Right after the charset: an inline script waits for any stylesheet above it, and the
      // CSS would otherwise hold it back (measured: chunks starting at 756 ms, not ~260).
      const charset = '<meta charset="UTF-8" />'
      if (!html.includes(charset)) throw new Error('preload-opening-page: no charset meta in index.html')
      return html.replace(charset, `${charset}
    <script>${script}</script>`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    preloadOpeningPage(),
    preconnectToApi(
      process.env.VITE_API_URL || loadEnv(mode, process.cwd()).VITE_API_URL || 'http://127.0.0.1:8001',
    ),
  ],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Pure tests run in node; component tests opt into jsdom with a
    // `// @vitest-environment jsdom` comment.
    setupFiles: ['./src/test/setup.ts'],
    // The map's contrast test reads the theme tokens (FG-12); other CSS stays unprocessed.
    css: { include: [/index\.css/] },
  },
}))
