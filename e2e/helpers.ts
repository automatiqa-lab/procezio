// Shared e2e helpers - the fixed-chrome interactions every spec repeats. Like the specs,
// these go through the fixed chrome (top bar, palette dialog, caption bar), never through
// in-world content on the CSS-transformed canvas surface.

import type { Locator, Page } from '@playwright/test'

/**
 * Open the command palette from the top bar and click `commandName` inside it. Scoped to
 * the palette dialog: the start chips on the empty canvas reuse some command labels.
 */
export async function runPaletteCommand(page: Page, commandName: RegExp): Promise<void> {
  await page.getByRole('button', { name: '⌘K' }).click()
  await page
    .getByRole('dialog', { name: 'Command palette' })
    .getByRole('button', { name: commandName })
    .click()
}

/** The demo caption bar (role=status): the playing narration, or its loading placeholder. */
export function demoCaption(
  page: Page,
  text: RegExp = /Purchase-to-Pay|Loading the demo/,
): Locator {
  return page.getByRole('status').filter({ hasText: text })
}
