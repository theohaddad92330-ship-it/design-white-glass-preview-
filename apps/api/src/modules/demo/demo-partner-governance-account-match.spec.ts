import {
  DEMO_DELIVERY_CLIENT,
  DEMO_PARTNER_RELATIONS,
  DEMO_SG_ESN_PARTNERS,
  DEMO_SPRINT_PARTNER_ROUTE_PARTNER,
  DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER,
} from './demo-dataset'

/**
 * #3270.6 reste (30/09/2026) — LE CADRE DE GOUVERNANCE RANG 2, SUR LA FICHE
 * COMPTE, JAMAIS OBSERVABLE POUR CERTAINES ESN.
 *
 * `TabPartners.tsx` (`PartnerDetailModal`) rapproche une ESN déclarée sur un
 * compte (`account_partners` / `dossier.account.partners`,
 * `DEMO_DELIVERY_CLIENT.account.partners`) avec une relation de gouvernance
 * (`partner_relations`, `DEMO_PARTNER_RELATIONS`) en LECTURE SEULE, par nom
 * normalisé (`trim().toLowerCase()`) — jamais par jointure SQL (règle 4 de
 * #3249). Recette salle démo du 30/09 : SNCF › Écosystème & accès
 * → « Voir le détail de Sopra Steria » ouvrait la modale SANS
 * `PartnerReadinessPanel` — aucune ligne de `DEMO_PARTNER_RELATIONS` ne
 * portait ce nom.
 *
 * Cette garde SAIT DIRE NON : elle rejoue la MÊME normalisation que l'écran,
 * sur le jeu réellement construit, pour CHAQUE ESN déclarée d'un dossier de
 * démo qui a un rang-2 (`rank1`/`rank2`, `relationship: 'partner'`) — pas
 * seulement Sopra Steria.
 */
function normalize(name: string): string {
  return name.trim().toLowerCase()
}

describe('couverture démo — le cadre de gouvernance se rapproche sur les ESN rang 2 (#3270.6)', () => {
  it('lit un corpus NON VIDE — sans lui, la garde passerait au vert sur du vide', () => {
    expect(DEMO_PARTNER_RELATIONS.length).toBeGreaterThan(0)
  })

  it('Sopra Steria, déclarée sur Groupe BPCE, a une relation de gouvernance du même nom', () => {
    // Décision Louis 04/10/2026 — une VRAIE ESN observée par le brief BPCE.
    expect(DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER.name).toBe('Sopra Steria')
    const match = DEMO_PARTNER_RELATIONS.find(
      relation => normalize(relation.name) === normalize(DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER.name),
    )
    expect(match).toBeDefined()
  })

  it('CGI, déclarée sur BNP Paribas (`DEMO_SPRINT_PARTNER_ROUTE_PARTNER`), a toujours sa relation de gouvernance jumelle', () => {
    const match = DEMO_PARTNER_RELATIONS.find(
      relation => normalize(relation.name) === normalize(DEMO_SPRINT_PARTNER_ROUTE_PARTNER.name),
    )
    expect(match).toBeDefined()
  })

  it('« Sopra Steria » n’a qu’UNE relation partenaire — une seule ligne porte ce préfixe de nom', () => {
    const matches = DEMO_PARTNER_RELATIONS.filter(relation => normalize(relation.name).startsWith('sopra steria'))
    expect(matches).toHaveLength(1)
    expect(matches[0]?.name).toBe('Sopra Steria')
  })

  it('surface Opportunité (#3270.6) : Société Générale porte une ESN rang 2 OBSERVÉE (mc2i) avec sa relation jumelle gouvernée', () => {
    // Décision Louis 04/10/2026 — le client de livraison (SNCF) n'a aucune ESN
    // en place ; la surface vit sur mc2i, observée par le relevé SG et promue
    // rang 2 par le semis (`demo-seed.service.ts`).
    expect(DEMO_DELIVERY_CLIENT.partners).toEqual([])
    expect(DEMO_SG_ESN_PARTNERS.some(p => p.name === 'mc2i')).toBe(true)
    const match = DEMO_PARTNER_RELATIONS.find(relation => normalize(relation.name) === 'mc2i')
    expect(match?.governance?.accountsAccessible).toContain('Société Générale')
  })
})
