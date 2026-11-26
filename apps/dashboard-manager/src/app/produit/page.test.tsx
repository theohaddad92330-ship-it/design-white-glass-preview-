import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedbackItem } from '@/lib/feedback'
import type {
  ProductEventFamily,
  RapportDemande,
  RapportEcrans,
  RapportFriction,
  RapportParcours,
  RapportSectionsDossier,
  RapportValeur,
} from '@/lib/product-analytics'

/**
 * LE FILET DE `/produit` (#1682/#1683-#1688).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROUVE, ET COMMENT
 * ─────────────────────────────────────────────────────────────────────────
 * Le HTML rendu par le VRAI composant serveur, sur des rapports FABRIQUÉS —
 * jamais une lecture de classes CSS (jsdom ne met rien en page, et ce n'est de
 * toute façon pas l'environnement de ce lanceur : il est `node`). Trois choses
 * précises, qui sont les trois premiers tests demandés par le lot :
 *
 *  1. L'écran annonce son état d'instrumentation, et le fait EN PREMIER —
 *     avant la moindre section d'usage.
 *  2. Un agrégat jamais instrumenté rend « pas encore instrumenté », jamais
 *     « 0 » ni « aucun problème » — pour LES QUATRE agrégats qui peuvent
 *     porter ce troisième état (parcours interrompus, répétitions, erreurs
 *     vues, recherches sans résultat).
 *  3. La colonne « espaces » rend « non dérivable », jamais un espace nommé
 *     ni un compte.
 */
;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('@/lib/product-analytics', async () => {
  const actual = await vi.importActual<typeof import('@/lib/product-analytics')>('@/lib/product-analytics')
  return {
    ...actual,
    fetchProductScreens: vi.fn(),
    fetchProductJourneys: vi.fn(),
    fetchProductFriction: vi.fn(),
    fetchProductDemand: vi.fn(),
    fetchProductValue: vi.fn(),
    fetchProductAccountSections: vi.fn(),
  }
})
vi.mock('@/lib/feedback', async () => {
  const actual = await vi.importActual<typeof import('@/lib/feedback')>('@/lib/feedback')
  return { ...actual, fetchFeedback: vi.fn() }
})

import { fetchFeedback } from '@/lib/feedback'
import {
  fetchProductAccountSections,
  fetchProductDemand,
  fetchProductFriction,
  fetchProductJourneys,
  fetchProductScreens,
  fetchProductValue,
} from '@/lib/product-analytics'
import ProduitPage from './page'

const screens = vi.mocked(fetchProductScreens)
const journeys = vi.mocked(fetchProductJourneys)
const friction = vi.mocked(fetchProductFriction)
const demand = vi.mocked(fetchProductDemand)
const valeur = vi.mocked(fetchProductValue)
const accountSections = vi.mocked(fetchProductAccountSections)
const feedback = vi.mocked(fetchFeedback)

const NEUF_NATURES: ProductEventFamily['event'][] = [
  'screen_viewed',
  'screen_left',
  'tab_opened',
  'action_started',
  'action_completed',
  'action_abandoned',
  'filter_applied',
  'search_performed',
  'error_shown',
]

function familles(instrumentees: readonly ProductEventFamily['event'][]): ProductEventFamily[] {
  return NEUF_NATURES.map(event => ({ event, instrumented: instrumentees.includes(event) }))
}

const COVERAGE = { windowDays: 7, complete: true, eventsScanned: 0, maxEventsScanned: 50_000, oldestEventAt: null }

/** Le pire cas, et le cas RÉEL du 09/09/2026 : rien n'a jamais été écrit, sur
 *  aucune des neuf natures — tout est donc « pas encore instrumenté ». */
function rapportsToutEteint(): {
  ecrans: RapportEcrans
  parcours: RapportParcours
  friction: RapportFriction
  demande: RapportDemande
  valeur: RapportValeur
  sections: RapportSectionsDossier
} {
  const families = familles([])
  return {
    ecrans: {
      generatedAt: '2026-09-09T00:00:00.000Z',
      coverage: COVERAGE,
      families,
      distinctWorkspaces: { kind: 'not_derivable', reason: 'behavioral_flow_carries_no_workspace' },
      screens: [],
      unresolvedPaths: 0,
      notes: [],
    },
    parcours: {
      generatedAt: '2026-09-09T00:00:00.000Z',
      coverage: COVERAGE,
      families,
      exits: { kind: 'below_threshold', sessions: 0, minSessions: 5 },
      sequences: { kind: 'below_threshold', sessions: 0, minSessions: 5 },
      interrupted: { kind: 'not_instrumented' },
      notes: [],
    },
    friction: {
      generatedAt: '2026-09-09T00:00:00.000Z',
      coverage: COVERAGE,
      families,
      repetitions: { kind: 'not_instrumented' },
      roundTrips: { kind: 'below_threshold', sessions: 0, minSessions: 5 },
      errors: { kind: 'not_instrumented' },
      notes: [],
    },
    demande: {
      generatedAt: '2026-09-09T00:00:00.000Z',
      coverage: COVERAGE,
      families,
      emptySearches: { kind: 'not_instrumented' },
      notes: [],
    },
    valeur: {
      generatedAt: '2026-09-09T00:00:00.000Z',
      coverage: COVERAGE,
      families,
      amorce: { kind: 'not_instrumented' },
      reponses: { kind: 'not_instrumented' },
      brouillons: { kind: 'not_instrumented' },
      priorites: { kind: 'not_instrumented' },
      actions: { kind: 'not_instrumented' },
      suites: { kind: 'not_instrumented' },
      resultatMetier: { kind: 'not_derivable', reason: 'behavioral_flow_carries_no_workspace' },
      notes: [],
    },
    sections: {
      generatedAt: '2026-09-09T00:00:00.000Z',
      coverage: COVERAGE,
      families,
      sections: { kind: 'not_instrumented' },
      comprehension: { kind: 'not_instrumented' },
      synthesisToAction: { kind: 'not_instrumented' },
      corrections: { kind: 'not_instrumented' },
      engagedContacts: { kind: 'not_instrumented' },
      notes: [],
    },
  }
}

