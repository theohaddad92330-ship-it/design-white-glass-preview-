import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountMarketContext } from '@bellum/contracts'

/**
 * #1640.3 — LE CONTEXTE MARCHÉ, PORTÉ DE LA LISTE AU DOSSIER.
 *
 * Le popover de la liste (`AccountMarketContextButton`, #1582) écrit déjà
 * « Recours à des externes : Observé » — mais seulement là. Ouvrir le dossier
 * d'un compte ne montrait ce fait NULLE PART (retour bêta du 06/09/2026).
 *
 * Cette suite ne garde pas une mise en page — jsdom n'en met aucune — mais les
 * QUATRE états que le hook peut rendre, et ce que chacun DOIT écrire :
 *
 *  1. couvert (`data` non nul) → « Observé ».
 *  2. non couvert (`data === null`, lu, sous le seuil) → « Non mesuré ». JAMAIS
 *     « 0 » ni une négation — c'est la même règle que le popover de la liste.
 *  3. panne (`isError`) → « Mémoire marché indisponible ». Ni « Non mesuré »,
 *     ni le silence : une panne se DIT.
 *  4. lecture en cours (`isPending`) → « Lecture en cours… », pas de verdict.
 *
 * Et la différence structurelle avec le popover : le dossier est une page déjà
 * ouverte exprès, donc le hook est appelé avec `enabled: true` DÈS le montage
 * — pas de second geste à poser pour lire ce qu'on est déjà venu lire.
 */

type QueryState = { data?: AccountMarketContext | null; isPending: boolean; isError: boolean }

const state: { current: QueryState; enabled: boolean | undefined } = {
  current: { data: undefined, isPending: true, isError: false },
  enabled: undefined,
}

vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: (_id: string | undefined, enabled: boolean) => {
    state.enabled = enabled
    return state.current
  },
}))

const relaunch = vi.fn()
vi.mock('@/features/accounts/hooks/useAccountRelaunch', () => ({
  useAccountRelaunch: () => ({ relaunch }),
}))

const { AccountMarketMemoryCard } = await import('./AccountMarketMemoryCard')

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222'

/**
 * #2127.40 / .24 — LA LECTURE LOCALE ET LA VÉRIFICATION FRAÎCHE NE SE CONFONDENT PAS.
 *
 * Tout ce que la carte écrit est RELU depuis la mémoire, sans frais. Vérifier
 * aujourd'hui, c'est relancer une analyse — et ça coûte. La paire est le message
 * (`MARKET_MEMORY_PAID_VERIFICATIONS`) : l'une sans l'autre passe pour de la
 * générosité ou pour une taxe. Le coût s'annonce AVANT le clic.
 */
describe('#2127.40 / .24 — lecture locale incluse, vérification fraîche payante et annoncée', () => {
  it('dit que la lecture est locale et incluse, et ne porte aucun coût (#4463)', () => {
    state.current = { data: { paths_observed: 12, esn_observed: 1 }, isPending: false, isError: false }
    render(<AccountMarketMemoryCard accountId={ACCOUNT_ID} companyName="ACME" />)
    expect(screen.getByText('Mémoire locale · lecture incluse')).toBeInTheDocument()
    const button = screen.getByRole('button', { name: /^Vérifier aujourd’hui/ })
    expect(button).not.toHaveTextContent(/cr[ée]dit/i)
    expect(relaunch).not.toHaveBeenCalled()
    button.click()
    expect(relaunch).toHaveBeenCalledTimes(1)
  })

  it('la vérification reste proposée quand la mémoire est muette ou en panne', () => {
    state.current = { data: undefined, isPending: false, isError: true }
    render(<AccountMarketMemoryCard accountId={ACCOUNT_ID} companyName="ACME" />)
    expect(screen.getByRole('button', { name: /Vérifier aujourd’hui/ })).toBeInTheDocument()
  })
})

beforeEach(() => {
  state.current = { data: undefined, isPending: true, isError: false }
  state.enabled = undefined
})
afterEach(cleanup)

describe('la lecture part DÈS le montage — le dossier est déjà une page ouverte exprès', () => {
  it('appelle le hook activé, sans geste supplémentaire', () => {
    render(<AccountMarketMemoryCard accountId={ACCOUNT_ID} companyName="ACME" />)
    expect(state.enabled).toBe(true)
  })
})

