import type { AgendaEvent, BriefingAction } from '@bellum/contracts'
import { BRIEFING_ACTIONS_MAX, BRIEFING_ACTIONS_SHOWN } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OverflowPriorities } from './OverflowPriorities'

// #2938 — `ConflictDialog` (ouverte par la carte de conflit) lit
// `useAgendaStatus`/`useRescheduleEvent` (`useQuery`/`useMutation`) : même
// mock que `ActionsBlock.test.tsx`/`ConflictDialog.test.tsx`, pour garder ce
// fichier sur son invariant (la carte hors top ouvre le MÊME dialogue) sans
// exiger un vrai réseau.
vi.mock('@/features/briefing/hooks/useAccountLastOutcome', () => ({ useAccountLastOutcome: vi.fn(() => null) }))
vi.mock('@/features/agenda/api', () => ({
  useAgendaStatus: () => ({ data: undefined }),
  useRescheduleEvent: () => ({ mutate: vi.fn(), isPending: false }),
}))

// #3265.13 (épopée #3287) — `PriorityCard` lit `usePlanItems` (dernier
// résultat déclaré du compte), qui exige une session ; ce fichier n'en monte
// pas, même raison que le mock `useAgendaStatus` juste au-dessus.
vi.mock('@/features/actions/hooks/usePlanItems', () => ({
  usePlanItems: () => ({ items: [] }),
}))

/**
 * #2397.6 — les priorités hors du top restent visibles sur `/actions`.
 *
 * `ActionsBlock` (page « Aujourd'hui ») les replie déjà dans un dépli
 * inline — ce composant est le SEUL appelant qui les rend sur l'écran
 * Actions, littéralement demandé par le point. Jamais de notification :
 * ce composant ne pousse rien, il se contente d'être lu.
 *
 * `PriorityCard` (#2397.7) appelle désormais `useSetRoleFit` (`useQueryClient`)
 * inconditionnellement — en production `App.tsx` fournit le `QueryClientProvider`
 * racine, mais ce test le montait seul : un `QueryClientProvider` de test est
 * requis ici pour la même raison que dans `PriorityCard.test.tsx`.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

function action(id: string): BriefingAction {
  return {
    labelKey: 'briefing.actions.followUp',
    labelVars: { counterpart: 'jean@acme.com', days: 9, subject: 'Proposition' },
    href: null,
    kind: 'follow_up',
    priority: 4,
    fact: null,
    context: null,
    preparedArtifacts: [],
    expiresAt: null,
    businessObject: null,
    verdict: null,
    consequence: null,
    confidence: null,
    estimatedMinutes: null,
    rankingAxes: [],
    processingState: 'suggested',
    owner: null,
    permission: null,
    id,
  }
}

function mount(actions: BriefingAction[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <OverflowPriorities actions={actions} />
    </QueryClientProvider>,
  )
}

describe('OverflowPriorities — #2397.6', () => {
  it('ne rend rien quand tout tient déjà dans le top affiché sur Aujourd’hui', () => {
    const actions = Array.from({ length: BRIEFING_ACTIONS_SHOWN }, (_, i) => action(`a${i}`))
    const { container } = mount(actions)
    expect(container).toBeEmptyDOMElement()
  })

  it('montre les priorités qui débordent du top, avec leur rang réel', () => {
    const actions = Array.from({ length: BRIEFING_ACTIONS_SHOWN + 2 }, (_, i) => action(`a${i}`))
    mount(actions)
    // Le rang du premier débordement est `BRIEFING_ACTIONS_SHOWN + 1`, pas 1 :
    // une renumérotation ferait croire à une liste neuve plutôt qu'à la suite.
    expect(screen.getByText(String(BRIEFING_ACTIONS_SHOWN + 1))).toBeInTheDocument()
    expect(screen.getByText(String(BRIEFING_ACTIONS_SHOWN + 2))).toBeInTheDocument()
    expect(screen.queryByText(String(BRIEFING_ACTIONS_SHOWN))).not.toBeInTheDocument()
  })

  /**
   * #2107 (Centre d'actions, recette écran du 25/09/2026) — la liste reçue
   * ici vient désormais de `useAllBriefingActions` (jamais plafonnée à
   * `BRIEFING_ACTIONS_MAX`) : un genre au-delà du plafond du brief (mission
   * sans date, profil sans retour…) doit rester visible, pas seulement ceux
   * qui tenaient encore sous les sept places du brief.
   */
  it('montre AUSSI les priorités au-delà de BRIEFING_ACTIONS_MAX — plus seulement ce qui tenait sous le plafond du brief', () => {
    const actions = Array.from({ length: BRIEFING_ACTIONS_MAX + 3 }, (_, i) => action(`a${i}`))
    mount(actions)
    expect(screen.getByText(String(BRIEFING_ACTIONS_MAX + 1))).toBeInTheDocument()
    expect(screen.getByText(String(BRIEFING_ACTIONS_MAX + 2))).toBeInTheDocument()
    expect(screen.getByText(String(BRIEFING_ACTIONS_MAX + 3))).toBeInTheDocument()
  })
})