/** L'état RÉEL mesuré le 09/09/2026 : `screen_viewed`/`screen_left` câblés,
 *  les sept autres non — et une nature MESURÉE dont l'agrégat trouve un vrai
 *  zéro (une session a bien navigué, aucune répétition n'a eu lieu). */
function rapportsEtatReel(): ReturnType<typeof rapportsToutEteint> {
  const families = familles(['screen_viewed', 'screen_left'])
  return {
    ecrans: {
      generatedAt: '2026-09-09T00:00:00.000Z',
      coverage: { ...COVERAGE, eventsScanned: 40 },
      families,
      distinctWorkspaces: { kind: 'not_derivable', reason: 'behavioral_flow_carries_no_workspace' },
      screens: [
        {
          route: '/briefing',
          label: { fr: 'Aujourd’hui', en: 'Today' },
          nature: 'produit',
          views: 30,
          sessions: 8,
          measures: {
            kind: 'measured',
            viewsPerWeek: 30,
            medianDuration: { kind: 'measured', seconds: 42 },
            bounceRate: { kind: 'measured', ratio: 0.1, over: 30 },
            actionRate: { kind: 'measured', ratio: 0.5, over: 30 },
          },
        },
      ],
      unresolvedPaths: 0,
      notes: [],
    },
    parcours: {
      generatedAt: '2026-09-09T00:00:00.000Z',
      coverage: { ...COVERAGE, eventsScanned: 40 },
      families,
      exits: { kind: 'measured', sessions: 8, value: [] },
      sequences: { kind: 'below_threshold', sessions: 2, minSessions: 5 },
      // `action_started` n'a aucun appelant : cet agrégat reste NON
      // INSTRUMENTÉ même quand screen_viewed/screen_left sont câblés.
      interrupted: { kind: 'not_instrumented' },
      notes: [],
    },
    friction: {
      generatedAt: '2026-09-09T00:00:00.000Z',
      coverage: { ...COVERAGE, eventsScanned: 40 },
      families,
      repetitions: { kind: 'not_instrumented' },
      // Basé sur screen_viewed seul : MESURÉ, et trouve un ZÉRO VRAI.
      roundTrips: { kind: 'measured', sessions: 8, value: [] },
      errors: { kind: 'not_instrumented' },
      notes: [],
    },
    demande: {
      generatedAt: '2026-09-09T00:00:00.000Z',
      coverage: { ...COVERAGE, eventsScanned: 40 },
      families,
      emptySearches: { kind: 'not_instrumented' },
      notes: [],
    },
    // #2130.73 — MESURÉ : le prédicat corrigé de `product-analytics-read
    // .service.ts` compare aux VRAIS verdicts (`pas_pertinent`/`donnee_fausse`,
    // `REPLY_FEEDBACK_VERDICTS`), jamais aux clés périmées qui rendaient 0 %
    // en silence.
    valeur: {
      generatedAt: '2026-09-09T00:00:00.000Z',
      coverage: { ...COVERAGE, eventsScanned: 40 },
      families,
      amorce: { kind: 'not_instrumented' },
      reponses: {
        kind: 'measured',
        sessions: 8,
        value: {
          judged: 20,
          utileRate: { kind: 'measured', ratio: 0.5, over: 20 },
          generiqueRate: { kind: 'measured', ratio: 0.2, over: 20 },
          inexacteRate: { kind: 'measured', ratio: 0.1, over: 20 },
          dejaFaitRate: { kind: 'unmeasured' },
          pasMaintenantRate: { kind: 'unmeasured' },
          mauvaisePrioriteRate: { kind: 'unmeasured' },
        },
      },
      brouillons: { kind: 'not_instrumented' },
      priorites: { kind: 'not_instrumented' },
      actions: { kind: 'measured', sessions: 8, value: [] },
      suites: { kind: 'not_instrumented' },
      resultatMetier: { kind: 'not_derivable', reason: 'behavioral_flow_carries_no_workspace' },
      notes: [],
    },
    // #2130.71 — MESURÉ : `tab_opened` n'est pas dans les neuf natures de ce
    // fichier (câblées seulement `screen_viewed`/`screen_left`), mais le
    // rapport peut malgré tout publier ses propres familles — chaque route
    // calcule `families` pour son compte sur SA propre nature.
    sections: {
      generatedAt: '2026-09-09T00:00:00.000Z',
      coverage: { ...COVERAGE, eventsScanned: 40 },
      families,
      sections: {
        kind: 'measured',
        sessions: 8,
        value: [
          { tab: 'overview', opens: 12, sessions: 8 },
          { tab: 'contacts', opens: 5, sessions: 4 },
        ],
      },
      comprehension: {
        kind: 'measured',
        sessions: 8,
        value: { medianTimeToComprehension: { kind: 'measured', seconds: 12 } },
      },
      synthesisToAction: {
        kind: 'measured',
        sessions: 8,
        value: { conversionRate: { kind: 'measured', ratio: 0.5, over: 8 } },
      },
      // #2130.72 — MESURÉ : `correction_submitted` (`EntityResolutionPanel.tsx`)
      // est un `action_started` générique, déjà présent dans `families` ici.
      corrections: { kind: 'measured', sessions: 8, value: { submitted: 3 } },
      engagedContacts: {
        kind: 'measured',
        sessions: 8,
        value: { engagedRate: { kind: 'measured', ratio: 0.25, over: 8 } },
      },
      notes: [],
    },
  }
}

