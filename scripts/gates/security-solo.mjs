// ci:security-solo - static scanner enforcing the Solo-mode security posture (C4/C5,
// specs/02b-architecture-v0.3-amendment.md#C5; specs/02-architecture-v0.1.md#12).
// Solo mode's whole security story is: nothing leaves the browser except a call to the
// user-configured LLM endpoint, model output is data and never executed, and the portable
// `.pnav` session file (shared, synced to Drive/OneDrive, dropped into demos) never carries
// a secret. This gate is a heuristic scanner scoped to exactly those three named threats -
// it is not a general SAST tool. Exit 0 = pass, non-zero = a violation was found.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

// Product-source roots for the Solo bundle. Build tooling (scripts/, node_modules) is
// deliberately out of scope: scanning the gate's own regex source for the literal
// substrings it looks for would be a false-positive factory, and it is not shipped to
// the browser anyway - only what lands here is.
const SCAN_ROOTS = ['app/src', 'core/src', 'relay/src', 'desktop', 'prototypes']
const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.html'])
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', 'build', '.git'])

function listFiles(root) {
  const out = []
  if (!existsSync(root)) return out
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    for (const name of readdirSync(dir)) {
      if (SKIP_DIR_NAMES.has(name)) continue
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) stack.push(full)
      else if (SCAN_EXTS.has(extname(name))) out.push(full)
    }
  }
  return out
}

