import {
  demandFromSnapshot,
  departmentsFromZones,
  rankRecruiters,
  recruiterKey,
  reverseMarketUnavailability,
  type MarketSnapshot,
} from './reverse-market'

const SNAPSHOT: MarketSnapshot = {
  department: '44',
  takenOn: '2026-08-24',
  offers: 412,
  topTechnologies: [
    { term: 'Java', count: 88 },
    { term: 'Kubernetes', count: 51 },
    { term: 'SAP', count: 33 },
    { term: 'Kafka', count: 21 },
  ],
  esnHiring: [
    { name: 'Atlas Consulting', offers: 14 },
    { name: 'Nordiq', offers: 31 },
    { name: 'Cap Sud', offers: 6 },
  ],
}

describe('departmentsFromZones — rien n’est deviné', () => {
  it('relie une zone qui DÉSIGNE un département relevé', () => {
    expect(departmentsFromZones(['44', '31'], ['31', '44', '69'])).toEqual({
      departments: ['31', '44'],
      unresolved: [],
    })
  })

  it('NOMME la zone qu’on ne sait pas relier plutôt que de la taire', () => {
    // « IDF » n'est pas un département. Le deviner en huit codes fabriquerait
    // huit territoires que personne n'a saisis.
    expect(departmentsFromZones(['IDF', 'remote', '69'], ['31', '69'])).toEqual({
      departments: ['69'],
      unresolved: ['IDF', 'remote'],
    })
  })

  it('ne s’arrête ni à la casse ni aux espaces, et ne double aucune entrée', () => {
    expect(departmentsFromZones([' 2A ', '2a', '', '   '], ['2A'])).toEqual({ departments: ['2A'], unresolved: [] })
  })
})

describe('reverseMarketUnavailability — ce qu’on ne regarde pas, et pourquoi', () => {
  it('sans zone sur la fiche, on ne sait pas quel territoire lire', () => {
    expect(reverseMarketUnavailability([], [], ['java'], 1)).toBe('zones_missing')
  })

  it('sans compétence, il n’y a rien à croiser avec la demande', () => {
    expect(reverseMarketUnavailability(['44'], ['44'], [], 1)).toBe('skills_missing')
  })

  it('des zones qui ne désignent aucun territoire relevé se DISENT', () => {
    // Rendre une liste vide ici ferait croire à un marché calme ; c'est la
    // fiche qu'il faut corriger, et l'écran doit le dire.
    expect(reverseMarketUnavailability(['IDF'], [], ['java'], 4)).toBe('zones_unresolved')
  })

  it('sans relevé, on ne conclut pas — « rien relevé » n’est pas « zéro offre »', () => {
    expect(reverseMarketUnavailability(['44'], ['44'], ['java'], 0)).toBe('no_snapshot')
  })

  it('rend `null` quand la lecture a pu se faire, même si elle ne trouve rien', () => {
    expect(reverseMarketUnavailability(['44'], ['44'], ['java'], 3)).toBeNull()
  })

  it('nomme la zone manquante AVANT la compétence : c’est elle qui choisit la source', () => {
    expect(reverseMarketUnavailability([], [], [], 0)).toBe('zones_missing')
  })
})

describe('demandFromSnapshot — le marché public, croisé avec la fiche', () => {
  it('ne retient que les technologies qui sont AUSSI sur la fiche', () => {
    const demand = demandFromSnapshot(SNAPSHOT, ['java', 'kafka', 'cobol'])
    expect(demand.matchedTechnologies).toEqual([
      { term: 'Java', count: 88 },
      { term: 'Kafka', count: 21 },
    ])
    // Le total classé situe le compte : « 2 sur 4 », pas « 2 » tout court.
    expect(demand.technologiesRanked).toBe(4)
  })

  it('rapproche sans se soucier de la casse ni des accents', () => {
    const snapshot: MarketSnapshot = { ...SNAPSHOT, topTechnologies: [{ term: 'Réseau', count: 9 }] }
    expect(demandFromSnapshot(snapshot, ['reseau']).matchedTechnologies).toEqual([{ term: 'Réseau', count: 9 }])
  })

  it('porte la DATE du relevé et le département — une offre publique se date', () => {
    const demand = demandFromSnapshot(SNAPSHOT, ['java'])
    expect(demand.observedOn).toBe('2026-08-24')
    expect(demand.department).toBe('44')
  })

  it('garde `null` quand la source publique n’a rien rendu', () => {
    // ⚠️ Jamais `0` : « zéro offre » se lirait « ce département est mort », et
    // c'est le contraire de « la source n'a pas répondu cette semaine-là ».
    const demand = demandFromSnapshot({ ...SNAPSHOT, offers: null }, ['java'])
    expect(demand.offers).toBeNull()
  })

  it('rend une liste VIDE plutôt qu’un rapprochement approximatif', () => {
    expect(demandFromSnapshot(SNAPSHOT, ['cobol']).matchedTechnologies).toEqual([])
  })
})

