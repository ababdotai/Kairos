import { mkdir, cp, rm, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await rm(new URL('dist', root), { recursive: true, force: true });
await mkdir(new URL('dist/kairos', root), { recursive: true });
await cp(new URL('public', root), new URL('dist/kairos', root), { recursive: true });
console.log('Built website/dist/kairos');

await cp(new URL('../src/share-page.js', root), new URL('dist/kairos/share-page.js', root));
const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || '';
if (url || key) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key) throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY together');
  // Only a public anon/publishable key may enter the static website.
  const role = key.startsWith('eyJ') ? JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role : '';
  if (role !== 'anon' && !key.startsWith('sb_publishable_')) throw new Error('Use a public Supabase key, never a secret/service-role key');
}
await writeFile(new URL('dist/kairos/share-config.json', root), JSON.stringify({url,key}));
