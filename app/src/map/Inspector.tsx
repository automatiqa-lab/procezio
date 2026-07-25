// M2-03 + v0.4 - the Zone 2 (Map) node inspector / detail panel.
//
// View-only: the inspector renders a form seeded from the SELECTED node (read from the
// projection, so it always reflects committed state) and, on save, hands an edited schema Node
// back to MapZone, which dispatches it as a node.updated (a same-id node.created upsert). The
// inspector itself never mutates canvas state.
//
// v0.4 (spec 01b section 3, prototype #npanel): below the label + legacy metadata, a per-type
// DETAIL panel - Step (systems, touch/elapsed/frequency as tagged quantities, rework, batch,
// standardized), Decision (question, basis, decider, rule-ref), Wait (duration + worst,
// waiting-on, chasing, release trigger), Start (arrival pattern), End (DoD, consumer), plus the
// varies flag. Every field optional; absence feeds an Auditor probe, never a blocker.

import { useEffect, useState } from 'react'
import type {
  ConfidenceTag,
  DecisionDetail,
  EndDetail,
  Node,
  StartDetail,
  StepDetail,
  TaggedQuantity,
  WaitDetail,
} from '@procezio/schema'
import { theme } from '../theme.js'
import { nodeMetadataFrom } from './events.js'
import type { MetadataForm } from './events.js'

export interface InspectorProps {
  node: Node
  onSave: (node: Node) => void
  onClose: () => void
}

const CONFIDENCE: readonly ConfidenceTag[] = [
  'gut-feel',
  'verified',
  'log-checked',
  'document-backed',
]

function formFor(node: Node): { label: string } & MetadataForm {
  const md = node.metadata ?? {}
  return {
    label: node.label,
    actor: md.actor ?? '',
    action: md.action ?? '',
    system: md.system ?? '',
    input: md.input ?? '',
    output: md.output ?? '',
    time: md.time ?? '',
  }
}

const FIELDS: readonly { key: keyof MetadataForm; label: string }[] = [
  { key: 'actor', label: 'Actor' },
  { key: 'action', label: 'Action' },
  { key: 'system', label: 'System' },
  { key: 'input', label: 'Input' },
  { key: 'output', label: 'Output' },
  { key: 'time', label: 'Time' },
]

// The whole v0.4 detail for a node, as flat editable state (assembled per-type on save).
interface DetailForm {
  varies: boolean
  // step
  systems: string
  touch: TaggedQuantity
  elapsed: TaggedQuantity
  frequency: TaggedQuantity
  rework: boolean
  batch: '' | 'batch' | 'one-by-one'
  standardized: '' | 'standardized' | 'improvised'
  // decision
  question: string
  basis: '' | 'written-rule' | 'judgment' | 'escalation'
  decider: string
  ruleRef: string
  table: Array<{ when: string; then: string }>
  // decision table (F5): the when -> then rules, made explicit
  // wait
  duration: TaggedQuantity
  durationWorst: TaggedQuantity
  waitingOn: '' | 'external' | 'internal-approval' | 'system'
  chasing: boolean
  releaseTrigger: string
  // start / end
  arrival: '' | 'steady' | 'batchy' | 'seasonal'
  dod: string
  consumer: string
}

const tq = (t?: TaggedQuantity): TaggedQuantity => ({
  value: t?.value ?? '',
  ...(t?.confidence ? { confidence: t.confidence } : {}),
})

function detailFor(node: Node): DetailForm {
  const s = node.step_detail
  const d = node.decision_detail
  const w = node.wait_detail
  return {
    varies: node.varies ?? false,
    systems: (s?.systems ?? []).join(', '),
    touch: tq(s?.touch_time),
    elapsed: tq(s?.elapsed_time),
    frequency: tq(s?.frequency),
    rework: s?.rework ?? false,
    batch: s?.batch ?? '',
    standardized: s?.standardized ?? '',
    question: d?.question ?? '',
    basis: d?.basis ?? '',
    decider: d?.decider ?? '',
    ruleRef: d?.rule_ref ?? '',
    table: (d?.decision_table ?? []).map((r) => ({ when: r.when, then: r.then })),
    duration: tq(w?.duration),
    durationWorst: tq(w?.duration_worst),
    waitingOn: w?.waiting_on ?? '',
    chasing: w?.chasing ?? false,
    releaseTrigger: w?.release_trigger ?? '',
    arrival: node.start_detail?.arrival_pattern ?? '',
    dod: node.end_detail?.definition_of_done ?? '',
    consumer: node.end_detail?.consumer ?? '',
  }
}

/** Drop empty-string keys and empty tagged quantities so an untouched panel stays absent. */
function clean<T extends object>(o: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === '' || v === false) continue
    if (Array.isArray(v) && v.length === 0) continue
    out[k] = v
  }
  return out as Partial<T>
}

function tqOrUndef(t: TaggedQuantity): TaggedQuantity | undefined {
  return t.value.trim() === '' ? undefined : t
}

