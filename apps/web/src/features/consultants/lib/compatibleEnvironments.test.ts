import { describe, expect, it } from 'vitest'
import type { MarketContextMatch, MarketMemoryCoverage, MarketSignalDate } from '@bellum/contracts'
import {
  accessStateFor,
  buildCompatibleEnvironmentsQuery,
  compatibleEnvironmentBuckets,
  consultantSkillsForFit,
  externalRecourseObserved,
  refusedTechnologyObservedAt,
  reverseMarketVerdictFor,
  type CompatibleEnvironmentsInput,
} from './compatibleEnvironments'

/**
 * #1625 — la matière de la troisième lecture, testée SANS composant : la
 * requête envoyée au serveur, et les deux états dérivés côté client.
 */
function coverage(over: Partial<MarketMemoryCoverage> = {}): MarketMemoryCoverage {
  return {
    covered: true,
    marketPaths: 12,
    esnObserved: [],
    observedStack: [{ techno: 'Java', persons: 4 }],
    roleFamilies: [{ family: 'Data', persons: 3 }],
    exEsnPresent: null,
    observedZone: null,
    ...over,
  }
}

describe('buildCompatibleEnvironmentsQuery', () => {
  it('utilise la première zone tenable comme discriminant', () => {
    const input: CompatibleEnvironmentsInput = { stack: ['Java'], zones: ['Lyon'], title: null }
    expect(buildCompatibleEnvironmentsQuery(input)).toEqual({ location: 'Lyon' })
  })

  it('saute une zone qui ne désigne pas un territoire (« remote ») et prend la suivante', () => {
    const input: CompatibleEnvironmentsInput = { stack: [], zones: ['remote', 'Lyon'], title: null }
    expect(buildCompatibleEnvironmentsQuery(input)).toEqual({ location: 'Lyon' })
  })

  it('replie sur la première compétence quand aucune zone n’est utilisable', () => {
    const input: CompatibleEnvironmentsInput = { stack: ['Kubernetes'], zones: ['remote'], title: null }
    expect(buildCompatibleEnvironmentsQuery(input)).toEqual({ technology: 'Kubernetes' })
  })

  it('rend `null` sans zone ni compétence — rien n’est lançable', () => {
    const input: CompatibleEnvironmentsInput = { stack: [], zones: [], title: null }
    expect(buildCompatibleEnvironmentsQuery(input)).toBeNull()
  })

  it('rend `null` quand les deux listes sont vides même avec un titre renseigné', () => {
    // Le titre alimente le FIT (`consultantSkillsForFit`), jamais la requête —
    // `searchByFilters` n'a pas de filtre « métier ».
    const input: CompatibleEnvironmentsInput = { stack: [], zones: [], title: 'Ingénieur data' }
    expect(buildCompatibleEnvironmentsQuery(input)).toBeNull()
  })

  it('ne fait jamais voyager autre chose que la zone ou la compétence — aucun critère protégé', () => {
    // Un appelant qui construirait ce littéral avec des champs en trop (cast
    // délibéré, comme le ferait un objet `Consultant` complet) ne doit jamais
    // les voir apparaître dans la requête : le type ne les porte pas, et cette
    // assertion le prouve à l'exécution plutôt qu'à la lecture seule.
    const input = {
      stack: ['Java'],
      zones: [],
      title: null,
      full_name: 'Camille Roussel',
      photoUrl: 'https://example.com/camille.jpg',
      email: 'camille@example.com',
    } as unknown as CompatibleEnvironmentsInput
    const query = buildCompatibleEnvironmentsQuery(input)
    expect(query).toEqual({ technology: 'Java' })
    expect(JSON.stringify(query)).not.toMatch(/Camille|camille|jpg/)
  })
})

describe('consultantSkillsForFit', () => {
  it('combine compétences et métier, dans l’ordre déclaré', () => {
    expect(consultantSkillsForFit({ stack: ['Java', 'Kubernetes'], title: 'Data engineer' })).toEqual([
      'Java',
      'Kubernetes',
      'Data engineer',
    ])
  })

  it('déduplique sans tenir compte de la casse, et retire les entrées vides', () => {
    expect(consultantSkillsForFit({ stack: ['Java', '  ', 'java'], title: null })).toEqual(['Java'])
  })

  it('rend une liste vide sans compétence ni métier — jamais une entrée fantôme', () => {
    expect(consultantSkillsForFit({ stack: [], title: null })).toEqual([])
  })
})

describe('externalRecourseObserved — « Observé / Inconnu », jamais « Non observé »', () => {
  it('vrai dès qu’une société de services a été observée', () => {
    expect(
      externalRecourseObserved(coverage({ esnObserved: [{ esnName: 'Keyrus', persons: 3, certainty: 'moyenne' }] })),
    ).toBe(true)
  })

  it('faux — pas « non » — quand aucune société de services n’a été observée', () => {
    expect(externalRecourseObserved(coverage({ esnObserved: [] }))).toBe(false)
  })
})

