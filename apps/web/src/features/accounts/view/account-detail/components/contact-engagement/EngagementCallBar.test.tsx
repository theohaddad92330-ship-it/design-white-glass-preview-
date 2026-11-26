import type { Contact } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogActivity } from '@/features/activities/hooks/useTimeline'
import { i18n } from '@/i18n'
import { EngagementCallBar } from './EngagementCallBar'

vi.mock('@/features/activities/hooks/useTimeline', () => ({ useLogActivity: vi.fn() }))

const withPhone = { id: 'c1', account_id: 'a1', phone: '+33 6 12 34 56 78' } as unknown as Contact
// #3850.4 — forme réellement STOCKÉE (E.164 compact), pas l'ancienne forme espacée du fixture ci-dessus.
const withCompactPhone = { id: 'c1', account_id: 'a1', phone: '+33681050091' } as unknown as Contact
const withoutPhone = { id: 'c1', account_id: 'a1', phone: null } as unknown as Contact

/**
 * #3697.5 / #3697.6 — le support d'appel porte « Consigner le résultat », et se prépare sans numéro.
 */
describe('EngagementCallBar — #3697.5/.6', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    vi.mocked(useLogActivity).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<
      typeof useLogActivity
    >)
  })

  it('#3697.6 — « Consigner le résultat » ouvre le formulaire d’un appel passé, sans rien de prérempli', async () => {
    const user = userEvent.setup()
    render(<EngagementCallBar contact={withPhone} />)

    await user.click(screen.getByRole('button', { name: 'J’ai passé cet appel — consigner' }))

    expect(screen.getByText('Pas de réponse')).toBeInTheDocument()
    for (const textbox of screen.queryAllByRole('textbox')) expect((textbox as HTMLInputElement).value).toBe('')
    expect(useLogActivity).toHaveBeenCalledWith('contact', 'c1')
  })

  it('le numéro réel est montré en clair quand il existe', () => {
    render(<EngagementCallBar contact={withPhone} />)

    expect(screen.getByText('+33 6 12 34 56 78')).toBeInTheDocument()
    expect(screen.queryByText(/Aucun numéro/)).toBeNull()
  })

  // #3850.4 — stockage E.164 compact, AFFICHAGE international lisible.
  it('#3850.4 — un numéro stocké compact s’affiche en international lisible', () => {
    render(<EngagementCallBar contact={withCompactPhone} />)

    expect(screen.getByText('+33 6 81 05 00 91')).toBeInTheDocument()
    expect(screen.queryByText('+33681050091')).toBeNull()
  })

  it('#3697.5 — sans numéro, le support le DIT et reste utilisable ; aucun numéro inventé', async () => {
    const user = userEvent.setup()
    render(<EngagementCallBar contact={withoutPhone} />)

    expect(screen.getByText(/Aucun numéro enregistré/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'J’ai passé cet appel — consigner' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'J’ai passé cet appel — consigner' }))
    expect(screen.getByText('Pas de réponse')).toBeInTheDocument()
  })
})
