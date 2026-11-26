import { beforeAll, describe, expect, it } from 'vitest'
import { loadCommuneCoordinates } from '@/lib/zones/commune-coordinates'
import type { DiscoverCandidate, SignalSource } from './discover-types'
import {
  activeFiltersSummary,
  applyRailConstraints,
  buildDiscoverRequest,
  buildPartnerCoverageIndex,
  buildPartnerRelationIndex,
  buildRelationChipImpacts,
  contractRecourseImpact,
  countActiveFilters,
  detectInconsistentFilters,
  emptyUnifiedFilters,
  hasIntentSignals,
  isCapitalIncreaseOnly,
  isExistingRelationshipUnknown,
  isExpertiseUnknown,
  isObservedClientsUnknown,
  isRank2OpeningUnknown,
  isUnifiedRunnable,
  skillsText,
  withSkills,
  parseHeadcountLabel,
  passesExistingRelationship,
  passesExpertiseKnown,
  passesFit,
  passesMinAccountsSeen,
  buildDeclaredRank2Index,
  passesObservedClients,
  passesRank2Opening,
  primaryMode,
  rank2StatusFor,
  matchedSearchCriteria,
  skillCitationFirst,
  discoverOriginCriteriaFor,
  signalsPart,
  suggestedWidenAxis,
  widenZoneOneStep,
  type UnifiedFilters,
} from './discover-filters'
import { buildSignalsQuery, emptySignalsFilters } from './discover-query'

const NOW = Date.parse('2026-07-19T12:00:00Z')

function unified(over: Partial<UnifiedFilters> = {}): UnifiedFilters {
  return { ...emptyUnifiedFilters(), ...over }
}

// #5069 — le rayon lit le référentiel des communes, chargé à la demande : les tests l'attendent une fois.
beforeAll(async () => {
  await loadCommuneCoordinates()
})

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 50,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

/* ------------------------------------------------------------------ */
/*  Source primaire : le signal prime dès qu'une intention est cochée   */
/* ------------------------------------------------------------------ */

describe('primaryMode / hasIntentSignals', () => {
  it('reste sur le registre tant qu’aucun signal d’intention n’est coché', () => {
    expect(hasIntentSignals(unified({ sectors: ['software_tech'] }))).toBe(false)
    expect(primaryMode(unified({ sectors: ['software_tech'] }))).toBe('registry')
  })

  it('bascule sur le signal dès qu’une intention est cochée — même avec une cible', () => {
    const filters = unified({ sectors: ['software_tech'], signalSources: ['hiring'] })
    expect(hasIntentSignals(filters)).toBe(true)
    expect(primaryMode(filters)).toBe('signals')
  })
})

describe('buildDiscoverRequest', () => {
  it('reste idle (null) tant que le registre n’a aucun critère', () => {
    expect(buildDiscoverRequest(emptyUnifiedFilters())).toBeNull()
  })

  it('construit une requête registre : les secteurs croisés partent en CODES NAF', () => {
    // Le secteur ne voyage plus sous son nom — le backend le traduisait en une
    // SECTION NAF entière. Il part en codes de classe, que le registre accepte
    // en une seule requête (mesuré : `30.30Z,29.10Z` → 745 + 678).
    const request = buildDiscoverRequest(unified({ sectors: ['aerospace', 'defense'] }), NOW)
    expect(request?.mode).toBe('registry')
    expect(request?.mode === 'registry' && request.query.filters.sectors).toBeUndefined()
    expect(request?.mode === 'registry' && request.query.filters.nafCode).toBe('30.30Z,25.40Z,30.40Z')
  })

  it('construit une requête signaux — lançable même sans autre critère', () => {
    const request = buildDiscoverRequest(unified({ signalSources: ['tender'] }))
    expect(request?.mode).toBe('signals')
    expect(request?.mode === 'signals' && request.query.sources).toEqual(['tender'])
  })
})

