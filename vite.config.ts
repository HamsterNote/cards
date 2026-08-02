import { resolve } from 'node:path';
import react from '@vitejs/plugin-react-swc';
import { defineConfig, esmExternalRequirePlugin } from 'vite';
import dts from 'vite-plugin-dts';

const REACT_EXTERNALS = [/^react(?:\/.*)?$/, /^react-dom(?:\/.*)?$/];

export default defineConfig({
  plugins: [
    esmExternalRequirePlugin({
      external: REACT_EXTERNALS,
    }),
    react(),
    dts({
      tsconfigPath: './tsconfig.build.json',
      insertTypesEntry: true,
    }),
  ],
  server: {
    host: true,
    port: 9901,
    strictPort: true,
  },
  optimizeDeps: {
    include: ['react-dom'],
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.es.js',
    },
    rollupOptions: {
      external: ['@hamster-note/virtual-paper', '@system-ui-js/multi-drag'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
    sourcemap: true,
  },
});
