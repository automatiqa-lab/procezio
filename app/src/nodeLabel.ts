// The ONE step-label rule (like templates/template.ts laneIdFor is the one slugifier):
// a node reads as its metadata action, else its label, else its id. Nine surfaces
// (zones, exports, prompts, pencil review) each carried a private copy of this
// expression before; a label-format change now has exactly one home, and every
// consumer - UI list, one-pager, LLM context, suggestion note - names a step the
// same way.

import type { Node } from '@procezio/schema'

export function nodeLabel(node: Node): string {
  return node.metadata?.action?.trim() || node.label || node.id
}