describe('isUnifiedRunnable', () => {
  // #4317 — le champ « Mots-clés » seul (un texte venu d'un historique, d'une
  // recherche enregistrée) lançait rien : le bouton restait désactivé.
  it('#4317 — « Mots-clés » seul lance la recherche, comme « Compétences »', () => {
    expect(isUnifiedRunnable(unified({ keywords: 'SAP', technologiesObserved: '' }))).toBe(true)
    expect(buildDiscoverRequest(unified({ keywords: 'SAP', technologiesObserved: '' }))?.mode).toBe('registry')
  })

  it('refuse un rail vide', () => {
    expect(isUnifiedRunnable(emptyUnifiedFilters())).toBe(false)
  })
  it('accepte dès qu’un secteur OU un signal d’intention est posé', () => {
    expect(isUnifiedRunnable(unified({ sectors: ['aerospace'] }))).toBe(true)
    expect(isUnifiedRunnable(unified({ signalSources: ['hiring'] }))).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/*  parseHeadcountLabel                                                */
/* ------------------------------------------------------------------ */

describe('parseHeadcountLabel', () => {
  it('lit les bornes d’un libellé de tranche', () => {
    expect(parseHeadcountLabel('100 à 199 salariés')).toEqual([100, 199])
  })
  it('rend une borne haute ouverte pour « et plus » / « + »', () => {
    expect(parseHeadcountLabel('10 000 salariés et plus')).toEqual([10000, Infinity])
    expect(parseHeadcountLabel('200+ salariés')).toEqual([200, Infinity])
  })
  it('rend null quand le libellé ne porte aucun nombre', () => {
    expect(parseHeadcountLabel(null)).toBeNull()
    expect(parseHeadcountLabel('Unités non employeuses')).toBeNull()
  })

  // #3814 — recette prod 08/10 : le tri « Taille (effectif) » n'était pas
  // monotone (4 999 avant 10 000+). La borne BASSE est désormais le PREMIER
  // nombre du libellé — celui que « X à Y salariés » / « X salariés et plus »
  // publient TOUJOURS en premier — plutôt que le PLUS PETIT nombre trouvé
  // n'importe où dans le texte : un `Math.min` aveugle sur tout chiffre du
  // libellé (une note, une parenthèse, un second compte) ferait lire une
  // tranche de 10 000+ comme une poignée de salariés si un petit nombre
  // traînait ailleurs dans le texte.
  it("la borne basse est le PREMIER nombre, jamais le plus petit trouvé n'importe où", () => {
    expect(parseHeadcountLabel('10 000 salariés et plus (code 53)')).toEqual([10000, Infinity])
    expect(parseHeadcountLabel('2 000 à 4 999 salariés (code 51)')).toEqual([2000, 4999])
  })
})

/* ------------------------------------------------------------------ */
/*  passesFit — affinage côté écran sur le score déjà calculé          */
/* ------------------------------------------------------------------ */

describe('passesFit', () => {
  const high = candidate({ score: 80, scoreMax: 100, scoreUnmeasured: [] })
  const medium = candidate({ score: 50, scoreMax: 100, scoreUnmeasured: [] })
  const low = candidate({ score: 20, scoreMax: 100, scoreUnmeasured: [] })
  const unmeasured = candidate({ score: null, scoreMax: null, scoreUnmeasured: ['activity', 'geography'] })

  it('« tous » accepte tout, y compris un fit non mesurable', () => {
    for (const c of [high, medium, low, unmeasured]) expect(passesFit(c, 'any')).toBe(true)
  })

  it('« fit élevé » ne garde que le palier élevé', () => {
    expect(passesFit(high, 'high')).toBe(true)
    expect(passesFit(medium, 'high')).toBe(false)
    expect(passesFit(unmeasured, 'high')).toBe(false)
  })

  it('« fit moyen ou élevé » exclut le faible et le non mesurable', () => {
    expect(passesFit(high, 'medium')).toBe(true)
    expect(passesFit(medium, 'medium')).toBe(true)
    expect(passesFit(low, 'medium')).toBe(false)
    expect(passesFit(unmeasured, 'medium')).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  applyRailConstraints — croisement côté écran (mode Signaux)         */
/* ------------------------------------------------------------------ */

describe('applyRailConstraints', () => {
  // #3941.5 (R41) — « Augmentation de capital » activé rendait 10 cartes SANS signal capital daté, sans un mot.
  it('SAIT DIRE NON puis OUI : « Augmentation de capital » seul ne garde que les comptes portant le signal daté', () => {
    const withSignal = candidate({
      siren: '1',
      signals: [{ type: 'business', label: 'Augmentation de capital', date: '2026-10-01' }],
    })
    const without = candidate({ siren: '2', signals: [] })
    const other = candidate({ siren: '3', signals: [{ type: 'hiring', label: '5 postes data', date: '2026-10-02' }] })
    const filters = unified({ signalSources: ['capital'] })
    expect(applyRailConstraints([withSignal, without, other], filters, 'signals', NOW).map(c => c.siren)).toEqual(['1'])
    expect(applyRailConstraints([withSignal, without, other], filters, 'registry', NOW).map(c => c.siren)).toEqual([
      '1',
    ])
    // avec une autre source cochée, un compte peut répondre par elle : rien n'est écarté ici.
    const mixed = unified({ signalSources: ['capital', 'hiring'] })
    expect(applyRailConstraints([withSignal, without, other], mixed, 'signals', NOW)).toHaveLength(3)
    expect(isCapitalIncreaseOnly(filters)).toBe(true)
    expect(isCapitalIncreaseOnly(mixed)).toBe(false)
  })

  // #4732.1 (recette prod 01/11) — « Rachat ou fusion » : critère qui se coche ; seul coché, il ne garde que les
  // comptes portant le signal daté (jamais dix cartes sans rien).
  it('#4732.1 — « Rachat ou fusion » seul ne garde que les comptes portant le signal daté', () => {
    const withDeal = candidate({
      siren: '1',
      signals: [{ type: 'business', label: 'Rachat ou fusion', date: '2026-10-01' }],
    })
    const without = candidate({ siren: '2', signals: [] })
    const capital = candidate({
      siren: '3',
      signals: [{ type: 'business', label: 'Augmentation de capital', date: '2026-10-02' }],
    })
    const filters = unified({ signalSources: ['deal'] })
    expect(applyRailConstraints([withDeal, without, capital], filters, 'signals', NOW).map(c => c.siren)).toEqual(['1'])
    const mixed = unified({ signalSources: ['deal', 'hiring'] })
    expect(applyRailConstraints([withDeal, without, capital], mixed, 'signals', NOW)).toHaveLength(3)
  })

  it('ne retouche PAS la liste en mode Registre (le backend a déjà croisé)', () => {
    const list = [candidate({ siren: '1', nafCode: '10.11Z' })] // agroalimentaire, hors « software_tech »
    expect(applyRailConstraints(list, unified({ sectors: ['software_tech'] }), 'registry', NOW)).toHaveLength(1)
  })

  it('croise le secteur en mode Signaux, sur le code NAF réel du candidat', () => {
    const tech = candidate({ siren: '1', nafCode: '62.02A' }) // conseil en systèmes
    const finance = candidate({ siren: '2', nafCode: '64.19Z' }) // banque de détail
    const unknown = candidate({ siren: '3', nafCode: null }) // NAF absent → gardé, jamais écarté sur une absence
    const out = applyRailConstraints([tech, finance, unknown], unified({ sectors: ['software_tech'] }), 'signals', NOW)
    expect(out.map(c => c.siren)).toEqual(['1', '3'])
  })

  /**
   * #1766 — le CODE NAF saisi à la main était mort en mode Signaux : ni envoyé
   * (le serveur ne l'accepte pas), ni croisé ici. L'utilisateur tapait
   * « 62.01Z » et il ne se passait rien, sans un mot.
   */
  describe('code NAF saisi à la main (#1766)', () => {
    it('croise le code saisi sur le NAF réel du candidat, par PRÉFIXE', () => {
      // Le registre écrit « 6201 », l'utilisateur tape « 62.01Z » : une
      // comparaison littérale raterait les deux.
      const match = candidate({ siren: '1', nafCode: '62.01Z' })
      const other = candidate({ siren: '2', nafCode: '43.21A' })
      const unknown = candidate({ siren: '3', nafCode: null })
      const out = applyRailConstraints([match, other, unknown], unified({ nafCode: '62.01Z' }), 'signals', NOW)
      expect(out.map(c => c.siren)).toEqual(['1', '3'])
    })

    it('accepte un code TRONQUÉ — « 62 » garde toute la division', () => {
      const consulting = candidate({ siren: '1', nafCode: '62.02A' })
      const building = candidate({ siren: '2', nafCode: '43.21A' })
      const out = applyRailConstraints([consulting, building], unified({ nafCode: '62' }), 'signals', NOW)
      expect(out.map(c => c.siren)).toEqual(['1'])
    })

    it('UNIT le code saisi et les secteurs cochés — comme le registre, jamais leur intersection', () => {
      // `buildRegistryQuery` joint les deux par un OU (« deux façons de dire :
      // ce terrain m'intéresse »). Croiser en ET ferait dire deux choses
      // différentes au même formulaire selon le mode.
      const tech = candidate({ siren: '1', nafCode: '62.02A' })
      const aero = candidate({ siren: '2', nafCode: '30.30Z' })
      const bank = candidate({ siren: '3', nafCode: '64.19Z' })
      const out = applyRailConstraints(
        [tech, aero, bank],
        unified({ sectors: ['software_tech'], nafCode: '30.30Z' }),
        'signals',
        NOW,
      )
      expect(out.map(c => c.siren)).toEqual(['1', '2'])
    })

    it('un jeton sans chiffre ne contraint RIEN plutôt que de tout écarter', () => {
      const list = [candidate({ siren: '1', nafCode: '62.02A' }), candidate({ siren: '2', nafCode: '43.21A' })]
      expect(applyRailConstraints(list, unified({ nafCode: '  ,; ' }), 'signals', NOW)).toHaveLength(2)
    })
  })

  it('croise l’effectif en mode Signaux, sans écarter une donnée absente', () => {
    const big = candidate({ siren: '1', headcountRange: '100 à 199 salariés' })
    const tiny = candidate({ siren: '2', headcountRange: '1 à 2 salariés' })
    const unknown = candidate({ siren: '3', headcountRange: null })
    const out = applyRailConstraints([big, tiny, unknown], unified({ headcount: ['50-249'] }), 'signals', NOW)
    expect(out.map(c => c.siren)).toEqual(['1', '3'])
  })

  /**
   * #3908 — plusieurs tranches cochées ensemble forment une UNION, jamais
   * l'intervalle enveloppe : « 10-49 » + « 250-999 » doit garder les deux
   * bornes et écarter la tranche intermédiaire (50-249) jamais cochée.
   */
  it('croise l’effectif sur l’UNION de plusieurs tranches, jamais leur enveloppe', () => {
    const small = candidate({ siren: '1', headcountRange: '10 à 19 salariés' })
    const middle = candidate({ siren: '2', headcountRange: '100 à 199 salariés' })
    const big = candidate({ siren: '3', headcountRange: '250 à 499 salariés' })
    const out = applyRailConstraints([small, middle, big], unified({ headcount: ['10-49', '250-999'] }), 'signals', NOW)
    expect(out.map(c => c.siren)).toEqual(['1', '3'])
  })

  it('croise l’ancienneté en mode Signaux, sans écarter une date absente', () => {
    const old = candidate({ siren: '1', creationDate: '2005-03-14' })
    const young = candidate({ siren: '2', creationDate: '2025-01-10' })
    const unknown = candidate({ siren: '3', creationDate: null })
    const out = applyRailConstraints([old, young, unknown], unified({ age: 'gt10' }), 'signals', NOW)
    expect(out.map(c => c.siren)).toEqual(['1', '3'])
  })

  /**
   * #2151.30 — le territoire ESN/partenaire n'honorait qu'UN département en
   * mode Signaux (`parseDepartment`, singulier, envoyé au collecteur) : un
   * commercial qui tapait « 75, 69 » perdait silencieusement Lyon. Le candidat
   * de signal porte déjà son département réel — on croise ici sur TOUS ceux
   * saisis, jamais un seul, sans jamais écarter une absence.
   */
  it('croise le territoire en mode Signaux sur PLUSIEURS départements', () => {
    const paris = candidate({ siren: '1', department: '75' })
    const lyon = candidate({ siren: '2', department: '69' })
    const marseille = candidate({ siren: '3', department: '13' })
    const unknown = candidate({ siren: '4', department: null })
    const out = applyRailConstraints(
      [paris, lyon, marseille, unknown],
      unified({ department: '75, 69' }),
      'signals',
      NOW,
    )
    expect(out.map(c => c.siren)).toEqual(['1', '2', '4'])
  })

  it('cumule plusieurs contraintes croisées', () => {
    const match = candidate({ siren: '1', nafCode: '62.02A', headcountRange: '100 à 199 salariés' })
    const wrongSector = candidate({ siren: '2', nafCode: '64.19Z', headcountRange: '100 à 199 salariés' })
    const wrongSize = candidate({ siren: '3', nafCode: '62.02A', headcountRange: '1 à 2 salariés' })
    const out = applyRailConstraints(
      [match, wrongSector, wrongSize],
      unified({ sectors: ['software_tech'], headcount: ['50-249'] }),
      'signals',
      NOW,
    )
    expect(out.map(c => c.siren)).toEqual(['1'])
  })

  /**
   * #2165.27 — Exclusions. Aucune source (registre ou signal) n'exprime un
   * critère négatif : le croisement se fait donc ICI, sur le NAF réel du
   * candidat, DANS LES DEUX MODES — contrairement aux autres contraintes de ce
   * bloc, qui ne s'appliquent qu'en mode Signaux parce que le registre les a
   * déjà honorées nativement. Une exclusion n'est jamais honorée nativement
   * nulle part : elle se croise toujours.
   */
  describe('secteurs EXCLUS (#2165.27)', () => {
    it('écarte un candidat du secteur exclu, MÊME en mode Registre', () => {
      const tech = candidate({ siren: '1', nafCode: '62.02A' })
      const finance = candidate({ siren: '2', nafCode: '64.19Z' })
      const out = applyRailConstraints([tech, finance], unified({ excludeSectors: ['software_tech'] }), 'registry', NOW)
      expect(out.map(c => c.siren)).toEqual(['2'])
    })

    it('écarte aussi en mode Signaux, en plus des autres contraintes', () => {
      const tech = candidate({ siren: '1', nafCode: '62.02A' })
      const finance = candidate({ siren: '2', nafCode: '64.19Z' })
      const out = applyRailConstraints([tech, finance], unified({ excludeSectors: ['software_tech'] }), 'signals', NOW)
      expect(out.map(c => c.siren)).toEqual(['2'])
    })

    it('ne PEUT PAS exclure sur une donnée absente — un NAF inconnu n’est pas AFFIRMÉ hors du secteur exclu, il reste', () => {
      const unknown = candidate({ siren: '1', nafCode: null })
      const out = applyRailConstraints([unknown], unified({ excludeSectors: ['software_tech'] }), 'registry', NOW)
      expect(out.map(c => c.siren)).toEqual(['1'])
    })

    it('sans exclusion, rien ne change (le champ vide n’est pas contraignant)', () => {
      const list = [candidate({ siren: '1', nafCode: '62.02A' })]
      expect(applyRailConstraints(list, unified(), 'registry', NOW)).toHaveLength(1)
    })
  })

  /**
   * #2616.2 — RÉFUTÉ en recette le 21/09 : une recette avait relevé 17
   * entreprises privées sur 17 dans le préréglage « comptes qui recrutent » et
   * conclu que le filtre marchait — un hasard du corpus recetté, jamais une
   * exclusion réelle. L'audit de code était formel : `is_public_employer`
   * (IA) et son appelant (`discover_signals.py`) se contentaient
   * d'ÉTIQUETER `signal.publicEmployer`, sans qu'aucune ligne ne l'exclue, et
   * la clé n'était même pas lue côté web (0 résultat de grep). Le test
   * décisif ici est donc CELUI QUI DEVRAIT ÊTRE EXCLU — reproduire l'erreur
   * de la recette (un corpus déjà privé) ne prouverait rien.
   */
  describe('employeurs PUBLICS exclus (#2616.2)', () => {
    it('écarte un candidat dont un signal de recrutement confirme un employeur PUBLIC', () => {
      const publicOne = candidate({
        siren: '1',
        signals: [{ type: 'hiring', label: '5 postes ouverts', date: '2026-07-01', publicEmployer: true }],
      })
      const privateOne = candidate({
        siren: '2',
        signals: [{ type: 'hiring', label: '3 postes ouverts', date: '2026-07-01', publicEmployer: false }],
      })
      const out = applyRailConstraints(
        [publicOne, privateOne],
        unified({ excludePublicEmployers: true }),
        'signals',
        NOW,
      )
      expect(out.map(c => c.siren)).toEqual(['2'])
    })

    it('ne PEUT PAS exclure sur une donnée absente — un signal muet sur ce point n’est pas AFFIRMÉ public, il reste (GA-18/19)', () => {
      const unknown = candidate({
        siren: '1',
        signals: [{ type: 'hiring', label: '2 postes ouverts', date: '2026-07-01' }],
      })
      const out = applyRailConstraints([unknown], unified({ excludePublicEmployers: true }), 'signals', NOW)
      expect(out.map(c => c.siren)).toEqual(['1'])
    })

    it('sans exclusion demandée, rien ne change — même un employeur public confirmé reste', () => {
      const list = [
        candidate({
          siren: '1',
          signals: [{ type: 'hiring', label: '5 postes ouverts', date: '2026-07-01', publicEmployer: true }],
        }),
      ]
      expect(applyRailConstraints(list, unified(), 'signals', NOW)).toHaveLength(1)
    })

    it('écarte MÊME en mode Registre, comme les autres exclusions croisées à l’écran', () => {
      const publicOne = candidate({
        siren: '1',
        signals: [{ type: 'hiring', label: '5 postes ouverts', date: '2026-07-01', publicEmployer: true }],
      })
      const out = applyRailConstraints([publicOne], unified({ excludePublicEmployers: true }), 'registry', NOW)
      expect(out).toHaveLength(0)
    })

    it('un employeur public reste visible sur un marché public (tender/award) — seul `hiring` est concerné', () => {
      const publicBuyer = candidate({
        siren: '1',
        signals: [{ type: 'award', label: 'Marché attribué', date: '2026-07-01', publicEmployer: true }],
      })
      const out = applyRailConstraints([publicBuyer], unified({ excludePublicEmployers: true }), 'registry', NOW)
      expect(out.map(c => c.siren)).toEqual(['1'])
    })
  })

  /**
   * #2616.1 — le CDI distinguable, filtrable. INCLUSION (contrairement à
   * `excludePublicEmployers` ci-dessus, une exclusion) : coché, un candidat
   * SANS signal `hiring` confirmé CDI sort de la vue.
   */
  describe('Freelance seul (#4999)', () => {
    const sig = (contractType: 'CDI' | 'CDD' | 'INTERIM' | 'FREELANCE' | null | undefined) => ({
      type: 'hiring' as const,
      label: 'Offre',
      date: '2026-07-01',
      ...(contractType === undefined ? {} : { contractType }),
    })
    it('ne garde que les offres dont la SOURCE dit freelance ; muet ou CDI ne passent pas', () => {
      const list = [
        candidate({ siren: '1', signals: [sig('FREELANCE')] }),
        candidate({ siren: '2', signals: [sig('CDI')] }),
        candidate({ siren: '3', signals: [sig(undefined)] }),
      ]
      const out = applyRailConstraints(list, unified({ freelanceOnly: true }), 'signals', NOW)
      expect(out.map(c => c.siren)).toEqual(['1'])
    })
    it('sans la coche rien ne change, et la coche compte comme un critère', () => {
      const list = [candidate({ siren: '2', signals: [sig('CDI')] })]
      expect(applyRailConstraints(list, unified(), 'signals', NOW)).toHaveLength(1)
      expect(countActiveFilters(unified({ freelanceOnly: true }))).toBe(1)
    })
  })

  describe('CDD seul et intérim seul (#5000)', () => {
    const sig = (contractType: 'CDI' | 'CDD' | 'INTERIM' | 'FREELANCE' | null) => ({
      type: 'hiring' as const,
      label: 'Offre',
      date: '2026-07-01',
      contractType,
    })
    const list = [
      candidate({ siren: '1', signals: [sig('CDD')] }),
      candidate({ siren: '2', signals: [sig('INTERIM')] }),
      candidate({ siren: '3', signals: [sig('FREELANCE')] }),
      candidate({ siren: '4', signals: [sig(null)] }),
    ]
    it('CDD seul ne garde que le CDD de la source', () => {
      const out = applyRailConstraints(list, unified({ cddOnly: true }), 'signals', NOW)
      expect(out.map(c => c.siren)).toEqual(['1'])
    })
    it('intérim seul ne garde que l’intérim, jamais le freelance', () => {
      const out = applyRailConstraints(list, unified({ interimOnly: true }), 'signals', NOW)
      expect(out.map(c => c.siren)).toEqual(['2'])
    })
    it('chaque coche compte comme un critère', () => {
      expect(countActiveFilters(unified({ cddOnly: true }))).toBe(1)
      expect(countActiveFilters(unified({ interimOnly: true }))).toBe(1)
    })
  })

  describe('CDI uniquement (#2616.1)', () => {
    it('ne garde que les candidats dont un signal de recrutement confirme le CDI', () => {
      const cdiOne = candidate({
        siren: '1',
        signals: [{ type: 'hiring', label: 'Dev Python', date: '2026-07-01', contractType: 'CDI' }],
      })
      const other = candidate({
        siren: '2',
        signals: [{ type: 'hiring', label: 'Mission intérim', date: '2026-07-01', contractType: null }],
      })
      const out = applyRailConstraints([cdiOne, other], unified({ cdiOnly: true }), 'signals', NOW)
      expect(out.map(c => c.siren)).toEqual(['1'])
    })

    it('un signal muet sur le contrat (`contractType` absent) n’est jamais traité comme CDI (GA-18/19)', () => {
      const unknown = candidate({
        siren: '1',
        signals: [{ type: 'hiring', label: '2 postes ouverts', date: '2026-07-01' }],
      })
      const out = applyRailConstraints([unknown], unified({ cdiOnly: true }), 'signals', NOW)
      expect(out).toHaveLength(0)
    })

    it('sans le filtre coché, rien ne change', () => {
      const list = [
        candidate({
          siren: '1',
          signals: [{ type: 'hiring', label: 'Mission intérim', date: '2026-07-01', contractType: null }],
        }),
      ]
      expect(applyRailConstraints(list, unified(), 'signals', NOW)).toHaveLength(1)
    })

    it('écarte MÊME en mode Registre, comme les autres exclusions croisées à l’écran', () => {
      const other = candidate({
        siren: '1',
        signals: [{ type: 'hiring', label: 'Mission intérim', date: '2026-07-01', contractType: null }],
      })
      const out = applyRailConstraints([other], unified({ cdiOnly: true }), 'registry', NOW)
      expect(out).toHaveLength(0)
    })
  })

  /**
   * #3096 — la politique de télétravail, filtrable. INCLUSION comme
   * `cdiOnly` ci-dessus : une politique cochée, un candidat sans signal
   * `hiring` évalué sur ce point sort de la vue — jamais traité comme « sur
   * site » par défaut.
   */
  describe('politique de télétravail (#3096)', () => {
    it('ne garde que les candidats dont un signal de recrutement confirme une politique cochée', () => {
      const remote = candidate({
        siren: '1',
        signals: [{ type: 'hiring', label: 'Dev Python', date: '2026-07-01', remoteWorkPolicy: 'full_remote' }],
      })
      const onsite = candidate({
        siren: '2',
        signals: [{ type: 'hiring', label: 'Technicien', date: '2026-07-01', remoteWorkPolicy: 'sur_site' }],
      })
      const out = applyRailConstraints([remote, onsite], unified({ remotePolicies: ['full_remote'] }), 'signals', NOW)
      expect(out.map(c => c.siren)).toEqual(['1'])
    })

    it('un signal muet sur le télétravail (`remoteWorkPolicy` absent) n’est jamais traité comme une politique cochée (GA-18/19)', () => {
      const unknown = candidate({
        siren: '1',
        signals: [{ type: 'hiring', label: '2 postes ouverts', date: '2026-07-01' }],
      })
      const out = applyRailConstraints([unknown], unified({ remotePolicies: ['full_remote'] }), 'signals', NOW)
      expect(out).toHaveLength(0)
    })

    it('sans politique cochée, rien ne change', () => {
      const list = [
        candidate({
          siren: '1',
          signals: [{ type: 'hiring', label: 'Technicien', date: '2026-07-01', remoteWorkPolicy: 'sur_site' }],
        }),
      ]
      expect(applyRailConstraints(list, unified(), 'signals', NOW)).toHaveLength(1)
    })

    it('écarte MÊME en mode Registre, comme les autres exclusions croisées à l’écran', () => {
      const onsite = candidate({
        siren: '1',
        signals: [{ type: 'hiring', label: 'Technicien', date: '2026-07-01', remoteWorkPolicy: 'sur_site' }],
      })
      const out = applyRailConstraints([onsite], unified({ remotePolicies: ['full_remote'] }), 'registry', NOW)
      expect(out).toHaveLength(0)
    })
  })

  /**
   * #3097 — la séniorité recherchée, filtrable. Même construction que la
   * politique de télétravail ci-dessus.
   */
  describe('séniorité recherchée (#3097)', () => {
    it('ne garde que les candidats dont un signal de recrutement confirme une séniorité cochée', () => {
      const senior = candidate({
        siren: '1',
        signals: [{ type: 'hiring', label: 'Dev Senior', date: '2026-07-01', seniority: 'senior' }],
      })
      const junior = candidate({
        siren: '2',
        signals: [{ type: 'hiring', label: 'Dev Junior', date: '2026-07-01', seniority: 'junior' }],
      })
      const out = applyRailConstraints([senior, junior], unified({ seniorities: ['senior'] }), 'signals', NOW)
      expect(out.map(c => c.siren)).toEqual(['1'])
    })

    it('un signal muet sur la séniorité (`seniority` absent) n’est jamais traité comme une séniorité cochée (GA-18/19)', () => {
      const unknown = candidate({
        siren: '1',
        signals: [{ type: 'hiring', label: 'Chef de projet', date: '2026-07-01' }],
      })
      const out = applyRailConstraints([unknown], unified({ seniorities: ['senior'] }), 'signals', NOW)
      expect(out).toHaveLength(0)
    })

    it('sans séniorité cochée, rien ne change', () => {
      const list = [
        candidate({
          siren: '1',
          signals: [{ type: 'hiring', label: 'Dev Junior', date: '2026-07-01', seniority: 'junior' }],
        }),
      ]
      expect(applyRailConstraints(list, unified(), 'signals', NOW)).toHaveLength(1)
    })

    it('écarte MÊME en mode Registre, comme les autres exclusions croisées à l’écran', () => {
      const junior = candidate({
        siren: '1',
        signals: [{ type: 'hiring', label: 'Dev Junior', date: '2026-07-01', seniority: 'junior' }],
      })
      const out = applyRailConstraints([junior], unified({ seniorities: ['senior'] }), 'registry', NOW)
      expect(out).toHaveLength(0)
    })
  })

  /**
   * #3226 (#3203.6) — le delivery fit externe, filtrable. Même construction
   * que la politique de télétravail / la séniorité ci-dessus.
   */
  describe('delivery fit externe (#3226, #3203.6)', () => {
    it('ne garde que les candidats dont un signal de recrutement confirme un niveau coché', () => {
      const compatible = candidate({
        siren: '1',
        signals: [{ type: 'hiring', label: 'Dev', date: '2026-07-01', deliveryFit: 'compatible' }],
      })
      const incompatible = candidate({
        siren: '2',
        signals: [{ type: 'hiring', label: 'Dev', date: '2026-07-01', deliveryFit: 'incompatible' }],
      })
      const out = applyRailConstraints(
        [compatible, incompatible],
        unified({ deliveryFitFilter: ['compatible'] }),
        'signals',
        NOW,
      )
      expect(out.map(c => c.siren)).toEqual(['1'])
    })

    it('un signal muet sur le delivery fit (`deliveryFit` absent) n’est jamais traité comme un niveau coché (GA-18/19)', () => {
      const unknown = candidate({
        siren: '1',
        signals: [{ type: 'hiring', label: 'Chef de projet', date: '2026-07-01' }],
      })
      const out = applyRailConstraints([unknown], unified({ deliveryFitFilter: ['compatible'] }), 'signals', NOW)
      expect(out).toHaveLength(0)
    })

    it('sans niveau coché, rien ne change', () => {
      const list = [
        candidate({
          siren: '1',
          signals: [{ type: 'hiring', label: 'Dev', date: '2026-07-01', deliveryFit: 'incompatible' }],
        }),
      ]
      expect(applyRailConstraints(list, unified(), 'signals', NOW)).toHaveLength(1)
    })
  })

  /**
   * #2165.24 — Groupe / filiale. Même statut que les exclusions ci-dessus
   * (aucune source ne l'exprime, il se croise dans les DEUX modes) mais avec
   * une nuance inverse assumée : contrairement au NAF exclu, une donnée
   * ABSENTE n'est PAS laissée passer — voir `passesGroupRole`.
   */
  describe('groupe / filiale (#2165.24)', () => {
    it('ne garde que les filiales quand le filtre demande « filiale », MÊME en mode Registre', () => {
      const filiale = candidate({ siren: '1', groupRole: 'filiale', groupHeadSiren: '222222222' })
      const groupe = candidate({ siren: '2', groupRole: 'groupe' })
      const out = applyRailConstraints([filiale, groupe], unified({ groupRole: 'filiale' }), 'registry', NOW)
      expect(out.map(c => c.siren)).toEqual(['1'])
    })

    it('filtre aussi en mode Signaux', () => {
      const filiale = candidate({ siren: '1', groupRole: 'filiale' })
      const groupe = candidate({ siren: '2', groupRole: 'groupe' })
      const out = applyRailConstraints([filiale, groupe], unified({ groupRole: 'filiale' }), 'signals', NOW)
      expect(out.map(c => c.siren)).toEqual(['1'])
    })

    it('EXCLUT un candidat sans lien connu — contrairement aux autres critères, l’inconnu n’est pas laissé passer', () => {
      const unknown = candidate({ siren: '1' }) // groupRole absent : candidat neuf, jamais résolu
      const filiale = candidate({ siren: '2', groupRole: 'filiale' })
      const out = applyRailConstraints([unknown, filiale], unified({ groupRole: 'filiale' }), 'registry', NOW)
      expect(out.map(c => c.siren)).toEqual(['2'])
    })

    it('sans filtre posé (« any »), rien ne change', () => {
      const list = [candidate({ siren: '1' }), candidate({ siren: '2', groupRole: 'groupe' })]
      expect(applyRailConstraints(list, unified(), 'registry', NOW)).toHaveLength(2)
    })
  })
})

/**
 * #4294.7 — « Déjà travaillées » (rubrique Relation) : les comptes que l'espace a déjà travaillés (relation ou
 * mission passée). Croisé en ET avec tous les autres filtres — un filtre ne se retire jamais pour en ajouter un.
 */
describe('déjà travaillées (#4294.7)', () => {
  const worked = (siren: string, over: Partial<DiscoverCandidate> = {}) =>
    candidate({ siren, portfolioState: 'customer', accountId: `acc-${siren}`, workedBefore: true, ...over })

  it('ne garde que les comptes travaillés, dans les DEUX modes', () => {
    const list = [worked('1'), candidate({ siren: '2' }), candidate({ siren: '3', portfolioState: 'analyzed' })]
    for (const mode of ['registry', 'signals'] as const) {
      expect(applyRailConstraints(list, unified({ workedOnly: true }), mode, NOW).map(c => c.siren)).toEqual(['1'])
    }
  })

  it('se COMBINE avec le secteur (un ET) : travaillé ET du secteur — ni l’un seul, ni l’autre seul', () => {
    const techWorked = worked('1', { nafCode: '62.02A' })
    const financeWorked = worked('2', { nafCode: '64.19Z' })
    const techNew = candidate({ siren: '3', nafCode: '62.02A' })
    const out = applyRailConstraints(
      [techWorked, financeWorked, techNew],
      unified({ workedOnly: true, sectors: ['software_tech'] }),
      'signals',
      NOW,
    )
    expect(out.map(c => c.siren)).toEqual(['1'])
  })

  it('sait dire NON : un compte suivi ou analysé sans relation ni mission n’est pas « travaillé »', () => {
    const analyzedOnly = candidate({ siren: '1', portfolioState: 'analyzed', accountId: 'acc-1' })
    expect(applyRailConstraints([analyzedOnly], unified({ workedOnly: true }), 'registry', NOW)).toEqual([])
  })

  it('sans le filtre posé, rien ne change ; posé, il compte comme un critère actif', () => {
    expect(applyRailConstraints([candidate()], unified(), 'registry', NOW)).toHaveLength(1)
    expect(countActiveFilters(unified({ workedOnly: true }))).toBe(1)
  })
})

/**
 * #2151.31-.34 / #2165.51/.53/.54/.56 — DÉCISION Louis 17/09 (QCM) : les
 * quatre filtres demandés (expertise, clients observés, relation existante,
 * ouverture au rang 2) n'existent QUE relatifs à la PAIRE (compte, ESN) sur
 * un dossier précis — aucun n'est une propriété marché-entier de l'ESN. Un
 * seul filtre les remplace tous : l'AGRÉGAT de l'espace, « vu sur N
 * dossiers » (`GET /partners/on-my-accounts`, déjà exposé — aucune donnée
 * marché inventée). Correspondance par nom normalisé (minuscule, espaces
 * réduits) : même limite que l'annuaire partenaire existant, pas de SIREN
 * sur `account_partners`. Volontairement HORS `UnifiedFilters`/
 * `applyRailConstraints` (GA-275 protège les croisements sur un FAIT du
 * candidat ; ceci croise un agrégat externe, comme `needCompany` à côté).
 */
describe('vu sur N dossiers (#2151.31-.34, agrégat de l’espace)', () => {
  describe('buildPartnerCoverageIndex', () => {
    it('normalise la casse et les espaces pour l’index', () => {
      const index = buildPartnerCoverageIndex([{ name: '  Capgemini  ', accounts: 3 }])
      expect(index.get('capgemini')).toBe(3)
    })

    it('garde le compte le plus haut sur un doublon de nom normalisé', () => {
      const index = buildPartnerCoverageIndex([
        { name: 'Capgemini', accounts: 2 },
        { name: 'CAPGEMINI', accounts: 5 },
      ])
      expect(index.get('capgemini')).toBe(5)
    })
  })

  describe('passesMinAccountsSeen', () => {
    it('sans seuil, rien ne change (le champ vide n’est pas contraignant)', () => {
      const index = buildPartnerCoverageIndex([{ name: 'Capgemini', accounts: 0 }])
      expect(passesMinAccountsSeen('Capgemini', null, index)).toBe(true)
    })

    it('écarte une ESN vue sur moins de dossiers que le seuil', () => {
      const index = buildPartnerCoverageIndex([{ name: 'Capgemini', accounts: 1 }])
      expect(passesMinAccountsSeen('Capgemini', 2, index)).toBe(false)
    })

    it('garde une ESN vue sur au moins le seuil de dossiers', () => {
      const index = buildPartnerCoverageIndex([{ name: 'Capgemini', accounts: 3 }])
      expect(passesMinAccountsSeen('Capgemini', 2, index)).toBe(true)
    })

    it('une ESN JAMAIS vue n’est écartée QUE lorsqu’un seuil est effectivement posé — l’absence n’est un « 0 dossier » qu’à ce moment-là', () => {
      const index = buildPartnerCoverageIndex([])
      expect(passesMinAccountsSeen('ESN Inconnue', null, index)).toBe(true)
      expect(passesMinAccountsSeen('ESN Inconnue', 1, index)).toBe(false)
    })
  })
})

/* ------------------------------------------------------------------ */
/*  Ce que le panneau replié annonce                                    */
/* ------------------------------------------------------------------ */

describe('countActiveFilters', () => {
  it('Recette 21/10 B.7 — Java en compétence ET en mot-clé de signal = UN critère ; un autre mot-clé en fait deux', () => {
    const base = { technologiesObserved: 'Java', signalSources: ['hiring' as const], keywords: 'java' }
    // compétence (1) + signal (1) : le mot-clé identique n'ajoute rien
    expect(countActiveFilters(unified(base))).toBe(2)
    expect(countActiveFilters(unified({ ...base, keywords: 'Python' }))).toBe(3)
  })

  it('ne compte rien sur un rail vierge', () => {
    expect(countActiveFilters(unified())).toBe(0)
  })

  it('compte les critères de cible réellement posés', () => {
    expect(countActiveFilters(unified({ sectors: ['software_tech'] }))).toBe(1)
    expect(countActiveFilters(unified({ sectors: ['software_tech'], city: 'Lyon', headcount: ['50-249'] }))).toBe(3)
  })

  it('ne compte pas une valeur laissée à son défaut', () => {
    // `headcount: []` et `age: 'any'` sont les défauts : ils ne contraignent rien.
    expect(countActiveFilters(unified({ headcount: [], age: 'any' }))).toBe(0)
  })

  it('ignore une chaîne d’espaces — un champ blanc n’est pas un critère', () => {
    expect(countActiveFilters(unified({ city: '   ', nafCode: ' ' }))).toBe(0)
  })

  it('ne compte fenêtre et mots-clés que si un signal est coché', () => {
    // Sans signal, ces deux réglages ne s'appliquent à rien : les annoncer
    // comme des critères ferait chercher un filtre qui n'agit pas.
    expect(countActiveFilters(unified({ sinceDays: 30, keywords: 'data' }))).toBe(0)
    expect(countActiveFilters(unified({ signalSources: ['hiring'], sinceDays: 30, keywords: 'data' }))).toBe(3)
  })

  // #2165.27 — une exclusion posée compte, dans les DEUX modes (elle s'applique
  // toujours, cf. `applyRailConstraints`).
  it('compte une exclusion de secteur posée', () => {
    expect(countActiveFilters(unified({ excludeSectors: ['software_tech'] }))).toBe(1)
  })

  // #2165.28 / #2165.30 — filtres serveur mémoire marché.
  it('compte les technologies observées et le recours externe observé', () => {
    expect(countActiveFilters(unified({ technologiesObserved: 'java' }))).toBe(1)
    expect(countActiveFilters(unified({ externalRecourseObserved: true }))).toBe(1)
    expect(countActiveFilters(unified({ technologiesObserved: '  ' }))).toBe(0)
  })

  // #2165.24 — idem pour groupe/filiale : `'any'` (le défaut) ne compte pas.
  it('compte un filtre groupe/filiale posé, pas son défaut « any »', () => {
    expect(countActiveFilters(unified({ groupRole: 'any' }))).toBe(0)
    expect(countActiveFilters(unified({ groupRole: 'filiale' }))).toBe(1)
  })
})

/**
 * #3878.1 — une incohérence RÉELLEMENT détectée entre deux critères, jamais
 * déduite du seul NOMBRE de critères actifs (voir `discoverEmptyReason`, qui
 * consomme cette fonction). « Deux filtres actifs » ne prouve rien sur le
 * zéro observé ; un secteur à la fois coché et exclu, ou un CA minimum
 * au-dessus du maximum, le prouvent STRUCTURELLEMENT.
 */
describe('detectInconsistentFilters (#3878.1)', () => {
  it('ne détecte rien sur un rail vierge, ni sur plusieurs critères compatibles', () => {
    expect(detectInconsistentFilters(unified())).toBe(false)
    expect(
      detectInconsistentFilters(unified({ sectors: ['software_tech'], city: 'Lyon', headcount: ['50-249'] })),
    ).toBe(false)
  })

  it('détecte un secteur à la fois coché et exclu', () => {
    expect(detectInconsistentFilters(unified({ sectors: ['software_tech'], excludeSectors: ['software_tech'] }))).toBe(
      true,
    )
  })

  it('ne détecte rien quand secteurs cochés et exclus ne se recoupent pas', () => {
    expect(detectInconsistentFilters(unified({ sectors: ['software_tech'], excludeSectors: ['retail_banking'] }))).toBe(
      false,
    )
  })

  it('détecte un CA minimum au-dessus du CA maximum', () => {
    expect(detectInconsistentFilters(unified({ revenueMin: '5000000', revenueMax: '1000000' }))).toBe(true)
  })

  it('ne détecte rien quand un seul des deux bornes du CA est posé', () => {
    expect(detectInconsistentFilters(unified({ revenueMin: '5000000' }))).toBe(false)
    expect(detectInconsistentFilters(unified({ revenueMax: '1000000' }))).toBe(false)
  })

  it('ne détecte rien quand le CA minimum est inférieur ou égal au maximum', () => {
    expect(detectInconsistentFilters(unified({ revenueMin: '1000000', revenueMax: '5000000' }))).toBe(false)
    expect(detectInconsistentFilters(unified({ revenueMin: '1000000', revenueMax: '1000000' }))).toBe(false)
  })
})

/**
 * #3879.2 — RÉFUTÉ en recette prod le 08/10/2026 : le panneau « Recherche »
 * replié ne disait rien des critères actifs.
 */
describe('activeFiltersSummary (#3879.2)', () => {
  it('rend null sur un rail vierge — une absence ne fait aucune ligne', () => {
    expect(activeFiltersSummary(unified())).toBeNull()
  })

  it('nomme les secteurs cochés, sans compter deux fois le même critère', () => {
    expect(activeFiltersSummary(unified({ sectors: ['software_tech'] }))).toEqual({
      sectorCodes: ['software_tech'],
      otherCount: 0,
    })
  })

  it('compte le RESTE au-delà des secteurs, avec le même mécanisme que countActiveFilters', () => {
    const filters = unified({ sectors: ['software_tech'], city: 'Lyon', headcount: ['50-249'] })
    expect(countActiveFilters(filters)).toBe(3)
    expect(activeFiltersSummary(filters)).toEqual({ sectorCodes: ['software_tech'], otherCount: 2 })
  })

  it('compte le total quand aucun secteur n’est coché', () => {
    const filters = unified({ city: 'Lyon', headcount: ['50-249'] })
    expect(activeFiltersSummary(filters)).toEqual({ sectorCodes: [], otherCount: 2 })
  })
})

/**
 * #3814.3 — une sortie maigre propose UN élargissement PRÉCIS (zone, effectif
 * ou compétence), jamais une cible inventée : sans contrainte posée sur aucun
 * des trois, il n'y a rien de précis à élargir — `null`, pas un repli deviné.
 */
describe('suggestedWidenAxis', () => {
  it('ne propose rien sans contrainte posée — pas de cible inventée', () => {
    expect(suggestedWidenAxis(unified())).toBeNull()
  })

  it('nomme la zone dès que ville, département ou région est posé', () => {
    expect(suggestedWidenAxis(unified({ city: 'Lille' }))).toBe('zone')
    expect(suggestedWidenAxis(unified({ department: '59' }))).toBe('zone')
    expect(suggestedWidenAxis(unified({ region: ['IDF'] }))).toBe('zone')
  })

  it('nomme l’effectif quand seule la tranche d’effectif est posée', () => {
    expect(suggestedWidenAxis(unified({ headcount: ['1000+'] }))).toBe('headcount')
    expect(suggestedWidenAxis(unified({ headcount: [] }))).toBeNull()
  })

  it('nomme la compétence quand seul le texte libre ou la pile observée est posé', () => {
    expect(suggestedWidenAxis(unified({ freetext: 'Java Spring Vue' }))).toBe('skills')
    expect(suggestedWidenAxis(unified({ technologiesObserved: 'java' }))).toBe('skills')
    expect(suggestedWidenAxis(unified({ freetext: '   ' }))).toBeNull()
  })

  it('priorise zone puis effectif puis compétence quand plusieurs sont posés', () => {
    expect(suggestedWidenAxis(unified({ city: 'Lille', headcount: ['1000+'], freetext: 'Java' }))).toBe('zone')
    expect(suggestedWidenAxis(unified({ headcount: ['1000+'], freetext: 'Java' }))).toBe('headcount')
  })
})

/**
 * #3819.1 — « le lien avec les critères/compétences saisis » : UN fait du
 * candidat comparé à UN critère RÉELLEMENT posé, jamais un lien inventé.
 * Réutilise les croisements déjà écrits pour le filtrage (`passesSectors`,
 * `passesCity`, `passesDepartment`, `passesHeadcount`, GA-26) plutôt que de
 * recalculer la même correspondance une seconde fois.
 */
describe('matchedSearchCriteria', () => {
  it('#4045.1 — nomme le mot-clé quand un signal le recoupe, jamais sinon', () => {
    const hit = candidate({
      signals: [{ type: 'hiring', label: 'Analyste SOC', date: '2026-10-01', keywordMatch: true }],
    })
    const miss = candidate({ signals: [{ type: 'hiring', label: 'Data Analyst', date: '2026-10-01' }] })
    expect(matchedSearchCriteria(hit, unified({ keywords: 'cybersécurité' }))).toContain('keyword')
    expect(matchedSearchCriteria(miss, unified({ keywords: 'cybersécurité' }))).not.toContain('keyword')
    expect(matchedSearchCriteria(hit, unified({ keywords: '' }))).not.toContain('keyword')
  })

  it('ne nomme rien sans critère posé — pas de lien inventé', () => {
    expect(matchedSearchCriteria(candidate(), unified())).toEqual([])
  })

  it('nomme le secteur quand le candidat porte un NAF du secteur demandé', () => {
    const c = candidate({ nafCode: '6201Z' })
    expect(matchedSearchCriteria(c, unified({ sectors: ['software_tech'] }))).toContain('sector')
  })

  it('ne nomme pas le secteur quand le NAF du candidat n’y correspond pas', () => {
    const c = candidate({ nafCode: '1071Z' }) // boulangerie — hors tech
    expect(matchedSearchCriteria(c, unified({ sectors: ['software_tech'] }))).not.toContain('sector')
  })

  it('nomme la zone quand la ville ou le département du candidat correspond', () => {
    expect(matchedSearchCriteria(candidate({ city: 'Lille' }), unified({ city: 'Lille' }))).toContain('zone')
    expect(matchedSearchCriteria(candidate({ department: '59' }), unified({ department: '59' }))).toContain('zone')
  })

  it('ne nomme pas la zone sans zone posée', () => {
    expect(matchedSearchCriteria(candidate({ city: 'Lille' }), unified())).not.toContain('zone')
  })

  it('nomme l’effectif quand la tranche du candidat tombe dans celle demandée', () => {
    const c = candidate({ headcountRange: '1 000 à 1 999 salariés' })
    expect(matchedSearchCriteria(c, unified({ headcount: ['1000+'] }))).toContain('headcount')
  })

  it('#3819 — nomme la COMPÉTENCE saisie en texte libre quand un signal du candidat la porte (titre, détail ou technologies)', () => {
    const c = candidate({
      signals: [
        { type: 'hiring', label: 'Ingénieur DevOps Kubernetes H/F', date: '2026-10-01', technologies: ['Terraform'] },
      ],
    })
    expect(matchedSearchCriteria(c, unified({ freetext: 'kubernetes' }))).toContain('skills')
    expect(matchedSearchCriteria(c, unified({ technologiesObserved: 'terraform' }))).toContain('skills')
  })

  it('#3819 — la compétence sait dire NON : aucun signal qui la porte, pas de texte posé, pas de lien approximatif', () => {
    const c = candidate({ signals: [{ type: 'hiring', label: 'Ingénieur DevOps Kubernetes H/F', date: '2026-10-01' }] })
    expect(matchedSearchCriteria(c, unified({ freetext: 'cobol' }))).not.toContain('skills')
    expect(matchedSearchCriteria(c, unified())).not.toContain('skills')
    // « java » n'est pas « javascript » : un mot entier, jamais une sous-chaîne.
    const js = candidate({ signals: [{ type: 'hiring', label: 'Développeur JavaScript', date: '2026-10-01' }] })
    expect(matchedSearchCriteria(js, unified({ freetext: 'java' }))).not.toContain('skills')
    // un candidat sans signal ne se voit attribuer aucune compétence
    expect(matchedSearchCriteria(candidate(), unified({ freetext: 'kubernetes' }))).not.toContain('skills')
  })

  it('ne nomme pas l’effectif quand la tranche du candidat est hors de celle demandée', () => {
    const c = candidate({ headcountRange: '10 à 49 salariés' })
    expect(matchedSearchCriteria(c, unified({ headcount: ['1000+'] }))).not.toContain('headcount')
  })

  it('cumule les axes réellement posés et satisfaits', () => {
    const c = candidate({ nafCode: '6201Z', city: 'Lille', headcountRange: '1 000 à 1 999 salariés' })
    expect(
      matchedSearchCriteria(c, unified({ sectors: ['software_tech'], city: 'Lille', headcount: ['1000+'] })),
    ).toEqual(expect.arrayContaining(['sector', 'zone', 'headcount']))
  })
})

// #3819 (lot RBB, décision Louis 11/10) — les critères qui SUIVENT le compte :
// les mêmes croisements que `matchedSearchCriteria` (GA-26), avec leurs valeurs.
describe('discoverOriginCriteriaFor', () => {
  // #4646 — les offres qui ont fait sortir le compte suivent jusqu'au dossier, datées, avec le jour où on les a montrées.
  it('#4646 transporte les offres de la preuve, leur date et le jour où Découvrir les a montrées', () => {
    const c = candidate({
      skillEvidence: {
        skill: 'java',
        offerCount: 2,
        latestOffer: {
          title: 'Concepteur-développeur Java',
          city: 'Lille',
          date: '2026-10-20',
          url: null,
          source: null,
        },
        offers: [{ title: 'Concepteur-développeur Java', date: '2026-10-20' }, { title: 'Dev Vue.js' }],
      },
    })
    const criteria = discoverOriginCriteriaFor(c, unified({ keywords: 'java' }), '2026-10-27')
    expect(criteria?.offers).toEqual([
      { title: 'Concepteur-développeur Java', date: '2026-10-20', seen: '2026-10-27' },
      { title: 'Dev Vue.js', seen: '2026-10-27' },
    ])
    expect(criteria?.skills).toContain('java')
  })

  // #4646.5 — « Lille » ne rend pas un dossier cadré sur le siège de Compiègne : le compte est sorti PAR son offre
  // de Lille, la zone cherchée suit donc jusqu'au dossier même si le siège est ailleurs.
  const proofIn = (city: string) => ({
    skill: 'java',
    offerCount: 1,
    offers: [{ title: 'Concepteur-développeur Java', city, date: '2026-10-20' }],
    latestOffer: { title: 'Concepteur-développeur Java', city, date: '2026-10-20', url: null, source: null },
  })

  it('#4646.5 une offre dans la ville cherchée porte la zone au dossier, siège ailleurs', () => {
    const c = candidate({ city: 'Compiègne', department: '60', skillEvidence: proofIn('Lille') })
    const criteria = discoverOriginCriteriaFor(c, unified({ city: 'Lille', keywords: 'java' }), '2026-10-27')
    expect(criteria?.zone_city).toBe('Lille')
    expect(criteria?.zone).toBe('Lille')
  })

  it('#4646.5 une offre hors de la ville cherchée ne porte aucune zone', () => {
    const c = candidate({ city: 'Compiègne', department: '60', skillEvidence: proofIn('Paris') })
    const criteria = discoverOriginCriteriaFor(c, unified({ city: 'Lille', keywords: 'java' }), '2026-10-27')
    expect(criteria?.zone_city).toBeUndefined()
  })

  it('#4646.2 le lien de l’annonce suit l’offre jusqu’au dossier, jamais une adresse inventée', () => {
    const c = candidate({
      skillEvidence: {
        skill: 'java',
        offerCount: 2,
        offers: [
          { title: 'Dev Java', date: '2026-10-20', url: 'https://offres.example.org/a' },
          { title: 'Dev Vue.js', url: 'javascript:alert(1)' },
        ],
        latestOffer: {
          title: 'Dev Java',
          city: null,
          date: '2026-10-20',
          url: 'https://offres.example.org/a',
          source: null,
        },
      },
    })
    const criteria = discoverOriginCriteriaFor(c, unified({ keywords: 'java' }), '2026-10-27')
    expect(criteria?.offers?.[0]?.url).toBe('https://offres.example.org/a')
    expect(criteria?.offers?.[1]?.url).toBeUndefined()
  })

  it('#4646 sans preuve d’offre, aucune offre n’est inventée', () => {
    expect(
      discoverOriginCriteriaFor(candidate({ city: 'Lille' }), unified({ keywords: 'java' }), '2026-10-27'),
    ).toBeUndefined()
  })

  // #4433.9 (re-recette 26/10) — un compte sorti par l'ÉLARGISSEMENT garde son palier jusqu'au dossier.
  it('#4433.9 transporte le palier de zone d’un compte élargi, même sans critère de zone satisfait', () => {
    // Une commune SANS coordonnées (Arras, désormais à ~50 km, serait dans le cercle de 100 km par défaut).
    const widened = candidate({
      city: 'Saint-Trucmuche',
      zone: { tier: 'department', area: 'Pas-de-Calais', place: 'Lille' },
    })
    expect(discoverOriginCriteriaFor(widened, unified({ city: 'Lille' }))).toEqual({
      zone_widened: { tier: 'department', area: 'Pas-de-Calais', place: 'Lille' },
    })
  })

  it('#4433.9 une distance mesurée voyage, un compte exact ne porte aucun palier', () => {
    const near = candidate({ zone: { tier: 'radius_50', distanceKm: 38.4, place: 'Lille' } })
    expect(discoverOriginCriteriaFor(near, unified({ city: 'Lille' }))?.zone_widened).toEqual({
      tier: 'radius_50',
      distance_km: 38.4,
      place: 'Lille',
    })
    const exact = candidate({ city: 'Lille', zone: { tier: 'city', place: 'Lille' } })
    expect(discoverOriginCriteriaFor(exact, unified({ city: 'Lille' }))?.zone_widened).toBeUndefined()
  })

  it('ne transporte rien sans critère posé — jamais un critère inventé', () => {
    expect(discoverOriginCriteriaFor(candidate({ city: 'Lille' }), unified())).toBeUndefined()
  })

  it('transporte les axes posés ET satisfaits, avec leurs valeurs', () => {
    const c = candidate({
      nafCode: '6201Z',
      city: 'Lille',
      department: '59',
      headcountRange: '1 000 à 1 999 salariés',
      signals: [{ type: 'hiring', label: 'Data engineer', date: '2026-10-01' }],
    })
    expect(
      discoverOriginCriteriaFor(
        c,
        unified({
          sectors: ['software_tech'],
          city: 'Lille',
          department: '59',
          headcount: ['1000+'],
          signalSources: ['hiring', 'tender'],
        }),
      ),
    ).toEqual({
      sectors: ['software_tech'],
      zone: 'Lille · 59',
      zone_city: 'Lille',
      zone_departments: ['Nord'],
      headcount: ['1000+'],
      signals: ['hiring'],
    })
  })

  // #4432.3 — une RÉGION cherchée suit le compte (elle n'en sortait pas : « Occitanie » ne voyageait
  // pas, et le dossier portait sur le siège parisien). Nommée, jamais un code nu.
  it('emporte la ou les régions cherchées, nommées — et dit NON au compte hors région', () => {
    const inZone = candidate({ name: 'SAFRAN', city: 'Blagnac', department: '31' })
    const criteria = unified({ region: ['75', '76'] })
    expect(discoverOriginCriteriaFor(inZone, criteria)).toEqual({
      zone: 'Nouvelle-Aquitaine · Occitanie',
      zone_regions: ['Nouvelle-Aquitaine', 'Occitanie'],
    })
    expect(discoverOriginCriteriaFor(candidate({ city: 'Paris', department: '75' }), criteria)).toBeUndefined()
  })

  // #4432.2 — DASSAULT AVIATION : siège à Saint-Cloud (92), établissements en Occitanie. Le registre PROUVE
  // la présence dans la zone cherchée (`geography`) : la boîte « Analyser » doit recevoir la zone, pas le siège.
  it('#4432.2 — un siège hors zone mais des établissements PROUVÉS dans la zone emportent la région', () => {
    const geography = {
      basis: 'establishment' as const,
      headquarters: { city: 'Saint-Cloud', department: '92' },
      siteCount: 2,
      sites: [{ siret: null, city: 'Toulouse', department: '31', region: '76' }],
      zoneRegion: '76',
    }
    const dassault = candidate({ name: 'DASSAULT AVIATION', city: 'Saint-Cloud', department: '92', geography })
    expect(discoverOriginCriteriaFor(dassault, unified({ region: ['76'] }))).toEqual({
      zone: 'Occitanie',
      zone_regions: ['Occitanie'],
    })
    // Sans preuve d'implantation dans la zone, un siège hors région reste hors zone (dit NON).
    expect(discoverOriginCriteriaFor(candidate({ department: '92' }), unified({ region: ['76'] }))).toBeUndefined()
    // Le siège prouvé dans la zone voyage aussi, même si `department` manque.
    const hq = { ...geography, basis: 'headquarters' as const, siteCount: 0, sites: [] }
    expect(
      discoverOriginCriteriaFor(candidate({ department: '92', geography: hq }), unified({ region: ['76'] })),
    ).toEqual({ zone: 'Occitanie', zone_regions: ['Occitanie'] })
  })

  it('n’emporte pas un axe posé que le candidat ne satisfait pas', () => {
    const c = candidate({ nafCode: '1071Z', city: 'Lille', signals: [] })
    expect(
      discoverOriginCriteriaFor(c, unified({ sectors: ['software_tech'], city: 'Lille', signalSources: ['hiring'] })),
    ).toEqual({ zone: 'Lille', zone_city: 'Lille' })
  })

  // #3819 (lot W-C 13/10) — la COMPÉTENCE cherchée suit aussi le compte : le mot
  // posé ET retrouvé dans un signal du candidat, jamais un mot qu'il ne porte pas.
  it('emporte la compétence posée que porte un signal du candidat, pas les autres', () => {
    const c = candidate({ signals: [{ type: 'hiring', label: 'Développeur Java senior', date: '2026-10-01' }] })
    expect(discoverOriginCriteriaFor(c, unified({ freetext: 'java, kubernetes' }))).toEqual({ skills: ['java'] })
    expect(discoverOriginCriteriaFor(c, unified({ freetext: 'javascript' }))).toBeUndefined()
  })

  // #5214 — un libellé choisi (« Data & IA ») reste UN critère ; seul un texte saisi à la main se découpe.
  it('#5214 — « Data & IA » reste un seul critère, jamais « data » et « ia » séparés', () => {
    const both = candidate({ signals: [{ type: 'hiring', label: 'Lead Data & IA', date: '2026-10-01' }] })
    expect(discoverOriginCriteriaFor(both, unified({ technologiesObserved: 'Data & IA' }))).toEqual({
      skills: ['data & ia'],
    })
    // Un compte qui ne porte que « data » ne satisfait pas le critère « Data & IA ».
    const dataOnly = candidate({ signals: [{ type: 'hiring', label: 'Data Analyst', date: '2026-10-01' }] })
    expect(discoverOriginCriteriaFor(dataOnly, unified({ technologiesObserved: 'Data & IA' }))).toBeUndefined()
    // Un texte saisi à la main sans « & » se découpe toujours.
    expect(discoverOriginCriteriaFor(dataOnly, unified({ freetext: 'data analyst' }))).toEqual({
      skills: ['data', 'analyst'],
    })
  })
})

/**
 * Le SECTEUR survit au passage en mode Signaux.
 *
 * Retour du 31/08 : « Découvrir redonnait des entreprises qui n'avaient rien à
 * voir avec ce qu'il cherchait dans les filtres… dans les deux [modes] pour le
 * secteur ». Le rail est COMMUN aux deux modes et affiche les mêmes pastilles ;
 * `signalsPart` les laissait tomber, et `buildSignalsQuery` ne les sérialisait
 * pas. Le serveur ne recevait donc rien — donc aucune entrée `degraded`, donc
 * aucune note nulle part : l'utilisateur cochait « Industrie » et il ne se
 * passait strictement rien, en silence complet.
 *
 * C'est le pire des deux défauts du lot : côté registre le critère était au
 * moins ENVOYÉ (et perdu par la source), ici il n'existait pas.
 */
describe('le secteur atteint le mode Signaux', () => {
  it('signalsPart emporte les secteurs du rail commun', () => {
    const filters = {
      ...emptyUnifiedFilters(),
      sectors: ['aerospace'],
      signalSources: ['hiring'] as SignalSource[],
    }

    expect(signalsPart(filters).sectors).toEqual(['aerospace'])
  })

  it('ne les sérialise PLUS dans la requête — le serveur ne connaît pas les secteurs fins', () => {
    // Le serveur ne sait traduire que les dix anciennes clés larges. Lui envoyer
    // `aerospace` ne filtrerait rien (un secteur inconnu ne filtre RIEN plutôt
    // que de vider la liste). Le filtrage se fait à l'écran, sur le code NAF que
    // chaque candidat porte — plus fin que la section d'avant.
    const query = buildSignalsQuery({ ...emptySignalsFilters(), sectors: ['aerospace', 'defense'] })

    expect(query.sectors).toBeUndefined()
  })

  it("n'envoie rien quand aucun secteur n'est coché — une recherche non restreinte ne retire rien", () => {
    expect(buildSignalsQuery(emptySignalsFilters()).sectors).toBeUndefined()
  })

  it('compte le secteur comme un critère actif même en mode Signaux', () => {
    // Sinon le panneau replié annoncerait « 1 critère » là où il y en a deux, et
    // l'utilisateur ne saurait plus expliquer sa liste.
    const filters = {
      ...emptyUnifiedFilters(),
      sectors: ['aerospace'],
      signalSources: ['hiring'] as SignalSource[],
    }

    expect(countActiveFilters(filters)).toBeGreaterThanOrEqual(2)
  })

  it("garde un candidat dont le code NAF est absent — on n'écarte jamais sur une absence", () => {
    // Un signal sans NAF ne peut pas CONTREDIRE le filtre : l'écarter ferait
    // disparaître de vraies cibles sans le dire.
    const filters = { ...emptyUnifiedFilters(), sectors: ['aerospace'], signalSources: ['hiring'] as SignalSource[] }
    const kept = applyRailConstraints([candidate({ nafCode: null })], filters, 'signals', NOW)

    expect(kept).toHaveLength(1)
  })

  it("écarte un candidat manufacturier qui n'est pas du secteur fin demandé", () => {
    // C'est le défaut signalé : « Industrie » valait la section C entière, donc
    // un fabricant de dispositifs médicaux (32.50A) remontait sous le filtre
    // d'un avionneur (30.30Z).
    const filters = { ...emptyUnifiedFilters(), sectors: ['aerospace'], signalSources: ['hiring'] as SignalSource[] }
    const kept = applyRailConstraints(
      [candidate({ siren: '1', nafCode: '30.30Z' }), candidate({ siren: '2', nafCode: '32.50A' })],
      filters,
      'signals',
      NOW,
    )

    expect(kept.map(c => c.siren)).toEqual(['1'])
  })
})

/**
 * #3096 / #3097 — RÉFUTÉ en prod le 27/09 : `?signals=hiring` était le SEUL
 * critère de la requête envoyée à l'IA — la politique de télétravail et la
 * séniorité cochées au rail ne traversaient pas `signalsPart`. Même défaut
 * que le secteur ci-dessus, mais avec une conséquence différente : le serveur
 * CONNAÎT ces deux critères (`DiscoverSignalsRequest.remotePolicies` /
 * `.seniorities`, `discover_signals.py`) et les applique AVANT de tronquer à
 * `limit` (`after_seniority = after_remote[:limit]`) — sans eux dans la
 * requête, la page de 25 candidats rendue au croisement écran
 * (`applyRailConstraints`) n'a plus jamais été composée en tenant compte de
 * ce que le commercial a coché, donc plus aucune carte de cette page ne porte
 * le signal `hiring` qui aurait dû la faire garder.
 */
describe('signalsPart emporte télétravail et séniorité (#3096 / #3097)', () => {
  it('signalsPart transmet la politique de télétravail cochée', () => {
    const filters = {
      ...emptyUnifiedFilters(),
      signalSources: ['hiring'] as SignalSource[],
      remotePolicies: ['full_remote' as const],
    }

    expect(signalsPart(filters).remotePolicies).toEqual(['full_remote'])
  })

  it('signalsPart transmet la séniorité cochée', () => {
    const filters = {
      ...emptyUnifiedFilters(),
      signalSources: ['hiring'] as SignalSource[],
      seniorities: ['senior' as const],
    }

    expect(signalsPart(filters).seniorities).toEqual(['senior'])
  })

  it('signalsPart transmet le delivery fit coché (#3226, #3203.6)', () => {
    const filters = {
      ...emptyUnifiedFilters(),
      signalSources: ['hiring'] as SignalSource[],
      deliveryFitFilter: ['compatible' as const],
    }

    expect(signalsPart(filters).deliveryFitFilter).toEqual(['compatible'])
  })

  it('buildSignalsQuery sérialise la politique de télétravail et la séniorité', () => {
    const query = buildSignalsQuery({
      ...emptySignalsFilters(),
      remotePolicies: ['full_remote'],
      seniorities: ['senior'],
    })

    expect(query.remotePolicies).toEqual(['full_remote'])
    expect(query.seniorities).toEqual(['senior'])
  })

  it('buildSignalsQuery sérialise le delivery fit coché (#3226, #3203.6)', () => {
    const query = buildSignalsQuery({
      ...emptySignalsFilters(),
      deliveryFitFilter: ['compatible'],
    })

    expect(query.deliveryFitFilter).toEqual(['compatible'])
  })

  it("n'envoie ni l'une ni l'autre quand rien n'est coché — une recherche non restreinte ne retire rien", () => {
    const query = buildSignalsQuery(emptySignalsFilters())

    expect(query.remotePolicies).toBeUndefined()
    expect(query.seniorities).toBeUndefined()
    expect(query.deliveryFitFilter).toBeUndefined()
  })
})

/**
 * #2151.33 / #2151.34 — DÉCISION Louis 18/09 : les trois filtres de #2151
 * sont livrés, revenant sur le remplacement unique du 17/09 documenté
 * ci-dessus. « Relation existante » et « rang 2 » restent, comme
 * `minAccountsSeen`, un croisement sur l'AGRÉGAT de l'espace — jamais un
 * fait du candidat Découvrir lui-même (GA-275).
 */
describe('relation existante et ouverture au rang 2 (#2151.33 / #2151.34, agrégat de l’espace)', () => {
  describe('buildPartnerRelationIndex', () => {
    it('normalise la casse et les espaces, comme buildPartnerCoverageIndex', () => {
      const index = buildPartnerRelationIndex([{ name: '  Capgemini  ', rank2: 1, knownRelationship: 2 }])
      expect(index.get('capgemini')).toEqual({
        rank2: 1,
        knownRelationship: 2,
        observedAtAccounts: 0,
        unresolvedAtAccounts: 0,
      })
    })

    it('garde le maximum sur un doublon de nom normalisé, comme buildPartnerCoverageIndex', () => {
      const index = buildPartnerRelationIndex([
        { name: 'Capgemini', rank2: 0, knownRelationship: 1 },
        { name: 'CAPGEMINI', rank2: 2, knownRelationship: 0 },
      ])
      expect(index.get('capgemini')).toEqual({
        rank2: 2,
        knownRelationship: 1,
        observedAtAccounts: 0,
        unresolvedAtAccounts: 0,
      })
    })

    it('un champ absent (fenêtre de déploiement) compte comme 0, jamais deviné', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini' }])
      expect(index.get('capgemini')).toEqual({
        rank2: 0,
        knownRelationship: 0,
        observedAtAccounts: 0,
        unresolvedAtAccounts: 0,
      })
    })
  })

  describe('passesExistingRelationship', () => {
    it('décoché, rien ne change', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini', knownRelationship: 0 }])
      expect(passesExistingRelationship('Capgemini', false, index)).toBe(true)
    })

    it('coché, écarte une ESN dont la relation reste inconnue partout — unknown n’est jamais confondu avec connu (GA-18/GA-19)', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini', knownRelationship: 0 }])
      expect(passesExistingRelationship('Capgemini', true, index)).toBe(false)
    })

    it('coché, garde une ESN dont la relation est connue sur au moins un compte', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini', knownRelationship: 1 }])
      expect(passesExistingRelationship('Capgemini', true, index)).toBe(true)
    })

    it('coché, une ESN JAMAIS vue est écartée — l’absence n’est affirmée « relation inconnue » qu’au moment où le filtre est posé', () => {
      const index = buildPartnerRelationIndex([])
      expect(passesExistingRelationship('ESN Inconnue', false, index)).toBe(true)
      expect(passesExistingRelationship('ESN Inconnue', true, index)).toBe(false)
    })
  })

  describe('passesRank2Opening', () => {
    it('décoché, rien ne change', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini', rank2: 0 }])
      expect(passesRank2Opening('Capgemini', false, index)).toBe(true)
    })

    it('coché, écarte une ESN jamais en rang 2', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini', rank2: 0 }])
      expect(passesRank2Opening('Capgemini', true, index)).toBe(false)
    })

    it('coché, garde une ESN en rang 2 sur au moins un compte', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini', rank2: 1 }])
      expect(passesRank2Opening('Capgemini', true, index)).toBe(true)
    })
  })

  /**
   * #2165.56 / #2151.34 — DÉCISION Louis 19/09 (doctrine #2298.9) : le statut
   * de rang 2 d'UNE LIGNE a trois états, jamais deux. `declaredIndex` porte
   * `esn_directory.open_to_subcontracting === 'oui'` (l'ESN parle d'elle-même,
   * agrégat communautaire ≥ 3 espaces, `GET /partners/profile-matches`) ;
   * `relationIndex` porte l'observé de l'espace (`rank2`, `on-my-accounts`).
   * Une ESN observée n'implique PAS qu'elle accepte le rang 2 ailleurs — les
   * deux restent deux faits distincts, jamais fondus en un seul booléen.
   */
  describe('rank2StatusFor (#2165.56 / #2151.34)', () => {
    it('déclaré : la ligne prime, même sans observation sur nos dossiers', () => {
      const relationIndex = buildPartnerRelationIndex([{ name: 'Capgemini', rank2: 0 }])
      const declaredIndex = new Map([['capgemini', true]])
      expect(rank2StatusFor('Capgemini', relationIndex, declaredIndex)).toBe('declared')
    })

    it('observé : rang 2 vu sur au moins un dossier de l’espace, sans déclaration de l’ESN', () => {
      const relationIndex = buildPartnerRelationIndex([{ name: 'Halden Numérique', rank2: 1 }])
      expect(rank2StatusFor('Halden Numérique', relationIndex, new Map())).toBe('observed')
    })

    it('inconnu : ni déclaré ni observé — jamais un « non » deviné', () => {
      const relationIndex = buildPartnerRelationIndex([{ name: 'Capgemini', rank2: 0 }])
      expect(rank2StatusFor('Capgemini', relationIndex, new Map())).toBe('unknown')
    })

    it('inconnu : une ESN jamais vue dans aucun des deux index', () => {
      expect(rank2StatusFor('ESN Jamais Vue', new Map(), new Map())).toBe('unknown')
    })
  })

  /**
   * #2165.56 — `GET /partners/profile-matches` (`ProfileMatchEsn.
   * openToSubcontracting`) donne le référentiel ESN partagé, agrégat
   * communautaire ≥ 3 espaces. Seul `'oui'` compte comme déclaré : `'non'`
   * et `'inconnu'` ne sont pas une preuve, et une absence n'en est pas une
   * non plus — même règle que `applyDeclaredSubcontracting`
   * (`apps/api/.../partners/declared-subcontracting.ts`).
   */
  describe('buildDeclaredRank2Index (#2165.56)', () => {
    it('ne retient que `openToSubcontracting === "oui"`, normalisé par nom', () => {
      const index = buildDeclaredRank2Index([
        { name: '  Capgemini  ', openToSubcontracting: 'oui' },
        { name: 'Sopra Steria', openToSubcontracting: 'non' },
        { name: 'Atos', openToSubcontracting: 'inconnu' },
      ])
      expect(index.get('capgemini')).toBe(true)
      expect(index.has('sopra steria')).toBe(false)
      expect(index.has('atos')).toBe(false)
    })

    it('une liste vide (aucune correspondance géographique) rend un index vide, jamais deviné', () => {
      expect(buildDeclaredRank2Index([]).size).toBe(0)
    })
  })
})

describe('clients observés (#2151.32, agrégat de l’espace, mémoire marché)', () => {
  describe('buildPartnerRelationIndex porte aussi les deux compteurs d’observation', () => {
    it('un champ absent (fenêtre de déploiement) compte comme 0, jamais deviné', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini' }])
      expect(index.get('capgemini')).toEqual({
        rank2: 0,
        knownRelationship: 0,
        observedAtAccounts: 0,
        unresolvedAtAccounts: 0,
      })
    })

    it('garde le MAXIMUM sur un doublon de nom normalisé, comme rank2/knownRelationship', () => {
      const index = buildPartnerRelationIndex([
        { name: 'Capgemini', observedAtAccounts: 1, unresolvedAtAccounts: 3 },
        { name: 'CAPGEMINI', observedAtAccounts: 2, unresolvedAtAccounts: 0 },
      ])
      expect(index.get('capgemini')).toEqual({
        rank2: 0,
        knownRelationship: 0,
        observedAtAccounts: 2,
        unresolvedAtAccounts: 3,
      })
    })
  })

  describe('passesObservedClients', () => {
    it('décoché, rien ne change', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini', observedAtAccounts: 0 }])
      expect(passesObservedClients('Capgemini', false, index)).toBe(true)
    })

    it('coché, garde une ESN observée sur au moins un compte', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini', observedAtAccounts: 1 }])
      expect(passesObservedClients('Capgemini', true, index)).toBe(true)
    })

    it('coché, écarte une ESN dont TOUS les comptes ont été résolus et ne l’ont pas observée', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini', observedAtAccounts: 0, unresolvedAtAccounts: 0 }])
      expect(passesObservedClients('Capgemini', true, index)).toBe(false)
    })

    it('coché, ne rejette JAMAIS silencieusement un compte INCONNU — GA-18/GA-19, doctrine c65/GA-259', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini', observedAtAccounts: 0, unresolvedAtAccounts: 1 }])
      expect(passesObservedClients('Capgemini', true, index)).toBe(true)
    })

    it('coché, une ESN JAMAIS vue est écartée — même règle que passesExistingRelationship', () => {
      const index = buildPartnerRelationIndex([])
      expect(passesObservedClients('ESN Inconnue', false, index)).toBe(true)
      expect(passesObservedClients('ESN Inconnue', true, index)).toBe(false)
    })
  })

  describe('isObservedClientsUnknown — ce qui alimente le compteur « inconnu » à l’écran', () => {
    it('faux quand l’ESN est réellement observée', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini', observedAtAccounts: 1, unresolvedAtAccounts: 1 }])
      expect(isObservedClientsUnknown('Capgemini', index)).toBe(false)
    })

    it('vrai quand seul un compte NON RÉSOLU explique qu’elle passe le filtre', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini', observedAtAccounts: 0, unresolvedAtAccounts: 1 }])
      expect(isObservedClientsUnknown('Capgemini', index)).toBe(true)
    })

    it('faux quand l’ESN est absente de l’index (hors périmètre de la question, pas « inconnue »)', () => {
      const index = buildPartnerRelationIndex([])
      expect(isObservedClientsUnknown('ESN Inconnue', index)).toBe(false)
    })
  })

  // #2165.51 — panneau Partenaires, filtre Expertise (secteur résolu au
  // registre, `DiscoverCandidate.sector`). Fait DIRECT du candidat, pas un
  // agrégat de l'espace : contrairement à `passesObservedClients`, l'inconnu
  // est ÉCARTÉ quand le filtre est coché, mais toujours compté à part.
  describe('passesExpertiseKnown', () => {
    it('décoché, rien ne change — même un secteur non résolu passe', () => {
      expect(passesExpertiseKnown(candidate({ sector: null }), false)).toBe(true)
    })

    it('coché, garde un candidat dont le secteur est résolu', () => {
      expect(passesExpertiseKnown(candidate({ sector: 'Édition de logiciels' }), true)).toBe(true)
    })

    it('coché, écarte un candidat sans secteur résolu — mais ne le confond pas avec « sans expertise »', () => {
      expect(passesExpertiseKnown(candidate({ sector: null }), true)).toBe(false)
    })
  })

  describe('isExpertiseUnknown — ce qui alimente le compteur affiché à côté du filtre', () => {
    it('vrai quand le secteur n’a pas été résolu', () => {
      expect(isExpertiseUnknown(candidate({ sector: null }))).toBe(true)
    })

    it('faux quand le secteur est résolu', () => {
      expect(isExpertiseUnknown(candidate({ sector: 'Conseil en systèmes informatiques' }))).toBe(false)
    })
  })
})