describe('accessStateFor — deux états sur les trois du retour, jamais « ouvert »', () => {
  it('« chemin potentiel » quand une société de services a été observée', () => {
    expect(accessStateFor(coverage({ esnObserved: [{ esnName: 'Keyrus', persons: 3, certainty: 'moyenne' }] }))).toBe(
      'potential_path',
    )
  })

  it('« inconnu » sans société de services observée — jamais « ouvert »', () => {
    expect(accessStateFor(coverage({ esnObserved: [] }))).toBe('unknown')
  })
})

describe('refusedTechnologyObservedAt — #2336.5/.12-.15, la restriction déclarée, jamais une exclusion', () => {
  it('nomme la techno évitée quand la stack observée la porte', () => {
    expect(refusedTechnologyObservedAt(coverage({ observedStack: [{ techno: 'COBOL', persons: 5 }] }), ['COBOL'])).toBe(
      'COBOL',
    )
  })

  it('compare sans tenir compte de la casse ni des espaces', () => {
    expect(
      refusedTechnologyObservedAt(coverage({ observedStack: [{ techno: '  Cobol  ', persons: 5 }] }), ['cobol']),
    ).toBe('Cobol')
  })

  it('rend `null` sans recoupement — jamais une restriction devinée', () => {
    expect(
      refusedTechnologyObservedAt(coverage({ observedStack: [{ techno: 'Java', persons: 4 }] }), ['COBOL']),
    ).toBeNull()
  })

  it('rend `null` sans restriction déclarée, même si la stack en porterait une plus tard', () => {
    expect(refusedTechnologyObservedAt(coverage({ observedStack: [{ techno: 'COBOL', persons: 5 }] }), [])).toBeNull()
  })
})

describe('compatibleEnvironmentBuckets — #2288.5, quatre seaux, jamais un total unique', () => {
  function match(companyName: string, over: Partial<MarketMemoryCoverage> = {}): MarketContextMatch {
    return { companyName, coverage: coverage(over) }
  }

  it('compte « avec accès » et « en réserve » séparément, et ils somment au total', () => {
    const buckets = compatibleEnvironmentBuckets([
      match('Thales', { esnObserved: [{ esnName: 'Keyrus', persons: 3, certainty: 'moyenne' }] }),
      match('Atos'),
      match('Capgemini'),
    ])
    expect(buckets.compatible).toBe(3)
    expect(buckets.withAccess).toBe(1)
    expect(buckets.reserve).toBe(2)
    expect(buckets.withAccess + buckets.reserve).toBe(buckets.compatible)
  })

  it('« vérifiés » est `null` — non mesuré, jamais 0 — tant qu’aucune vérification n’existe (#2288.2)', () => {
    const buckets = compatibleEnvironmentBuckets([match('Thales'), match('Atos')])
    expect(buckets.verified).toBeNull()
  })

  it('rend les cinq seaux à zéro compatible sans jamais planter sur une liste vide', () => {
    expect(compatibleEnvironmentBuckets([])).toEqual({
      compatible: 0,
      verified: null,
      withAccess: 0,
      reserve: 0,
      priority: 0,
    })
  })

  it('compte « priorité » — #2968, le sous-ensemble qui porte déjà le verdict PRIORITÉ', () => {
    const buckets = compatibleEnvironmentBuckets([
      {
        companyName: 'Thales',
        coverage: coverage({ esnObserved: [{ esnName: 'Keyrus', persons: 3, certainty: 'moyenne' }] }),
        currentSignal: { nature: 'own', observedOn: '2026-09-01T00:00:00.000Z' },
      },
      match('Atos', { esnObserved: [{ esnName: 'Keyrus', persons: 3, certainty: 'moyenne' }] }),
    ])
    expect(buckets.priority).toBe(1)
  })

  // ── #2288.2 — le jour où la vérification existe, le seau se COMPTE ────────
  // `siren: null` ci-dessous : #2288.4 — champ requis par MarketVerificationCompanyState,
  // aucun SIREN connu dans ces fixtures (comportement inchangé).
  it('compte les vérifiés conservés quand les états sont connus', () => {
    const buckets = compatibleEnvironmentBuckets(
      [match('Thales'), match('Atos'), match('Capgemini')],
      [
        { companyName: 'Thales', state: 'kept', siren: null },
        { companyName: 'Atos', state: 'to_verify', siren: null },
        { companyName: 'Capgemini', state: 'corrected', siren: null },
      ],
    )
    // Une correction humaine EST une vérification — la plus forte qui soit.
    expect(buckets.verified).toBe(2)
  })

  it('ne compte PAS un périmé ni un non mesuré — ils sont redevenus inconnus', () => {
    const buckets = compatibleEnvironmentBuckets(
      [match('Thales'), match('Atos')],
      [
        { companyName: 'Thales', state: 'stale', siren: null },
        { companyName: 'Atos', state: 'unknown', siren: null },
      ],
    )
    expect(buckets.verified).toBe(0)
  })

  it('reste « non mesuré » tant que les états ne sont pas connus — jamais un 0 par défaut', () => {
    expect(compatibleEnvironmentBuckets([match('Thales')], null).verified).toBeNull()
    expect(compatibleEnvironmentBuckets([match('Thales')], undefined).verified).toBeNull()
  })

  it('ne compte que les entreprises AFFICHÉES : un état sur une entreprise absente ne gonfle rien', () => {
    const buckets = compatibleEnvironmentBuckets(
      [match('Thales')],
      [
        { companyName: 'Thales', state: 'kept', siren: null },
        { companyName: 'Une-autre', state: 'kept', siren: null },
      ],
    )
    expect(buckets.verified).toBe(1)
    expect(buckets.compatible).toBe(1)
  })
})

