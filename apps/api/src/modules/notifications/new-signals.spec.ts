import { buildNewSignalBody, collectSignals, selectNewSignals, signalIdentityKeys } from './new-signals'

// #3920 — dates RELATIVES, calculées une fois (jamais de date en dur qui expire).
const NOW = new Date('2026-10-08T10:00:00.000Z')
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10)

const fresh = (snapshot: object, seen: ReadonlySet<string> = new Set()) =>
  selectNewSignals(collectSignals(snapshot), seen, NOW)

describe('new-signals (#3920)', () => {
  it('nomme le fait via le champ canonique `signal`, avec sa date', () => {
    const list = fresh({ recent_signals: [{ signal: 'Levée de fonds 50M€', date: daysAgo(2) }] })
    expect(buildNewSignalBody(list)).toBe(`Levée de fonds 50M€ (${daysAgo(2).split('-').reverse().join('/')})`)
  })

  it('un signal sans date ne déclenche jamais d’alerte', () => {
    expect(fresh({ recent_signals: [{ signal: 'Sans date' }] })).toEqual([])
    expect(fresh({ recent_signals: [{ signal: 'Date illisible', date: 'bientôt' }] })).toEqual([])
  })

  it('ignore un signal de plus de 30 jours, garde celui de 29 jours', () => {
    expect(fresh({ recent_signals: [{ signal: 'Vieux', date: daysAgo(31) }] })).toEqual([])
    expect(fresh({ recent_signals: [{ signal: 'Limite', date: daysAgo(29) }] })).toHaveLength(1)
  })

  it('ignore un signal classé archive', () => {
    expect(fresh({ recent_signals: [{ signal: 'Archivé', date: daysAgo(1), freshness: 'archive' }] })).toEqual([])
  })

  it('ne re-déclenche pas un signal déjà vu dans l’analyse précédente (même texte normalisé + date)', () => {
    const before = { raw_analysis: { recent_signals: [{ signal: 'Levée de fonds', date: daysAgo(3) }] } }
    const seen = signalIdentityKeys(before)
    const after = {
      recent_signals: [
        { signal: '  levée DE fonds ', date: daysAgo(3) },
        { signal: 'Nouveau DSI', date: daysAgo(1) },
      ],
    }
    const list = fresh(after, seen)
    expect(list.map(c => c.label)).toEqual(['Nouveau DSI'])
  })

  it('plusieurs signaux : le plus récent + « et N autres »', () => {
    const list = fresh({
      recent_signals: [
        { signal: 'A', date: daysAgo(10) },
        { signal: 'B', date: daysAgo(1) },
        { signal: 'C', date: daysAgo(5) },
      ],
    })
    const body = buildNewSignalBody(list) ?? ''
    expect(body.startsWith('B (')).toBe(true)
    expect(body.endsWith('— et 2 autres')).toBe(true)
    expect(body).not.toMatch(/signaux détectés/)
  })

  it('tronque proprement un libellé trop long', () => {
    const body = buildNewSignalBody(fresh({ recent_signals: [{ signal: 'x'.repeat(400), date: daysAgo(1) }] })) ?? ''
    expect(body).toContain('…')
    expect(body.length).toBeLessThan(200)
  })

  it('aucun fait nommable → pas de corps', () => {
    expect(buildNewSignalBody([])).toBeNull()
  })

  describe('signaux structurés (offre / appel d’offres / annonce légale)', () => {
    const raw = {
      it_job_signals: [{ title: 'Architecte cloud', date: daysAgo(4), url: 'https://emploi/1' }],
      public_tenders: [
        { title: 'Refonte SI', buyer: 'Ville de X', published_date: daysAgo(6), url: 'https://boamp/x' },
      ],
      legal_signals: [{ type: 'Modification', label: 'ACME SAS', date: daysAgo(2) }],
    }

    it('les relève tous, avec leur type', () => {
      const kinds = fresh({ raw_analysis: raw })
        .map(c => c.kind)
        .sort()
      expect(kinds).toEqual(['job', 'legal', 'tender'])
    })

    it('ne compte pas comme neufs ceux déjà présents avant (même identité), seulement les nouveaux', () => {
      const seen = signalIdentityKeys({ raw_analysis: raw })
      expect(fresh({ raw_analysis: raw }, seen)).toEqual([])
      const grown = {
        raw_analysis: {
          ...raw,
          it_job_signals: [...raw.it_job_signals, { title: 'DevOps', date: daysAgo(1), url: 'https://emploi/2' }],
        },
      }
      expect(fresh(grown, seen).map(c => c.label)).toEqual(['DevOps'])
    })

    it('l’identité d’une offre suit l’URL : un titre reformulé ne la rend pas neuve', () => {
      const seen = signalIdentityKeys({ raw_analysis: raw })
      const reworded = {
        raw_analysis: {
          ...raw,
          it_job_signals: [{ title: 'Architecte Cloud (H/F)', date: daysAgo(4), url: 'https://emploi/1' }],
        },
      }
      expect(fresh(reworded, seen).filter(c => c.kind === 'job')).toEqual([])
    })

    it('lit aussi les clés camelCase de l’IA', () => {
      const list = fresh({ raw_analysis: { itJobSignals: [{ title: 'SRE', date: daysAgo(2) }] } })
      expect(list.map(c => c.kind)).toEqual(['job'])
    })
  })

  it('#4044 — une offre de stage ne déclenche jamais d’alerte (liste des offres ET signaux de recrutement)', () => {
    const list = fresh({
      recent_signals: [
        { signal: 'Stage BAC1 Opérateur de Production', type: 'recrutement', date: daysAgo(1) },
        { signal: 'Nouveau DSI', date: daysAgo(1) },
      ],
      raw_analysis: {
        it_job_signals: [
          { title: 'CS27 - Bac 5 - Stage Supply Chain H/F', date: daysAgo(1), url: 'https://example.test/1' },
          { title: 'Architecte cloud', date: daysAgo(1), url: 'https://example.test/2' },
        ],
      },
    })
    expect(list.map(c => c.label).sort()).toEqual(['Architecte cloud', 'Nouveau DSI'])
  })

  describe('#3920.k — la veille : toutes les sources, sans fenêtre de 30 jours', () => {
    const veille = (after: object, before: object = {}) =>
      selectNewSignals(collectSignals(after), signalIdentityKeys(before), NOW, null)

    it('une ligne de registre neuve est un signal neuf, avec son lien ; déjà vue = jamais', () => {
      const row = { label: 'Procédures collectives', source: 'BODACC', date: daysAgo(3), url: 'https://bodacc/A1' }
      const fresh1 = veille({ registry_items: [row] })
      expect(fresh1.map(c => c.url)).toEqual(['https://bodacc/A1'])
      expect(veille({ registry_items: [row] }, { registry_items: [row] })).toEqual([])
    })

    it('presse, marchés attribués et événements du registre comptent aussi', () => {
      const raw = {
        press_signals: [{ title: 'Article', date: daysAgo(2) }],
        awarded_contracts: [{ title: 'Marché X', date: daysAgo(2) }],
        company_events: [{ type: 'Ouverture', date: daysAgo(2) }],
      }
      expect(veille({ raw_analysis: raw })).toHaveLength(3)
      expect(veille({ raw_analysis: raw }, { raw_analysis: raw })).toEqual([])
    })

    it('un fait de 5 mois reste nouveau pour la veille, un fait de 3 ans est périmé, un fait sans date jamais', () => {
      expect(veille({ recent_signals: [{ signal: 'Ancien mais neuf', date: daysAgo(150) }] })).toHaveLength(1)
      expect(veille({ recent_signals: [{ signal: 'Périmé', date: daysAgo(1100) }] })).toEqual([])
      expect(veille({ recent_signals: [{ signal: 'Sans date' }] })).toEqual([])
    })
  })
})
