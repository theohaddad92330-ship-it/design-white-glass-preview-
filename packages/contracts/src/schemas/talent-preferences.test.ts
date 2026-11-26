import { describe, expect, it } from 'vitest'
import {
  preferenceWarnings,
  talentMobilitySchema,
  talentPreferencesSchema,
  talentProcessSchema,
  type TalentMobility,
  type TalentPreferences,
} from './talent-preferences.js'

/**
 * Mobilité et préférences (PDF 3 §8.2, §8.3).
 *
 * Ce que ces tests protègent : `null` ne produit JAMAIS de drapeau. « On n'a pas
 * demandé » et « a dit non » sont deux informations différentes, et les
 * confondre ferait écarter quelqu'un sur une réponse qu'il n'a jamais donnée.
 */
const MOBILITY = (over: Partial<TalentMobility> = {}): TalentMobility => ({
  zones: null,
  remote: null,
  travel: null,
  relocation: null,
  siteFrequency: null,
  international: null,
  restrictions: null,
  ...over,
})
const PREFS = (over: Partial<TalentPreferences> = {}): TalentPreferences => ({
  wantedSectors: [],
  refusedSectors: [],
  refusedTechnologies: [],
  wantedContractKinds: [],
  ...over,
})

describe('preferenceWarnings', () => {
  it('ne dit RIEN quand rien n’est renseigné', () => {
    expect(preferenceWarnings(MOBILITY(), PREFS(), { sector: 'Banque', zone: 'Lyon' })).toEqual([])
  })

  it('SIGNALE un secteur refusé — sans écarter personne', () => {
    // Le profil reste proposable : « c'est le recruteur qui parle au
    // consultant, pas l'algorithme ».
    const warnings = preferenceWarnings(MOBILITY(), PREFS({ refusedSectors: ['Banque'] }), { sector: 'banque' })
    expect(warnings).toEqual([{ kind: 'refused_sector', detail: 'Banque' }])
  })

  it('signale une technologie refusée, accents et casse ignorés', () => {
    const warnings = preferenceWarnings(MOBILITY(), PREFS({ refusedTechnologies: ['Legacy Cobol'] }), {
      technologies: ['legacy cobol'],
    })
    expect(warnings[0]?.kind).toBe('refused_technology')
  })

  it('ne signale le distanciel que sur une contradiction FRANCHE', () => {
    // « Hybride » face à une mission sur site n'est pas une opposition, c'est
    // une conversation.
    expect(preferenceWarnings(MOBILITY({ remote: 'hybride' }), PREFS(), { remote: false })).toEqual([])
    expect(preferenceWarnings(MOBILITY({ remote: 'full_remote' }), PREFS(), { remote: false })).toHaveLength(1)
    expect(preferenceWarnings(MOBILITY({ remote: 'sur_site' }), PREFS(), { remote: true })).toHaveLength(1)
  })

  it('ignore la zone quand la mission est à DISTANCE', () => {
    // Une mission à distance n'a pas de lieu qui vaille.
    const warnings = preferenceWarnings(MOBILITY({ zones: ['IDF'] }), PREFS(), { zone: 'Lyon', remote: true })
    expect(warnings).toEqual([])
  })

  it('signale une zone hors périmètre, et le déplacement seulement si refusé', () => {
    const horsZone = preferenceWarnings(MOBILITY({ zones: ['IDF'] }), PREFS(), { zone: 'Lyon' })
    expect(horsZone.map(warning => warning.kind)).toEqual(['zone_mismatch'])

    const sansDeplacement = preferenceWarnings(MOBILITY({ zones: ['IDF'], travel: 'aucun' }), PREFS(), {
      zone: 'Lyon',
    })
    expect(sansDeplacement.map(warning => warning.kind)).toEqual(['zone_mismatch', 'travel_mismatch'])
  })

  it('ne reproche RIEN à quelqu’un dont on ignore la mobilité', () => {
    // C'est la règle du §8.2 : `null` par défaut, et l'écran DEMANDE plutôt que
    // de deviner.
    const warnings = preferenceWarnings(MOBILITY({ zones: null, travel: null }), PREFS(), {
      zone: 'Lyon',
      remote: false,
    })
    expect(warnings).toEqual([])
  })

  it('reconnaît une zone écrite plus large ou plus étroite que la mission', () => {
    expect(preferenceWarnings(MOBILITY({ zones: ['Île-de-France'] }), PREFS(), { zone: 'ile-de-france' })).toEqual([])
    expect(preferenceWarnings(MOBILITY({ zones: ['Paris'] }), PREFS(), { zone: 'Paris 15e' })).toEqual([])
  })

  // #2336.13 — jusqu'ici `wantedContractKinds` était déclaré mais jamais lu :
  // aucun test ne pouvait donc dire NON à une régression qui l'ignorerait.
  it('NE signale RIEN sur le type de contrat quand la personne n’a rien déclaré', () => {
    expect(preferenceWarnings(MOBILITY(), PREFS(), { contractKind: 'forfait' })).toEqual([])
  })

  it('SIGNALE un type de contrat hors de ceux voulus — sans écarter personne', () => {
    const warnings = preferenceWarnings(MOBILITY(), PREFS({ wantedContractKinds: ['Régie'] }), {
      contractKind: 'forfait',
    })
    expect(warnings).toEqual([{ kind: 'contract_kind_mismatch', detail: 'forfait' }])
  })

  it('ne signale rien quand le type de contrat déclaré correspond, accents et casse ignorés', () => {
    const warnings = preferenceWarnings(MOBILITY(), PREFS({ wantedContractKinds: ['régie'] }), {
      contractKind: 'Régie',
    })
    expect(warnings).toEqual([])
  })
})

