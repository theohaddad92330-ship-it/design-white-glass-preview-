import { describe, expect, it } from 'vitest'
import {
  CONSULTANT_CONTRACTS,
  ENGAGEMENT_KINDS,
  engagementKindSchema,
  engagementNeedsPartner,
  missingPartnerForEngagement,
} from './consultant.js'

/**
 * Les quatre natures de talent (PDF 3 §2, décision D16 du 20/08).
 *
 * Le champ `engagement_kind` est SÉPARÉ de `kind`, et ces tests le verrouillent
 * : les fusionner rendrait « un freelance qu'on suit encore comme candidat »
 * inexprimable et ferait dépendre la rétention RGPD du mode de facturation.
 */
describe('engagement d’un talent', () => {
  it('exige un partenaire pour une sous-traitance, et pour elle seule', () => {
    // « Un sous-traitant porte toujours son partenaire » : sans lui, personne
    // ne sait qui est responsable devant le client.
    expect(engagementNeedsPartner('sous_traitance')).toBe(true)
    for (const kind of ENGAGEMENT_KINDS.filter(value => value !== 'sous_traitance')) {
      expect(engagementNeedsPartner(kind)).toBe(false)
    }
  })

  it('refuse une écriture de sous-traitance sans partenaire', () => {
    expect(missingPartnerForEngagement({ engagement_kind: 'sous_traitance' })).toBe(true)
    expect(missingPartnerForEngagement({ engagement_kind: 'sous_traitance', partner_account_id: null })).toBe(true)
    expect(
      missingPartnerForEngagement({
        engagement_kind: 'sous_traitance',
        partner_account_id: '11111111-1111-4111-8111-111111111111',
      }),
    ).toBe(false)
  })

  it('ne réclame RIEN quand l’engagement n’est pas touché', () => {
    // Une mise à jour partielle qui ne parle pas d'engagement ne doit pas
    // exiger un champ que l'utilisateur n'a pas ouvert.
    expect(missingPartnerForEngagement({})).toBe(false)
    expect(missingPartnerForEngagement({ partner_account_id: null })).toBe(false)
  })

  it('garde les quatre premiers cadres contractuels dans leur ordre d’origine', () => {
    // La garde d'additivité refuse une insertion : `cdd` et `sous_traitance`
    // s'ajoutent en fin, jamais entre `portage` et `inconnu`.
    expect(CONSULTANT_CONTRACTS.slice(0, 4)).toEqual(['cdi', 'freelance', 'portage', 'inconnu'])
    expect(CONSULTANT_CONTRACTS.slice(4)).toEqual(['cdd', 'sous_traitance'])
  })

  /**
   * #2948 (#2329.28) — `partenaire` : la personne EST l'entité partenaire,
   * distincte de `sous_traitance` (un tiers qui porte QUELQU'UN D'AUTRE).
   * Contrainte SQL déjà élargie (`20260927181000-ConsultantEngagementPartner`,
   * GA-11/12) AVANT ce test.
   */
  it('accepte « partenaire », sans jamais exiger de partenaire porteur pour lui-même', () => {
    expect(engagementKindSchema.safeParse('partenaire').success).toBe(true)
    expect(ENGAGEMENT_KINDS).toContain('partenaire')
    expect(engagementNeedsPartner('partenaire')).toBe(false)
    expect(missingPartnerForEngagement({ engagement_kind: 'partenaire' })).toBe(false)
    // Additif (GA-08) : `partenaire` s'ajoute EN FIN, après `inconnu`, jamais
    // entre deux valeurs déjà en service.
    expect(ENGAGEMENT_KINDS.at(-1)).toBe('partenaire')
  })
})
