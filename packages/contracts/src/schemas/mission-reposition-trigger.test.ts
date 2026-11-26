import { describe, expect, it } from 'vitest'
import { repositionReasons, repositionTrigger } from './mission-reposition-trigger.js'

describe('repositionTrigger — #2414.34 à .48 (le moteur commence tôt, pas à l’échéance)', () => {
  it('rend non_mesure quand la fin n’est pas connue — jamais "pas encore"', () => {
    expect(repositionTrigger({ renewalStatus: null, tier: 'unknown' })).toEqual({
      state: 'non_mesure',
      reasonKey: 'no_end_date',
    })
  })

  it('#2414.38 — une reconduction SIGNÉE dit "pas encore", quel que soit le palier', () => {
    expect(repositionTrigger({ renewalStatus: 'renouvele', tier: 't0' })).toEqual({
      state: 'pas_encore',
      reasonKey: 'renewed',
    })
  })

  it('#2414.34-48 NO-GO — une fin CONFIRMÉE ou un repositionnement déjà lancé démarre le moteur, même loin de l’échéance', () => {
    expect(repositionTrigger({ renewalStatus: 'fin_confirmee', tier: 'not_due' })).toEqual({
      state: 'a_commencer',
      reasonKey: 'ending_confirmed',
    })
    expect(repositionTrigger({ renewalStatus: 'repositionnement_lance', tier: 'not_due' })).toEqual({
      state: 'a_commencer',
      reasonKey: 'ending_confirmed',
    })
  })

  it('#2414.36 — le renouvellement INCERTAIN attend le palier de cadence (qui porte déjà le préavis)', () => {
    expect(repositionTrigger({ renewalStatus: 'non_engage', tier: 'not_due' })).toEqual({
      state: 'pas_encore',
      reasonKey: 'tier_far',
    })
    expect(repositionTrigger({ renewalStatus: 'discussion_en_cours', tier: 't60' })).toEqual({
      state: 'a_commencer',
      reasonKey: 'tier_close',
    })
    expect(repositionTrigger({ renewalStatus: null, tier: 't15' })).toEqual({
      state: 'a_commencer',
      reasonKey: 'tier_close',
    })
  })

  describe('#2414.34/.40 — demande marché (instantanés de territoire par lot)', () => {
    it('une demande marché MESURÉE ET PRÉSENTE démarre le moteur même palier loin', () => {
      expect(repositionTrigger({ renewalStatus: 'non_engage', tier: 'not_due', marketDemand: 'present' })).toEqual({
        state: 'a_commencer',
        reasonKey: 'market_demand',
      })
    })

    it('une demande ABSENTE (mesurée, mais nulle) ne démarre rien — reste "pas encore, palier loin"', () => {
      expect(repositionTrigger({ renewalStatus: 'non_engage', tier: 'not_due', marketDemand: 'absent' })).toEqual({
        state: 'pas_encore',
        reasonKey: 'tier_far',
      })
    })

    it('une demande NON MESURÉE (aucun département résolu) ne démarre rien — jamais confondue avec "absente"', () => {
      expect(repositionTrigger({ renewalStatus: 'non_engage', tier: 'not_due', marketDemand: 'non_mesure' })).toEqual({
        state: 'pas_encore',
        reasonKey: 'tier_far',
      })
    })

    it('ne présume rien quand le signal est omis — même sortie que sans le paramètre (compat)', () => {
      expect(repositionTrigger({ renewalStatus: 'non_engage', tier: 'not_due' })).toEqual({
        state: 'pas_encore',
        reasonKey: 'tier_far',
      })
    })

    it('NO-GO — une demande PRÉSENTE n’écrase jamais une reconduction déjà signée', () => {
      expect(repositionTrigger({ renewalStatus: 'renouvele', tier: 't0', marketDemand: 'present' })).toEqual({
        state: 'pas_encore',
        reasonKey: 'renewed',
      })
    })

    it('n’écrase jamais une fin non mesurée (aucune date) — priorité à "non_mesure" sur la demande', () => {
      expect(repositionTrigger({ renewalStatus: null, tier: 'unknown', marketDemand: 'present' })).toEqual({
        state: 'non_mesure',
        reasonKey: 'no_end_date',
      })
    })

    it('le palier proche reste prioritaire sur la demande marché — pas de double raison', () => {
      expect(repositionTrigger({ renewalStatus: null, tier: 't15', marketDemand: 'present' })).toEqual({
        state: 'a_commencer',
        reasonKey: 'tier_close',
      })
    })
  })

  describe('#2414.35 — rareté du profil (seuil du segment « profils rares », par lot)', () => {
    it('un profil MESURÉ RARE démarre le moteur même palier loin, sans demande marché', () => {
      expect(repositionTrigger({ renewalStatus: 'non_engage', tier: 'not_due', profileScarcity: 'present' })).toEqual({
        state: 'a_commencer',
        reasonKey: 'profile_scarcity',
      })
    })

    it('un profil COURANT (mesuré, non rare) ne démarre rien — reste "pas encore, palier loin"', () => {
      expect(repositionTrigger({ renewalStatus: 'non_engage', tier: 'not_due', profileScarcity: 'absent' })).toEqual({
        state: 'pas_encore',
        reasonKey: 'tier_far',
      })
    })

    it('un profil NON MESURÉ (aucune compétence typée connue) ne démarre rien — jamais confondu avec "courant"', () => {
      expect(
        repositionTrigger({ renewalStatus: 'non_engage', tier: 'not_due', profileScarcity: 'non_mesure' }),
      ).toEqual({ state: 'pas_encore', reasonKey: 'tier_far' })
    })

    it('ne présume rien quand le signal est omis — même sortie que sans le paramètre (compat)', () => {
      expect(repositionTrigger({ renewalStatus: 'non_engage', tier: 'not_due' })).toEqual({
        state: 'pas_encore',
        reasonKey: 'tier_far',
      })
    })

    it('la demande marché reste prioritaire sur la rareté du profil — pas de double raison', () => {
      expect(
        repositionTrigger({
          renewalStatus: 'non_engage',
          tier: 'not_due',
          marketDemand: 'present',
          profileScarcity: 'present',
        }),
      ).toEqual({ state: 'a_commencer', reasonKey: 'market_demand' })
    })

    it('NO-GO — une rareté PRÉSENTE n’écrase jamais une reconduction déjà signée', () => {
      expect(repositionTrigger({ renewalStatus: 'renouvele', tier: 't0', profileScarcity: 'present' })).toEqual({
        state: 'pas_encore',
        reasonKey: 'renewed',
      })
    })

    it('n’écrase jamais une fin non mesurée (aucune date) — priorité à "non_mesure" sur la rareté', () => {
      expect(repositionTrigger({ renewalStatus: null, tier: 'unknown', profileScarcity: 'present' })).toEqual({
        state: 'non_mesure',
        reasonKey: 'no_end_date',
      })
    })

    it('le palier proche reste prioritaire sur la rareté du profil — pas de double raison', () => {
      expect(repositionTrigger({ renewalStatus: null, tier: 't15', profileScarcity: 'present' })).toEqual({
        state: 'a_commencer',
        reasonKey: 'tier_close',
      })
    })
  })

  describe('#2414.41/.42 — besoins ouverts compatibles (croisement, par lot)', () => {
    it('un besoin ouvert COMPATIBLE démarre le moteur même palier loin', () => {
      expect(repositionTrigger({ renewalStatus: 'non_engage', tier: 'not_due', openNeeds: 'present' })).toEqual({
        state: 'a_commencer',
        reasonKey: 'open_needs',
      })
    })

    it('aucun besoin compatible (mesuré) ne démarre rien', () => {
      expect(repositionTrigger({ renewalStatus: 'non_engage', tier: 'not_due', openNeeds: 'absent' })).toEqual({
        state: 'pas_encore',
        reasonKey: 'tier_far',
      })
    })

    it('NON MESURÉ ne démarre rien — jamais confondu avec « aucun besoin »', () => {
      expect(repositionTrigger({ renewalStatus: 'non_engage', tier: 'not_due', openNeeds: 'non_mesure' })).toEqual({
        state: 'pas_encore',
        reasonKey: 'tier_far',
      })
    })

    it('la rareté du profil reste prioritaire — pas de double raison', () => {
      expect(
        repositionTrigger({
          renewalStatus: 'non_engage',
          tier: 'not_due',
          profileScarcity: 'present',
          openNeeds: 'present',
        }),
      ).toEqual({ state: 'a_commencer', reasonKey: 'profile_scarcity' })
    })

    it('NO-GO : une mission renouvelée reste « pas encore », quels que soient les besoins', () => {
      expect(repositionTrigger({ renewalStatus: 'renouvele', tier: 't0', openNeeds: 'present' })).toEqual({
        state: 'pas_encore',
        reasonKey: 'renewed',
      })
    })
  })
  describe('#2414.41/.42 — toutes les raisons qui tiennent, pas seulement la première', () => {
    it('un besoin ouvert compatible reste NOMMÉ quand le palier proche est déjà la raison principale', () => {
      const input = { renewalStatus: 'non_engage', tier: 't30', openNeeds: 'present' } as const
      expect(repositionTrigger(input).reasonKey).toBe('tier_close')
      expect(repositionReasons(input)).toEqual(['tier_close', 'open_needs'])
    })

    it('cumule dans l’ordre du déclencheur : palier, demande, rareté, besoin', () => {
      expect(
        repositionReasons({
          renewalStatus: 'non_engage',
          tier: 't15',
          marketDemand: 'present',
          profileScarcity: 'present',
          openNeeds: 'present',
        }),
      ).toEqual(['tier_close', 'market_demand', 'profile_scarcity', 'open_needs'])
    })

    it('un signal absent ou non mesuré n’ajoute aucune raison', () => {
      expect(
        repositionReasons({
          renewalStatus: 'non_engage',
          tier: 't30',
          marketDemand: 'absent',
          profileScarcity: 'non_mesure',
          openNeeds: 'non_mesure',
        }),
      ).toEqual(['tier_close'])
    })

    it('NO-GO : une reconduction signée ne porte QUE « renewed », aucun signal ne s’y ajoute', () => {
      expect(repositionReasons({ renewalStatus: 'renouvele', tier: 't0', openNeeds: 'present' })).toEqual(['renewed'])
    })

    it('sans date de fin : seulement « no_end_date »', () => {
      expect(repositionReasons({ renewalStatus: null, tier: 'unknown', openNeeds: 'present' })).toEqual(['no_end_date'])
    })

    it('rien ne tient : la raison du déclencheur lui-même (palier loin)', () => {
      expect(repositionReasons({ renewalStatus: 'non_engage', tier: 'not_due' })).toEqual(['tier_far'])
    })
  })
})

