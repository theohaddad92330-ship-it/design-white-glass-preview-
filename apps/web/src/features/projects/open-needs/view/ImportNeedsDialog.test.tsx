import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * L'IMPORT EN MASSE DE FICHES DE POSTE (#2173.56).
 *
 * ⚠️ Ce que ce fichier garde : un fichier illisible AU MILIEU du lot ne bloque
 * pas les autres (règle 1), rien n'est créé avant le clic de validation
 * (règle 2), et le lot NOMME chaque ligne — jamais un succès global. `apiFetch`
 * et `rfpApi.create` sont mockés au même niveau que les appels réels : un mock
 * plus haut (les hooks) prouverait le câblage, pas que l'appel PART.
 */

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (args: unknown) => apiFetch(args) }))

const rfpCreate = vi.fn()
vi.mock('@/features/rfp/api', () => ({ rfpApi: { create: (args: unknown) => rfpCreate(args) } }))

vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: {
      pages: [
        {
          data: [
            { id: 'a-1', company_name: 'TF1' },
            { id: 'a-2', company_name: 'Decathlon' },
          ],
        },
      ],
    },
  }),
}))

const { ImportNeedsDialog } = await import('./ImportNeedsDialog')

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

function file(name: string) {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' })
}

async function pickAccountAndFiles(u: ReturnType<typeof userEvent.setup>, files: File[]) {
  await u.click(screen.getByRole('combobox', { name: 'Compte client' }))
  await u.click(await screen.findByRole('option', { name: 'TF1' }))
  const input = screen.getByLabelText('Choisir des fichiers')
  fireEvent.change(input, { target: { files } })
}

beforeEach(() => {
  apiFetch.mockReset()
  rfpCreate.mockReset()
  apiFetch.mockImplementation(async ({ path }: { path: string }) => {
    if (path.startsWith('/projects/needs?')) return { data: [], pagination: { totalItems: 0 } }
    return { id: 'n-created' }
  })
  rfpCreate.mockImplementation(async ({ title }: { title: string }) => ({
    rfp: { id: `rfp-${title}`, requirements: [{ id: 'r-1', section: '§2', text: 'React', kind: 'technical' }] },
  }))
})

const user = () => userEvent.setup()

describe('ImportNeedsDialog — le dépôt de PLUSIEURS fiches de poste d’un coup', () => {
  it('3 fichiers déposés → 3 extractions → 3 besoins prévisualisés', async () => {
    const u = user()
    wrap(<ImportNeedsDialog open onOpenChange={vi.fn()} />)

    await pickAccountAndFiles(u, [file('Architecte cloud.pdf'), file('Dev PHP.pdf'), file('Data engineer.pdf')])
    await u.click(screen.getByRole('button', { name: 'Extraire' }))

    await waitFor(() => expect(rfpCreate).toHaveBeenCalledTimes(3))
    expect(await screen.findByDisplayValue('Architecte cloud')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Dev PHP')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Data engineer')).toBeInTheDocument()

    // Rien n'est créé sans validation (règle 2) : la seule extraction n'a
    // appelé AUCUNE création de besoin.
    expect(apiFetch).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/projects/needs', method: 'POST' }))
  })

  it('un échec AU MILIEU du lot est NOMMÉ — les deux autres restent créables', async () => {
    rfpCreate.mockImplementation(async ({ title, fileName }: { title: string; fileName: string }) => {
      if (fileName === 'Dev PHP.pdf') throw new Error('Je n’ai pas pu lire ce document.')
      return { rfp: { id: `rfp-${title}`, requirements: [] } }
    })
    const u = user()
    wrap(<ImportNeedsDialog open onOpenChange={vi.fn()} />)

    await pickAccountAndFiles(u, [file('Architecte cloud.pdf'), file('Dev PHP.pdf'), file('Data engineer.pdf')])
    await u.click(screen.getByRole('button', { name: 'Extraire' }))

    // Le fichier en échec est NOMMÉ avec SA raison — jamais un succès global.
    expect(await screen.findByText('Je n’ai pas pu lire ce document.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Architecte cloud')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Data engineer')).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: /Créer 2 besoins/ }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/projects/needs',
          method: 'POST',
          body: expect.objectContaining({ title: 'Architecte cloud' }),
        }),
      ),
    )
    const createCalls = apiFetch.mock.calls.filter(
      ([args]) => args.path === '/projects/needs' && args.method === 'POST',
    )
    expect(createCalls).toHaveLength(2)
  })

  it('ne crée QUE les lignes cochées, jamais celles décochées avant validation', async () => {
    const u = user()
    wrap(<ImportNeedsDialog open onOpenChange={vi.fn()} />)

    await pickAccountAndFiles(u, [file('Architecte cloud.pdf'), file('Dev PHP.pdf')])
    await u.click(screen.getByRole('button', { name: 'Extraire' }))
    await waitFor(() => expect(rfpCreate).toHaveBeenCalledTimes(2))

    await u.click(screen.getByRole('checkbox', { name: /Dev PHP/ }))
    await u.click(screen.getByRole('button', { name: /Créer 1 besoin/ }))

    await waitFor(() => {
      const createCalls = apiFetch.mock.calls.filter(
        ([args]) => args.path === '/projects/needs' && args.method === 'POST',
      )
      expect(createCalls).toHaveLength(1)
    })
    const [[createArgs]] = apiFetch.mock.calls.filter(
      ([args]) => args.path === '/projects/needs' && args.method === 'POST',
    )
    expect(createArgs.body.title).toBe('Architecte cloud')
    expect(createArgs.body.account_id).toBe('a-1')
  })

  it('refuse plus de dix fichiers en un dépôt', async () => {
    const u = user()
    wrap(<ImportNeedsDialog open onOpenChange={vi.fn()} />)

    await u.click(screen.getByRole('combobox', { name: 'Compte client' }))
    await u.click(await screen.findByRole('option', { name: 'TF1' }))
    const input = screen.getByLabelText('Choisir des fichiers')
    const eleven = Array.from({ length: 11 }, (_unused, index) => file(`fiche-${index}.pdf`))
    fireEvent.change(input, { target: { files: eleven } })

    expect(await screen.findByText(/Dix fichiers au maximum/)).toBeInTheDocument()
    // Aucun fichier n'a été retenu (le lot de onze est refusé EN BLOC) : le
    // bouton reste affiché, mais désactivé — rien à extraire.
    expect(screen.getByRole('button', { name: 'Extraire' })).toBeDisabled()
  })
})
