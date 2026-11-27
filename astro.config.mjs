import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://bytevast.net',
  integrations: [mdx()],
  server: {
    port: 3000,
    host: true,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
