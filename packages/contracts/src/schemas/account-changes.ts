import { z } from 'zod'
import type { AccountFact, AccountFactKind } from './account-facts.js'

/**
 * #4180 (EX-10) — CE QUI A CHANGÉ SUR UN COMPTE SUIVI DEPUIS LA DERNIÈRE VÉRIFICATION.
 *
 * Un commercial qui revoit un compte de son portefeuille ne veut pas relire un dossier identique : il veut
 * savoir ce qui a BOUGÉ — nouveaux responsables, changements d'entité, besoins documentés, offres de
 * recrutement, événements — chacun avec la date du FAIT (pas celle de la collecte).
 *
 * Quatre règles tiennent dans la forme :
 *  - **« rien de nouveau » se dit** (`status: 'nothing_new'`) et n'efface RIEN : `retained` compte ce qui
 *    reste connu (faits, contacts) ;
 *  - **sans référence, rien n'est comparable** (`no_reference`) : ni « rien de nouveau » ni « 0 » —
 *    « non mesuré n'est jamais 0 » ;
 *  - **une offre de recrutement reste une offre RH** : `confirmedNeed: false` sur toute ligne
 *    `hiring_offer`, jamais un besoin de prestation confirmé ;
 *  - **aucune provenance** : une ligne se dit par sa NATURE, sa DATE et son ENTITÉ — jamais par sa source.
 */
export const ACCOUNT_CHANGE_KINDS = [
  'new_manager',
  'entity_change',
  'documented_need',
  'hiring_offer',
  'business_event',
] as const
export type AccountChangeKind = (typeof ACCOUNT_CHANGE_KINDS)[number]

export const accountChangeItemSchema = z
  .object({
    kind: z.enum(ACCOUNT_CHANGE_KINDS),
    /** Date du FAIT, jour ISO (`AAAA-MM-JJ`). */
    date: z.string().date(),
    label: z.string().trim().min(1).max(280),
    /** L'entité concernée quand le fait la nomme ; `null` = le fait n'en nomme aucune. */
    entity: z.string().min(1).nullable(),
    /** `false` sur une offre de recrutement : elle ne devient jamais un besoin de prestation confirmé. */
    confirmedNeed: z.literal(false).optional(),
  })
  .strict()
export type AccountChangeItem = z.infer<typeof accountChangeItemSchema>

export const accountChangesSchema = z
  .object({
    account: z.object({ id: z.string().min(1), name: z.string() }).strict(),
    /** Date de la dernière vérification ; `null` = aucune référence connue. */
    lastCheckedAt: z.string().nullable(),
    status: z.enum(['changes', 'nothing_new', 'no_reference']),
    /** Du plus récent au plus ancien. Vide pour `nothing_new` et `no_reference`. */
    items: z.array(accountChangeItemSchema),
    /** Ce qui reste connu, quand la comparaison est possible ; `null` sans référence. */
    retained: z
      .object({ facts: z.number().int().min(0), contacts: z.number().int().min(0) })
      .strict()
      .nullable(),
  })
  .strict()
export type AccountChanges = z.infer<typeof accountChangesSchema>

export interface AccountChangesInput {
  readonly account: { readonly id: string; readonly name: string }
  readonly lastCheckedAt: string | null
  readonly facts: readonly AccountFact[]
  /** Contacts arrivés depuis la vérification (déjà filtrés par l'appelant), datés par leur fait. */
  readonly newManagers: readonly { readonly label: string; readonly date: string; readonly entity: string | null }[]
  /** Changements d'entité d'une personne depuis la vérification, datés par la correction qui les enregistre. */
  readonly entityChanges: readonly { readonly label: string; readonly date: string; readonly entity: string | null }[]
  /** Combien de contacts le compte porte, tous âges confondus. */
  readonly knownContacts: number
}

const FACT_KIND_TO_CHANGE: Partial<Record<AccountFactKind, AccountChangeKind>> = {
  hiring: 'hiring_offer',
  need: 'documented_need',
  signal: 'business_event',
  market_observation: 'business_event',
}

const day = (value: string): string => value.slice(0, 10)

/**
 * La comparaison, pure. Un fait est NOUVEAU quand son jour est STRICTEMENT après le jour de la dernière
 * vérification : un fait daté du jour même était déjà là. Les natures internes (notes, échanges,
 * corrections, affaires, missions, documents) ne sont pas des changements du compte.
 */
export function composeAccountChanges(input: AccountChangesInput): AccountChanges {
  const { account, lastCheckedAt } = input
  if (lastCheckedAt === null) {
    return { account, lastCheckedAt, status: 'no_reference', items: [], retained: null }
  }
  const since = day(lastCheckedAt)
  const items: AccountChangeItem[] = []
  for (const fact of input.facts) {
    const kind = FACT_KIND_TO_CHANGE[fact.kind]
    if (!kind || day(fact.date) <= since) continue
    items.push({
      kind,
      date: day(fact.date),
      label: fact.label,
      entity: null,
      ...(kind === 'hiring_offer' ? { confirmedNeed: false as const } : {}),
    })
  }
  for (const manager of input.newManagers) {
    if (day(manager.date) > since) {
      items.push({ kind: 'new_manager', date: day(manager.date), label: manager.label, entity: manager.entity })
    }
  }
  for (const change of input.entityChanges) {
    if (day(change.date) > since) {
      items.push({ kind: 'entity_change', date: day(change.date), label: change.label, entity: change.entity })
    }
  }
  items.sort((a, b) => b.date.localeCompare(a.date))
  const retained = { facts: input.facts.length, contacts: input.knownContacts }
  return { account, lastCheckedAt, status: items.length > 0 ? 'changes' : 'nothing_new', items, retained }
}
