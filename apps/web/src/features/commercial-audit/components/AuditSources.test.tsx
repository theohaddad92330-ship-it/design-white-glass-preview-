import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EsnAnswers } from '@bellum/contracts'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { useEsnProfileWorkspaceMeta } from '@/features/profile/hooks/useEsnProfileWorkspaceMeta'
import { useSaveEsnField } from '@/features/profile/hooks/useSaveEsnField'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AuditSources, AuditStageSources } from './AuditSources'

vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useEsnProfile: vi.fn() }))
vi.mock('@/features/profile/hooks/useEsnProfileWorkspaceMeta', () => ({ useEsnProfileWorkspaceMeta: vi.fn() }))
vi.mock('@/features/profile/hooks/useSaveEsnField', () => ({ useSaveEsnField: vi.fn() }))

const saveField = vi.fn()

function setup(answers: Partial<EsnAnswers> | undefined, canEditCompany = true) {
  vi.mocked(useEsnProfile).mockReturnValue({ data: answers } as unknown as ReturnType<typeof useEsnProfile>)
  vi.mocked(useEsnProfileWorkspaceMeta).mockReturnValue({
    data: { shared: true, canEditCompany, role: canEditCompany ? 'owner' : 'member' },
  } as unknown as ReturnType<typeof useEsnProfileWorkspaceMeta>)
  saveField.mockReset().mockResolvedValue(undefined)
  vi.mocked(useSaveEsnField).mockReturnValue(saveField)
}

describe('AuditSources — #4425.1 une valeur calculée dit d’où elle vient, et se corrige à sa source', () => {
  beforeEach(() => setup({ consultant_size: '10-30' }))

  it('nomme « calculé à partir de » et édite la réponse source EN PLACE (liste fermée)', async () => {
    const user = userEvent.setup()
    renderWithRouter(<AuditSources answerKeys={['consultant_size']} />)

    expect(await screen.findByText(/Calculé à partir de/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Modifier —/ }))
    await user.click(screen.getByRole('button', { name: /Enregistrer/ }))
    await waitFor(() => expect(saveField).toHaveBeenCalledWith('consultant_size', '10-30'))
  })

  it('une réponse absente se dit « Non renseigné », jamais 0', async () => {
    setup({})
    renderWithRouter(<AuditSources answerKeys={['consultant_size']} />)
    expect(await screen.findByText(/Non renseigné/)).toBeInTheDocument()
  })

  it('une réponse à choix multiples mène à son étape (lien), sans champ libre', async () => {
    setup({ target_company_types: ['PME'] } as Partial<EsnAnswers>)
    renderWithRouter(<AuditSources answerKeys={['target_company_types']} />)
    const link = await screen.findByRole('link', { name: /Modifier —/ })
    expect(link.getAttribute('href')).toBe('/settings/profile/target_market')
  })

  it('le verrou de rôle reste : un champ d’entreprise d’un espace partagé n’est pas éditable par un non-admin', async () => {
    setup({ consultant_size: '10-30' }, false)
    renderWithRouter(<AuditSources answerKeys={['consultant_size']} />)
    await screen.findByText(/Calculé à partir de/)
    expect(screen.queryByRole('button', { name: /Modifier —/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Réservé aux administrateurs/)).toBeInTheDocument()
    expect(saveField).not.toHaveBeenCalled()
  })

  it('un champ PERSONNEL (le frein du commercial) reste éditable même verrouillé', async () => {
    setup({ main_sales_pain: 'Je ne trouve pas les bons contacts' } as Partial<EsnAnswers>, false)
    renderWithRouter(<AuditSources answerKeys={['main_sales_pain']} />)
    expect(await screen.findByRole('button', { name: /Modifier —/ })).toBeInTheDocument()
  })

  it('tant que le profil n’est pas lu, rien — pas un « Non renseigné » qui mentirait', () => {
    setup(undefined)
    const { container } = renderWithRouter(<AuditSources answerKeys={['consultant_size']} />)
    expect(container.textContent).toBe('')
  })
})

describe('AuditStageSources — un bloc calculé nomme les étapes qui l’alimentent', () => {
  it('un lien vers chaque étape, le bloc lui-même n’est pas éditable', async () => {
    setup({})
    renderWithRouter(<AuditStageSources stages={['company_info', 'target_market']} />)
    const links = await screen.findAllByRole('link')
    expect(links.map(l => l.getAttribute('href'))).toEqual([
      '/settings/profile/company_info',
      '/settings/profile/target_market',
    ])
  })
})