function mock(rapports: ReturnType<typeof rapportsToutEteint>, items: FeedbackItem[] = []) {
  screens.mockResolvedValue(rapports.ecrans)
  journeys.mockResolvedValue(rapports.parcours)
  friction.mockResolvedValue(rapports.friction)
  demand.mockResolvedValue(rapports.demande)
  valeur.mockResolvedValue(rapports.valeur)
  accountSections.mockResolvedValue(rapports.sections)
  feedback.mockResolvedValue({ items, issuesAvailable: true, responsesAvailable: true })
}

async function rendu(): Promise<string> {
  return renderToStaticMarkup(await ProduitPage())
}

describe('/produit — trois états, jamais deux, jamais un 0 pour une absence', () => {
  beforeEach(() => {
    screens.mockReset()
    journeys.mockReset()
    friction.mockReset()
    demand.mockReset()
    valeur.mockReset()
    accountSections.mockReset()
    feedback.mockReset()
  })

  it('LIT quelque chose — les deux jeux de fixtures sont bien contrastés', () => {
    // Contrôle positif : deux jeux identiques rendraient un test qui ne prouve
    // rien, en particulier le test « les deux rendus sont différents » plus bas.
    const eteint = rapportsToutEteint()
    const reel = rapportsEtatReel()
    expect(eteint.ecrans.families.every(f => !f.instrumented)).toBe(true)
    expect(reel.ecrans.families.filter(f => f.instrumented)).toHaveLength(2)
    expect(reel.ecrans.screens.length).toBeGreaterThan(0)
  })

  it('annonce « 0 des 9 natures d’événement sont instrumentées », et le fait EN PREMIER', async () => {
    mock(rapportsToutEteint())
    const html = await rendu()
    const phrase = '0 des 9 natures d’événement sont instrumentées'
    expect(html).toContain(phrase)
    // EN PREMIER : avant la section « Utilisation par écran » qui suit.
    const positionBanniere = html.indexOf(phrase)
    const positionSectionSuivante = html.indexOf('Utilisation par écran')
    expect(positionBanniere).toBeGreaterThan(-1)
    expect(positionSectionSuivante).toBeGreaterThan(-1)
    expect(positionBanniere).toBeLessThan(positionSectionSuivante)
  })

  it('nomme les natures manquantes, une par une', async () => {
    mock(rapportsToutEteint())
    const html = await rendu()
    expect(html).toContain('Action démarrée')
    expect(html).toContain('Recherche effectuée')
    expect(html).toContain('Erreur affichée')
  })

  it('un agrégat jamais instrumenté rend « pas encore instrumenté », jamais « 0 » ni « aucun problème »', async () => {
    mock(rapportsToutEteint())
    const html = await rendu()
    // Les quatre agrégats qui peuvent porter `not_instrumented` dans ce jeu :
    // parcours interrompus, répétitions, erreurs vues, recherches sans résultat.
    const occurrences = html.split('pas encore instrumenté').length - 1
    expect(occurrences).toBeGreaterThanOrEqual(4)
    expect(html.toLowerCase()).not.toContain('aucun problème')
  })

  it('la colonne « espaces » rend « non dérivable », jamais un espace nommé ni un compte', async () => {
    mock(rapportsToutEteint())
    const html = await rendu()
    expect(html).toContain('non dérivable')
    // ⚠️ La valeur n'est pas dans le MÊME nœud de texte que son étiquette
    // (deux `<div>` voisins) : un `[^<]*` s'arrêterait au premier `<` et ne
    // verrait jamais la valeur. On dépouille TOUTES les balises d'abord, pour
    // lire ce qui suit « Espaces distincts » comme un lecteur d'écran le
    // ferait — sinon ce test passerait même si la valeur rendait un compte.
    const texte = html.replace(/<[^>]+>/g, '|')
    const apresEtiquette = texte.split('Espaces distincts')[1]?.split('|').filter(Boolean)[0] ?? ''
    expect(apresEtiquette.trim()).toBe('non dérivable')
    expect(apresEtiquette).not.toMatch(/\d/)
    // Jamais un nom d'espace connu du dépôt, jamais le mot « workspace » cru.
    expect(apresEtiquette.toLowerCase()).not.toContain('workspace')
  })

  it('sait dire NON — la colonne « espaces » attraperait un vrai compte s’il était rendu à la place', () => {
    // Contrôle négatif du test précédent, sur le TEXTE seul (sans re-render) :
    // prouve que la méthode d'extraction verrait bien passer un chiffre si le
    // composant en rendait un, plutôt que de toujours trouver « non dérivable »
    // par construction de la regex.
    const htmlFabrique = '<div class="card"><div class="label">Espaces distincts</div><div class="value">3</div></div>'
    const texte = htmlFabrique.replace(/<[^>]+>/g, '|')
    const apresEtiquette = texte.split('Espaces distincts')[1]?.split('|').filter(Boolean)[0] ?? ''
    expect(apresEtiquette.trim()).toBe('3')
    expect(apresEtiquette).toMatch(/\d/)
  })

  it('un ZÉRO VRAI (mesuré, agrégat vide) reste distinct de « pas encore instrumenté »', async () => {
    mock(rapportsEtatReel())
    const html = await rendu()
    // `exits`/`roundTrips` sont MESURÉS et vides dans ce jeu : la phrase doit
    // nommer un compte de sessions, jamais « pas encore instrumenté ».
    expect(html).toContain('Aucune sortie')
    expect(html).toContain('Aucun aller-retour')
    expect(html).toMatch(/Aucune sortie — mesuré sur \d+ sessions? distinctes/)
    // Et les agrégats non instrumentés de CE MÊME jeu restent nommés comme tels.
    expect(html).toContain('pas encore instrumenté')
  })

  it('l’état réel du 09/09/2026 — 2 des 9 instrumentées, jamais « 0 écran » pour un flux qui a de la donnée', async () => {
    mock(rapportsEtatReel())
    const html = await rendu()
    expect(html).toContain('2 des 9 natures d’événement sont instrumentées')
    expect(html).toContain('Aujourd’hui')
  })

  it('sait dire NON — quand tout est instrumenté, aucune section n’affiche « pas encore instrumenté »', async () => {
    const rapports = rapportsToutEteint()
    const families = familles(NEUF_NATURES)
    mock({
      ecrans: { ...rapports.ecrans, families },
      parcours: {
        ...rapports.parcours,
        families,
        interrupted: { kind: 'measured', sessions: 6, value: [] },
      },
      friction: {
        ...rapports.friction,
        families,
        repetitions: { kind: 'measured', sessions: 6, value: [] },
        errors: { kind: 'measured', sessions: 6, value: [] },
      },
      demande: { ...rapports.demande, families, emptySearches: { kind: 'measured', sessions: 6, value: [] } },
      valeur: {
        ...rapports.valeur,
        families,
        amorce: {
          kind: 'measured',
          sessions: 6,
          value: {
            firstQuestionSessions: 6,
            firstUsefulResultSessions: 6,
            usefulRate: { kind: 'measured', ratio: 1, over: 6 },
            medianTimeToUseful: { kind: 'measured', seconds: 30 },
          },
        },
        reponses: {
          kind: 'measured',
          sessions: 6,
          value: {
            judged: 6,
            utileRate: { kind: 'measured', ratio: 1, over: 6 },
            generiqueRate: { kind: 'measured', ratio: 0, over: 6 },
            inexacteRate: { kind: 'measured', ratio: 0, over: 6 },
            dejaFaitRate: { kind: 'measured', ratio: 0, over: 6 },
            pasMaintenantRate: { kind: 'measured', ratio: 0, over: 6 },
            mauvaisePrioriteRate: { kind: 'measured', ratio: 0, over: 6 },
          },
        },
        brouillons: {
          kind: 'measured',
          sessions: 6,
          value: {
            reused: 6,
            telQuelRate: { kind: 'measured', ratio: 1, over: 6 },
            retoucheRate: { kind: 'measured', ratio: 0, over: 6 },
            reecritRate: { kind: 'measured', ratio: 0, over: 6 },
          },
        },
        priorites: {
          kind: 'measured',
          sessions: 6,
          value: {
            viewed: 6,
            accepted: 0,
            snoozed: 0,
            rejected: 0,
            corrected: 0,
            treatedRate: { kind: 'measured', ratio: 0, over: 6 },
            refusalRate: { kind: 'measured', ratio: 0, over: 6 },
          },
        },
        actions: { kind: 'measured', sessions: 6, value: [] },
        suites: {
          kind: 'measured',
          sessions: 6,
          value: {
            suggestionClicks: 0,
            redirectsFollowed: 0,
            interventions: 0,
            interventionIgnoredRate: { kind: 'unmeasured' },
            memoriesAdded: 0,
            connectorsEnabledAfterHint: 0,
          },
        },
      },
      sections: {
        ...rapports.sections,
        families,
        sections: { kind: 'measured', sessions: 6, value: [] },
        comprehension: {
          kind: 'measured',
          sessions: 6,
          value: { medianTimeToComprehension: { kind: 'measured', seconds: 8 } },
        },
        synthesisToAction: {
          kind: 'measured',
          sessions: 6,
          value: { conversionRate: { kind: 'measured', ratio: 1, over: 6 } },
        },
        corrections: { kind: 'measured', sessions: 6, value: { submitted: 0 } },
        engagedContacts: {
          kind: 'measured',
          sessions: 6,
          value: { engagedRate: { kind: 'measured', ratio: 0, over: 6 } },
        },
      },
    })
    const html = await rendu()
    expect(html).toContain('9 des 9 natures d’événement sont instrumentées')
    expect(html).not.toContain('pas encore instrumenté')
  })

  // #4595 — la mesure « connecteur activé après recommandation » est ARRÊTÉE (#4513,
  // 25/10/2026) : sa tuile se nomme arrêtée et porte la dernière valeur connue,
  // jamais un « 0 » pour une mesure qui n'a plus d'émetteur.
  describe('tuile « connecteur activé après recommandation » — mesure arrêtée', () => {
    const tuile = (html: string) =>
      /Connecteurs activés après recommandation<\/div><div[^>]*>([^<]*)<\/div>/.exec(html)?.[1]

    async function renduAvec(connectorsEnabledAfterHint: number | null | undefined) {
      const rapports = rapportsToutEteint()
      mock({
        ...rapports,
        valeur: {
          ...rapports.valeur,
          suites: {
            kind: 'measured',
            sessions: 6,
            value: {
              suggestionClicks: 3,
              redirectsFollowed: 1,
              interventions: 2,
              interventionIgnoredRate: { kind: 'unmeasured' },
              memoriesAdded: 4,
              ...(connectorsEnabledAfterHint === undefined ? {} : { connectorsEnabledAfterHint }),
            },
          },
        },
      })
      return rendu()
    }

    it('nomme la mesure arrêtée avec sa date, et rend la dernière valeur connue', async () => {
      const html = await renduAvec(12)
      expect(html).toContain('mesure arrêtée le 25/10/2026')
      expect(tuile(html)).toBe('12')
    })

    // #4595.3 — une valeur absente dit « non mesuré » (KpiTile), plus « — » ; jamais « 0 ».
    it('sait dire NON — sans valeur connue (absente, null ou 0 d’un vieux flux) la tuile dit « non mesuré », jamais « 0 »', async () => {
      for (const valeurs of [undefined, null, 0] as const) {
        const html = await renduAvec(valeurs)
        expect(html).toContain('mesure arrêtée le 25/10/2026')
        expect(tuile(html)).toBe('non mesuré')
      }
    })
  })

  // #2108.64/.65 — le bloc des priorités du jour.
  it('rend les priorités : vues, taux traité et refusé ; éteint → « pas encore instrumenté », jamais 0', async () => {
    const rapports = rapportsToutEteint()
    mock({
      ...rapports,
      valeur: {
        ...rapports.valeur,
        priorites: {
          kind: 'measured',
          sessions: 6,
          value: {
            viewed: 40,
            accepted: 10,
            snoozed: 4,
            rejected: 8,
            corrected: 2,
            treatedRate: { kind: 'measured', ratio: 0.25, over: 40 },
            refusalRate: { kind: 'measured', ratio: 0.2, over: 40 },
          },
        },
      },
    })
    const html = await rendu()
    expect(html).toContain('Priorités du jour')
    expect(html).toContain('Priorités vues')
    expect(html).toContain('Refusées')

    mock(rapportsToutEteint())
    expect(await rendu()).not.toContain('Priorités vues')
  })

  // #2108 / #2767 — preuve de code du bloc « Priorités du jour » (la recette
  // écran ne peut pas ouvrir cet écran interne) : on rejoue le cas avec des
  // VALEURS et on lit ce que la page affiche, pas seulement les libellés.
  it('priorités du jour : chaque compteur et chaque taux est LU dans le rendu ; un taux non mesuré se dit « non mesuré », jamais 0', async () => {
    const rapports = rapportsToutEteint()
    mock({
      ...rapports,
      valeur: {
        ...rapports.valeur,
        priorites: {
          kind: 'measured',
          sessions: 6,
          value: {
            viewed: 40,
            accepted: 10,
            snoozed: 4,
            rejected: 8,
            corrected: 2,
            treatedRate: { kind: 'measured', ratio: 0.25, over: 40 },
            refusalRate: { kind: 'unmeasured' },
          },
        },
      },
    })
    const html = await rendu()
    expect(html).toContain('Priorités du jour — vues, traitées, reportées, refusées, corrigées')
    // Compteurs : les valeurs mesurées, tuile par tuile.
    expect(html).toMatch(/Priorités vues[\s\S]*?40/)
    expect(html).toMatch(/Reportées[\s\S]*?4/)
    expect(html).toMatch(/Corrigées \(donnée fausse\)[\s\S]*?2/)
    // Taux mesuré : pourcentage ET dénominateur.
    expect(html).toContain('25 % (sur 40)')
    // Taux non mesuré : nommé tel quel, jamais un « 0 % » fabriqué.
    expect(html).toContain('non mesuré')
    expect(html).not.toContain('0 % (sur')
  })

  it('les deux rendus (tout éteint / état réel) sont bien DIFFÉRENTS', async () => {
    mock(rapportsToutEteint())
    const eteint = await rendu()
    mock(rapportsEtatReel())
    const reel = await rendu()
    expect(eteint).not.toBe(reel)
  })

  // #2130.71 — les sections du dossier compte, filtrées sur ce seul écran.
  it('rend les sections du dossier compte, la plus ouverte d’abord', async () => {
    mock(rapportsEtatReel())
    const html = await rendu()
    expect(html).toContain('Sections du dossier compte')
    expect(html).toContain('overview')
    expect(html).toContain('contacts')
  })

  it('sait dire NON — « pas encore instrumenté » quand `tab_opened` n’a jamais été écrit', async () => {
    mock(rapportsToutEteint())
    const html = await rendu()
    expect(html).toContain('Sections du dossier compte')
    // Aucune section n'est nommée : le tableau ne publie rien sous ce jeu.
    expect(html).not.toContain('overview')
  })

  // #2130.69 — délai médian jusqu'à la première section ouverte.
  it('rend le délai médian « ouverture → compréhension »', async () => {
    mock(rapportsEtatReel())
    const html = await rendu()
    expect(html).toContain('Ouverture → compréhension')
    expect(html).toContain('12 s')
  })

  it('sait dire NON — « pas encore instrumenté » pour la compréhension aussi', async () => {
    mock(rapportsToutEteint())
    const html = await rendu()
    expect(html).toContain('Ouverture → compréhension')
    expect(html).not.toContain('Délai médian')
  })

  // #2130.74 — taux de passage Synthèse → action.
  it('rend le taux de passage « Synthèse → action »', async () => {
    mock(rapportsEtatReel())
    const html = await rendu()
    expect(html).toContain('Synthèse → action')
    expect(html).toContain('50 % (sur 8)')
  })

  it('sait dire NON — « pas encore instrumenté » pour Synthèse → action aussi', async () => {
    mock(rapportsToutEteint())
    const html = await rendu()
    expect(html).toContain('Synthèse → action')
    expect(html).not.toContain('Taux de passage')
  })

  // #2130.72 — nombre de corrections soumises (résolution d'identité).
  it('rend le nombre de corrections soumises', async () => {
    mock(rapportsEtatReel())
    const html = await rendu()
    expect(html).toContain('Corrections soumises')
    expect(html).toContain('Total soumis')
  })

  it('sait dire NON — « pas encore instrumenté » pour les corrections aussi', async () => {
    mock(rapportsToutEteint())
    const html = await rendu()
    expect(html).toContain('Corrections soumises')
    expect(html).not.toContain('Total soumis')
  })

  // #2130.75 — contacts recommandés engagés (taux par session).
  it('rend la part des sessions qui engagent un contact recommandé', async () => {
    mock(rapportsEtatReel())
    const html = await rendu()
    expect(html).toContain('Contacts recommandés engagés')
    expect(html).toContain('Sessions engagées')
  })

  it('sait dire NON — « pas encore instrumenté » pour les contacts engagés aussi', async () => {
    mock(rapportsToutEteint())
    const html = await rendu()
    expect(html).toContain('Contacts recommandés engagés')
    expect(html).not.toContain('Sessions engagées')
  })

  it('une route interne en échec ne casse pas la page — elle nomme la section en défaut', async () => {
    const rapports = rapportsToutEteint()
    screens.mockRejectedValue(new Error('product-screens endpoint returned 500 Internal Server Error'))
    journeys.mockResolvedValue(rapports.parcours)
    friction.mockResolvedValue(rapports.friction)
    demand.mockResolvedValue(rapports.demande)
    valeur.mockResolvedValue(rapports.valeur)
    accountSections.mockResolvedValue(rapports.sections)
    feedback.mockResolvedValue({ items: [], issuesAvailable: true, responsesAvailable: true })
    const html = await rendu()
    // La bannière s'appuie sur le premier rapport DISPONIBLE (ici `parcours`) :
    // elle s'affiche quand même.
    expect(html).toContain('0 des 9 natures d’événement sont instrumentées')
    expect(html).toContain('Impossible de lire cette section')
  })
})

