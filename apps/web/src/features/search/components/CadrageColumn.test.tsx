import type { AnalysisScopeSelection } from '@bellum/contracts'
import { fireEvent, screen, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CadrageColumn } from './CadrageColumn'

vi.mock('@/features/context-contract/api', () => ({
  useSurfaceContextContract: () => ({ data: undefined }),
}))
vi.mock('@/features/context-contract/view/SurfaceContextChip', () => ({
  SurfaceContextChip: () => <div>mode de contexte</div>,
}))

async function renderColumn(overrides: Partial<Parameters<typeof CadrageColumn>[0]> = {}) {
  const props = {
    selection: { depth: 'deep' } as AnalysisScopeSelection,
    onSelectionChange: vi.fn(),
    country: 'FR',
    entitySuggestions: [] as string[],
    prioritySuggestions: [] as string[],
    recommendedPriorities: [] as string[],
    focusLookedUp: false,
    relaunch: false,
    relaunchedOn: null,
    depthMedians: undefined,
    contextMode: undefined,
    onContextModeChange: vi.fn(),
    onAttachFiles: vi.fn(),
    attachmentsStrip: null,
    ...overrides,
  }
  renderWithRouter(<CadrageColumn {...props} />)
  await screen.findByText('Ton cadrage')
  return props
}

/** #4512 — ouvre le repli « Personnalisation » : le contexte, puis les réglages fins (ex-« Affiner »). */
function openRefine() {
  fireEvent.click(screen.getByRole('button', { name: /^Personnalisation/ }))
}

