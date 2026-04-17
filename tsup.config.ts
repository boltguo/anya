import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'bin/anya': 'bin/anya.ts',
  },
  format: ['esm'],
  target: 'node20',
  clean: true,
  dts: { entry: 'src/index.ts' },
  splitting: false,
  sourcemap: false,
  onSuccess: 'node scripts/postbuild.cjs',
  esbuildPlugins: [
    {
      name: 'node-builtins-external',
      setup(build) {
        build.onResolve({ filter: /^node:sqlite$/ }, () => ({
          path: 'node:sqlite',
          external: true,
        }));
      },
    },
  ],
});
