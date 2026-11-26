import {
  deriveCaseMemory,
  deriveSimilarCases,
  meetingSourceGap,
  medianClosedCycleDays,
  observedCycleDays,
  openAgeDays,
  relationStageOf,
  similarityDimensionGaps,
  timingOf,
  type CaseCandidate,
  type CaseTarget,
} from './similar-cases'

/**
 * #3210 (LAU-FINAL-216, beta 28/09/2026) — « cette situation ressemble à un
 * cas que ton équipe a déjà réussi — ou échoué — pour telles raisons. »
 *
 * Fonction pure, testée seule : la lecture DB (REX + opportunités perdues)
 * vit dans `CapitalisationService.similarCases`.
 */
function target(overrides: Partial<CaseTarget> = {}): CaseTarget {
  return { accountId: 'target', sector: 'Banque', employees: '500-1000', groupRole: null, ...overrides }
}

function candidate(overrides: Partial<CaseCandidate> = {}): CaseCandidate {
  return {
    accountId: 'c1',
    accountLabel: 'Geodis',
    sector: 'Banque',
    employees: '500-1000',
    groupRole: null,
    outcome: 'won',
    missionLabel: "Audit d'entrée",
    whatWorked: 'Verticalisation et direction de programme identifiable.',
    whatFailed: null,
    projectLabel: null,
    lossReason: null,
    closedAt: '2026-06-01',
    ...overrides,
  }
}

