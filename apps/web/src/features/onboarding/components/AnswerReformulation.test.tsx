import { useState } from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AnswerReformulation } from './AnswerReformulation'

/**
 * #2060.9 — « Laura reformule, l'utilisateur valide avant enregistrement ».
 *
 * DÉCISION Louis (18/09/2026, QCM) : un VRAI appel au modèle, sur un geste
 * EXPLICITE. Ce fichier prouve les cinq règles fermes :
 *
 * 1. jamais un appel à la frappe ni à la sortie du champ — seulement au clic ;
 * 2. les DEUX versions s'affichent, l'utilisateur choisit ;
 * 3. « Garder ma version » enregistre l'ORIGINALE (n'appelle jamais `onApply`) ;
 * 4. un échec du modèle → message clair, réponse d'origine intacte, jamais
 *    une reformulation inventée ;
 * 5. aucun coût annoncé (onboarding gratuit de bout en bout, #2084.40-.45).
 */

const mockReformulate = vi.fn()

vi.mock('@/features/onboarding/api', () => ({
  onboardingApi: { reformulateAnswer: (...args: unknown[]) => mockReformulate(...args) },
}))

const onApply = vi.fn()

beforeEach(() => {
  mockReformulate.mockReset()
  onApply.mockReset()
})

async function render(value: string): Promise<void> {
  renderWithRouter(
    <>
      <AnswerReformulation questionLabel="Quel est ton principal frein commercial ?" value={value} onApply={onApply} />
      <div data-testid="sentinel" />
    </>,
  )
  await screen.findByTestId('sentinel')
}

describe('#2060.9 — geste explicite, jamais automatique', () => {
  it("n'affiche pas le bouton sur une réponse vide", async () => {
    await render('')
    expect(screen.queryByRole('button', { name: 'Reformuler avec Laura' })).toBeNull()
  })

  it("n'appelle jamais l'IA tant qu'on ne clique pas", async () => {
    await render('pas trop le temps de prospecter')
    expect(mockReformulate).not.toHaveBeenCalled()
  })

  it('appelle l’IA uniquement au clic, avec la question et la réponse SEULES', async () => {
    mockReformulate.mockResolvedValue({ reformulated: 'Le manque de temps freine la prospection.' })
    await render('pas trop le temps de prospecter')
    fireEvent.click(screen.getByRole('button', { name: 'Reformuler avec Laura' }))
    await waitFor(() => expect(mockReformulate).toHaveBeenCalledTimes(1))
    expect(mockReformulate).toHaveBeenCalledWith({
      questionLabel: 'Quel est ton principal frein commercial ?',
      answerText: 'pas trop le temps de prospecter',
      locale: 'fr',
    })
  })

  it("n'annonce aucun coût — l'onboarding est gratuit de bout en bout", async () => {
    await render('pas trop le temps de prospecter')
    expect(screen.queryByText(/crédit/i)).toBeNull()
  })
})

describe('#2060.9 — les deux versions, et le choix', () => {
  it('affiche les deux versions après la reformulation', async () => {
    mockReformulate.mockResolvedValue({ reformulated: 'Le manque de temps freine la prospection.' })
    await render('pas trop le temps de prospecter')
    fireEvent.click(screen.getByRole('button', { name: 'Reformuler avec Laura' }))
    await screen.findByText('Le manque de temps freine la prospection.')
    expect(screen.getByRole('button', { name: 'Utiliser cette version' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Garder ma version' })).toBeInTheDocument()
  })

  it('« Utiliser cette version » applique la reformulation', async () => {
    mockReformulate.mockResolvedValue({ reformulated: 'Le manque de temps freine la prospection.' })
    await render('pas trop le temps de prospecter')
    fireEvent.click(screen.getByRole('button', { name: 'Reformuler avec Laura' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser cette version' }))
    expect(onApply).toHaveBeenCalledWith('Le manque de temps freine la prospection.')
  })

  it('« Garder ma version » n’appelle JAMAIS onApply — l’originale reste', async () => {
    mockReformulate.mockResolvedValue({ reformulated: 'Le manque de temps freine la prospection.' })
    await render('pas trop le temps de prospecter')
    fireEvent.click(screen.getByRole('button', { name: 'Reformuler avec Laura' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Garder ma version' }))
    expect(onApply).not.toHaveBeenCalled()
    // Le bouton réapparaît, prêt pour un nouveau geste — rien n'est figé.
    expect(screen.getByRole('button', { name: 'Reformuler avec Laura' })).toBeInTheDocument()
  })
})

describe('#2060.9 — échec du modèle', () => {
  it("un échec affiche un message clair et n'appelle jamais onApply", async () => {
    mockReformulate.mockRejectedValue(new Error('reformulation_unavailable'))
    await render('pas trop le temps de prospecter')
    fireEvent.click(screen.getByRole('button', { name: 'Reformuler avec Laura' }))
    await screen.findByRole('alert')
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Utiliser cette version' })).toBeNull()
  })

  it('éditer la réponse après un échec efface le message — il ne mentirait plus sur le texte actuel', async () => {
    mockReformulate.mockRejectedValue(new Error('reformulation_unavailable'))
    // Un harnais qui possède `value` lui-même : la mise à jour se fait par un
    // ré-rendu INTERNE au même arbre React (donc dans le même
    // QueryClientProvider), comme le ferait vraiment `QuestionField` quand
    // l'utilisateur tape.
    function EditableHarness() {
      const [value, setValue] = useState('pas trop le temps')
      return (
        <>
          <AnswerReformulation questionLabel="Question ?" value={value} onApply={onApply} />
          <button type="button" onClick={() => setValue('pas trop le temps de prospecter')}>
            edit
          </button>
          <div data-testid="sentinel" />
        </>
      )
    }
    renderWithRouter(<EditableHarness />)
    await screen.findByTestId('sentinel')
    fireEvent.click(screen.getByRole('button', { name: 'Reformuler avec Laura' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'edit' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
