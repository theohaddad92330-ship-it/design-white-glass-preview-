import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentType, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const requestReport = vi.fn()
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => ({ options }) }))
vi.mock('@/components/page/SettingsPage', () => ({
  SettingsPage: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/features/feedback/reportLink', () => ({ requestReport: (arg: unknown) => requestReport(arg) }))
vi.mock('@/features/feedback/MyReportsView', () => ({
  MyReportsView: ({ embedded }: { embedded?: boolean }) => <p>{embedded ? 'MES-SIGNALEMENTS-BLOC' : 'PAGE'}</p>,
}))
vi.mock('@/features/settings/view/HelpAndAboutGroups', () => ({ HelpAndAboutGroups: () => <p>AIDE-ET-DEBUTS</p> }))

describe('Théo D settings-outils (Aide & signalements) — structure de la maquette (contrôle 23/10)', () => {
  it('un en-tête « Aide & signalements », l’aide, puis « Mes signalements » en bloc', async () => {
    const { Route } = await import('@/routes/settings/mes-signalements')
    const Page = (Route as unknown as { options: { component: ComponentType } }).options.component
    render(<Page />)
    expect(screen.getByRole('heading', { level: 1, name: 'title' })).toBeInTheDocument()
    const text = document.body.textContent ?? ''
    expect(text.indexOf('AIDE-ET-DEBUTS')).toBeGreaterThan(-1)
    expect(text.indexOf('AIDE-ET-DEBUTS')).toBeLessThan(text.indexOf('MES-SIGNALEMENTS-BLOC'))
  })

  it('« Préparer un signalement » ouvre le formulaire existant, vide — il n’envoie rien', async () => {
    const { Route } = await import('@/routes/settings/mes-signalements')
    const Page = (Route as unknown as { options: { component: ComponentType } }).options.component
    render(<Page />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'prepareReport' }))
    expect(requestReport).toHaveBeenCalledWith({ message: '' })
  })
})
