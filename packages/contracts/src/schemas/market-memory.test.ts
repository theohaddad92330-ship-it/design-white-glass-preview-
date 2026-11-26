import { describe, expect, it } from 'vitest'
import {
  MARKET_ESN_VIEW_MAX_ITEMS,
  MARKET_MEMORY_MIN_PATHS,
  MARKET_PORTFOLIO_BUCKETS,
  MARKET_PREVIEW_MAX_ITEMS,
  MARKET_RESIDUAL_ROLE_FAMILIES,
  MARKET_REVIEW_QUEUE_MAX,
  MARKET_REVIEW_REASONS,
  accountMarketContextSchema,
  disambiguationMarketPathsSchema,
  marketEsnObservedSchema,
  MARKET_ESN_OBSERVED_MIN_PATHS,
  esnObservedPathsRange,
  marketEsnViewReadSchema,
  marketEsnViewSchema,
  marketMemoryCoverageSchema,
  marketMemorySearchReadSchema,
  marketObservedZoneSchema,
  marketPathsSchema,
  marketPortfolioCoverageSchema,
  marketPortfolioReadSchema,
  marketPreviewReadSchema,
  marketPreviewSchema,
  isResidualRoleFamily,
  marketReviewItemSchema,
  marketSaturation,
  marketStructuralFitSchema,
  observedCertainty,
  observedStackSchema,
} from './market-memory.js'

describe('le seuil vit à un seul endroit', () => {
  it('vaut 3 — on ne note pas un environnement sur deux observations', () => {
    expect(MARKET_MEMORY_MIN_PATHS).toBe(3)
  })
})

describe('marketPathsSchema — « non couvert » n’est jamais « 0 »', () => {
  it('accepte un nombre au-dessus du seuil', () => {
    expect(marketPathsSchema.parse(41)).toBe(41)
    expect(marketPathsSchema.parse(MARKET_MEMORY_MIN_PATHS)).toBe(MARKET_MEMORY_MIN_PATHS)
  })

  it('accepte `null` — pas de couverture, ou sous le seuil', () => {
    expect(marketPathsSchema.parse(null)).toBeNull()
  })

  it('REFUSE 0 : « zéro parcours observé » et « pas de donnée » sont deux affirmations différentes', () => {
    expect(() => marketPathsSchema.parse(0)).toThrow()
  })

  it('REFUSE 2 : sous le seuil, la valeur est `null`, jamais le compte réel', () => {
    expect(() => marketPathsSchema.parse(2)).toThrow()
  })
})

describe('disambiguationMarketPathsSchema — l’exception NOMMÉE de la désambiguïsation', () => {
  it('accepte 0, parce qu’ici l’asymétrie 41 / 0 est ce qui départage deux homonymes', () => {
    expect(disambiguationMarketPathsSchema.parse(0)).toBe(0)
  })

  it('accepte `null` — mémoire indisponible : AUCUNE ligne ne porte le fait', () => {
    expect(disambiguationMarketPathsSchema.parse(null)).toBeNull()
  })

  it('refuse 1 et 2 : deux observations ne distinguent rien, elles se rendent comme 0', () => {
    expect(() => disambiguationMarketPathsSchema.parse(1)).toThrow()
    expect(() => disambiguationMarketPathsSchema.parse(2)).toThrow()
  })
})

describe('observedCertainty — l’échelle est dérivée, pas retapée', () => {
  it('forte à 5 personnes et au-delà', () => {
    expect(observedCertainty(9)).toBe('forte')
    expect(observedCertainty(5)).toBe('forte')
  })

  it('moyenne à 3 et 4', () => {
    expect(observedCertainty(4)).toBe('moyenne')
    expect(observedCertainty(3)).toBe('moyenne')
  })

  it('faible en dessous — la ligne existe, sa certitude le dit', () => {
    expect(observedCertainty(2)).toBe('faible')
    expect(observedCertainty(1)).toBe('faible')
  })
})

