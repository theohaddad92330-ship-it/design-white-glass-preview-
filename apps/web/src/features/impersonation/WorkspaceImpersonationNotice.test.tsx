import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { WorkspaceImpersonationNotice } from './WorkspaceImpersonationNotice'

function toBase64Url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function setImpStateCookie() {
  document.cookie = `imp_state=${toBase64Url({ email: 'client@esn.fr', by: 'ops', exp: Date.now() / 1000 + 600 })}`
}

function clearImpStateCookie() {
  document.cookie = 'imp_state=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
}

function stubFetch(body: unknown, ok = true) {
  const spy = vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response)
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('WorkspaceImpersonationNotice (#1670.2)', () => {
  beforeEach(async () => {
    clearImpStateCookie()
    await i18n.changeLanguage('fr')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    clearImpStateCookie()
  })

  it('prévient le client quand quelqu’un de chez nous est sur son espace', async () => {
    stubFetch({ active: true, since: '2026-09-06T10:00:00.000Z' })

    render(<WorkspaceImpersonationNotice />)

    const notice = await screen.findByRole('status')
    // ⚠️ On n'assertion PAS le nom de la marque : il passe par `{{brand}}`
    // (marque blanche — un client sous sa propre marque ne doit jamais lire le
    // nôtre). Ce qui compte est ce que la phrase PROMET : quelqu'un est là, et
    // c'est chez toi.
    expect(notice.textContent).toContain('ton espace')
    // #4423.3 — la politique AUTORISE corrections et imports : jamais « lecture seule ».
    expect(notice.textContent).not.toContain('lecture seule')
    expect(notice.textContent).toContain('ni acheter, ni envoyer, ni connecter un outil')
  })

  it('ne dit ni QUI est incarné ni QUI incarne', async () => {
    // Même si le serveur en envoyait davantage, l'écran n'en affiche rien :
    // « quelqu'un est connecté en tant que Sarah » dit à toute l'équipe de Sarah
    // quelque chose que #1670 ne demande pas de dire.
    stubFetch({ active: true, since: '2026-09-06T10:00:00.000Z', target: 'sarah@client.fr', by: 'theo' })

    render(<WorkspaceImpersonationNotice />)

    const notice = await screen.findByRole('status')
    expect(notice.textContent).not.toContain('sarah')
    expect(notice.textContent).not.toContain('theo')
  })

  it('ne montre RIEN quand personne n’est là', async () => {
    stubFetch({ active: false, since: null })
    const { container } = render(<WorkspaceImpersonationNotice />)
    await waitFor(() => expect(container.textContent).toBe(''))
  })

  it('ne s’allume pas parce qu’un appel a échoué', async () => {
    // Un bandeau qui s'allume sur une panne réseau apprend à être ignoré, et le
    // jour où il dit vrai plus personne ne le lit.
    stubFetch({}, false)
    const { container } = render(<WorkspaceImpersonationNotice />)
    await waitFor(() => expect(container.textContent).toBe(''))
  })

  it('ne s’affiche JAMAIS dans une session d’incarnation, et n’appelle même pas', async () => {
    // L'opérateur a déjà son bandeau « Tu incarnes… ». Un second, rédigé pour le
    // client, lui ferait croire qu'une deuxième personne est là.
    setImpStateCookie()
    const spy = stubFetch({ active: true, since: '2026-09-06T10:00:00.000Z' })

    const { container } = render(<WorkspaceImpersonationNotice />)

    await waitFor(() => expect(container.textContent).toBe(''))
    expect(spy).not.toHaveBeenCalled()
  })

  it('parle la langue du lecteur', async () => {
    await i18n.changeLanguage('en')
    stubFetch({ active: true, since: null })

    render(<WorkspaceImpersonationNotice />)

    const notice = await screen.findByRole('status')
    expect(notice.textContent).toContain('your workspace')
  })
})