/**
 * #2948 (#2329.19/.22/.23) — mobilité FINE : fréquence sur site, international,
 * restriction nommée. Même doctrine que le reste du §8.2 : `null` = « on n'a
 * pas demandé », jamais une valeur devinée ni une chaîne vide.
 */
describe('talentMobilitySchema — mobilité fine', () => {
  it('accepte les trois champs à `null` — l’état ordinaire, pas un défaut à combler', () => {
    const result = talentMobilitySchema.safeParse(MOBILITY())
    expect(result.success).toBe(true)
  })

  it('accepte les quatre fréquences sur site, et REFUSE une valeur hors énumération', () => {
    for (const value of ['jamais', 'ponctuelle', 'reguliere', 'permanente'] as const) {
      expect(talentMobilitySchema.safeParse(MOBILITY({ siteFrequency: value })).success).toBe(true)
    }
    // C'est le test qui dit NON : une fréquence inventée n'entre jamais en base.
    expect(talentMobilitySchema.safeParse(MOBILITY({ siteFrequency: 'tous_les_jours' as never })).success).toBe(false)
  })

  it('distingue `false` (a dit non) de `null` (on n’a pas demandé) pour l’international', () => {
    expect(talentMobilitySchema.parse(MOBILITY({ international: false })).international).toBe(false)
    expect(talentMobilitySchema.parse(MOBILITY({ international: null })).international).toBeNull()
  })

  it('borne la restriction et la nettoie des espaces — jamais une chaîne vide gardée', () => {
    expect(talentMobilitySchema.parse(MOBILITY({ restrictions: '  Pas de découché  ' })).restrictions).toBe(
      'Pas de découché',
    )
    expect(talentMobilitySchema.safeParse(MOBILITY({ restrictions: 'x'.repeat(501) })).success).toBe(false)
  })
})

/**
 * #3410 (retour bêta #3410) — quatre préférences NOUVELLES, additives et
 * optionnelles : une fiche déjà construite sans elles (voir `PREFS` ci-dessus)
 * continue de parser.
 */
describe('talentPreferencesSchema — préférences #3410', () => {
  it('accepte une fiche sans les quatre champs neufs — additif, rien ne casse', () => {
    expect(talentPreferencesSchema.safeParse(PREFS()).success).toBe(true)
  })

  it('accepte les quatre champs renseignés', () => {
    const result = talentPreferencesSchema.safeParse(
      PREFS({
        preferredClientTypes: ['Grand compte'],
        refusedClients: ['Ancien Client SA'],
        environmentsToAvoid: ['Astreinte'],
        nonNegotiableConditions: 'Pas de déplacement le vendredi',
      }),
    )
    expect(result.success).toBe(true)
  })

  it('nettoie et borne `nonNegotiableConditions`, et refuse une chaîne trop longue', () => {
    expect(
      talentPreferencesSchema.parse(PREFS({ nonNegotiableConditions: '  Pas de découché  ' })).nonNegotiableConditions,
    ).toBe('Pas de découché')
    expect(talentPreferencesSchema.safeParse(PREFS({ nonNegotiableConditions: 'x'.repeat(501) })).success).toBe(false)
  })

  it('distingue `null` (aucune condition connue) de l’absence — jamais une chaîne vide gardée', () => {
    expect(talentPreferencesSchema.parse(PREFS({ nonNegotiableConditions: null })).nonNegotiableConditions).toBeNull()
  })
})

/**
 * #2948 (#2329.30-.34) — PROCESSUS. `owner` n'a volontairement PAS de champ
 * ici (voir le commentaire de {@link talentProcessSchema}) : ces tests ne le
 * couvrent pas, pour ne pas laisser croire qu'il manque.
 */
describe('talentProcessSchema', () => {
  const PROCESS = { inProgress: null, exclusive: null, otherInterviews: null, decisionDeadline: null }

  it('accepte l’état ordinaire — tout à `null`, rien deviné', () => {
    expect(talentProcessSchema.safeParse(PROCESS).success).toBe(true)
  })

  it('distingue « en cours » (true), « aucune démarche » (false) et « on n’a pas demandé » (null)', () => {
    expect(talentProcessSchema.parse({ ...PROCESS, inProgress: true }).inProgress).toBe(true)
    expect(talentProcessSchema.parse({ ...PROCESS, inProgress: false }).inProgress).toBe(false)
    expect(talentProcessSchema.parse({ ...PROCESS, inProgress: null }).inProgress).toBeNull()
  })

  it('REFUSE un champ en trop — le contrat est strict', () => {
    // C'est le test qui dit NON : un cinquième champ « owner » ajouté ici par
    // erreur romprait le schéma plutôt que de dupliquer `owner_user_id`.
    expect(talentProcessSchema.safeParse({ ...PROCESS, owner: 'quelqu’un' }).success).toBe(false)
  })
})