export function Inspector({ node, onSave, onClose }: InspectorProps): JSX.Element {
  const [form, setForm] = useState(() => formFor(node))
  const [detail, setDetail] = useState(() => detailFor(node))

  useEffect(() => {
    setForm(formFor(node))
    setDetail(detailFor(node))
  }, [node])

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  const setD = <K extends keyof DetailForm>(key: K, value: DetailForm[K]) =>
    setDetail((prev) => ({ ...prev, [key]: value }))

  const save = (): void => {
    const metadata = nodeMetadataFrom(form)
    let next: Node = { ...node, label: form.label }
    // Strip any prior detail so the panel is the source of truth on save.
    delete next.step_detail
    delete next.decision_detail
    delete next.wait_detail
    delete next.start_detail
    delete next.end_detail
    delete next.varies
    if (Object.keys(metadata).length > 0) next = { ...next, metadata }
    if (detail.varies) next.varies = true

    if (node.type === 'Step') {
      const sd = clean<StepDetail>({
        systems: detail.systems.trim()
          ? detail.systems
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean)
          : [],
        touch_time: tqOrUndef(detail.touch),
        elapsed_time: tqOrUndef(detail.elapsed),
        frequency: tqOrUndef(detail.frequency),
        rework: detail.rework,
        batch: detail.batch || undefined,
        standardized: detail.standardized || undefined,
      } as StepDetail)
      if (Object.keys(sd).length > 0) next.step_detail = sd
    } else if (node.type === 'Decision') {
      // Keep only complete when->then rows; drop half-empty ones.
      const rows = detail.table
        .map((r) => ({ when: r.when.trim(), then: r.then.trim() }))
        .filter((r) => r.when !== '' && r.then !== '')
      const dd = clean<DecisionDetail>({
        question: detail.question,
        basis: detail.basis || undefined,
        decider: detail.decider,
        rule_ref: detail.ruleRef,
        ...(rows.length > 0 ? { decision_table: rows } : {}),
      } as DecisionDetail)
      if (Object.keys(dd).length > 0) next.decision_detail = dd
    } else if (node.type === 'Wait') {
      const wd = clean<WaitDetail>({
        duration: tqOrUndef(detail.duration),
        duration_worst: tqOrUndef(detail.durationWorst),
        waiting_on: detail.waitingOn || undefined,
        chasing: detail.chasing,
        release_trigger: detail.releaseTrigger,
      } as WaitDetail)
      if (Object.keys(wd).length > 0) next.wait_detail = wd
    } else if (node.type === 'Start') {
      const st = clean<StartDetail>({ arrival_pattern: detail.arrival || undefined } as StartDetail)
      if (Object.keys(st).length > 0) next.start_detail = st
    } else if (node.type === 'End') {
      const ed = clean<EndDetail>({
        definition_of_done: detail.dod,
        consumer: detail.consumer,
      })
      if (Object.keys(ed).length > 0) next.end_detail = ed
    }
    onSave(next)
  }

  const inputStyle = {
    padding: '7px 9px',
    fontSize: 13,
    color: theme.text,
    background: '#ffffff',
    border: `1px solid ${theme.border}`,
    borderRadius: 6,
    width: '100%',
    boxSizing: 'border-box' as const,
  }
  const labelStyle = { fontSize: 11, fontWeight: 700, color: theme.textMuted, marginBottom: 4 }
  const tableInput = {
    flex: '1 1 0',
    minWidth: 0,
    padding: '5px 7px',
    fontSize: 12,
    color: theme.text,
    background: '#ffffff',
    border: `1px solid ${theme.border}`,
    borderRadius: 5,
    boxSizing: 'border-box' as const,
  }

  const Text = (label: string, value: string, onChange: (v: string) => void) => (
    <div style={{ marginBottom: 10 }}>
      <div style={labelStyle}>{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={inputStyle}
      />
    </div>
  )
  const Tagged = (label: string, value: TaggedQuantity, onChange: (v: TaggedQuantity) => void) => (
    <div style={{ marginBottom: 10 }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={value.value}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
          aria-label={label}
          style={{ ...inputStyle, flex: '1 1 auto' }}
        />
        <select
          value={value.confidence ?? ''}
          onChange={(e) =>
            onChange(
              e.target.value
                ? { value: value.value, confidence: e.target.value as ConfidenceTag }
                : { value: value.value },
            )
          }
          aria-label={`${label} source grade`}
          style={{ ...inputStyle, width: 120, flex: '0 0 120px' }}
        >
          <option value="">source…</option>
          {CONFIDENCE.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
  const Select = (
    label: string,
    value: string,
    opts: readonly string[],
    onChange: (v: string) => void,
  ) => (
    <div style={{ marginBottom: 10 }}>
      <div style={labelStyle}>{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={inputStyle}
      >
        <option value="">-</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
  const Toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <label
      style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13 }}
    >
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      {label}
    </label>
  )

  return (
    <aside
      aria-label="Node inspector"
      style={{
        width: 300,
        flex: '0 0 300px',
        height: '100%',
        boxSizing: 'border-box',
        overflowY: 'auto',
        background: theme.surface,
        borderLeft: `1px solid ${theme.border}`,
        padding: '18px 18px 28px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{node.type} node</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspector"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 16,
            color: theme.textMuted,
          }}
        >
          &times;
        </button>
      </div>

      {Text('Label', form.label, set('label'))}
      {FIELDS.map((f) => (
        <div key={f.key}>{Text(f.label, form[f.key], set(f.key))}</div>
      ))}

      {/* v0.4 per-type detail. */}
      <div
        style={{
          marginTop: 8,
          paddingTop: 10,
          borderTop: `1px dashed ${theme.border}`,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: theme.accent,
          marginBottom: 8,
        }}
      >
        Detail
      </div>

      {node.type === 'Step' && (
        <>
          {Text('Systems used (comma-separated)', detail.systems, (v) => setD('systems', v))}
          {Tagged('Touch time', detail.touch, (v) => setD('touch', v))}
          {Tagged('Elapsed time', detail.elapsed, (v) => setD('elapsed', v))}
          {Tagged('Frequency', detail.frequency, (v) => setD('frequency', v))}
          {Toggle('Rework loop?', detail.rework, (v) => setD('rework', v))}
          {Select('Batch vs one-by-one', detail.batch, ['batch', 'one-by-one'], (v) =>
            setD('batch', v as DetailForm['batch']),
          )}
          {Select('Standardized?', detail.standardized, ['standardized', 'improvised'], (v) =>
            setD('standardized', v as DetailForm['standardized']),
          )}
        </>
      )}
      {node.type === 'Decision' && (
        <>
          {Text('The question', detail.question, (v) => setD('question', v))}
          {Select('Basis', detail.basis, ['written-rule', 'judgment', 'escalation'], (v) =>
            setD('basis', v as DetailForm['basis']),
          )}
          {Text('Decider', detail.decider, (v) => setD('decider', v))}
          {Text('Rule ref (Data & rules)', detail.ruleRef, (v) => setD('ruleRef', v))}
          {/* Decision table (F5): the when -> then rules, made explicit instead of left in a head. */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, marginBottom: 4 }}>
              DECISION TABLE (when → then)
            </div>
            {detail.table.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
                <input
                  aria-label={`when ${i + 1}`}
                  value={row.when}
                  placeholder="when…"
                  onChange={(e) =>
                    setD(
                      'table',
                      detail.table.map((r, j) => (j === i ? { ...r, when: e.target.value } : r)),
                    )
                  }
                  style={tableInput}
                />
                <span style={{ alignSelf: 'center', color: theme.textMuted }}>→</span>
                <input
                  aria-label={`then ${i + 1}`}
                  value={row.then}
                  placeholder="then…"
                  onChange={(e) =>
                    setD(
                      'table',
                      detail.table.map((r, j) => (j === i ? { ...r, then: e.target.value } : r)),
                    )
                  }
                  style={tableInput}
                />
                <button
                  type="button"
                  aria-label={`remove rule ${i + 1}`}
                  onClick={() =>
                    setD(
                      'table',
                      detail.table.filter((_, j) => j !== i),
                    )
                  }
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: theme.textMuted,
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setD('table', [...detail.table, { when: '', then: '' }])}
              style={{
                fontSize: 11,
                color: theme.accent,
                background: 'transparent',
                border: `1px solid ${theme.border}`,
                borderRadius: 6,
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              + add rule
            </button>
          </div>
        </>
      )}
      {node.type === 'Wait' && (
        <>
          {Tagged('Duration (avg)', detail.duration, (v) => setD('duration', v))}
          {Tagged('Duration (worst)', detail.durationWorst, (v) => setD('durationWorst', v))}
          {Select(
            'Waiting on',
            detail.waitingOn,
            ['external', 'internal-approval', 'system'],
            (v) => setD('waitingOn', v as DetailForm['waitingOn']),
          )}
          {Toggle('Chasing? (hidden touch time)', detail.chasing, (v) => setD('chasing', v))}
          {Text('Release trigger', detail.releaseTrigger, (v) => setD('releaseTrigger', v))}
        </>
      )}
      {node.type === 'Start' && (
        <>
          {Select('Arrival pattern', detail.arrival, ['steady', 'batchy', 'seasonal'], (v) =>
            setD('arrival', v as DetailForm['arrival']),
          )}
        </>
      )}
      {node.type === 'End' && (
        <>
          {Text('Definition of done', detail.dod, (v) => setD('dod', v))}
          {Text('Downstream consumer', detail.consumer, (v) => setD('consumer', v))}
        </>
      )}
      {(node.type === 'Step' || node.type === 'Decision' || node.type === 'Wait') &&
        Toggle('Varies (season/mode)?', detail.varies, (v) => setD('varies', v))}

      <p style={{ fontSize: 11, color: theme.textMuted, margin: '4px 0 10px' }}>
        All fields optional. Empty fields become Auditor probes, never blockers.
      </p>

      <button
        type="button"
        onClick={save}
        style={{
          marginTop: 2,
          width: '100%',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 700,
          color: theme.onAccent,
          background: theme.accent,
          border: 'none',
          borderRadius: 6,
          padding: '10px 12px',
        }}
      >
        Save changes
      </button>
    </aside>
  )
}
