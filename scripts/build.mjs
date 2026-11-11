import { mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
const originArgument = process.argv.find(arg => arg.startsWith('--origin='));
let origin;
if (originArgument) {
  const url = new URL(originArgument.slice('--origin='.length));
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('Use an HTTPS origin without a path, credentials, query or fragment.');
  }
  origin = url.origin;
}

await rm(output, { recursive: true, force: true });
await mkdir(output);
for (const name of ['index.html', 'favicon.svg', 'robots.txt', 'js', 'css']) {
  await cp(resolve(root, name), resolve(output, name), { recursive: true });
}
await rm(resolve(output, 'css/tailwind.input.css'));
if (origin) {
  const htmlPath = resolve(output, 'index.html');
  const html = await readFile(htmlPath, 'utf8');
  await writeFile(htmlPath, html.replace('</head>', `  <link rel="canonical" href="${origin}/">\n  <meta property="og:url" content="${origin}/">\n</head>`));
  await writeFile(resolve(output, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
  await writeFile(resolve(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>\n`);
}
console.log(`Static site built: ${output}${origin ? ` (${origin})` : ' (no domain-specific SEO tags)'}`);
