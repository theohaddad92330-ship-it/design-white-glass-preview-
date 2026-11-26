import type { SequenceTemplate } from '@bellum/contracts'
import type { ComponentProps } from 'react'
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SequenceLibraryView } from './SequenceLibraryView'

const templatesMock = vi.fn()
const importMutate = vi.fn()
const askLaura = vi.fn()
const setVisibility = vi.fn()

vi.mock('../hooks/useSequenceLibrary', () => ({
  useSequenceTemplates: () => templatesMock(),
  useImportSequenceLibrary: () => ({ mutateAsync: importMutate, isPending: false }),
  useDeleteSequenceTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useSetSequenceTemplateVisibility: () => ({ mutate: setVisibility, isPending: false }),
  useApplySequenceTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('../hooks/useAskLauraAction', () => ({ useAskLauraAction: () => askLaura }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('@/features/contacts/hooks/useContacts', () => ({
  useContacts: () => ({ data: { pages: [{ data: [] }] } }),
}))

function imported(over: Partial<SequenceTemplate> = {}): SequenceTemplate {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Relance comité achats grands comptes',
    sector: null,
    tier_label: 'A',
    steps: [
      {
        position: 0,
        delay_days: 0,
        subject: 'Suite au comité',
        body: 'Bonjour {{firstName}},\nMerci pour votre temps.',
      },
      { position: 1, delay_days: 4, subject: '', body: 'Je reviens vers vous.' },
    ],
    call_scripts: [],
    created_at: '2026-10-02T09:00:00.000Z',
    visibility: 'team',
    created_by: null,
    updated_at: null,
    ...over,
  }
}

async function setup(props: Partial<ComponentProps<typeof SequenceLibraryView>> = {}) {
  const handlers = {
    onBack: vi.fn(),
    onUsePlaybook: vi.fn(),
    onUseTemplate: vi.fn(),
    onGuide: vi.fn(),
  }
  renderWithRouter(<SequenceLibraryView {...handlers} {...props} />)
  await screen.findByTestId('sequence-library-view')
  return handlers
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  vi.clearAllMocks()
  templatesMock.mockReturnValue({ data: [], isLoading: false })
})

describe('SequenceLibraryView — la bibliothèque (Théo C sequences-bibliotheque)', () => {
  it('liste les modèles de départ, un titre de niveau 1, et le retour vers la liste', async () => {
    const handlers = await setup()
    expect(screen.getByRole('heading', { level: 1, name: 'Ta bibliothèque de modèles' })).toBeInTheDocument()
    expect(within(screen.getByTestId('library-catalog')).getAllByRole('listitem').length).toBeGreaterThanOrEqual(22)
    fireEvent.click(screen.getByRole('button', { name: 'Tes séquences' }))
    expect(handlers.onBack).toHaveBeenCalled()
  })

  it('multi-sélection : deux usages cochés gardent l’union, un seul garde ses modèles', async () => {
    await setup()
    const all = within(screen.getByTestId('library-catalog')).getAllByRole('listitem').length
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Usage : Tous les usages' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Staffing' }))
    // Le menu reste ouvert pendant qu'on coche.
    expect(screen.getByRole('menuitemcheckbox', { name: 'Staffing' })).toHaveAttribute('aria-checked', 'true')
    await user.keyboard('{Escape}')
    const staffing = within(screen.getByTestId('library-catalog')).getAllByRole('listitem').length
    expect(staffing).toBeLessThan(all)
    await user.click(screen.getByRole('button', { name: 'Usage : Staffing' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Rendez-vous' }))
    await user.keyboard('{Escape}')
    const both = within(screen.getByTestId('library-catalog')).getAllByRole('listitem').length
    expect(both).toBeGreaterThan(staffing)
    expect(screen.getByRole('button', { name: 'Usage : 2 choisis' })).toBeInTheDocument()
  })

  it('la recherche ignore les accents ; sans résultat, la liste le dit au lieu de rester vide', async () => {
    await setup()
    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox', { name: 'Chercher un modèle' }), 'reactivation')
    expect(screen.getByTestId('catalog-playbook:win_back')).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: 'Chercher un modèle' }))
    await user.type(screen.getByRole('searchbox', { name: 'Chercher un modèle' }), 'zzz-introuvable')
    expect(screen.getByTestId('library-no-result')).toBeInTheDocument()
  })

  it('« Voir les messages » ouvre les étapes ; « Utiliser ce modèle » ouvre l’assistant sur la situation', async () => {
    const handlers = await setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Voir les messages de Appel d’offres' }))
    const steps = within(screen.getByTestId('preview-steps')).getAllByRole('listitem')
    expect(steps.length).toBeGreaterThanOrEqual(3)
    await user.click(screen.getByRole('button', { name: 'Utiliser ce modèle' }))
    expect(handlers.onUsePlaybook).toHaveBeenCalledWith('tender')
  })

  it('« Utiliser » sur un gabarit d’avant ouvre la création présélectionnée', async () => {
    const handlers = await setup()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Utiliser le modèle Compte froid — email' }))
    expect(handlers.onUseTemplate).toHaveBeenCalledWith('cold_email')
  })

  it('une campagne importée a sa section, son aperçu avec le texte écrit, et rien n’est retiré', async () => {
    templatesMock.mockReturnValue({ data: [imported()], isLoading: false })
    await setup()
    const section = screen.getByTestId('library-imported')
    expect(within(section).getByText('Relance comité achats grands comptes')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Retirer' })).toBeInTheDocument()
    await userEvent
      .setup()
      .click(within(section).getByRole('button', { name: 'Voir les messages de Relance comité achats grands comptes' }))
    expect(screen.getByText('Suite au comité')).toBeInTheDocument()
    expect(screen.getByText(/Merci pour votre temps/)).toBeInTheDocument()
  })

  it('le filtre « Personnels » ne garde que les campagnes personnelles et écarte les modèles de départ', async () => {
    templatesMock.mockReturnValue({
      data: [
        imported(),
        imported({ id: '22222222-2222-4222-8222-222222222222', name: 'Mienne', visibility: 'personal' }),
      ],
      isLoading: false,
    })
    await setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Provenance : Tous les auteurs' }))
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Personnels' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('library-catalog')).not.toBeInTheDocument()
    expect(screen.getByText('Mienne')).toBeInTheDocument()
    expect(screen.queryByText('Relance comité achats grands comptes')).not.toBeInTheDocument()
  })

  it('« Créer mon modèle » est un menu à trois chemins ; l’assistant guidé est relayé', async () => {
    const handlers = await setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Créer mon modèle/ }))
    expect(screen.getByRole('menuitem', { name: 'Partir de zéro' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Depuis une page web' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Avec l’assistant guidé' }))
    expect(handlers.onGuide).toHaveBeenCalled()
  })

  it('« Partir de zéro » ouvre un modèle DÉJÀ rédigé, jamais des champs vides, et l’enregistre', async () => {
    importMutate.mockResolvedValue({ templates: 1, steps: 3, scripts: 0, skipped: [], unknown_variables: [] })
    templatesMock.mockReturnValue({ data: [], isLoading: false, refetch: vi.fn().mockResolvedValue({ data: [] }) })
    await setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Créer mon modèle/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Partir de zéro' }))
    const messages = screen.getAllByRole('textbox', { name: 'Message' })
    expect(messages).toHaveLength(3)
    for (const message of messages) expect((message as HTMLTextAreaElement).value.length).toBeGreaterThan(20)
    await user.type(screen.getByRole('textbox', { name: 'Nom du modèle' }), 'Relance comité')
    await user.click(screen.getByRole('button', { name: 'Enregistrer mon modèle' }))
    expect(importMutate).toHaveBeenCalledTimes(1)
    const sent = importMutate.mock.calls[0]?.[0] as { filename: string; content_base64: string }
    expect(sent.filename).toBe('mon-modele.csv')
    const csv = new TextDecoder().decode(Uint8Array.from(atob(sent.content_base64), char => char.charCodeAt(0)))
    expect(csv).toContain('Relance comité')
  })

  it('« Régénérer » demande une autre trame à Laura, question pré-remplie', async () => {
    await setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Créer mon modèle/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Partir de zéro' }))
    await user.click(screen.getByRole('button', { name: 'Régénérer' }))
    expect(askLaura).toHaveBeenCalledWith(expect.stringContaining('Prospection'))
  })

  it('« Préparer avec Laura » ouvre un objectif déjà proposé et le lui transmet', async () => {
    await setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Préparer avec/ }))
    const goal = screen.getByRole('textbox', { name: 'Ton objectif' }) as HTMLTextAreaElement
    expect(goal.value.length).toBeGreaterThan(20)
    await user.click(screen.getByRole('button', { name: 'Préparer une trame' }))
    expect(askLaura).toHaveBeenCalledWith(expect.stringContaining(goal.value))
  })

  it('« Depuis une page web » n’active la lecture qu’avec une adresse valide', async () => {
    await setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Créer mon modèle/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Depuis une page web' }))
    expect(screen.getByRole('button', { name: 'Lire la page' })).toBeDisabled()
    await user.type(screen.getByLabelText('Adresse de la page'), 'https://exemple.fr/offre')
    await user.click(screen.getByRole('button', { name: 'Lire la page' }))
    expect(askLaura).toHaveBeenCalledWith(expect.stringContaining('https://exemple.fr/offre'))
  })

  it('« Importer » ouvre la fenêtre d’import et dit les lignes écartées du dernier import', async () => {
    importMutate.mockResolvedValue({
      templates: 1,
      steps: 2,
      scripts: 0,
      skipped: [{ line: 7, reason: 'no_body', campaign: 'X' }],
      unknown_variables: [],
    })
    await setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Importer' }))
    expect(screen.getByRole('heading', { name: 'Importer des campagnes' })).toBeInTheDocument()
    const file = new File(['Campagne,Corps\nA,Bonjour'], 'campagnes.csv', { type: 'text/csv' })
    await user.upload(screen.getByTestId('sequence-library-file'), file)
    expect(await screen.findByText(/Ligne 7/)).toBeInTheDocument()
  })
})