/**
 * #2151.33 / #2151.34 — DÉCISION Louis 18/09 (registre #2151.34) : « une
 * valeur non mesurée n'est jamais comptée « non » : elle reste « inconnu »,
 * et le filtre le dit. » Défaut mesuré en prod le 18/09 : preset « Trouver
 * des partenaires ou ESN » trouvait 7 ESN, le chip « Relation déjà qualifiée »
 * les retirait TOUTES (relation `unknown` partout), et l'écran rendait
 * `partners.empty` (« aucune ESN dans cette recherche ») — un mensonge : la
 * recherche EN avait trouvé 7, c'est le filtre qui les a retirées.
 */
describe('le filtre dit ce qu’il a retiré, inconnu ≠ non (#2151.33 / #2151.34)', () => {
  describe('isRank2OpeningUnknown', () => {
    it('faux quand l’ESN est présente ailleurs (rang connu, non rang 2) — un « non » mesuré, pas une absence de mesure', () => {
      const relationIndex = buildPartnerRelationIndex([{ name: 'Capgemini', rank2: 0 }])
      const coverageIndex = buildPartnerCoverageIndex([{ name: 'Capgemini', accounts: 2 }])
      expect(isRank2OpeningUnknown('Capgemini', relationIndex, coverageIndex)).toBe(false)
    })

    it('vrai quand l’ESN n’a JAMAIS été vue sur aucun compte de l’espace — aucune mesure à opposer au filtre', () => {
      const relationIndex = buildPartnerRelationIndex([])
      const coverageIndex = buildPartnerCoverageIndex([])
      expect(isRank2OpeningUnknown('ESN Inconnue', relationIndex, coverageIndex)).toBe(true)
    })

    it('faux quand l’ESN tient bien le rang 2 (le filtre la garde, la question ne se pose pas ici)', () => {
      const relationIndex = buildPartnerRelationIndex([{ name: 'Capgemini', rank2: 1 }])
      const coverageIndex = buildPartnerCoverageIndex([{ name: 'Capgemini', accounts: 1 }])
      expect(isRank2OpeningUnknown('Capgemini', relationIndex, coverageIndex)).toBe(false)
    })
  })

  describe('isExistingRelationshipUnknown', () => {
    it('vrai quand la relation reste inconnue partout — la relation est TERNAIRE (partner/competitor/unknown), aucun « non » mesuré n’existe', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini', knownRelationship: 0 }])
      expect(isExistingRelationshipUnknown('Capgemini', index)).toBe(true)
    })

    it('faux quand la relation est connue sur au moins un compte', () => {
      const index = buildPartnerRelationIndex([{ name: 'Capgemini', knownRelationship: 1 }])
      expect(isExistingRelationshipUnknown('Capgemini', index)).toBe(false)
    })
  })

  describe('buildRelationChipImpacts', () => {
    const chipsOff = { existingRelationshipOnly: false, rank2OpeningOnly: false, observedClientsOnly: false }

    it('rend un tableau vide quand aucun chip n’est actif', () => {
      const relationIndex = buildPartnerRelationIndex([])
      const coverageIndex = buildPartnerCoverageIndex([])
      expect(buildRelationChipImpacts([{ name: 'Capgemini' }], chipsOff, relationIndex, coverageIndex)).toEqual([])
    })

    it('reproduit le défaut mesuré en prod : 7 ESN retirées, 7 pour cause d’inconnu, jamais de « non »', () => {
      const names = Array.from({ length: 7 }, (_, i) => ({ name: `ESN ${i}` }))
      const relationIndex = buildPartnerRelationIndex(names.map(c => ({ name: c.name, knownRelationship: 0 })))
      const coverageIndex = buildPartnerCoverageIndex([])
      const impacts = buildRelationChipImpacts(
        names,
        { ...chipsOff, existingRelationshipOnly: true },
        relationIndex,
        coverageIndex,
      )
      expect(impacts).toEqual([{ key: 'existingRelationship', removedCount: 7, unknownCount: 7 }])
    })

    it('rang 2 : sépare le retiré « inconnu » du retiré « non mesuré »', () => {
      const relationIndex = buildPartnerRelationIndex([
        { name: 'Jamais Vue', rank2: 0 },
        { name: 'Rang 1 Connu', rank2: 0 },
      ])
      const coverageIndex = buildPartnerCoverageIndex([{ name: 'Rang 1 Connu', accounts: 1 }])
      const impacts = buildRelationChipImpacts(
        [{ name: 'Jamais Vue' }, { name: 'Rang 1 Connu' }],
        { ...chipsOff, rank2OpeningOnly: true },
        relationIndex,
        coverageIndex,
      )
      expect(impacts).toEqual([{ key: 'rank2Opening', removedCount: 2, unknownCount: 1 }])
    })

    it('clients observés : ce que le filtre retire est toujours un « non » résolu, jamais un inconnu (doctrine c65/GA-259)', () => {
      const relationIndex = buildPartnerRelationIndex([
        { name: 'Capgemini', observedAtAccounts: 0, unresolvedAtAccounts: 0 },
      ])
      const coverageIndex = buildPartnerCoverageIndex([])
      const impacts = buildRelationChipImpacts(
        [{ name: 'Capgemini' }],
        { ...chipsOff, observedClientsOnly: true },
        relationIndex,
        coverageIndex,
      )
      expect(impacts).toEqual([{ key: 'observedClients', removedCount: 1, unknownCount: 0 }])
    })

    it('plusieurs chips actifs : chacun est compté sur le MÊME pool de départ, jamais en chaîne (le second n’hérite pas du retrait du premier)', () => {
      const relationIndex = buildPartnerRelationIndex([
        { name: 'ESN A', knownRelationship: 0, rank2: 0 },
        { name: 'ESN B', knownRelationship: 1, rank2: 0 },
      ])
      const coverageIndex = buildPartnerCoverageIndex([{ name: 'ESN B', accounts: 1 }])
      const impacts = buildRelationChipImpacts(
        [{ name: 'ESN A' }, { name: 'ESN B' }],
        { existingRelationshipOnly: true, rank2OpeningOnly: true, observedClientsOnly: false },
        relationIndex,
        coverageIndex,
      )
      expect(impacts).toEqual([
        { key: 'existingRelationship', removedCount: 1, unknownCount: 1 },
        { key: 'rank2Opening', removedCount: 2, unknownCount: 1 },
      ])
    })
  })
})

