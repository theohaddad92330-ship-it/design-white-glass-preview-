import type { AnalysisContext, AnalysisScopeSelection } from '@bellum/contracts'
import { fireEvent, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { ScopeSummary } from '../lib/scope-summary'
import { ScopeConfirmPanel } from './ScopeConfirmPanel'

/** Le solde se lit par `useCreditGate` : une donnée mutable que chaque test contrôle. */
const gate = vi.hoisted(() => ({ value: { known: true, canAnalyze: true, canEnrich: true, locked: false } }))
vi.mock('@/features/credits/hooks/useCreditGate', () => ({ useCreditGate: () => gate.value }))

const summary: ScopeSummary = {
  objectName: 'TF1',
  isEntityLocked: true,
  registryLabel: 'SIREN 326300159',
  location: 'Boulogne-Billancourt · Média',
  scopeMode: 'groupe',
}

async function renderPanel(overrides: Partial<Parameters<typeof ScopeConfirmPanel>[0]> = {}) {
  const props = {
    summary,
    country: 'FR',
    selection: { depth: 'deep' } as AnalysisScopeSelection,
    onSelectionChange: vi.fn(),
    preset: 'strategic' as const,
    context: { preset: 'strategic' } as AnalysisContext,
    onContextChange: vi.fn(),
    intents: ['intent.openAccount', 'intent.findDecisionMakers'],
    knownLines: [] as string[],
    onOpenKnown: vi.fn(),
    onEdit: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  }
  renderWithRouter(<ScopeConfirmPanel {...props} />)
  await screen.findByText('Le bon périmètre, dès le départ.')
  return props
}

describe('ScopeConfirmPanel — la vérification avant lancement (refonte Théo R2)', () => {
  beforeAll(() => {
    window.scrollTo = vi.fn()
  })
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    gate.value = { known: true, canAnalyze: true, canEnrich: true, locked: false }
  })

  it('#4463 — aucun coût, aucun solde, aucun « crédit » nulle part', async () => {
    await renderPanel()
    expect(document.body).not.toHaveTextContent(/crédit/i)
  })

  it('nomme l’entreprise et son identité, et « Modifier » revient au cadrage', async () => {
    const props = await renderPanel()
    expect(screen.getByRole('heading', { level: 1, name: 'TF1' })).toBeInTheDocument()
    expect(screen.getByText(/SIREN 326300159/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    expect(props.onEdit).toHaveBeenCalledTimes(1)
  })

  it('ne lance rien tant que la confirmation n’est pas explicite', async () => {
    const props = await renderPanel()
    expect(props.onConfirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: "Lancer l'analyse" }))
    expect(props.onConfirm).toHaveBeenCalledTimes(1)
    expect(props.onConfirm).toHaveBeenCalledWith(undefined)
  })

  it('rappelle chaque objectif coché, avec sa description', async () => {
    await renderPanel()
    const aside = screen.getByRole('complementary')
    expect(aside).toHaveTextContent('Ouvrir ce compte')
    expect(aside).toHaveTextContent('Choisir un périmètre, une raison d’entrer et une première approche.')
    expect(aside).toHaveTextContent('Trouver les décideurs')
  })

  it('#2163.70 — dit ce que livre CE lancement : le dossier complet', async () => {
    await renderPanel()
    expect(screen.getByText(/Dossier de conquête complet/)).toBeInTheDocument()
  })

  it('« Ce que tu veux comprendre » est la phrase d’angle : l’éditer écrit dans le contexte', async () => {
    const props = await renderPanel({ context: { preset: 'free', notes: 'Placer deux profils Data' } })
    const field = screen.getByLabelText('Ce que tu veux comprendre')
    expect(field).toHaveValue('Placer deux profils Data')
    fireEvent.change(field, { target: { value: 'Qui décide sur la Data ?' } })
    expect(props.onContextChange).toHaveBeenCalledWith({ preset: 'free', notes: 'Qui décide sur la Data ?' })
  })

  it('#3944 — propose DEUX paliers, « Approfondie » coché ; en choisir un l’écrit dans le cadrage', async () => {
    const props = await renderPanel()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(screen.getByRole('radio', { name: /Approfondie/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: /Rapide/ }))
    expect(props.onSelectionChange).toHaveBeenCalledWith({ depth: 'quick' })
  })

  it('#3288 — la durée est mesurée ou « non mesurée », jamais inventée', async () => {
    await renderPanel({ depthMedians: { deep: 360, quick: null } })
    expect(screen.getByRole('radio', { name: /Approfondie/ })).toHaveTextContent('≈ 6 min')
    expect(screen.getByRole('radio', { name: /Rapide/ })).toHaveTextContent('durée non mesurée')
  })

  it('le périmètre se règle ici comme à l’écran de départ (« Un site » pose la zone Ville / site)', async () => {
    const props = await renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Un site' }))
    expect(props.onSelectionChange).toHaveBeenCalledWith({ depth: 'deep', geo_perimeter: 'city' })
    fireEvent.click(screen.getByRole('button', { name: 'Monde' }))
    expect(props.onSelectionChange).toHaveBeenLastCalledWith({ depth: 'deep', geo_perimeter: 'world' })
  })

  describe('« ce que Bellum sait déjà »', () => {
    it('absent sur une société jamais analysée — bloc sans donnée = absent', async () => {
      await renderPanel({ knownLines: [] })
      expect(screen.queryByText('Ce que Bellum sait déjà')).not.toBeInTheDocument()
    })

    it('un seul bandeau, avec « Voir le détail » qui ouvre la fenêtre', async () => {
      const props = await renderPanel({
        knownLines: ['Analysé le 3 sept.', '14 contacts identifiés'],
      })
      expect(screen.getAllByText('Ce que Bellum sait déjà')).toHaveLength(1)
      expect(screen.getByText(/Analysé le 3 sept\. · 14 contacts identifiés/)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Voir le détail' }))
      expect(props.onOpenKnown).toHaveBeenCalledTimes(1)
    })
  })

  describe('relance d’un dossier existant (#1133)', () => {
    it('dit ce qu’une relance refait et conserve, et porte le mode du mini-plan jusqu’à la confirmation', async () => {
      const props = await renderPanel({ relaunch: true })
      expect(screen.getByText('Tu relances un dossier existant')).toBeInTheDocument()
      expect(screen.getByText('Refait')).toBeInTheDocument()
      expect(screen.getByText('Conservé')).toBeInTheDocument()
      // Aucun palier à choisir : le mini-plan de rafraîchissement porte son propre mode.
      expect(screen.queryByRole('radio')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: "Lancer l'analyse" }))
      expect(props.onConfirm).toHaveBeenCalledWith('full')
    })

    it('ne dit rien de tel sur une PREMIÈRE analyse', async () => {
      await renderPanel()
      expect(screen.queryByText('Tu relances un dossier existant')).not.toBeInTheDocument()
    })
  })

  describe('solde épuisé — le frein doux est le seul refus', () => {
    it('dit la phrase humaine, sans chiffre, et ne lance pas', async () => {
      gate.value = { known: true, canAnalyze: false, canEnrich: false, locked: false }
      const props = await renderPanel()
      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(document.body).not.toHaveTextContent(/\d+ crédit|crédit/i)
      // #4464.2 — aucun bouton recharger / acheter.
      expect(screen.queryByRole('button', { name: /recharg|achet/i })).toBeNull()
      const launch = screen.getByRole('button', { name: "Lancer l'analyse" })
      expect(launch).toBeDisabled()
      // #4464.4 — réellement désactivé, aussi pour un lecteur d'écran.
      expect(launch).toHaveAttribute('aria-disabled', 'true')
      fireEvent.click(launch)
      expect(props.onConfirm).not.toHaveBeenCalled()
    })

    it('solde inconnu : le doute n’interdit pas — le lancement reste actif', async () => {
      gate.value = { known: false, canAnalyze: true, canEnrich: true, locked: false }
      await renderPanel()
      expect(screen.getByRole('button', { name: "Lancer l'analyse" })).toBeEnabled()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })

  // Louis 10/10 + #4464 (PR11, rebranché sur la vérification Théo) — solde insuffisant pour le palier choisi : le frein
  // doux le DIT, sans chiffre, au geste qui lance ; Rapide n'est proposé que s'il est réellement permis.
  describe('Louis 10/10 — solde insuffisant pour « Approfondie »', () => {
    it('le dit SANS chiffre (frein doux), propose Rapide, et ne lance pas', async () => {
      const props = await renderPanel({ remaining: 7, selection: { depth: 'deep' } })
      const brake = screen.getByRole('status')
      expect(brake).toHaveTextContent(/Tu as beaucoup utilisé .* ce mois-ci — on en parle ?/)
      expect(brake).not.toHaveTextContent(/crédit|\b7\b|\b10\b|en pause/i)
      expect(screen.queryByRole('button', { name: /recharg|achet/i })).toBeNull()
      const launch = screen.getByRole('button', { name: "Lancer l'analyse" })
      expect(launch).toBeDisabled()
      expect(launch).toHaveAttribute('aria-disabled', 'true')
      expect(launch.closest('[data-testid="scope-confirm-actions"]')).toContainElement(brake)
      fireEvent.click(screen.getByRole('button', { name: 'Passer en Rapide' }))
      expect(props.onSelectionChange).toHaveBeenCalledWith({ depth: 'quick' })
      expect(props.onConfirm).not.toHaveBeenCalled()
    })

    it('sous 5 crédits, aucune bascule n’est proposée : le manque est dit, pas contourné', async () => {
      await renderPanel({ remaining: 3, selection: { depth: 'deep' } })
      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Passer en Rapide/ })).toBeNull()
    })

    it('Rapide choisi et refusé (solde 3) : frein doux, aucune proposition de Rapide', async () => {
      await renderPanel({ remaining: 3, selection: { depth: 'quick' } })
      expect(screen.getByRole('status')).not.toHaveTextContent(/Rapide/)
      expect(screen.queryByRole('button', { name: /Passer en Rapide/ })).toBeNull()
      expect(screen.getByRole('button', { name: "Lancer l'analyse" })).toHaveAttribute('aria-disabled', 'true')
    })

    it('solde suffisant ou inconnu : aucune alerte, le lancement reste actif', async () => {
      await renderPanel({ remaining: 10, selection: { depth: 'deep' } })
      expect(screen.queryByRole('status')).toBeNull()
      expect(screen.getByRole('button', { name: "Lancer l'analyse" })).toBeEnabled()
    })

    it('Rapide choisi avec 7 crédits : aucune alerte (5 ≤ 7)', async () => {
      await renderPanel({ remaining: 7, selection: { depth: 'quick' } })
      expect(screen.queryByRole('status')).toBeNull()
    })

    it('en relance, aucun frein de palier : le mini-plan ne débite pas le palier', async () => {
      await renderPanel({ remaining: 0, relaunch: true, selection: { depth: 'deep' } })
      expect(screen.queryByRole('status')).toBeNull()
    })
  })

  it('rassure sur ce que le geste ne fait pas : ni doublon, ni affaire, ni tâche, ni message', async () => {
    await renderPanel()
    expect(screen.getByText('Le même dossier, sans doublon.')).toBeInTheDocument()
    expect(screen.getByText('Ni affaire, ni tâche, ni message créé par ce geste.')).toBeInTheDocument()
  })
})
