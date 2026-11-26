import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BackgroundTasksSheet } from './BackgroundTasksSheet'
import type { DisplayTask } from './types'

const { cancel } = vi.hoisted(() => ({ cancel: vi.fn() }))
vi.mock('@/features/accounts/hooks/useCancelAnalysis', () => ({
  useCancelAnalysis: () => ({ mutate: cancel, isPending: false }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: React.ReactNode; to: string; params?: { id: string } }) => (
    <a href={params ? to.replace('$id', params.id) : to}>{children}</a>
  ),
}))

function task(overrides: Partial<DisplayTask>): DisplayTask {
  return {
    key: 'k',
    title: 'Analyse de Société Générale',
    label: 'SG',
    loaderVariant: 'orbit',
    status: 'running',
    sourceId: 's',
    source: 'analysis',
    startedAt: 0,
    ...overrides,
  }
}

/** THEO-REFONTE-COMPOSANTS — « Ce qui tourne » (MAQ-SHELL `#lay-tasks`) dans le tiroir commun Théo. */
describe('BackgroundTasksSheet — la forme des maquettes', () => {
  it('nomme le tiroir « Ce qui tourne », range Échecs → Analyses → Sauvegardes, et dit l’état en badge', () => {
    render(
      <BackgroundTasksSheet
        open
        onOpenChange={() => {}}
        dismiss={() => {}}
        entries={[
          task({ key: 'save', title: 'Sauvegarde du plan', source: 'task', status: 'completed' }),
          task({ key: 'run', stepLabel: 'Étape 2 sur 4 terminée' }),
          task({ key: 'ko', title: 'Analyse de BPCE', status: 'error' }),
        ]}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Ce qui tourne' })
    const headings = within(dialog)
      .getAllByRole('heading', { level: 3 })
      .map(node => node.textContent)
    expect(headings).toEqual(['Erreurs', 'Analyses', 'Sauvegardes'])
    expect(
      within(dialog)
        .getAllByTestId('task-status')
        .map(node => node.textContent),
    ).toEqual(['Échec', 'En cours', 'Terminé'])
    expect(within(dialog).getByText('Étape 2 sur 4 terminée')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Fermer' })).toBeInTheDocument()
  })

  it('MAQ-SHELL #lay-tasks — une analyse en cours se suit ou s’annule depuis sa carte', () => {
    render(
      <BackgroundTasksSheet
        open
        onOpenChange={() => {}}
        dismiss={() => {}}
        entries={[
          task({ key: 'run', accountId: 'acc-1' }),
          task({ key: 'done', status: 'completed', accountId: 'acc-2' }),
        ]}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Ce qui tourne' })
    expect(within(dialog).getAllByRole('link', { name: 'Voir ce qui est déjà trouvé' })).toHaveLength(1)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler l’analyse' }))
    expect(cancel).toHaveBeenCalledWith('acc-1')
  })

  /**
   * #4541 — la barre « En cours · Analyse de … · Revenir au dossier » est retirée (Louis 25/10) : ce
   * tiroir est désormais LE chemin qui ramène au compte analysé. La garde lit la destination, pas
   * seulement la présence d'un lien.
   */
  it('#4541 — « Voir ce qui est déjà trouvé » mène au compte ANALYSÉ, pas à un compte quelconque', () => {
    render(
      <BackgroundTasksSheet
        open
        onOpenChange={() => {}}
        dismiss={() => {}}
        entries={[task({ key: 'run', accountId: 'acc-42' })]}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Ce qui tourne' })
    expect(within(dialog).getByRole('link', { name: 'Voir ce qui est déjà trouvé' })).toHaveAttribute(
      'href',
      '/accounts/acc-42',
    )
  })
})
