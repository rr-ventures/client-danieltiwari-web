import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const outDir = join(root, 'dist');

const publicEntries = [
  '404.html',
  'about.html',
  'apply.html',
  'assessment-core.js',
  'assessment.html',
  'assessment.js',
  'assets',
  'favicon.svg',
  'homepage-direction-v1.html',
  'index.html',
  'nurture-preview.html',
  'privacy.html',
  'result.html',
  'site-notice.html',
  'site.css',
  'style-picker.html',
  'styles.css',
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const entry of publicEntries) {
  await cp(join(root, entry), join(outDir, entry), { recursive: true });
}