describe('CadrageColumn — étape 3 « Ton cadrage » (refonte Théo R1)', () => {
  beforeAll(() => {
    window.scrollTo = vi.fn()
  })
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('montre trois réglages — personnalisation, périmètre, profondeur — et aucun crédit nulle part', async () => {
    await renderColumn()

    expect(screen.getByRole('button', { name: /Personnalisation/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Périmètre/ })).toBeInTheDocument()
    expect(screen.getByText('Profondeur')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/crédit/i)
  })

  it('#3944 — la profondeur se choisit entre DEUX paliers, « Approfondie » d’abord ; la choisir l’écrit dans le cadrage', async () => {
    const props = await renderColumn({ selection: { depth: 'deep' } })

    fireEvent.click(screen.getByRole('combobox', { name: 'Profondeur' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Rapide' }))

    expect(props.onSelectionChange).toHaveBeenCalledWith({ depth: 'quick' })
  })

  it('#3288 — la durée est mesurée ou « non mesurée », jamais inventée', async () => {
    await renderColumn({ depthMedians: { deep: 360 } })
    expect(screen.getByText('≈ 6 min (médiane de tes analyses)')).toBeInTheDocument()
  })

  it('#3288 — sans médiane, la durée se dit non mesurée', async () => {
    await renderColumn({ depthMedians: undefined })
    expect(screen.getByText('durée non mesurée')).toBeInTheDocument()
  })

  it('#3288 — en relance, aucun palier à choisir : la relance porte son propre mode', async () => {
    await renderColumn({ relaunch: true, relaunchedOn: '3 sept.' })

    expect(screen.queryByRole('combobox', { name: 'Profondeur' })).not.toBeInTheDocument()
    expect(screen.getByText('Ce que cette relance va faire')).toBeInTheDocument()
    expect(screen.getByText('Dossier analysé le 3 sept.')).toBeInTheDocument()
  })

  it('le périmètre résume la zone et les entités ciblées / exclues, en mots', async () => {
    await renderColumn({
      selection: {
        depth: 'deep',
        geo_perimeter: 'region',
        geo_areas: ['Auvergne-Rhône-Alpes'],
        included_entities: ['Banque Populaire', 'Caisse d’Epargne'],
        excluded_entities: ['Natixis'],
      },
    })

    const row = screen.getByRole('button', { name: /Périmètre · Auvergne-Rhône-Alpes/ })
    expect(row).toHaveTextContent('Une entité · 2 entités ciblées · 1 exclue')
  })

  describe('la fenêtre « Quel périmètre travailler ? »', () => {
    async function openScope(overrides: Partial<Parameters<typeof CadrageColumn>[0]> = {}) {
      const props = await renderColumn(overrides)
      fireEvent.click(screen.getByRole('button', { name: /Périmètre/ }))
      return { props, dialog: await screen.findByRole('dialog') }
    }

    it('#2163.9, #2163.11 — la zone est câblée sur geo_perimeter', async () => {
      const { props, dialog } = await openScope()
      fireEvent.click(within(dialog).getByRole('button', { name: 'Monde' }))
      expect(props.onSelectionChange).toHaveBeenCalledWith({ depth: 'deep', geo_perimeter: 'world' })
    })

    it('« Un site » pose la zone Ville / site ; « Entreprise / groupe » retire les entités ciblées', async () => {
      const { props, dialog } = await openScope({
        selection: { depth: 'deep', geo_perimeter: 'france', included_entities: ['TF1'] },
      })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Un site' }))
      expect(props.onSelectionChange).toHaveBeenLastCalledWith(expect.objectContaining({ geo_perimeter: 'city' }))
      fireEvent.click(within(dialog).getByRole('button', { name: 'Entreprise / groupe' }))
      expect(props.onSelectionChange).toHaveBeenLastCalledWith(expect.objectContaining({ included_entities: [] }))
    })

    it('#2163.13 — une entité ciblée remonte à included_entities, distincte des entités exclues', async () => {
      const { props, dialog } = await openScope()
      const field = within(dialog).getByLabelText('Entités à cibler')
      fireEvent.change(field, { target: { value: 'TF1' } })
      fireEvent.keyDown(field, { key: 'Enter' })
      expect(props.onSelectionChange).toHaveBeenCalledWith({ depth: 'deep', included_entities: ['TF1'] })
    })

    it('remonte une entité exclue au parent — c’est ce qui sera réellement retiré', async () => {
      const { props, dialog } = await openScope()
      const field = within(dialog).getByLabelText('Entités à exclure')
      fireEvent.change(field, { target: { value: 'TF1 PUB' } })
      fireEvent.keyDown(field, { key: 'Enter' })
      expect(props.onSelectionChange).toHaveBeenCalledWith({ depth: 'deep', excluded_entities: ['TF1 PUB'] })
    })

    it('#4142 — écarter une entité déjà ciblée la retire des entités ciblées', async () => {
      const { props, dialog } = await openScope({ selection: { depth: 'deep', included_entities: ['TF1'] } })
      const field = within(dialog).getByLabelText('Entités à exclure')
      fireEvent.change(field, { target: { value: 'TF1' } })
      fireEvent.keyDown(field, { key: 'Enter' })
      expect(props.onSelectionChange).toHaveBeenCalledWith({
        depth: 'deep',
        included_entities: [],
        excluded_entities: ['TF1'],
      })
    })

    it('#4142 — n’ajoute pas la clé opposée quand rien n’est partagé', async () => {
      const { props, dialog } = await openScope()
      const field = within(dialog).getByLabelText('Entités à cibler')
      fireEvent.change(field, { target: { value: 'TF1' } })
      fireEvent.keyDown(field, { key: 'Enter' })
      expect(props.onSelectionChange).toHaveBeenCalledWith({ depth: 'deep', included_entities: ['TF1'] })
    })

    it('#4142 — avertit dès la 2ᵉ entité ciblée que l’ancrage ne porte plus sur une seule', async () => {
      await openScope({ selection: { depth: 'deep', included_entities: ['TF1', 'TF1 PUB'] } })
      expect(screen.getByText(/n'y a plus d'ancre unique/)).toBeInTheDocument()
    })

    it('les entités connues du dossier s’ajoutent d’un clic', async () => {
      const { props, dialog } = await openScope({ entitySuggestions: ['Siemens Mobility'] })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cibler Siemens Mobility' }))
      expect(props.onSelectionChange).toHaveBeenCalledWith({ depth: 'deep', included_entities: ['Siemens Mobility'] })
    })
  })

  describe('#4512 — « Personnalisation » replie les réglages fins', () => {
    it('#2163.25-30 — le niveau de contact est câblé sur hierarchy_levels, dans l’ordre du clic', async () => {
      const props = await renderColumn()
      openRefine()
      fireEvent.click(screen.getByRole('button', { name: 'Manager' }))
      expect(props.onSelectionChange).toHaveBeenCalledWith({ depth: 'deep', hierarchy_levels: ['n2'] })
    })

    it('#4142.6 — « Secteur public » et « Déjà travaillées » posent leur réglage', async () => {
      const props = await renderColumn()
      openRefine()
      fireEvent.click(screen.getByRole('button', { name: 'Secteur public' }))
      expect(props.onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ exclude_public_sector: true }))
      fireEvent.click(screen.getByRole('button', { name: 'Déjà travaillées' }))
      expect(props.onSelectionChange).toHaveBeenCalledWith(expect.objectContaining({ exclude_worked_accounts: true }))
    })

    it('#4142.3 — l’effectif min/max est facultatif, jamais 0', async () => {
      const props = await renderColumn({ selection: { depth: 'deep', headcount_min: 50 } })
      openRefine()
      expect(screen.getByLabelText('Effectif minimum')).toHaveValue(50)
      expect(screen.getByLabelText('Effectif maximum')).toHaveValue(null)
      fireEvent.change(screen.getByLabelText('Effectif maximum'), { target: { value: '250' } })
      expect(props.onSelectionChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ headcount_min: 50, headcount_max: 250 }),
      )
    })

    it('#4142 — prioriser un thème déjà écarté le retire des thèmes écartés', async () => {
      const props = await renderColumn({ selection: { depth: 'deep', excluded_angles: ['ERP'] } })
      openRefine()
      const field = screen.getByLabelText('Priorités de vente')
      fireEvent.change(field, { target: { value: 'ERP' } })
      fireEvent.keyDown(field, { key: 'Enter' })
      expect(props.onSelectionChange).toHaveBeenCalledWith({
        depth: 'deep',
        excluded_angles: [],
        selected_angles: ['ERP'],
      })
    })

    it('#4142 — avertit au-delà d’un 2ᵉ thème retenu', async () => {
      await renderColumn({ selection: { depth: 'deep', selected_angles: ['Cybersécurité', 'Cloud'] } })
      openRefine()
      expect(screen.getByText(/n'y a plus d'ancre unique/)).toBeInTheDocument()
    })

    it('propose ce que TON ESN vend, en un clic, et ne repropose pas une amorce déjà posée', async () => {
      const props = await renderColumn({ prioritySuggestions: ['Cybersécurité', 'Data & BI'] })
      openRefine()
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter Cybersécurité aux priorités' }))
      expect(props.onSelectionChange).toHaveBeenCalledWith({ depth: 'deep', selected_angles: ['Cybersécurité'] })
    })

    it('replié, compte les réglages posés à côté du mode, sans jamais afficher « 0 »', async () => {
      await renderColumn({ selection: { depth: 'deep', hierarchy_levels: ['n2'], exclude_public_sector: true } })
      expect(screen.getByRole('button', { name: /^Personnalisation/ })).toHaveTextContent('2 réglages posés')
    })

    it('sans réglage posé, aucun compte', async () => {
      await renderColumn()
      expect(screen.queryByText(/réglages? posés?/)).not.toBeInTheDocument()
    })

    it('AM.44 — repliée par défaut : aucun réglage fin visible avant le clic', async () => {
      await renderColumn()
      const toggle = screen.getByRole('button', { name: /^Personnalisation/ })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText('Niveau de contact')).not.toBeInTheDocument()
      expect(screen.queryByText('Affiner')).not.toBeInTheDocument()
      fireEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('Niveau de contact')).toBeInTheDocument()
    })

    it('un seul titre par notion, dans l’ordre, sans sous-titre qui le répète', async () => {
      await renderColumn({ prioritySuggestions: ['Cybersécurité'] })
      openRefine()
      const panel = document.querySelector('[data-cadrage="personalisation"]') as HTMLElement
      const titles = [
        'Le contexte de cette analyse',
        'Niveau de contact',
        'Postes à placer',
        'Priorités de vente',
        'Ce qu’on écarte',
        "Effectif de l'entreprise",
      ]
      const text = panel.textContent ?? ''
      const positions = titles.map(title => text.indexOf(title))
      expect(positions.every(position => position >= 0)).toBe(true)
      expect([...positions].sort((a, b) => a - b)).toEqual(positions)
      for (const title of titles) expect(within(panel).getAllByText(title)).toHaveLength(1)
      // Les doublons d'avant ont disparu.
      for (const gone of [
        'Qui viser',
        'Ce que tu vends — tes priorités',
        'Ce que tu vends — clique pour l’ajouter :',
        'Thèmes à exclure',
        'Exclure',
      ]) {
        expect(within(panel).queryByText(gone)).not.toBeInTheDocument()
      }
      expect(panel.querySelector('.uppercase')).toBeNull()
    })

    it('« Achats » n’apparaît qu’une fois — la famille de postes se nomme « Fonction achats », sa valeur ne change pas', async () => {
      const props = await renderColumn()
      openRefine()
      expect(screen.getAllByText('Achats')).toHaveLength(1)
      fireEvent.click(screen.getByRole('button', { name: 'Fonction achats' }))
      expect(props.onSelectionChange).toHaveBeenLastCalledWith({ depth: 'deep', business_families: ['Achats'] })
    })

    it('les priorités sont UN champ : les suggestions du profil sont dedans', async () => {
      await renderColumn({ prioritySuggestions: ['Cybersécurité'] })
      openRefine()
      const input = screen.getByLabelText('Priorités de vente')
      const box = input.parentElement as HTMLElement
      expect(within(box).getByRole('button', { name: 'Ajouter Cybersécurité aux priorités' })).toBeInTheDocument()
    })

    it('ce qu’on écarte est UN champ : les thèmes, puis secteur public et déjà travaillées', async () => {
      await renderColumn()
      openRefine()
      const group = screen.getByRole('group', { name: 'Ce qu’on écarte' })
      expect(within(group).getByRole('button', { name: 'Secteur public' })).toBeInTheDocument()
      expect(within(group).getByRole('button', { name: 'Déjà travaillées' })).toBeInTheDocument()
    })
  })

  it('ouvert, « Le contexte de cette analyse » garde le chemin vers le profil — sans fenêtre', async () => {
    await renderColumn()
    openRefine()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Le contexte de cette analyse')).toBeInTheDocument()
    expect(screen.getByText(/Ce choix ne modifie pas ton profil permanent/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Corriger mon profil' })).toBeInTheDocument()
  })

  // #4294.5 (recette prod 28/10, /search?company=Veolia : 0 occurrence de « thème ») — les thèmes étaient calculés
  // (recommandés par la veille, suggérés par le profil) mais enfermés dans le repli « Personnalisation » : l'écran ne
  // les nommait jamais. Replié, il dit les thèmes, ou pourquoi il n'y en a pas.
  describe('thèmes visibles sans ouvrir la personnalisation (#4294.5)', () => {
    it('nomme les thèmes recommandés', async () => {
      await renderColumn({ recommendedPriorities: ['Cybersécurité', 'Data'] })
      expect(screen.getByTestId('cadrage-themes')).toHaveTextContent(/thèmes recommandés/i)
      expect(screen.getByTestId('cadrage-themes')).toHaveTextContent('Cybersécurité, Data')
    })
    it('nomme les thèmes déjà retenus avant les recommandations', async () => {
      await renderColumn({
        selection: { depth: 'deep', selected_angles: ['Cloud'] } as AnalysisScopeSelection,
        recommendedPriorities: ['Data'],
      })
      expect(screen.getByTestId('cadrage-themes')).toHaveTextContent(/thèmes prioritaires : Cloud/i)
    })
    it('sait dire NON : sans aucun thème, l’écran dit pourquoi — jamais un bloc vide ni un « 0 »', async () => {
      await renderColumn()
      const line = screen.getByTestId('cadrage-themes')
      expect(line).toHaveTextContent(/aucun thème/i)
      expect(line).not.toHaveTextContent(/\b0\b/)
    })
  })
})