describe('marketEsnObservedSchema — une observation n’est pas une présence', () => {
  it('porte le nombre de personnes et sa certitude, sans aucune date', () => {
    const parsed = marketEsnObservedSchema.parse({
      esnName: 'ALTEN',
      persons: 9,
      certainty: 'forte',
    })

    expect(parsed).toEqual({ esnName: 'ALTEN', persons: 9, certainty: 'forte' })
    expect(Object.keys(parsed)).not.toContain('observedAt')
  })

  it('ACCEPTE une société reliée par UN SEUL parcours — renversement daté du 11/10/2026 (#4016 L10)', () => {
    // Avant : le plancher de la stack (2) refusait la ligne. Louis 11/10 : un
    // concurrent se montre dès 1 parcours, mais jamais avec son compte exact.
    expect(marketEsnObservedSchema.parse({ esnName: 'HN Services', persons: 1, certainty: 'faible' }).persons).toBe(1)
    expect(MARKET_ESN_OBSERVED_MIN_PATHS).toBe(1)
  })

  it('REFUSE zéro parcours — sous le plancher, la ligne n’existe pas', () => {
    expect(() => marketEsnObservedSchema.parse({ esnName: 'Keyrus', persons: 0, certainty: 'faible' })).toThrow()
  })

  it('refuse un champ de date, même fourni explicitement', () => {
    const parsed = marketEsnObservedSchema.parse({
      esnName: 'ALTEN',
      persons: 9,
      certainty: 'forte',
      observedAt: '2024',
    }) as Record<string, unknown>

    expect(parsed.observedAt).toBeUndefined()
  })
})

describe('observedStackSchema — jamais la stack officielle', () => {
  it('garde les technos citées par au moins deux personnes', () => {
    const parsed = observedStackSchema.parse([
      { techno: 'java', persons: 39 },
      { techno: 'python', persons: 31 },
    ])

    expect(parsed).toHaveLength(2)
  })

  it('refuse une techno citée par une seule personne — le seuil du corpus est 2', () => {
    expect(() => observedStackSchema.parse([{ techno: 'cobol', persons: 1 }])).toThrow()
  })
})

describe('marketMemoryCoverageSchema — l’absence se NOMME', () => {
  it('rend une couverture complète quand l’entité est résolue et au-dessus du seuil', () => {
    const parsed = marketMemoryCoverageSchema.parse({
      covered: true,
      marketPaths: 41,
      esnObserved: [{ esnName: 'ALTEN', persons: 9, certainty: 'forte' }],
      observedStack: [{ techno: 'java', persons: 39 }],
      roleFamilies: [{ family: 'Data', persons: 12 }],
      exEsnPresent: 23,
    })

    expect(parsed.covered).toBe(true)
    expect(parsed.marketPaths).toBe(41)
  })

  it('rend une couverture VIDE — pas une couverture à zéro — quand rien n’est observé', () => {
    const parsed = marketMemoryCoverageSchema.parse({
      covered: false,
      marketPaths: null,
      esnObserved: [],
      observedStack: [],
      roleFamilies: [],
      exEsnPresent: null,
    })

    expect(parsed.covered).toBe(false)
    expect(parsed.marketPaths).toBeNull()
    expect(parsed.exEsnPresent).toBeNull()
  })

  it('refuse une couverture qui se déclare couverte sans parcours — c’est la contradiction à empêcher', () => {
    expect(() =>
      marketMemoryCoverageSchema.parse({
        covered: true,
        marketPaths: null,
        esnObserved: [],
        observedStack: [],
        roleFamilies: [],
        exEsnPresent: null,
      }),
    ).toThrow()
  })

  it('#1608 — un appelant qui ne connaît pas encore `observedZone` reste VALIDE — le champ est `undefined`, pas une erreur', () => {
    // Le code écrit avant #1608 construit cet objet sans le champ : il ne
    // doit pas se mettre à échouer la validation rétroactivement. `.optional()`
    // et pas `.default(null)` — voir le commentaire du schéma : un `.default()`
    // rendrait ce champ OBLIGATOIRE dans le type de sortie inféré, ce qui
    // casserait tout littéral existant construit sans lui.
    const parsed = marketMemoryCoverageSchema.parse({
      covered: false,
      marketPaths: null,
      esnObserved: [],
      observedStack: [],
      roleFamilies: [],
      exEsnPresent: null,
    })

    expect(parsed.observedZone).toBeUndefined()
  })

  it('#1608 — `null` explicite reste `null` — un lecteur traite les deux pareil, mais le contrat les distingue', () => {
    const parsed = marketMemoryCoverageSchema.parse({
      covered: false,
      marketPaths: null,
      esnObserved: [],
      observedStack: [],
      roleFamilies: [],
      exEsnPresent: null,
      observedZone: null,
    })

    expect(parsed.observedZone).toBeNull()
  })

  it('#1608 — porte l’empreinte de zone quand le corpus la connaît', () => {
    const parsed = marketMemoryCoverageSchema.parse({
      covered: true,
      marketPaths: 41,
      esnObserved: [],
      observedStack: [],
      roleFamilies: [],
      exEsnPresent: null,
      observedZone: { city: 'Lyon', region: 'Auvergne-Rhône-Alpes', country: 'France' },
    })

    expect(parsed.observedZone).toEqual({ city: 'Lyon', region: 'Auvergne-Rhône-Alpes', country: 'France' })
  })
})