/**
 * #1683.1 / #1684.1 / #1684.2 / #1688.4 — LE VERDICT, LA DESTINATION, LE
 * RÉSIDU, LE CROISEMENT — testés sur le VRAI composant, comme le filet
 * ci-dessus. Un jeu de fixtures dédié, distinct de `rapportsEtatReel`, pour ne
 * pas risquer de faire dériver les onze tests déjà verts au-dessus.
 */
// #1683.1 / #1684.1 / #1684.2 / #1688.4 — voir le docblock ci-dessus.
describe('/produit — le verdict, la destination, le résidu, le croisement', () => {
  beforeEach(() => {
    screens.mockReset()
    journeys.mockReset()
    friction.mockReset()
    demand.mockReset()
    valeur.mockReset()
    accountSections.mockReset()
    feedback.mockReset()
  })

  function rapportsAvecUsageEtDemande(): ReturnType<typeof rapportsToutEteint> {
    const base = rapportsEtatReel()
    const parcoursMesures = Array.from({ length: 12 }, (_, i) => ({
      routes: [`/r${i}-a`, `/r${i}-b`, `/r${i}-c`],
      labels: [
        { fr: `Étape ${i}A`, en: `Step ${i}A` },
        { fr: `Étape ${i}B`, en: `Step ${i}B` },
        { fr: `Étape ${i}C`, en: `Step ${i}C` },
      ],
      sessions: 12 - i, // 12, 11, …, 1 — top 10 = 12..3, résidu = 2 et 1
    }))
    return {
      ...base,
      parcours: {
        ...base.parcours,
        exits: {
          kind: 'measured',
          sessions: 8,
          value: [
            {
              route: '/briefing',
              label: { fr: 'Aujourd’hui', en: 'Today' },
              exits: 12,
              sessions: 8,
              detail: {
                kind: 'measured',
                destinations: [
                  { route: '/accounts', label: { fr: 'Comptes', en: 'Accounts' }, exits: 9 },
                  { route: '/contacts', label: { fr: 'Contacts', en: 'Contacts' }, exits: 2 },
                ],
                closeRate: { kind: 'measured', ratio: 0.25, over: 12 },
                idleRate: { kind: 'unmeasured' },
              },
            },
          ],
        },
        sequences: { kind: 'measured', sessions: 8, value: parcoursMesures },
      },
      demande: {
        ...base.demande,
        families: familles(['screen_viewed', 'screen_left', 'search_performed']),
        emptySearches: {
          kind: 'measured',
          sessions: 6,
          value: [
            {
              route: '/briefing',
              label: { fr: 'Aujourd’hui', en: 'Today' },
              searches: 10,
              emptySearches: 4,
              sessions: 6,
              emptyRate: { kind: 'measured', ratio: 0.4, over: 10 },
            },
          ],
        },
      },
    }
  }

  it('LIT quelque chose — la fixture est bien celle attendue avant de tester le rendu', () => {
    const rapports = rapportsAvecUsageEtDemande()
    expect(rapports.parcours.exits.kind).toBe('measured')
    expect(rapports.parcours.sequences.kind).toBe('measured')
    expect(rapports.demande.emptySearches.kind).toBe('measured')
  })

  // #1683.1 — le verdict est rendu À CÔTÉ du chiffre, jamais à sa place.
  it('le verdict « travaillé » apparaît pour /briefing (action 50 %)', async () => {
    mock(rapportsAvecUsageEtDemande())
    const html = await rendu()
    // actionRate = 0.5 ≥ TAUX_ACTION_MIN_TRAVAILLE (0.3) sur la fixture /briefing (un écran du catalogue — « Tableau de bord » en est retiré, 863f9d9d0).
    expect(html).toContain('travaillé')
    // Le chiffre brut reste présent — aucune information n'a disparu (#1642.2).
    expect(html).toContain('42 s') // durée médiane déjà rendue avant ce lot
  })

  // #1683.1 — les sept états s'additionnent jusqu'au nombre d'écrans du catalogue.
  it('le résumé du verdict s’ADDITIONNE, et dit honnêtement pourquoi la plupart sont non mesurés', async () => {
    mock(rapportsAvecUsageEtDemande())
    const html = await rendu()
    expect(html).toContain('Verdict sur les')
    expect(html).toContain('non mesuré')
    expect(html).toContain('date de mise en service indisponible')
  })

  // #1684.1 — la destination principale et la part de fermeture pure, jamais fondues.
  it('la destination principale et la part de fermeture pure apparaissent, jamais fondues', async () => {
    mock(rapportsAvecUsageEtDemande())
    const html = await rendu()
    expect(html).toContain('Comptes')
    expect(html).toContain('25 % (sur 12)')
  })

  // #1684.2 — le résidu des parcours est NOMMÉ et toujours rendu en dernier.
  it('le résidu des parcours est NOMMÉ et se trouve APRÈS les dix parcours affichés', async () => {
    mock(rapportsAvecUsageEtDemande())
    const html = await rendu()
    const positionResidu = html.indexOf('Autres parcours mesurés')
    const positionDernierAffiche = html.indexOf('Étape 9A') // sessions=3, le 10ᵉ segment affiché
    const positionPremierMasque = html.indexOf('Étape 10A') // sessions=2, masqué
    expect(positionResidu).toBeGreaterThan(-1)
    expect(positionDernierAffiche).toBeGreaterThan(-1)
    expect(positionResidu).toBeGreaterThan(positionDernierAffiche)
    // Les parcours masqués ne sont PAS nommés individuellement dans la barre.
    expect(positionPremierMasque).toBe(-1)
    expect(html).toContain('2 non détaillés')
  })

  // #1688.4 — le croisement usage × demande rend un quadrant nommé, jamais un chiffre nu.
  it('le croisement usage × demande rend un quadrant nommé, jamais un chiffre nu', async () => {
    mock(rapportsAvecUsageEtDemande())
    const html = await rendu()
    // usage « eleve » (travaillé) × demande « eleve » (40 % d’échec, 6 sessions) → adopté sous tension.
    expect(html).toContain('adopté, sous tension')
    expect(html).toContain('Usage × demande')
  })

  it('sait dire NON — sans ces fixtures (l’état réel de base), aucun quadrant nommé n’apparaît par accident', async () => {
    mock(rapportsEtatReel())
    const html = await rendu()
    expect(html).not.toContain('adopté, sous tension')
  })
})

