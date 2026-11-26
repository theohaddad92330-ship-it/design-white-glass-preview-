import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageStyleCreateForm } from './MessageStyleCreateForm'

/**
 * #2204.59-.65 — créer un style SANS import : le formulaire pose l'objet
 * Template (objectif / canal / persona / interdits) par `POST
 * /message-style/templates`. Il naît `draft` — jamais actif d'emblée.
 */
const { mutateAsync, toastSuccess, toastError } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@/features/message-style/hooks/useMessageStyle', () => ({
  useCreateMessageStyleTemplate: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }))
// #2204.65 — la règle de ce qu'un écran peut proposer vit dans `offerableMemoryScopes` ; ici on lui donne son contexte.
const { scopeContext } = vi.hoisted(() => ({
  scopeContext: { units: [] as { id: string; name: string }[] },
}))
vi.mock('@/features/memory/hooks/useMemoryScopeOptions', async () => {
  const { offerableMemoryScopes } = await import('@bellum/contracts')
  return {
    useMemoryScopeOptions: (conversationId?: string | null) =>
      offerableMemoryScopes({ conversationId, businessUnits: scopeContext.units }),
  }
})

async function open() {
  render(<MessageStyleCreateForm />)
  await userEvent.click(screen.getByRole('button', { name: 'Créer un style' }))
}