describe('#2414.44/.45 — partenaires et relations du compte', () => {
  const far = { renewalStatus: 'non_engage', tier: 'not_due' } as const

  it('un partenaire connu sur le compte démarre le repositionnement, avec sa raison', () => {
    expect(repositionTrigger({ ...far, partners: 'present' })).toEqual({ state: 'a_commencer', reasonKey: 'partners' })
  })

  it('une relation connue le démarre aussi, derrière le partenaire', () => {
    expect(repositionTrigger({ ...far, relations: 'present' })).toEqual({
      state: 'a_commencer',
      reasonKey: 'relations',
    })
    expect(repositionReasons({ ...far, partners: 'present', relations: 'present' })).toEqual(['partners', 'relations'])
  })

  it('absent ou non mesuré ne change rien (GA-18/19) : on ne conclut pas d’un silence', () => {
    for (const signal of ['absent', 'non_mesure'] as const) {
      expect(repositionTrigger({ ...far, partners: signal, relations: signal })).toEqual({
        state: 'pas_encore',
        reasonKey: 'tier_far',
      })
    }
  })

  it('une reconduction signée n’accumule rien (NO-GO #2414)', () => {
    expect(repositionReasons({ renewalStatus: 'renouvele', tier: 't0', partners: 'present' })).toEqual(['renewed'])
  })
})