/* ------------------------------------------------------------------ */
/*  #2291.2 — « recourt au freelance / à la régie » (observé)           */
/* ------------------------------------------------------------------ */

describe('#2291.2 — recourt au freelance / à la régie, sur l’observation seule', () => {
  type JobCounts = Partial<Record<'permanent' | 'fixedTerm' | 'interim' | 'freelance' | 'other', number>>
  const offers = (counts: JobCounts) => {
    const full = { permanent: 0, fixedTerm: 0, interim: 0, freelance: 0, other: 0, ...counts }
    return {
      source: 'France Travail',
      total: Object.values(full).reduce((a, b) => a + b, 0),
      counts: full,
      since: '2026-06-01',
      until: '2026-09-01',
    }
  }
  const freelance = candidate({
    siren: '1',
    contractModel: {
      observedAt: '2026-09-19',
      jobOffers: offers({ permanent: 9, freelance: 3 }),
      publicContracts: null,
    },
  })
  const regie = candidate({
    siren: '2',
    contractModel: {
      observedAt: '2026-09-19',
      jobOffers: null,
      publicContracts: { source: 'BOAMP', total: 2, regie: 1, fixedPrice: 1, since: '2026-02-01', until: '2026-08-01' },
    },
  })
  const salaried = candidate({
    siren: '3',
    contractModel: { observedAt: '2026-09-19', jobOffers: offers({ permanent: 4, interim: 2 }), publicContracts: null },
  })
  const searchedNotObserved = candidate({ siren: '4', contractModel: null })
  const neverSearched = candidate({ siren: '5' })
  const pool = [freelance, regie, salaried, searchedNotObserved, neverSearched]

  it('décoché : aucune contrainte, rien n’est retiré', () => {
    expect(applyRailConstraints(pool, unified(), 'registry')).toHaveLength(5)
    expect(contractRecourseImpact(pool, unified())).toBeNull()
  })

  it.each(['registry', 'signals'] as const)(
    'coché (%s) : ne garde que l’indépendant ou la régie OBSERVÉS — croisé à l’écran',
    mode => {
      const filters = unified({
        contractRecourseObserved: true,
        ...(mode === 'signals' ? { signalSources: ['hiring'] as SignalSource[] } : {}),
      })
      expect(applyRailConstraints(pool, filters, mode).map(c => c.siren)).toEqual(['1', '2'])
    },
  )

  it('l’intérim seul n’est ni de l’indépendant ni de la régie', () => {
    expect(applyRailConstraints([salaried], unified({ contractRecourseObserved: true }), 'registry')).toEqual([])
  })

  it('le filtre DIT ce qu’il retire : un inconnu reste inconnu, jamais un « non »', () => {
    expect(contractRecourseImpact(pool, unified({ contractRecourseObserved: true }))).toEqual({
      removedCount: 3,
      unknownCount: 2,
    })
  })

  it('compte comme un critère posé', () => {
    expect(countActiveFilters(unified({ contractRecourseObserved: true }))).toBe(1)
  })
})

