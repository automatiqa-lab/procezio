// GENERATED from templates/*.json by ci:templates-drift. Do not edit by hand - CI fails on
// drift. Regenerate with: corepack pnpm --filter @procezio/schema run gen:templates
import type { Template } from './template.js'

export const TEMPLATES: Template[] = [
  {
    "id": "carrier",
    "name": "Carrier onboarding",
    "description": "A new haulier from application to active in the TMS, with document, insurance and credit checks. Understand zones are seeded; Diverge and Converge are left empty so the ideas are yours.",
    "frame": {
      "name": "Carrier onboarding",
      "trigger": "A new carrier applies to haul for us",
      "end_state": "The carrier is verified and active in the TMS",
      "owner": "Compliance and Logistics Operations",
      "frequency": "weekly",
      "volume": "~30 carriers per quarter",
      "north_star": "Onboarding lead time - application to first booking"
    },
    "nodes": [
      {
        "id": "car-start",
        "type": "Start",
        "lane": "Carrier",
        "label": "Carrier applies"
      },
      {
        "id": "car-docs",
        "type": "Step",
        "lane": "Compliance",
        "label": "Collect documents"
      },
      {
        "id": "car-complete",
        "type": "Decision",
        "lane": "Compliance",
        "label": "Docs complete?"
      },
      {
        "id": "car-chase",
        "type": "Wait",
        "lane": "Compliance",
        "label": "Chase missing docs"
      },
      {
        "id": "car-insurance",
        "type": "Step",
        "lane": "Compliance",
        "label": "Verify insurance"
      },
      {
        "id": "car-credit",
        "type": "Step",
        "lane": "Finance",
        "label": "Run credit check"
      },
      {
        "id": "car-setup",
        "type": "Step",
        "lane": "Ops",
        "label": "Set up in TMS"
      },
      {
        "id": "car-end",
        "type": "End",
        "lane": "Ops",
        "label": "Carrier active"
      }
    ],
    "edges": [
      {
        "id": "car-e1",
        "from": "car-start",
        "to": "car-docs",
        "kind": "sequence"
      },
      {
        "id": "car-e2",
        "from": "car-docs",
        "to": "car-complete",
        "kind": "sequence"
      },
      {
        "id": "car-e3",
        "from": "car-complete",
        "to": "car-chase",
        "kind": "sequence",
        "label": "no"
      },
      {
        "id": "car-e4",
        "from": "car-chase",
        "to": "car-docs",
        "kind": "sequence"
      },
      {
        "id": "car-e5",
        "from": "car-complete",
        "to": "car-insurance",
        "kind": "sequence",
        "label": "yes"
      },
      {
        "id": "car-e6",
        "from": "car-insurance",
        "to": "car-credit",
        "kind": "sequence"
      },
      {
        "id": "car-e7",
        "from": "car-credit",
        "to": "car-setup",
        "kind": "sequence"
      },
      {
        "id": "car-e8",
        "from": "car-setup",
        "to": "car-end",
        "kind": "sequence"
      }
    ],
    "audit_tags": [
      {
        "id": "car-a1",
        "node_id": "car-docs",
        "data": "unstructured",
        "rules": "judgment",
        "exceptions": "frequent"
      }
    ],
    "friction": [
      {
        "id": "car-f1",
        "node_id": "car-chase",
        "waste": "Waiting",
        "note": "Onboarding stalls waiting on documents the carrier sends piecemeal by email."
      },
      {
        "id": "car-f2",
        "node_id": "car-insurance",
        "waste": "Defects",
        "note": "Insurance certificates are checked by eye, so expired cover slips through."
      }
    ]
  },
  {
    "id": "o2c",
    "name": "Order-to-Cash (O2C)",
    "description": "A customer order through credit, fulfilment, invoicing and collection. Understand zones are seeded; Diverge and Converge are left empty so the ideas are yours.",
    "frame": {
      "name": "Order-to-Cash",
      "trigger": "A customer places an order",
      "end_state": "Cash is received and the order is closed",
      "owner": "Sales and Finance",
      "frequency": "daily",
      "volume": "~900 orders per month",
      "north_star": "Days sales outstanding - order to cash received"
    },
    "nodes": [
      {
        "id": "o2c-start",
        "type": "Start",
        "lane": "Customer",
        "label": "Order placed"
      },
      {
        "id": "o2c-enter",
        "type": "Step",
        "lane": "Sales",
        "label": "Enter order"
      },
      {
        "id": "o2c-credit",
        "type": "Decision",
        "lane": "Finance",
        "label": "Credit OK?"
      },
      {
        "id": "o2c-hold",
        "type": "Wait",
        "lane": "Finance",
        "label": "Credit hold"
      },
      {
        "id": "o2c-pick",
        "type": "Step",
        "lane": "Fulfilment",
        "label": "Pick and pack"
      },
      {
        "id": "o2c-ship",
        "type": "Step",
        "lane": "Fulfilment",
        "label": "Ship order"
      },
      {
        "id": "o2c-invoice",
        "type": "Step",
        "lane": "Finance",
        "label": "Raise invoice"
      },
      {
        "id": "o2c-collect",
        "type": "Step",
        "lane": "Finance",
        "label": "Collect payment"
      },
      {
        "id": "o2c-end",
        "type": "End",
        "lane": "Finance",
        "label": "Cash received"
      }
    ],
    "edges": [
      {
        "id": "o2c-e1",
        "from": "o2c-start",
        "to": "o2c-enter",
        "kind": "sequence"
      },
      {
        "id": "o2c-e2",
        "from": "o2c-enter",
        "to": "o2c-credit",
        "kind": "sequence"
      },
      {
        "id": "o2c-e3",
        "from": "o2c-credit",
        "to": "o2c-hold",
        "kind": "sequence",
        "label": "no"
      },
      {
        "id": "o2c-e4",
        "from": "o2c-hold",
        "to": "o2c-credit",
        "kind": "sequence"
      },
      {
        "id": "o2c-e5",
        "from": "o2c-credit",
        "to": "o2c-pick",
        "kind": "sequence",
        "label": "yes"
      },
      {
        "id": "o2c-e6",
        "from": "o2c-pick",
        "to": "o2c-ship",
        "kind": "sequence"
      },
      {
        "id": "o2c-e7",
        "from": "o2c-ship",
        "to": "o2c-invoice",
        "kind": "sequence"
      },
      {
        "id": "o2c-e8",
        "from": "o2c-invoice",
        "to": "o2c-collect",
        "kind": "sequence"
      },
      {
        "id": "o2c-e9",
        "from": "o2c-collect",
        "to": "o2c-end",
        "kind": "sequence"
      }
    ],
    "audit_tags": [
      {
        "id": "o2c-a1",
        "node_id": "o2c-credit",
        "data": "structured",
        "rules": "explicit",
        "exceptions": "occasional"
      }
    ],
    "friction": [
      {
        "id": "o2c-f1",
        "node_id": "o2c-hold",
        "waste": "Waiting",
        "note": "Orders sit on credit hold while finance and sales reconcile limits by email."
      },
      {
        "id": "o2c-f2",
        "node_id": "o2c-collect",
        "waste": "Motion",
        "note": "Collections chase the same accounts every month with no shared ledger."
      }
    ]
  },
  {
    "id": "p2p",
    "name": "Purchase-to-Pay (P2P)",
    "description": "A requisition-to-payment flow with a three-way match and a discrepancy chase. Understand zones are seeded; Diverge and Converge are left empty so the ideas are yours.",
    "frame": {
      "name": "Purchase-to-Pay",
      "trigger": "A need is raised by the business",
      "end_state": "The supplier is paid and the invoice is closed",
      "owner": "Procurement and Accounts Payable",
      "frequency": "daily",
      "volume": "~400 invoices per month",
      "north_star": "Invoice cycle time - days from receipt to payment"
    },
    "nodes": [
      {
        "id": "p2p-start",
        "type": "Start",
        "lane": "Requester",
        "label": "Need raised"
      },
      {
        "id": "p2p-req",
        "type": "Step",
        "lane": "Requester",
        "label": "Raise requisition"
      },
      {
        "id": "p2p-po",
        "type": "Step",
        "lane": "Buyer",
        "label": "Create purchase order"
      },
      {
        "id": "p2p-send",
        "type": "Step",
        "lane": "Buyer",
        "label": "Send PO to supplier"
      },
      {
        "id": "p2p-gr",
        "type": "Step",
        "lane": "Requester",
        "label": "Receive goods (GR)"
      },
      {
        "id": "p2p-inv",
        "type": "Step",
        "lane": "AP clerk",
        "label": "Receive invoice"
      },
      {
        "id": "p2p-match",
        "type": "Step",
        "lane": "AP clerk",
        "label": "Three-way match"
      },
      {
        "id": "p2p-ok",
        "type": "Decision",
        "lane": "AP clerk",
        "label": "Match OK?"
      },
      {
        "id": "p2p-chase",
        "type": "Wait",
        "lane": "AP clerk",
        "label": "Chase discrepancy"
      },
      {
        "id": "p2p-approve",
        "type": "Step",
        "lane": "Approver",
        "label": "Approve payment"
      },
      {
        "id": "p2p-end",
        "type": "End",
        "lane": "AP clerk",
        "label": "Supplier paid"
      }
    ],
    "edges": [
      {
        "id": "p2p-e1",
        "from": "p2p-start",
        "to": "p2p-req",
        "kind": "sequence"
      },
      {
        "id": "p2p-e2",
        "from": "p2p-req",
        "to": "p2p-po",
        "kind": "sequence"
      },
      {
        "id": "p2p-e3",
        "from": "p2p-po",
        "to": "p2p-send",
        "kind": "sequence"
      },
      {
        "id": "p2p-e4",
        "from": "p2p-send",
        "to": "p2p-gr",
        "kind": "sequence"
      },
      {
        "id": "p2p-e5",
        "from": "p2p-gr",
        "to": "p2p-inv",
        "kind": "sequence"
      },
      {
        "id": "p2p-e6",
        "from": "p2p-inv",
        "to": "p2p-match",
        "kind": "sequence"
      },
      {
        "id": "p2p-e7",
        "from": "p2p-match",
        "to": "p2p-ok",
        "kind": "sequence"
      },
      {
        "id": "p2p-e8",
        "from": "p2p-ok",
        "to": "p2p-chase",
        "kind": "sequence",
        "label": "no"
      },
      {
        "id": "p2p-e9",
        "from": "p2p-chase",
        "to": "p2p-match",
        "kind": "sequence"
      },
      {
        "id": "p2p-e10",
        "from": "p2p-ok",
        "to": "p2p-approve",
        "kind": "sequence",
        "label": "yes"
      },
      {
        "id": "p2p-e11",
        "from": "p2p-approve",
        "to": "p2p-end",
        "kind": "sequence"
      }
    ],
    "audit_tags": [
      {
        "id": "p2p-a1",
        "node_id": "p2p-match",
        "data": "semi-structured",
        "rules": "mixed",
        "exceptions": "frequent"
      }
    ],
    "friction": [
      {
        "id": "p2p-f1",
        "node_id": "p2p-match",
        "waste": "Waiting",
        "note": "Match stalls when the PO, goods receipt and invoice do not reconcile."
      },
      {
        "id": "p2p-f2",
        "node_id": "p2p-chase",
        "waste": "Defects",
        "note": "Discrepancies are chased by email with no shared status."
      }
    ]
  }
]
