import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackofficeConsoleLink } from './BackofficeConsoleLink'

const apiFetchMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetchMock(...args) }))

/** Le libellé FR du lien — la suite est épinglée sur le français (`setup.ts`). */
const LINK_LABEL = /Ouvrir la console d’exploitation/

beforeEach(() => {
  apiFetchMock.mockReset()
})

describe('/bak/home — l’adresse de la console d’exploitation', () => {
  it('demande l’adresse au serveur, jamais à une variable du bundle', async () => {
    apiFetchMock.mockResolvedValue({ url: null })
    render(<BackofficeConsoleLink />)
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    expect(apiFetchMock.mock.calls[0]?.[0]).toEqual({ path: '/backoffice/address' })
  })

  it('sans adresse configurée : aucun lien, aucune erreur, et le paragraphe honnête reste', async () => {
    apiFetchMock.mockResolvedValue({ url: null })
    render(<BackofficeConsoleLink />)

    await screen.findByText(/n’est pas configurée/)
    expect(screen.queryByRole('link')).toBeNull()
    // Ni message d'échec ni adresse devinée : « pas configuré » n'est pas une panne.
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('avec une adresse : un lien vers elle, et rien d’autre', async () => {
    apiFetchMock.mockResolvedValue({ url: 'https://console.bellum-ai.test' })
    render(<BackofficeConsoleLink />)

    const link = await screen.findByRole('link', { name: LINK_LABEL })
    expect(link).toHaveAttribute('href', 'https://console.bellum-ai.test')
  })

  it('le lien DIT qu’il ouvre une autre application, dans son nom accessible', async () => {
    apiFetchMock.mockResolvedValue({ url: 'https://console.bellum-ai.test' })
    render(<BackofficeConsoleLink />)

    // La mention vit DANS le lien : un lecteur d'écran l'annonce avec lui, elle
    // n'est pas un texte voisin qu'on peut manquer.
    const link = await screen.findByRole('link', { name: /autre application, nouvel onglet/ })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })

  it('ce qui se clique se tabule — c’est un vrai lien, pas un div cliquable', async () => {
    apiFetchMock.mockResolvedValue({ url: 'https://console.bellum-ai.test' })
    render(<BackofficeConsoleLink />)

    const link = await screen.findByRole('link', { name: LINK_LABEL })
    expect(link.tagName).toBe('A')
    // Un `<a href>` est tabulable nativement : aucun `tabIndex` à poser, et
    // surtout aucun `tabIndex={-1}` qui le sortirait du parcours clavier.
    expect(link).not.toHaveAttribute('tabindex')
  })

  it('un appelant sans le rôle (403) ne voit aucun lien', async () => {
    apiFetchMock.mockRejectedValue(new Error('Forbidden'))
    render(<BackofficeConsoleLink />)

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('link')).toBeNull())
  })

  it('n’affirme rien tant que le serveur n’a pas répondu', async () => {
    // « Pas d'adresse configurée » affiché pendant le chargement serait un zéro
    // de chargement : une affirmation qu'on n'a pas encore le droit de faire.
    apiFetchMock.mockReturnValue(new Promise(() => {}))
    render(<BackofficeConsoleLink />)

    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText(/n’est pas configurée|autre application/)).toBeNull()
  })

  it('n’écrit AUCUNE adresse en dur — la seule qu’elle connaisse vient du serveur', () => {
    const source = readFileSync(join(__dirname, 'BackofficeConsoleLink.tsx'), 'utf8')
    expect(source.length).toBeGreaterThan(200) // la garde lit bien quelque chose
    expect(source).not.toMatch(/https?:\/\//)
    // Et aucune variable de build : une `VITE_*` finirait dans le bundle public.
    expect(source).not.toContain('import.meta.env')
  })
})