describe('marketObservedZoneSchema — #1608 / #1630.10, jamais un établissement officiel', () => {
  it('accepte les trois champs quand ils sont connus', () => {
    const parsed = marketObservedZoneSchema.parse({ city: 'Lyon', region: 'Auvergne-Rhône-Alpes', country: 'France' })
    expect(parsed).toEqual({ city: 'Lyon', region: 'Auvergne-Rhône-Alpes', country: 'France' })
  })

  it('chaque champ est INDÉPENDAMMENT nullable — connaître la ville sans la région, ou l’inverse', () => {
    expect(marketObservedZoneSchema.parse({ city: 'Lyon', region: null, country: null })).toEqual({
      city: 'Lyon',
      region: null,
      country: null,
    })
    expect(marketObservedZoneSchema.parse({ city: null, region: 'Bretagne', country: null }).region).toBe('Bretagne')
  })

  it('refuse une chaîne vide — un champ vide vaut `null`, jamais une chaîne qui ne dit rien', () => {
    expect(() => marketObservedZoneSchema.parse({ city: '', region: null, country: null })).toThrow()
  })

  it('`.strip()` retire un champ de date glissé par un appelant — l’interdit n°1 tenu par le TYPE', () => {
    const parsed = marketObservedZoneSchema.parse({
      city: 'Lyon',
      region: null,
      country: null,
      observedAt: '2024',
      corpusLabel: 'corpus-interne',
    }) as Record<string, unknown>

    expect(parsed.observedAt).toBeUndefined()
    expect(parsed.corpusLabel).toBeUndefined()
  })
})

