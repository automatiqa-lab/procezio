// GENERATED from disclosure/disclosure.yaml by ci:disclosure-drift. Do not edit by hand -
// CI fails on drift. Regenerate with: node scripts/gates/disclosure-drift.mjs --write
import type { DisclosureIdentity, DisclosureWording } from '@procezio/core'

export const DISCLOSURE: DisclosureIdentity = {
  "version": 1,
  "schema": "automatiqa-disclosure/1",
  "system": "procezio",
  "scope": [
    "canvas_items"
  ],
  "contact": "aleks@automatiqa.io"
}

export const DISCLOSURE_WORDING: DisclosureWording = {
  "session_notice": "You are working with an AI agent. It drafts; you decide what stays.",
  "drafted": "AI-assisted · {drafted} of {total} items drafted by the agent, accepted by the author",
  "unreviewed": "AI-assisted · {drafted} drafted by the agent · {pending} still pencil, not reviewed",
  "none": ""
}