describe('deriveSimilarCases', () => {
  it('nomme les similitudes réelles (secteur, taille) plutôt que de les deviner', () => {
    const [result] = deriveSimilarCases(target(), [candidate()])
    expect(result.similarities).toEqual(
      expect.arrayContaining([expect.stringContaining('secteur'), expect.stringContaining('Taille')]),
    )
    expect(result.differences).toEqual([])
  })

  it('nomme les différences plutôt que de les taire', () => {
    const [result] = deriveSimilarCases(target(), [candidate({ employees: '10-50' })])
    expect(result.differences).toEqual([expect.stringContaining('Taille différente')])
  })

  it('exclut le compte cible lui-même — jamais un cas comparé à lui-même', () => {
    const result = deriveSimilarCases(target({ accountId: 'same' }), [candidate({ accountId: 'same' })])
    expect(result).toEqual([])
  })

  it('exclut un candidat sans aucun point commun mesurable — jamais une analogie sans matière', () => {
    const result = deriveSimilarCases(target(), [candidate({ sector: null, employees: null, groupRole: null })])
    expect(result).toEqual([])
  })

  it("#3210.5 — porte aussi les cas PERDUS, avec leur raison d'échec", () => {
    const [result] = deriveSimilarCases(target(), [
      candidate({
        outcome: 'lost',
        missionLabel: null,
        whatWorked: null,
        projectLabel: 'Grand groupe bancaire',
        lossReason: 'Aucune relation préalable, porte fermée.',
      }),
    ])
    expect(result.outcome).toBe('lost')
    expect(result.lossReason).toBe('Aucune relation préalable, porte fermée.')
  })

  it('classe les meilleurs points communs en premier et plafonne à trois cas', () => {
    const many = Array.from({ length: 5 }, (_, i) => candidate({ accountId: `c${i}`, closedAt: `2026-01-0${i + 1}` }))
    const oneMatch = candidate({ accountId: 'weak', employees: '10-50', groupRole: null })
    const result = deriveSimilarCases(target(), [oneMatch, ...many])
    expect(result).toHaveLength(3)
    expect(result.every(r => r.similarities.length >= 2)).toBe(true)
  })

  it("ne prétend jamais qu'une différence est une similitude quand une donnée manque", () => {
    const [result] = deriveSimilarCases(target({ groupRole: 'filiale' }), [candidate({ groupRole: null })])
    // groupRole du candidat est inconnu : ni similitude ni différence sur cet axe.
    expect(result.similarities.some(s => s.includes('groupe'))).toBe(false)
    expect(result.differences.some(s => s.includes('groupe'))).toBe(false)
  })

  describe('#3210.3 — dimensions structurées supplémentaires (territoire, expertise, périmètre, accès, offre)', () => {
    it('compare le pays du registre, le domaine, les secteurs applicatifs, le mode d’accès et l’offre quand les DEUX côtés les portent', () => {
      const [result] = deriveSimilarCases(
        target({
          country: 'FR',
          domainCode: 'data_engineering',
          sectorCodes: ['banque', 'assurance'],
          accessMode: 'direct_reference',
          offer: 'Tierce maintenance applicative',
        }),
        [
          candidate({
            country: 'FR',
            domainCode: 'data_engineering',
            sectorCodes: ['assurance', 'sante'],
            accessMode: 'direct_reference',
            offer: ' tierce MAINTENANCE applicative ',
          }),
        ],
      )
      expect(result.similarities).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Même territoire'),
          expect.stringContaining('Même expertise'),
          expect.stringContaining('Périmètre applicatif en commun'),
          expect.stringContaining('Même niveau d’accès'),
          expect.stringContaining('Même offre'),
        ]),
      )
    })

    it('nomme les différences de ces dimensions au lieu de les taire', () => {
      const [result] = deriveSimilarCases(target({ country: 'FR', domainCode: 'cloud' }), [
        candidate({ country: 'BE', domainCode: 'data_engineering' }),
      ])
      expect(result.differences).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Territoire différent'),
          expect.stringContaining('Expertise différente'),
        ]),
      )
    })

    it('une dimension absente d’un côté ne produit NI similitude NI différence (jamais devinée)', () => {
      const [result] = deriveSimilarCases(target({ country: 'FR', accessMode: 'direct_reference' }), [
        candidate({ country: null, accessMode: null }),
      ])
      const all = [...result.similarities, ...result.differences].join(' ')
      expect(all).not.toMatch(/territoire|accès/i)
    })

    it('deux listes de secteurs applicatifs disjointes = une différence, pas un point commun', () => {
      const result = deriveSimilarCases(target({ sector: null, employees: null, sectorCodes: ['banque'] }), [
        candidate({ sector: null, employees: null, sectorCodes: ['sante'] }),
      ])
      // Aucun point commun mesurable : exclu, jamais une analogie sans matière.
      expect(result).toEqual([])
    })

    it('un candidat qui ne partage QUE le territoire est retenu (la dimension compte comme un axe)', () => {
      const result = deriveSimilarCases(target({ sector: null, employees: null, country: 'FR' }), [
        candidate({ sector: null, employees: null, country: 'FR' }),
      ])
      expect(result).toHaveLength(1)
    })
  })

  describe('#3210.1 — partenaire en place (account_partners)', () => {
    it('nomme les partenaires en commun, égalité stricte après normalisation', () => {
      const [result] = deriveSimilarCases(target({ partners: ['Alten', 'Sopra Steria'] }), [
        candidate({ partners: [' ALTEN ', 'Capgemini'] }),
      ])
      expect(result.similarities).toEqual(expect.arrayContaining(['Partenaire en place en commun (Alten).']))
    })

    it('deux listes sans partenaire commun : une différence, pas une similitude', () => {
      const [result] = deriveSimilarCases(target({ partners: ['Alten'] }), [candidate({ partners: ['Capgemini'] })])
      expect(result.differences).toContain('Aucun partenaire en place en commun.')
      expect(result.similarities.join(' ')).not.toContain('Partenaire')
    })

    it('sait dire NON : un côté sans partenaire connu ne produit NI similitude NI différence', () => {
      for (const [t, c] of [
        [undefined, ['Alten']],
        [['Alten'], undefined],
        [[], ['Alten']],
        [['Alten'], null],
      ] as const) {
        const [result] = deriveSimilarCases(target({ partners: t }), [candidate({ partners: c })])
        expect([...result.similarities, ...result.differences].join(' ')).not.toMatch(/artenaire/)
      }
    })

    it('un candidat qui ne partage QUE le partenaire est retenu', () => {
      const result = deriveSimilarCases(target({ sector: null, employees: null, partners: ['Alten'] }), [
        candidate({ sector: null, employees: null, partners: ['Alten'] }),
      ])
      expect(result).toHaveLength(1)
    })
  })

  describe('#3210.1 (lot R17) — canaux déjà utilisés (outreach_messages.channel)', () => {
    it('nomme le canal en commun, égalité stricte après normalisation', () => {
      const [result] = deriveSimilarCases(target({ channels: ['LinkedIn', 'email'] }), [
        candidate({ channels: [' LINKEDIN ', 'téléphone'] }),
      ])
      expect(result.similarities).toEqual(expect.arrayContaining(['Même canal déjà utilisé (LinkedIn).']))
    })

    it('deux listes de canaux sans recoupement : une différence, pas une similitude', () => {
      const [result] = deriveSimilarCases(target({ channels: ['email'] }), [candidate({ channels: ['LinkedIn'] })])
      expect(result.differences).toContain('Aucun canal de prise de contact en commun.')
      expect(result.similarities.join(' ')).not.toContain('canal')
    })

    it('sait dire NON : un côté sans canal connu ne produit NI similitude NI différence', () => {
      for (const [t, c] of [
        [undefined, ['email']],
        [['email'], undefined],
        [[], ['email']],
        [['email'], null],
      ] as const) {
        const [result] = deriveSimilarCases(target({ channels: t }), [candidate({ channels: c })])
        expect([...result.similarities, ...result.differences].join(' ')).not.toMatch(/canal/)
      }
    })
  })

  describe('#3210.1 (lot R17) — référence client publiable (testimonials.publishable)', () => {
    it('nomme la disponibilité quand les DEUX côtés ont une référence publiable', () => {
      const [result] = deriveSimilarCases(target({ hasPublishableReference: true }), [
        candidate({ hasPublishableReference: true }),
      ])
      expect(result.similarities).toContain('Référence client publiable disponible des deux côtés.')
    })

    it('sait dire NON : un seul côté avec une référence ne produit NI similitude NI différence (jamais devinée)', () => {
      for (const [t, c] of [
        [true, false],
        [false, true],
        [false, false],
      ] as const) {
        const [result] = deriveSimilarCases(target({ hasPublishableReference: t }), [
          candidate({ hasPublishableReference: c }),
        ])
        expect([...result.similarities, ...result.differences].join(' ')).not.toMatch(/[Rr]éférence/)
      }
    })
  })

  it('#3246 (décision Louis 16/10) — aucune dimension n’est plus déclarée sans colonne quand tout est saisi', () => {
    expect(similarityDimensionGaps({ relationStage: 'connu', timing: 'tot', closedCycles: 5 })).toEqual([])
    // #3246.3 (R44) — organisation non vérifiée (champ absent) : aucune ligne.
    expect(
      similarityDimensionGaps({
        relationStage: 'connu',
        timing: 'tot',
        closedCycles: 5,
        organisation: 'comite_elargi',
      }),
    ).toEqual([])
  })
})

