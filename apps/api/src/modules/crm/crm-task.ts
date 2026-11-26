/**
 * Shared shapes for exporting a **besoin** (an Opportunity Graph need) to the
 * connected CRM (Théo TF1 p39 « Export vers CRM » : les connecteurs exportent
 * déjà un contact ; un besoin n'avait aucun chemin).
 *
 * A besoin is a would-be opportunity, so each CRM gets its **idiomatic object**
 * — a Deal (HubSpot, Pipedrive), a Note on the Company (Attio), a Task
 * (Salesforce — a real Opportunity would need a fabricated CloseDate/Stage,
 * which we never invent) — rather than a lowest-common-denominator task. The
 * besoin's factual content (label, detail, source, date, company) is composed
 * server-side from the stored row; no pipeline metadata is ever fabricated.
 */
import type { CrmProvider, ProjectCrmObject } from '@bellum/contracts'

/** The kind of CRM record a besoin landed as (deal/note/task/opportunity). */
export type CrmObjectKind = ProjectCrmObject

/**
 * Provider-neutral besoin payload. `subject` is the one-line title every CRM
 * uses (deal name / task subject / note title); `body` is the factual
 * description; `company` is the target account name, used for best-effort
 * linking (HubSpot/Pipedrive org, Attio Company note parent) — never fabricated,
 * simply omitted when absent; `dueDate` (ISO `YYYY-MM-DD`) is optional and only
 * sent when the caller has a REAL date — never a fabricated one.
 */
export type CrmTaskInput = {
  subject: string
  body: string
  company?: string | null
  dueDate?: string
}

/** Result of a besoin export: which CRM answered, what object it created there,
 *  and that record's id. */
export type CrmTaskResult = {
  /** #4185 — les CRM qui portent `task_note` dans la matrice du contrat (`CRM_PROVIDER_CAPABILITIES`). */
  provider: CrmProvider
  object: CrmObjectKind
  id: string
}