describe('#2414.37/.43 — contraintes déclarées et mémoire marché', () => {
  const far = { renewalStatus: 'non_engage', tier: 'not_due' } as const

  it('une contrainte déclarée chez un affecté démarre le repositionnement, avec sa raison', () => {
    expect(repositionTrigger({ ...far, constraints: 'present' })).toEqual({
      state: 'a_commencer',
      reasonKey: 'constraints',
    })
  })

  it('la mémoire marché qui retrouve une techno de l’affecté chez le client le démarre aussi, derrière les relations', () => {
    expect(repositionTrigger({ ...far, marketMemory: 'present' })).toEqual({
      state: 'a_commencer',
      reasonKey: 'market_memory',
    })
    expect(
      repositionReasons({ ...far, relations: 'present', constraints: 'present', marketMemory: 'present' }),
    ).toEqual(['relations', 'constraints', 'market_memory'])
  })

  it('absent ou non mesuré ne change rien (GA-18/19)', () => {
    for (const signal of ['absent', 'non_mesure'] as const) {
      expect(repositionTrigger({ ...far, constraints: signal, marketMemory: signal })).toEqual({
        state: 'pas_encore',
        reasonKey: 'tier_far',
      })
    }
  })

  it('une reconduction signée n’accumule rien (NO-GO #2414)', () => {
    expect(
      repositionReasons({ renewalStatus: 'renouvele', tier: 't0', constraints: 'present', marketMemory: 'present' }),
    ).toEqual(['renewed'])
  })
})

describe('#2414.48 (épopée #2986, lot E09 08/10) — historique de présentation, tous besoins confondus', () => {
  const far = { renewalStatus: 'non_engage', tier: 'not_due' } as const

  it('une présentation RÉCENTE démarre le repositionnement, derrière la mémoire marché', () => {
    expect(repositionTrigger({ ...far, presentationHistory: 'present' })).toEqual({
      state: 'a_commencer',
      reasonKey: 'presentation_history',
    })
    expect(
      repositionReasons({
        ...far,
        constraints: 'present',
        marketMemory: 'present',
        presentationHistory: 'present',
      }),
    ).toEqual(['constraints', 'market_memory', 'presentation_history'])
  })

  it('absente ou non mesurée ne change rien (GA-18/19) : on ne conclut pas d’un silence', () => {
    for (const signal of ['absent', 'non_mesure'] as const) {
      expect(repositionTrigger({ ...far, presentationHistory: signal })).toEqual({
        state: 'pas_encore',
        reasonKey: 'tier_far',
      })
    }
  })

  it('une reconduction signée n’accumule rien (NO-GO #2414)', () => {
    expect(repositionReasons({ renewalStatus: 'renouvele', tier: 't0', presentationHistory: 'present' })).toEqual([
      'renewed',
    ])
  })
})
