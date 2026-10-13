// Static checks on the committed export in ../dist: the files a static host needs exist,
// every asset URL is relative, and the share tags are present. Run from web/: npm run check
import { readFile, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist')
const html = await readFile(join(dist, 'index.html'), 'utf8')
let failed = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`)
  if (!ok) failed++
}

const urls = [
  ...[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]),
  ...[...html.matchAll(/(?:property|name)="[^"]*image" content="([^"]+)"/g)].map((m) => m[1]),
].filter((u) => !/^(https?:|mailto:|#)/i.test(u))
check('every local URL in index.html is relative', urls.every((u) => u.startsWith('./')), urls.filter((u) => !u.startsWith('./')).join(' '))
for (const u of urls) {
  const p = join(dist, u.replace(/^\.\//, ''))
  let ok = false
  try { ok = (await stat(p)).isFile() } catch {}
  check(`referenced file exists: ${u}`, ok)
}
for (const [name, re] of [
  ['title', /<title>[^<]+<\/title>/],
  ['favicon', /rel="icon"/],
  ['description', /name="description" content="[^"]+"/],
  ['og:title', /property="og:title" content="[^"]+"/],
  ['og:image', /property="og:image" content="[^"]+"/],
  ['viewport allows zoom', /name="viewport" content="width=device-width, initial-scale=1"/],
]) check(`index.html has ${name}`, re.test(html))

process.exit(failed ? 1 : 0)
