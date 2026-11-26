import { marketMatchKey, marketRootDomain } from '../modules/market-memory/market-company-key'
import { sirenOf } from './dataforge-grappe'

/**
 * Lot 793 (Louis 04/11/2026 : « absolument tout doit être rattaché, lié, et accessible par n'importe quel angle ») —
 * LE résolveur unique (GA-26) : compte d'un ESPACE → ensemble d'identifiants COMMUNS (BM-A du pack v2.1, fiche DF,
 * groupe et filiales compris), lu dans `common_account_links` (migration `1796900170000-CommonAccountLinks`).
 *
 * Ordre : SIREN (le compte, puis la tête de groupe), puis domaine racine du site, puis nom normalisé — chaque clé
 * passe par la normalisation DÉJÀ du dépôt (`sirenOf`, `marketRootDomain`, `marketMatchKey`), la même que le script qui
 * construit la table. La première clé qui trouve DÉCIDE :
 *  · une seule entreprise, ou plusieurs d'un MÊME groupe (même règle que la grappe SIREN du lot 773) → résolu ;
 *  · plusieurs entreprises de groupes différents → AMBIGU : vide, compté — la clé plus faible ne rattrape pas.
 * Pas de correspondance floue : égalité de clé normalisée seulement. On propose, on ne fusionne jamais.
 *
 * Cloisonnement : la PREMIÈRE lecture est celle des comptes par `workspace_id = $1 AND id = ANY($2)` — jamais un id
 * seul ; un compte d'un autre espace ne résout rien et aucune autre lecture n'est faite pour lui. La table pivot est
 * une base commune (fait de marché) : aucune donnée d'espace n'y est lue.
 *
 * Fonction pure sur une `query` injectée : le service Nest (`CommonAccountResolverService`) et le lecteur de lignes de
 * signaux l'appellent tous deux, sans import de service à service (GA-07).
 */

export type CommonAccountQuery = <R>(sql: string, params: unknown[]) => Promise<R[]>

type CommonKeyKind = 'siren' | 'domain' | 'name'

interface CommonAccountMember {
  readonly commonId: string
  readonly bmAccountId: string | null
  readonly dataforgeSourceId: string | null
  readonly groupAccountId: string | null
  readonly name: string
}

interface CommonAccountSet {
  readonly matchedOn: CommonKeyKind
  /** Les entreprises communes que la clé désigne directement (le compte lui-même). */
  readonly direct: readonly string[]
  /** `direct` ∪ les entreprises de leur(s) groupe(s) — filiales et racine comprises. */
  readonly members: readonly CommonAccountMember[]
}

/**
 * La PORTE de résolution déjà liée à l'espace (le contrôleur la construit depuis `CommonAccountResolverService`) :
 * le lecteur de lignes de signaux ne connaît ni l'espace ni le service, il passe ses comptes.
 */
export type CommonAccountsReader = (accountIds: readonly string[]) => Promise<CommonAccountResolution>

export interface CommonAccountResolution {
  readonly sets: ReadonlyMap<string, CommonAccountSet>
  readonly counts: { resolved: number; ambiguous: number; none: number }
}

type LinkRow = {
  key_kind: CommonKeyKind
  key_value: string
  common_id: string
  bm_account_id: string | null
  dataforge_source_id: string | null
  group_account_id: string | null
  company_name: string
}

const LINK_COLUMNS =
  'key_kind, key_value, common_id, bm_account_id, dataforge_source_id, group_account_id, company_name'

const memberOf = (row: LinkRow): CommonAccountMember => ({
  commonId: row.common_id,
  bmAccountId: row.bm_account_id,
  dataforgeSourceId: row.dataforge_source_id,
  groupAccountId: row.group_account_id,
  name: row.company_name,
})

/**
 * Les entreprises qu'une clé désigne, ou `'ambiguous'`. Unique, ou toutes du même groupe (racine BM-A non nulle).
 */
export function decideCommonCandidates(rows: readonly LinkRow[]): LinkRow[] | 'ambiguous' | null {
  const byId = new Map<string, LinkRow>()
  for (const row of rows) if (!byId.has(row.common_id)) byId.set(row.common_id, row)
  if (byId.size === 0) return null
  if (byId.size === 1) return [...byId.values()]
  const groups = new Set([...byId.values()].map(row => row.group_account_id ?? ''))
  return groups.size === 1 && !groups.has('') ? [...byId.values()] : 'ambiguous'
}

