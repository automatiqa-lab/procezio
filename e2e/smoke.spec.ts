import { test, expect } from '@playwright/test'

// The Solo smoke path: the static-hosted bundle boots, the fixed 8-zone shell renders, and
// the code-split zones load and switch in a real browser. No model is connected - this is the
// deterministic methodology surface, which must work on its own (constitution p6).

test('the shell boots with the eight zones and zone 1 active', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/Process Navigator/)
  // The persistent zone navigation is a labelled landmark.
  const nav = page.getByRole('navigation', { name: 'Canvas zones' })
  await expect(nav).toBeVisible()

  // All eight zones are present as nav buttons; zone 1 (Frame) opens active.
  await expect(nav.getByRole('button', { name: /Frame/ })).toHaveAttribute('aria-current', 'true')
  await expect(nav.getByRole('button', { name: /Improvement case/ })).toBeVisible()
})

test('opening the Map zone loads its lazy chunk and renders the canvas', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Canvas zones' })

  await nav.getByRole('button', { name: /Map/ }).click()
  // React Flow (the Map surface, in its own lazily-loaded chunk) mounts its pane.
  await expect(page.locator('.react-flow')).toBeVisible()
})

test('navigating to a later zone switches the active panel', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Canvas zones' })

  const ideation = nav.getByRole('button', { name: /Ideation/ })
  await ideation.click()
  await expect(ideation).toHaveAttribute('aria-current', 'true')
  // The Ideation zone's own heading is now on screen.
  await expect(page.getByRole('heading', { name: /Ideation/i })).toBeVisible()
})
