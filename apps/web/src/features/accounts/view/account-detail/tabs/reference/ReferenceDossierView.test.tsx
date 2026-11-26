import { fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import type { ReferenceDossier } from '@bellum/contracts'
import { ReferenceDossierView } from './ReferenceDossierView'

const units = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ kind: 'Unité du relevé', name: `Unité ${i + 1}`, note: null }))

const DOSSIER: ReferenceDossier = {
  counts: { units: 55, historical_needs: 18, tjm_observations: 16, contacts: 49 },
  programmes: [
    {
      period: '2026-2027',
      statement_label: 'Relevé du 01/10/2026',
      title: 'Déploiement du portefeuille de paiement européen',
      summary: 'Le groupe déploie le portefeuille commun.',
      reading: 'Nouveau moyen de paiement à intégrer.',
      angle: 'Besoins d’intégration sur 2026-2027.',
    },
    {
      period: null,
      statement_label: 'Relevé du 01/10/2026',
      title: 'Orion',
      summary: null,
      reading: null,
      angle: null,
    },
  ],
  purchasing: [
    { title: 'Centrale d’achats groupe', note: 'Une structure centralise les achats.', reliability: 'Confirmé' },
    { title: 'Outil d’e-sourcing', note: 'Non établis publiquement.', reliability: 'Garde-fou' },
  ],
  organisation: [
    { label: 'Domaines & fonctions', units: units(2) },
    { label: 'Réseaux coopératifs', units: units(29) },
  ],
  expertises: [
    { label: 'Infrastructure, production et sécurité', count: 8 },
    { label: 'Data et réglementaire', count: 4 },
  ],
  tjm: [
    { channel: 'msp', observations: 9, min: 390, max: 700 },
    { channel: 'direct', observations: 7, min: 470, max: 941 },
  ],
  needs: Array.from({ length: 5 }, (_, i) => ({
    title: `Besoin ${i + 1}`,
    entity: 'Natixis',
    period: '2026-01',
    rate: i === 0 ? null : 500 + i,
  })),
  ecosystem: [
    {
      name: 'Capgemini',
      perimeter: 'Pilotage',
      nature: 'observed',
      observation: 'Groupement avec Talan',
      reserve: 'Aucun panel établi.',
    },
    {
      name: 'BearingPoint, Open',
      perimeter: null,
      nature: 'indirect',
      observation: 'Employeurs d’anciens',
      reserve: null,
    },
  ],
}

const SCOPE = 'périmètre France'

function renderView(overrides: Partial<React.ComponentProps<typeof ReferenceDossierView>> = {}) {
  const props = { dossier: DOSSIER, scopeNote: SCOPE, onAddAction: vi.fn(), ...overrides }
  render(<ReferenceDossierView {...props} />)
  return props
}

describe('ReferenceDossierView — Théo A comptes-fiche-reference', () => {
  it('annonce ce que le relevé compte', () => {
    renderView()
    expect(screen.getByText('55')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('16')).toBeInTheDocument()
    expect(screen.getByText('49')).toBeInTheDocument()
  })

  it('chaque section rappelle la portée de l’archive (N4)', () => {
    renderView()
    expect(
      screen.getAllByText(/Archive fournie · périmètre France · actualité non vérifiée/).length,
    ).toBeGreaterThanOrEqual(5)
  })

  it('TJM : un circuit à la fois, jamais de moyenne entre direct et intermédiaire', () => {
    renderView()
    const tjm = screen.getByRole('region', { name: 'TJM historiques' })
    expect(within(tjm).getByText('390–700')).toBeInTheDocument()
    expect(within(tjm).getByText('470–941')).toBeInTheDocument()
    expect(within(tjm).getByText(/pas de moyenne entre direct et intermédiaire/i)).toBeInTheDocument()
  })

  it('organisation : 12 unités puis « Voir les suivantes », rien de perdu', () => {
    renderView()
    const org = screen.getByRole('region', { name: 'Les entités à explorer' })
    expect(within(org).getAllByRole('listitem')).toHaveLength(12)
    fireEvent.click(within(org).getByRole('button', { name: /Voir les 19 suivantes/ }))
    expect(within(org).getAllByRole('listitem')).toHaveLength(31)
  })

  it('historique des besoins : « Non mesuré » quand le relevé ne publie pas de prix, jamais 0', () => {
    renderView()
    const needs = screen.getByRole('region', { name: 'Historique des besoins' })
    expect(within(needs).queryByText(/^0 €/)).not.toBeInTheDocument()
    fireEvent.click(within(needs).getByRole('button', { name: /Voir tout l’historique/ }))
    expect(within(needs).getByText('Prix non publié')).toBeInTheDocument()
  })

  it('écosystème : le signal indirect se distingue de l’observation, avec sa réserve', () => {
    renderView()
    const eco = screen.getByRole('region', { name: 'Les acteurs de l’écosystème' })
    expect(within(eco).getByText('Signal indirect')).toBeInTheDocument()
    fireEvent.click(within(eco).getAllByRole('button', { name: 'Détail & réserve' })[0] as HTMLElement)
    expect(within(eco).getByText('Aucun panel établi.')).toBeInTheDocument()
  })

  it('programme : « Préparer un angle » et « Ajouter une vérification » créent une action du plan', () => {
    const { onAddAction } = renderView()
    const first = screen.getByRole('article', { name: /Déploiement du portefeuille de paiement européen/ })
    expect(within(first).getByText('Interprétation du relevé, pas demande confirmée.')).toBeInTheDocument()
    fireEvent.click(within(first).getByRole('button', { name: 'Préparer un angle sur ce sujet' }))
    expect(onAddAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: expect.stringContaining('Déploiement du portefeuille'), target: null }),
    )
    fireEvent.click(within(first).getByRole('button', { name: 'Ajouter une vérification' }))
    expect(onAddAction).toHaveBeenCalledTimes(2)
  })

  it('un programme non daté n’affiche aucune période inventée', () => {
    renderView()
    const orion = screen.getByRole('article', { name: /Orion/ })
    expect(within(orion).getByText(/Période non datée/)).toBeInTheDocument()
  })
})

describe('#4805 — un bloc vide du dossier de référence se NOMME', () => {
  it('chaque bloc sans donnée dit ce qui manque au lieu de disparaître', () => {
    renderView({
      dossier: {
        ...DOSSIER,
        purchasing: [],
        organisation: [],
        expertises: [],
        tjm: [],
        needs: [],
        ecosystem: [],
        programmes: [],
      },
    })
    for (const key of ['purchasing', 'structure', 'expertises', 'tjm', 'needs', 'ecosystem', 'programmes']) {
      expect(screen.getByTestId(`reference-absence-${key}`)).toBeInTheDocument()
    }
    expect(screen.getByTestId('reference-absence-tjm')).toHaveTextContent('TJM historiques')
  })
})
