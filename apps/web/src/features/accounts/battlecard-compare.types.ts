// Shapes of the two on-demand IA generations proxied by the API
// (`POST /ia/battlecard`, `POST /ia/compare`). The IA returns a `{ success, data }`
// envelope; `data` is best-effort JSON from Claude, so every field is optional and
// the UI renders present-only — never a fabricated placeholder.

/** One "us vs an ESN already on the account" row of the competitive battle card.
 *  File-local: consumed only as a member of {@link BattlecardData}. */
type BattlecardVsCompetitor = {
  competitor?: string
  their_strengths?: string
  their_weaknesses?: string
  our_counter_angle?: string
}

export type BattlecardData = {
  company_activity?: string
  budget_it_estimated?: string
  your_contact?: { name?: string; title?: string; background?: string }
  what_to_say?: string[]
  what_NOT_to_say?: string[]
  vs_competitors?: BattlecardVsCompetitor[]
  probable_objection?: {
    objection?: string
    real_meaning?: string
    response?: string
    mirror_question?: string
  }
  killer_question?: string
}

/** One compared account in the AI prioritisation. */
export type CompareItem = {
  company?: string
  adjusted_score?: number
  strengths?: string[]
  risks?: string[]
  estimated_cycle?: string
  key_contact?: string
  recommendation?: string
}

/** #2284.1 — deux comptes de la comparaison qui désignent la MÊME entreprise
 *  (même identifiant légal, corrections de l'espace appliquées). Nommés,
 *  jamais fusionnés. */
type CompareIdentityOverlap = {
  relation: 'same_entity'
  account_ids: string[]
  companies: (string | null)[]
  siren: string
}

export type CompareData = {
  /** `null` = non mesuré (corrections illisibles) ; `[]` = aucun doublon. */
  identity_overlaps?: CompareIdentityOverlap[] | null
  comparison?: CompareItem[]
  priority_order?: string[]
  reasoning?: string
  weekly_time_allocation?: Record<string, string>
  quick_win?: string
}
