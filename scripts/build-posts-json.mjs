import fs from 'fs'
import path from 'path'

const postsDir = path.resolve(process.cwd(), '_posts')
const outDir = path.resolve(process.cwd(), 'data')
const outFile = path.join(outDir, 'posts.json')

function parseFrontMatter(text) {
  const lines = text.split(/\r?\n/)
  if (lines[0].trim() !== '---') return { meta: {}, body: text }
  let i = 1
  const meta = {}
  let inFront = true
  const fmLines = []
  for (; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '---') { inFront = false; i++; break }
    fmLines.push(line)
  }
  // naive YAML: key: value and simple lists
  let currentKey = null
  for (const l of fmLines) {
    if (/^\s*-\s+/.test(l) && currentKey) {
      const v = l.replace(/^\s*-\s+/, '').trim()
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = []
      meta[currentKey].push(v.replace(/^"|"$/g, ''))
      continue
    }
    const m = l.match(/^([A-Za-z0-9_\-]+):\s*(.*)$/)
    if (m) {
      const key = m[1]
      let val = m[2].trim()
      currentKey = key
      if (val === '' ) { meta[key] = []; continue }
      if (val.toLowerCase() === 'true') val = true
      else if (val.toLowerCase() === 'false') val = false
      else val = val.replace(/^"|"$/g, '')
      meta[key] = val
    }
  }
  const body = lines.slice(i).join('\n')
  return { meta, body }
}

function getSlugFromFilename(filename) {
  // e.g., 2019-03-24-make-money.markdown -> make-money
  const base = path.basename(filename)
  const m = base.match(/^\d{4}-\d{2}-\d{2}-(.+)\.(md|markdown)$/)
  return m ? m[1] : base.replace(/\.(md|markdown)$/,'')
}

function toISODate(d) {
  if (!d) return null
  // allow YYYY-MM-DD
  return new Date(d).toISOString()
}

function build() {
  if (!fs.existsSync(postsDir)) {
    console.error('Posts dir not found:', postsDir)
    process.exit(1)
  }
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir)
  const files = fs.readdirSync(postsDir).filter(f => /\.(md|markdown)$/.test(f))
  const posts = []
  for (const f of files) {
    const full = path.join(postsDir, f)
    const raw = fs.readFileSync(full, 'utf8')
    const { meta, body } = parseFrontMatter(raw)
    const slug = getSlugFromFilename(f)
    const title = meta.title || slug
    const date = meta.date || null
    const author = meta.author || null
    const tags = meta.tags || []
    posts.push({ slug, title, date, author, tags, content: body })
  }
  posts.sort((a,b) => new Date(b.date||0) - new Date(a.date||0))
  fs.writeFileSync(outFile, JSON.stringify({ posts }, null, 2), 'utf8')
  console.log('Wrote', outFile, 'with', posts.length, 'posts')
}

build()

