// v0.4 benchmark shelf (spec 01b section 8/11, Wave 2 E7): cited public ranges by process type.
//
// The honest counter to a chatbot that invents a number: Procezio shows a ROUGH, widely-cited
// industry range with its source, and you PULL it as a starting estimate that you must localize
// before you rely on it. Nothing is ever auto-filled into the case; a pulled range lands as a
// low-confidence assumption with a "localize" verify plan, so the export gate keeps flagging it
// until you replace it with your own number. These are rules of thumb, not your data.

export interface Benchmark {
  metric: string
  range: string
  note: string
  /** An honest source label. These are public rules of thumb, not a claim about your process. */
  source: string
}

/** Benchmarks keyed by a keyword found in the process name (matched case-insensitively). */
const SHELF: Array<{ match: RegExp; benchmarks: Benchmark[] }> = [
  {
    match: /purchase|p2p|invoice|payable|procure/i,
    benchmarks: [
      {
        metric: 'Cost to process one invoice (manual)',
        range: '~ $10 - $40',
        note: 'Wide spread; touchless processing is far lower. Localize with your own AP cost base.',
        source: 'Common industry rule of thumb (public AP benchmarks)',
      },
      {
        metric: 'Invoices per FTE per year (manual vs automated)',
        range: '~ 6,000 manual vs 20,000+ automated',
        note: 'Automation multiplies throughput; your mix of exceptions changes it a lot.',
        source: 'Common industry rule of thumb',
      },
    ],
  },
  {
    match: /order|o2c|cash|sales|fulfil/i,
    benchmarks: [
      {
        metric: 'Days sales outstanding (DSO)',
        range: 'commonly ~ 30 - 60 days',
        note: 'Sector- and terms-dependent. Use your own aged-receivables, not this range.',
        source: 'Common finance rule of thumb',
      },
    ],
  },
  {
    match: /carrier|haulier|onboard|supplier|vendor/i,
    benchmarks: [
      {
        metric: 'Vendor/carrier onboarding lead time',
        range: 'days to several weeks',
        note: 'Compliance depth drives it. Time your own last ten onboardings.',
        source: 'Common industry rule of thumb',
      },
    ],
  },
]

/** The benchmarks relevant to a process name (by keyword). Empty when nothing matches. */
export function benchmarksFor(processName: string): Benchmark[] {
  const name = processName ?? ''
  const hit = SHELF.find((s) => s.match.test(name))
  return hit ? hit.benchmarks : []
}
