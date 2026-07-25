// v0.4 risk-prompt deck (spec 01b Wave 3 F7): risk cards dealt against the mapped steps.
//
// A deterministic deck of risk heuristics read from the node detail already captured - a wait with
// hidden chasing, a step that loops back, an improvised (non-standard) step, a judgment-based
// decision, a step spanning several systems. Each is a card against a specific node; an unaddressed
// one reads red. Pure and heuristic (no LLM); the agent only ever words what this has surfaced. The
// heuristics are a fixed deck here, but they are the kind of rule a swappable pack could carry.

import type { Canvas } from '@procezio/schema'

export interface RiskPrompt {
  node_id: string
  label: string
  prompt: string
}

/** Deal the risk deck against the map. Empty = nothing on the map trips a risk heuristic. */
export function riskPrompts(canvas: Canvas): RiskPrompt[] {
  const out: RiskPrompt[] = []
  const add = (node_id: string, label: string, prompt: string): void =>
    void out.push({ node_id, label, prompt })

  for (const n of canvas.nodes ?? []) {
    const label = n.label || n.id
    if (n.type === 'Wait' && n.wait_detail?.chasing === true) {
      add(
        n.id,
        label,
        'Someone chases during this wait - hidden touch time and a single point of failure.',
      )
    }
    if (n.type === 'Step') {
      if (n.step_detail?.rework === true) {
        add(n.id, label, 'This step loops back - rework risk. What share is redone, and why?')
      }
      if (n.step_detail?.standardized === 'improvised') {
        add(n.id, label, 'Improvised, not standardized - the outcome varies by who runs it.')
      }
      if ((n.step_detail?.systems?.length ?? 0) > 1) {
        add(
          n.id,
          label,
          `Spans ${n.step_detail!.systems!.length} systems - integration gaps and re-keyed data.`,
        )
      }
    }
    if (n.type === 'Decision' && n.decision_detail?.basis === 'judgment') {
      add(n.id, label, 'Decided on judgment - inconsistent outcomes and hard to audit or automate.')
    }
  }
  return out
}
