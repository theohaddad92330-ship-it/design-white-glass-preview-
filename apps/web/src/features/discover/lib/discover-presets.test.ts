import { describe, expect, it } from 'vitest'
import {
  discoverPresets,
  isMiddleMarketActive,
  isPresetActive,
  MIDDLE_MARKET_PATCH,
  territoryTrackHintKey,
  toggleMiddleMarket,
  withoutPreset,
} from './discover-presets'
import { buildDiscoverRequest, emptyUnifiedFilters } from './discover-filters'

describe('discoverPresets (V2 §17, rail unifié §18-19)', () => {
  it('propose les 11 entrées en matière demandées', () => {
    expect(discoverPresets().map(p => p.id)).toEqual([
      'accessible',
      'middleMarket',
      'hiring',
      'transforming',
      'movingNow',
      'compatibleWithOffer',
      'likeReferences',
      'esnPartners',
      'decisionMakersOnExpertise',
      'externalRecourseObserved',
      'subsidiariesOfGroups',
    ])
  })

  /**
   * #2165.14 (17/09/2026) — « Avec recours externe observé » : filtre SERVEUR
   * de la mémoire marché (#2165.30), jamais `false` (doctrine c65, GA-259).
   */
  it('« avec recours externe observé » pose le filtre serveur `true`, jamais `false`', () => {
    const preset = discoverPresets().find(p => p.id === 'externalRecourseObserved')!
    expect(preset.patch.externalRecourseObserved).toBe(true)
    const request = buildDiscoverRequest({ ...emptyUnifiedFilters(), ...preset.patch })
    expect(request?.mode).toBe('registry')
    expect(request?.mode === 'registry' && request.query.filters.externalRecourseObserved).toBe(true)
  })

  /**
   * #2151.29 (16/09/2026) — « Dans Découvrir : "Trouver des partenaires ou
   * ESN" ». Aucun filtre fantôme : `entityType` est un contrôle RÉEL du rail
   * (`FilterRail.tsx:434-439`, `rail.entityTypeLabel`), avec trois lectures
   * déjà honorées par la requête (`discover-query.ts:310`) — `esn` bascule la
   * même moisson vers la prospection partenaire au lieu de la prospection
   * directe. Le preset ne fait qu'exposer ce contrôle en entrée visible.
   */
  it('« trouver des partenaires ou ESN » bascule entityType sur esn, en mode signaux (#2151.29)', () => {
    const esnPartners = discoverPresets().find(p => p.id === 'esnPartners')!
    expect(esnPartners.patch.entityType).toBe('esn')
    const request = buildDiscoverRequest({ ...emptyUnifiedFilters(), ...esnPartners.patch })
    expect(request?.mode).toBe('signals')
  })

  /**
   * Un preset qui atterrit sur `resultType: 'contacts'` n'a pas besoin d'une
   * requête comptes exécutable : `Discover.tsx` le dit lui-même (« un moteur à
   * part ») — la liste de personnes se lance sur `q` (terme libre), jamais sur
   * `buildDiscoverRequest`. Vérifier ce cas exigerait un secteur/effectif
   * fantôme rien que pour satisfaire ce test, ce que la tête du fichier
   * s'interdit.
   *
   * Les deux presets sourcés (#2165.12, #2165.13) ont leur source fournie
   * ici : c'est l'ÉCRAN qui décide si un preset SANS source doit être
   * désactivé plutôt que de produire une requête vide (voir le test dédié
   * ci-dessous, qui prouve le cas désactivé).
   */
  it('chaque preset COMPTES/PARTENAIRES pré-remplit le rail et produit une requête exécutable', () => {
    const sourced = discoverPresets({ offerSectorCodes: ['aerospace'], bestReferenceSectorCodes: ['rail'] })
    for (const preset of sourced) {
      if (preset.resultType === 'contacts') continue
      const filters = { ...emptyUnifiedFilters(), ...preset.patch }
      expect(buildDiscoverRequest(filters)).not.toBeNull()
    }
  })

  // #2165.12 — « Compatibles avec mon offre » : construit sur les VRAIS
  // secteurs déclarés au portefeuille d'offre, jamais un mapping deviné.
  describe('#2165.12 — « Compatibles avec mon offre » lit les secteurs déclarés au portefeuille', () => {
    it('pose les secteurs déclarés quand le portefeuille en porte', () => {
      const preset = discoverPresets({ offerSectorCodes: ['banking', 'insurance'] }).find(
        p => p.id === 'compatibleWithOffer',
      )!
      expect(preset.patch.sectors).toEqual(['banking', 'insurance'])
      expect(preset.disabledReason).toBeUndefined()
    })

    it('SAIT DIRE NON — aucun secteur déclaré ⇒ désactivé et DIT, jamais « tous secteurs »', () => {
      const preset = discoverPresets().find(p => p.id === 'compatibleWithOffer')!
      expect(preset.patch).toEqual({})
      expect(preset.disabledReason).toBe('no_offer_sectors')
    })

    // #2804 (#2291.2) — la ZONE déclarée (`target_geographies`, traduite en
    // amont en codes région) rejoint le secteur, indépendamment.
    it('pose la région déclarée quand le portefeuille en porte une, même sans secteur', () => {
      const preset = discoverPresets({ offerRegionCodes: ['84'] }).find(p => p.id === 'compatibleWithOffer')!
      expect(preset.patch).toEqual({ region: ['84'] })
      expect(preset.disabledReason).toBeUndefined()
    })

    it('cumule secteur ET région quand le portefeuille déclare les deux', () => {
      const preset = discoverPresets({ offerSectorCodes: ['banking'], offerRegionCodes: ['84', '93'] }).find(
        p => p.id === 'compatibleWithOffer',
      )!
      expect(preset.patch).toEqual({ sectors: ['banking'], region: ['84', '93'] })
      expect(preset.disabledReason).toBeUndefined()
    })

    it('SAIT DIRE NON — ni secteur ni région déclarés ⇒ désactivé et DIT', () => {
      const preset = discoverPresets({ offerSectorCodes: [], offerRegionCodes: [] }).find(
        p => p.id === 'compatibleWithOffer',
      )!
      expect(preset.patch).toEqual({})
      expect(preset.disabledReason).toBe('no_offer_sectors')
    })

    // #2804 (#2291.2) — la famille de rôle acheteur déclarée
    // (`preferred_buyer_role_families`, résolue en amont par
    // `offerTargetBuyerRole`) arme le filtre CONTACTS `expertise`, hors de
    // `patch` (qui reste le rail COMPTES) et indépendamment des deux autres axes.
    it('pose la famille de rôle acheteur résolue, hors patch comptes, même sans secteur ni région', () => {
      const preset = discoverPresets({ offerBuyerRole: 'cyber' }).find(p => p.id === 'compatibleWithOffer')!
      expect(preset.patch).toEqual({})
      expect(preset.contactFiltersPatch).toEqual({ expertise: 'cyber' })
      expect(preset.disabledReason).toBeUndefined()
    })

    it('cumule les trois axes quand le portefeuille les déclare tous', () => {
      const preset = discoverPresets({
        offerSectorCodes: ['banking'],
        offerRegionCodes: ['84'],
        offerBuyerRole: 'cyber',
      }).find(p => p.id === 'compatibleWithOffer')!
      expect(preset.patch).toEqual({ sectors: ['banking'], region: ['84'] })
      expect(preset.contactFiltersPatch).toEqual({ expertise: 'cyber' })
      expect(preset.disabledReason).toBeUndefined()
    })

    it('SAIT DIRE NON — aucun rôle résolu (absent ou ambigu) ⇒ pas de `contactFiltersPatch`', () => {
      const preset = discoverPresets({ offerBuyerRole: null }).find(p => p.id === 'compatibleWithOffer')!
      expect(preset.contactFiltersPatch).toBeUndefined()
    })

    it('SAIT DIRE NON — aucun des trois axes déclaré ⇒ désactivé et DIT', () => {
      const preset = discoverPresets({ offerSectorCodes: [], offerRegionCodes: [], offerBuyerRole: null }).find(
        p => p.id === 'compatibleWithOffer',
      )!
      expect(preset.patch).toEqual({})
      expect(preset.contactFiltersPatch).toBeUndefined()
      expect(preset.disabledReason).toBe('no_offer_sectors')
    })
  })

  // #2165.13 — « Proches de mes meilleures références » : CORRIGÉ pour lire
  // les vraies références marquées, plus une tranche d'âge/effectif fixe.
  describe('#2165.13 — « Proches de mes meilleures références » lit les comptes marqués', () => {
    it('pose les secteurs des comptes marqués « meilleure référence »', () => {
      const preset = discoverPresets({ bestReferenceSectorCodes: ['retail'] }).find(p => p.id === 'likeReferences')!
      expect(preset.patch).toEqual({ sectors: ['retail'] })
      expect(preset.disabledReason).toBeUndefined()
    })

    it('SAIT DIRE NON — aucune référence marquée ⇒ désactivé et DIT, jamais la tranche 250-999 / 3-10 ans devinée', () => {
      const preset = discoverPresets().find(p => p.id === 'likeReferences')!
      expect(preset.patch).toEqual({})
      expect(preset.patch.headcount).toBeUndefined()
      expect(preset.patch.age).toBeUndefined()
      expect(preset.disabledReason).toBe('no_best_reference')
    })
  })

  it('« comptes qui recrutent » part du signal recrutement', () => {
    const hiring = discoverPresets().find(p => p.id === 'hiring')!
    expect(hiring.patch.signalSources).toEqual(['hiring'])
    expect(hiring.patch.sinceDays).toBe(90)
    // Un signal coché → la recherche part du signal, pas du registre.
    const request = buildDiscoverRequest({ ...emptyUnifiedFilters(), ...hiring.patch })
    expect(request?.mode).toBe('signals')
  })

  /**
   * #2616.2 — « budget déjà voté » (le commentaire du preset) décrit un
   * recrutement SPONTANÉ, privé : une administration recrute sur un cycle
   * budgétaire et un concours fixés d'avance, pas sur une décision d'achat
   * qu'un commercial peut influencer. `excludePublicEmployers` le TRANCHE au
   * niveau du preset (`applyRailConstraints`, `discover-filters.ts`), pas
   * d'un réglage visible au rail : aucun écran ne permet aujourd'hui de le
   * réactiver, et c'est assumé — voir le rapport de lot.
   */
  it('#2616.2 — « comptes qui recrutent » exclut les employeurs PUBLICS', () => {
    const hiring = discoverPresets().find(p => p.id === 'hiring')!
    expect(hiring.patch.excludePublicEmployers).toBe(true)
  })

  /**
   * #2616.2 — « comptes en transformation » (tender/award) et « qui bougent
   * actuellement » (tender/award/hiring) ciblent explicitement la commande
   * PUBLIQUE : y exclure les employeurs publics viderait le preset de son
   * sens. Seul `hiring` (recrutement SEUL, lu comme un budget privé déjà
   * voté) exclut.
   */
  it('#2616.2 — « comptes en transformation » et « qui bougent actuellement » n’excluent PAS les employeurs publics', () => {
    const transforming = discoverPresets().find(p => p.id === 'transforming')!
    const movingNow = discoverPresets().find(p => p.id === 'movingNow')!
    expect(transforming.patch.excludePublicEmployers).toBeUndefined()
    expect(movingNow.patch.excludePublicEmployers).toBeUndefined()
  })

  /**
   * #2165.15 — RÉFUTÉ en prod le 19/09 : la modale « Pistes rapides » listait
   * 9 pistes et aucune « Qui bougent actuellement » ; « Comptes en
   * transformation » ne pose QUE tender/award. Ce preset pose les TROIS
   * sources de signal que le rail sait demander (`SIGNAL_SOURCES` —
   * `legal`/`tech` sont rendus mais jamais demandables à la source, voir
   * `hasSignalOfNature`), sur la fenêtre la plus COURTE du rail (30 j,
   * `RECENCY_WINDOWS`) : le point commun des trois presets signal n'est pas la
   * nature du mouvement (déjà couverte par `hiring`/`transforming`), c'est sa
   * FRAÎCHEUR — « en ce moment », pas « ces 6 derniers mois ».
   */
  it('#2165.15 — « qui bougent actuellement » pose LES TROIS sources sur la fenêtre la plus courte', () => {
    const preset = discoverPresets().find(p => p.id === 'movingNow')!
    expect(preset.patch.signalSources).toEqual(['tender', 'award', 'hiring'])
    expect(preset.patch.sinceDays).toBe(30)
    const request = buildDiscoverRequest({ ...emptyUnifiedFilters(), ...preset.patch })
    expect(request?.mode).toBe('signals')
  })

  it('#2165.19 — « partenaires possibles » atterrit sur la liste de PARTENAIRES', () => {
    const partners = discoverPresets().find(p => p.id === 'esnPartners')!
    expect(partners.resultType).toBe('partners')
    // Et il reste ce qu'il était : la même moisson, lue côté ESN.
    expect(partners.patch.entityType).toBe('esn')
  })

  it('n’attrape pas ce qu’il ne vise pas : les presets « comptes » ne touchent pas au type', () => {
    const comptes = discoverPresets().filter(p => p.id !== 'esnPartners' && p.id !== 'decisionMakersOnExpertise')
    expect(comptes.map(p => p.resultType)).toEqual(comptes.map(() => undefined))
  })

  /**
   * #2165.18 (17/09/2026) — « Décideurs sur une expertise ». Le niveau posé
   * est celui que le produit appelle DÉJÀ « décideur » (`n1`, jamais
   * `c_level` qui est le sponsor) — vocabulaire repris, pas inventé pour ce
   * preset. L'expertise reste `any` : c'est le contrôle que le commercial
   * choisit ensuite, pas une valeur que le preset devinerait à sa place.
   */
  it('« décideurs sur une expertise » atterrit sur CONTACTS, niveau N-1, expertise laissée au choix', () => {
    const preset = discoverPresets().find(p => p.id === 'decisionMakersOnExpertise')!
    expect(preset.resultType).toBe('contacts')
    expect(preset.contactFiltersPatch?.level).toBe('n1')
    expect(preset.contactFiltersPatch?.expertise ?? 'any').toBe('any')
  })

  it('#4361.1 — « Middle market » = effectif 250 à 4 999 ET non coté, en UNE puce, sans secteur', () => {
    const preset = discoverPresets().find(p => p.id === 'middleMarket')!
    expect(preset.patch.headcount).toEqual(['250-4999'])
    expect(preset.patch.excludeListed).toBe(true)
    // L'ancienne lecture (catégorie ETI du registre) ne revient pas : la borne est l'effectif.
    expect(preset.patch.companyCategory).toBeUndefined()
    expect(preset.patch.sectors).toBeUndefined()
    const request = buildDiscoverRequest({ ...emptyUnifiedFilters(), ...preset.patch })
    expect(request?.mode).toBe('registry')
    expect(request?.mode === 'registry' && request.query.filters).toMatchObject({
      headcountMin: 250,
      headcountMax: 4999,
      excludeListed: true,
    })
  })

  it('#4361.1 — la puce est active seulement si les DEUX moitiés sont posées, et se retire d’un clic', () => {
    const on = { ...emptyUnifiedFilters(), ...MIDDLE_MARKET_PATCH }
    expect(isMiddleMarketActive(on)).toBe(true)
    expect(isMiddleMarketActive({ ...on, excludeListed: false })).toBe(false)
    expect(isMiddleMarketActive({ ...on, headcount: ['250-999'] })).toBe(false)
    const off = { ...on, ...toggleMiddleMarket(on) }
    expect(isMiddleMarketActive(off)).toBe(false)
    expect(off.headcount).toEqual([])
    expect(off.excludeListed).toBe(false)
  })

  it('#4361.1 — retirer la puce garde les AUTRES tranches cochées', () => {
    const on = { ...emptyUnifiedFilters(), ...MIDDLE_MARKET_PATCH, headcount: ['10-49' as const, '250-4999' as const] }
    expect(toggleMiddleMarket(on).headcount).toEqual(['10-49'])
  })

  it('« comptes accessibles » cible la tranche PME/ETI, sans imposer de secteur', () => {
    const accessible = discoverPresets().find(p => p.id === 'accessible')!
    expect(accessible.patch.headcount).toEqual(['50-249'])
    // Le secteur vient du profil ESN, pas d'un preset qui déciderait à la place.
    expect(accessible.patch.sectors).toBeUndefined()
    // Aucun signal coché → la recherche part du registre.
    const request = buildDiscoverRequest({ ...emptyUnifiedFilters(), ...accessible.patch })
    expect(request?.mode).toBe('registry')
  })
})

