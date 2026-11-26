import { z } from 'zod'
import type { ContactEligibilityReason } from './contact-ranking.js'
import type { ConflictedField } from './field-conflict.js'
import { fieldSourceSchema } from './provenance.js'

/**
 * LE CONTRÔLE AVANT ACTION D'UN CONTACT — #3219 (#190.2 côté CONTACT,
 * décision Louis 11/10/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT, ET CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Côté COMPTE, Laura mène avec la contradiction ouverte (`get_account_preflight`,
 * section `data_conflicts`) et la fiche la montre (`AccountFieldConflicts`).
 * Côté CONTACT, chaque ingrédient existait séparément — `GET /contacts/:id/conflicts`
 * (le MÊME `FieldConflictService`), la porte d'éligibilité qui écarte un contact
 * hors du périmètre du compte (`contact-eligibility.ts`), le désaccord
 * d'employeur entre la fiche et une source (`employerConflict`, `contact-score.ts`)
 * — mais rien ne les ASSEMBLAIT au moment où le commercial agit : préparer un
 * message, ajouter à une séquence, exporter vers le CRM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PAS UN SECOND MOTEUR (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce module ne DÉTECTE rien : il reçoit des verdicts déjà rendus —
 * `ConflictedField[]` (`detectFieldConflict`, tel quel), la raison d'exclusion
 * de la porte d'éligibilité (telle quelle), l'employeur rapporté par la source
 * (calculé par `contact-score.ts`) — et les PROJETTE en une liste lisible. La
 * seule comparaison qu'il fait lui-même, `titlesDiffer`, n'existait nulle part.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL NE TRANCHE JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune valeur « choisie », aucun statut « bloqué » : le contrôle DIT les
 * différences, l'humain décide. Une correction humaine gagne toujours —
 * `resolved`/`workspace_override` ne font aucune ligne, et une valeur de fiche
 * saisie à la main porte `recordKeptByHuman` (elle reste, quoi que dise la
 * source). L'action demandée change le cadre de la phrase, jamais le contenu
 * (même règle que c76 pour le rôle).
 */

export const CONTACT_PREFLIGHT_ACTIONS = ['prepare_message', 'add_to_sequence', 'export_crm'] as const
export const contactPreflightActionSchema = z.enum(CONTACT_PREFLIGHT_ACTIONS)
export type ContactPreflightAction = z.infer<typeof contactPreflightActionSchema>

/** Une prétention : la valeur, sa source, sa date — et sa portée quand l'écrivain l'a DÉCLARÉE. */
const preflightClaimSchema = z.object({
  value: z.string().nullable(),
  source: fieldSourceSchema,
  at: z.string().datetime(),
  scope: z.string().min(1).optional(),
})

const sourceDifferenceShape = {
  /** Ce que la fiche porte aujourd'hui. `null` = la fiche ne dit rien. */
  recordValue: z.string().nullable(),
  /** Ce que la source rapporte. */
  sourceValue: z.string().min(1),
  /** La valeur de la fiche a été saisie ou corrigée par un humain : elle reste. */
  recordKeptByHuman: z.boolean(),
}

const contactPreflightItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('open_conflict'),
    field: z.string().min(1),
    claims: z.tuple([preflightClaimSchema, preflightClaimSchema]),
    nextCheck: z.string().datetime().nullable(),
  }),
  z.object({
    kind: z.literal('scope_difference'),
    field: z.string().min(1),
    claims: z.tuple([preflightClaimSchema, preflightClaimSchema]),
  }),
  z.object({ kind: z.literal('employer_differs'), ...sourceDifferenceShape }),
  z.object({ kind: z.literal('title_differs'), ...sourceDifferenceShape }),
  z.object({ kind: z.literal('out_of_account_scope'), entity: z.string().nullable() }),
  z.object({ kind: z.literal('identity_doubt') }),
])
export type ContactPreflightItem = z.infer<typeof contactPreflightItemSchema>

const contactPreflightUnknownSchema = z.discriminatedUnion('section', [
  z.object({ section: z.literal('field_conflicts'), reason: z.literal('unreadable') }),
  z.object({
    section: z.literal('account_scope'),
    reason: z.enum(['unreadable', 'no_account', 'no_account_scope_mapped', 'no_contact_entity']),
  }),
])
type ContactPreflightUnknown = z.infer<typeof contactPreflightUnknownSchema>
type AccountScopeUnknownReason = Extract<ContactPreflightUnknown, { section: 'account_scope' }>['reason']

export const contactPreflightSchema = z.object({
  contactId: z.string().min(1),
  action: contactPreflightActionSchema.nullable(),
  /**
   * `differences` — au moins une ligne à lire ; `incomplete` — aucune ligne,
   * mais une section n'a pas pu être lue (jamais confondu avec « rien ») ;
   * `no_difference` — tout a été lu, rien ne diffère. Jamais « bloqué » : le
   * contrôle informe, il ne décide pas.
   */
  status: z.enum(['no_difference', 'differences', 'incomplete']),
  items: z.array(contactPreflightItemSchema),
  unknowns: z.array(contactPreflightUnknownSchema),
})
export type ContactPreflight = z.infer<typeof contactPreflightSchema>

type SourceDifference = { recordValue: string | null; sourceValue: string; recordKeptByHuman: boolean }