// #3210.1 (lot M11 09/10) — la source « rendez-vous » : un FAIT binaire lu sur
// les activités captées (`activities.kind = 'meeting'`), nommée absente quand
// l'espace n'en a aucune.
describe('#3210.1 — rendez-vous', () => {
  it('un rendez-vous tenu des deux côtés est une similitude nommée', () => {
    const [result] = deriveSimilarCases(target({ hasMeeting: true }), [candidate({ hasMeeting: true })])
    expect(result.similarities).toContain('Un rendez-vous a déjà été tenu des deux côtés.')
  })

  it('SAIT DIRE NON — d’un seul côté, ni similitude ni différence devinée', () => {
    const [result] = deriveSimilarCases(target({ hasMeeting: true }), [candidate({ hasMeeting: false })])
    expect(result.similarities.join(' ')).not.toMatch(/rendez-vous/i)
    expect(result.differences.join(' ')).not.toMatch(/rendez-vous/i)
  })

  it('un espace sans aucun rendez-vous enregistré NOMME la source absente', () => {
    expect(meetingSourceGap(0)).toEqual([
      { source: 'rendez-vous', reason: expect.stringContaining('aucun rendez-vous enregistré') },
    ])
    expect(meetingSourceGap(3)).toEqual([])
    expect(meetingSourceGap(null)).toEqual([
      { source: 'rendez-vous', reason: expect.stringContaining('lecture indisponible') },
    ])
  })
})