/**
 * #2938 — recette écran 27/09 : sur `/actions`, une carte conflit hors du top
 * 3 (donc rendue seulement ici) ouvrait un dialogue générique sans
 * « Prévenir » ni « Replanifier la suite » — en réalité, elle n'ouvrait RIEN
 * du tout : `OverflowPriorities` ne passait `onOpenConflict` à aucune carte.
 * `ActionsBlock` (page « Aujourd'hui ») ouvre déjà le VRAI `ConflictDialog`
 * (#2102.1) ; ce test échoue si `OverflowPriorities` perd son câblage vers ce
 * même dialogue.
 */
describe('OverflowPriorities — le conflit ouvre le vrai dialogue (#2938)', () => {
  function agendaEvent(partial: Partial<AgendaEvent> & Pick<AgendaEvent, 'id'>): AgendaEvent {
    return {
      summary: 'Point client',
      description: null,
      location: null,
      start: '2026-08-03T09:00:00.000Z',
      end: '2026-08-03T10:00:00.000Z',
      organizer: 'moi@bellum.fr',
      attendees: [],
      conferenceUrl: null,
      webUrl: null,
      status: 'confirmed',
      isExternal: true,
      cancelled: false,
      ...partial,
    }
  }

  const first = agendaEvent({
    id: 'e1',
    summary: 'Point Verdal',
    attendees: [
      { email: 'c.vasseur@verdal.example', displayName: 'Claire Vasseur', responseStatus: null, external: true },
    ],
  })
  const second = agendaEvent({
    id: 'e2',
    summary: 'Point Pharmatek',
    start: '2026-08-03T09:20:00.000Z',
    attendees: [
      { email: 'k.delorme@pharmatek.example', displayName: 'Karim Delorme', responseStatus: null, external: true },
    ],
  })
  const conflictAction: BriefingAction = {
    ...action('conflict:e1:e2'),
    kind: 'conflict',
    href: null,
    labelKey: 'briefing.actions.conflict',
    labelVars: { first: 'Point Verdal', second: 'Point Pharmatek', minutes: 10 },
  }

  function mountBeyondTop(conflicts: Parameters<typeof OverflowPriorities>[0]['conflicts']) {
    const shown = Array.from({ length: BRIEFING_ACTIONS_SHOWN }, (_, i) => action(`a${i}`))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    return render(
      <QueryClientProvider client={client}>
        <OverflowPriorities actions={[...shown, conflictAction]} conflicts={conflicts} />
      </QueryClientProvider>,
    )
  }

  it('sans les conflits en entrée, la carte reste un simple constat (aucune régression)', () => {
    mountBeyondTop([])
    expect(screen.queryByText('Voir les deux rendez-vous')).not.toBeInTheDocument()
  })

  it('un clic sur « Voir les deux rendez-vous » ouvre « Prévenir » et « Replanifier »', () => {
    mountBeyondTop([{ first, second, overlapMinutes: 10 }])
    fireEvent.click(screen.getByText('Voir les deux rendez-vous'))

    expect(screen.getByText('Point Verdal')).toBeInTheDocument()
    expect(screen.getByText('Point Pharmatek')).toBeInTheDocument()
    // #2102.13 — « replanifier la suite » : l'option de résolution existe
    // sur les deux cartes (dates non chevauchant `live`).
    expect(screen.getAllByText("Déplacer après l'autre rendez-vous").length).toBeGreaterThan(0)
    // #2102.12 — « prévenir » un invité : présent dès qu'un invité existe.
    expect(screen.getAllByText('Prévenir').length).toBeGreaterThan(0)
  })
})
