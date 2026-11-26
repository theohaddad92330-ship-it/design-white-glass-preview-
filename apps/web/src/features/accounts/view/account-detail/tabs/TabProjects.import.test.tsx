import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Account, ProjectRow } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabProjects } from './TabProjects'

/**
 * #1889 — LA PORTE VERS L'IMPORT, et pourquoi elle n'existait pas avant.
 *
 * Le retour demandait « pouvoir filtrer, chercher, IMPORTER des projets ». Les
 * deux premiers ont été livrés ; le troisième ne pouvait pas l'être : l'
 * assistant d'import SAVAIT recevoir des projets (source déclarée, alias de
 * colonnes, champs requis) et son `apply` les refusait par leur nom — « la
 * reprise des project se simule mais ne s'écrit pas encore ». Y renvoyer aurait
 * promis un import qui n'écrit rien, ce qui est pire que l'absence de porte :
 * la déception arrive au BOUT du parcours, après le fichier et le rapport.
 *
 * L'écriture est branchée depuis ce lot (`ImportWriterService.writeProjects`),
 * et la porte s'ouvre avec elle. Cette garde tient le lien dans les deux sens :
 * elle tomberait si la porte disparaissait, et elle est la raison de relire ce
 * docblock si quelqu'un voulait la poser sans l'écriture.
 */

const mockFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => mockFetch(...args) }))

const ACCOUNT = { id: 'acc-1', company_name: 'Société Générale' } as Account

const ROW = {
  id: 'p-1',
  account_id: 'acc-1',
  kind: 'imported',
  label: 'Refonte du socle data',
  stage: 'detected',
} as ProjectRow

function monter(rows: ProjectRow[]) {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue(rows)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  renderWithRouter(
    <QueryClientProvider client={client}>
      <TabProjects account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('#1889 — reprendre des projets depuis un fichier', () => {
  it('la barre d’outils porte la porte vers l’écran d’import', async () => {
    monter([ROW])
    const lien = await screen.findByRole('link', { name: 'Importer' })
    expect(lien).toHaveAttribute('href', '/settings/mes-donnees?tab=imports')
  })

  it('un compte SANS aucun projet la porte aussi — c’est là qu’elle sert le plus', async () => {
    monter([])
    const lien = await screen.findByRole('link', { name: 'Reprendre des projets depuis un fichier' })
    expect(lien).toHaveAttribute('href', '/settings/mes-donnees?tab=imports')
  })

  it('⚠️ la porte du vide ne REMPLACE pas celle du pipe — les deux gestes coexistent', async () => {
    // Un compte vide a deux suites possibles : reprendre un fichier, ou aller
    // voir ce que l'analyse a détecté ailleurs. Remplacer l'une par l'autre
    // ferait croire que l'import est le seul chemin vers un projet.
    monter([])
    expect(await screen.findByRole('link', { name: 'Ouvrir le pipe' })).toBeInTheDocument()
  })

  it('rend la nature « reprise d’un fichier » avec un LIBELLÉ, jamais sa clé technique', async () => {
    // `imported` est la sixième nature. Sans sa traduction, le tableau
    // afficherait la clé brute — le motif « libellé français dans un contrat »
    // à l'envers.
    monter([ROW])
    expect(await screen.findByText('Repris d’un fichier')).toBeInTheDocument()
  })
})
