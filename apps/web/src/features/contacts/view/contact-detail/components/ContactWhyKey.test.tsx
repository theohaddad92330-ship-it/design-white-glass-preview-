import { fireEvent, render, screen } from '@testing-library/react'
import type { Contact } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { ContactWhyKey } from './ContactWhyKey'

/**
 * #3692 — le bloc court de Laura : faits d'un côté, hypothèses « à vérifier »
 * de l'autre ; le narratif long est replié ; aucun trait psychologique.
 */
beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

function contact(extra: Record<string, unknown>): Contact {
  return { id: 'c1', account_id: 'a1', full_name: 'Amina Benali', decision_role: null, ...extra } as unknown as Contact
}

describe('ContactWhyKey (#3692)', () => {
  it('sépare les faits des hypothèses à vérifier, sous le nom de Laura', () => {
    render(
      <ContactWhyKey
        contact={contact({
          title: 'DSI',
          entity: 'Groupe Acme',
          key_points: ['Prise de poste récente'],
          why_contact: 'Pilote la refonte du SI.',
          decision_role: 'economic',
        })}
      />,
    )
    expect(screen.getByText('Lecture de Laura')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Faits' })).toBeInTheDocument()
    expect(screen.getByText('DSI — Groupe Acme')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hypothèses à vérifier' })).toBeInTheDocument()
    expect(screen.getByText('Pilote la refonte du SI.')).toBeInTheDocument()
    expect(screen.getByText(/Rôle probable dans la décision : Décideur économique/)).toBeInTheDocument()
    expect(screen.getByText(/Ce qui peut compter dans cet échange : Comment le budget/)).toBeInTheDocument()
  })

  it('ne montre jamais de trait psychologique, même présent dans la donnée', () => {
    render(<ContactWhyKey contact={contact({ career_levers: ['Ambition de devenir DG'], implicit_fears: ['Peur'] })} />)
    expect(screen.queryByText(/Ambition|Peur/)).not.toBeInTheDocument()
  })

  it('« Voir le détail » déplie le profil, replié par défaut', () => {
    render(<ContactWhyKey contact={contact({ key_points: ['Un point'], profile_summary: 'Parcours détaillé.' })} />)
    const toggle = screen.getByRole('button', { name: 'Voir le détail' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Parcours détaillé.')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByText('Parcours détaillé.')).toBeInTheDocument()
  })

  it('personne mal documentée : la vérification utile, pas de copie ni de faits inventés', () => {
    render(<ContactWhyKey contact={contact({})} />)
    expect(screen.getByText(/Peu documenté : confirme le poste actuel/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Faits' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copier' })).not.toBeInTheDocument()
  })

  it('copie un brief où faits et hypothèses restent séparés', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ContactWhyKey contact={contact({ title: 'DSI', why_contact: 'Motif' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copier' }))
    expect(writeText).toHaveBeenCalledWith('Faits\n- DSI\n\nHypothèses à vérifier\n- Motif')
  })

  it('copie les trois hypothèses affichées (rôle probable, motif, question), pas une seule', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ContactWhyKey contact={contact({ title: 'DSI', why_contact: 'Motif', decision_role: 'economic' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copier' }))
    const copied = writeText.mock.calls[0]?.[0] as string
    expect(copied).toMatch(/Rôle probable dans la décision : Décideur économique/)
    expect(copied).toContain('- Motif')
    expect(copied).toMatch(/Ce qui peut compter dans cet échange/)
  })

  it('contact sans poste ni rôle (Corentin Fabre) : « Peu documenté », ni Faits ni Hypothèses', () => {
    render(
      <ContactWhyKey
        contact={contact({
          full_name: 'Corentin Fabre',
          title: '',
          entity: 'Consultant indépendant',
          why_contact: 'Numéro laissé au standard.',
          key_points: ['Numéro recueilli au standard'],
        })}
      />,
    )
    expect(screen.getByText(/Peu documenté/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Faits' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Hypothèses à vérifier' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copier' })).not.toBeInTheDocument()
  })

  it('motif identique sur le parc (why_contact_shared) : retiré de la synthèse, le reste demeure', () => {
    render(
      <ContactWhyKey
        contact={contact({ title: 'DSI', why_contact: 'Contact clé pour vos offres.', why_contact_shared: true })}
      />,
    )
    expect(screen.queryByText('Contact clé pour vos offres.')).not.toBeInTheDocument()
    expect(screen.getByText('DSI')).toBeInTheDocument()
  })

  it('l’explication du score et les signaux liés restent à un clic, sans onglet de plus', () => {
    const onExplainScore = vi.fn()
    const onOpenSignals = vi.fn()
    render(
      <ContactWhyKey
        contact={contact({ title: 'DSI', signals: [{ type: 'hiring', title: 'Recrute' }] })}
        onExplainScore={onExplainScore}
        onOpenSignals={onOpenSignals}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Comment est-elle calculée ?' }))
    fireEvent.click(screen.getByRole('button', { name: 'Signaux liés (1)' }))
    expect(onExplainScore).toHaveBeenCalledTimes(1)
    expect(onOpenSignals).toHaveBeenCalledTimes(1)
  })

  it('employeur obsolète : la réserve déterminante est visible', () => {
    render(
      <ContactWhyKey
        contact={contact({
          title: 'DSI',
          contact_score_breakdown: [{ key: 'freshness', evaluated: true, points: 1, max: 10 }],
        })}
      />,
    )
    expect(screen.getByText('Employeur obsolète : à vérifier avant de le contacter')).toBeInTheDocument()
  })
})

// Théo B c5-fiche-contact `.focus-card` — « Pourquoi préparer cet échange » : le visage de Laura, la priorité en
// MOT (la maquette écrivait « priorité 8 / 9 sur trois axes » : interdit), et le geste contextuel dans la carte.
describe('ContactWhyKey — la carte focus de Théo (c5)', () => {
  it('titre, priorité en mot sans aucun nombre de points, et le geste passé en `action`', () => {
    const scored = contact({
      title: 'DSI',
      contact_score: 92,
      contact_score_breakdown: [
        { key: 'role', points: 28, max: 30, evaluated: true, proof: 'décideur' },
        { key: 'proximity', points: 0, max: 20, evaluated: false, proof: 'non rattaché' },
      ],
    })
    render(<ContactWhyKey contact={scored} action={<button type="button">Préparer la reprise</button>} />)
    expect(screen.getByRole('heading', { name: 'Pourquoi préparer cet échange' })).toBeInTheDocument()
    const priority = screen.getByTestId('contact-priority')
    expect(priority).toHaveTextContent('Top contact')
    expect(priority).toHaveTextContent('· priorité sur 2 axes')
    expect(priority.textContent).not.toMatch(/\/\s*\d|\b92\b/)
    const card = screen.getByTestId('contact-focus-card')
    expect(card).toContainElement(screen.getByRole('button', { name: 'Préparer la reprise' }))
  })
})

describe('ContactWhyKey — lot 758 : la pertinence, ses axes nommés, la joignabilité en pastille', () => {
  const breakdown = [
    { key: 'role', points: 30, max: 30, proof: 'décideur technique', evaluated: true },
    { key: 'proximity', points: 0, max: 20, proof: 'périmètre non rattaché', evaluated: false },
    { key: 'seniority', points: 12, max: 15, proof: 'Direction', evaluated: true },
    { key: 'angleFit', points: 25, max: 25, proof: 'aligné à ton offre', evaluated: true },
    { key: 'freshness', points: 10, max: 10, proof: 'annuaire professionnel vérifié', evaluated: true },
  ]

  it('nomme les axes sous le mot de pertinence, et l’axe non évaluable reste nommé', () => {
    render(<ContactWhyKey contact={contact({ title: 'Head of Data', contact_score_breakdown: breakdown })} />)
    const axes = screen.getByTestId('contact-priority-axes')
    expect(axes).toHaveTextContent('Poids dans la décision · Niveau hiérarchique · Rôle face à ton offre')
    expect(axes).toHaveTextContent('non évaluable : Proximité du périmètre')
    // La joignabilité n'est PAS un axe du score.
    expect(axes).not.toHaveTextContent('Joignable')
  })

  it('la pastille dit le meilleur canal connu, à côté du score — jamais dedans', () => {
    render(
      <ContactWhyKey
        contact={contact({ contact_score_breakdown: breakdown, contact_reachability: 'verified_email' })}
      />,
    )
    expect(screen.getByTestId('contact-reachability')).toHaveTextContent('Joignable : e-mail vérifié')
  })

  it('aucun canal connu : aucune pastille (jamais « injoignable »)', () => {
    render(<ContactWhyKey contact={contact({ contact_score_breakdown: breakdown, contact_reachability: null })} />)
    expect(screen.queryByTestId('contact-reachability')).not.toBeInTheDocument()
  })
})