// --- Rule 1: eval() of model output ---------------------------------------
// AGENTS.md / spec #12 ban eval/Function outright ("model output is data, never code to
// execute"): there is no legitimate call site in Solo-mode product code, so any use fires.
const EVAL_RE = /\beval\s*\(|\bnew\s+Function\s*\(/g

// --- Rule 2: hardcoded non-endpoint fetch origin --------------------------
// The only legitimate egress in Solo mode is the user-configured LLM endpoint, which is
// necessarily a runtime value (user types it in), never a literal in source. A literal
// absolute URL passed straight into a network call is therefore always a hardcoded,
// non-endpoint origin - egress the user did not configure.
const FETCH_ORIGIN_RE =
  /\b(?:fetch|axios(?:\.\w+)?|new\s+WebSocket)\s*\(\s*['"`]\s*(https?:\/\/[^'"`]+)['"`]/g

// --- Rule 3: API key written to a .pnav file ------------------------------
// `.pnav` is the portable session-log file - it leaves the browser sandbox by design
// (local file / Drive / OneDrive). A key that ends up inside one has left the machine.
// Detected as a `.pnav` path reference with an apiKey-shaped identifier nearby (same
// write call typically spans a few lines: path, then the object being serialized).
const PNAV_RE = /\.pnav\b/
const API_KEY_RE = /api[_-]?key/i
const PNAV_WINDOW = 5 // lines of context searched around a `.pnav` reference

// --- Rule 4: Solo bundle must ship a strict CSP --------------------------------
// The Solo bundle is static-hosted and its whole egress story is enforced in the
// browser by the CSP meta tag in app/index.html (specs/02b C5). Two things must hold:
// the CSP must EXIST (a missing policy = no enforcement) and it must never allow
// `unsafe-eval` (model output is data, never code to execute - AGENTS.md / spec #12).
// index.html sits ABOVE app/src, so it is checked directly here rather than via the
// source walk above. Read relative to cwd so the gate is portable across workspaces.
const APP_INDEX_HTML = join('app', 'index.html')
// --- Rule 5: connect-src stays pinned to self + loopback + the placeholder ------
// The whole egress story rests on connect-src. Solo mode deliberately allows exactly:
// 'self', the two local model origins (Ollama 11434, the key-holding proxy 8080 - any
// loopback port is accepted, the host is what matters), and the non-resolvable
// placeholder. A PR that quietly widens connect-src to a real cloud origin must go RED
// here and change this gate knowingly, in the same review.
const CONNECT_SRC_ALLOWED_RE =
  /^(?:'self'|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?|https:\/\/\*\.model-endpoint\.placeholder)$/i

const CSP_META_RE = /<meta\s+[^>]*http-equiv\s*=\s*["']content-security-policy["'][^>]*>/i
// The value is delimited by whichever quote opens it (group 1) and captured in group
// 2 - a CSP value legitimately contains the OTHER quote character (e.g. 'self'), so a
// naive [^"'] class would truncate it before reaching unsafe-eval.
const CSP_CONTENT_RE = /content\s*=\s*(["'])((?:(?!\1).)*)\1/i
const UNSAFE_EVAL_RE = /unsafe-eval/i

function checkCsp(indexPath = APP_INDEX_HTML) {
  const violations = []
  if (!existsSync(indexPath)) {
    violations.push({
      file: indexPath,
      line: 0,
      rule: 'csp-missing',
      message: 'app/index.html not found - the Solo bundle must ship a strict CSP meta tag',
    })
    return violations
  }
  const html = readFileSync(indexPath, 'utf8')
  const meta = html.match(CSP_META_RE)
  if (!meta) {
    violations.push({
      file: indexPath,
      line: 1,
      rule: 'csp-missing',
      message: 'no Content-Security-Policy meta tag in app/index.html',
    })
    return violations
  }
  const content = meta[0].match(CSP_CONTENT_RE)
  const csp = content ? content[2] : ''
  if (UNSAFE_EVAL_RE.test(csp)) {
    violations.push({
      file: indexPath,
      line: 1,
      rule: 'csp-unsafe-eval',
      message: "CSP allows 'unsafe-eval' - model output must never be executed",
    })
  }
  // Rule 5: every connect-src source must be 'self', loopback, or the placeholder.
  const connectSrc = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.toLowerCase().startsWith('connect-src'))
  if (connectSrc) {
    for (const source of connectSrc.split(/\s+/).slice(1)) {
      if (!CONNECT_SRC_ALLOWED_RE.test(source)) {
        violations.push({
          file: indexPath,
          line: 1,
          rule: 'csp-connect-src',
          message: `connect-src allows non-loopback egress origin: ${source}`,
        })
      }
    }
  }
  return violations
}

function scanContent(filePath, content) {
  const violations = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    for (const m of line.matchAll(EVAL_RE)) {
      violations.push({
        file: filePath,
        line: i + 1,
        rule: 'eval-model-output',
        message: `eval()/Function() of model output is banned: \`${m[0]}\``,
      })
    }

    for (const m of line.matchAll(FETCH_ORIGIN_RE)) {
      violations.push({
        file: filePath,
        line: i + 1,
        rule: 'hardcoded-fetch-origin',
        message: `hardcoded non-endpoint fetch origin: ${m[1]}`,
      })
    }

    if (PNAV_RE.test(line)) {
      const start = Math.max(0, i - PNAV_WINDOW)
      const end = Math.min(lines.length, i + PNAV_WINDOW + 1)
      const windowText = lines.slice(start, end).join('\n')
      if (API_KEY_RE.test(windowText)) {
        violations.push({
          file: filePath,
          line: i + 1,
          rule: 'api-key-to-pnav',
          message: 'API key appears to be written into a .pnav file',
        })
      }
    }
  }

  return violations
}

function scan(roots = SCAN_ROOTS) {
  const violations = []
  let scanned = 0
  for (const root of roots) {
    for (const file of listFiles(root)) {
      scanned++
      violations.push(...scanContent(file, readFileSync(file, 'utf8')))
    }
  }
  return { violations, scanned }
}

const { violations, scanned } = scan()
// Rule 4 runs once against app/index.html (outside the source-file walk).
violations.push(...checkCsp())

if (violations.length) {
  console.error('security-solo: FAIL')
  for (const v of violations) {
    console.error(`  - ${v.file}:${v.line} [${v.rule}] ${v.message}`)
  }
  process.exit(1)
}

console.log(
  `security-solo: PASS (${scanned} files scanned across ${SCAN_ROOTS.join(', ')}; app/index.html CSP strict)`,
)