// #3210.1 (lot M11 09/10) — Market Memory agrégée PAR CAS : les cas gagnés /
// perdus de CET espace qui partagent une dimension du compte cible, COMPTÉS,
// sans un seul nom de client (GA-43 : jamais agrégée entre espaces).
describe('#3210.1 — mémoire par cas (deriveCaseMemory)', () => {
  const cases = [
    candidate({ accountId: 'a', accountLabel: 'Client A', outcome: 'won' }),
    candidate({ accountId: 'b', accountLabel: 'Client B', outcome: 'lost' }),
    candidate({ accountId: 'c', accountLabel: 'Client C', outcome: 'won', employees: '10-50' }),
    candidate({ accountId: 'd', accountLabel: 'Client D', outcome: 'lost', sector: 'Industrie' }),
  ]

  it('compte gagnés et perdus par dimension partagée avec la cible', () => {
    expect(deriveCaseMemory(target(), cases)).toEqual([
      { dimension: 'secteur', value: 'Banque', won: 2, lost: 1 },
      { dimension: 'secteur et taille', value: 'Banque, 500-1000', won: 1, lost: 1 },
      { dimension: 'taille', value: '500-1000', won: 1, lost: 2 },
    ])
  })

  it('#3246 — le croisement secteur + taille ne fait aucune ligne quand aucun cas ne cumule les deux', () => {
    const none = [
      candidate({ accountId: 'x', outcome: 'won', employees: '10-50' }),
      candidate({ accountId: 'y', outcome: 'lost', sector: 'Industrie' }),
    ]
    expect(deriveCaseMemory(target(), none).map(l => l.dimension)).toEqual(['secteur', 'taille'])
  })

  it('ne porte AUCUN nom de client, aucun identifiant de compte', () => {
    const text = JSON.stringify(deriveCaseMemory(target(), cases))
    expect(text).not.toMatch(/Client [ABCD]|"a"|accountId/)
  })

  it('SAIT DIRE NON — une dimension inconnue de la cible ou partagée par personne ne fait aucune ligne', () => {
    expect(deriveCaseMemory(target({ sector: null, employees: null }), cases)).toEqual([])
    expect(deriveCaseMemory(target({ sector: 'Santé', employees: '1-9' }), cases)).toEqual([])
  })

  it('exclut le compte cible lui-même', () => {
    expect(deriveCaseMemory(target({ accountId: 'a' }), [cases[0]!])).toEqual([])
  })
})

// #3246 / #3210.3 (lot W9, décision Louis 11/10) — stratégie et modèle d'achat :
// vocabulaires FERMÉS saisis sur le REX / l'opportunité perdue, comparés à
// l'égalité stricte ; un côté non saisi n'est NI similitude NI différence.
describe('#3210.3 — stratégie et modèle d’achat (vocabulaire fermé)', () => {
  it('une stratégie identique est une similitude nommée par son libellé', () => {
    const [result] = deriveSimilarCases(target({ strategy: 'via_partenaire' }), [
      candidate({ strategy: 'via_partenaire' }),
    ])
    expect(result.similarities).toContain('Même stratégie d’approche (via un partenaire).')
  })

  it('une stratégie différente est une différence, jamais une similitude', () => {
    const [result] = deriveSimilarCases(target({ strategy: 'via_partenaire' }), [
      candidate({ strategy: 'conquete_directe' }),
    ])
    expect(result.differences).toContain('Stratégie d’approche différente (conquête directe contre via un partenaire).')
    expect(result.similarities.join(' ')).not.toMatch(/stratégie/i)
  })

  it('le modèle d’achat se compare de la même façon', () => {
    const [same] = deriveSimilarCases(target({ buyingModel: 'appel_offres' }), [
      candidate({ buyingModel: 'appel_offres' }),
    ])
    expect(same.similarities).toContain('Même modèle d’achat (appel d’offres).')
    const [diff] = deriveSimilarCases(target({ buyingModel: 'appel_offres' }), [
      candidate({ buyingModel: 'gre_a_gre' }),
    ])
    expect(diff.differences).toContain('Modèle d’achat différent (gré à gré contre appel d’offres).')
  })

  it('un côté non saisi (ou hors vocabulaire) ne dit RIEN : ni similitude ni différence', () => {
    for (const [t, c] of [
      [null, 'gre_a_gre'],
      ['gre_a_gre', null],
      [undefined, undefined],
      ['valeur_inventee', 'valeur_inventee'],
    ] as const) {
      const [result] = deriveSimilarCases(target({ buyingModel: t, strategy: t }), [
        candidate({ buyingModel: c, strategy: c }),
      ])
      expect([...result.similarities, ...result.differences].join(' ')).not.toMatch(/stratégie|modèle d’achat/i)
    }
  })
})