/**
 * #2130.73 — LA SECTION VALEUR, jusqu'ici sans appelant front (`fetchProductValue`
 * n'existait pas dans ce fichier). Même filet que les tests ci-dessus : le VRAI
 * composant serveur, sur des rapports fabriqués.
 */
describe('/produit — Valeur (issues 2130.73, 1946)', () => {
  beforeEach(() => {
    screens.mockReset()
    journeys.mockReset()
    friction.mockReset()
    demand.mockReset()
    valeur.mockReset()
    accountSections.mockReset()
    feedback.mockReset()
  })

  it('pas encore instrumenté : les cinq agrégats de Valeur le disent, jamais un 0 muet', async () => {
    mock(rapportsToutEteint())
    const html = await rendu()
    expect(html).toContain('Valeur')
    // Les cinq agrégats de `rapportsToutEteint().valeur` sont `not_instrumented` :
    // le compte d'occurrences de « pas encore instrumenté » doit donc AUGMENTER
    // par rapport aux quatre agrégats des autres sections (test plus haut : ≥4).
    const occurrences = html.split('pas encore instrumenté').length - 1
    expect(occurrences).toBeGreaterThanOrEqual(9)
  })

  it('mesuré : « pas pertinent »/« donnée fausse » s’affichent avec leur vrai pourcentage — la correction issue 2130.73 branchée jusqu’à l’écran', async () => {
    mock(rapportsEtatReel())
    const html = await rendu()
    // `reponses` de `rapportsEtatReel().valeur` : generiqueRate 20 % (sur 20),
    // inexacteRate 10 % (sur 20) — AVANT ce lot, aucun écran ne les affichait
    // (aucun appelant front), donc ce test aurait été rouge quel que soit le
    // calcul côté service.
    expect(html).toContain('Pas pertinent')
    expect(html).toContain('Donnée fausse')
    expect(html).toContain('20 % (sur 20)')
    expect(html).toContain('10 % (sur 20)')
  })

  it('résultat métier : nommé NON DÉRIVABLE, jamais un chiffre (règle 5, GA-266)', async () => {
    mock(rapportsEtatReel())
    const html = await rendu()
    expect(html).toContain('Résultat métier')
    expect(html).toContain('non dérivable')
  })

  it('sait dire NON — une route Valeur en échec nomme la section en défaut, ne casse pas la page', async () => {
    const rapports = rapportsToutEteint()
    screens.mockResolvedValue(rapports.ecrans)
    journeys.mockResolvedValue(rapports.parcours)
    friction.mockResolvedValue(rapports.friction)
    demand.mockResolvedValue(rapports.demande)
    valeur.mockRejectedValue(new Error('product-value endpoint returned 500 Internal Server Error'))
    feedback.mockResolvedValue({ items: [], issuesAvailable: true, responsesAvailable: true })
    const html = await rendu()
    expect(html).toContain('0 des 9 natures d’événement sont instrumentées')
    expect(html).toContain('Impossible de lire cette section')
  })
})
