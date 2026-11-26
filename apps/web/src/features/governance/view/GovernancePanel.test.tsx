import type { CustomFieldDef } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GovernancePanel } from './GovernancePanel'

const fields = vi.fn()
const createField = vi.fn()
const archiveField = vi.fn()

vi.mock('../api', () => ({
  useCustomFields: () => fields(),
  useCreateCustomField: () => ({ mutate: createField, isPending: false }),
  useArchiveCustomField: () => ({ mutate: archiveField, isPending: false }),
}))

function field(over: Partial<CustomFieldDef> = {}): CustomFieldDef {
  return {
    id: 'f1',
    entityType: 'contact',
    key: 'reference_marche',
    label: 'Référence marché',
    type: 'text',
    options: [],
    archived: false,
    createdAt: '2026-08-01T09:00:00.000Z',
    ...over,
  }
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <GovernancePanel entityType="contact" />
    </QueryClientProvider>,
  )
}

describe('GovernancePanel — champs personnalisés', () => {
  beforeEach(() => {
    fields.mockReset()
    createField.mockReset()
    archiveField.mockReset()
    fields.mockReturnValue({ data: [], isError: false })
  })

  it('AFFICHE le compteur — une borne découverte en la heurtant se lit comme une panne', () => {
    fields.mockReturnValue({ data: [field()], isError: false })
    renderPanel()
    expect(screen.getByText('1 / 10 utilisés')).toBeInTheDocument()
  })

  it('montre la CLÉ MACHINE — c’est elle qui sort dans les exports', () => {
    fields.mockReturnValue({ data: [field()], isError: false })
    renderPanel()
    expect(screen.getByText('reference_marche')).toBeInTheDocument()
  })

  it('CACHE les champs archivés du compteur et de la liste', () => {
    fields.mockReturnValue({ data: [field({ archived: true })], isError: false })
    renderPanel()
    expect(screen.getByText('0 / 10 utilisés')).toBeInTheDocument()
    expect(screen.queryByText('Référence marché')).not.toBeInTheDocument()
  })

  it('dit que l’archivage GARDE les valeurs', () => {
    fields.mockReturnValue({ data: [field()], isError: false })
    renderPanel()
    expect(screen.getByTitle(/ses valeurs restent lisibles/)).toBeInTheDocument()
  })

  it('ne rend PAS un échec de lecture comme une liste vide', () => {
    fields.mockReturnValue({ data: undefined, isError: true })
    renderPanel()
    expect(screen.getByText('Les champs n’ont pas pu être chargés.')).toBeInTheDocument()
    expect(screen.queryByText('Aucun champ personnalisé.')).not.toBeInTheDocument()
  })
})