// #3246 / #3210.3 (lot cloud 14/10) — organisation de la décision : même
// vocabulaire FERMÉ, même patron que stratégie / modèle d'achat ci-dessus.
describe('#3210.3 — organisation de la décision (vocabulaire fermé)', () => {
  it('une organisation identique est une similitude nommée par son libellé', () => {
    const [result] = deriveSimilarCases(target({ organisation: 'comite_elargi' }), [
      candidate({ organisation: 'comite_elargi' }),
    ])
    expect(result.similarities).toContain('Même organisation de la décision (comité élargi).')
  })

  it('une organisation différente est une différence, jamais une similitude', () => {
    const [result] = deriveSimilarCases(target({ organisation: 'decideur_unique' }), [
      candidate({ organisation: 'comite_elargi' }),
    ])
    expect(result.differences).toContain(
      'Organisation de la décision différente (comité élargi contre décideur unique).',
    )
    expect(result.similarities.join(' ')).not.toMatch(/organisation de la décision/i)
  })

  it('un côté non saisi (ou hors vocabulaire) ne dit RIEN : ni similitude ni différence', () => {
    for (const [t, c] of [
      [null, 'comite_restreint'],
      ['comite_restreint', null],
      [undefined, undefined],
      ['valeur_inventee', 'valeur_inventee'],
    ] as const) {
      const [result] = deriveSimilarCases(target({ organisation: t }), [candidate({ organisation: c })])
      expect([...result.similarities, ...result.differences].join(' ')).not.toMatch(/organisation de la décision/i)
    }
  })
})

// #3246.relation (décision Louis 16/10) — stade de relation SAISI dans la liste fermée
// `relationshipStateSchema`, jamais parsé du texte libre `relationship_memory.relation`.
describe('#3246.relation — stade de relation (liste fermée saisie)', () => {
  it('un même stade est une similitude nommée par son libellé', () => {
    const [result] = deriveSimilarCases(target({ relationStage: 'ancien_client' }), [
      candidate({ relationStage: 'ancien_client' }),
    ])
    expect(result.similarities).toContain('Même stade de relation (ancien client).')
  })

  it('un stade différent est une différence, jamais une similitude', () => {
    const [result] = deriveSimilarCases(target({ relationStage: 'froid' }), [
      candidate({ relationStage: 'client_actif' }),
    ])
    expect(result.differences).toContain(
      'Stade de relation différent (client actif sur ce cas, contre compte froid ici).',
    )
    expect(result.similarities.join(' ')).not.toMatch(/relation/i)
  })

  it('SAIT DIRE NON — un côté non saisi (ou hors liste) ne compte NI pour NI contre (jamais 0)', () => {
    const base = deriveSimilarCases(target(), [candidate()])[0]
    for (const stage of [null, undefined, 'plutôt bonne']) {
      const [result] = deriveSimilarCases(target({ relationStage: stage }), [candidate({ relationStage: 'connu' })])
      expect([...result.similarities, ...result.differences].join(' ')).not.toMatch(/relation/i)
      expect(result.similarities.length).toBe(base.similarities.length)
    }
  })

  it('un stade absent sur la cible est NOMMÉ non évaluable', () => {
    const gaps = similarityDimensionGaps({ relationStage: null, timing: 'tot', closedCycles: 5 })
    expect(gaps.map(g => g.dimension)).toEqual(['relation'])
    expect(gaps[0].reason).toMatch(/non saisi/)
  })
})

