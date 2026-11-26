import type { LostDealRex, LostDealRexEvidence } from '@bellum/contracts'

/**
 * #3272.6 — LAURA CITE LE REX DE PERTE DU COMPTE.
 *
 * Condense les REX déjà persistés (`CapitalisationService.lostDealRexForAccount`)
 * en quelques lignes courtes injectées dans le prompt système — jamais le REX
 * mot pour mot (chaque champ libre est tronqué, `FIELD_EXCERPT_MAX_CHARS`), et
 * jamais une hypothèse présentée comme un fait acquis : la distinction
 * fait/hypothèse du REX (#3272.2) reste visible sur la ligne qui la porte.
 *
 * Aucun second appel au modèle (même discipline que `account_feedback`,
 * `context_budget.py`) : une dérivation pure et déterministe.
 */

const FIELD_EXCERPT_MAX_CHARS = 160
const TOTAL_CONTEXT_MAX_CHARS = 1200

function excerpt(text: string | null | undefined): string | null {
  if (!text) return null
  const trimmed = text.trim()
  if (!trimmed) return null
  return trimmed.length > FIELD_EXCERPT_MAX_CHARS ? `${trimmed.slice(0, FIELD_EXCERPT_MAX_CHARS)}…` : trimmed
}

/** `''` pour un fait confirmé — rien à signaler de plus sur ce qui est déjà sûr. */
function evidenceLabel(distinction: LostDealRexEvidence): string {
  switch (distinction) {
    case 'fait_confirme':
      return ''
    case 'retour_client':
      return ' (retour du client)'
    case 'interpretation_commerciale':
      return ' (interprétation commerciale)'
    case 'hypothese':
      return ' (hypothèse, non confirmée)'
    case 'inconnu':
      return ' (inconnu)'
  }
}

function summarizeOne(entry: LostDealRex): string {
  const date = entry.created_at.slice(0, 10)
  const parts: string[] = []

  const route = excerpt(entry.route_used)
  if (route) parts.push(`route utilisée : « ${route} »`)

  const sponsor = excerpt(entry.sponsor)
  parts.push(sponsor ? `sponsor : ${sponsor}` : 'sponsor : non identifié')

  if (entry.declared_motif) parts.push(`motif déclaré : ${entry.declared_motif}`)

  const lastAction = excerpt(entry.last_action?.value ?? null)
  if (lastAction && entry.last_action) {
    parts.push(`dernière action${evidenceLabel(entry.last_action.distinction)} : ${lastAction}`)
  }

  return `Perte du ${date} — ${parts.join(' ; ')}.`
}

/** `null` sans aucun REX pour ce compte — jamais un bloc vide injecté. */
export function lostDealRexContextFor(entries: readonly LostDealRex[]): string | null {
  if (entries.length === 0) return null
  const text = entries.map(summarizeOne).join('\n')
  return text.length > TOTAL_CONTEXT_MAX_CHARS ? `${text.slice(0, TOTAL_CONTEXT_MAX_CHARS)}…` : text
}
