import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseOption, getSelect, optionLabels } from '@/test/select'
import { TaskComposer } from './TaskComposer'

const members = vi.fn()

vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => members(),
}))

function renderComposer(onSubmit = vi.fn(), extraProps: Partial<Parameters<typeof TaskComposer>[0]> = {}) {
  render(<TaskComposer open onOpenChange={vi.fn()} onSubmit={onSubmit} isPending={false} {...extraProps} />)
  return { onSubmit }
}

describe('TaskComposer', () => {
  beforeEach(() => {
    members.mockReturnValue({ data: [] })
  })

  // #2395.8 (épopée #2871), seconde moitié — « à quoi ressemble fait ? »,
  // distinct de `details`, requis au même titre que l'objectif.
  it('porte un champ résultat attendu, requis', () => {
    const { onSubmit } = renderComposer()
    fireEvent.change(screen.getByLabelText('Intitulé'), { target: { value: 'Rappeler le DSI' } })
    fireEvent.change(screen.getByLabelText('Objectif (obligatoire)'), { target: { value: 'Obtenir une décision' } })
    fireEvent.change(screen.getByLabelText('Résultat attendu (obligatoire)'), { target: { value: 'RDV pris' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ expectedResult: 'RDV pris' }))
  })

  // #2395.8, seconde moitié — le pendant exact du test objectif ci-dessous.
  it('REFUSE de créer sans résultat attendu — le bouton reste inactif', () => {
    const { onSubmit } = renderComposer()
    fireEvent.change(screen.getByLabelText('Intitulé'), { target: { value: 'Rappeler le DSI' } })
    fireEvent.change(screen.getByLabelText('Objectif (obligatoire)'), { target: { value: 'Obtenir une décision' } })
    expect(screen.getByRole('button', { name: 'Créer' })).toBeDisabled()
    // #2395.8 — le bouton inactif NOMME ce qui manque.
    expect(screen.getByTestId('task-composer-missing').textContent).toContain('le résultat attendu')
    expect(screen.getByTestId('task-composer-missing').textContent).not.toContain('l’objectif')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // #2395.8 (épopée #2871) — requis : le bouton reste inactif sans objectif.
  it('REFUSE de créer sans objectif — le bouton reste inactif', () => {
    const { onSubmit } = renderComposer()
    fireEvent.change(screen.getByLabelText('Intitulé'), { target: { value: 'Rappeler le DSI' } })
    fireEvent.change(screen.getByLabelText('Résultat attendu (obligatoire)'), { target: { value: 'RDV pris' } })
    expect(screen.getByRole('button', { name: 'Créer' })).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('envoie l’objectif saisi', () => {
    const { onSubmit } = renderComposer()
    fireEvent.change(screen.getByLabelText('Intitulé'), { target: { value: 'Rappeler le DSI' } })
    fireEvent.change(screen.getByLabelText('Objectif (obligatoire)'), { target: { value: 'Obtenir une décision' } })
    fireEvent.change(screen.getByLabelText('Résultat attendu (obligatoire)'), { target: { value: 'RDV pris' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ objective: 'Obtenir une décision' }))
  })

  // #2105.26 — absent = à celui qui crée, jamais deviné autrement.
  it('n’envoie pas de propriétaire quand rien n’est choisi — « Moi » par défaut', () => {
    members.mockReturnValue({
      data: [{ userId: 'u2', email: 'maelle@esn.fr', fullName: 'Maëlle Dupont', role: 'member', isSelf: false }],
    })
    const { onSubmit } = renderComposer()
    fireEvent.change(screen.getByLabelText('Intitulé'), { target: { value: 'Rappeler le DSI' } })
    fireEvent.change(screen.getByLabelText('Objectif (obligatoire)'), { target: { value: 'Obtenir une décision' } })
    fireEvent.change(screen.getByLabelText('Résultat attendu (obligatoire)'), { target: { value: 'RDV pris' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ ownerId: undefined }))
  })

  it('propose les membres réels de l’espace pour « qui s’en occupe »', async () => {
    members.mockReturnValue({
      data: [{ userId: 'u2', email: 'maelle@esn.fr', fullName: 'Maëlle Dupont', role: 'member', isSelf: false }],
    })
    renderComposer()
    const labels = await optionLabels(getSelect('Qui s’en occupe'))
    expect(labels).toContain('Maëlle Dupont')
  })

  it('envoie le membre choisi comme propriétaire', async () => {
    members.mockReturnValue({
      data: [{ userId: 'u2', email: 'maelle@esn.fr', fullName: 'Maëlle Dupont', role: 'member', isSelf: false }],
    })
    const { onSubmit } = renderComposer()
    await chooseOption(getSelect('Qui s’en occupe'), 'Maëlle Dupont')
    fireEvent.change(screen.getByLabelText('Intitulé'), { target: { value: 'Rappeler le DSI' } })
    fireEvent.change(screen.getByLabelText('Objectif (obligatoire)'), { target: { value: 'Obtenir une décision' } })
    fireEvent.change(screen.getByLabelText('Résultat attendu (obligatoire)'), { target: { value: 'RDV pris' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'u2' }))
  })
})

// #2105.24/.25 — le CTA « Transformer ce sujet en prochaine action » ouvre CE
// composeur avec l'OBJET déjà écrit : la personne n'a pas à retaper le sujet
// qu'elle vient de lire sur la carte de priorité.
describe('TaskComposer — objet pré-rempli (#2105.25)', () => {
  it('pré-remplit l’intitulé quand un objet est passé, et reste modifiable', () => {
    const { onSubmit } = renderComposer(vi.fn(), { initialTitle: 'Relancer Jean (ACME) — silence 9 j' })
    expect(screen.getByLabelText('Intitulé')).toHaveValue('Relancer Jean (ACME) — silence 9 j')
    fireEvent.change(screen.getByLabelText('Objectif (obligatoire)'), { target: { value: 'Obtenir une décision' } })
    fireEvent.change(screen.getByLabelText('Résultat attendu (obligatoire)'), { target: { value: 'RDV pris' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Relancer Jean (ACME) — silence 9 j' }))
  })

  it('sans objet passé, l’intitulé reste vide comme avant', () => {
    renderComposer()
    expect(screen.getByLabelText('Intitulé')).toHaveValue('')
  })
})
