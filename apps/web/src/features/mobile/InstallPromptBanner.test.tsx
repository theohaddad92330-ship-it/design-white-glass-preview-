import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2435.11 — PROPOSER L'INSTALLATION APRÈS UN PREMIER SUCCÈS, JAMAIS AU
 * PREMIER ÉCRAN.
 *
 * `InstallPromptBanner` ne montre RIEN tant que `hasFirstSuccess` est faux —
 * c'est l'appelant (`ChatMain`) qui le calcule sur le fil réel (au moins une
 * réponse de Laura, jamais une bulle d'échec). Une fois vrai, l'éligibilité
 * est mémorisée (`install-eligibility.ts`, localStorage) : un remontage sur
 * un fil VIDE (nouvelle conversation) ne fait pas disparaître l'invite.
 */

const promptInstallMock = vi.fn()
let canInstallValue = true
let isMobileValue = true
let installedValue = false

vi.mock('./useIsMobile', () => ({
  useIsMobile: () => isMobileValue,
  useIsInstalled: () => installedValue,
}))
vi.mock('./useInstallPrompt', () => ({
  useInstallPrompt: () => ({ canInstall: canInstallValue, promptInstall: promptInstallMock }),
}))

import { InstallPromptBanner } from './InstallPromptBanner'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  canInstallValue = true
  isMobileValue = true
  installedValue = false
})

describe('InstallPromptBanner (#2435.11)', () => {
  it("sans premier succès, rien ne s'affiche (jamais au premier écran)", () => {
    render(<InstallPromptBanner hasFirstSuccess={false} />)
    expect(screen.queryByRole('button', { name: /installer/i })).not.toBeInTheDocument()
  })

  it("après un premier succès, l'invite s'affiche", () => {
    render(<InstallPromptBanner hasFirstSuccess />)
    expect(screen.getByRole('button', { name: /installer/i })).toBeInTheDocument()
  })

  it('un remontage sur un fil vierge garde l’invite — l’éligibilité est mémorisée', () => {
    const { unmount } = render(<InstallPromptBanner hasFirstSuccess />)
    expect(screen.getByRole('button', { name: /installer/i })).toBeInTheDocument()
    unmount()

    render(<InstallPromptBanner hasFirstSuccess={false} />)
    expect(screen.getByRole('button', { name: /installer/i })).toBeInTheDocument()
  })

  it('cliquer « Installer » appelle `promptInstall`', async () => {
    const user = userEvent.setup()
    render(<InstallPromptBanner hasFirstSuccess />)
    await user.click(screen.getByRole('button', { name: /installer/i }))
    expect(promptInstallMock).toHaveBeenCalledTimes(1)
  })

  it('cliquer « Ignorer » referme l’invite', async () => {
    const user = userEvent.setup()
    render(<InstallPromptBanner hasFirstSuccess />)
    await user.click(screen.getByRole('button', { name: /ignorer/i }))
    expect(screen.queryByRole('button', { name: /installer/i })).not.toBeInTheDocument()
  })

  it('sur bureau, rien ne s’affiche même après un premier succès', () => {
    isMobileValue = false
    render(<InstallPromptBanner hasFirstSuccess />)
    expect(screen.queryByRole('button', { name: /installer/i })).not.toBeInTheDocument()
  })

  it('déjà installée, rien ne s’affiche', () => {
    installedValue = true
    render(<InstallPromptBanner hasFirstSuccess />)
    expect(screen.queryByRole('button', { name: /installer/i })).not.toBeInTheDocument()
  })

  it('sans `beforeinstallprompt` capté (`canInstall` faux), rien ne s’affiche', () => {
    canInstallValue = false
    render(<InstallPromptBanner hasFirstSuccess />)
    expect(screen.queryByRole('button', { name: /installer/i })).not.toBeInTheDocument()
  })
})