async function linksByKeys(
  q: CommonAccountQuery,
  sirens: readonly string[],
  domains: readonly string[],
  names: readonly string[],
): Promise<Map<string, LinkRow[]>> {
  const out = new Map<string, LinkRow[]>()
  if (sirens.length + domains.length + names.length === 0) return out
  const rows = await q<LinkRow>(
    `SELECT ${LINK_COLUMNS}
       FROM common_account_links
      WHERE (key_kind = 'siren' AND key_value = ANY($1::text[]))
         OR (key_kind = 'domain' AND key_value = ANY($2::text[]))
         OR (key_kind = 'name' AND key_value = ANY($3::text[]))`,
    [[...sirens], [...domains], [...names]],
  )
  for (const row of rows) {
    const k = `${row.key_kind}:${row.key_value}`
    out.set(k, [...(out.get(k) ?? []), row])
  }
  return out
}

/** Les entreprises communes de clés de NOM nues (ex. l'entreprise d'un besoin sans fiche) : unique ou rien. */
export async function resolveCommonKeys(
  q: CommonAccountQuery,
  nameKeys: readonly string[],
): Promise<Map<string, string[]>> {
  const keys = [...new Set(nameKeys.filter(k => k.length > 0))]
  const found = await linksByKeys(q, [], [], keys)
  const out = new Map<string, string[]>()
  for (const k of keys) {
    const decided = decideCommonCandidates(found.get(`name:${k}`) ?? [])
    if (decided && decided !== 'ambiguous')
      out.set(
        k,
        decided.map(row => row.common_id),
      )
  }
  return out
}

export async function resolveCommonAccounts(
  q: CommonAccountQuery,
  workspaceId: string,
  accountIds: readonly string[],
): Promise<CommonAccountResolution> {
  const counts = { resolved: 0, ambiguous: 0, none: 0 }
  const sets = new Map<string, CommonAccountSet>()
  if (accountIds.length === 0) return { sets, counts }
  const accounts = await q<{
    id: string
    company_name: string | null
    website: string | null
    siren: string | null
    group_head_siren: string | null
  }>(
    `SELECT id, company_name, website, siren, group_head_siren
       FROM accounts
      WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND status <> 'deleted'`,
    [workspaceId, [...accountIds]],
  )
  if (accounts.length === 0) return { sets, counts }

  const probes = accounts.map(account => ({
    id: account.id,
    steps: [
      ['siren', [account.siren, account.group_head_siren].map(sirenOf).filter((s): s is string => !!s)],
      ['domain', [marketRootDomain(account.website)].filter((d): d is string => !!d)],
      ['name', [marketMatchKey(account.company_name ?? '')].filter(n => n.length > 0)],
    ] as Array<[CommonKeyKind, string[]]>,
  }))
  const all = (kind: CommonKeyKind) => [
    ...new Set(probes.flatMap(p => p.steps.filter(([k]) => k === kind).flatMap(([, v]) => v))),
  ]
  const found = await linksByKeys(q, all('siren'), all('domain'), all('name'))

  const directOf = new Map<string, { matchedOn: CommonKeyKind; rows: LinkRow[] }>()
  for (const probe of probes) {
    let outcome: 'none' | 'ambiguous' = 'none'
    for (const [kind, values] of probe.steps) {
      const decided = decideCommonCandidates(values.flatMap(v => found.get(`${kind}:${v}`) ?? []))
      if (decided === null) continue
      if (decided === 'ambiguous') outcome = 'ambiguous'
      else directOf.set(probe.id, { matchedOn: kind, rows: decided })
      break
    }
    if (directOf.has(probe.id)) counts.resolved += 1
    else counts[outcome] += 1
  }

  const groups = [
    ...new Set(
      [...directOf.values()].flatMap(d => d.rows.map(r => r.group_account_id).filter((g): g is string => !!g)),
    ),
  ]
  const groupRows =
    groups.length > 0
      ? await q<LinkRow>(
          `SELECT DISTINCT ${LINK_COLUMNS}
             FROM common_account_links
            WHERE group_account_id = ANY($1::text[])`,
          [groups],
        )
      : []
  const membersOfGroup = new Map<string, Map<string, CommonAccountMember>>()
  for (const row of groupRows) {
    if (!row.group_account_id) continue
    const members = membersOfGroup.get(row.group_account_id) ?? new Map<string, CommonAccountMember>()
    if (!members.has(row.common_id)) members.set(row.common_id, memberOf(row))
    membersOfGroup.set(row.group_account_id, members)
  }

  for (const [accountId, { matchedOn, rows }] of directOf) {
    const members = new Map<string, CommonAccountMember>(rows.map(row => [row.common_id, memberOf(row)]))
    for (const row of rows) {
      for (const [id, member] of membersOfGroup.get(row.group_account_id ?? '') ?? []) {
        if (!members.has(id)) members.set(id, member)
      }
    }
    sets.set(accountId, { matchedOn, direct: rows.map(row => row.common_id), members: [...members.values()] })
  }
  return { sets, counts }
}
