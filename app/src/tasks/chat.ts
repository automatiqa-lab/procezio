// C-TASK #3 - the agent chat: answer questions about the canvas, grounded in it.
//
// The conversational surface of the co-working agent (spec section 10, "surfaces: chat
// sidebar"). The agent answers the user's question about THEIR process, grounded in a
// summary of the canvas, and invents nothing. Its replies are agent-authored, born
// pencil (two-ink) and logged as agent.message events - an auditable trail of what the
// agent said. A failure yields null and the chat says so; with no model the panel is
// hidden entirely (the methodology needs no agent - constitution p6).
//
// Pure of DOM/network (client transport injected), so it runs headless with a stub client.

import type { Canvas } from '@procezio/schema'
import type { LlmCallOptions, LlmClient } from '@procezio/core'
import type { DispatchCandidate } from '../store/canvas-store.js'
import { agentPencil } from '../store/envelope.js'
import { getPrompt } from './prompts.js'
import { nodeLabel } from '../nodeLabel.js'

/**
 * A compact, plain-text summary of the canvas for grounding the agent's answer. Lists
 * the process frame, the mapped steps, pinned friction, data tags, ideas, and gate
 * state - the same facts the human sees, so the agent cannot cite anything invented.
 */
export function summarizeCanvas(canvas: Canvas): string {
  const lines: string[] = []
  const p = canvas.process
  if (p.name?.trim()) lines.push(`Process: ${p.name.trim()}`)
  if (p.north_star?.trim()) lines.push(`North-star: ${p.north_star.trim()}`)
  if (canvas.nodes.length > 0) {
    lines.push(`Steps: ${canvas.nodes.map(nodeLabel).join(' -> ')}`)
  }
  const friction = canvas.friction ?? []
  if (friction.length > 0) lines.push(`Friction: ${friction.map((f) => f.waste).join(', ')}`)
  const audit = canvas.audit_tags ?? []
  if (audit.length > 0) lines.push(`Data/rules profiled on ${audit.length} step(s).`)
  const opps = canvas.opportunities ?? []
  if (opps.length > 0) lines.push(`Ideas: ${opps.map((o) => o.title).join('; ')}`)
  const committed = opps.filter((o) => o.committed === true)
  if (committed.length > 0) lines.push(`Committed & scored: ${committed.length}.`)
  return lines.length > 0 ? lines.join('\n') : '(the canvas is still mostly empty)'
}

/**
 * Ask the agent a free-text question, grounded in the canvas summary. Returns the reply,
 * or null if the model is unreachable or errors (the chat surfaces the failure).
 */
export async function askAgent(
  client: LlmClient,
  question: string,
  canvas: Canvas,
  opts?: LlmCallOptions,
): Promise<string | null> {
  const prompt = getPrompt('chat', { canvas: summarizeCanvas(canvas), question })
  try {
    const { text } = await client.complete(
      [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      opts,
    )
    const trimmed = text.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

/**
 * Log the agent's reply as an agent.message event (agent-authored, born pencil). This is
 * the auditable record of what the agent said; the chat conversation itself is UI state.
 */
export function chatCandidate(sessionId: string, text: string): DispatchCandidate {
  return agentPencil(sessionId, 'agent.message', { text }, 'agent', { schemaVersion: '1.0' })
}
