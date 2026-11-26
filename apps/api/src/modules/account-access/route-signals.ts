import { In, type EntityManager } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { TestimonialEntity } from '../../database/entities/testimonial.entity'

/**
 * #3278.1 (lot M11 09/10) — les SIGNAUX de deux routes commerciales lus côté
 * API, relayés à Laura par le pont `accounts/access` (`route_signals`) :
 *
 * - `watch_only` — le niveau d'effort POSÉ sur le compte est `watch` (une
 *   décision, avec sa condition de réveil) → route « veille seule » ;
 * - `talent_from_account` — un talent du vivier de l'espace a une expérience
 *   au nom de ce client (client nommé, non masqué) → route « depuis un
 *   talent » (reverse prospecting).
 *
 * - `event_community` / `inbound_content` (décision Louis 11/10/2026) — un contact noué
 *   dans un événement ou une communauté, un compte venu à nous par un contenu :
 *   deux faits DÉCLARÉS sur la fiche (`accounts.declared_route_event` /
 *   `declared_route_inbound`, « Compléter la fiche ») → routes « événement ou
 *   communauté » et « inbound / contenu ».
 *
 * Une clé absente ne dit rien : jamais un `false` qui se lirait « vérifié ».
 */
export type RouteSignals = {
  watch_only?: true
  talent_from_account?: true
  event_community?: true
  inbound_content?: true
}

type DeclaredRouteFactColumns = { declared_route_event?: string | null; declared_route_inbound?: string | null }

export function routeSignalsOf(
  account: ({ sprint?: string | null } & DeclaredRouteFactColumns) | null,
  talentFromAccount: boolean,
): RouteSignals {
  return {
    ...(account?.sprint === 'watch' ? { watch_only: true as const } : {}),
    ...(talentFromAccount ? { talent_from_account: true as const } : {}),
    ...(account?.declared_route_event?.trim() ? { event_community: true as const } : {}),
    ...(account?.declared_route_inbound?.trim() ? { inbound_content: true as const } : {}),
  }
}

/**
 * Le texte des deux faits déclarés, relayé TEL QUEL à Laura (qui le cite) : une clé par fait
 * déclaré, rien pour un fait vide.
 */
export function routeFactsOf(account: DeclaredRouteFactColumns | null): { event?: string; inbound?: string } {
  const event = account?.declared_route_event?.trim()
  const inbound = account?.declared_route_inbound?.trim()
  return { ...(event ? { event } : {}), ...(inbound ? { inbound } : {}) }
}

/**
 * Le nom d'entreprise comparable : casse, accents et espaces seulement —
 * jamais un suffixe juridique retiré ni un sigle deviné (une égalité floue
 * attribuerait un talent au mauvais client).
 */
