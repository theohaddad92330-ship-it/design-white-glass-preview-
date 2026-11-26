import type { PlaybookSubscription } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #1438 — SUR PILOTAGE, LES AUTOMATISATIONS SE LISENT ; ELLES NE SE RÈGLENT PAS.
 *
 * *« Pilotage montre l'état et les problèmes. La page Automatisations sert à
 * configurer. »* Deux gardes, et la seconde est la plus importante :
 *
 * 1. La synthèse dit ce qu'elle sait — armées, non armées — et rien d'autre.
 *    ⚠️ « 1 en anomalie », que le retour demande, N'EST PAS livré : un playbook
 *    ne porte aucun état d'anomalie. Ce ne serait pas un chiffre faux, ce serait
 *    un chiffre sans source.
 * 2. **Une lecture en échec ne s'écrit pas « 0 armée ».** Zéro armé est vrai et
 *    rassurant ; ne pas avoir pu lire ne l'est pas, et les deux mènent à des
 *    gestes opposés.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const playbooks = vi.fn()
vi.mock('../api', () => ({ usePlaybooks: () => playbooks() }))

const { PlaybooksSummary } = await import('./PlaybooksSummary')

function subscription(playbook: PlaybookSubscription['playbook'], enabled: boolean): PlaybookSubscription {
  return { playbook, enabled, silenceDays: 7, updatedAt: '2026-09-01T09:00:00.000Z' }
}

describe('la synthèse des automatisations', () => {
  it('compte les armées et les non armées, et ouvre là où ça se règle', () => {
    playbooks.mockReturnValue({
      data: [
        subscription('submission_no_reply', true),
        subscription('mission_renewal', true),
        subscription('proposal_no_reply', false),
      ],
      isLoading: false,
      isError: false,
    })
    const { container } = render(<PlaybooksSummary />)

    expect(container.textContent).toContain('2 armées · 1 non armées')
    expect(screen.getByRole('link').getAttribute('href')).toBe('/settings/routines')
  })

  it('aucune armée est une MESURE, et elle s’écrit', () => {
    playbooks.mockReturnValue({
      data: [subscription('submission_no_reply', false)],
      isLoading: false,
      isError: false,
    })
    const { container } = render(<PlaybooksSummary />)

    expect(container.textContent).toContain('0 armées · 1 non armées')
  })

  it('une lecture en ÉCHEC ne s’écrit pas « 0 armée »', () => {
    playbooks.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    const { container } = render(<PlaybooksSummary />)

    expect(container.textContent).not.toContain('0 armées')
    expect(container.textContent).toContain('n’a pas pu être lu')
  })

  it('ne montre AUCUN état d’anomalie — il n’en existe pas au contrat', () => {
    playbooks.mockReturnValue({
      data: [subscription('submission_no_reply', true)],
      isLoading: false,
      isError: false,
    })
    const { container } = render(<PlaybooksSummary />)

    expect(container.textContent).not.toMatch(/anomalie|anomaly/i)
  })

  it('ne rend rien pendant le chargement : une file vide se lit « rien à faire »', () => {
    playbooks.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    const { container } = render(<PlaybooksSummary />)

    expect(container.textContent).toBe('')
  })
})
