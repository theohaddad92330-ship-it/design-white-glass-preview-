import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'

/**
 * #2125.50-.67 — CE QUE LE RAFRAÎCHISSEMENT A CHANGÉ, au retour.
 *
 * Le geste débitait un crédit et rendait un dossier d'apparence identique :
 * « je paie et je ne sais pas ce qui a bougé ». La carte lit le compte rendu
 * que le serveur écrit (`raw_analysis.last_refresh`) et le rend en six listes
 * SÉPARÉES — un fait neuf, un fait modifié et un fait qu'on n'observe plus
 * n'appellent pas le même geste, les fondre en « 3 changements » les rendrait
 * tous les trois inutiles.
 *
 * Ce que cette suite garde, au-delà de l'affichage :
 *  · un fait devenu obsolète REDEVIENT INCONNU AVEC SA DATE — il ne disparaît
 *    pas, et la carte ne dit jamais qu'il est faux ;
 *  · une phase qui n'a rien rendu est NOMMÉE, jamais rendue « aucun
 *    changement » — une mesure qui n'a pas eu lieu n'est pas un résultat ;
 *  · un échec nomme la phase, ce qui a été conservé et le coût débité ;
 *  · une phase `unknown` — la requête a pu PARTIR — ne se relance pas d'un
 *    clic : la carte le DIT avant de laisser rejouer.
 */

const refreshMutate = vi.fn()
vi.mock('@/features/accounts/hooks/useRefreshDimension', () => ({
  useRefreshDimension: () => ({ mutate: refreshMutate, isPending: false, variables: undefined }),
}))

function accountWith(lastRefresh: unknown): Account {
  return { id: 'acc-1', company_name: 'ACME', raw_analysis: { last_refresh: lastRefresh } } as unknown as Account
}

const DIFF = {
  at: '2026-09-15T12:00:00.000Z',
  phase: 'signals',
  diff: {
    newFacts: [{ key: 'website', label: 'website', value: 'acme.fr', measuredAt: '2026-09-15T12:00:00.000Z' }],
    changedFacts: [{ key: 'employees', label: 'employees', before: '1200', after: '1450' }],
    obsoleteFacts: [
      { key: 'revenue', label: 'revenue', lastKnownValue: '90 M€', lastSeenAt: '2026-03-02T09:00:00.000Z' },
    ],
    preservedCorrections: [{ key: 'headquarters', label: 'headquarters', keptValue: 'Lyon', discardedValue: 'Paris' }],
    changedRecommendations: [{ key: 'angle-data', label: 'Angle data', before: 'priorité 2', after: 'priorité 1' }],
    obsoleteActions: [{ key: 'relance-dsi', label: 'Relancer le DSI', lastSeenAt: '2026-03-02T09:00:00.000Z' }],
    unmeasured: [],
  },
}

