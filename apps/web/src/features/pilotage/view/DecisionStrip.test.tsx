import type { PilotageLevelReport } from '@bellum/contracts'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { capDecisionCards, DECISION_STRIP_MAX_CARDS, DecisionStrip, type DecisionCard } from './DecisionStrip'

let contribution: unknown = { lines: [], unattributedAccounts: 0 }
// #4197 (L6) — « besoins détectés » lit `pistes_to_review` de `GET /crm-counters` (#4193),
// le MÊME compteur que les Pistes : la carte et l'écran ne peuvent plus se contredire.
// `undefined` = pas de réponse ; `null` = compteur non mesuré.
let pistesToReview: number | null | undefined
vi.mock('@/features/crm-counters/useCrmCounters', () => ({
  useCrmCounters: () => ({
    data:
      pistesToReview === undefined
        ? undefined
        : { counters: { pistes_to_review: { value: pistesToReview, measured: pistesToReview !== null } } },
  }),
}))
// #3262.24-28 (+ #3277.5, lot E22 30/09) — la SECONDE requête de la bande
// (`reviewSignals`), routée par `path` : les six comptages sont `null` par
// défaut (non mesurés), comme `contribution` l'est déjà pour les tests qui ne
// les touchent pas.
let reviewSignals: unknown = {
  staleFocusCount: null,
  noGoToRevisitCount: null,
  accountsWithoutOwnerCount: null,
  accountsWithoutDateCount: null,
  strategyNoGoCount: null,
  strategyBlockedCount: null,
  accountsWithoutMovementCount: null,
}

vi.mock('@/lib/api', () => ({
  apiFetch: ({ path }: { path: string }) =>
    Promise.resolve(path === '/pilotage/review-signals' ? reviewSignals : contribution),
}))

// ⚠️ La signature est EXPLICITE : `vi.fn(() => true)` infère zéro argument, et
// l'appel `reveal(anchor)` ne rougit qu'au typecheck qui LIT les tests — pas au
// `tsc -p apps/web/tsconfig.json` lancé à la main. Même famille de piège que
// `check-types` de l'API, qui exclut ses specs.
const reveal = vi.fn<(anchor: string) => boolean>(() => true)
vi.mock('@/lib/reveal-target', () => ({
  revealTarget: (anchor: string) => reveal(anchor),
}))

/**
 * ⚠️ Le harnais de test monte une route attrape-tout : son `routesByPath` ne
 * contient NI `/projects/needs` NI `/integrations`. Sans ce doublon, le
 * garde-fou « une destination inconnue ne devient pas un lien mort » s'applique
 * — correctement — et les cartes se rendent sans porte, ce qui n'est pas le cas
 * de production. Le dernier test, lui, remet le garde-fou en marche.
 */
let reachable = true
vi.mock('../quality/lib/destinations', () => ({
  knownDestinations: () => new Set<string>(),
  isReachable: () => reachable,
}))

function level(overrides: Partial<PilotageLevelReport> = {}): PilotageLevelReport {
  return { level: 'acquisition', status: 'ok', metrics: [], ...overrides } as unknown as PilotageLevelReport
}

beforeEach(() => {
  contribution = { lines: [], unattributedAccounts: 0 }
  pistesToReview = undefined
  reviewSignals = {
    staleFocusCount: null,
    noGoToRevisitCount: null,
    accountsWithoutOwnerCount: null,
    accountsWithoutDateCount: null,
    strategyNoGoCount: null,
    strategyBlockedCount: null,
    accountsWithoutMovementCount: null,
  }
  reachable = true
  reveal.mockClear().mockReturnValue(true)
})

/**
 * #1322.1 — « Bellum te montre uniquement les endroits où une décision est
 * nécessaire ». L'entête le promettait ; la page ouvrait sur huit cartes de
 * mesure.
 */
