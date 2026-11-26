import { discoverOriginCriteriaSchema, isDiscoverOriginCriteriaEmpty, namedAccountVerdict } from '@bellum/contracts'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3914 — « Découvrir vs analyse — deux verdicts sans explication quand ils
 * divergent ». Le pont (`AccountVerdictSummary.tsx:195`, `accounts.discover_origin_reason`)
 * est déjà câblé et testé en isolation (`AccountVerdictSummary.test.tsx`,
 * `accounts.service.spec.ts`) — ce qui manquait pour le rendre observable EN
 * DÉMO, faute de cas réel en production (recette prod 08/10 : « NON PROUVABLE
 * — pas de compte réel origin 'discover' + Mettre en veille identifié »).
 *
 * TotalEnergies est le SEUL compte STOP + déclencheur de no-go de la salle
 * (#2118.45-47) : son verdict projeté est donc, par construction, « METTRE EN
 * VEILLE » — la seule valeur que le pont #3914 lit. Cette garde prouve que le
 * jeu de démonstration porte bien l'origine Découvrir sur CE compte précis, et
 * que son verdict projeté est effectivement celui qui déclenche le pont —
 * jamais un autre compte, jamais une valeur inventée.
 */
describe('#3914 — TotalEnergies porte le cas démo « Découvrir vs analyse »', () => {
  const totalEnergies = DEMO_DOSSIERS.find(d => d.account.company_name === 'TotalEnergies')

  it('TotalEnergies existe dans le jeu de démonstration', () => {
    expect(totalEnergies).toBeDefined()
  })

  it('porte une origine Découvrir ET sa raison (les deux ensemble, jamais un seul)', () => {
    expect(totalEnergies!.account.origin).toBe('discover')
    expect(totalEnergies!.account.discover_origin_reason).toBe('Un signal de recrutement sur le grand arrêt de Feyzin')
  })

  // #3819 (lot RBB2) — « Sélectionné sur … » : les critères persistés avec l'origine.
  it('porte aussi les CRITÈRES posés dans Découvrir, conformes au contrat strict', () => {
    const criteria = totalEnergies!.account.discover_origin_criteria
    expect(discoverOriginCriteriaSchema.parse(criteria)).toEqual({
      sectors: ['oil_gas'],
      zone: 'Lyon (69)',
      signals: ['hiring'],
      // #3819 (lot W-C 13/10) — la compétence cherchée suit aussi le compte en démo.
      skills: ['maintenance'],
      // #4646 — l'offre qui a fait sortir le compte (spec restée sur l'état d'avant, rouge sur main).
      offers: [{ title: 'Responsable maintenance — arrêt programmé', date: '2026-10-12', seen: '2026-10-20' }],
      // #4433.9 — Feyzin est sorti par l'élargissement à 50 km : le palier suit le compte, nommé au dossier.
      zone_widened: { tier: 'radius_50', distance_km: 12, place: 'Lyon' },
    })
    expect(isDiscoverOriginCriteriaEmpty(criteria)).toBe(false)
  })

  it('aucun autre compte de la salle ne porte une origine Découvrir (pas de valeur devinée)', () => {
    for (const dossier of DEMO_DOSSIERS) {
      if (dossier.account.company_name === 'TotalEnergies') continue
      // garde #3914 : jamais d'origine Découvrir devinée. #4526.7 : l'origine `crm` est posée en plus (ENGIE, BNP).
      // #4597.1 : `import` l'est aussi, sur Kiabi, pour que la puce « Importés » du portefeuille ait un compte à
      // compter. Ce que cette garde refuse reste `discover` : une provenance Découvrir ne se devine sur aucun
      // dossier de la salle, c'est la seule que la démonstration ne peut pas inventer.
      expect([null, 'crm', 'import']).toContain(dossier.account.origin ?? null)
      expect(dossier.account.discover_origin_reason ?? null).toBeNull()
      expect(dossier.account.discover_origin_criteria ?? null).toBeNull()
    }
  })

  it('le verdict projeté de TotalEnergies est bien « METTRE EN VEILLE » — la seule valeur lue par le pont', () => {
    const evaluation = totalEnergies!.account.raw_analysis!['evaluation'] as {
      go_no_go: 'GO' | 'PRUDENT' | 'STOP'
      dossier_read: { no_go?: { trigger?: string } }
    }
    expect(evaluation.go_no_go).toBe('STOP')
    const hasNoGoTrigger = Boolean(evaluation.dossier_read.no_go?.trigger)
    expect(hasNoGoTrigger).toBe(true)
    // go_no_go: 'STOP' (le vocabulaire du dossier) ⇔ family: 'NO-GO' (le vocabulaire
    // du contrat), même projection que `BellumReadCard`/`ScoreSummaryCard`.
    expect(namedAccountVerdict('NO-GO', hasNoGoTrigger)).toBe('METTRE EN VEILLE')
  })
})
