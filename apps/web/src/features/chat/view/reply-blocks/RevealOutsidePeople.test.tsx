import { cleanup, render as rtlRender, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'
import { RevealOutsidePeople } from './RevealOutsidePeople'

/**
 * #4421.15 / #4421.17 / #4421.18 (décision Louis 25/10) — « Obtenir l'e-mail » sous chaque personne que Laura
 * propose hors de l'espace. Au clic : un appel, puis le suivi de l'enrichissement EXISTANT ; l'adresse révélée
 * remplit le mail préparé, qui reste préparé. Sans les deux droits : bouton ABSENT. En démo : aucun appel.
 */
const permissions = vi.hoisted(() => ({
  current: { status: 'known', permissions: ['contacts:enrich', 'records:write'] } as unknown,
}))
const demo = vi.hoisted(() => ({ current: false }))
const apiFetch = vi.hoisted(() => vi.fn())
const pollEnrichment = vi.hoisted(() => vi.fn())

vi.mock('@/lib/permissions', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/permissions')>()),
  useUserPermissions: () => permissions.current,
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demo.current }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}))
vi.mock('@/features/contacts/api', () => ({
  pollEnrichment: (id: string) => pollEnrichment(id),
  contactKeys: { list: ['contacts', 'list'], byAccount: (id: string) => ['contacts', 'account', id] },
}))

const reveal = {
  siren: '308491101',
  people: [
    { name: 'Inès D.', title: 'Responsable recrutement', person_ref: 'p-ines', mail_to: true },
    { name: 'Paul M.', person_ref: 'p-paul' },
  ],
}
const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

beforeEach(() => {
  permissions.current = { status: 'known', permissions: ['contacts:enrich', 'records:write'] }
  demo.current = false
  apiFetch.mockReset()
  pollEnrichment.mockReset()
})
afterEach(cleanup)

describe('#4421.15 — le bouton « Obtenir l’e-mail »', () => {
  it('un bouton par personne, nommé, cible tactile ≥ 44 px', () => {
    render(<RevealOutsidePeople companyName="SII" reveal={reveal} />)
    const buttons = screen.getAllByRole('button', { name: /Obtenir l’e-mail de/ })
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toHaveAccessibleName('Obtenir l’e-mail de Inès D.')
    expect(buttons[0]?.className).toContain('min-h-11')
    // La référence opaque ne s'affiche jamais.
    expect(screen.queryByText(/p-ines/)).toBeNull()
  })

  it.each([
    ['sans contacts:enrich', ['records:write']],
    ['sans records:write', ['contacts:enrich']],
  ])('bouton ABSENT %s (pas grisé)', (_label, owned) => {
    permissions.current = { status: 'known', permissions: owned }
    render(<RevealOutsidePeople companyName="SII" reveal={reveal} />)
    expect(screen.queryByRole('button', { name: /Obtenir l’e-mail/ })).toBeNull()
    // La personne reste lisible.
    expect(screen.getByText('Inès D.')).toBeTruthy()
  })

  it('droits inconnus (requête en vol) : aucun bouton', () => {
    permissions.current = { status: 'unknown' }
    render(<RevealOutsidePeople companyName="SII" reveal={reveal} />)
    expect(screen.queryByRole('button', { name: /Obtenir l’e-mail/ })).toBeNull()
  })
})

