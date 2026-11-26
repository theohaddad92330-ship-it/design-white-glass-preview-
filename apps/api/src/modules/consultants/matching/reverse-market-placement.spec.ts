import { placementTargetsFromCandidates, signalZonesFromProfileZones } from './reverse-market'

describe('LUD.4 — signalZonesFromProfileZones : la zone de la fiche, traduite pour la lecture des signaux', () => {
  it('un département, une région (nom, sigle ou code) et Lyon se traduisent ; le reste est NOMMÉ, jamais deviné', () => {
    const out = signalZonesFromProfileZones(['69', 'AURA', 'Bourgogne-Franche-Comté', 'PACA', 'Lyon', 'Narnia'])
    expect(out.queries).toEqual([
      { department: '69' },
      { region: '84' },
      { region: '27' },
      { region: '93' },
      { city: 'Lyon' },
    ])
    expect(out.unresolved).toEqual(['Narnia'])
  })

  it('dédoublonne et ignore les zones vides', () => {
    const out = signalZonesFromProfileZones(['aura', 'AURA', ' ', 'auvergne-rhône-alpes'])
    expect(out.queries).toEqual([{ region: '84' }])
    // « 84 » seul est un DÉPARTEMENT (Vaucluse) : un code région ne s'écrit jamais en nombre nu.
    expect(signalZonesFromProfileZones(['84']).queries).toEqual([{ department: '84' }])
  })
})

describe('LUD.4 — placementTargetsFromCandidates : des entreprises qui recrutent, offres datées, contacts connus', () => {
  const candidate = (over: Record<string, unknown>) => ({
    name: 'Acme Travaux',
    siren: '552100554',
    department: '69',
    signals: [{ type: 'hiring', label: 'Recrutement — Conducteur de travaux', date: '2026-10-10', url: 'https://x/1' }],
    ...over,
  })

  it('garde les entreprises à offre datée, joint les contacts connus, jamais une entreprise sans offre', () => {
    const out = placementTargetsFromCandidates(
      [
        candidate({}),
        candidate({
          name: 'Sans offre',
          siren: '111111111',
          signals: [{ type: 'tender', label: 'AO', date: '2026-10-01' }],
        }),
        candidate({ name: 'Offre sans date', siren: '222222222', signals: [{ type: 'hiring', label: 'x', date: '' }] }),
      ] as never,
      new Map([['552100554', [{ name: 'Jeanne Dupont', title: 'DRH' }]]]),
    )
    expect(out).toEqual([
      {
        name: 'Acme Travaux',
        siren: '552100554',
        department: '69',
        offers: [{ label: 'Recrutement — Conducteur de travaux', date: '2026-10-10', url: 'https://x/1' }],
        knownContacts: [{ name: 'Jeanne Dupont', title: 'DRH' }],
      },
    ])
  })

  it('sans contact connu : liste vide, rien d’inventé', () => {
    const [only] = placementTargetsFromCandidates([candidate({})] as never, new Map())
    expect(only.knownContacts).toEqual([])
  })
})
