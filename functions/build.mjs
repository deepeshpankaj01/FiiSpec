// Bundles functions/src (and the shared domain code in ../shared) into lib/index.js.
// npm dependencies stay external and are installed by Cloud Functions from package.json.
import { build, context } from 'esbuild';

const options = {
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
  banner: {
    // Allow bundled CommonJS-style helpers to use require() inside the ESM output.
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);",
  },
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('Watching functions for changes…');
} else {
  await build(options);
}