// #4316.1 / #4318.1 — UN champ « Compétences » : « SAP » seul lance une recherche.
describe('skillsText / withSkills (#4316.1, #4318.1)', () => {
  it('« SAP » seul pose les deux critères et rend la requête lançable (SAIT DIRE NON sans)', () => {
    expect(isUnifiedRunnable(emptyUnifiedFilters())).toBe(false)
    const filters = withSkills(emptyUnifiedFilters(), 'SAP')
    expect(skillsText(filters)).toBe('SAP')
    expect(filters.keywords).toBe('SAP')
    expect(filters.technologiesObserved).toBe('SAP')
    expect(isUnifiedRunnable(filters)).toBe(true)
  })
})

// KEVIN-FIX K.4 — les compétences saisies PÈSENT dans le rang : le compte dont un signal cite la techno passe avant.
describe('skillCitationFirst', () => {
  const cites = candidate({
    name: 'CITE',
    signals: [{ type: 'hiring', label: 'Développeur Java Spring', date: '2026-10-01' }],
  })
  const citesMore = candidate({
    name: 'CITE-PLUS',
    signals: [{ type: 'hiring', label: 'Full stack', date: '2026-10-01', technologies: ['Java', 'Spring', 'Vue'] }],
  })
  const silent = candidate({ name: 'SILENCE', signals: [{ type: 'hiring', label: 'Comptable', date: '2026-10-01' }] })
  const none = candidate({ name: 'AUCUN' })

  it('place d’abord le compte qui cite le plus de compétences saisies, sans rien retirer', () => {
    const ranked = skillCitationFirst(
      [silent, none, cites, citesMore],
      unified({ technologiesObserved: 'Java Spring Vue' }),
    )
    expect(ranked.map(c => c.name)).toEqual(['CITE-PLUS', 'CITE', 'SILENCE', 'AUCUN'])
  })

  it('rend la liste telle quelle sans compétence saisie (la garde sait dire NON)', () => {
    const list = [silent, none, cites]
    expect(skillCitationFirst(list, unified()).map(c => c.name)).toEqual(['SILENCE', 'AUCUN', 'CITE'])
  })

  it('« java » ne recoupe pas « javascript » (mot entier)', () => {
    const js = candidate({ name: 'JS', signals: [{ type: 'hiring', label: 'Dev JavaScript', date: '2026-10-01' }] })
    expect(skillCitationFirst([js, cites], unified({ technologiesObserved: 'Java' })).map(c => c.name)).toEqual([
      'CITE',
      'JS',
    ])
  })
})

