import { test, expect } from '@playwright/test'

// The core promise: "your process knowledge never leaves your boundary" (specs/05). This is
// the runtime proof of it - with no model configured, loading the app and working the canvas
// must make ZERO off-origin network requests: no telemetry, no CDN, no analytics, no fonts
// from elsewhere. Any request to a host other than the app's own origin fails the test.
//
// It complements the static ci:security-solo gate (which greps source for egress) by watching
// the actual browser traffic of the shipped bundle.

test('no off-origin network requests on load or basic use', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const offOrigin: string[] = []

  page.on('request', (req) => {
    const url = req.url()
    if (url.startsWith('data:') || url.startsWith('blob:')) return
    if (!url.startsWith(origin)) offOrigin.push(url)
  })

  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Canvas zones' })

  // Exercise the app: open the heavy Map chunk, then another zone.
  await nav.getByRole('button', { name: /Map/ }).click()
  await expect(page.locator('.react-flow')).toBeVisible()
  await nav.getByRole('button', { name: /Ideation/ }).click()
  await expect(page.getByRole('heading', { name: /Ideation/i })).toBeVisible()

  expect(offOrigin, `unexpected off-origin requests:\n${offOrigin.join('\n')}`).toEqual([])
})
