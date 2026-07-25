import { test, expect, type Page } from '@playwright/test'
import { join } from 'node:path'
import { runPaletteCommand, demoCaption } from './helpers'

// End-to-end over the DEMO SCENARIOS - the product's own full-loop material:
//
// 1. The three shipped scenario files (demo/*.pnav) - each a real process carried through
//    the whole loop (pain-first frame, mapped steps + friction, a committed idea, the
//    signed ceremony, cleared risk gate, a sourced case). Each is loaded through the REAL
//    session-bar Open flow and verified via the fixed chrome: load status, the north-star
//    reaching the one-pager, and the committed idea reaching the ceremony.
//
// 2. The keyless scripted demo - played END TO END (all seven beats plus the closing
//    caption) under Playwright's virtual clock, so the full three-minute story runs in
//    seconds: template map -> data pain -> idea -> triage/score -> signed commitment ->
//    the Challenger's evidence-cited probe -> the sourced improvement case.
//
// Like the other specs, assertions go through the fixed chrome (rail, bars, dialogs,
// captions), never in-world content on the CSS-transformed canvas.

interface Scenario {
  id: string
  process: string
  /** The scenario's north-star delta, as the one-pager headline states it. */
  headline: RegExp
  /** The committed improvement idea that must reach the commit ceremony. */
  idea: RegExp
}

const SCENARIOS: Scenario[] = [
  {
    id: 'p2p',
    process: 'Purchase-to-Pay',
    headline: /Cut average invoice cycle time from 3 days to 1/,
    idea: /Auto-match invoices to purchase orders/,
  },
  {
    id: 'o2c',
    process: 'Order-to-Cash',
    headline: /Cut days-sales-outstanding from 45 to 30/,
    idea: /Auto-release low-risk orders/,
  },
  {
    id: 'carrier',
    process: 'Carrier onboarding',
    headline: /Cut carrier onboarding from 15 working days to 5/,
    idea: /Self-serve document portal/,
  },
]

/** Open a shipped scenario .pnav through the real session-bar Open flow. */
async function loadScenario(page: Page, id: string): Promise<void> {
  // Force the portable (input-based) adapter: the File System Access picker is a native
  // dialog Playwright cannot drive, and the portable path is the one every non-Chromium
  // adopter uses anyway.
  await page.addInitScript(() => {
    // @ts-expect-error - deliberately removing the Chromium-only API for this run
    delete window.showSaveFilePicker
    // @ts-expect-error - see above
    delete window.showOpenFilePicker
  })
  await page.goto('/')
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Open session' }).click(),
  ])
  await chooser.setFiles(join(__dirname, '..', 'demo', `${id}-scenario.pnav`))
  await expect(page.getByText(/Loaded \d+ events from/)).toBeVisible()
}

for (const s of SCENARIOS) {
  test(`the ${s.process} scenario loads full-loop: events replay, the north-star reaches the one-pager, the committed idea reaches the ceremony`, async ({
    page,
  }) => {
    await loadScenario(page, s.id)

    // The re-entry briefing confirms a session WITH CONTENT was reconstructed.
    await expect(page.getByRole('button', { name: 'Dismiss briefing' })).toBeVisible()

    // The full loop reached the export surface: the one-pager leads with the scenario's
    // north-star delta and the honest credibility claim (L2: friction-hunted + data-audited).
    await page.getByRole('button', { name: /One-pager/ }).click()
    const exportDialog = page.getByRole('dialog', { name: 'Export the one-pager' })
    await expect(exportDialog).toBeVisible()
    await expect(exportDialog.getByText(s.headline)).toBeVisible()
    await expect(exportDialog.getByText(/L2 friction-hunted and data-audited/)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(exportDialog).toBeHidden()

    // The committed improvement idea survived the replay: the ceremony lists it and the
    // Sign action is live (a full-loop scenario has something to seal).
    await runPaletteCommand(page, /Sign & commit scores/)
    const ceremony = page.getByRole('dialog', { name: 'Commit ceremony' })
    await expect(ceremony).toBeVisible()
    await expect(ceremony.getByText(s.idea)).toBeVisible()
    await expect(ceremony.getByRole('button', { name: 'Sign & commit' })).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(ceremony).toBeHidden()
  })
}

test('the keyless scripted demo plays the whole seven-beat loop end to end (virtual clock)', async ({
  page,
}) => {
  await page.goto('/')
  // Virtual clock: the 5s-per-beat pacing runs in milliseconds of real time, so the full
  // three-minute story is exercised, not sampled.
  await page.clock.install()
  await page.getByRole('button', { name: /Watch the 3-min demo/ }).click()

  const caption = (text: RegExp) => demoCaption(page, text).first()

  // Beat 1 appears as soon as the lazy demo script chunk arrives (network, real time).
  await expect(caption(/Meet a Purchase-to-Pay process/)).toBeVisible({ timeout: 10000 })

  const BEATS: RegExp[] = [
    /where the pain is/, // 2 - data & rules
    /One idea, raised without judgement/, // 3 - ideation
    /Triaged to Now, then scored/, // 4 - prioritize
    /commitment is signed/, // 5 - the ceremony event
    /The Challenger speaks/, // 6 - evidence-cited probe
    /every figure traces to a source/, // 7 - the improvement case
  ]
  for (const beat of BEATS) {
    await page.clock.runFor(5000)
    await expect(caption(beat)).toBeVisible()
  }

  // The Challenger's canned probe is on the sparring bench, citing the map's own evidence.
  await expect(page.getByText(/Is the effort really a 2\?/)).toBeVisible()

  // The closing caption - the whole loop ran with no key and no model.
  await page.clock.runFor(5000)
  await expect(caption(/That's the whole loop - no key needed/)).toBeVisible()

  // Playback content is not nagged about: a watched demo is "clean", never "unsaved work".
  await expect(page.getByText(/Unsaved changes/)).toBeHidden()

  // And the demo canvas is a REAL canvas: the committed demo idea reaches the ceremony.
  await runPaletteCommand(page, /Sign & commit scores/)
  const ceremony = page.getByRole('dialog', { name: 'Commit ceremony' })
  await expect(ceremony.getByText(/Auto-match invoices to POs/)).toBeVisible()
})