describe('#4361.2 — excludeListed dans le rail unifié', () => {
  it('compte comme un critère, et part dans la requête registre', () => {
    const filters = { ...emptyUnifiedFilters(), nafCode: '62.01Z', excludeListed: true }
    expect(countActiveFilters(filters)).toBe(2)
    const request = buildDiscoverRequest(filters)
    expect(request?.mode === 'registry' && request.query.filters.excludeListed).toBe(true)
  })

  it('rail vierge : l’interrupteur est éteint', () => {
    expect(emptyUnifiedFilters().excludeListed).toBe(false)
  })
})

// Louis 25/10 : « pour pas faire un Lille → France trop rapidement ». Le geste manuel franchit UN barreau.
describe('widenZoneOneStep', () => {
  it('ville + département + région : ne retire que la ville, jamais les trois d’un coup', () => {
    const wider = widenZoneOneStep(unified({ city: 'Lille', department: '59', region: ['HDF'] }))
    expect(wider.city).toBe('')
    expect(wider.department).toBe('59')
    expect(wider.region).toEqual(['HDF'])
  })

  it('département + région : ne retire que le département', () => {
    const wider = widenZoneOneStep(unified({ department: '59', region: ['HDF'] }))
    expect(wider.department).toBe('')
    expect(wider.region).toEqual(['HDF'])
  })

  it('région seule : c’est le dernier barreau posé, il se retire', () => {
    expect(widenZoneOneStep(unified({ region: ['HDF'] })).region).toEqual([])
  })

  it('ville seule avec un rayon plus étroit que le défaut : revient au rayon par défaut, la ville reste', () => {
    const wider = widenZoneOneStep(unified({ city: 'Lille', cityRadiusKm: '10' }))
    expect(wider.city).toBe('Lille')
    // #4515 (01/11) — le défaut est 25 km (100 km du 27/10, #4641, révisé).
    expect(wider.cityRadiusKm).toBe('25')
  })

  it('ne touche à aucun autre critère', () => {
    const wider = widenZoneOneStep(unified({ city: 'Lille', headcount: ['1000+'], freetext: 'Java' }))
    expect(wider.headcount).toEqual(['1000+'])
    expect(wider.freetext).toBe('Java')
  })
})

