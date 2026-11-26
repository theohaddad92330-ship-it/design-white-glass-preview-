import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { duplicates } = vi.hoisted(() => ({ duplicates: vi.fn() }))
vi.mock('../talent-api', () => ({ useTalentDuplicates: () => ({ data: duplicates() }) }))
vi.mock('./CvDropZone', () => ({
  CvDropZone: ({ startInPaste }: { startInPaste?: boolean }) => (
    <div>{startInPaste ? 'zone de collage' : 'zone de dépôt'}</div>
  ),
}))
vi.mock('./LinkedinLookup', () => ({ LinkedinLookup: () => <div>recherche de profil public</div> }))
vi.mock('./VivierIoMenus', () => ({ VivierImportMenu: () => <button type="button">Importer</button> }))

const { VivierAddDialog } = await import('./VivierAddDialog')

beforeEach(() => duplicates.mockReturnValue([]))
afterEach(cleanup)

function draw(over: Partial<React.ComponentProps<typeof VivierAddDialog>> = {}) {
  const props = {
    open: true,
    saving: false,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    onCvIntake: vi.fn(),
    ...over,
  }
  render(<VivierAddDialog {...props} />)
  return props
}

/**
 * Théo C talents-vivier.R6 / N5 / A1 / A2 — « Ajouter un profil » à trois portes.
 */
describe('VivierAddDialog — trois portes, un seul dossier (talents-vivier.R6)', () => {
  it('propose les trois entrées de Théo, la première ouverte', () => {
    draw()
    expect(screen.getByText('Trois entrées, un seul dossier à retrouver.')).toBeInTheDocument()
    for (const door of ['Saisir l’essentiel', 'Préparer avec Laura', 'Importer ou reprendre un outil']) {
      expect(screen.getByRole('button', { name: new RegExp(door) })).toBeInTheDocument()
    }
    expect(screen.getByLabelText('Nom ou pseudonyme du profil')).toBeInTheDocument()
  })

  it('n’enregistre rien sans nom ; avec un nom, envoie les cinq champs et l’intention', () => {
    const props = draw()
    const save = screen.getByRole('button', { name: 'Enregistrer' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Nom ou pseudonyme du profil'), { target: { value: 'Nadia Benali' } })
    fireEvent.change(screen.getByLabelText('Métier / intitulé'), { target: { value: 'Data engineer' } })
    fireEvent.change(screen.getByLabelText('Compétences · séparées par des virgules'), {
      target: { value: 'Spark, dbt, Python' },
    })
    fireEvent.change(screen.getByLabelText('Localisation'), { target: { value: 'Lille' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et rapprocher' }))
    expect(props.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: 'Nadia Benali',
        title: 'Data engineer',
        stack: 'Spark, dbt, Python',
        zones: 'Lille',
        // « Salarié·e » est la relation par défaut : la nature (droit) et l'engagement (commerce) se posent ensemble.
        kind: 'consultant',
        engagement_kind: 'salarie',
      }),
      { match: true },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(props.onSubmit).toHaveBeenLastCalledWith(expect.anything(), { match: false })
  })

  it('A10 — la recherche d’un profil public reste à la création, derrière un bouton', () => {
    draw()
    expect(screen.queryByText('recherche de profil public')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /profil LinkedIn|profil public/i }))
    expect(screen.getByText('recherche de profil public')).toBeInTheDocument()
  })

  it('un homonyme probable est NOMMÉ et bloque l’enregistrement — jusqu’à un clic « pas la même personne »', () => {
    duplicates.mockReturnValue([
      { talentId: 't1', fullName: 'Camille Roussel', reason: 'same_name_employer', confidence: 0.93 },
    ])
    const props = draw({ initialFullName: 'Camille Rousel' })
    expect(screen.getByText('Ce profil ressemble à Camille Roussel')).toBeInTheDocument()
    expect(screen.getByText(/Rien n’est fusionné sans toi/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Ce n’est pas la même personne' }))
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(props.onSubmit).toHaveBeenCalledTimes(1)
  })

  it('« Préparer avec Laura » ouvre directement la zone de collage ; « Importer » la zone de dépôt et les imports', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: /Préparer avec Laura/ }))
    expect(screen.getByText('zone de collage')).toBeInTheDocument()
    expect(screen.getByText(/Laura propose une fiche ; tu la relis/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Importer ou reprendre un outil/ }))
    expect(screen.getByText('zone de dépôt')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importer' })).toBeInTheDocument()
  })
})
