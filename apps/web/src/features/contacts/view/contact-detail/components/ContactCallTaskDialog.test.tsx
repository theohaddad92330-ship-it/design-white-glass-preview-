import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useCreateOutreachCallTask } from '@/features/outreach/hooks/useOutreachMutations'
import { ContactCallTaskDialog } from './ContactCallTaskDialog'

vi.mock('@/features/outreach/hooks/useOutreachMutations', () => ({
  useCreateOutreachCallTask: vi.fn(),
}))

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
describe('ContactCallTaskDialog — #2366.5, proposer un appel depuis la fiche Contact', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('le bouton « Enregistrer » est inerte tant que raison, objectif ou résultat attendu manquent (#2395.8)', async () => {
    const mutate = vi.fn()
    setMutation(mutate)
    const user = userEvent.setup()
    render(<ContactCallTaskDialog contactId="contact-1" open onOpenChange={vi.fn()} />)

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
    render(<ContactCallTaskDialog contactId="contact-1" open onOpenChange={vi.fn()} />)

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
})
