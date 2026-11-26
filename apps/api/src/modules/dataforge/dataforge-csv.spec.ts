import {
  createRecordAssembler,
  DATAFORGE_EVIDENCE_TIERS,
  normalizeAccountName,
  parseDataforgeHeader,
  parseDataforgeRecord,
  sirenFrom,
} from './dataforge-csv'

/** Un en-tête minimal mais RÉEL : les colonnes que le parseur consomme. */
const HEADER = [
  'bellum_data_version',
  'bellum_account_source_id',
  'bellum_account_name',
  'bellum_group_name',
  'bellum_sector',
  'bellum_account_cluster_id',
  'bellum_cluster_primary_account_id',
  'bellum_is_cluster_primary',
  'bellum_is_duplicate_variant',
  'bellum_domain_code',
  'bellum_evidence_tier',
  'bellum_evidence_status',
  'bellum_user_claim_policy',
  'bellum_scoring_policy',
  'bellum_procurement_policy',
  'bellum_procurement_inheritance_warning',
  'bellum_evidence_summary',
  'bellum_evidence_sources',
  'bellum_manual_verification_task',
  'account__siren_siret',
  'account__website',
  'account__account_market_role',
  'account__v10_research_tier',
  'account__v10_tier_a_domain_count',
  'account__v10_tier_b_domain_count',
  'account__main_risk',
  'domain__sector_prior_demand_score',
  'domain__median_observed_tjm',
  'domain__buyer_personas',
  'domain__recommended_procurement_route',
  'domain__evidence_item_count',
  // Les quatre familles que la V10 ajoute et que le filtre de préfixes de la V9
  // jetait — dont les cinq écartées, qui doivent rester dehors.
  'domain_taxonomy__keywords',
  'domain_taxonomy__signals',
  'domain_taxonomy__buyers',
  'domain_taxonomy__cross_sell_logic',
  'domain_gap__demand_supply_gap_index',
  'domain_gap__candidate_supply_rows',
  'talent_supply__candidate_profile_rows',
  'tjm__median_tjm',
  'tjm__confidence',
]

function lineFor(overrides: Record<string, string>): string {
  return HEADER.map(column => overrides[column] ?? '').join(';')
}

const BASE: Record<string, string> = {
  bellum_data_version: 'V10',
  bellum_account_source_id: 'DF-0042',
  bellum_account_name: 'Société Générale',
  bellum_domain_code: 'RISK_COMPLIANCE_AML',
  bellum_evidence_tier: 'D',
  bellum_user_claim_policy: 'SECTOR_PRIOR_ONLY__NEVER_PRESENT_AS_FACT_OR_OPPORTUNITY',
  domain__recommended_procurement_route: 'Panel achats groupe',
}