describe('rankRecruiters — le second marché', () => {
  // L'habitude est per-ESN ET per-département : comparer un volume corrézien à
  // une moyenne francilienne annoncerait un effondrement qui n'existe pas.
  const baselines = new Map([[recruiterKey('Nordiq', '44'), 12]])
  const declared = new Map([['nordiq', true]])

  it('classe par volume décroissant, puis par nom', () => {
    const ranked = rankRecruiters([SNAPSHOT], baselines, declared)
    expect(ranked.map(esn => esn.name)).toEqual(['Nordiq', 'Atlas Consulting', 'Cap Sud'])
  })

  it('porte l’habitude quand on l’a, et `null` quand on ne l’a pas', () => {
    const ranked = rankRecruiters([SNAPSHOT], baselines, declared)
    expect(ranked[0]).toMatchObject({ name: 'Nordiq', offers: 31, baseline: 12, openToSubcontracting: true })
    // Sans assez de relevés, l'habitude est INCONNUE : on ne compare pas à zéro.
    expect(ranked[1]).toMatchObject({ name: 'Atlas Consulting', baseline: null, openToSubcontracting: null })
  })

  it('date chaque ligne du relevé dont elle sort', () => {
    expect(rankRecruiters([SNAPSHOT], baselines, declared)[0].observedOn).toBe('2026-08-24')
  })

  it('garde le relevé le plus RÉCENT quand une ESN recrute sur deux zones', () => {
    const older: MarketSnapshot = {
      ...SNAPSHOT,
      department: '35',
      takenOn: '2026-08-17',
      esnHiring: [{ name: 'Nordiq', offers: 99 }],
    }
    const ranked = rankRecruiters([SNAPSHOT, older], baselines, declared)
    const nordiq = ranked.filter(esn => esn.name === 'Nordiq')
    // Deux territoires distincts sont deux faits distincts — ils ne se somment
    // pas, et le plus gros volume ne masque pas l'autre zone.
    expect(nordiq).toHaveLength(2)
    expect(nordiq.map(esn => esn.department)).toEqual(['35', '44'])
    // L'habitude du 44 ne déborde PAS sur le 35, où on ne l'a pas mesurée.
    expect(nordiq.find(esn => esn.department === '35')?.baseline).toBeNull()
    expect(nordiq.find(esn => esn.department === '44')?.baseline).toBe(12)
  })

  it('ignore une ligne sans nom plutôt que d’afficher une ESN anonyme', () => {
    const dirty: MarketSnapshot = { ...SNAPSHOT, esnHiring: [{ name: '  ', offers: 4 }] }
    expect(rankRecruiters([dirty], baselines, declared)).toEqual([])
  })

  it('borne la liste à ce qu’on peut lire', () => {
    const many: MarketSnapshot = {
      ...SNAPSHOT,
      esnHiring: Array.from({ length: 25 }, (_, index) => ({ name: `ESN ${index}`, offers: 25 - index })),
    }
    expect(rankRecruiters([many], baselines, declared)).toHaveLength(10)
  })

  /**
   * #2035.10 — la borne devient un réglage d'espace
   * (`WorkspaceReverseMarketSettingsService.maxRecruitersShownFor`), pas un littéral.
   * `rankRecruiters` reste pur : APPELÉ avec la valeur déjà résolue, jamais
   * lu depuis une base — le 4e paramètre est optionnel et garde le défaut
   * précédent quand l'appelant n'en passe pas.
   */
  it('#2035.10 — un 4e paramètre optionnel borne la liste à une valeur d’espace', () => {
    const many: MarketSnapshot = {
      ...SNAPSHOT,
      esnHiring: Array.from({ length: 25 }, (_, index) => ({ name: `ESN ${index}`, offers: 25 - index })),
    }
    expect(rankRecruiters([many], baselines, declared, 3)).toHaveLength(3)
    // Absent : le comportement d'avant ce lot, à l'octet près.
    expect(rankRecruiters([many], baselines, declared)).toHaveLength(10)
  })
})