describe('accountMarketContextSchema — #1608 étend le popover (#1582) sans le casser', () => {
  it('reste valide SANS `observed_zone` — le popover existant ne le fournit pas', () => {
    const parsed = accountMarketContextSchema.parse({ paths_observed: 41, esn_observed: 2 })
    expect(parsed.observed_zone).toBeUndefined()
  })

  it('porte l’empreinte de zone pour l’onglet Sites quand elle est fournie', () => {
    const parsed = accountMarketContextSchema.parse({
      paths_observed: 41,
      esn_observed: 2,
      observed_zone: { city: 'Lyon', region: null, country: 'France' },
    })
    expect(parsed.observed_zone).toEqual({ city: 'Lyon', region: null, country: 'France' })
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
 * LAU-FINAL-211 (#3205.5) — LA SATURATION, EN CATÉGORIES NOMMÉES, JAMAIS UN SCORE
 * ───────────────────────────────────────────────────────────────────────────*/

describe('marketSaturation — cinq catégories nommées, jamais un score opaque', () => {
  it('rend `null` quand aucune ESN n’est observée — rien à classer, "à qualifier" ailleurs', () => {
    expect(marketSaturation({ esnObserved: 0 })).toBeNull()
    expect(marketSaturation({ esnObserved: 0, esnObservedDetail: [] })).toBeNull()
  })

  it('rend "information insuffisante" quand le compteur existe mais pas le détail par société', () => {
    expect(marketSaturation({ esnObserved: 3 })).toBe('insufficient_information')
    expect(marketSaturation({ esnObserved: 3, esnObservedDetail: [] })).toBe('insufficient_information')
  })

  it('rend "quelques prestataires complémentaires" pour deux acteurs sans domination', () => {
    expect(
      marketSaturation({
        esnObserved: 2,
        esnObservedDetail: [
          { esnName: 'ALTEN', persons: 2 },
          { esnName: 'CGI', persons: 2 },
        ],
      }),
    ).toBe('few_complementary')
  })

  it('un seul acteur observé EST la définition d’un acteur dominant, jamais "quelques prestataires"', () => {
    expect(marketSaturation({ esnObserved: 1, esnObservedDetail: [{ esnName: 'ALTEN', persons: 4 }] })).toBe(
      'dominant_player',
    )
  })

  it('rend "acteur dominant" quand une société porte au moins 60 % des parcours observés', () => {
    expect(
      marketSaturation({
        esnObserved: 3,
        esnObservedDetail: [
          { esnName: 'CAPGEMINI', persons: 8 },
          { esnName: 'ALTEN', persons: 2 },
          { esnName: 'CGI', persons: 2 },
        ],
      }),
    ).toBe('dominant_player')
  })

  it('rend "panel structuré" quand trois sociétés ou plus concentrent la majorité des parcours', () => {
    expect(
      marketSaturation({
        esnObserved: 4,
        esnObservedDetail: [
          { esnName: 'CAPGEMINI', persons: 4 },
          { esnName: 'ALTEN', persons: 3 },
          { esnName: 'CGI', persons: 3 },
          { esnName: 'SOPRA', persons: 2 },
        ],
      }),
    ).toBe('structured_panel')
  })

  it('rend "marché fragmenté" quand de nombreux acteurs se partagent les parcours sans concentration', () => {
    expect(
      marketSaturation({
        esnObserved: 6,
        esnObservedDetail: [
          { esnName: 'A', persons: 2 },
          { esnName: 'B', persons: 2 },
          { esnName: 'C', persons: 2 },
          { esnName: 'D', persons: 2 },
          { esnName: 'E', persons: 2 },
          { esnName: 'F', persons: 2 },
        ],
      }),
    ).toBe('fragmented')
  })

  it('ne rend jamais de pourcentage ni de nombre — seulement la catégorie', () => {
    const result = marketSaturation({
      esnObserved: 1,
      esnObservedDetail: [{ esnName: 'ALTEN', persons: 4 }],
    })
    expect(typeof result).toBe('string')
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
 * #1633 / #1635 — LA COUVERTURE DU PORTEFEUILLE
 * ───────────────────────────────────────────────────────────────────────────*/

/** Un portefeuille qui boucle : 62 comptes = 38 + 15 + 6 + 3. */
const PORTEFEUILLE = {
  accounts: 62,
  covered: 38,
  insufficientObservations: 15,
  ambiguous: 6,
  unresolved: 3,
  homonyms: 4,
} as const

describe('marketPortfolioCoverageSchema — les seaux s’additionnent, ou rien', () => {
  it('accepte une partition qui boucle', () => {
    expect(marketPortfolioCoverageSchema.parse(PORTEFEUILLE).accounts).toBe(62)
  })

  it('REFUSE un total qui ne boucle pas — un nombre déduit qui a l’air juste est pire qu’une case vide', () => {
    expect(() => marketPortfolioCoverageSchema.parse({ ...PORTEFEUILLE, accounts: 61 })).toThrow()
    expect(() => marketPortfolioCoverageSchema.parse({ ...PORTEFEUILLE, covered: 39 })).toThrow()
  })

  it('accepte un portefeuille VIDE — zéro compte est une mesure, pas une absence', () => {
    const vide = { accounts: 0, covered: 0, insufficientObservations: 0, ambiguous: 0, unresolved: 0, homonyms: 0 }
    expect(marketPortfolioCoverageSchema.parse(vide).accounts).toBe(0)
  })

  it('REFUSE plus d’homonymies que d’ambiguïtés — une homonymie EST une ambiguïté', () => {
    expect(() => marketPortfolioCoverageSchema.parse({ ...PORTEFEUILLE, homonyms: 7 })).toThrow()
  })

  it('REFUSE un compteur négatif', () => {
    expect(() => marketPortfolioCoverageSchema.parse({ ...PORTEFEUILLE, unresolved: -1, accounts: 58 })).toThrow()
  })

  it('nomme quatre seaux, et exactement les quatre du schéma', () => {
    expect([...MARKET_PORTFOLIO_BUCKETS]).toEqual(['covered', 'insufficientObservations', 'ambiguous', 'unresolved'])
    // Le contrôle qui rend ce test utile : si un seau était ajouté au schéma
    // sans l’être à la liste, la partition cesserait d’être exhaustive.
    for (const bucket of MARKET_PORTFOLIO_BUCKETS) {
      expect(PORTEFEUILLE).toHaveProperty(bucket)
    }
  })
})

describe('marketReviewItemSchema — une file de revue ne porte ni date ni identité', () => {
  const LIGNE = {
    accountId: '3f1f4a6e-1f8b-4a2e-9d4c-2b7c9e0a1d55',
    accountName: 'ROCHE',
    reason: 'ambiguous_name',
    candidates: 2,
  } as const

  it('accepte une ligne d’arbitrage', () => {
    expect(marketReviewItemSchema.parse(LIGNE).reason).toBe('ambiguous_name')
  })

  it('REFUSE un seul candidat — avec un seul, il n’y a rien à arbitrer', () => {
    expect(() => marketReviewItemSchema.parse({ ...LIGNE, candidates: 1 })).toThrow()
  })

  it('JETTE une date glissée par un appelant — l’interdit est tenu par le TYPE', () => {
    const parsed = marketReviewItemSchema.parse({ ...LIGNE, observedAt: '2026-09-08T10:00:00.000Z' })
    expect(parsed).not.toHaveProperty('observedAt')
  })

  it('ne connaît QUE des ambiguïtés — « non résolu » n’est pas un arbitrage', () => {
    expect([...MARKET_REVIEW_REASONS]).toEqual(['ambiguous_domain', 'ambiguous_name'])
    expect(() => marketReviewItemSchema.parse({ ...LIGNE, reason: 'unresolved' })).toThrow()
  })
})

describe('marketStructuralFitSchema — le critère est visible, la gradation n’existe pas', () => {
  const FIT = { matching: 22, covered: 38, expertises: ['Data', 'Cloud'] } as const

  it('accepte un recoupement avec ses expertises', () => {
    expect(marketStructuralFitSchema.parse(FIT).matching).toBe(22)
  })

  it('REFUSE de recouper plus de comptes qu’il n’y en a de couverts', () => {
    expect(() => marketStructuralFitSchema.parse({ ...FIT, matching: 39 })).toThrow()
  })

  it('REFUSE une liste d’expertises VIDE — sans critère, le nombre ne veut rien dire', () => {
    expect(() => marketStructuralFitSchema.parse({ ...FIT, expertises: [] })).toThrow()
  })

  it('accepte 0 recoupement : avec des expertises déclarées, zéro est une VRAIE mesure', () => {
    expect(marketStructuralFitSchema.parse({ ...FIT, matching: 0 }).matching).toBe(0)
  })
})

describe('marketPortfolioReadSchema — une panne ne rend pas des zéros', () => {
  const OK = {
    status: 'ok',
    coverage: PORTEFEUILLE,
    review: [],
    structuralFit: null,
    computedAt: '2026-09-08T10:00:00.000Z',
  } as const

  it('accepte une lecture réussie', () => {
    const parsed = marketPortfolioReadSchema.parse(OK)
    expect(parsed.status).toBe('ok')
  })

  it('accepte une panne, qui porte SA raison et aucun chiffre', () => {
    const parsed = marketPortfolioReadSchema.parse({ status: 'unavailable', reason: 'read_failed' })
    expect(parsed).not.toHaveProperty('coverage')
  })

  it('REFUSE une panne muette — « indisponible » sans raison ne mène à aucun geste', () => {
    expect(() => marketPortfolioReadSchema.parse({ status: 'unavailable', reason: '' })).toThrow()
  })

  it('REFUSE une file plus longue que le plafond — au-delà, ce n’est plus une file', () => {
    const ligne = {
      accountId: '3f1f4a6e-1f8b-4a2e-9d4c-2b7c9e0a1d55',
      accountName: 'ROCHE',
      reason: 'ambiguous_name',
      candidates: 2,
    }
    const trop = Array.from({ length: MARKET_REVIEW_QUEUE_MAX + 1 }, () => ligne)
    expect(() => marketPortfolioReadSchema.parse({ ...OK, review: trop })).toThrow()
  })

  it('REFUSE une lecture réussie SANS son horodatage — un agrégat non daté se date de son rendu', () => {
    const { computedAt: _ignored, ...sansDate } = OK
    expect(() => marketPortfolioReadSchema.parse(sansDate)).toThrow()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * #1961 — LA RECHERCHE PAR FILTRE, ENFIN SOUS CONTRAT
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('marketMemorySearchReadSchema — #1961.21 : le lien vers la fiche ne traverse que sous sa forme', () => {
  const ACCOUNT_ID = '3f1f4a6e-1f8b-4a2e-9d4c-2b7c9e0a1d55'
  const COUVERT = {
    covered: true,
    marketPaths: 41,
    esnObserved: [],
    observedStack: [],
    roleFamilies: [],
    exEsnPresent: null,
    observedZone: null,
  }
  const readWith = (match: Record<string, unknown>) => ({ status: 'ok', matches: [match], truncated: false })

  it('accepte une entreprise SANS lien — l’état nominal : elle n’est pas dans le portefeuille', () => {
    const parsed = marketMemorySearchReadSchema.parse(readWith({ companyName: 'Thales', coverage: COUVERT }))
    expect(parsed.status).toBe('ok')
    if (parsed.status !== 'ok') return
    expect(parsed.matches[0]).not.toHaveProperty('accountRoute')
  })

  it('accepte la route de la fiche d’un compte', () => {
    const parsed = marketMemorySearchReadSchema.parse(
      readWith({ companyName: 'Thales', coverage: COUVERT, accountRoute: `/accounts/${ACCOUNT_ID}` }),
    )
    if (parsed.status !== 'ok') throw new Error('lecture attendue')
    expect(parsed.matches[0]?.accountRoute).toBe(`/accounts/${ACCOUNT_ID}`)
  })

  it('REFUSE un lien qui mène ailleurs que la fiche d’un compte — le modèle le rendrait cliquable tel quel', () => {
    for (const route of [
      `https://exemple.test/accounts/${ACCOUNT_ID}`,
      `/accounts/${ACCOUNT_ID}/brief`,
      '/accounts/',
      '/settings',
      'javascript:alert(1)',
    ]) {
      expect(() =>
        marketMemorySearchReadSchema.parse(readWith({ companyName: 'Thales', coverage: COUVERT, accountRoute: route })),
      ).toThrow()
    }
  })

  it('ne laisse traverser ni domaine, ni clé du corpus, ni date — tenu par le TYPE', () => {
    const parsed = marketMemorySearchReadSchema.parse(
      readWith({
        companyName: 'Thales',
        coverage: COUVERT,
        websiteDomain: 'thalesgroup.com',
        companyKey: 'thales',
        corpusLabel: 'corpus-2026',
        importedAt: '2026-09-01T00:00:00.000Z',
      }),
    )
    if (parsed.status !== 'ok') throw new Error('lecture attendue')
    expect(Object.keys(parsed.matches[0] ?? {}).sort()).toEqual(['companyName', 'coverage'])
  })

  it('REFUSE une couverture déclarée sous le seuil — la forme ne ment pas plus que le service', () => {
    expect(() =>
      marketMemorySearchReadSchema.parse(
        readWith({ companyName: 'Thales', coverage: { ...COUVERT, marketPaths: MARKET_MEMORY_MIN_PATHS - 1 } }),
      ),
    ).toThrow()
  })

  it('REFUSE une lecture réussie sans son drapeau de troncature', () => {
    expect(() => marketMemorySearchReadSchema.parse({ status: 'ok', matches: [] })).toThrow()
  })

  it('accepte une panne qui porte SA raison, REFUSE une panne muette', () => {
    expect(marketMemorySearchReadSchema.parse({ status: 'unavailable', reason: 'read_failed' }).status).toBe(
      'unavailable',
    )
    expect(() => marketMemorySearchReadSchema.parse({ status: 'unavailable', reason: '' })).toThrow()
  })
})

/* ═══════════════════════════════════════════════════════════════════════════
 * #1589.2 — LA PREVIEW PRÉ-COMPTE
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('MARKET_PREVIEW_MAX_ITEMS — la borne vit à un seul endroit', () => {
  it('vaut 3 — trois mots se lisent d’un coup d’œil avant de dépenser un crédit', () => {
    expect(MARKET_PREVIEW_MAX_ITEMS).toBe(3)
  })
})

describe('marketPreviewSchema — ce qui NE traverse PAS est tenu par le type', () => {
  const PREVIEW = {
    paths_observed: 41,
    esn_observed: 4,
    observed_stack: ['Data', 'Java', 'Cloud'],
    role_families: ['Data', 'Développement', 'PMO'],
  }

  it('accepte la forme que l’écran de lancement lit', () => {
    expect(marketPreviewSchema.parse(PREVIEW).observed_stack).toEqual(['Data', 'Java', 'Cloud'])
  })

  it('refuse un compte SOUS le seuil — sous trois parcours il n’y a pas de preview, il y a `null`', () => {
    expect(() => marketPreviewSchema.parse({ ...PREVIEW, paths_observed: 2 })).toThrow()
  })

  it('`esn_observed: 0` est une VRAIE mesure sur un compte couvert, pas une absence', () => {
    expect(marketPreviewSchema.parse({ ...PREVIEW, esn_observed: 0 }).esn_observed).toBe(0)
  })

  it('⚠️ un NOM d’ESN ne traverse pas — #1589.2 refuse d’exposer les personnes', () => {
    const avecNoms = { ...PREVIEW, esn_observed_names: ['Capgemini', 'Sopra'] }
    expect(marketPreviewSchema.parse(avecNoms)).not.toHaveProperty('esn_observed_names')
  })

  it('⚠️ aucune DATE de corpus ne traverse — #1589.2 l’interdit explicitement', () => {
    const avecDate = { ...PREVIEW, observed_at: '2026-09-06T00:00:00.000Z', computedAt: '2026-09-08T00:00:00.000Z' }
    const parsed = marketPreviewSchema.parse(avecDate)
    expect(parsed).not.toHaveProperty('observed_at')
    expect(parsed).not.toHaveProperty('computedAt')
  })

  it('borne les deux listes — une preview n’est pas un recensement', () => {
    const trop = Array.from({ length: MARKET_PREVIEW_MAX_ITEMS + 1 }, (_, i) => `T${i}`)
    expect(() => marketPreviewSchema.parse({ ...PREVIEW, observed_stack: trop })).toThrow()
    expect(() => marketPreviewSchema.parse({ ...PREVIEW, role_families: trop })).toThrow()
  })

  it('⚠️ aucun COMPTAGE par techno — « Data », jamais « Data (7) » (#1589.2)', () => {
    expect(() => marketPreviewSchema.parse({ ...PREVIEW, observed_stack: [{ techno: 'Data', persons: 7 }] })).toThrow()
  })
})

describe('marketPreviewReadSchema — une panne n’est pas une absence d’observation', () => {
  it('distingue « lu, rien à dire » de « pas lu »', () => {
    const vide = marketPreviewReadSchema.parse({ status: 'ok', preview: null })
    expect(vide.status === 'ok' && vide.preview).toBeNull()
    const panne = marketPreviewReadSchema.parse({ status: 'unavailable', reason: 'read_failed' })
    expect(panne.status).toBe('unavailable')
  })

  it('une panne sans raison n’est pas une panne racontable', () => {
    expect(() => marketPreviewReadSchema.parse({ status: 'unavailable', reason: '' })).toThrow()
  })
})

describe('isResidualRoleFamily — « Autre » n’est pas une famille de rôles', () => {
  it('reconnaît le seau de résidu du corpus', () => {
    expect(isResidualRoleFamily('Autre')).toBe(true)
  })

  it('le reconnaît quelle que soit la casse ou l’espace autour', () => {
    expect(isResidualRoleFamily(' autre ')).toBe(true)
    expect(isResidualRoleFamily('AUTRE')).toBe(true)
  })

  it('⚠️ ne jette AUCUNE famille nommée — le témoin des cas légitimes voisins', () => {
    for (const family of [
      'Chef de projet',
      'Data / IA',
      'Infra / Cloud',
      'Développement',
      'Marketing / Com',
      'Direction / Conseil',
      'Formation / RH',
      'Autres systèmes',
    ]) {
      expect(isResidualRoleFamily(family), family).toBe(false)
    }
  })

  it('la liste est NOMMÉE et non vide — une garde qui ne lit rien ne garde rien', () => {
    expect(MARKET_RESIDUAL_ROLE_FAMILIES.length).toBeGreaterThan(0)
  })
})

// #1636 — l'entreprise de l'espace, vue par la mémoire marché.
describe('marketEsnViewSchema — la force du rapprochement voyage avec le résultat', () => {
  const view = {
    matchedCompanyName: 'ALTEN',
    matchedOn: 'name' as const,
    pathsObserved: 14,
    roleFamilies: ['Développement', 'Data / IA'],
    destinations: ['ORANGE', 'SNCF'],
  }

  it('accepte une vue complète', () => {
    expect(marketEsnViewSchema.parse(view)).toEqual(view)
  })

  it('exige le nom de l’entreprise rapprochée — sans lui, personne ne peut démentir', () => {
    expect(() => marketEsnViewSchema.parse({ ...view, matchedCompanyName: '' })).toThrow()
  })

  it('refuse un nombre de parcours sous le seuil — il n’y a alors pas de vue du tout', () => {
    expect(() => marketEsnViewSchema.parse({ ...view, pathsObserved: MARKET_MEMORY_MIN_PATHS - 1 })).toThrow()
  })

  it('refuse un 0 de parcours — « non mesuré » n’est jamais « 0 »', () => {
    expect(() => marketEsnViewSchema.parse({ ...view, pathsObserved: 0 })).toThrow()
  })

  it('borne les deux listes à MARKET_ESN_VIEW_MAX_ITEMS', () => {
    const tooMany = Array.from({ length: MARKET_ESN_VIEW_MAX_ITEMS + 1 }, (_, i) => `X${i}`)
    expect(() => marketEsnViewSchema.parse({ ...view, roleFamilies: tooMany })).toThrow()
    expect(() => marketEsnViewSchema.parse({ ...view, destinations: tooMany })).toThrow()
  })

  it('les destinations sont des NOMS d’entreprises, sans comptage — `.strip()` retire ce qui compte des gens', () => {
    const parsed = marketEsnViewSchema.parse({ ...view, persons: 9, observedAt: '2024-01-01' }) as Record<
      string,
      unknown
    >
    expect(parsed.persons).toBeUndefined()
    expect(parsed.observedAt).toBeUndefined()
  })
})

describe('marketEsnViewReadSchema — quatre issues, aucune ne se dit comme une autre', () => {
  it('« pas assez d’observations » et « rien n’a été cherché » sont deux états DISTINCTS', () => {
    expect(marketEsnViewReadSchema.parse({ status: 'insufficient' }).status).toBe('insufficient')
    expect(marketEsnViewReadSchema.parse({ status: 'undeclared' }).status).toBe('undeclared')
  })

  it('une panne porte sa raison et n’est jamais « pas couverte »', () => {
    const read = marketEsnViewReadSchema.parse({ status: 'unavailable', reason: 'read_failed' })
    expect(read).toEqual({ status: 'unavailable', reason: 'read_failed' })
    expect(() => marketEsnViewReadSchema.parse({ status: 'unavailable', reason: '' })).toThrow()
  })

  it('refuse un statut inventé', () => {
    expect(() => marketEsnViewReadSchema.parse({ status: 'empty' })).toThrow()
  })
})

/**
 * #2288.2 — LA SEULE DATE QUE LA MÉMOIRE MARCHÉ LAISSE PASSER.
 *
 * Le corpus reste sans date (interdit n°1). Ce qui traverse, c'est la date d'un
 * fait d'ACCÈS, avec sa nature, et un TYPE qui refuse la combinaison
 * dangereuse : une date exacte présentée comme venant d'un autre espace.
 */
describe('marketMemorySearchReadSchema — `currentSignal`, et rien de plus', () => {
  const match = {
    companyName: 'ACME',
    coverage: {
      covered: true,
      marketPaths: 12,
      esnObserved: [],
      observedStack: [],
      roleFamilies: [],
      exEsnPresent: null,
      observedZone: null,
    },
  }

  it('laisse passer une date EXACTE quand elle vient de MON espace', () => {
    const parsed = marketMemorySearchReadSchema.parse({
      status: 'ok',
      truncated: false,
      matches: [{ ...match, currentSignal: { nature: 'own', observedOn: '2026-03-04T09:12:00.000Z' } }],
    })

    expect(parsed).toEqual({
      status: 'ok',
      truncated: false,
      matches: [{ ...match, currentSignal: { nature: 'own', observedOn: '2026-03-04T09:12:00.000Z' } }],
    })
  })

  it('laisse passer un MOIS quand la date vient d’ailleurs', () => {
    const parsed = marketMemorySearchReadSchema.parse({
      status: 'ok',
      truncated: false,
      matches: [{ ...match, currentSignal: { nature: 'shared', observedMonth: '2026-08' } }],
    })

    expect(parsed).toEqual({
      status: 'ok',
      truncated: false,
      matches: [{ ...match, currentSignal: { nature: 'shared', observedMonth: '2026-08' } }],
    })
  })

  it('REFUSE une date exacte venue d’un AUTRE espace', () => {
    expect(() =>
      marketMemorySearchReadSchema.parse({
        status: 'ok',
        truncated: false,
        matches: [{ ...match, currentSignal: { nature: 'shared', observedOn: '2026-08-12T00:00:00.000Z' } }],
      }),
    ).toThrow()
  })

  it('une entreprise sans date n’a PAS le champ — jamais un `null` qui se rendrait « non daté »', () => {
    const parsed = marketMemorySearchReadSchema.parse({ status: 'ok', truncated: false, matches: [match] })
    expect(parsed).toEqual({ status: 'ok', truncated: false, matches: [match] })
    expect(parsed.status === 'ok' && 'currentSignal' in (parsed.matches[0] ?? {})).toBe(false)
  })

  it('la COUVERTURE, elle, reste sans date — le corpus n’en expose toujours aucune', () => {
    const parsed = marketMemorySearchReadSchema.parse({
      status: 'ok',
      truncated: false,
      matches: [{ ...match, coverage: { ...match.coverage, observedAt: '2026-03-04T09:12:00.000Z' } }],
    })

    expect(parsed.status === 'ok' && 'observedAt' in (parsed.matches[0]?.coverage ?? {})).toBe(false)
  })
})

describe('esnObservedPathsRange — sous le seuil, une fourchette, jamais le compte exact (#4016 L10)', () => {
  it('dit « 1-2 » pour 1 ou 2 parcours — le nombre exact se lirait comme une mesure', () => {
    expect(esnObservedPathsRange(1)).toEqual({ kind: 'range', label: '1-2' })
    expect(esnObservedPathsRange(2)).toEqual({ kind: 'range', label: '1-2' })
  })

  it('rend le compte exact dès le seuil transverse (3)', () => {
    expect(esnObservedPathsRange(3)).toEqual({ kind: 'exact', count: 3 })
    expect(esnObservedPathsRange(9)).toEqual({ kind: 'exact', count: 9 })
  })

  it('ne dit RIEN pour 0 ou une valeur invalide — une absence n’est pas « 0 parcours »', () => {
    expect(esnObservedPathsRange(0)).toBeNull()
    expect(esnObservedPathsRange(-1)).toBeNull()
    expect(esnObservedPathsRange(Number.NaN)).toBeNull()
  })
})