describe('Théo C sequences-bibliotheque — la STRUCTURE de la maquette', () => {
  const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

  it('en-tête (sur-titre, h1, phrase, Importer · Créer mon modèle · Préparer avec Laura) · barre de filtres · grille · importés', async () => {
    templatesMock.mockReturnValue({ data: [imported()], isLoading: false })
    await setup()
    const head = screen.getByTestId('sequences-page-head')
    expect(within(head).getByText('Séquences · modèles')).toBeInTheDocument()
    expect(within(head).getByRole('heading', { level: 1, name: 'Ta bibliothèque de modèles' })).toBeInTheDocument()
    expect(
      within(head)
        .getAllByRole('button')
        .map(button => button.textContent),
    ).toEqual(['Importer', 'Créer mon modèle', 'Préparer avec Laura'])
    const filters = screen.getByTestId('library-filters')
    // UNE barre : la recherche, les deux filtres de la maquette (aucun caché sous un repli), le décompte.
    expect(within(filters).getByRole('searchbox', { name: 'Chercher un modèle' })).toBeInTheDocument()
    expect(within(filters).getByRole('button', { name: 'Usage : Tous les usages' })).toBeInTheDocument()
    expect(within(filters).getByRole('button', { name: 'Provenance : Tous les auteurs' })).toBeInTheDocument()
    expect(within(filters).getByRole('status')).toHaveTextContent(/modèles · 1 importé/)
    expect(screen.queryByText('Plus de filtres')).not.toBeInTheDocument()
    const catalog = screen.getByTestId('library-catalog')
    const importedBlock = screen.getByTestId('library-imported')
    ;[head, filters, catalog, importedBlock]
      .slice(1)
      .forEach((node, index) =>
        expect(before([head, filters, catalog, importedBlock][index] as Element, node)).toBe(true),
      )
    expect(
      within(importedBlock).getByRole('heading', { level: 2, name: 'Importés de ton fichier' }),
    ).toBeInTheDocument()
    // Chaque carte : la pastille d'usage, le titre, le nombre d'étapes, « Voir les messages » et « Utiliser ».
    const first = within(catalog).getAllByRole('listitem')[0] as HTMLElement
    expect(within(first).getByRole('heading', { level: 3 })).toBeInTheDocument()
    expect(within(first).getByText(/étapes?$/)).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: /^Voir les messages de/ })).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: /^Utiliser le modèle/ })).toBeInTheDocument()
  })

  it('la fenêtre de lecture : Fermer · Personnaliser une copie · Utiliser ce modèle ; la copie s’ouvre déjà remplie', async () => {
    await setup()
    const user = userEvent.setup()
    await user.click(
      within(screen.getByTestId('catalog-playbook:win_back')).getByRole('button', { name: /^Voir les messages/ }),
    )
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Personnaliser une copie' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Personnaliser une copie' }))
    const copy = await screen.findByRole('dialog')
    expect(within(copy).getByRole('heading', { name: 'Créer mon modèle' })).toBeInTheDocument()
    expect(within(copy).getByDisplayValue(/\(copie\)$/)).toBeInTheDocument()
    // Aucun message vide : chaque étape s'ouvre rédigée.
    for (const area of within(copy)
      .getAllByRole('textbox')
      .filter(node => node.tagName === 'TEXTAREA'))
      expect((area as HTMLTextAreaElement).value.trim()).not.toBe('')
  })

  it('un modèle importé se retire depuis sa fenêtre de lecture (le geste existant, nommé tel qu’il agit)', async () => {
    templatesMock.mockReturnValue({ data: [imported()], isLoading: false })
    await setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^Voir les messages de Relance comité achats/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Retirer' })).toBeInTheDocument()
  })
})
