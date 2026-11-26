import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FocusPlan } from '@bellum/contracts'
import { FocusPlanCard } from './FocusPlanCard'

/** Même piège documenté dans `CopyQuestion.test.tsx` : le type est DÉCLARÉ, il ne se devine pas. */
function clipboardSpy(impl?: (text: string) => Promise<void>) {
  const writeText = vi.fn<(text: string) => Promise<void>>(impl ?? (() => Promise.resolve()))
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

// #2391 (LAU-FINAL-105) — la carte du plan de journée : elle LIT `plan`
// (compilé par `chat_tools.py::propose_focus_plan`) et ne recompose rien.
//
// #2770.49/.50/.51 — chaque bloc RÉELLEMENT placé porte un geste explicite,
// « Ajouter à mon agenda », qui écrit CE bloc précis.

const confirmMutate = vi.fn()
const cancelMutate = vi.fn()
const setOutcomeMutate = vi.fn()
const useConfirmFocusPlanBlockMock = vi.fn(() => ({ mutate: confirmMutate, isPending: false }))
const useCancelFocusPlanBlockMock = vi.fn(() => ({ mutate: cancelMutate, isPending: false }))
const useSetFocusPlanBlockOutcomeMock = vi.fn(() => ({ mutate: setOutcomeMutate, isPending: false }))
const useIsDemoMock = vi.fn(() => false)

vi.mock('@/features/briefing/api', () => ({
  useConfirmFocusPlanBlock: () => useConfirmFocusPlanBlockMock(),
  useCancelFocusPlanBlock: () => useCancelFocusPlanBlockMock(),
  useSetFocusPlanBlockOutcome: () => useSetFocusPlanBlockOutcomeMock(),
}))
vi.mock('@/features/demo/useIsDemo', () => ({
  useIsDemo: () => useIsDemoMock(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function plan(overrides: Partial<FocusPlan> = {}): FocusPlan {
  return {
    date: '2026-10-01',
    time_zone: 'Europe/Paris',
    energy: null,
    blocks: [],
    deferred_blocks: [],
    margin_minutes: 0,
    ...overrides,
  }
}

describe('FocusPlanCard', () => {
  beforeEach(async () => {
    confirmMutate.mockClear().mockReset()
    cancelMutate.mockClear().mockReset()
    setOutcomeMutate.mockClear().mockReset()
    useIsDemoMock.mockReturnValue(false)
    const { toast } = await import('sonner')
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
  })

  it('affiche le titre daté et la garantie — rien n’est créé', () => {
    render(<FocusPlanCard plan={plan()} />)
    expect(screen.getByTestId('focus-plan-card')).toBeInTheDocument()
    expect(screen.getByText(/Rien n'est créé dans ton agenda/)).toBeInTheDocument()
  })

  it('dit qu’aucun bloc n’a pu être placé quand la liste est vide', () => {
    render(<FocusPlanCard plan={plan()} />)
    expect(screen.getByText(/Aucun bloc n'a pu être placé/)).toBeInTheDocument()
  })

  it('#2391.3-.13 — affiche le TYPE de bloc, le titre, l’horaire et la raison de priorité', () => {
    render(
      <FocusPlanCard
        plan={plan({
          blocks: [
            {
              type: 'call_session',
              title: 'Appels prospection',
              duration_minutes: 30,
              start_iso: '2026-10-01T09:00:00+02:00',
              end_iso: '2026-10-01T09:30:00+02:00',
              priority_reason: 'Trois comptes chauds à relancer avant vendredi',
              priority: 'high',
              deadline: null,
              context: null,
              collision: null,
            },
          ],
        })}
      />,
    )
    expect(screen.getByText("Session d'appels")).toBeInTheDocument()
    expect(screen.getByText('Appels prospection')).toBeInTheDocument()
    expect(screen.getByText('Trois comptes chauds à relancer avant vendredi')).toBeInTheDocument()
    expect(screen.getByText(/09:00–09:30/)).toBeInTheDocument()
  })

  it('#2391.19 — une échéance réelle se lit sur le bloc', () => {
    render(
      <FocusPlanCard
        plan={plan({
          blocks: [
            {
              type: 'follow_ups',
              title: 'Relancer THALES',
              duration_minutes: 15,
              start_iso: '2026-10-01T09:00:00+02:00',
              end_iso: '2026-10-01T09:15:00+02:00',
              priority_reason: 'Deadline client demain',
              priority: null,
              deadline: '2026-10-02',
              context: null,
              collision: null,
            },
          ],
        })}
      />,
    )
    expect(screen.getByText(/échéance/)).toBeInTheDocument()
  })

  it('#2391.33 — les blocs reportés sont NOMMÉS, avec leur raison', () => {
    render(
      <FocusPlanCard
        plan={plan({
          deferred_blocks: [{ type: 'admin_tasks', title: 'Notes de frais', reason: 'capacite_atteinte' }],
        })}
      />,
    )
    expect(screen.getByText(/Notes de frais/)).toBeInTheDocument()
    expect(screen.getByText(/capacité de la journée atteinte/)).toBeInTheDocument()
  })

  it('#2770 (recette prod 08/10) — un bloc trop long pour la journée se nomme, jamais « capacité atteinte »', () => {
    render(
      <FocusPlanCard
        plan={plan({
          deferred_blocks: [{ type: 'call_session', title: 'Session d’appels', reason: 'bloc_trop_long' }],
        })}
      />,
    )
    expect(screen.getByText(/plus long que ce qu’une journée libre peut accueillir/)).toBeInTheDocument()
  })

  it('#2391.18 — l’énergie déclarée se lit quand elle a été dite, jamais quand elle ne l’a pas été', () => {
    const { rerender } = render(<FocusPlanCard plan={plan({ energy: 'low' })} />)
    expect(screen.getByText(/Énergie déclarée : basse/)).toBeInTheDocument()
    rerender(<FocusPlanCard plan={plan({ energy: null })} />)
    expect(screen.queryByText(/Énergie déclarée/)).not.toBeInTheDocument()
  })

  it('#2391.30/.32 — la marge est toujours dite dès qu’un bloc est placé, même mesurée à zéro', () => {
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock], margin_minutes: 45 })} />)
    expect(screen.getByText(/45 min laissées libres/)).toBeInTheDocument()
  })

  it('#2770 (recette prod 08/10) — sans bloc placé, plus de marge « laissées libres » : elle contredirait « aucun bloc n’a pu être placé »', () => {
    render(<FocusPlanCard plan={plan({ margin_minutes: 250 })} />)
    expect(screen.getByText(/Aucun bloc n'a pu être placé/)).toBeInTheDocument()
    expect(screen.queryByText(/laissées libres/)).not.toBeInTheDocument()
  })

  const placedBlock = {
    type: 'call_session' as const,
    title: 'Appels prospection',
    duration_minutes: 30,
    start_iso: '2026-10-01T09:00:00+02:00',
    end_iso: '2026-10-01T09:30:00+02:00',
    priority_reason: 'Trois comptes chauds à relancer avant vendredi',
    priority: 'high' as const,
    deadline: null,
    context: null,
    collision: null,
  }

  it('#2770.49/.50/.51 — un bloc placé porte un geste explicite qui écrit CE bloc, jamais seul', () => {
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    fireEvent.click(screen.getByText('Ajouter à mon agenda'))
    expect(confirmMutate).toHaveBeenCalledWith(
      {
        type: 'call_session',
        title: 'Appels prospection',
        start_iso: '2026-10-01T09:00:00+02:00',
        end_iso: '2026-10-01T09:30:00+02:00',
      },
      expect.anything(),
    )
  })

  it('#2770.49/.50/.51 — après confirmation, l’état devient « confirmé, proposé par BellumAI »', () => {
    confirmMutate.mockImplementation((_input, options) =>
      options?.onSuccess?.({ id: 'evt-created-1', webUrl: null, conferenceUrl: null }),
    )
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    fireEvent.click(screen.getByText('Ajouter à mon agenda'))
    expect(screen.getByText(/Confirmé — proposé par/)).toBeInTheDocument()
    expect(screen.queryByText('Ajouter à mon agenda')).not.toBeInTheDocument()
  })

  it('#2770.49/.50/.51 — en salle de démonstration, aucun geste d’écriture n’est proposé', () => {
    useIsDemoMock.mockReturnValue(true)
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    expect(screen.queryByText('Ajouter à mon agenda')).not.toBeInTheDocument()
    expect(screen.getByText(/Espace de démonstration/)).toBeInTheDocument()
  })

  it('#2770.53 — un échec d’écriture (agenda sans droit d’écriture, entre autres) GARDE le bloc, jamais perdu', () => {
    confirmMutate.mockImplementation((_input, options) => options?.onError?.(new Error('agenda en lecture seule')))
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    fireEvent.click(screen.getByText('Ajouter à mon agenda'))
    // Le bloc reste actionnable — un geste raté n'efface ni le bloc ni la
    // possibilité de réessayer plus tard (agenda reconnecté en écriture).
    expect(screen.getByText('Appels prospection')).toBeInTheDocument()
    expect(screen.getByText('Ajouter à mon agenda')).toBeInTheDocument()
    expect(screen.queryByText(/Confirmé — proposé par/)).not.toBeInTheDocument()
  })

  it('#2770.47 — retirer un bloc l’enlève de la liste, sans jamais écrire', () => {
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    fireEvent.click(screen.getByText('Retirer'))
    expect(screen.queryByText('Appels prospection')).not.toBeInTheDocument()
    expect(confirmMutate).not.toHaveBeenCalled()
  })

  it('#2770.47 — retirer TOUS les blocs le dit, sans reprendre le libellé « aucun bloc placé »', () => {
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    fireEvent.click(screen.getByText('Retirer'))
    expect(screen.getByText(/Tous les blocs proposés ont été retirés/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucun bloc n'a pu être placé/)).not.toBeInTheDocument()
  })

  it('#2770.47 — un bloc confirmé ne peut plus être retiré (le geste réel prime)', () => {
    confirmMutate.mockImplementation((_input, options) =>
      options?.onSuccess?.({ id: 'evt-created-1', webUrl: null, conferenceUrl: null }),
    )
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    fireEvent.click(screen.getByText('Ajouter à mon agenda'))
    expect(screen.queryByText('Retirer')).not.toBeInTheDocument()
    expect(screen.getByText(/Confirmé — proposé par/)).toBeInTheDocument()
  })

  it('#2770.52 — un bloc confirmé porte un bouton « Annuler » qui transmet l’identifiant RÉEL rendu par la confirmation', () => {
    confirmMutate.mockImplementation((_input, options) =>
      options?.onSuccess?.({ id: 'evt-created-1', webUrl: null, conferenceUrl: null }),
    )
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    fireEvent.click(screen.getByText('Ajouter à mon agenda'))
    fireEvent.click(screen.getByText('Annuler'))
    expect(cancelMutate).toHaveBeenCalledWith('evt-created-1', expect.anything())
  })

  it('#2770.52 — après annulation, l’état le dit et aucun bouton n’agit plus sur ce bloc', () => {
    confirmMutate.mockImplementation((_input, options) =>
      options?.onSuccess?.({ id: 'evt-created-1', webUrl: null, conferenceUrl: null }),
    )
    cancelMutate.mockImplementation((_eventId, options) => options?.onSuccess?.())
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    fireEvent.click(screen.getByText('Ajouter à mon agenda'))
    fireEvent.click(screen.getByText('Annuler'))
    expect(screen.getByText(/Annulé/)).toBeInTheDocument()
    expect(screen.queryByText('Annuler')).not.toBeInTheDocument()
    expect(screen.queryByText(/Confirmé — proposé par/)).not.toBeInTheDocument()
  })

  it('#2770.52 — un échec d’annulation GARDE l’état confirmé, jamais perdu en silence', () => {
    confirmMutate.mockImplementation((_input, options) =>
      options?.onSuccess?.({ id: 'evt-created-1', webUrl: null, conferenceUrl: null }),
    )
    cancelMutate.mockImplementation((_eventId, options) => options?.onError?.(new Error('agenda déconnecté')))
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    fireEvent.click(screen.getByText('Ajouter à mon agenda'))
    fireEvent.click(screen.getByText('Annuler'))
    expect(screen.getByText(/Confirmé — proposé par/)).toBeInTheDocument()
    expect(screen.getByText('Annuler')).toBeInTheDocument()
  })

  it('#2770.63/.64/.65 — un bloc confirmé porte trois boutons d’état, un clic déclaré', () => {
    confirmMutate.mockImplementation((_input, options) =>
      options?.onSuccess?.({ id: 'evt-created-1', webUrl: null, conferenceUrl: null }),
    )
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    fireEvent.click(screen.getByText('Ajouter à mon agenda'))
    fireEvent.click(screen.getByText('Réalisé'))
    expect(setOutcomeMutate).toHaveBeenCalledWith({ eventId: 'evt-created-1', outcome: 'realized' }, expect.anything())
  })

  it('#2770.63/.64/.65 — une correction gagne toujours : re-cliquer un autre état le remplace', () => {
    confirmMutate.mockImplementation((_input, options) =>
      options?.onSuccess?.({ id: 'evt-created-1', webUrl: null, conferenceUrl: null }),
    )
    setOutcomeMutate.mockImplementation((_input, options) => options?.onSuccess?.())
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    fireEvent.click(screen.getByText('Ajouter à mon agenda'))
    fireEvent.click(screen.getByText('Interrompu'))
    fireEvent.click(screen.getByText('Reporté'))
    expect(setOutcomeMutate).toHaveBeenNthCalledWith(
      2,
      { eventId: 'evt-created-1', outcome: 'postponed' },
      expect.anything(),
    )
  })

  it('#2770.63/.64/.65 — un échec de marquage prévient, jamais silencieux', () => {
    confirmMutate.mockImplementation((_input, options) =>
      options?.onSuccess?.({ id: 'evt-created-1', webUrl: null, conferenceUrl: null }),
    )
    setOutcomeMutate.mockImplementation((_input, options) => options?.onError?.(new Error('marquage impossible')))
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    fireEvent.click(screen.getByText('Ajouter à mon agenda'))
    fireEvent.click(screen.getByText('Réalisé'))
    expect(screen.getByText('Réalisé')).toBeInTheDocument()
  })

  // #2770.66/.67 (#2391.54/.55) — le résultat libre et la durée DÉCLARÉE,
  // facultatifs, montrés après le clic, jamais pré-remplis.
  describe('résultat libre et durée déclarée', () => {
    function confirmed() {
      confirmMutate.mockImplementation((_input, options) =>
        options?.onSuccess?.({ id: 'evt-created-1', webUrl: null, conferenceUrl: null }),
      )
      setOutcomeMutate.mockImplementation((_input, options) => options?.onSuccess?.())
      render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
      fireEvent.click(screen.getByText('Ajouter à mon agenda'))
    }

    it('rien à remplir avant le clic : le clic seul reste un geste complet', () => {
      confirmed()
      expect(screen.queryByLabelText('Résultat du bloc, en une phrase')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('Réalisé'))
      expect(setOutcomeMutate).toHaveBeenCalledWith(
        { eventId: 'evt-created-1', outcome: 'realized' },
        expect.anything(),
      )
    })

    it('après le clic, enregistre le résultat et la durée tapés sur le MÊME état', () => {
      confirmed()
      fireEvent.click(screen.getByText('Réalisé'))
      fireEvent.change(screen.getByLabelText('Résultat du bloc, en une phrase'), {
        target: { value: '  Deux rendez-vous obtenus ' },
      })
      fireEvent.change(screen.getByLabelText('Durée réelle, en minutes'), { target: { value: '25' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
      expect(setOutcomeMutate).toHaveBeenLastCalledWith(
        { eventId: 'evt-created-1', outcome: 'realized', note: 'Deux rendez-vous obtenus', actualMinutes: 25 },
        expect.anything(),
      )
    })

    it('refuse une durée hors bornes ou décimale, et ne propose rien de vide', () => {
      confirmed()
      fireEvent.click(screen.getByText('Interrompu'))
      const save = screen.getByRole('button', { name: 'Enregistrer' })
      expect(save).toBeDisabled()
      fireEvent.change(screen.getByLabelText('Durée réelle, en minutes'), { target: { value: '0' } })
      expect(save).toBeDisabled()
      fireEvent.change(screen.getByLabelText('Durée réelle, en minutes'), { target: { value: '2.5' } })
      expect(save).toBeDisabled()
      fireEvent.change(screen.getByLabelText('Durée réelle, en minutes'), { target: { value: '90' } })
      expect(save).toBeEnabled()
    })
  })

  // V4-CORRECTIFS-B 4293.8 — après « Enregistrer », la carte DIT l'issue enregistrée.
  describe('V4-CORRECTIFS-B 4293.8 — l’issue enregistrée se voit', () => {
    function closed() {
      confirmMutate.mockImplementation((_input, options) =>
        options?.onSuccess?.({ id: 'evt-created-1', webUrl: null, conferenceUrl: null }),
      )
      setOutcomeMutate.mockImplementation((_input, options) => options?.onSuccess?.())
      render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
      fireEvent.click(screen.getByText('Ajouter à mon agenda'))
      fireEvent.click(screen.getByText('Réalisé'))
      fireEvent.change(screen.getByLabelText('Résultat du bloc, en une phrase'), { target: { value: 'Deux RDV' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    }

    it('montre l’état et le résultat saisi, et retire les boutons de clôture', () => {
      closed()
      expect(screen.getByText(/Marqué : Réalisé/)).toBeInTheDocument()
      expect(screen.getByText(/Deux RDV/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reporté' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument()
    })

    it('« Modifier » rouvre la clôture ; la seconde REMPLACE la première (même bloc, un seul état affiché)', () => {
      closed()
      fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
      fireEvent.click(screen.getByRole('button', { name: 'Reporté' }))
      expect(setOutcomeMutate).toHaveBeenLastCalledWith(
        { eventId: 'evt-created-1', outcome: 'postponed' },
        expect.anything(),
      )
      expect(screen.getByText(/Marqué : Reporté/)).toBeInTheDocument()
      expect(screen.queryByText(/Marqué : Réalisé/)).not.toBeInTheDocument()
    })
  })

  it('#2770.63/.64/.65 — un bloc annulé ne porte plus les boutons d’état', () => {
    confirmMutate.mockImplementation((_input, options) =>
      options?.onSuccess?.({ id: 'evt-created-1', webUrl: null, conferenceUrl: null }),
    )
    cancelMutate.mockImplementation((_eventId, options) => options?.onSuccess?.())
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    fireEvent.click(screen.getByText('Ajouter à mon agenda'))
    fireEvent.click(screen.getByText('Annuler'))
    expect(screen.queryByText('Réalisé')).not.toBeInTheDocument()
  })

  it('#2770.54 — copie le plan en texte brut, TOUJOURS disponible (agenda connecté ou non)', async () => {
    const writeText = clipboardSpy()
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock], margin_minutes: 45 })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copier le plan' }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    const copied = writeText.mock.calls[0]?.[0] ?? ''
    expect(copied).toContain('Appels prospection')
    expect(copied).toContain('45 min laissées libres')
  })

  it('#2770.54 — un presse-papier refusé ne prétend PAS avoir copié', async () => {
    clipboardSpy(() => Promise.reject(new Error('denied')))
    const { toast } = await import('sonner')
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copier le plan' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('#2770.54 — le bouton copier reste proposé en salle de démonstration', () => {
    useIsDemoMock.mockReturnValue(true)
    render(<FocusPlanCard plan={plan({ blocks: [placedBlock] })} />)
    expect(screen.getByRole('button', { name: 'Copier le plan' })).toBeInTheDocument()
  })

  it('#2770.35/.36/.37 — nomme ce que le plan n’a pas pu prendre en compte, au lieu de le taire', () => {
    render(<FocusPlanCard plan={plan({ unread_sources: ['tools', 'role', 'team_policy'] })} />)
    expect(
      screen.getByText('Non pris en compte : les outils branchés, ton rôle, la politique d’équipe.'),
    ).toBeInTheDocument()
  })

  it('#2770.35/.36/.37 — un plan d’avant ce champ ne fait aucune ligne ; un jour de la semaine ne le répète pas', () => {
    const { unmount } = render(<FocusPlanCard plan={plan()} />)
    expect(screen.queryByText(/Non pris en compte/)).not.toBeInTheDocument()
    unmount()
    render(<FocusPlanCard plan={plan({ unread_sources: ['tools'] })} variant="embedded" />)
    expect(screen.queryByText(/Non pris en compte/)).not.toBeInTheDocument()
  })

  it('#2770.35 — nomme les outils branchés qu’il a lus, et le bloc écarté faute d’outil', () => {
    render(
      <FocusPlanCard
        plan={plan({
          connected_tools: ['calendar', 'email'],
          unread_sources: ['role'],
          deferred_blocks: [{ type: 'data_correction', title: 'Nettoyer le CRM', reason: 'outil_non_branche' }],
        })}
      />,
    )
    expect(screen.getByText('Outils branchés pris en compte : agenda, messagerie.')).toBeInTheDocument()
    expect(
      screen.getByText('Nettoyer le CRM — s’appuie sur un outil que ton espace n’a pas branché'),
    ).toBeInTheDocument()
    expect(screen.getByText('Non pris en compte : ton rôle.')).toBeInTheDocument()
  })

  it('#2770.37 — sans politique saisie, le DIT ; jamais une ligne vide', () => {
    render(<FocusPlanCard plan={plan({ team_policy: null })} />)
    expect(screen.getByText('Aucune politique d’équipe saisie.')).toBeInTheDocument()
  })

  it('#2770.37 — la politique appliquée se lit en une phrase, plafond et objectif confrontés au plan', () => {
    render(
      <FocusPlanCard
        plan={plan({
          team_policy: {
            prospecting_windows: [{ start_minute: 510, end_minute: 600 }],
            forbidden_windows: [{ start_minute: 1080, end_minute: 1200 }],
            max_meetings_per_day: 4,
            daily_call_target: 20,
          },
          meetings_count: 5,
        })}
      />,
    )
    expect(
      screen.getByText(
        'Politique d’équipe : prospection protégée 08:30–10:00 ; aucun bloc 18:00–20:00 ; 4 réunions max par jour ; objectif de 20 appels par jour.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('5 réunions déjà à l’agenda ce jour-là, pour un plafond d’équipe de 4.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Aucune session d’appels dans ce plan, pour un objectif d’équipe de 20 appels par jour.'),
    ).toBeInTheDocument()
  })

  it('#2770.37 — des réunions non comptées ne font aucune ligne (jamais « 0 réunion »)', () => {
    render(
      <FocusPlanCard
        plan={plan({
          blocks: [placedBlock],
          team_policy: {
            prospecting_windows: [],
            forbidden_windows: [],
            max_meetings_per_day: 4,
            daily_call_target: null,
          },
        })}
      />,
    )
    expect(screen.queryByText(/réunions déjà à l’agenda/)).not.toBeInTheDocument()
  })

  it('#2770.37 — une plage qui ne vaut que certains jours (plan de semaine) nomme ses jours', () => {
    render(
      <FocusPlanCard
        plan={plan({
          team_policy: {
            prospecting_windows: [],
            forbidden_windows: [{ start_minute: 720, end_minute: 840, weekdays: [1, 5] }],
            max_meetings_per_day: null,
            daily_call_target: null,
          },
        })}
      />,
    )
    expect(screen.getByText('Politique d’équipe : aucun bloc 12:00–14:00 (lun., ven.).')).toBeInTheDocument()
  })
})
