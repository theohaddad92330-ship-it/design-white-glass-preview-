import { describe, expect, it } from 'vitest'
import { auditProductAreaConfigurationSchema } from './commercial-audit-context.js'
import {
  AUDIT_CONFIGURATION_AREA_SETTINGS,
  buildAuditProductConfiguration,
} from './commercial-audit-product-configuration.js'
import type { ProfileContext } from './profile-context.js'

/**
 * #2068.24 / #2068.26 / #2068.27 — LA RÈGLE QUI MET UN ESPACE DANS UNE AIRE.
 * Voir le docblock de `commercial-audit-product-configuration.ts` pour la
 * décision d'architecture du 21/09/2026 ; ces tests l'exécutent.
 */

const COMPLETE: ProfileContext = {
  esnArchetype: 'boutiqueExpert',
  sellingPosture: 'expertiseRare',
  idealAccountProfile: {
    size: 'eti',
    sectorsPriority: ['Banque', 'Industrie'],
    decisionLevel: 'director',
    entryStrategy: 'bottomUp',
  },
  analysisParameters: {
    braveQueriesCount: 12,
    firecrawlPagesCount: 6,
    contactsTarget: 40,
    analysisDepth: 'standard',
    maxTokensResearch: 12000,
    focusAreas: ['Cloud & infrastructure'],
  },
  messagingStyle: {
    tone: 'directExpert',
    messageLength: 'concise',
    valuePropositionAngle: 'Une preuve vérifiable par domaine.',
    differentiationPoints: ['Une référence CV réelle par domaine'],
    avoid: [],
  },
  welcomeSummary: {
    profileRecap: 'Boutique experte.',
    searchesPersonalization: 'Je cherche des ETI.',
    contactsPersonalization: 'Je remonte jusqu’aux directeurs.',
    messagesPersonalization: 'J’écris court et direct.',
    scoringPersonalization: 'Je fais remonter tes deux secteurs.',
    firstAnalysisSuggestions: [],
  },
}

const areaOf = (context: ProfileContext | null, area: string) =>
  buildAuditProductConfiguration(context)?.find(entry => entry.area === area) ?? null

describe('buildAuditProductConfiguration — ce que l’espace doit CONFIGURER', () => {
  it('produit les trois aires déclarées, et chacune PARSE contre le contrat', () => {
    const produced = buildAuditProductConfiguration(COMPLETE)
    expect(produced?.map(entry => entry.area)).toEqual(Object.keys(AUDIT_CONFIGURATION_AREA_SETTINGS))
    for (const entry of produced ?? []) expect(auditProductAreaConfigurationSchema.parse(entry)).toEqual(entry)
  })

  it('#2068.24 — le barème de priorité : ses deux entrées d’espace, nommées', () => {
    const scoring = areaOf(COMPLETE, 'scoring')
    expect(scoring?.parameters.map(parameter => parameter.key)).toEqual(['prioritySectors', 'priorityThemes'])
    expect(scoring?.parameters[0]?.value).toBe('Banque · Industrie')
    // #2068.33 — une valeur remonte à l'énoncé VALIDÉ dont elle sort.
    expect(scoring?.parameters[0]?.trace?.statement).toBe('Je fais remonter tes deux secteurs.')
  })

  it('#2068.24 — une liste VIDE est un fait mesuré : « non réglé », jamais 0 ni « non mesuré »', () => {
    const scoring = areaOf(
      { ...COMPLETE, analysisParameters: { ...COMPLETE.analysisParameters!, focusAreas: [] } },
      'scoring',
    )
    const themes = scoring?.parameters.find(parameter => parameter.key === 'priorityThemes')
    expect(themes).toEqual({ key: 'priorityThemes', value: null, trace: null })
  })

  it('#2068.26 — l’étage que la carte d’influence doit atteindre', () => {
    expect(areaOf(COMPLETE, 'orgGraph')?.parameters).toEqual([
      {
        key: 'targetDecisionLevel',
        value: 'director',
        trace: { statement: 'Je remonte jusqu’aux directeurs.', provenance: null },
      },
    ])
    // Sans profil de compte idéal, la carte n'a aucun étage visé : l'aire ne
    // fait AUCUNE ligne — elle ne s'affiche pas « rien à faire ».
    const { idealAccountProfile: _dropped, ...withoutIdeal } = COMPLETE
    expect(areaOf(withoutIdeal, 'orgGraph')).toBeNull()
  })

  it('#2068.27 — l’angle et les preuves : sans angle, rien n’est préparable', () => {
    const messages = areaOf(
      {
        ...COMPLETE,
        messagingStyle: { ...COMPLETE.messagingStyle!, valuePropositionAngle: '   ', differentiationPoints: [] },
      },
      'messages',
    )
    expect(messages?.parameters).toEqual([
      { key: 'valueAngle', value: null, trace: null },
      { key: 'proofPoints', value: null, trace: null },
    ])
  })

  it('SAIT DIRE NON — aucun bloc source lu : `null`, jamais une liste vide qui prétendrait avoir mesuré', () => {
    expect(buildAuditProductConfiguration(null)).toBeNull()
    expect(buildAuditProductConfiguration(undefined)).toBeNull()
    expect(buildAuditProductConfiguration({ esnArchetype: 'soloHunter', sellingPosture: 'volumeFlexible' })).toBeNull()
  })

  it('#2068.33 — un réglage renseigné SANS énoncé validé ne fait aucune ligne, jamais « non réglé »', () => {
    const { welcomeSummary: _dropped, ...withoutStatements } = COMPLETE
    // Les blocs ONT été lus : `[]`, pas `null` — « mesuré, vide » n'est pas
    // « non mesuré ».
    expect(buildAuditProductConfiguration(withoutStatements)).toEqual([])
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — un réglage NON renseigné se liste même sans énoncé', () => {
    const { welcomeSummary: _dropped, ...withoutStatements } = COMPLETE
    const scoring = areaOf({ ...withoutStatements, analysisParameters: undefined }, 'scoring')
    // `idealAccountProfile` est lu, ses secteurs sont renseignés mais non
    // traçables : aucune ligne. `analysisParameters` n'est pas lu : aucune
    // ligne non plus. Donc aucune aire.
    expect(scoring).toBeNull()

    const bare = areaOf(
      {
        ...withoutStatements,
        idealAccountProfile: { ...COMPLETE.idealAccountProfile!, sectorsPriority: [] },
      },
      'scoring',
    )
    // En revanche une ABSENCE de réglage n'a pas d'énoncé à citer : elle se
    // dit toujours.
    expect(bare?.parameters).toEqual([{ key: 'prioritySectors', value: null, trace: null }])
  })

  it('aucune probabilité, aucun score : les valeurs sont du texte de l’espace, jamais un nombre', () => {
    for (const entry of buildAuditProductConfiguration(COMPLETE) ?? []) {
      for (const parameter of entry.parameters) {
        expect(parameter.value === null || Number.isNaN(Number(parameter.value))).toBe(true)
      }
    }
  })
})
