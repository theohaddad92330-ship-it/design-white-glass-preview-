import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useCreateOutreachCallTask } from '@/features/outreach/hooks/useOutreachMutations'
import { useLogActivity } from '@/features/activities/hooks/useTimeline'
import { useContactCallTasks } from '@/features/outreach/hooks/useContactCallTasks'
import type { Contact } from '@bellum/contracts'
import { ContactCallTaskCard } from './ContactCallTaskCard'

vi.mock('@/features/outreach/hooks/useOutreachMutations', () => ({
  useCreateOutreachCallTask: vi.fn(),
}))
vi.mock('@/features/activities/hooks/useTimeline', () => ({ useLogActivity: vi.fn() }))
vi.mock('@/features/outreach/hooks/useContactCallTasks', () => ({ useContactCallTasks: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const contact = { id: 'contact-1', account_id: 'account-1', full_name: 'Olivier Roussat' } as unknown as Contact

function setMutation(mutate: (...args: unknown[]) => void, isPending = false) {
  vi.mocked(useCreateOutreachCallTask).mockReturnValue({
    mutate,
    isPending,
  } as unknown as ReturnType<typeof useCreateOutreachCallTask>)
}

/**
 * #2366.5 — le SEUL appelant manquant : `POST /outreach/call-tasks` existait,
 * gardé, testé côté serveur, et aucun écran ne le proposait (section « Appels »
 * de `OutreachApprovalCenter` toujours vide en prod). Cette carte est ce
 * caller, posée sur la fiche Contact — même surface que les messages préparés.
 */
describe('ContactCallTaskCard — #2366.5, proposer un appel depuis la fiche Contact', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    vi.mocked(useContactCallTasks).mockReturnValue({ data: [] } as unknown as ReturnType<typeof useContactCallTasks>)
  })

  it('le bouton « Planifier un appel » est inerte tant que raison, objectif ou résultat attendu manquent (#2395.8)', async () => {
    const mutate = vi.fn()
    setMutation(mutate)
    const user = userEvent.setup()
    render(<ContactCallTaskCard contact={contact} />)

    await user.click(screen.getByRole('button', { name: 'Planifier un appel' }))
    const submit = screen.getByRole('button', { name: 'Enregistrer' })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('Raison de l’appel'), 'Relance après silence')
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('Objectif de l’appel'), 'Fixer un rendez-vous')
    // #2395.8 — un objectif seul ne suffit pas : le résultat attendu manque encore.
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('Résultat attendu'), 'Une date de rendez-vous confirmée')
    expect(submit).not.toBeDisabled()
  })

  it('soumet le contact, la source « contacts » et les trois champs saisis (#2395.8)', async () => {
    const mutate = vi.fn()
    setMutation(mutate)
    const user = userEvent.setup()
    render(<ContactCallTaskCard contact={contact} />)

    await user.click(screen.getByRole('button', { name: 'Planifier un appel' }))
    await user.type(screen.getByLabelText('Raison de l’appel'), 'Relance après silence')
    await user.type(screen.getByLabelText('Objectif de l’appel'), 'Fixer un rendez-vous')
    await user.type(screen.getByLabelText('Résultat attendu'), 'Une date de rendez-vous confirmée')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(mutate).toHaveBeenCalledWith(
      {
        contact_id: 'contact-1',
        source: 'contacts',
        reason: 'Relance après silence',
        objective: 'Fixer un rendez-vous',
        expected_outcome: 'Une date de rendez-vous confirmée',
      },
      expect.anything(),
    )
  })

  /**
   * #3697 — préparer, consigner et planifier ne sont pas le même objet : la
   * carte porte les trois gestes, chacun sous son verbe, et « Consigner » ouvre
   * le formulaire d'activité d'un appel PASSÉ (jamais une tâche future).
   */
  it('#3697.1 — « Préparer mon appel » n’existe que si le parcours de préparation est branché, et l’appelle', async () => {
    setMutation(vi.fn())
    const onPrepare = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<ContactCallTaskCard contact={contact} />)
    expect(screen.queryByRole('button', { name: 'Préparer mon appel' })).toBeNull()

    rerender(<ContactCallTaskCard contact={contact} onPrepare={onPrepare} />)
    await user.click(screen.getByRole('button', { name: 'Préparer mon appel' }))

    expect(onPrepare).toHaveBeenCalledTimes(1)
  })

  it('#3697.2 — « Consigner un appel » ouvre le formulaire d’un appel passé : contact et compte, rien de pré-écrit', async () => {
    setMutation(vi.fn())
    const logMutate = vi.fn()
    vi.mocked(useLogActivity).mockReturnValue({ mutate: logMutate, isPending: false } as unknown as ReturnType<
      typeof useLogActivity
    >)
    const user = userEvent.setup()
    render(<ContactCallTaskCard contact={contact} />)

    await user.click(screen.getByRole('button', { name: 'Consigner un appel' }))

    // Le formulaire est celui de l'appel (issues d'appel), pas d'une note.
    expect(screen.getByText('Pas de réponse')).toBeInTheDocument()
    // #3697.4 — aucune objection (possible) n'est pré-remplie comme exprimée.
    for (const textbox of screen.queryAllByRole('textbox')) expect((textbox as HTMLInputElement).value).toBe('')
    expect(logMutate).not.toHaveBeenCalled()
    expect(useLogActivity).toHaveBeenCalledWith('contact', 'contact-1')
  })

  it('#3697.3 — « Planifier » reste une tâche FUTURE : l’explication la distingue d’un appel passé', () => {
    setMutation(vi.fn())
    render(<ContactCallTaskCard contact={contact} />)

    expect(screen.getByText(/tâche à venir/i)).toBeInTheDocument()
  })

  /**
   * #3697.7 — les tâches d'appel FUTURES existantes restent retrouvables depuis la fiche, séparées
   * de l'historique ; sans tâche à venir, aucune ligne (une absence ne fait pas de ligne).
   */
  it('#3697.7 — liste les appels À PASSER du contact, avec leur statut et leur date réelle', () => {
    setMutation(vi.fn())
    vi.mocked(useContactCallTasks).mockReturnValue({
      data: [
        { id: 't1', reason: 'Relance après silence', status: 'scheduled', scheduled_at: '2026-10-12T09:00:00.000Z' },
        { id: 't2', reason: 'Premier contact', status: 'proposed', scheduled_at: null },
      ],
    } as unknown as ReturnType<typeof useContactCallTasks>)
    render(<ContactCallTaskCard contact={contact} />)

    expect(screen.getByText('Appels à passer')).toBeInTheDocument()
    expect(screen.getByText('Relance après silence')).toBeInTheDocument()
    expect(screen.getByText(/Planifié · /)).toBeInTheDocument()
    // Sans date planifiée : le statut seul, jamais une date inventée.
    expect(screen.getByText('Proposé')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Séquences › Appels/ })).toHaveAttribute('href', '/actions/sequences')
  })

  it('SAIT DIRE NON — aucun appel à venir : ni titre ni ligne', () => {
    setMutation(vi.fn())
    render(<ContactCallTaskCard contact={contact} />)

    expect(screen.queryByText('Appels à passer')).toBeNull()
  })
})