// ── Un sigle de zone n'est pas un territoire ────────────────────────────────
//
// ⚠️ Mesuré en production le 11/09/2026 : une fiche dont la première zone est
// « IDF » rendait le bloc VIDE. Le corpus stocke « Ile-de-France », « Paris »,
// « Boulogne-Billancourt » — jamais l'abréviation. Et « aucun environnement ne
// ressort » se lit comme un fait de marché, pas comme un défaut de jointure.

// ── #2968 — LES CINQ VERDICTS NOMMÉS, DEPUIS LES AXES QUI EXISTENT DÉJÀ ────
//
// `reverseMarketVerdictFor` ne recalcule rien : elle lit les deux axes que
// cette page mesure déjà pour une ligne (`accessStateFor`, `currentSignal`),
// plus l'état de vérification humaine (`MarketVerificationState`) et un geste
// de masquage. Voir sa documentation pour ce qu'un sixième verdict ou un axe
// inventé casserait.

const OWN_SIGNAL: MarketSignalDate = { nature: 'own', observedOn: '2026-09-01T00:00:00.000Z' }

describe('reverseMarketVerdictFor — les cinq verdicts nommés (#2968)', () => {
  it('PRIORITÉ — signal actuel vérifié ET accès potentiel, ensemble', () => {
    const verdict = reverseMarketVerdictFor({
      coverage: coverage({ esnObserved: [{ esnName: 'Keyrus', persons: 3, certainty: 'moyenne' }] }),
      currentSignal: OWN_SIGNAL,
    })
    expect(verdict).toBe('priority')
  })

  it('À QUALIFIER — un seul des deux axes est connu, jamais les deux ni aucun', () => {
    const signalSeulConnu = reverseMarketVerdictFor({
      coverage: coverage({ esnObserved: [] }),
      currentSignal: OWN_SIGNAL,
    })
    const accesSeulConnu = reverseMarketVerdictFor({
      coverage: coverage({ esnObserved: [{ esnName: 'Keyrus', persons: 3, certainty: 'moyenne' }] }),
      currentSignal: null,
    })
    expect(signalSeulConnu).toBe('to_qualify')
    expect(accesSeulConnu).toBe('to_qualify')
  })

  it('COMPATIBLE STRUCTURELLEMENT — ni signal ni accès, et aucune vérification tombée : le repli par défaut', () => {
    const verdict = reverseMarketVerdictFor({ coverage: coverage({ esnObserved: [] }), currentSignal: null })
    expect(verdict).toBe('structurally_compatible')
  })

  it('RÉSERVE — une vérification humaine a existé puis a vieilli (`stale`) : à conserver, sans action active', () => {
    const verdict = reverseMarketVerdictFor({
      coverage: coverage({ esnObserved: [] }),
      currentSignal: null,
      verificationState: 'stale',
    })
    expect(verdict).toBe('reserve')
  })

  it('ÉCARTÉ — le masquage humain gagne toujours, même sur une ligne par ailleurs PRIORITÉ', () => {
    const verdict = reverseMarketVerdictFor({
      coverage: coverage({ esnObserved: [{ esnName: 'Keyrus', persons: 3, certainty: 'moyenne' }] }),
      currentSignal: OWN_SIGNAL,
      dismissed: true,
    })
    expect(verdict).toBe('dropped')
  })
})

describe('un sigle de zone ne porte pas la recherche (#1625)', () => {
  it('passe au territoire SUIVANT quand la première zone est un sigle', () => {
    expect(
      buildCompatibleEnvironmentsQuery({ stack: ['Python'], zones: ['IDF', 'Île-de-France'], title: null }),
    ).toEqual({ location: 'Île-de-France' })
  })

  it('retombe sur la compétence quand le sigle est la SEULE zone', () => {
    expect(buildCompatibleEnvironmentsQuery({ stack: ['Python'], zones: ['IDF'], title: null })).toEqual({
      technology: 'Python',
    })
  })

  it("n'attrape pas ce qu'elle ne vise pas — une vraie ville reste une zone", () => {
    for (const zone of ['Paris', 'Lyon', 'La Défense', 'NANTES', 'Île-de-France']) {
      expect(buildCompatibleEnvironmentsQuery({ stack: ['Python'], zones: [zone], title: null })).toEqual({
        location: zone,
      })
    }
  })
})