describe('DecisionStrip', () => {
  // Théo D pilotage.R4/A4 — trois cartes d'abord, « Voir toutes les décisions · N » derrière.
  it('montre trois décisions et replie les autres derrière « Voir toutes les décisions »', async () => {
    pistesToReview = 4
    reviewSignals = { ...(reviewSignals as object), staleFocusCount: 2, accountsWithoutOwnerCount: 3 }
    renderWithRouter(<DecisionStrip levels={[level({ level: 'acquisition', status: 'alerte' })]} />)

    await screen.findByRole('button', { name: /1 maillon décroche/ })
    expect(screen.queryByText(/sans propriétaire|sans responsable/i)).not.toBeInTheDocument()
    const seeAll = await screen.findByRole('button', { name: /Voir toutes les décisions · 4/ })
    expect(seeAll).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(seeAll)
    expect(screen.getByRole('button', { name: /Replier/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('link').length + screen.getAllByRole('button').length).toBeGreaterThan(4)
  })

  it('compte les maillons qui décrochent, et mène à chacun À TOUR DE RÔLE', async () => {
    renderWithRouter(
      <DecisionStrip
        levels={[
          level({ level: 'acquisition', status: 'alerte' }),
          level({ level: 'conversion', status: 'alerte' }),
          level({ level: 'sourcing', status: 'ok' }),
        ]}
      />,
    )

    const card = await screen.findByRole('button', { name: /2 maillons décrochent/ })
    await userEvent.click(card)
    await userEvent.click(card)

    // Le pluriel est TENU : mener toujours au même maillon rendrait la carte
    // inutile dès le deuxième clic alors qu'elle en annonce deux.
    expect(reveal.mock.calls.map(call => call[0])).toEqual([
      'pilotage-maillon-acquisition',
      'pilotage-maillon-conversion',
    ])
  })

  it('ne rend RIEN quand rien n’attend — « 0 alerte » n’est pas une décision', async () => {
    renderWithRouter(<DecisionStrip levels={[level({ status: 'ok' })]} />)

    await waitFor(() => expect(screen.queryByText(/décroche/)).not.toBeInTheDocument())
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('mène aux besoins détectés, vers le panneau des pistes du Pipe (#4197, #4545)', async () => {
    pistesToReview = 28
    renderWithRouter(<DecisionStrip levels={[level({ status: 'ok' })]} />)

    const link = await screen.findByRole('link', { name: /28 pistes à revoir/ })
    expect(link).toHaveAttribute('href', '/projects?pistes=1') // #4545 — plus Signaux
  })

  it('#4197 — le nombre vient du compteur `pistes_to_review`, pas de la ligne de contribution', async () => {
    contribution = { lines: [{ key: 'needs_from_signal', count: 99, attribution: 'full' }], unattributedAccounts: 0 }
    pistesToReview = 4
    renderWithRouter(<DecisionStrip levels={[level({ status: 'ok' })]} />)

    expect(await screen.findByText(/4 pistes à revoir/)).toBeInTheDocument()
    expect(screen.queryByText(/99 besoins/)).not.toBeInTheDocument()
  })

  it('ne fabrique PAS une carte à partir d’un compte NON MESURÉ (#1322.5)', async () => {
    // `null` veut dire « on n'a pas lu », pas « il n'y en a pas ». En faire une
    // carte à zéro serait le mensonge que ce dépôt refuse partout ailleurs.
    pistesToReview = null
    renderWithRouter(<DecisionStrip levels={[level({ status: 'ok' })]} />)

    await waitFor(() => expect(screen.queryByText(/besoins? détecté/)).not.toBeInTheDocument())
  })

  it('distingue un maillon SANS MESURE d’un maillon qui décroche', async () => {
    // Ce n'est pas une alerte : c'est un trou de branchement, et il appelle un
    // autre geste — brancher, pas corriger.
    renderWithRouter(
      <DecisionStrip
        levels={[level({ level: 'economie', status: 'non_mesure' }), level({ level: 'acquisition', status: 'ok' })]}
      />,
    )

    const link = await screen.findByRole('link', { name: /1 maillon sans mesure/ })
    expect(link).toHaveAttribute('href', '/integrations')
    expect(screen.queryByText(/décroche/)).not.toBeInTheDocument()
  })

  it('ne fabrique JAMAIS un lien mort — la carte reste, la porte disparaît', async () => {
    // Le serveur peut être livré avant le web : une destination que CE
    // navigateur ne connaît pas ne doit pas devenir un `<a>` qui mène au vide.
    // L'information ne disparaît pas pour autant.
    reachable = false
    pistesToReview = 28
    renderWithRouter(<DecisionStrip levels={[level({ status: 'ok' })]} />)

    expect(await screen.findByText(/28 pistes à revoir/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /28 besoins/ })).not.toBeInTheDocument()
  })

  /**
   * #3262.24-28 (épopée #3262/#3284) — les cinq signaux de revue, chacun déjà
   * calculé ailleurs (`PilotageService.reviewSignals`).
   */
  it('mène aux comptes Focus trop anciens, vers le tableau d’effort', async () => {
    reviewSignals = {
      staleFocusCount: 3,
      noGoToRevisitCount: null,
      accountsWithoutOwnerCount: null,
      accountsWithoutDateCount: null,
      accountsWithoutMovementCount: null,
    }
    renderWithRouter(<DecisionStrip levels={[level({ status: 'ok' })]} />)

    const link = await screen.findByRole('link', { name: /3 comptes en Focus depuis plus de 30 jours/ })
    expect(link).toHaveAttribute('href', '/accounts?lens=effort')
  })

  it('#3407.5 — mène aux comptes en veille qui ont reçu un signal, vers le tableau d’effort', async () => {
    reviewSignals = {
      staleFocusCount: null,
      noGoToRevisitCount: null,
      accountsWithoutOwnerCount: null,
      accountsWithoutDateCount: null,
      watchToWakeCount: 2,
    }
    renderWithRouter(<DecisionStrip levels={[level({ status: 'ok' })]} />)

    const link = await screen.findByRole('link', { name: /2 comptes en veille ont reçu un signal/ })
    expect(link).toHaveAttribute('href', '/accounts?lens=effort')
  })

  it('#3407.5 — zéro ou non mesuré : aucune carte « veille »', async () => {
    reviewSignals = {
      staleFocusCount: null,
      noGoToRevisitCount: null,
      accountsWithoutOwnerCount: null,
      accountsWithoutDateCount: null,
      watchToWakeCount: 0,
    }
    renderWithRouter(<DecisionStrip levels={[level({ status: 'ok' })]} />)
    await waitFor(() => expect(screen.queryByText(/en veille ont reçu/)).not.toBeInTheDocument())
  })

  it('mène aux comptes écartés à revisiter, vers le portefeuille filtré', async () => {
    reviewSignals = {
      staleFocusCount: null,
      noGoToRevisitCount: 1,
      accountsWithoutOwnerCount: null,
      accountsWithoutDateCount: null,
      accountsWithoutMovementCount: null,
    }
    renderWithRouter(<DecisionStrip levels={[level({ status: 'ok' })]} />)

    const link = await screen.findByRole('link', { name: /1 compte écarté à revisiter/ })
    expect(link).toHaveAttribute('href', '/accounts?gate=parked')
  })

  it('compte les comptes sans propriétaire et sans prochaine revue', async () => {
    reviewSignals = {
      staleFocusCount: null,
      noGoToRevisitCount: null,
      accountsWithoutOwnerCount: 5,
      accountsWithoutDateCount: 2,
      accountsWithoutMovementCount: null,
    }
    renderWithRouter(<DecisionStrip levels={[level({ status: 'ok' })]} />)

    expect(await screen.findByText(/5 comptes sans propriétaire/)).toBeInTheDocument()
    expect(await screen.findByText(/2 comptes sans prochaine revue/)).toBeInTheDocument()
  })

  /**
   * #3262.24 (épopée #3284, ce lot) — comptes actifs (file exécution :
   * extension/volume) sans mouvement récent, vers le tableau d'effort — même
   * destination que `staleFocus`, la file arbitrage ne se recoupe jamais avec
   * la file exécution (P6, `laneOverlap`).
   */
  it('mène aux comptes actifs sans mouvement, vers le tableau d’effort', async () => {
    reviewSignals = {
      staleFocusCount: null,
      noGoToRevisitCount: null,
      accountsWithoutOwnerCount: null,
      accountsWithoutDateCount: null,
      accountsWithoutMovementCount: 4,
    }
    renderWithRouter(<DecisionStrip levels={[level({ status: 'ok' })]} />)

    const link = await screen.findByRole('link', {
      name: /4 comptes actifs sans mouvement depuis plus de 30 jours/,
    })
    expect(link).toHaveAttribute('href', '/accounts?lens=effort')
  })

  it('un signal de revue NON MESURÉ (`null`) ne fabrique jamais de carte à zéro', async () => {
    reviewSignals = {
      staleFocusCount: null,
      noGoToRevisitCount: 0,
      accountsWithoutOwnerCount: null,
      accountsWithoutDateCount: null,
      accountsWithoutMovementCount: null,
    }
    renderWithRouter(<DecisionStrip levels={[level({ status: 'ok' })]} />)

    await waitFor(() => expect(screen.queryByText(/Focus/)).not.toBeInTheDocument())
    // `noGoToRevisitCount: 0` est un ZÉRO MESURÉ (aucun compte écarté à revisiter) :
    // c'est une bonne nouvelle, elle ne pousse pas de carte non plus.
    expect(screen.queryByText(/écarté/)).not.toBeInTheDocument()
  })

  /**
   * #3277.5 (épopée #3277, lot E22 30/09) — readiness AccountStrategy5P,
   * même route (`reviewSignals`), jamais un second appel.
   */
  it('compte les comptes NO_GO/BLOCKED sur leur stratégie', async () => {
    reviewSignals = {
      staleFocusCount: null,
      noGoToRevisitCount: null,
      accountsWithoutOwnerCount: null,
      accountsWithoutDateCount: null,
      strategyNoGoCount: 4,
      strategyBlockedCount: 7,
    }
    renderWithRouter(<DecisionStrip levels={[level({ status: 'ok' })]} />)

    expect(await screen.findByText(/4 comptes NO-GO sur leur stratégie/)).toBeInTheDocument()
    expect(await screen.findByText(/7 comptes bloqués sur leur stratégie/)).toBeInTheDocument()
  })

  it('une readiness NON MESURÉE (`null`) ne fabrique jamais de carte à zéro', async () => {
    reviewSignals = {
      staleFocusCount: null,
      noGoToRevisitCount: null,
      accountsWithoutOwnerCount: null,
      accountsWithoutDateCount: null,
      strategyNoGoCount: null,
      strategyBlockedCount: 0,
    }
    renderWithRouter(<DecisionStrip levels={[level({ status: 'ok' })]} />)

    await waitFor(() => expect(screen.queryByText(/stratégie/)).not.toBeInTheDocument())
  })
})

/**
 * #2206.6 — « cinq décisions maximum affichées ». Les trois sources
 * aujourd'hui (`alerts`, `needs`, `unmeasured`) ne produisent jamais plus de
 * trois cartes — la borne ne se voit donc pas sur les données réelles. Elle se
 * teste directement sur `capDecisionCards`, qui NE dépend d'aucune des trois
 * sources : la fonction qui pose la borne, indépendamment de ce qui la
 * remplit aujourd'hui.
 */
describe('capDecisionCards (#2206.6)', () => {
  function card(key: string): DecisionCard {
    return { key, label: key, hint: key, tone: 'neutral' }
  }

  it('la borne vaut cinq', () => {
    expect(DECISION_STRIP_MAX_CARDS).toBe(5)
  })

  it('coupe au-delà de cinq cartes', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(card)
    expect(capDecisionCards(many)).toEqual(many.slice(0, 5))
    expect(capDecisionCards(many)).toHaveLength(5)
  })

  it('ne touche pas une liste déjà sous la borne', () => {
    const few = ['a', 'b'].map(card)
    expect(capDecisionCards(few)).toEqual(few)
  })

  // Recette 30/09 : la carte « sans mouvement » était la 7e de la liste, donc
  // rognée par le plafond de 5 dès que les cartes d'hygiène (sans responsable,
  // sans date) étaient présentes. Un compte actif qui ne bouge plus est une
  // décision ; un champ vide est de l'hygiène : la décision passe d'abord.
  it('la carte « sans mouvement » survit au plafond de cinq quand toutes les autres cartes de revue sont là', async () => {
    reviewSignals = {
      staleFocusCount: 2,
      noGoToRevisitCount: 2,
      accountsWithoutOwnerCount: 2,
      accountsWithoutDateCount: 2,
      strategyNoGoCount: 2,
      strategyBlockedCount: 2,
      accountsWithoutMovementCount: 1,
    }
    renderWithRouter(<DecisionStrip levels={[level({ status: 'ok' })]} />)
    expect(await screen.findByRole('link', { name: /1 compte actif sans mouvement/ })).toBeInTheDocument()
  })
})
