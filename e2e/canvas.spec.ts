import { test, expect, type Page } from '@playwright/test'
import { runPaletteCommand, demoCaption } from './helpers'

// v0.4 one-canvas interactions on the real production bundle: camera-flight navigation via the
// (fixed) zone rail, the command palette, and the commit ceremony. Driven through the fixed
// chrome (rail, top-bar buttons, palette, modal) rather than in-world content on the CSS-
// transformed surface; the store-level behaviour of the zones is covered by unit tests.

test('the zone rail flies the camera and marks the active zone', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Canvas zones' })
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('button', { name: /^Frame/ })).toHaveAttribute('aria-current', 'true')

  await nav.getByRole('button', { name: /Risk gate/ }).click()
  await expect(nav.getByRole('button', { name: /Risk gate/ })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await expect(nav.getByRole('button', { name: /^Frame/ })).not.toHaveAttribute(
    'aria-current',
    'true',
  )
})

test('the command palette opens from the top bar and can be dismissed', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '⌘K' }).click()
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  await expect(palette.getByRole('button', { name: /Go to Risk gate/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()
})

test('the commit ceremony (reached via the palette) refuses to sign with nothing committed', async ({
  page,
}) => {
  await page.goto('/')
  // The palette shows every command when the query is empty - click the commit command.
  await runPaletteCommand(page, /Sign & commit scores/)
  const ceremony = page.getByRole('dialog', { name: 'Commit ceremony' })
  await expect(ceremony).toBeVisible()
  await expect(ceremony.getByText(/No committed ideas yet/)).toBeVisible()
  await expect(ceremony.getByRole('button', { name: 'Sign & commit' })).toBeDisabled()
})

test('the one-pager export popover opens and shows the credibility header', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /One-pager/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Export the one-pager' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/Credibility:/)).toBeVisible()
})

// Regression (2026-07-24): the PNG export actually RENDERS under the shipped CSP. The
// rasterizer used a blob: image URL, which `img-src 'self' data:` blocks - every export
// failed in the production build, and no test ever pressed the button. This one does.
test('pressing PNG in the export popover produces a real download under the strict CSP', async ({
  page,
}) => {
  await page.goto('/')
  await runPaletteCommand(page, /Start from a template/)
  await page
    .getByRole('dialog', { name: 'Start from a template' })
    .getByRole('button', { name: /Purchase-to-Pay/ })
    .click()
  await page.getByRole('button', { name: /One-pager/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Export the one-pager' })
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'PNG', exact: true }).click()
  const download = await downloadPromise
  expect(await download.suggestedFilename()).toMatch(/one-pager\.png$/)
  await expect(page.getByText(/^Exported .*one-pager\.png/)).toBeVisible()
})

test('the keyless demo starts from the palette and narrates, with no model connected', async ({
  page,
}) => {
  await page.goto('/')
  await runPaletteCommand(page, /Watch the 3-min demo/)
  // The demo caption bar appears (lazy script loads), with a Stop control - all keyless.
  const caption = demoCaption(page)
  await expect(caption.first()).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible()
  await page.getByRole('button', { name: 'Stop' }).click()
})