describe('MessageStyleCreateForm', () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({})
    scopeContext.units = []
    toastSuccess.mockReset()
    toastError.mockReset()
  })

  it('reste fermé tant qu’on ne le demande pas — un seul bouton, aucun champ', () => {
    render(<MessageStyleCreateForm />)
    expect(screen.getByRole('button', { name: 'Créer un style' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Objectif')).not.toBeInTheDocument()
  })

  it('envoie objectif, canal, persona et interdits nettoyés (une ligne = un interdit)', async () => {
    await open()
    await userEvent.type(screen.getByLabelText('Objectif'), '  Relancer un décideur silencieux ')
    await userEvent.type(screen.getByLabelText('Persona'), 'Directeur IT, grand compte')
    await userEvent.type(
      screen.getByLabelText('Interdits (un par ligne)'),
      'jamais de prix{enter}{enter}  jamais de superlatif ',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le style' }))
    expect(mutateAsync).toHaveBeenCalledWith({
      objective: 'Relancer un décideur silencieux',
      channel: 'email',
      persona: 'Directeur IT, grand compte',
      forbidden: ['jamais de prix', 'jamais de superlatif'],
    })
    expect(toastSuccess).toHaveBeenCalled()
    // Refermé après création : le style apparaît dans la liste, pas ici.
    expect(screen.queryByLabelText('Objectif')).not.toBeInTheDocument()
  })

  it('#2204.60/.61/.63 — pitch, ton et signature partent quand ils sont remplis, jamais vides', async () => {
    await open()
    await userEvent.type(screen.getByLabelText('Objectif'), 'Relancer')
    await userEvent.type(screen.getByLabelText('Persona'), 'DSI')
    await userEvent.type(screen.getByLabelText('Pitch (optionnel)'), ' Socle data livré chez un assureur ')
    await userEvent.type(screen.getByLabelText('Ton (optionnel)'), 'Vouvoiement, direct')
    await userEvent.type(screen.getByLabelText('Signature (optionnel)'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le style' }))
    expect(mutateAsync).toHaveBeenCalledWith({
      objective: 'Relancer',
      channel: 'email',
      persona: 'DSI',
      forbidden: [],
      pitch: 'Socle data livré chez un assureur',
      tone: 'Vouvoiement, direct',
    })
  })

  it('#2204.65 — la portée « Moi seul » part comme scope user (par défaut aucune portée : voir les cas exacts ci-dessus)', async () => {
    await open()
    await userEvent.type(screen.getByLabelText('Objectif'), 'Relancer')
    await userEvent.type(screen.getByLabelText('Persona'), 'DSI')
    await userEvent.click(screen.getByRole('combobox', { name: 'Portée' }))
    await userEvent.click(screen.getByRole('option', { name: 'Moi seul' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le style' }))
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ scope: 'user' }))
  })

  // #2204.65 — ÉQUIPE : un périmètre que la personne PORTE ; l'identifiant voyage avec le choix.
  it('#2204.65 — la portée « Mon équipe » envoie le périmètre choisi (scope + businessUnitId)', async () => {
    scopeContext.units = [{ id: '11111111-1111-4111-8111-111111111111', name: 'Agence Lyon' }]
    await open()
    await userEvent.type(screen.getByLabelText('Objectif'), 'Relancer')
    await userEvent.type(screen.getByLabelText('Persona'), 'DSI')
    await userEvent.click(screen.getByRole('combobox', { name: 'Portée' }))
    await userEvent.click(screen.getByRole('option', { name: 'Mon équipe — Agence Lyon' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le style' }))
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'business_unit', businessUnitId: '11111111-1111-4111-8111-111111111111' }),
    )
  })

  it('#2204.65 — deux équipes, deux options : on choisit LA bonne, jamais la première par défaut', async () => {
    scopeContext.units = [
      { id: '11111111-1111-4111-8111-111111111111', name: 'Agence Lyon' },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Agence Lille' },
    ]
    await open()
    await userEvent.type(screen.getByLabelText('Objectif'), 'Relancer')
    await userEvent.type(screen.getByLabelText('Persona'), 'DSI')
    await userEvent.click(screen.getByRole('combobox', { name: 'Portée' }))
    await userEvent.click(screen.getByRole('option', { name: 'Mon équipe — Agence Lille' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le style' }))
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ businessUnitId: '22222222-2222-4222-8222-222222222222' }),
    )
  })

  it('⚠️ SAIT DIRE NON — sans équipe portée, aucune option « Mon équipe » n’est offerte', async () => {
    await open()
    await userEvent.click(screen.getByRole('combobox', { name: 'Portée' }))
    expect(screen.queryByRole('option', { name: /Mon équipe/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Ce fil' })).not.toBeInTheDocument()
  })

  // #2204.65 — FIL : seulement quand le formulaire est monté DANS un fil (le composer d'un contact).
  it('#2204.65 — monté dans un fil, la portée « Ce fil » envoie scope + conversationId', async () => {
    render(<MessageStyleCreateForm conversationId="contact:abc" defaultOpen />)
    await userEvent.type(screen.getByLabelText('Objectif'), 'Relancer')
    await userEvent.type(screen.getByLabelText('Persona'), 'DSI')
    await userEvent.click(screen.getByRole('combobox', { name: 'Portée' }))
    await userEvent.click(screen.getByRole('option', { name: 'Ce fil' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le style' }))
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'conversation', conversationId: 'contact:abc' }),
    )
  })

  it('#2204.65 — `onDone` est appelé après la création (le composer ferme son dialogue)', async () => {
    const onDone = vi.fn()
    render(<MessageStyleCreateForm conversationId="contact:abc" defaultOpen onDone={onDone} />)
    await userEvent.type(screen.getByLabelText('Objectif'), 'Relancer')
    await userEvent.type(screen.getByLabelText('Persona'), 'DSI')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le style' }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('SAIT DIRE NON : sans objectif ou sans persona, rien n’est envoyé', async () => {
    await open()
    const save = screen.getByRole('button', { name: 'Enregistrer le style' })
    expect(save).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Objectif'), 'Relancer')
    expect(save).toBeDisabled()
    await userEvent.click(save)
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('refuse plus de vingt interdits plutôt que de les tronquer en silence', async () => {
    await open()
    await userEvent.type(screen.getByLabelText('Objectif'), 'Relancer')
    await userEvent.type(screen.getByLabelText('Persona'), 'DSI')
    const lines = Array.from({ length: 21 }, (_, i) => `interdit ${i + 1}`).join('\n')
    await userEvent.click(screen.getByLabelText('Interdits (un par ligne)'))
    await userEvent.paste(lines)
    expect(screen.getByRole('button', { name: 'Enregistrer le style' })).toBeDisabled()
    expect(screen.getByText('20 interdits au maximum.')).toBeInTheDocument()
  })

  it('dit l’échec et garde le formulaire ouvert quand le serveur refuse', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('boom'))
    await open()
    await userEvent.type(screen.getByLabelText('Objectif'), 'Relancer')
    await userEvent.type(screen.getByLabelText('Persona'), 'DSI')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le style' }))
    expect(toastError).toHaveBeenCalled()
    expect(screen.getByLabelText('Objectif')).toHaveValue('Relancer')
  })
})