describe('parseDataforgeRecord', () => {
  const header = parseDataforgeHeader(HEADER.join(';'))

  it('lit une ligne complète : compte + domaine, policies conservées telles quelles', () => {
    const parsed = parseDataforgeRecord(
      header,
      lineFor({
        ...BASE,
        account__siren_siret: '55212022200013',
        domain__sector_prior_demand_score: '3,5',
        domain__median_observed_tjm: '',
        domain__evidence_item_count: '2',
      }),
    )
    if (parsed.kind !== 'row') throw new Error(`rejeté: ${JSON.stringify(parsed)}`)
    expect(parsed.account.sourceId).toBe('DF-0042')
    expect(parsed.account.normalizedName).toBe('societe generale')
    // SIRET 14 chiffres → SIREN 9, brut conservé.
    expect(parsed.account.siren).toBe('552120222')
    expect(parsed.account.sirenSiretRaw).toBe('55212022200013')
    // La route achats remonte au COMPTE (identique sur les 66 domaines, mesuré).
    expect(parsed.account.procurementRoute).toBe('Panel achats groupe')
    expect(parsed.domain.evidenceTier).toBe('D')
    expect(parsed.domain.userClaimPolicy).toBe('SECTOR_PRIOR_ONLY__NEVER_PRESENT_AS_FACT_OR_OPPORTUNITY')
    // Virgule décimale d'un export FR.
    expect(parsed.domain.sectorPriorDemandScore).toBe(3.5)
    expect(parsed.domain.evidenceItemCount).toBe(2)
  })

  it('une cellule vide vaut null — jamais 0, jamais une chaîne vide', () => {
    const parsed = parseDataforgeRecord(header, lineFor(BASE))
    if (parsed.kind !== 'row') throw new Error('rejeté')
    expect(parsed.account.siren).toBeNull()
    expect(parsed.domain.medianObservedTjm).toBeNull()
    expect(parsed.domain.sectorPriorDemandScore).toBeNull()
  })

  it('un tier hors de la liste fermée écarte la ligne AVEC sa raison', () => {
    const parsed = parseDataforgeRecord(header, lineFor({ ...BASE, bellum_evidence_tier: 'E' }))
    expect(parsed).toEqual({ kind: 'rejected', reason: expect.stringContaining('tier inconnu « E »') })
  })

  it('un nombre de colonnes différent de l’en-tête écarte la ligne', () => {
    const parsed = parseDataforgeRecord(header, 'V10;seulement;trois')
    expect(parsed.kind).toBe('rejected')
  })

  it('le payload garde le reste SANS dupliquer les colonnes typées', () => {
    const parsed = parseDataforgeRecord(header, lineFor({ ...BASE, account__main_risk: 'captive interne' }))
    if (parsed.kind !== 'row') throw new Error('rejeté')
    expect(parsed.account.accountPayload['account__main_risk']).toBe('captive interne')
    expect(parsed.account.accountPayload['account__siren_siret']).toBeUndefined()
    expect(parsed.domain.domainPayload['domain__recommended_procurement_route']).toBeUndefined()
  })

  /**
   * Le défaut du 29/08/2026 : les quatre familles V10 n'existaient pour le
   * parseur ni comme donnée ni comme rejet. Elles entrent maintenant dans le
   * payload DOMAINE — jamais en champ typé, jamais dans `evidence` : mesurées
   * constantes sur les 1 195 comptes, ce sont des priors de domaine (GA-37).
   */
  it('les priors de domaine de la V10 entrent dans le payload domaine', () => {
    const parsed = parseDataforgeRecord(
      header,
      lineFor({
        ...BASE,
        // Le pack CITE ces cellules : leur séparateur interne est le même `;`
        // que celui des colonnes.
        domain_taxonomy__keywords: '"pmo; project management office; chef de projet"',
        domain_taxonomy__signals: '"programme; roadmap; migration"',
        domain_gap__demand_supply_gap_index: '-49.8',
        talent_supply__candidate_profile_rows: '586',
        tjm__median_tjm: '630.0',
        tjm__confidence: 'medium',
      }),
    )
    if (parsed.kind !== 'row') throw new Error('rejeté')
    expect(parsed.domain.domainPayload['domain_taxonomy__keywords']).toBe(
      'pmo; project management office; chef de projet',
    )
    expect(parsed.domain.domainPayload['domain_taxonomy__signals']).toBe('programme; roadmap; migration')
    expect(parsed.domain.domainPayload['domain_gap__demand_supply_gap_index']).toBe('-49.8')
    expect(parsed.domain.domainPayload['talent_supply__candidate_profile_rows']).toBe('586')
    expect(parsed.domain.domainPayload['tjm__median_tjm']).toBe('630.0')
    // Le TJM du pack ne voyage JAMAIS nu : sa confiance l'accompagne (45 des 66
    // domaines sont en `low`, 36 reposent sur 3 missions observées ou moins).
    expect(parsed.domain.domainPayload['tjm__confidence']).toBe('medium')
  })

  it('les cinq colonnes écartées restent dehors, des DEUX côtés', () => {
    const parsed = parseDataforgeRecord(
      header,
      lineFor({
        ...BASE,
        domain__buyer_personas: '"DAF; COO"',
        domain_taxonomy__buyers: '"DAF; COO"',
        domain_taxonomy__cross_sell_logic: '',
        domain_gap__candidate_supply_rows: '586',
      }),
    )
    if (parsed.kind !== 'row') throw new Error('rejeté')
    expect(parsed.domain.domainPayload['domain_taxonomy__buyers']).toBeUndefined()
    expect(parsed.domain.domainPayload['domain_taxonomy__cross_sell_logic']).toBeUndefined()
    expect(parsed.domain.domainPayload['domain_gap__candidate_supply_rows']).toBeUndefined()
    expect(parsed.account.accountPayload['domain_taxonomy__buyers']).toBeUndefined()
    // Ce qu'elle doublonne, lui, reste bien porté en champ typé.
    expect(parsed.domain.buyerPersonas).toBe('DAF; COO')
  })

  it('la ligne rend sa forme BRUTE, pour que l’audit puisse la compter', () => {
    // Sans elle, l'audit devrait re-découper les 345 Mo une seconde fois — et
    // un compteur qu'on n'ose pas payer est un compteur qu'on n'écrit pas.
    const parsed = parseDataforgeRecord(header, lineFor({ ...BASE, domain_taxonomy__buyers: 'DAF' }))
    if (parsed.kind !== 'row') throw new Error('rejeté')
    expect(parsed.raw['domain_taxonomy__buyers']).toBe('DAF')
    expect(parsed.raw['bellum_account_source_id']).toBe('DF-0042')
  })
})