export function normalizeCompanyName(name: string | null | undefined): string | null {
  const normalized = (name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  return normalized.length > 0 ? normalized : null
}

/**
 * #3278.1 — « depuis un talent » : le vivier ACTIF de l'espace (consultant non archivé) porte une
 * expérience, client non masqué, au NOM EXACT du compte (raison sociale ou nom commercial). Une seule
 * lecture pour le pont `/chat` (`AccountAccessService.routeInputs`) ET le plan asynchrone
 * (`RelationAxisReaderService`) — GA-26 : le critère ne se dit qu'à un endroit. `query` est le
 * `manager.query` d'un dépôt TypeORM.
 */
export async function talentAtAccount(
  query: (sql: string, params: unknown[]) => Promise<Array<{ name: string | null }>>,
  workspaceId: string,
  account: { company_name?: string | null; trade_name?: string | null },
): Promise<boolean> {
  const names = [account.company_name, account.trade_name]
    .map(normalizeCompanyName)
    .filter((name): name is string => name !== null)
  if (names.length === 0) return false
  // Les noms DISTINCTS du vivier actif, comparés à l'égalité stricte du nom normalisé
  // (accents compris : `unaccent` n'est pas garanti en base).
  const rows = await query(
    `SELECT DISTINCT n.name
           FROM consultant_experiences e
           JOIN consultants c ON c.id = e.consultant_id
           CROSS JOIN LATERAL (VALUES (e.client_final), (e.entreprise)) AS n(name)
          WHERE e.workspace_id = $1
            AND c.workspace_id = $1
            AND c.archived_at IS NULL
            AND e.client_masked = false
            AND n.name IS NOT NULL`,
    [workspaceId],
  )
  return rows.some(row => {
    const name = normalizeCompanyName(row.name)
    return name !== null && names.includes(name)
  })
}

/**
 * #3278.2 (lot M11 09/10) — les six critères de route sans source structurée,
 * DÉCLARÉS sur la fiche (`accounts.declared_route_*`), sous les clés que lit
 * Laura (`STRATEGY_SELECTION_CRITERIA`, `opening_movement.py`). Un critère vide
 * n'a pas de clé : il reste nommé « non évalué » côté IA, jamais deviné.
 */
const DECLARED_ROUTE_COLUMNS = {
  scope: 'declared_route_scope',
  objectives: 'declared_route_objectives',
  available_roles: 'declared_route_available_roles',
  partners: 'declared_route_partners',
  history: 'declared_route_history',
  timing: 'declared_route_timing',
  // #3278.2b (Louis 15/10) — déclaratifs.
  budget: 'declared_route_budget',
  availability: 'declared_route_availability',
  network: 'declared_route_network',
} as const

export type DeclaredRouteCriteria = Partial<Record<keyof typeof DECLARED_ROUTE_COLUMNS, string>>

export function declaredRouteCriteriaOf(
  account: Partial<Record<(typeof DECLARED_ROUTE_COLUMNS)[keyof typeof DECLARED_ROUTE_COLUMNS], string | null>> | null,
): DeclaredRouteCriteria {
  const out: DeclaredRouteCriteria = {}
  for (const [key, column] of Object.entries(DECLARED_ROUTE_COLUMNS) as Array<
    [keyof typeof DECLARED_ROUTE_COLUMNS, (typeof DECLARED_ROUTE_COLUMNS)[keyof typeof DECLARED_ROUTE_COLUMNS]]
  >) {
    const value = account?.[column]?.trim()
    if (value) out[key] = value
  }
  return out
}

/**
 * #3278.3 (#3259.3) — deux ENTRÉES de la route lues sur ce que l'espace a déjà ACCUMULÉ (aucune saisie) :
 * `proofs` (références client publiables dans le secteur du compte) et `channel_history` (canaux déjà
 * utilisés sur ce compte, comptés en messages PRÉPARÉS — « fait » ne porte jamais preuve d'envoi).
 * Un fait absent n'a pas de clé : jamais « 0 », Laura le nomme « non évalué ». Aucun nom de client ni de
 * fournisseur. « Tranché sans Louis » (lot V5-E6, 16/10) : seul le secteur exact rapproche une preuve.
 */
export type AccumulatedRouteCriteria = { proofs?: string; channel_history?: string }

export function accumulatedRouteCriteriaOf(facts: {
  sector: string | null | undefined
  sectorReferences: number
  channelCounts: ReadonlyArray<{ channel: string; count: number }>
}): AccumulatedRouteCriteria {
  const sector = facts.sector?.trim()
  const channels = facts.channelCounts.filter(row => row.count > 0)
  const n = facts.sectorReferences
  return {
    ...(sector && n > 0
      ? {
          proofs: `${n} ${n > 1 ? 'références client publiables' : 'référence client publiable'} dans le secteur ${sector}`,
        }
      : {}),
    ...(channels.length > 0
      ? {
          channel_history: `${channels.map(row => `${row.channel} ×${row.count}`).join(', ')} (messages préparés sur ce compte)`,
        }
      : {}),
  }
}

/**
 * #3278.a — LE lecteur des deux critères accumulés (`/chat` ET plan asynchrone : un seul endroit, GA-26).
 * Même espace, jamais le corps d'un message (D65) : seul `channel` est lu. Lecture impossible (pas de
 * gestionnaire, base en erreur) → `undefined` : l'appelant n'affirme RIEN, il ne dit pas « aucun historique »
 * sur une lecture qui n'a pas eu lieu. Lecture faite sans résultat → `{}`.
 */
export async function readAccumulatedRouteCriteria(
  manager: EntityManager | undefined,
  workspaceId: string,
  account: { id: string; sector?: string | null },
  onError?: (message: string) => void,
): Promise<AccumulatedRouteCriteria | undefined> {
  if (!manager?.find) return undefined
  try {
    const sector = account.sector?.trim() || null
    const sameSector = sector
      ? await manager.find(AccountEntity, { where: { workspace_id: workspaceId, sector }, select: { id: true } })
      : []
    const otherIds = sameSector.map(row => row.id).filter(id => id !== account.id)
    const references =
      otherIds.length > 0
        ? await manager.find(TestimonialEntity, {
            where: { workspace_id: workspaceId, account_id: In(otherIds), publishable: true },
            select: { id: true },
          })
        : []
    const contacts = await manager.find(ContactEntity, {
      where: { workspace_id: workspaceId, account_id: account.id },
      select: { id: true },
    })
    const messages =
      contacts.length > 0
        ? await manager.find(OutreachMessageEntity, {
            where: { contact_id: In(contacts.map(row => row.id)) },
            select: { channel: true },
          })
        : []
    const counts = new Map<string, number>()
    for (const row of messages) counts.set(row.channel, (counts.get(row.channel) ?? 0) + 1)
    return accumulatedRouteCriteriaOf({
      sector,
      sectorReferences: references.length,
      channelCounts: [...counts.entries()]
        .map(([channel, count]) => ({ channel, count }))
        .sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel)),
    })
  } catch (error) {
    onError?.(error instanceof Error ? error.message : String(error))
    return undefined
  }
}
