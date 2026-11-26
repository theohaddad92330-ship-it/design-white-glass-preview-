import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateMissionPage } from './CreateMissionPage'

/**
 * #4196 (L5) — « Nouvelle mission » monte le formulaire de MISSION (et plus
 * l'assistant de besoin), et ouvre le dossier de ce qui vient d'être créé.
 */
const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children, headerActions }: { children: ReactNode; headerActions?: ReactNode }) => (
    <div>
      <div data-testid="header-actions">{headerActions}</div>
      {children}
    </div>
  ),
}))

let formProps: { projectId?: string; onCreated: (m: { id: string }) => void; onCancel: () => void } | null = null
vi.mock('./MissionCreateForm', () => ({
  MissionCreateForm: (props: NonNullable<typeof formProps>) => {
    formProps = props
    return <div data-testid="mission-create-form" />
  },
}))

describe('CreateMissionPage', () => {
  beforeEach(() => {
    navigate.mockReset()
    formProps = null
  })

  it('montre le titre visible et le formulaire de mission', () => {
    render(<CreateMissionPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Nouvelle mission' })).toBeInTheDocument()
    expect(screen.getByTestId('mission-create-form')).toBeInTheDocument()
  })

  it('après création, ouvre le dossier de la mission créée', () => {
    render(<CreateMissionPage />)
    formProps?.onCreated({ id: 'm-42' })
    expect(navigate).toHaveBeenCalledWith({ to: '/missions/$id', params: { id: 'm-42' } })
  })

  it('porte l’opportunité signée au formulaire, et la flèche ramène aux missions', async () => {
    render(<CreateMissionPage fixedProjectId="p-9" />)
    expect(formProps?.projectId).toBe('p-9')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retour à mes missions en cours' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/missions' })
  })

  it("#4486 — le formulaire s'aligne sur la coque : aucune gouttière verticale ajoutée en plus de celle de CustomerPage", () => {
    const { container } = render(<CreateMissionPage />)
    const screenRoot = container.querySelector('[data-screen="nouvelle-mission"]')
    expect(screenRoot).not.toBeNull()
    // La coque pose déjà la gouttière de page : un `py-*` ici décalait tout le formulaire (~20 px).
    expect(screenRoot?.className).not.toMatch(/(^|\s)(py|pt|pb|p)-\d/)
  })
})