// #3246.timing (décision Louis 16/10) — liste fermée CALCULÉE : âge de l'affaire contre la médiane
// des cycles clos de l'espace → tot / dans_le_cycle / en_retard. Moins de 3 cycles clos = non évaluable.
describe('#3246.timing — position dans le cycle habituel (liste fermée calculée)', () => {
  it('médiane des cycles clos ; moins de 3 cycles mesurables = null (jamais une médiane de deux)', () => {
    expect(medianClosedCycleDays([60, 90, 120])).toBe(90)
    expect(medianClosedCycleDays([60, 90, 120, 200])).toBe(105)
    expect(medianClosedCycleDays([60, 90])).toBeNull()
    expect(medianClosedCycleDays([60, 90, null, -4, Number.NaN])).toBeNull()
  })

  it('tôt sous la moitié de la médiane, dans le cycle jusqu’à la médiane incluse, en retard au-delà', () => {
    expect(timingOf(44, 90)).toBe('tot')
    expect(timingOf(45, 90)).toBe('dans_le_cycle')
    expect(timingOf(90, 90)).toBe('dans_le_cycle')
    expect(timingOf(91, 90)).toBe('en_retard')
  })

  it('SAIT DIRE NON — sans âge ou sans médiane, pas de position (jamais « tôt » par défaut)', () => {
    expect(timingOf(null, 90)).toBeNull()
    expect(timingOf(30, null)).toBeNull()
    expect(timingOf(-2, 90)).toBeNull()
  })

  it('âge d’une affaire ouverte = aujourd’hui − détection ; sans date, null', () => {
    const now = new Date('2026-03-02T00:00:00Z')
    expect(openAgeDays({ first_detected_at: new Date('2026-01-01T00:00:00Z') }, now)).toBe(60)
    expect(openAgeDays({ first_detected_at: null }, now)).toBeNull()
    expect(openAgeDays(null, now)).toBeNull()
  })

  it('une même position est une similitude nommée par son libellé, jamais par un nombre de jours', () => {
    const [result] = deriveSimilarCases(target({ timing: 'en_retard' }), [candidate({ timing: 'en_retard' })])
    expect(result.similarities).toContain('Même position dans le cycle habituel (au-delà du cycle habituel).')
  })

  it('deux positions différentes sont une différence nommée', () => {
    const [result] = deriveSimilarCases(target({ timing: 'tot' }), [candidate({ timing: 'en_retard' })])
    expect(result.differences).toContain(
      'Position différente dans le cycle habituel (au-delà du cycle habituel sur ce cas, contre tôt dans le cycle habituel ici).',
    )
  })

  it('SAIT DIRE NON — un côté non évaluable ne compte NI pour NI contre', () => {
    const [result] = deriveSimilarCases(target({ timing: null }), [candidate({ timing: 'tot' })])
    expect([...result.similarities, ...result.differences].join(' ')).not.toMatch(/cycle/i)
  })

  it('moins de 3 cycles clos : timing NOMMÉ non évaluable, avec le nombre lu', () => {
    const gaps = similarityDimensionGaps({ relationStage: 'connu', timing: null, closedCycles: 2 })
    expect(gaps).toEqual([{ dimension: 'timing', reason: expect.stringMatching(/2 cycles clos.*3/) }])
  })

  it('assez de cycles mais aucune affaire ouverte datée : timing NOMMÉ non évaluable', () => {
    const gaps = similarityDimensionGaps({ relationStage: 'connu', timing: null, closedCycles: 8 })
    expect(gaps).toEqual([{ dimension: 'timing', reason: expect.stringMatching(/affaire ouverte/) }])
  })
})

describe('#3210.3 — cycle constaté depuis les dates de l’affaire', () => {
  const detected = new Date('2026-01-01T00:00:00Z')
  it('cycle constaté = clôture − détection ; sans l’une des deux dates, null', () => {
    expect(observedCycleDays({ first_detected_at: detected, closed_at: new Date('2026-03-02T00:00:00Z') })).toBe(60)
    expect(observedCycleDays({ first_detected_at: detected, closed_at: null })).toBeNull()
    expect(observedCycleDays(undefined)).toBeNull()
  })
})

describe('#3246.3 (R44) — l’organisation de la décision non renseignée sur le compte se NOMME', () => {
  it('compte sans organisation sur sa demande ouverte : dimension organisation nommée, jamais silencieuse', () => {
    const gaps = similarityDimensionGaps({ relationStage: 'connu', timing: 'tot', closedCycles: 5, organisation: null })
    expect(gaps).toEqual([{ dimension: 'organisation', reason: expect.stringContaining('non renseignée') }])
  })
})

/**
 * #4289.4 (#3246.5, recette prod 19/10) — « Non mesuré » sur ENGIE alors que l'espace a une mission en cours :
 * le stade n'était lu QUE s'il avait été saisi à la main. Un stade saisi gagne TOUJOURS ; à défaut, les
 * missions SIGNÉES de l'espace (fait, jamais texte libre) disent client actif / ancien client ; sans rien : null.
 */
describe('relationStageOf', () => {
  it('un stade saisi gagne, quelles que soient les missions', () => {
    expect(relationStageOf('dormant', ['active'])).toBe('dormant')
  })

  it('une mission en cours fait un client actif', () => {
    expect(relationStageOf(null, ['ended', 'active'])).toBe('client_actif')
    expect(relationStageOf(undefined, ['paused'])).toBe('client_actif')
  })

  it('des missions seulement terminées font un ancien client', () => {
    expect(relationStageOf(null, ['ended', 'completed'])).toBe('ancien_client')
  })

  it('une mission annulée ou archivée ne prouve aucune relation : non mesuré', () => {
    expect(relationStageOf(null, ['cancelled', 'archived'])).toBeNull()
    expect(relationStageOf(null, [])).toBeNull()
    expect(relationStageOf(null, undefined)).toBeNull()
  })

  it('un stade saisi hors liste fermée est ignoré, les missions prennent le relais', () => {
    expect(relationStageOf('inconnu', ['active'])).toBe('client_actif')
  })
})
