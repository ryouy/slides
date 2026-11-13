import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { AD_UNITS, DEFAULT_SCRIPT_BASE, adFrameHtml, type AdUnitId } from './src/ads/adsterra';

/** Serves /ads/<unit>.html in dev and emits the same pages into the build (one source: src/ads/adsterra.ts). */
function adFrames(): Plugin {
  const base = (process.env.VITE_ADSTERRA_SCRIPT_BASE || DEFAULT_SCRIPT_BASE).replace(/\/+$/, '');
  return {
    name: 'ad-frames',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/^\/ads\/(mobile|desktop)\.html(?:\?.*)?$/);
        if (!m) return next();
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(adFrameHtml(AD_UNITS[m[1] as AdUnitId], base));
      });
    },
    generateBundle() {
      for (const unit of Object.values(AD_UNITS)) this.emitFile({ type: 'asset', fileName: `ads/${unit.id}.html`, source: adFrameHtml(unit, base) });
    },
  };
}

export default defineConfig({
  plugins: [react(), adFrames()],
  test: { include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'], environment: 'node' },
});
