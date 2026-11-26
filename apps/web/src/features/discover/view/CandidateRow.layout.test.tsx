import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => null }))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => null }))
vi.mock('./CandidateNotes', () => ({ CandidateNotes: () => null }))
vi.mock('./CandidateWrongCompanyAction', () => ({ CandidateWrongCompanyAction: () => null }))

import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CandidateRow } from './CandidateRow'

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'JILITI',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 60,
    scoreMax: 70,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

function mount(over: Partial<DiscoverCandidate> = {}) {
  return render(
    <CandidateRow
      candidate={candidate(over)}
      isFollowed={false}
      onToggleFollow={() => {}}
      onDismiss={() => {}}
      onAnalyze={() => {}}
    />,
  )
}

// Refonte Théo (23/10) — la ligne de compte est la `.d3-company` de la maquette : QUATRE colonnes dès 768 px —
// identité · ce qui se passe (les faits forts) · l'opportunité (ce qui a pesé) · les gestes. Sous 768 px, elles
// s'empilent (une colonne). Remplace #3597.14 (« la ligne 1 tient sur une rangée ») : ce que #3597.14 gardait — une
// identité qui ne s'écrase pas (#3082), un bloc d'actions qui rétrécit sans déborder (#3819) — est gardé ici.
describe('#4495 — la carte de compte en TROIS zones (maquette V22)', () => {
  const recent = new Date().toISOString().slice(0, 10)
  it.each([
    ['sans signal', {}],
    ['avec signal', { signals: [{ type: 'hiring' as const, label: 'Dev', date: recent }] }],
  ])('%s : identité · sujet · nature et gestes — dans cet ordre', (_l, over) => {
    mount(over)
    const row = screen.getByTestId('candidate-row')
    expect(row.tagName).toBe('ARTICLE')
    expect(row).toHaveAccessibleName('JILITI')
    expect(row.className).toContain('grid-cols-1')
    expect(row.className).toMatch(/md:grid-cols-\[minmax\(15rem,1fr\)_minmax\(16rem,1\.4fr\)_auto\]/)
    const zones = Array.from(row.children).map(zone => zone.getAttribute('data-testid'))
    expect(zones).toEqual(['candidate-zone-identity', 'candidate-zone-subject', 'candidate-zone-actions'])
    expect(screen.getByTestId('candidate-zone-identity')).toHaveTextContent('JILITI')
    const actions = screen.getByTestId('candidate-zone-actions')
    expect(actions.className).toContain('min-w-0')
    expect(actions.querySelectorAll('button').length).toBeGreaterThan(0)
    if ('signals' in over) expect(screen.getByTestId('candidate-subject')).toHaveTextContent('Dev')
  })

  it('gauche : nom · « secteur · ville » · tranche maison + effectif · « Déjà dans ton espace »', () => {
    mount({ sector: 'Banque', city: 'Paris', headcountRange: '250 à 499 salariés', portfolioState: 'customer' })
    const identity = screen.getByTestId('candidate-zone-identity')
    expect(identity).toHaveTextContent('Banque · Paris')
    expect(screen.getByTestId('candidate-size-band')).toHaveTextContent('ETI')
    expect(identity).toHaveTextContent('250 à 499 salariés')
    expect(screen.getByTestId('candidate-in-space')).toHaveTextContent('Déjà dans ton espace')
  })

  it('SAIT DIRE NON — un compte neuf ne se dit pas « dans ton espace », une taille absente ne fait pas de tranche', () => {
    mount({ portfolioState: 'new', headcountRange: null })
    expect(screen.queryByTestId('candidate-in-space')).toBeNull()
    expect(screen.queryByTestId('candidate-size-band')).toBeNull()
  })

  it('centre : étiquettes d’expertise, LE sujet en gras, sa nature en une ligne', () => {
    mount({
      technologiesObserved: ['Cloud'],
      signals: [{ type: 'hiring' as const, label: 'Architecte data', date: recent, technologies: ['Data', 'IA'] }],
    })
    const subject = screen.getByTestId('candidate-zone-subject')
    expect(
      within(subject)
        .getAllByRole('listitem')
        .map(tag => tag.textContent),
    ).toEqual(['Data', 'IA', 'Cloud'])
    expect(screen.getByTestId('candidate-subject')).toHaveTextContent('Architecte data')
    expect(screen.getByTestId('candidate-subject').className).toContain('font-semibold')
    expect(screen.getByTestId('candidate-subject-nature')).toHaveTextContent('Poste salarié publié')
  })

  it('droite : badge de nature, compteurs, suivre et chevron vers l’aperçu', () => {
    mount({
      knownNeedsCount: 1,
      signals: [{ type: 'hiring' as const, label: 'Architecte data', date: recent }],
    })
    expect(screen.getByTestId('candidate-nature-badge')).toHaveTextContent('Recrutement')
    expect(screen.getByTestId('candidate-counters')).toHaveTextContent('1 signal fort')
    expect(screen.getByTestId('candidate-counters')).toHaveTextContent('1 besoin connu')
    expect(screen.getByRole('button', { name: 'Suivre ce compte' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voir le détail du compte' })).toBeInTheDocument()
  })

  it('GA-18/19 — sans signal ni besoin mesuré : aucun badge, aucun compteur, jamais « 0 »', () => {
    mount({ knownNeedsCount: 0 })
    expect(screen.queryByTestId('candidate-nature-badge')).toBeNull()
    expect(screen.queryByTestId('candidate-counters')).toBeNull()
    expect(screen.getByTestId('candidate-row').textContent).not.toMatch(/\b0 (signal|besoin|historique)/)
  })

  it('les gestes d’avant ne sont pas perdus : dossier, écarter et faits datés vivent dans l’aperçu', async () => {
    renderWithRouter(
      <CandidateRow
        candidate={candidate({ signals: [{ type: 'hiring' as const, label: 'Architecte data', date: recent }] })}
        isFollowed={false}
        onToggleFollow={() => {}}
        onDismiss={() => {}}
        onAnalyze={() => {}}
      />,
    )
    await screen.findByTestId('candidate-row')
    expect(screen.queryByRole('button', { name: /construire le dossier/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Voir le détail du compte' }))
    const essentials = within(screen.getByTestId('candidate-essentials'))
    expect(essentials.getByRole('button', { name: /construire le dossier/i })).toBeInTheDocument()
    expect(essentials.getByRole('button', { name: 'Écarter' })).toBeInTheDocument()
    expect(essentials.getByTestId('candidate-facts')).toHaveTextContent('Architecte data')
  })

  it('une ligne sans signal n’a pas de ligne « pourquoi maintenant »', () => {
    mount()
    expect(screen.queryByTestId('why-now')).toBeNull()
  })
})
