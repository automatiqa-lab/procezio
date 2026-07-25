// v0.4 plain-language linter (spec 01b section 3, Wave 2 C5): advisory, never a gate.
//
// The methodology is for people who write no code, under stress. Wording should read at roughly a
// 6th-grade level. This is a PURE, deterministic reading-grade estimate (a Flesch-Kincaid variant)
// plus a couple of plain checks (over-long sentences, a small jargon list). It only ADVISES - it
// blocks nothing and changes no methodology. The app is English-only, so the heuristic always runs.

export interface PlainLanguageResult {
  /** Estimated US reading-grade level (Flesch-Kincaid). Lower is plainer. 0 for empty text. */
  grade: number
  /** Human-readable advisories (empty = reads plainly enough). Never blocking. */
  issues: string[]
}

const VOWELS = /[aeiouy]+/g

/** Approximate syllables in a word by counting vowel groups, with a floor of 1. */
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length === 0) return 0
  const groups = w.match(VOWELS)
  let n = groups ? groups.length : 1
  if (w.endsWith('e') && n > 1) n -= 1 // silent trailing e
  return Math.max(1, n)
}

// A small list of jargon a supply-chain professional under stress should not have to parse. The
// agent's wording rules avoid these; the linter flags them if they slip through.
const JARGON = [
  'leverage',
  'synergy',
  'synergies',
  'utilize',
  'utilization',
  'paradigm',
  'holistic',
  'operationalize',
  'ideate',
  'bandwidth',
]

/** Score a piece of (English) text for reading grade + plain-language issues. Advisory only. */
export function plainLanguage(text: string): PlainLanguageResult {
  const trimmed = text.trim()
  if (trimmed === '') return { grade: 0, issues: [] }

  const sentences = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0)
  const words = trimmed.split(/\s+/).filter((w) => /[a-z]/i.test(w))
  const sentenceCount = Math.max(1, sentences.length)
  const wordCount = Math.max(1, words.length)
  const syllableCount = words.reduce((n, w) => n + syllables(w), 0)

  // Flesch-Kincaid grade level.
  const grade = 0.39 * (wordCount / sentenceCount) + 11.8 * (syllableCount / wordCount) - 15.59

  const issues: string[] = []
  if (grade > 9) issues.push(`Reads at about grade ${Math.round(grade)} - aim for plainer wording.`)
  const longest = sentences.reduce((m, s) => Math.max(m, s.trim().split(/\s+/).length), 0)
  if (longest > 25) issues.push(`A sentence runs ${longest} words - try splitting it.`)
  const found = JARGON.filter((j) => new RegExp(`\\b${j}\\b`, 'i').test(trimmed))
  if (found.length > 0) issues.push(`Jargon: ${found.join(', ')} - prefer a plain word.`)

  return { grade: Math.max(0, Math.round(grade * 10) / 10), issues }
}
