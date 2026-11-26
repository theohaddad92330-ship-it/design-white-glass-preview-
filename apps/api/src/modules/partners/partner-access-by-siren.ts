/**
 * #3181.4 / #3247 — LE LIEN SIREN PARTENAIRE ↔ CLIENT.
 *
 * Une alternative à un compte est « accessible via un partenaire » quand l'espace déclare, sur un
 * compte qu'il POSSÈDE sous ce SIREN, une ESN en rang 2 ou partenaire. Le SIREN du client vient du
 * compte (`accounts.siren`), celui du partenaire de sa relation d'espace (`partner_relations.siren`,
 * via `account_partners.partner_relation_id`) — jamais un rapprochement sur le nom seul (THALES,
 * #1756.3). Un SIREN sans compte possédé reste ABSENT du résultat : « on ne sait pas » n'est pas
 * « aucun chemin ». Un concurrent ou une relation inconnue n'ouvre aucun chemin.
 *
 * #3247 (décision Louis 14/10, ÉLARGISSEMENT) — un candidat jamais ajouté au portefeuille obtient
 * AUSSI un chemin quand il est la TÊTE DE GROUPE d'un compte POSSÉDÉ (`accounts.group_head_siren`,
 * déjà persisté par l'analyse Phase 1 — zéro appel supplémentaire, zéro donnée inventée). Chaque
 * chemin porte alors `via_group: true` — jamais confondu avec un partenaire déclaré SUR CE COMPTE
 * précisément. Toujours borné à `workspace_id` : jamais entre espaces (GA-43), aucune écriture CRM.
 */
interface AccessAccount {
  readonly id: string
  readonly siren: string | null
  readonly group_head_siren: string | null
}
interface AccessPartnerRow {
  readonly account_id: string
  readonly name: string
  readonly rank: string
  readonly relationship: string
  readonly source: string
  readonly placements: number
  readonly partner_relation_id: string | null
}
interface AccessRelation {
  readonly id: string
  readonly siren: string | null
  readonly name: string
  readonly stage: string
}
interface AccessPath {
  readonly partner_name: string
  readonly partner_siren: string | null
  readonly rank: string
  readonly relationship: string
  readonly source: string
  readonly placements: number
  /** #3247 (14/10) — `true` quand ce chemin vient d'une FILIALE possédée (candidat = tête de
   *  groupe), jamais déclaré sur le candidat lui-même. */
  readonly via_group: boolean
}
export interface AccessBySiren {
  readonly paths: AccessPath[]
  readonly is_workspace_partner: { name: string; stage: string } | null
}

const opensAPath = (row: AccessPartnerRow): boolean => row.relationship === 'partner' || row.rank === 'rank2'

export function buildAccessBySiren(input: {
  readonly sirens: readonly string[]
  readonly accounts: readonly AccessAccount[]
  readonly partnerRows: readonly AccessPartnerRow[]
  readonly relations: readonly AccessRelation[]
}): Record<string, AccessBySiren> {
  const relationById = new Map(input.relations.map(relation => [relation.id, relation]))
  const out: Record<string, AccessBySiren> = {}
  for (const siren of new Set(input.sirens)) {
    const owned = input.accounts.filter(account => account.siren === siren)
    // #3247 (14/10) — la tête de groupe (`siren`) d'une filiale POSSÉDÉE (`group_head_siren
    // === siren`) ouvre aussi un chemin : la filiale n'est jamais confondue avec le candidat
    // lui-même (`direct` reste la SEULE source de vérité pour `via_group: false`).
    const viaSubsidiaries = input.accounts.filter(
      account => account.siren !== siren && account.group_head_siren === siren,
    )
    const asPartner = input.relations.find(relation => relation.siren === siren)
    if (owned.length === 0 && viaSubsidiaries.length === 0 && !asPartner) continue
    const directIds = new Set(owned.map(account => account.id))
    const subsidiaryIds = new Set(viaSubsidiaries.map(account => account.id))
    const seen = new Set<string>()
    const paths: AccessPath[] = []
    for (const row of input.partnerRows) {
      const viaGroup = subsidiaryIds.has(row.account_id)
      if ((!directIds.has(row.account_id) && !viaGroup) || !opensAPath(row)) continue
      const key = row.name.trim().toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      paths.push({
        partner_name: row.name,
        partner_siren: (row.partner_relation_id && relationById.get(row.partner_relation_id)?.siren) || null,
        rank: row.rank,
        relationship: row.relationship,
        source: row.source,
        placements: row.placements,
        via_group: viaGroup,
      })
    }
    out[siren] = {
      paths,
      is_workspace_partner: asPartner ? { name: asPartner.name, stage: asPartner.stage } : null,
    }
  }
  return out
}
