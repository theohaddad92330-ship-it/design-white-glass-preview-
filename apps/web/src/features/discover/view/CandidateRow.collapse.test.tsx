import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { shiftLocalDays } from '@bellum/contracts'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => null }))
vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: (props: { label: string; alwaysVisible?: boolean; accountId?: string }) => (
    <span
      data-testid="ask-laura"
      data-always={String(Boolean(props.alwaysVisible))}
      data-account={props.accountId ?? ''}
    >
      {props.label}
    </span>
  ),
}))
vi.mock('./CandidateNotes', () => ({ CandidateNotes: () => null }))
// LUDB.3 — le vocabulaire suit le pack de l'espace (session) ; ici l'espace IT : libellés d'origine.
vi.mock('@/features/profile/hooks/usePackVocabulary', () => ({ usePackVocabulary: () => ({ context: undefined }) }))
vi.mock('./CandidateWrongCompanyAction', () => ({ CandidateWrongCompanyAction: () => null }))

import { CandidateRow } from './CandidateRow'

function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
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
    angle: 'Proposer un renfort DevOps',
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

// #3597.7 — le repliable : fermé par défaut, accessible, ce que montrait la carte.
describe('#3597.7 — le détail repliable d’une ligne', () => {
  it('est FERMÉ par défaut : ni angle, ni actions Laura, ni détail du score', () => {
    mount()
    const toggle = screen.getByRole('button', { name: /voir le détail du compte/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Proposer un renfort DevOps')).toBeNull()
    expect(screen.queryByText(/voir le détail du score/i)).toBeNull()
  })

  // G-FIX #4309 — recette PROD 20/10 : 0 bouton « Expliquer avec Laura » sur 10 cartes. Il vivait
  // dans le repliable (fermé) ET la course de la bulle effaçait l'instance gagnante.
  it('G-FIX #4309 — « Demander à Laura » est sur la carte FERMÉE, jamais effacé par la course', () => {
    mount()
    const buttons = screen.getAllByTestId('ask-laura').filter(n => /demander à laura/i.test(n.textContent ?? ''))
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAttribute('data-always', 'true')
    fireEvent.click(screen.getByRole('button', { name: /voir le détail du compte/i }))
    // un geste à UN seul endroit (GA-26) : l'ouvrir ne le double pas.
    expect(screen.getAllByTestId('ask-laura').filter(n => /demander à laura/i.test(n.textContent ?? ''))).toHaveLength(
      1,
    )
  })

  it('s’ouvre au clic : angle suggéré, détail du score, actions Laura', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /voir le détail du compte/i }))

    // Théo decouvrir.R6 — le détail s'ouvre en tiroir « Aperçu du compte », pas en dépliant la ligne.
    expect(screen.getByRole('dialog', { name: /aperçu du compte/i })).toBeInTheDocument()
    expect(screen.getByText('Proposer un renfort DevOps')).toBeInTheDocument()
    expect(screen.getByText(/voir le détail du score/i)).toBeInTheDocument()
    expect(screen.getAllByTestId('ask-laura').map(node => node.textContent)).toEqual(
      expect.arrayContaining(['Demander à Laura']),
    )
    // #4310.1 / #4308.1 — ces gestes sont retirés.
    for (const gone of ['Qualifier', "Vérifier aujourd'hui", 'Trouver les commerciaux'])
      expect(screen.queryByText(gone)).toBeNull()
    expect(screen.queryByRole('button', { name: /chercher les contacts/i })).toBeNull()
  })

  it('se referme par sa croix, et la liste reste telle qu’elle était', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /voir le détail du compte/i }))
    expect(screen.getByRole('dialog', { name: /aperçu du compte/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /fermer l’aperçu/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Proposer un renfort DevOps')).toBeNull()
  })

  it('les axes du verdict de passe rapide sont consultables dans le détail', () => {
    mount({ score: 65, scoreMax: 70, signalsSearched: true, people: [], signals: [] })
    expect(screen.queryByTestId('quick-pass-axes')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /voir le détail du compte/i }))
    expect(screen.getByTestId('quick-pass-axes')).toHaveTextContent(/ce qui compte/i)
  })

  // #3913 — « Axe pesé… je ne comprends rien à ce que ça veut dire » : plus de
  // jargon de barème à l'écran, le fond (axes nommés, non évaluables nommés)
  // reste intact.
  it('ne dit jamais « axe pesé » — vocabulaire de commercial (#3913)', () => {
    mount({ score: 65, scoreMax: 70, signalsSearched: true, people: [], signals: [] })
    fireEvent.click(screen.getByRole('button', { name: /voir le détail du compte/i }))
    expect(screen.getByTestId('quick-pass-axes').textContent).not.toMatch(/axe pesé|axes pesés/i)
  })
})

// #3597.3 / #3597.8 — le verdict est un MOT, jamais une probabilité ; absent si non calculable.
describe('#3597.3 — le badge de passe rapide', () => {
  it('porte un mot (Go / Prudence / Non) et aucun pourcentage', () => {
    mount({ score: 65, scoreMax: 70, signalsSearched: true, people: [], signals: [] })
    // #4068.3 — le badge vit dans le repliable.
    fireEvent.click(screen.getByRole('button', { name: /voir le détail du compte/i }))
    const badge = screen.getByTestId('quick-pass-badge')
    expect(badge.textContent).toMatch(/Go|Prudence|Non/)
    expect(badge.textContent).not.toMatch(/%|\d/)
  })

  it('est absent quand le verdict n’est pas calculable (score absent)', () => {
    mount({ score: null, scoreMax: null })
    expect(screen.queryByTestId('quick-pass-badge')).toBeNull()
  })
})