describe('ce que la carte écrit selon l’état de la lecture', () => {
  function monter(data: QueryState) {
    state.current = data
    return render(<AccountMarketMemoryCard accountId={ACCOUNT_ID} companyName="ACME" />)
  }

  it('compte couvert : « Recours à des externes » et « Observé »', () => {
    monter({ data: { paths_observed: 12, esn_observed: 1 }, isPending: false, isError: false })
    expect(screen.getByText('Recours à des externes')).toBeInTheDocument()
    expect(screen.getByText('Observé')).toBeInTheDocument()
  })

  it('compte NON couvert (`null`) : « Non mesuré », jamais « 0 » ni une négation', () => {
    monter({ data: null, isPending: false, isError: false })
    expect(screen.getByText('Non mesuré')).toBeInTheDocument()
    const texte = document.body.textContent ?? ''
    expect(texte).not.toContain('Observé')
    expect(texte).not.toMatch(/\b0\b/)
    expect(texte).not.toMatch(/aucun/i)
  })

  it('mémoire en panne : elle le DIT — ni « Non mesuré », ni « Observé », ni le silence', () => {
    monter({ data: undefined, isPending: false, isError: true })
    expect(screen.getByText(/indisponible/i)).toBeInTheDocument()
    const texte = document.body.textContent ?? ''
    expect(texte).not.toContain('Non mesuré')
    expect(texte).not.toContain('Observé')
  })

  it('lecture en cours : ni verdict ni chiffre tant que la réponse n’est pas là', () => {
    monter({ data: undefined, isPending: true, isError: false })
    const texte = document.body.textContent ?? ''
    expect(texte).not.toContain('Observé')
    expect(texte).not.toContain('Non mesuré')
    expect(texte).not.toMatch(/indisponible/i)
  })

  it('aucune date, dans aucun état — la mémoire marché n’en expose pas', () => {
    monter({ data: { paths_observed: 12, esn_observed: 1 }, isPending: false, isError: false })
    const texte = document.body.textContent ?? ''
    expect(texte).not.toMatch(/\d{4}/)
  })
})

/**
 * #2127.3 / .5 / .6 — LA SYNTHÈSE EN TROIS LIGNES, PAS UNE.
 *
 * Le retour : la synthèse d'un compte lit le passé du marché en trois lignes de
 * contexte — le recours à des externes (déjà là), les familles d'expertise
 * observées, l'écosystème de sociétés de services observé. Jamais plus de trois :
 * au-delà, c'est un inventaire, et la mémoire marché n'en fait pas.
 */