describe('« clients finaux uniquement » (#4746)', () => {
  const esn = candidate({ name: 'ESN', isEsnPeer: true })
  const platform = candidate({ name: 'PLATEFORME', isIntermediary: true })
  const partner = candidate({ name: 'PARTENAIRE', isDeclaredPartner: true })
  const client = candidate({ name: 'USINE' })
  const unknown = candidate({ name: 'NON CLASSÉ', isEsnPeer: undefined })
  const pool = [esn, platform, partner, client, unknown]

  it.each(['registry', 'signals'] as const)('retire ESN, plateforme et partenaire déclaré en mode %s', mode => {
    const kept = applyRailConstraints(pool, unified({ entityType: 'client' }), mode, NOW)
    expect(kept.map(c => c.name)).toEqual(['USINE', 'NON CLASSÉ'])
  })

  // #4814 — arbitrage Louis 31/10 : intérim, VMS, MSP, apporteurs d'affaires sortent par le MÊME drapeau
  // (`isIntermediary`, posé par le service IA) — un seul chemin d'exclusion (GA-26), pas un second.
  it.each([
    ['agence d’intérim', 'entreprise de travail temporaire'],
    ['VMS', 'plateforme de gestion de fournisseurs (VMS)'],
    ['MSP', "prestataire d'infogérance (MSP)"],
    ['apporteur d’affaires', "courtier ou apporteur d'affaires"],
  ])('retire %s en mode registre comme en mode signaux, et garde un vrai client final', () => {
    const family = candidate({ name: 'FAMILLE', isIntermediary: true })
    for (const mode of ['registry', 'signals'] as const) {
      const kept = applyRailConstraints([family, client], unified({ entityType: 'client' }), mode, NOW)
      expect(kept.map(c => c.name)).toEqual(['USINE'])
    }
  })

  it('ne retire rien en lecture « ESN » ni « tous » : le rang 2 reste une capacité voulue', () => {
    for (const entityType of ['esn', 'all'] as const) {
      expect(applyRailConstraints(pool, unified({ entityType }), 'signals', NOW)).toHaveLength(pool.length)
    }
  })
})