describe('#3597.8 — une valeur absente ne fait aucune ligne et ne s’affiche jamais « 0 »', () => {
  it('sans signal, pas de ligne « pourquoi maintenant »', () => {
    mount({ signals: [], signalsSearched: false })
    expect(screen.queryByTestId('candidate-facts')).toBeNull()
    expect(screen.queryByText(/signaux? daté/i)).toBeNull()
  })

  it('sans score, ni « 0/ » ni « score indisponible » dans la ligne', () => {
    mount({ score: null, scoreMax: null })
    expect(screen.queryByText(/0\//)).toBeNull()
    expect(screen.queryByText(/indisponible/i)).toBeNull()
  })

  it('sans effectif ni ville, aucune puce vide', () => {
    mount({ city: null, department: null, headcountRange: null })
    expect(screen.queryByText(/^0$/)).toBeNull()
  })

  // #4495 (Louis 24/10, maquette V22) — revient sur #4068 : la carte montre LE sujet et « N signaux forts » ;
  // les cinq faits forts (règle #4068 inchangée) se lisent dans l'aperçu du compte.
  it('#4068 / #4495 — cinq signaux forts au plus (dans l’aperçu), la carte dit le sujet et leur nombre', () => {
    const jobs = [
      'Architecte cloud',
      'Ingénieur câblage',
      'Développeur Java',
      'Chef de projet SAP',
      'Analyste SOC',
      'Data engineer',
    ]
    mount({
      signals: jobs.map((label, i) => ({ type: 'hiring' as const, label, date: shiftLocalDays(new Date(), -(i + 1)) })),
    })
    expect(screen.getByTestId('candidate-subject')).toHaveTextContent('Architecte cloud')
    expect(screen.getByTestId('candidate-counters')).toHaveTextContent('5 signaux forts')
    expect(screen.queryByTestId('candidate-facts')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /voir le détail du compte/i }))
    const facts = screen.getByTestId('candidate-facts')
    expect(facts.querySelectorAll('li')).toHaveLength(5)
    expect(facts).toHaveTextContent('Architecte cloud')
    expect(facts).not.toHaveTextContent('Data engineer')
    expect(screen.queryByRole('button', { name: /Voir plus/ })).toBeNull()
  })

  it('#4067.9 (R47) — dès qu’une autre nature existe, deux recrutements au plus parmi les forts ; le contexte reste à part', () => {
    const jobs = ['Architecte cloud', 'Ingénieur câblage', 'Développeur Java', 'Chef de projet SAP', 'Analyste SOC']
    mount({
      signals: [
        ...jobs.map((label, i) => ({ type: 'hiring' as const, label, date: shiftLocalDays(new Date(), -(i + 1)) })),
        {
          type: 'business' as const,
          label: 'Latécoère expose au salon du Bourget',
          date: shiftLocalDays(new Date(), -2),
        },
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: /voir le détail du compte/i }))
    const facts = screen.getByTestId('candidate-facts')
    expect(facts.querySelectorAll('li')).toHaveLength(2)
    expect(facts).toHaveTextContent('Architecte cloud')
    expect(facts).not.toHaveTextContent('Analyste SOC')
    expect(facts).not.toHaveTextContent('Bourget')
    expect(screen.queryByRole('button', { name: /Voir plus/ })).toBeNull()
  })
})

// #4068.3 — ligne allégée : nom, lieu, taille + faits + actions ; le reste est déplacé, pas supprimé.
describe('#4068.3 — la ligne est allégée, le détail garde tout', () => {
  const heavy = {
    score: 65,
    scoreMax: 70,
    signalsSearched: true,
    people: [],
    signals: [{ type: 'hiring' as const, label: 'Offre A', date: '2026-09-01' }],
  }

  it('fermée, la ligne ne porte ni score, ni palier de fit, ni passage rapide, ni famille', () => {
    mount(heavy)
    const row = screen.getByTestId('candidate-row')
    expect(screen.queryByTestId('candidate-row-badges')).toBeNull()
    expect(screen.queryByTestId('quick-pass-badge')).toBeNull()
    expect(row.textContent).not.toMatch(/65\s*\/\s*70/)
    expect(row.textContent).not.toMatch(/fit (élevé|moyen|faible)/i)
    // #4495 — la carte V22 : le sujet et sa nature, pas la liste des faits (elle est dans l'aperçu).
    expect(screen.getByTestId('candidate-subject')).toHaveTextContent('Offre A')
    expect(screen.getByTestId('candidate-nature-badge')).toBeInTheDocument()
  })

  it('ouverte, le détail porte les badges ET le score aux axes nommés', () => {
    mount(heavy)
    fireEvent.click(screen.getByRole('button', { name: /voir le détail du compte/i }))
    const badges = screen.getByTestId('candidate-row-badges')
    expect(badges.textContent).toMatch(/65\s*\/\s*70/)
    expect(screen.getByText(/voir le détail du score/i)).toBeInTheDocument()
  })
})
