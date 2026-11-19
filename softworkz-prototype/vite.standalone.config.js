// Builds one self-contained HTML file that opens by double-click, no server.
//   npm run standalone   ->  standalone/softworkz-prototype.html
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

const inlineMedia = () => ({
  name: 'inline-public-media',
  transformIndexHtml: (html) => html.replace(/src="\/media\/([^"]+\.jpg)"/g, (_, f) =>
    `src="data:image/jpeg;base64,${readFileSync(new URL(`./public/media/${f}`, import.meta.url)).toString('base64')}"`),
});

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [inlineMedia(), viteSingleFile()],
  build: { outDir: 'standalone', emptyOutDir: true, target: 'es2020', assetsInlineLimit: 100000000 },
});