describe('#4421.16 / #4421.17 — le geste', () => {
  it('révèle le nom complet et l’adresse, et remplit le destinataire du mail préparé', async () => {
    apiFetch.mockResolvedValue({ account_id: ACCOUNT, contact_id: 'ct-1', job_id: 'j', state: 'queued' })
    pollEnrichment.mockResolvedValue({ id: 'ct-1', full_name: 'Inès Durand', email: 'ines.durand@sii.fr' })
    render(<RevealOutsidePeople companyName="SII" reveal={reveal} />)

    await userEvent.click(screen.getByRole('button', { name: 'Obtenir l’e-mail de Inès D.' }))

    expect(apiFetch).toHaveBeenCalledWith({
      path: '/outside-people/reveal',
      method: 'POST',
      body: {
        company_name: 'SII',
        siren: '308491101',
        person_ref: 'p-ines',
        name: 'Inès D.',
        title: 'Responsable recrutement',
      },
    })
    expect(pollEnrichment).toHaveBeenCalledWith('ct-1')
    expect(await screen.findByText('Inès Durand')).toBeTruthy()
    expect(screen.getByText('ines.durand@sii.fr')).toBeTruthy()
    expect(screen.getByText(/Destinataire du mail préparé/)).toBeTruthy()
    expect(screen.getByText(/C’est toi qui l’envoies/)).toBeTruthy()
    // Le bouton de cette personne a disparu ; l'autre garde le sien, et réutilise le compte retrouvé.
    expect(screen.queryByRole('button', { name: 'Obtenir l’e-mail de Inès D.' })).toBeNull()
    apiFetch.mockResolvedValue({ account_id: ACCOUNT, contact_id: 'ct-2', job_id: 'j2', state: 'queued' })
    pollEnrichment.mockResolvedValue({ id: 'ct-2', full_name: 'Paul M.', email: null })
    await userEvent.click(screen.getByRole('button', { name: 'Obtenir l’e-mail de Paul M.' }))
    expect(apiFetch.mock.calls[1]?.[0].body).toMatchObject({ account_id: ACCOUNT, person_ref: 'p-paul' })
  })

  it('adresse introuvable : on le dit, rien d’inventé', async () => {
    apiFetch.mockResolvedValue({ account_id: ACCOUNT, contact_id: 'ct-1', job_id: 'j', state: 'queued' })
    pollEnrichment.mockResolvedValue({ id: 'ct-1', full_name: 'Inès D.', email: null })
    render(<RevealOutsidePeople companyName="SII" reveal={reveal} />)
    await userEvent.click(screen.getByRole('button', { name: 'Obtenir l’e-mail de Inès D.' }))
    expect(await screen.findByText(/Adresse introuvable/)).toBeTruthy()
    expect(screen.queryByText(/@/)).toBeNull()
  })

  it('crédits épuisés : frein doux, sans chiffre ni bouton d’achat (#4464)', async () => {
    apiFetch.mockRejectedValue(new ApiError('Crédits insuffisants', 402))
    render(<RevealOutsidePeople companyName="SII" reveal={reveal} />)
    await userEvent.click(screen.getByRole('button', { name: 'Obtenir l’e-mail de Inès D.' }))
    const note = await screen.findByText(/Action en pause/)
    expect(note.textContent).not.toMatch(/\d/)
    expect(screen.queryByRole('link', { name: /crédit|recharg|achat/i })).toBeNull()
  })
})

describe('#4421.18 — démo', () => {
  it('le clic ne fait AUCUN appel : la personne révélée vient du jeu fictif', async () => {
    demo.current = true
    render(
      <RevealOutsidePeople
        companyName="SII"
        reveal={{
          people: [{ name: 'Inès G.', title: 'Responsable recrutement', person_ref: 'demo-sii-ines', mail_to: true }],
        }}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Obtenir l’e-mail de Inès G.' }))
    expect(apiFetch).not.toHaveBeenCalled()
    expect(pollEnrichment).not.toHaveBeenCalled()
    expect(await screen.findByText('Inès Garnier')).toBeTruthy()
    expect(screen.getByText('ines.garnier@exemple.fr')).toBeTruthy()
  })
})

describe('#4421.15 — câblé dans la carte de Laura', () => {
  it('la carte « Comptes où placer » montre le bouton sous la personne hors espace', async () => {
    const { renderWithRouter } = await import('@/test-utils/renderWithRouter')
    const { StructuredReply } = await import('../StructuredReply')
    const block = {
      type: 'account_ranking',
      title: 'Comptes où placer Camille Roussel',
      axes: ['Compétences de la fiche demandées sur la zone'],
      items: [{ name: 'SII', why: ['SII publie 10 offres sur le 69.'], reveal }],
    }
    renderWithRouter(<StructuredReply text={['```bellum-block', JSON.stringify(block), '```'].join('\n')} />)
    expect(await screen.findByRole('button', { name: 'Obtenir l’e-mail de Inès D.' })).toBeTruthy()
  })
})