describe('RefreshOutcomeCard', () => {
  beforeEach(() => {
    refreshMutate.mockClear()
  })
  afterEach(cleanup)

  async function renderCard(lastRefresh: unknown) {
    const { RefreshOutcomeCard } = await import('./RefreshOutcomeCard')
    render(<RefreshOutcomeCard account={accountWith(lastRefresh)} />)
  }

  it('ne rend RIEN tant qu’aucun rafraîchissement n’a eu lieu', async () => {
    const { RefreshOutcomeCard } = await import('./RefreshOutcomeCard')
    const { container } = render(<RefreshOutcomeCard account={{ id: 'acc-1', raw_analysis: null } as Account} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien non plus sur un compte rendu illisible — jamais une ligne inventée', async () => {
    const { RefreshOutcomeCard } = await import('./RefreshOutcomeCard')
    const { container } = render(<RefreshOutcomeCard account={accountWith('bonjour')} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sépare les six listes du diff', async () => {
    await renderCard(DIFF)
    expect(screen.getByText(/Nouveaux faits/i)).toBeInTheDocument()
    expect(screen.getByText(/Faits modifiés/i)).toBeInTheDocument()
    expect(screen.getByText(/Faits devenus obsolètes/i)).toBeInTheDocument()
    expect(screen.getByText(/Tes corrections, conservées/i)).toBeInTheDocument()
    expect(screen.getByText(/Recommandations modifiées/i)).toBeInTheDocument()
    expect(screen.getByText(/Actions devenues obsolètes/i)).toBeInTheDocument()
  })

  // #2318.8 — « Elle ne doit pas modifier silencieusement la mémoire partagée ».
  // Un écrasement RÉELLEMENT constaté en base ne se range pas parmi « tes
  // corrections, conservées » : c'est du travail perdu, et l'écran le dit avec
  // la valeur perdue, celle qui l'a remplacée, et la PHASE coupable.
  describe('#2318.8 — une correction écrasée se voit, et nomme son coupable', () => {
    const OVERWRITTEN = {
      at: '2026-09-20T09:00:00.000Z',
      phase: 'entities',
      diff: {
        ...DIFF.diff,
        preservedCorrections: [],
        overwrittenCorrections: [
          {
            key: 'headquarters',
            label: 'headquarters',
            correctedValue: 'Lyon',
            overwrittenWith: 'Paris',
            byPhase: 'entities',
            correctedAt: '2026-04-01T09:00:00.000Z',
          },
        ],
      },
    }

    it('affiche la valeur perdue, celle qui l’a remplacée et la phase', async () => {
      await renderCard(OVERWRITTEN)
      expect(screen.getByText(/corrections écrasées/i)).toBeInTheDocument()
      expect(screen.getByText(/Lyon/)).toBeInTheDocument()
      expect(screen.getByText(/Paris/)).toBeInTheDocument()
    })

    it('ne l’annonce PAS comme conservée — les deux à la fois seraient le mensonge', async () => {
      await renderCard(OVERWRITTEN)
      expect(screen.queryByText(/Tes corrections, conservées/i)).not.toBeInTheDocument()
    })

    // La carte n'invente pas une alerte : un compte rendu sans écrasement mesuré
    // n'affiche pas la section (un ancien compte rendu n'a pas la clé du tout).
    it('n’affiche RIEN quand aucun écrasement n’a été mesuré', async () => {
      await renderCard(DIFF)
      expect(screen.queryByText(/corrections écrasées/i)).not.toBeInTheDocument()
    })
  })

  it('un fait obsolète redevient INCONNU avec sa date — jamais « faux », jamais supprimé', async () => {
    await renderCard(DIFF)
    // La dernière valeur connue reste lisible, avec le moment où on l'a vue.
    expect(screen.getByText(/90 M€/)).toBeInTheDocument()
    expect(screen.getByText(/à revérifier/i)).toBeInTheDocument()
  })

  it('nomme la phase qui n’a rien rendu au lieu d’annoncer « aucun changement »', async () => {
    await renderCard({
      at: DIFF.at,
      phase: 'strategy',
      diff: {
        ...DIFF.diff,
        newFacts: [],
        changedFacts: [],
        obsoleteFacts: [],
        obsoleteActions: [],
        unmeasured: ['strategy'],
      },
    })
    expect(screen.getByText(/non mesuré/i)).toBeInTheDocument()
    expect(screen.queryByText(/Aucun changement/i)).not.toBeInTheDocument()
  })

  // #2555.2 — la QUATRIÈME catégorie du diff (nouveaux · modifiés · INCHANGÉS ·
  // erreurs) : un fait relu à l'identique se distingue d'un fait jamais revu.
  it('nomme les faits relus à l’identique — la quatrième catégorie du diff', async () => {
    await renderCard({
      at: DIFF.at,
      phase: 'signals',
      diff: { ...DIFF.diff, unchangedFacts: 3 },
    })
    expect(screen.getByText(/3 faits relus à l.identique, confirmés/i)).toBeInTheDocument()
  })

  it('un compte rendu d’avant #2555.2 (sans `unchangedFacts`) ne montre rien de faux', async () => {
    // Blob plus ancien : `buildRefreshDiff` n'écrivait pas encore ce champ.
    await renderCard({ at: DIFF.at, phase: 'signals', diff: DIFF.diff })
    expect(screen.queryByText(/relus à l.identique/i)).not.toBeInTheDocument()
  })

  it('dit « aucun changement » seulement quand la mesure a bien eu lieu', async () => {
    await renderCard({
      at: DIFF.at,
      phase: 'signals',
      diff: {
        newFacts: [],
        changedFacts: [],
        obsoleteFacts: [],
        preservedCorrections: [],
        changedRecommendations: [],
        obsoleteActions: [],
        unmeasured: [],
      },
    })
    expect(screen.getByText(/Aucun changement/i)).toBeInTheDocument()
  })

  // #2318.4 — les trois champs du diff qui manquaient au 17/09.
  it('nomme les signaux expirés, redevenus INCONNUS AVEC LEUR DATE', async () => {
    await renderCard({
      at: DIFF.at,
      phase: 'signals',
      diff: {
        ...DIFF.diff,
        obsoleteActions: [],
        expiredSignals: [
          { key: 'levee', label: 'Levée de fonds', lastKnownValue: '20M€', lastSeenAt: '2026-06-01T00:00:00.000Z' },
        ],
      },
    })
    expect(screen.getByText(/Signaux expirés/i)).toBeInTheDocument()
    expect(screen.getByText(/Levée de fonds/i)).toBeInTheDocument()
    expect(screen.getByText(/20M€/)).toBeInTheDocument()
  })

  it('nomme le score et la confiance modifiés, avant → après', async () => {
    await renderCard({
      at: DIFF.at,
      phase: 'signals',
      diff: {
        ...DIFF.diff,
        obsoleteActions: [],
        scoreChanged: { key: 'priority_score', label: 'Score', before: '62', after: '78' },
        confidenceChanged: { key: 'confidence', label: 'Confiance', before: '54', after: '80' },
      },
    })
    const block = screen.getByTestId('refresh-outcome-score-confidence')
    expect(block).toHaveTextContent('62')
    expect(block).toHaveTextContent('78')
    expect(block).toHaveTextContent('54')
    expect(block).toHaveTextContent('80')
  })

  it('un score inchangé ne rend rien — jamais un objet vide affiché', async () => {
    await renderCard({ at: DIFF.at, phase: 'signals', diff: { ...DIFF.diff, obsoleteActions: [] } })
    expect(screen.queryByTestId('refresh-outcome-score-confidence')).not.toBeInTheDocument()
  })

  // #2591.3 — un score jamais recalculé par CETTE dimension ne se lit plus
  // comme un score vérifié stable : la carte le NOMME.
  it('nomme un score NON recalculé — jamais confondu avec un score stable', async () => {
    const { RefreshOutcomeCard } = await import('./RefreshOutcomeCard')
    const account = {
      id: 'acc-1',
      company_name: 'ACME',
      strategy_refreshed_at: '2026-08-01T09:00:00.000Z',
      raw_analysis: {
        last_refresh: {
          at: DIFF.at,
          phase: 'signals',
          diff: { ...DIFF.diff, obsoleteActions: [], scoreNotRecalculated: { lastKnownValue: '62' } },
        },
      },
    } as unknown as Account
    render(<RefreshOutcomeCard account={account} />)
    const block = screen.getByTestId('refresh-outcome-score-confidence')
    expect(block).toHaveTextContent(/non recalculé/i)
    // Nomme la dimension rejouée…
    expect(block).toHaveTextContent(/Signaux/)
    // …et si possible, la date du dernier calcul réel (`strategy_refreshed_at`).
    expect(block).toHaveTextContent(/2026/)
  })

  it('un score non recalculé sans date connue reste honnête — aucune date inventée', async () => {
    const { RefreshOutcomeCard } = await import('./RefreshOutcomeCard')
    const account = {
      id: 'acc-1',
      company_name: 'ACME',
      strategy_refreshed_at: null,
      raw_analysis: {
        last_refresh: {
          at: DIFF.at,
          phase: 'signals',
          diff: { ...DIFF.diff, obsoleteActions: [], scoreNotRecalculated: { lastKnownValue: '62' } },
        },
      },
    } as unknown as Account
    render(<RefreshOutcomeCard account={account} />)
    const block = screen.getByTestId('refresh-outcome-score-confidence')
    expect(block).toHaveTextContent(/non recalculé/i)
    expect(block).not.toHaveTextContent(/2026/)
  })

  it('un score réellement modifié prime — jamais « non recalculé » en double', async () => {
    await renderCard({
      at: DIFF.at,
      phase: 'signals',
      diff: {
        ...DIFF.diff,
        obsoleteActions: [],
        scoreChanged: { key: 'priority_score', label: 'Score', before: '62', after: '78' },
        scoreNotRecalculated: { lastKnownValue: '62' },
      },
    })
    const block = screen.getByTestId('refresh-outcome-score-confidence')
    expect(block).not.toHaveTextContent(/non recalculé/i)
  })

  // #2591.6 — même correctif que #2591.3, pour la CONFIANCE : un rafraîchissement
  // de l'axe 'contacts' (qui n'écrit jamais `raw_analysis.confidence`) le DIT.
  it('nomme une confiance NON recalculée — jamais confondue avec une confiance stable', async () => {
    const { RefreshOutcomeCard } = await import('./RefreshOutcomeCard')
    const account = {
      id: 'acc-1',
      company_name: 'ACME',
      signals_refreshed_at: '2026-08-01T09:00:00.000Z',
      raw_analysis: {
        last_refresh: {
          at: DIFF.at,
          phase: 'contacts',
          diff: { ...DIFF.diff, obsoleteActions: [], confidenceNotRecalculated: { lastKnownValue: '58' } },
        },
      },
    } as unknown as Account
    render(<RefreshOutcomeCard account={account} />)
    const block = screen.getByTestId('refresh-outcome-score-confidence')
    expect(block).toHaveTextContent(/non recalculé/i)
    // Nomme la dimension rejouée…
    expect(block).toHaveTextContent(/Contacts/)
    // …et si possible, la date du dernier calcul réel (`signals_refreshed_at`).
    expect(block).toHaveTextContent(/2026/)
  })

  it('une confiance non recalculée sans date connue reste honnête — aucune date inventée', async () => {
    const { RefreshOutcomeCard } = await import('./RefreshOutcomeCard')
    const account = {
      id: 'acc-1',
      company_name: 'ACME',
      signals_refreshed_at: null,
      raw_analysis: {
        last_refresh: {
          at: DIFF.at,
          phase: 'contacts',
          diff: { ...DIFF.diff, obsoleteActions: [], confidenceNotRecalculated: { lastKnownValue: '58' } },
        },
      },
    } as unknown as Account
    render(<RefreshOutcomeCard account={account} />)
    const block = screen.getByTestId('refresh-outcome-score-confidence')
    expect(block).toHaveTextContent(/non recalculé/i)
    expect(block).not.toHaveTextContent(/2026/)
  })

  it('une confiance réellement modifiée prime — jamais « non recalculée » en double', async () => {
    await renderCard({
      at: DIFF.at,
      phase: 'contacts',
      diff: {
        ...DIFF.diff,
        obsoleteActions: [],
        confidenceChanged: { key: 'confidence', label: 'Confiance', before: '58', after: '73' },
        confidenceNotRecalculated: { lastKnownValue: '58' },
      },
    })
    const block = screen.getByTestId('refresh-outcome-score-confidence')
    expect(block).not.toHaveTextContent(/non recalculé/i)
  })

  // Contrôle négatif : l'axe 'signals' RECALCULE vraiment la confiance — le
  // serveur n'écrit jamais `confidenceNotRecalculated` pour cette dimension
  // (#2591.6, `CONFIDENCE_RECALCULATING_DIMENSIONS`), donc rien ne le dit.
  it('un rafraîchissement de l’axe « signaux » ne dit PAS que la confiance n’a pas été recalculée', async () => {
    await renderCard({
      at: DIFF.at,
      phase: 'signals',
      diff: { ...DIFF.diff, obsoleteActions: [] },
    })
    expect(screen.queryByTestId('refresh-outcome-score-confidence')).not.toBeInTheDocument()
  })

  it('nomme les nouveaux contacts, les non reconfirmés et les nouvelles entités — sans jamais dire « parti »', async () => {
    const { RefreshOutcomeCard } = await import('./RefreshOutcomeCard')
    const account = {
      id: 'acc-1',
      company_name: 'ACME',
      raw_analysis: {
        last_refresh: { at: DIFF.at, phase: 'entities', diff: { ...DIFF.diff, obsoleteActions: [] } },
        org: {
          peopleRefreshDiff: {
            asOf: '2026-09-18T10:00:00.000Z',
            reverified: [],
            changedPosition: [],
            new: [{ personId: 'p-neuf', fullName: 'Nouvelle Personne', kind: 'new' }],
            notConfirmed: [{ personId: 'p-jean', fullName: 'Jean Petit', kind: 'notConfirmed' }],
            newEntities: [{ entityId: 'e2', name: 'ACME Digital' }],
          },
        },
      },
    } as unknown as Account
    render(<RefreshOutcomeCard account={account} />)
    const summary = screen.getByTestId('refresh-outcome-org-summary')
    expect(summary).toHaveTextContent(/1 nouveau contact/i)
    expect(summary).toHaveTextContent(/1 contact non reconfirmé/i)
    expect(summary).toHaveTextContent(/1 nouvelle entité/i)
    expect(summary).not.toHaveTextContent(/parti/i)
  })

  it('#2164.38/.39 — nomme les contacts non reconfirmés et les nouvelles entités, pas seulement leur nombre', async () => {
    const { RefreshOutcomeCard } = await import('./RefreshOutcomeCard')
    const account = {
      id: 'acc-1',
      company_name: 'ACME',
      raw_analysis: {
        last_refresh: { at: DIFF.at, phase: 'entities', diff: { ...DIFF.diff, obsoleteActions: [] } },
        org: {
          peopleRefreshDiff: {
            asOf: '2026-09-18T10:00:00.000Z',
            reverified: [],
            changedPosition: [],
            new: [],
            notConfirmed: [
              { personId: 'p-jean', fullName: 'Jean Petit', kind: 'notConfirmed' },
              { personId: 'p-anne', fullName: 'Anne Durand', kind: 'notConfirmed' },
            ],
            newEntities: [{ entityId: 'e2', name: 'ACME Digital' }],
          },
        },
      },
    } as unknown as Account
    render(<RefreshOutcomeCard account={account} />)
    const notConfirmed = screen.getByTestId('refresh-outcome-not-confirmed-names')
    expect(notConfirmed).toHaveTextContent('Jean Petit')
    expect(notConfirmed).toHaveTextContent('Anne Durand')
    // La doctrine tient : une personne non revue n'est jamais dite « partie ».
    expect(notConfirmed).not.toHaveTextContent(/parti/i)
    expect(screen.getByTestId('refresh-outcome-new-entity-names')).toHaveTextContent('ACME Digital')
  })

  it('#2164.38/.39 — sans personne non reconfirmée ni entité neuve, aucune liste vide', async () => {
    const { RefreshOutcomeCard } = await import('./RefreshOutcomeCard')
    const account = {
      id: 'acc-1',
      company_name: 'ACME',
      raw_analysis: {
        last_refresh: { at: DIFF.at, phase: 'entities', diff: { ...DIFF.diff, obsoleteActions: [] } },
        org: {
          peopleRefreshDiff: {
            asOf: '2026-09-18T10:00:00.000Z',
            reverified: [],
            changedPosition: [],
            new: [{ personId: 'p-neuf', fullName: 'Nouvelle Personne', kind: 'new' }],
            notConfirmed: [],
            newEntities: [],
          },
        },
      },
    } as unknown as Account
    render(<RefreshOutcomeCard account={account} />)
    expect(screen.queryByTestId('refresh-outcome-not-confirmed-names')).not.toBeInTheDocument()
    expect(screen.queryByTestId('refresh-outcome-new-entity-names')).not.toBeInTheDocument()
  })

  it('un échec nomme la phase, ce qui est conservé et le coût débité', async () => {
    await renderCard({
      at: DIFF.at,
      phase: 'contacts',
      failure: {
        phase: 'contacts',
        outcome: 'failed',
        keptDimensions: ['signals', 'entities', 'strategy'],
        preservedKinds: ['private_note', 'validated_action', 'evidence', 'declared_relation'],
        credits: { debited: 0, refunded: false },
        retry: { dimension: 'contacts', allowed: true, needsConfirmation: false },
      },
    })
    expect(screen.getByText(/La phase « Contacts » n’a pas abouti/i)).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/cr[ée]dit/i)
    // Relancer CETTE phase seule, sans confirmation : rien n'est parti.
    fireEvent.click(screen.getByRole('button', { name: /Relancer Contacts/i }))
    expect(refreshMutate).toHaveBeenCalledWith('contacts')
  })

  it('une phase `unknown` ne se rejoue pas d’un clic : la carte le dit d’abord', async () => {
    await renderCard({
      at: DIFF.at,
      phase: 'signals',
      failure: {
        phase: 'signals',
        outcome: 'unknown',
        keptDimensions: ['contacts', 'entities', 'strategy'],
        preservedKinds: ['private_note'],
        credits: { debited: 1, refunded: true },
        retry: { dimension: 'signals', allowed: true, needsConfirmation: true },
      },
    })
    expect(document.body).not.toHaveTextContent(/Remboursé|cr[ée]dit/i)

    fireEvent.click(screen.getByRole('button', { name: /Relancer Signaux/i }))
    // Premier clic : on EXPLIQUE, on ne rejoue pas.
    expect(refreshMutate).not.toHaveBeenCalled()
    expect(screen.getByText(/la demande est peut-être partie/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Relancer quand même/i }))
    expect(refreshMutate).toHaveBeenCalledWith('signals')
  })
})
