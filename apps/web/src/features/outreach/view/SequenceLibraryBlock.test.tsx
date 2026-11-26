import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { SequenceLibraryBlock } from './SequenceLibraryBlock'

/**
 * #3756 — la bibliothèque de campagnes : les modèles importés se listent avec
 * leur cadence, les lignes écartées se NOMMENT, une étape bloquée nomme sa
 * variable, et rien ne prétend avoir envoyé quoi que ce soit.
 */
const templatesMock = vi.fn()
const importMock = vi.fn()
const applyMock = vi.fn()
const contactsMock = vi.fn()
const visibilityMock = vi.fn()
const membersMock = vi.fn()

vi.mock('../hooks/useSequenceLibrary', () => ({
  useSequenceTemplates: () => templatesMock(),
  useImportSequenceLibrary: () => ({ mutateAsync: importMock, isPending: false }),
  useDeleteSequenceTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useApplySequenceTemplate: () => ({ mutateAsync: applyMock, isPending: false }),
  useSetSequenceTemplateVisibility: () => ({ mutate: visibilityMock, isPending: false }),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => membersMock() }))
vi.mock('@/features/contacts/hooks/useContacts', () => ({ useContacts: () => contactsMock() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const template = {
  id: 't1',
  name: 'Campagne 1',
  sector: 'Logistique 3PL',
  tier_label: 'A' as const,
  created_at: '2026-10-06T10:00:00Z',
  visibility: 'team' as const,
  created_by: 'u-author' as string | null,
  updated_at: '2026-10-10T08:00:00Z' as string | null,
  steps: [
    { position: 0, delay_days: 0, subject: 'Hello', body: 'b' },
    { position: 1, delay_days: 3, subject: 'Re', body: 'b' },
  ],
}

describe('SequenceLibraryBlock', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    templatesMock.mockReturnValue({ data: [template], isLoading: false })
    contactsMock.mockReturnValue({ data: { pages: [{ data: [{ id: 'c1', full_name: 'Durand' }] }] } })
    importMock.mockReset()
    applyMock.mockReset()
    visibilityMock.mockReset()
    membersMock.mockReturnValue({
      data: [
        { userId: 'u-me', email: 'moi@esn.fr', fullName: 'Moi Même', role: 'sales', isSelf: true },
        { userId: 'u-author', email: 'alix@esn.fr', fullName: 'Alix Auteur', role: 'sales', isSelf: false },
      ],
    })
  })

  it('liste la campagne avec son secteur, son tier et sa cadence J+n', () => {
    render(<SequenceLibraryBlock />)
    expect(screen.getByText('Campagne 1')).toBeTruthy()
    expect(screen.getByText('Logistique 3PL')).toBeTruthy()
    expect(screen.getByText('Tier A')).toBeTruthy()
    expect(screen.getByText(/J\+0 · J\+3/)).toBeTruthy()
  })

  it('dit que la bibliothèque est vide plutôt que d’inventer une ligne', () => {
    templatesMock.mockReturnValue({ data: [], isLoading: false })
    render(<SequenceLibraryBlock />)
    expect(screen.getByText('Aucune campagne importée pour l’instant.')).toBeTruthy()
  })

  it('après un import, compte et NOMME les lignes écartées', async () => {
    importMock.mockResolvedValue({
      templates: 2,
      steps: 6,
      skipped: [{ line: 7, reason: 'bad_delay', campaign: 'Campagne 2' }],
      unknown_variables: [],
    })
    render(<SequenceLibraryBlock />)
    const file = new File(['x'], 'campagnes.xlsx')
    fireEvent.change(screen.getByTestId('sequence-library-file'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByText(/2 campagne\(s\) importée\(s\)/)).toBeTruthy())
    expect(screen.getByText(/Ligne 7 — délai J\+n illisible \(campagne : Campagne 2\)/)).toBeTruthy()
  })

  it('#4426.7 — nomme les variables inconnues laissées telles quelles, et se tait quand il n’y en a pas', async () => {
    importMock.mockResolvedValue({ templates: 1, steps: 2, skipped: [], unknown_variables: ['monAlias'] })
    render(<SequenceLibraryBlock />)
    fireEvent.change(screen.getByTestId('sequence-library-file'), { target: { files: [new File(['x'], 'c.xlsx')] } })
    await waitFor(() => expect(screen.getByText(/\{\{monAlias\}\}/)).toBeTruthy())
    expect(screen.getByText(/Variable inconnue laissée telle quelle/)).toBeTruthy()
  })

  it('appliquer un modèle à un contact nomme la variable qui bloque une étape', async () => {
    applyMock.mockResolvedValue({
      sequence: { id: 's1', contact_name: 'Durand' },
      blocked_steps: [
        {
          position: 0,
          blocked: [{ variable: 'firstName', reason: 'missing', message: 'Prénom manquant : {{firstName}}' }],
        },
      ],
    })
    render(<SequenceLibraryBlock />)
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer à un contact' }))
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer à Durand' }))
    await waitFor(() => expect(screen.getByText(/Étape 1 bloquée — Prénom manquant : \{\{firstName\}\}/)).toBeTruthy())
    expect(applyMock).toHaveBeenCalledWith({ templateId: 't1', contactId: 'c1' })
    expect(screen.getByText(/Rien n’est envoyé/)).toBeTruthy()
  })

  // #4158.30 — partagé avec l'équipe / personnel
  it('affiche partagé / personnel, l’auteur et la date de mise à jour', () => {
    render(<SequenceLibraryBlock />)
    expect(screen.getByText("Partagé avec l'équipe")).toBeTruthy()
    expect(screen.getByText('Par Alix Auteur')).toBeTruthy()
    expect(screen.getByText(/Mis à jour le/)).toBeTruthy()
  })

  it("le filtre « De l'équipe » écarte les modèles personnels", () => {
    templatesMock.mockReturnValue({
      data: [template, { ...template, id: 't2', name: 'Brouillon perso', visibility: 'personal', created_by: 'u-me' }],
      isLoading: false,
    })
    render(<SequenceLibraryBlock />)
    expect(screen.getByText('Brouillon perso')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: "De l'équipe" }))
    expect(screen.queryByText('Brouillon perso')).toBeNull()
    expect(screen.getByText('Campagne 1')).toBeTruthy()
  })

  it("seul l'auteur voit « Partager » : mon modèle personnel se partage, celui d'un autre ne se touche pas", () => {
    templatesMock.mockReturnValue({
      data: [{ ...template, id: 't2', name: 'Mon brouillon', visibility: 'personal', created_by: 'u-me' }, template],
      isLoading: false,
    })
    render(<SequenceLibraryBlock />)
    const share = screen.getAllByRole('button', { name: "Partager avec l'équipe" })
    expect(share).toHaveLength(1)
    fireEvent.click(share[0] as HTMLElement)
    expect(visibilityMock).toHaveBeenCalledWith({ id: 't2', visibility: 'team' })
    expect(screen.queryByRole('button', { name: 'Reprendre en personnel' })).toBeNull()
  })
})