describe('createRecordAssembler', () => {
  it('un retour à la ligne CITÉ ne coupe pas l’enregistrement', () => {
    const assembler = createRecordAssembler()
    const records = assembler.push('a;"ligne 1\nligne 2";c\nd;e;f\n')
    expect(records).toEqual(['a;"ligne 1\nligne 2";c', 'd;e;f'])
    expect(assembler.flush()).toBeNull()
  })

  it('un enregistrement coupé entre deux chunks se reconstitue', () => {
    const assembler = createRecordAssembler()
    expect(assembler.push('a;b;"début ')).toEqual([])
    expect(assembler.push('fin";c\n')).toEqual(['a;b;"début fin";c'])
  })

  it('le dernier enregistrement sans saut de ligne final sort au flush', () => {
    const assembler = createRecordAssembler()
    assembler.push('a;b;c')
    expect(assembler.flush()).toBe('a;b;c')
  })

  it('\\r\\n ne produit pas d’enregistrement vide', () => {
    const assembler = createRecordAssembler()
    expect(assembler.push('a;b\r\nc;d\r\n')).toEqual(['a;b', 'c;d'])
  })
})

describe('sirenFrom', () => {
  it('9 chiffres tels quels, 14 tronqués au SIREN, le reste refusé', () => {
    expect(sirenFrom('552120222')).toBe('552120222')
    expect(sirenFrom('552 120 222 00013')).toBe('552120222')
    expect(sirenFrom('FR552120222')).toBe('552120222')
    expect(sirenFrom('12345')).toBeNull()
    expect(sirenFrom(null)).toBeNull()
  })

  /**
   * « SIREN à 9 chiffres : 0 » était FAUX — il y en a QUATRE, et c'est mesuré.
   *
   * D'où venait le zéro : les quatre vrais SIREN du pack portent des crochets,
   * comme les marque-places « [à compléter lot 2] ». Un classement par « la
   * cellule contient un crochet » les rangeait donc avec eux, et le refus
   * « compléter les SIREN depuis ce fichier — il n'en porte aucun » se fondait
   * sur ce mauvais tri. La lecture juste compte les CHIFFRES, pas la ponctuation.
   */
  it('les quatre SIREN RÉELS du pack V10, dans leur forme exacte', () => {
    // DF-0014 et DF-0415 : la MÊME cellule, deux fiches du même groupe.
    expect(sirenFrom('352 463 574 (RCS Bourg-en-Bresse) [confirmé — mentions légales]')).toBe('352463574')
    expect(sirenFrom('542 052 766 (RCS Nanterre) [confirmé — comptes sociaux Pappers]')).toBe('542052766')
    expect(sirenFrom('432 766 947 [confirmé — fiche acheteur public]')).toBe('432766947')
    // …et un marque-place, lui, ne rend toujours rien : il ne porte aucun chiffre
    // de la bonne longueur, donc on ne devine pas un identifiant légal.
    expect(sirenFrom('[à compléter lot 2 — Pappers/Sirene]')).toBeNull()
    expect(sirenFrom('[à compléter lot 4]')).toBeNull()
  })
})

describe('garde-fous de forme', () => {
  it('la liste des tiers est fermée et ordonnée A→D', () => {
    expect(DATAFORGE_EVIDENCE_TIERS).toEqual(['A', 'B', 'C', 'D'])
  })

  it('l’en-tête perd son BOM', () => {
    expect(parseDataforgeHeader('﻿a;b')[0]).toBe('a')
  })

  it('la normalisation reconnaît un nom d’un fichier à l’autre', () => {
    expect(normalizeAccountName('Forvia (ex-Faurecia)')).toBe('forvia ex faurecia')
  })
})