export type ContactPreflightInput = {
  contactId: string
  action: ContactPreflightAction | null
  /** `FieldConflictService.openConflicts(…, { includeSettled: true })` ; `null` = journal illisible. */
  conflicts: readonly ConflictedField[] | null
  /** Le verdict de la porte d'éligibilité pour CE contact (`filterEligibleContacts`). */
  accountScope:
    | { state: 'evaluated'; exclusion: ContactEligibilityReason | null; entity: string | null }
    | { state: 'unknown'; reason: AccountScopeUnknownReason }
  /** L'employeur rapporté par une source, quand il diffère de la fiche (`contact-score.ts`). */
  employer: SourceDifference | null
  /** Le poste de la fiche face à celui que rapporte la source — comparé ICI (`titlesDiffer`). */
  title: { recordValue: string | null; sourceValue: string | null; recordKeptByHuman: boolean } | null
}

function normalizeTitle(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Deux intitulés désignent-ils VRAIMENT deux postes différents ? Prudent à
 * dessein : la casse, les accents, la ponctuation et l'inclusion (« DSI » dans
 * « DSI — Groupe ») ne sont pas des désaccords. Un contrôle qui dérange pour
 * une variante d'écriture est abandonné en trois jours (même raison que
 * `detectFieldConflict`). Un blanc d'un côté n'est jamais une différence.
 */
export function titlesDiffer(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (!na || !nb) return false
  return !(na === nb || na.includes(nb) || nb.includes(na))
}

/** Une valeur du journal, rendue lisible — jamais un objet sérialisé à l'écran. */
function claimValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const text = value.trim()
    // #3400 — un tableau déjà sérialisé dans le journal (`["a","b"]`) est lu, pas affiché tel quel.
    if (/^\[.*\]$/s.test(text)) {
      try {
        return claimValue(JSON.parse(text))
      } catch {
        return text
      }
    }
    return text || null
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const parts = value.map(claimValue).filter((part): part is string => part !== null)
    return parts.length > 0 ? parts.join(', ') : null
  }
  return null
}

function claims(
  conflict: ConflictedField,
): [z.infer<typeof preflightClaimSchema>, z.infer<typeof preflightClaimSchema>] {
  const [a, b] = conflict.claims
  const side = (claim: typeof a) => ({
    value: claimValue(claim.value),
    source: claim.source,
    at: claim.at,
    ...(claim.scope ? { scope: claim.scope } : {}),
  })
  return [side(a), side(b)]
}

/**
 * Assemble le contrôle avant action. Pure — l'appelant (`ContactsService.preflight`)
 * a déjà fait les lectures. L'ordre est fixe : ce que le produit ne sait pas
 * trancher d'abord (contradiction ouverte), puis les deux vérités de portée,
 * puis les écarts de source, puis le périmètre du compte et l'identité.
 */
export function compileContactPreflight(input: ContactPreflightInput): ContactPreflight {
  const unknowns: ContactPreflightUnknown[] = []
  const open: ContactPreflightItem[] = []
  const scoped: ContactPreflightItem[] = []
  const conflictFields = new Set<string>()

  if (input.conflicts === null) {
    unknowns.push({ section: 'field_conflicts', reason: 'unreadable' })
  } else {
    for (const conflict of input.conflicts) {
      if (conflict.resolvedBy === 'unresolved') {
        open.push({
          kind: 'open_conflict',
          field: conflict.field,
          claims: claims(conflict),
          nextCheck: conflict.nextCheck,
        })
        conflictFields.add(conflict.field)
      } else if (conflict.resolvedBy === 'scope_difference') {
        scoped.push({ kind: 'scope_difference', field: conflict.field, claims: claims(conflict) })
        conflictFields.add(conflict.field)
      }
      // `resolved`/`workspace_override` : un humain a tranché, il gagne.
      // `authority_wins`/`freshness_wins`/`obsolete_source` : tranché, tracé au journal.
    }
  }

  const sources: ContactPreflightItem[] = []
  if (input.employer) {
    sources.push({ kind: 'employer_differs', ...input.employer })
  } else if (
    input.title &&
    input.title.sourceValue &&
    !conflictFields.has('title') &&
    titlesDiffer(input.title.recordValue, input.title.sourceValue)
  ) {
    sources.push({
      kind: 'title_differs',
      recordValue: input.title.recordValue,
      sourceValue: input.title.sourceValue,
      recordKeptByHuman: input.title.recordKeptByHuman,
    })
  }

  const scope: ContactPreflightItem[] = []
  if (input.accountScope.state === 'unknown') {
    unknowns.push({ section: 'account_scope', reason: input.accountScope.reason })
  } else if (input.accountScope.exclusion === 'entity_mismatch') {
    scope.push({ kind: 'out_of_account_scope', entity: input.accountScope.entity })
  } else if (input.accountScope.exclusion === 'homonym_conflict') {
    scope.push({ kind: 'identity_doubt' })
  }

  const items = [...open, ...scoped, ...sources, ...scope]
  return {
    contactId: input.contactId,
    action: input.action,
    status: items.length > 0 ? 'differences' : unknowns.length > 0 ? 'incomplete' : 'no_difference',
    items,
    unknowns,
  }
}