test('a template can be started from the palette and seeds the process name', async ({ page }) => {
  await page.goto('/')
  await runPaletteCommand(page, /Start from a template/)
  const picker = page.getByRole('dialog', { name: 'Start from a template' })
  await expect(picker).toBeVisible()
  await picker.getByRole('button', { name: /Purchase-to-Pay/ }).click()
  await expect(picker).toBeHidden()
  // The seeded process name reaches the top-bar credibility claim / one-pager preview.
  await page.getByRole('button', { name: /One-pager/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Export the one-pager' })
  await expect(dialog.getByText(/Invoice cycle time/)).toBeVisible()
})

// React Flow mounts edges progressively (each waits for its endpoints' first measure),
// so a baseline read too early sees a partial set. Settled = the count is non-zero and
// unchanged across two samples.
async function settledEdgePaths(page: Page): Promise<string[]> {
  const paths = page.locator('.react-flow__edge-path')
  await expect
    .poll(
      async () => {
        const n = await paths.count()
        if (n === 0) return 'none'
        await page.waitForTimeout(300)
        return (await paths.count()) === n ? `stable:${n}` : 'growing'
      },
      { timeout: 15000 },
    )
    .toMatch(/^stable:/)
  return paths.evaluateAll((els) => els.map((e) => e.getAttribute('d') ?? ''))
}

/** Seed the P2P template and fly to the Map zone (shared by the map regression tests). */
async function openTemplateMap(page: Page): Promise<void> {
  await page.goto('/')
  await runPaletteCommand(page, /Start from a template/)
  await page
    .getByRole('dialog', { name: 'Start from a template' })
    .getByRole('button', { name: /Purchase-to-Pay/ })
    .click()
  await page
    .getByRole('navigation', { name: 'Canvas zones' })
    .getByRole('button', { name: /Map/ })
    .click()
}

// Regression (2026-07-24): React Flow's measured handle bounds absorbed the one-canvas
// camera scale, so selecting a node re-measured it at a different zoom and its connectors
// visibly reshaped. FlowEdge computes paths from layout truth - selecting a node must not
// change a single path byte. This test reads SVG attributes (data, not in-world layout
// assertions) and force-clicks a shape (the canvas is CSS-transformed).
test('selecting a mapped step never reshapes its connectors (deterministic edge paths)', async ({
  page,
}) => {
  await openTemplateMap(page)
  const before = await settledEdgePaths(page)

  // Click two different connected shapes; the connector geometry must not move a byte.
  const shapes = page.locator('.react-flow__node:not(.react-flow__node-lane)')
  await shapes.nth(2).click({ force: true })
  await shapes.nth(4).click({ force: true })
  const after = await settledEdgePaths(page)
  expect(after).toEqual(before)
})

test('a mistaken step is deleted via the hover ✕ and takes its connectors with it (Redo restores)', async ({
  page,
}) => {
  await openTemplateMap(page)
  const edgesBefore = (await settledEdgePaths(page)).length
  const shapes = page.locator('.react-flow__node:not(.react-flow__node-lane)')
  const edgePaths = page.locator('.react-flow__edge-path')
  const nodesBefore = await shapes.count()

  // Selecting the shape makes ITS delete ✕ visible (hover-or-selected affordance);
  // every other node's ✕ stays at opacity 0, so scope to the selected wrapper.
  await shapes.nth(2).click({ force: true })
  await page
    .locator('.react-flow__node.selected')
    .getByRole('button', { name: /^Delete / })
    .click({ force: true })

  // The calm toast confirms, the node is gone, and at least one connector went with it.
  await expect(page.getByText(/Removed ".+" and everything pinned to it/)).toBeVisible()
  await expect(shapes).toHaveCount(nodesBefore - 1)
  expect(await edgePaths.count()).toBeLessThan(edgesBefore)
})

// The New button (2026-07-24): a fresh workspace in a NEW TAB - the current session
// stays untouched, and the fresh tab starts truly blank (start door, no restore offer
// leaking in from this tab's autosave).
test('New process opens a blank workspace in a new tab, leaving the current session alone', async ({
  page,
  context,
}) => {
  await page.goto('/')
  // Give THIS tab real work (a template session) so its autosave slot is live.
  await runPaletteCommand(page, /Start from a template/)
  await page
    .getByRole('dialog', { name: 'Start from a template' })
    .getByRole('button', { name: /Purchase-to-Pay/ })
    .click()

  const popupPromise = context.waitForEvent('page')
  await page.getByRole('button', { name: 'New process in a new window' }).click()
  const fresh = await popupPromise
  await fresh.waitForLoadState()

  // The fresh tab lands on the start door - blank canvas, no restore banner.
  await expect(fresh.getByRole('button', { name: /Watch the 3-min demo/ })).toBeVisible()
  await expect(fresh.getByText(/Restore/)).toBeHidden()
  // And the original tab still holds its session (the one-pager knows the template).
  await page.getByRole('button', { name: /One-pager/ }).click()
  await expect(
    page.getByRole('dialog', { name: 'Export the one-pager' }).getByText(/Invoice cycle time/),
  ).toBeVisible()
})

// Actionable blockers (card 3061): the assumption-ledger gate message is a BUTTON that
// lands the user on the offending entry with its verify-plan editor open, and the entry's
// own "Needs a verify plan" opens the same editor - the fix happens where the message is.
test('the assumption blocker is clickable: add a verify plan in place and the export gate clears', async ({
  page,
}) => {
  await page.goto('/')
  // A session must exist before the ledger can be written to.
  await runPaletteCommand(page, /Start from a template/)
  await page
    .getByRole('dialog', { name: 'Start from a template' })
    .getByRole('button', { name: /Purchase-to-Pay/ })
    .click()

  // Flag a LOW assumption with no verify plan - the blocker appears.
  await page.getByRole('button', { name: '+ Flag an assumption' }).click()
  await page.getByLabel('Assumption statement').fill('Most credit holds clear with no change')
  await page.getByLabel('Assumption source').fill('gut feel from the collections desk')
  await page.getByLabel('Assumption confidence').selectOption('low')
  await page.getByRole('button', { name: 'Flag it' }).click()
  await expect(page.getByText(/1 low-confidence assumption needs a verify plan/)).toBeVisible()

  // The banner is the way in: click it, the entry's editor opens, type the plan, save.
  await page
    .getByRole('button', { name: 'Go to the first assumption that needs a verify plan' })
    .click()
  const planInput = page.getByRole('textbox', { name: 'Verify plan' })
  await expect(planInput).toBeVisible()
  await planInput.fill('Pull 2 weeks of hold releases with the credit team')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  // Fixed IN PLACE: no duplicate entry, the gate clears, the plan shows on the entry.
  await expect(page.getByText('All assumptions acknowledged - export is clear.')).toBeVisible()
  await expect(page.getByText(/Needs a verify plan/)).toBeHidden()
  await expect(page.getByText(/Verify: Pull 2 weeks of hold releases/)).toBeVisible()

  // EVERY entry stays clickable after acknowledgement: reopen the card, raise the
  // confidence after verifying, save - the chip updates in place (still one entry).
  const card = page.getByRole('button', { name: /Review assumption: Most credit holds/ })
  await card.click()
  await page.getByLabel('Confidence after review').selectOption('med')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card).toContainText('med')

  // A source that names a zone gets a direct jump to the place needing clarification.
  await page.getByRole('button', { name: '+ Flag an assumption' }).click()
  await page.getByLabel('Assumption statement').fill('60% of orders sit under the threshold')
  await page.getByLabel('Assumption source').fill('Zone 4 numbers')
  await page.getByRole('button', { name: 'Flag it' }).click()
  await page.getByRole('button', { name: /Clarify in Data & Rules/ }).click()
  await expect(
    page
      .getByRole('navigation', { name: 'Canvas zones' })
      .getByRole('button', { name: /Data & Rules/ }),
  ).toHaveAttribute('aria-current', 'true')
})

// Autopopulation (card 3060): a human map edit that records a signal (a re-key
// handoff) must surface a deterministic pencil suggestion for review - no LLM, no
// key. The pencil review panel is fixed chrome, so the assertion is stable.
test('marking a handoff re-key raises a pencil friction suggestion to accept or reject', async ({
  page,
}) => {
  await openTemplateMap(page)
  await settledEdgePaths(page)

  // Open a handoff panel by clicking a connector's wide hit-path, then record re-key.
  await page.locator('.react-flow__edge').first().click({ force: true })
  const panel = page.getByRole('complementary', { name: 'Handoff detail' })
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 're-key', exact: true }).click()

  // The deterministic deriver answers with a pencil friction suggestion citing the map.
  await expect(page.getByText(/✎ Pencil - review each/)).toBeVisible()
  await expect(page.getByText('Friction: Extra-processing')).toBeVisible()

  // Reject it - and it must NOT come back when the map is touched again.
  await page.getByRole('button', { name: /Reject Friction: Extra-processing/ }).click()
  await expect(page.getByText('Friction: Extra-processing')).toBeHidden()
  await panel.getByRole('button', { name: 'paper', exact: true }).click()
  await panel.getByRole('button', { name: 're-key', exact: true }).click()
  await expect(page.getByText('Friction: Extra-processing')).toBeHidden()
})

test('the empty canvas shows the start door, and ?demo=1 deep-links straight into the demo', async ({
  page,
}) => {
  await page.goto('/')
  // A brand-new visitor sees the demo + template chips without knowing ⌘K exists.
  await expect(page.getByRole('button', { name: /Watch the 3-min demo/ })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Start from a template', exact: true }),
  ).toBeVisible()
  // The zero-setup deep link: no palette, no clicks - the demo just plays.
  await page.goto('/?demo=1')
  const caption = demoCaption(page)
  await expect(caption.first()).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Stop' }).click()
})
