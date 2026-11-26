import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OUTREACH_MARKET_MEMORY_SOURCE_PREFIX } from '@bellum/contracts'
import { i18n } from '@/i18n'

/**
 * #3419.1 — les variables d'une version de message : valeur, source, date,
 * confiance, autorisation d'usage externe. Annotation déclarée par le relecteur.
 */
const variables = vi.fn()
const setVariable = vi.fn()
vi.mock('../api', () => ({
  outreachKeys: { all: ['outreach'] },
  outreachMessagesApi: {
    variables: (...a: unknown[]) => variables(...a),
    setVariable: (...a: unknown[]) => setVariable(...a),
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { MessageVariables } from './MessageVariables'

const MESSAGE = '99999999-9999-4999-8999-999999999999'
const ROW = {
  id: 'var-1',
  message_id: MESSAGE,
  version: 2,
  name: 'Technologie data',
  value: 'Snowflake',
  source: 'Site client',
  as_of: '2026-09-12',
  confidence: 'unverified',
  external_use: 'unknown',
  declared_by: 'u-1',
  declared_at: '2026-10-04T09:00:00Z',
}

function renderIt(canWrite = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MessageVariables messageId={MESSAGE} canWrite={canWrite} />
    </QueryClientProvider>,
  )
}

describe('MessageVariables — #3419.1', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    variables.mockReset()
    setVariable.mockReset()
    variables.mockResolvedValue([ROW])
  })

  it('chaque variable dit sa valeur, sa source, sa date, sa confiance et son usage externe', async () => {
    renderIt()
    const row = await screen.findByText('Technologie data')
    const item = row.closest('li')!
    expect(item.textContent).toContain('Snowflake')
    expect(item.textContent).toContain('Site client')
    expect(item.textContent).toContain('Non vérifiée')
    expect(item.textContent).toContain('Usage externe non établi')
  })

  // #4074 (Louis 17/10/2026) — le préfixe persisté reste en base (donnée), mais ne se rend JAMAIS à l'écran.
  it('une source « Mémoire marché : … » se rend par sa nature, jamais avec le préfixe persisté', async () => {
    variables.mockResolvedValue([
      { ...ROW, source: `${OUTREACH_MARKET_MEMORY_SOURCE_PREFIX}tendance-cloud-banque-2026` },
    ])
    renderIt()
    const item = (await screen.findByText('Technologie data')).closest('li')!
    expect(item.textContent).not.toMatch(/mémoire\s+march/i)
    expect(item.textContent).toContain('Observé sur le marché')
    expect(item.textContent).toContain('tendance-cloud-banque-2026')
  })

  it('« inconnu » n’est jamais lu comme autorisé : le relecteur est averti', async () => {
    renderIt()
    expect(await screen.findByText(/à ne pas citer à l’extérieur/)).toBeInTheDocument()
  })

  it('aucune variable : un texte qui nomme le geste, pas de liste vide', async () => {
    variables.mockResolvedValue([])
    renderIt()
    expect(await screen.findByText(/Aucune variable annotée/)).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  // #2947 — recette 04/10 : la lecture en échec laissait le panneau sur un formulaire
  // seul, indiscernable de « non semé ». L'échec se dit, la lecture se rejoue.
  it('lecture en échec : le panneau le dit, jamais un formulaire muet', async () => {
    variables.mockRejectedValue(new Error('Token invalide ou expiré'))
    renderIt()
    expect(await screen.findByText(/Je n’ai pas pu lire les variables/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucune variable annotée/)).toBeNull()
  })

  it('sans droit d’écriture, ni formulaire ni bouton — la lecture reste', async () => {
    renderIt(false)
    await screen.findByText('Technologie data')
    expect(screen.queryByRole('button', { name: 'Annoter' })).toBeNull()
  })

  it('le geste envoie les cinq attributs, sans valeur par défaut devinée', async () => {
    setVariable.mockResolvedValue(ROW)
    const u = userEvent.setup()
    variables.mockResolvedValue([])
    renderIt()
    await screen.findByText(/Aucune variable annotée/)
    const submit = screen.getByRole('button', { name: 'Annoter' })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Variable'), { target: { value: 'Technologie data' } })
    fireEvent.change(screen.getByLabelText('Valeur'), { target: { value: 'Snowflake' } })
    fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Site client' } })
    fireEvent.change(screen.getByLabelText('Date du fait'), { target: { value: '2026-09-12' } })
    await u.click(screen.getByRole('combobox', { name: 'Confiance' }))
    await u.click(screen.getByRole('option', { name: 'Confirmée' }))
    expect(submit).toBeDisabled()
    await u.click(screen.getByRole('combobox', { name: 'Usage externe' }))
    await u.click(screen.getByRole('option', { name: 'Autorisé' }))
    expect(submit).not.toBeDisabled()
    await u.click(submit)

    await waitFor(() => expect(setVariable).toHaveBeenCalled())
    expect(setVariable).toHaveBeenCalledWith(MESSAGE, {
      name: 'Technologie data',
      value: 'Snowflake',
      source: 'Site client',
      as_of: '2026-09-12',
      confidence: 'confirmed',
      external_use: 'allowed',
    })
  })

  // #2877 / #3419.4 — « la mémoire marché ne produit jamais seule une
  // affirmation nominative » : cochée, la case préfixe la source ENVOYÉE
  // (même mécanisme que la source documentaire, #3752.7) et retire « Autorisé »
  // des choix d'usage externe — le NO-GO se voit avant même d'essayer d'envoyer.
  describe('mémoire marché — #2877 / #3419.4', () => {
    it('préfixe la source envoyée quand la case est cochée', async () => {
      setVariable.mockResolvedValue(ROW)
      const u = userEvent.setup()
      variables.mockResolvedValue([])
      renderIt()
      await screen.findByText(/Aucune variable annotée/)

      await u.click(screen.getByRole('checkbox', { name: 'Observations du marché' }))
      fireEvent.change(screen.getByLabelText('Variable'), { target: { value: 'Ancien poste' } })
      fireEvent.change(screen.getByLabelText('Valeur'), { target: { value: 'A quitté son poste de DSI' } })
      fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'obs-1' } })
      fireEvent.change(screen.getByLabelText('Date du fait'), { target: { value: '2026-09-12' } })
      await u.click(screen.getByRole('combobox', { name: 'Confiance' }))
      await u.click(screen.getByRole('option', { name: 'Probable' }))
      await u.click(screen.getByRole('combobox', { name: 'Usage externe' }))
      await u.click(screen.getByRole('option', { name: 'Interdit' }))
      await u.click(screen.getByRole('button', { name: 'Annoter' }))

      await waitFor(() => expect(setVariable).toHaveBeenCalled())
      expect(setVariable).toHaveBeenCalledWith(
        MESSAGE,
        expect.objectContaining({ source: 'Mémoire marché : obs-1', external_use: 'forbidden' }),
      )
    })

    it('retire « Autorisé » des choix d’usage externe une fois la case cochée', async () => {
      const u = userEvent.setup()
      variables.mockResolvedValue([])
      renderIt()
      await screen.findByText(/Aucune variable annotée/)

      await u.click(screen.getByRole('checkbox', { name: 'Observations du marché' }))
      await u.click(screen.getByRole('combobox', { name: 'Usage externe' }))
      expect(screen.queryByRole('option', { name: 'Autorisé' })).toBeNull()
      expect(screen.getByRole('option', { name: 'Interdit' })).toBeInTheDocument()
    })

    it('décocher la case retrouve une source libre, sans préfixe', async () => {
      setVariable.mockResolvedValue(ROW)
      const u = userEvent.setup()
      variables.mockResolvedValue([])
      renderIt()
      await screen.findByText(/Aucune variable annotée/)

      await u.click(screen.getByRole('checkbox', { name: 'Observations du marché' }))
      await u.click(screen.getByRole('checkbox', { name: 'Observations du marché' }))
      fireEvent.change(screen.getByLabelText('Variable'), { target: { value: 'Technologie data' } })
      fireEvent.change(screen.getByLabelText('Valeur'), { target: { value: 'Snowflake' } })
      fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Site client' } })
      fireEvent.change(screen.getByLabelText('Date du fait'), { target: { value: '2026-09-12' } })
      await u.click(screen.getByRole('combobox', { name: 'Confiance' }))
      await u.click(screen.getByRole('option', { name: 'Confirmée' }))
      await u.click(screen.getByRole('combobox', { name: 'Usage externe' }))
      await u.click(screen.getByRole('option', { name: 'Autorisé' }))
      await u.click(screen.getByRole('button', { name: 'Annoter' }))

      await waitFor(() => expect(setVariable).toHaveBeenCalled())
      expect(setVariable).toHaveBeenCalledWith(
        MESSAGE,
        expect.objectContaining({ source: 'Site client', external_use: 'allowed' }),
      )
    })
  })
})