describe('#2127.3 / .5 / .6 — trois lignes de contexte, au plus', () => {
  function monter(data: QueryState) {
    state.current = data
    return render(<AccountMarketMemoryCard accountId={ACCOUNT_ID} companyName="ACME" />)
  }

  const COUVERT: AccountMarketContext = {
    paths_observed: 40,
    esn_observed: 4,
    role_families: [
      { family: 'Autre', persons: 30 },
      { family: 'Data / IA', persons: 12 },
      { family: 'Chef de projet', persons: 8 },
      { family: 'Infra / Cloud', persons: 5 },
      { family: 'Développement', persons: 3 },
    ],
    esn_observed_detail: [
      { esnName: 'Delta Conseil', persons: 2, certainty: 'faible' },
      { esnName: 'Alpha Services', persons: 9, certainty: 'forte' },
      { esnName: 'Beta Ingénierie', persons: 4, certainty: 'moyenne' },
      { esnName: 'Gamma Tech', persons: 3, certainty: 'moyenne' },
    ],
  }

  it('#2127.5 — les familles d’expertise observées, les plus citées d’abord, sans le seau « Autre »', () => {
    monter({ data: COUVERT, isPending: false, isError: false })
    expect(screen.getByText('Familles d’expertise observées')).toBeInTheDocument()
    expect(screen.getByText('Data / IA · Chef de projet · Infra / Cloud')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Autre')
    expect(document.body.textContent).not.toContain('Développement')
  })

  it('#2127.6 — l’écosystème de sociétés de services observé, NOMMÉ, trois au plus', () => {
    monter({ data: COUVERT, isPending: false, isError: false })
    // « observées », jamais un libellé nu : des noms d'ESN sans ce mot se liraient
    // « en place aujourd'hui » (interdit n°3 de `market-memory.ts`).
    expect(screen.getByText('Sociétés de services observées')).toBeInTheDocument()
    // LAU-FINAL-211 (#3205.5) — la catégorie de saturation rejoint la MÊME
    // ligne (Alpha 9 + Beta 4 + Gamma 3 sur un total de 18 : les trois
    // premières concentrent 16/18 ≥ 60 % → « panel structuré »), jamais une
    // quatrième ligne ni un score.
    expect(screen.getByText('Alpha Services · Beta Ingénierie · Gamma Tech · Panel structuré')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Delta Conseil')
  })

  it('LAU-FINAL-211 (#3205.5) — un seul acteur observé se lit « acteur dominant », jamais un pourcentage', () => {
    monter({
      data: {
        paths_observed: 10,
        esn_observed: 1,
        esn_observed_detail: [{ esnName: 'Alpha Services', persons: 5, certainty: 'forte' }],
      },
      isPending: false,
      isError: false,
    })
    expect(screen.getByText('Alpha Services · Acteur dominant')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/%/)
  })

  it('LAU-FINAL-211 (#3205.5) — sans détail par société, la ligne reste « Couvert »/« À qualifier », sans catégorie ajoutée', () => {
    monter({ data: { paths_observed: 12, esn_observed: 2 }, isPending: false, isError: false })
    // `insufficient_information` ne s'affiche jamais : la ligne dit déjà
    // « Couvert », et l'écrire deux fois serait la même absence redite.
    expect(screen.getByText('Couvert')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Information insuffisante')
  })

  /**
   * #2117.83 — recette 23/09, prod 7e7105fb7 : sur ENEDIS (compte riche), la
   * valeur « Développement · Chef de projet » mesurait 67,9px de large dans
   * une colonne `min-w-0` pendant que le libellé voisin gardait `shrink-0` —
   * toute la place, sans jamais céder un pixel. jsdom ne mesure pas de vraies
   * largeurs, mais il lit les classes : cette assertion GARDE la cause du
   * correctif (grille à deux colonnes ÉGALES, aucun côté ne dicte plus sa
   * largeur à l’autre) plutôt que de re-router le même défaut visuel.
   */
  it('#2117.83 — libellé et valeur se partagent la ligne à parts ÉGALES (grille, aucun « shrink-0 »)', () => {
    monter({ data: COUVERT, isPending: false, isError: false })
    const rows = screen.getAllByTestId('market-memory-synthesis-line')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.className).toContain('grid-cols-2')
      expect(row.className).not.toContain('justify-between')
      const [labelEl, valueEl] = Array.from(row.children) as HTMLElement[]
      // Ni l'un ni l'autre ne peut plus imposer sa largeur naturelle à la
      // grille (`shrink-0` forçait le libellé à garder toute la place) —
      // chacun est borné `min-w-0`, dans sa colonne fixe de 50%.
      expect(labelEl?.className).not.toContain('shrink-0')
      expect(labelEl?.className).toContain('min-w-0')
      expect(valueEl?.className).toContain('min-w-0')
    }
  })

  it('#2127.3 — jamais plus de trois lignes, et une seule quand rien n’est mesuré', () => {
    monter({ data: COUVERT, isPending: false, isError: false })
    expect(screen.getAllByTestId('market-memory-synthesis-line')).toHaveLength(3)
    cleanup()
    monter({ data: null, isPending: false, isError: false })
    expect(screen.getAllByTestId('market-memory-synthesis-line')).toHaveLength(1)
  })

  it('couvert sans famille nommée ni société observée : « À qualifier », jamais « aucune » ni « 0 »', () => {
    monter({
      data: {
        paths_observed: 12,
        esn_observed: 0,
        role_families: [{ family: 'Autre', persons: 12 }],
        esn_observed_detail: [],
      },
      isPending: false,
      isError: false,
    })
    expect(screen.getAllByText('À qualifier')).toHaveLength(2)
    const texte = document.body.textContent ?? ''
    expect(texte).not.toMatch(/\b0\b/)
    expect(texte).not.toMatch(/aucun/i)
  })

  it('API antérieure aux champs détaillés : la famille se tait, l’écosystème retombe sur le comptage', () => {
    monter({ data: { paths_observed: 12, esn_observed: 2 }, isPending: false, isError: false })
    expect(screen.queryByText('Familles d’expertise observées')).not.toBeInTheDocument()
    expect(screen.getByText('Sociétés de services observées')).toBeInTheDocument()
    expect(screen.getByText('Couvert')).toBeInTheDocument()
  })
})

/**
 * #1640.2 — L'INDEX PAR COHORTE, À L'UNIQUE ENDROIT AUTORISÉ.
 *
 * Ce que cette suite tient :
 *
 *  · tant que le serveur n'envoie PAS le champ (l'état d'aujourd'hui, avec
 *    `MARKET_MEMORY_SCORING_ENABLED` à `false`), la carte est byte-identique à
 *    ce qu'elle écrivait avant le lot — « Recours externe observé » ou
 *    « Non mesuré », et RIEN d'autre ;
 *  · quand il l'envoie, le score n'est JAMAIS nu : ses axes sont nommés, ce
 *    qui n'a pas pu être évalué est nommé aussi, et la note est « /100 »,
 *    jamais un pourcentage — c'est `ScoreWithAxes` qui le garantit, et ce
 *    fichier la lui délègue plutôt que de le recoder ;
 *  · une exclusion porte sa RAISON, jamais un « indisponible » fourre-tout ;
 *  · aucun « % » et aucun mot de part de marché n'apparaît : un rang dans un
 *    échantillon de pairs n'est pas un fait de marché (GA-259).
 */
describe('#1640.2 — l’index par cohorte sur la carte du dossier', () => {
  function monter(data: QueryState) {
    state.current = data
    return render(<AccountMarketMemoryCard accountId={ACCOUNT_ID} companyName="ACME" />)
  }

  const CALCULABLE: AccountMarketContext['cohort_index'] = {
    kind: 'calculable',
    index: 62,
    evaluated: [
      { axis: 'cohortRelativePosition', value: 80 },
      { axis: 'cohortCoverage', value: 42 },
      { axis: 'ownObservations', value: 65 },
    ],
    notEvaluable: [],
    cohort: { bracket: '11-50', measuredPeers: 25 },
  }

  it('champ ABSENT (le drapeau est éteint) : la carte n’écrit rien de plus qu’avant', () => {
    // L'état de production aujourd'hui. Construire l'index et l'ALLUMER sont
    // deux décisions : tant que la seconde n'est pas prise, l'écran ne bouge pas.
    monter({ data: { paths_observed: 12, esn_observed: 1 }, isPending: false, isError: false })
    const texte = document.body.textContent ?? ''
    expect(texte).not.toContain('Index par cohorte')
    expect(texte).not.toContain('Cohorte')
    expect(screen.getByText('Observé')).toBeInTheDocument()
  })

  it('champ à `null` (entreprise non rapprochée du corpus) : rien non plus, surtout pas « 0 »', () => {
    monter({
      data: { paths_observed: 12, esn_observed: 1, cohort_index: null },
      isPending: false,
      isError: false,
    })
    const texte = document.body.textContent ?? ''
    expect(texte).not.toContain('Index par cohorte')
    expect(texte).not.toMatch(/\b0\b/)
  })

  it('index calculable : la note, ses TROIS axes nommés, et sa cohorte', () => {
    monter({
      data: { paths_observed: 12, esn_observed: 1, cohort_index: CALCULABLE },
      isPending: false,
      isError: false,
    })
    expect(screen.getByText('Index par cohorte')).toBeInTheDocument()
    // « 62/100 » et jamais « 62 % » : c'est `ScoreWithAxes` qui le tient.
    expect(screen.getByText('62/100')).toBeInTheDocument()
    expect(screen.getByText('Rang dans sa cohorte')).toBeInTheDocument()
    expect(screen.getByText('Pairs mesurés dans la cohorte')).toBeInTheDocument()
    expect(screen.getByText('Observations propres')).toBeInTheDocument()
    expect(screen.getByText(/Cohorte 11-50 · 25 pairs mesurés/)).toBeInTheDocument()
  })

  it('un axe NON évaluable est NOMMÉ, il ne disparaît pas et ne vaut pas zéro', () => {
    monter({
      data: {
        paths_observed: 12,
        esn_observed: 1,
        cohort_index: {
          ...CALCULABLE,
          evaluated: CALCULABLE!.kind === 'calculable' ? CALCULABLE.evaluated.slice(0, 2) : [],
          notEvaluable: ['ownObservations'],
        },
      },
      isPending: false,
      isError: false,
    })
    expect(screen.getByText(/Non évaluable : Observations propres/)).toBeInTheDocument()
    // Et il n'est PAS rendu comme une valeur de zéro.
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('exclusion : la RAISON s’écrit, jamais un « indisponible » fourre-tout', () => {
    monter({
      data: {
        paths_observed: 12,
        esn_observed: 1,
        cohort_index: { kind: 'excluded', reason: 'cohortTooSmall' },
      },
      isPending: false,
      isError: false,
    })
    expect(screen.getByText(/Trop peu d'entreprises de taille voisine mesurées/)).toBeInTheDocument()
    const texte = document.body.textContent ?? ''
    expect(texte).not.toContain('/100')
  })

  it('jamais un fait de marché : aucun « % », et la phrase de prudence est là', () => {
    // « 72 » ne dit pas « 72 % externalisent », et son complément ne dit pas
    // « 28 % n'externalisent pas » (doctrine c65, garde GA-259). Un commercial
    // peut répéter un chiffre en rendez-vous : la phrase n'est pas décorative.
    monter({
      data: { paths_observed: 12, esn_observed: 1, cohort_index: CALCULABLE },
      isPending: false,
      isError: false,
    })
    const texte = document.body.textContent ?? ''
    expect(texte).not.toContain('%')
    expect(texte).toMatch(/jamais une part de marché, jamais une probabilité/)
  })
})