describe('territoryTrackHintKey (#4572.6)', () => {
  it('ne promet des secteurs que si le clic en pose', () => {
    expect(territoryTrackHintKey({ region: ['11'] })).toBe('trackTerritoryHintRegionOnly')
    expect(territoryTrackHintKey({ sectors: ['62'] })).toBe('trackTerritoryHintSectorsOnly')
    expect(territoryTrackHintKey({ sectors: ['62'], region: ['11'] })).toBe('trackTerritoryHint')
  })

  it('une carte qui ne pose rien ne promet ni secteur ni zone', () => {
    expect(territoryTrackHintKey({})).toBe('trackTerritoryHintNothing')
  })
})

describe('#4530.3 — une carte active se retire au re-clic (bascule)', () => {
  const preset = { patch: { region: ['11'], sectors: ['software_tech'] } }

  it('isPresetActive : vrai quand TOUT ce que le preset pose est posé, faux sinon', () => {
    const none = emptyUnifiedFilters()
    expect(isPresetActive(preset, none)).toBe(false)
    expect(isPresetActive(preset, { ...none, region: ['11'] })).toBe(false)
    expect(isPresetActive(preset, { ...none, region: ['11'], sectors: ['software_tech', 'x'] })).toBe(true)
  })

  it('withoutPreset : retire seulement les valeurs du preset, garde le reste du rail', () => {
    const filters = { ...emptyUnifiedFilters(), region: ['11', '44'], sectors: ['software_tech'], freetext: 'abc' }
    const out = withoutPreset(preset, filters)
    expect(out.region).toEqual(['44'])
    expect(out.sectors).toEqual([])
    expect(out.freetext).toBe('abc')
  })

  it('un preset sans patch n’est jamais « actif »', () => {
    expect(isPresetActive({ patch: {} }, emptyUnifiedFilters())).toBe(false)
  })
})
