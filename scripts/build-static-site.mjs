import { cp, mkdir, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const outDir = join(root, 'dist');

// Explicit non-HTML web assets that must ship. Every top-level *.html page is
// added automatically below, so a newly created page publishes WITHOUT editing
// this list. If you add a new non-HTML asset (a .js, .css, image, or folder),
// add its name here.
const assetEntries = [
  'assessment-core.js',
  'assessment.js',
  'assets',
  'favicon.svg',
  'site.css',
  'styles.css',
];

const htmlPages = (await readdir(root, { withFileTypes: true }))
  .filter((d) => d.isFile() && d.name.endsWith('.html'))
  .map((d) => d.name);

const publicEntries = [...new Set([...assetEntries, ...htmlPages])];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const entry of publicEntries) {
  await cp(join(root, entry), join(outDir, entry), { recursive: true });
}