/* ------------------------------------------------------------------ */
/*  #4627 — le rayon prime sur le nom de ville (revient sur GA-275)      */
/* ------------------------------------------------------------------ */

describe('applyRailConstraints — ville + rayon en mode Signaux (#4627)', () => {
  const lyon = candidate({ siren: '1', city: 'Lyon' })
  const grenoble = candidate({ siren: '2', city: 'Grenoble' }) // ~94 km de Lyon
  const marseille = candidate({ siren: '3', city: 'Marseille' }) // ~275 km de Lyon
  const unknownTown = candidate({ siren: '4', city: 'Saint-Trucmuche' }) // coordonnées inconnues
  const keep = (radius: UnifiedFilters['cityRadiusKm']) =>
    applyRailConstraints(
      [lyon, grenoble, marseille, unknownTown],
      unified({ city: 'Lyon', cityRadiusKm: radius }),
      'signals',
      NOW,
    ).map(c => c.siren)

  it('garde une commune voisine dans le cercle de 100 km', () => {
    expect(keep('100')).toEqual(['1', '2'])
  })

  it('écarte une commune hors du cercle, même plus large que le rayon choisi', () => {
    expect(keep('50')).toEqual(['1'])
    expect(keep('100')).not.toContain('3')
  })

  it('« ville exacte » et coordonnées inconnues : la règle du nom', () => {
    expect(keep('any')).toEqual(['1'])
    expect(keep('100')).not.toContain('4')
  })
})

/* ------------------------------------------------------------------ */
/*  #5069 — le rayon lit le référentiel de TOUTES les communes            */
/* ------------------------------------------------------------------ */

describe('applyRailConstraints — rayon en km sur toutes les communes (#5069)', () => {
  const pool = [
    candidate({ siren: '1', city: 'Lille', department: '59' }),
    candidate({ siren: '2', city: 'Roubaix', department: '59' }),
    candidate({ siren: '3', city: 'Tourcoing', department: '59' }),
    candidate({ siren: '4', city: "Villeneuve-d'Ascq", department: '59' }),
    candidate({ siren: '5', city: 'Arras', department: '62' }), // ~50 km de Lille
    candidate({ siren: '6', city: 'Saint-Denis' }), // homonyme, aucun département
    candidate({ siren: '7', city: 'Saint-Trucmuche' }), // inconnue
  ]
  const keep = (filters: Partial<UnifiedFilters>) =>
    applyRailConstraints(pool, unified({ cityRadiusKm: '25', ...filters }), 'signals', NOW).map(c => c.siren)

  it("Lille + 25 km : Roubaix, Tourcoing et Villeneuve-d'Ascq dedans, Arras dehors", () => {
    expect(keep({ city: 'Lille' })).toEqual(['1', '2', '3', '4'])
  })

  it("un homonyme sans département n'a pas de distance devinée : la règle du nom", () => {
    expect(keep({ city: 'Lille' })).not.toContain('6')
    expect(keep({ city: 'Saint-Denis', cityRadiusKm: '25' })).toEqual(['6'])
  })

  it('un homonyme départagé par le département de la fiche entre dans le cercle', () => {
    const paris = candidate({ siren: '8', city: 'Paris', department: '75' })
    const denis = candidate({ siren: '9', city: 'Saint-Denis', department: '93' })
    const kept = applyRailConstraints([paris, denis], unified({ city: 'Paris', cityRadiusKm: '25' }), 'signals', NOW)
    expect(kept.map(c => c.siren)).toEqual(['8', '9'])
  })

  it('normalise accents, tirets et « St » côté fiche comme côté recherche', () => {
    const saint = candidate({ siren: '10', city: 'ST-ÉTIENNE', department: '42' })
    expect(
      applyRailConstraints([saint], unified({ city: 'saint etienne', cityRadiusKm: '25' }), 'signals', NOW),
    ).toHaveLength(1)
  })
})
