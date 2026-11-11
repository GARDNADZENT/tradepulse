import path from 'path';
import { defineConfig, loadEnv } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';

loadEnv({ mode: 'production' });

const cleanEnv = (val?: string) => (!val || val.trim() === '🔒' ? '' : val.trim());

export default defineConfig({
  plugins: [
    pluginSass({
      sassLoaderOptions: { sourceMap: true },
      exclude: /node_modules/,
    }),
    pluginReact(),
  ],
  source: {
    entry: {
      index: path.resolve(__dirname, './src/main.tsx'),
    },
    define: {
      'process.env': {
        SUPABASE_URL: JSON.stringify(cleanEnv(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)),
        SUPABASE_PUBLISHABLE_KEY: JSON.stringify(
          cleanEnv(
            process.env.SUPABASE_PUBLISHABLE_KEY ||
              process.env.SUPABASE_ANON_KEY ||
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
          )
        ),
        STUDIO_TENANT_RUNTIME_URL: JSON.stringify(cleanEnv(process.env.STUDIO_TENANT_RUNTIME_URL)),
        STUDIO_POOLED_DERIV_APP_ID: JSON.stringify(cleanEnv(process.env.STUDIO_POOLED_DERIV_APP_ID) || '36544'),
        STUDIO_BASE_DOMAIN: JSON.stringify(cleanEnv(process.env.STUDIO_BASE_DOMAIN) || 'traderspulse.site'),
      },
    },
    alias: {
      react: path.dirname(require.resolve('react/package.json')),
      'react-dom': path.dirname(require.resolve('react-dom/package.json')),
    },
  },
  output: {
    distPath: {
      root: path.resolve(__dirname, 'dist'),
    },
    copy: [{ from: path.resolve(__dirname, 'public') }],
  },
  html: {
    template: path.resolve(__dirname, './index.html'),
  },
  server: {
    host: '0.0.0.0',
    port: 4004,
    compress: true,
  },
  dev: {
    hmr: true,
  },
});
