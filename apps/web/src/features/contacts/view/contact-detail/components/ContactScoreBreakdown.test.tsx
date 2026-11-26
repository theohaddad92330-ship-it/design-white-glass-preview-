import type { Contact } from '@bellum/contracts'
import { computeContactScore, computeContactScoreBreakdown } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContactScoreBreakdown, SCORE_BREAKDOWN_ID } from './ContactScoreBreakdown'
import { contactScoreView } from '../contactDerive'

// A technical decider, verified email, Apollo source, placed by the ACCOUNT
// cartography in a P1 perimeter and matching a recommended angle. The API ships
// both the score and the criteria that explain it — the browser never re-derives
// the grid from the contact row alone (that context-less copy is what made the
// header and this card disagree, 79 vs 69).
const SCORE_INPUT = {
  title: 'DSI',
  role: 'technical',
  email: 'jean@acme.com',
  emailVerified: true,
  source: 'apollo',
  perimeterTier: 'P1',
  angleMatch: true,
} as const

function contactWith(input: Parameters<typeof computeContactScoreBreakdown>[0]): Contact {
  return {
    id: 'c1',
    account_id: 'a1',
    full_name: 'Jean Dupont',
    title: input.title ?? null,
    decision_role: input.role ?? null,
    email: input.email ?? null,
    email_verified: input.emailVerified ?? false,
    source: input.source ?? null,
    linkedin_url: input.linkedinUrl ?? null,
    contact_score: computeContactScore(input),
    contact_score_breakdown: computeContactScoreBreakdown(input),
  } as unknown as Contact
}

const CONTACT = contactWith(SCORE_INPUT)

describe('ContactScoreBreakdown', () => {
  // #4585 — « Comment est-elle calculée ? » amène au détail ET y pose le focus (`revealContactAnchor` focalise une
  // ancre `[tabindex]`) : au clavier, on arrive dans le bloc, pas seulement devant.
  it('#4585 — l’ancre du détail reçoit le focus quand le lien y amène', () => {
    render(<ContactScoreBreakdown contact={CONTACT} />)
    const anchor = document.getElementById(SCORE_BREAKDOWN_ID)
    expect(anchor?.getAttribute('tabindex')).toBe('-1')
  })

  it('lot 758 — rend les 5 axes de PERTINENCE avec leurs libellés ; la joignabilité n’en est pas un', () => {
    render(<ContactScoreBreakdown contact={CONTACT} />)
    for (const label of [
      'Poids dans la décision',
      'Proximité du périmètre',
      'Niveau hiérarchique',
      'Rôle face à ton offre',
      'Fraîcheur du poste',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryByText('Joignable')).not.toBeInTheDocument()
    expect(screen.queryByText('email vérifié')).not.toBeInTheDocument()
  })

  // Théo B c5 — « aucun score en points » : la priorité en MOT, chaque axe en niveau (fort · moyen · faible).
  it('écrit la priorité en mot et chaque axe en niveau, sans aucun nombre de points', () => {
    const { container } = render(<ContactScoreBreakdown contact={CONTACT} />)
    // 95 → « Top contact » ; rôle 28/30 → fort, périmètre P1 20/20 → fort.
    expect(screen.getByText('Top contact')).toBeInTheDocument()
    expect(screen.getByTestId('score-criterion-role')).toHaveTextContent('fort')
    expect(screen.getByTestId('score-criterion-proximity')).toHaveTextContent('fort')
    expect(container.textContent).not.toMatch(/\/100|pts|\b95\b|\b28\b/)
  })

  it('un seul calcul : le mot vient du même total que la fiche', () => {
    render(<ContactScoreBreakdown contact={CONTACT} />)
    expect(contactScoreView(CONTACT).total).toBe(CONTACT.contact_score)
    expect(screen.getByText('Calculée sur 5 axes')).toBeInTheDocument()
  })

  /**
   * Le total passe par la primitive, et la primitive reçoit les VRAIS axes.
   *
   * La carte recodait à la main ce que `ScoreWithAxes` fait — total sur son
   * maximum, axes non évaluables sortis du dénominateur et nommés. Deux
   * implémentations de la même règle divergent : celle-ci écrivait déjà son
   * total avec une couleur en dur, que le thème clair ne suivait pas.
   *
   * Ce test verrouille le câblage : si la carte passait un tableau d'axes VIDE
   * à la primitive, le « · 2 axe(s) non évaluable(s) » disparaîtrait et le
   * total redeviendrait un nombre nu.
   */
  it('nomme les axes non évaluables, qui sortent du calcul sans compter comme zéro', () => {
    const noContext = contactWith({ title: 'DSI', role: 'technical', email: 'j@a.com', source: 'apollo' })
    render(<ContactScoreBreakdown contact={noContext} />)
    expect(
      screen.getByText('2 axes non évaluables sortent du calcul : ils ne sont pas comptés comme zéro.'),
    ).toBeInTheDocument()
    // …et le pourcentage reste interdit : un score n'est pas une chance.
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('renders a proof per criterion (score qui explique pourquoi)', () => {
    render(<ContactScoreBreakdown contact={CONTACT} />)
    // Each criterion ties its points to a real signal.
    expect(screen.getByText('décideur technique')).toBeInTheDocument()
    expect(screen.getByText("colle à l'angle recommandé")).toBeInTheDocument()
    expect(screen.getByText('annuaire professionnel vérifié')).toBeInTheDocument()
    expect(screen.getByText('périmètre prioritaire (P1)')).toBeInTheDocument()
  })

  /**
   * La preuve nomme la CAPACITÉ, jamais l'éditeur (arbitrage du 02/08/2026).
   *
   * ⚠️ Ce test disait l'INVERSE : il exigeait « Apollo (annuaire vérifié) » à
   * l'écran, donc il VERROUILLAIT la violation — un test qui protège
   * l'infraction plutôt que la règle. La preuve descend de
   * `computeContactScoreBreakdown` (`@bellum/contracts`) et est rendue BRUTE
   * ligne 97 : la seule garde d'écran, GA-44, ne lit que `apps/web/src` et ne
   * pouvait donc pas la voir arriver.
   *
   * La fiche contact n'est pas Réglages › Intégrations : le commercial n'y
   * autorise aucun accès, il lit pourquoi ce contact vaut 95/100.
   */
  it('n’affiche AUCUN nom de fournisseur dans les preuves (doctrine 02/08)', () => {
    const { container } = render(<ContactScoreBreakdown contact={CONTACT} />)
    const shown = container.textContent ?? ''
    // Le corpus n'est pas vide — sinon l'absence ci-dessous ne prouverait rien.
    expect(shown.length).toBeGreaterThan(100)
    for (const vendor of ['Apollo', 'Pappers', 'Firecrawl', 'SalesQL', 'Dropcontact']) {
      expect(shown).not.toContain(vendor)
    }
    // …y compris sur une fiche dont la source EST le registre d'entreprises.
    const fromRegistry = contactWith({ ...SCORE_INPUT, source: 'pappers' })
    const registry = render(<ContactScoreBreakdown contact={fromRegistry} />)
    expect(registry.container.textContent).toContain('registre public des entreprises')
    expect(registry.container.textContent).not.toContain('Pappers')
  })

  it('scores an unevaluable criterion at 0 without inventing a bonus', () => {
    const bare = contactWith({ title: 'DSI', role: null, email: null, emailVerified: false, source: 'apollo' })
    render(<ContactScoreBreakdown contact={bare} />)
    // role → 0/30 (no weighted role), documented — « faible », jamais « 0 ». Lot 758 : aucun canal ne coûte
    // plus rien, la joignabilité est une pastille hors de cette carte.
    expect(screen.getByTestId('score-criterion-role')).toHaveTextContent('faible')
    expect(screen.getByText('rôle non déterminé')).toBeInTheDocument()
    expect(screen.queryByTestId('score-criterion-accessibility')).not.toBeInTheDocument()
  })

  it('marks a criterion with no account context as NOT evaluated, and says so in the coverage line', () => {
    // Same person, but the account carries no cartography and no angles.
    const noContext = contactWith({ title: 'DSI', role: 'technical', email: 'j@a.com', source: 'apollo' })
    render(<ContactScoreBreakdown contact={noContext} />)
    // Proximité + fit angle are shown as unevaluated rather than scored a middle.
    expect(screen.getAllByText('non évaluable')).toHaveLength(2)
    expect(screen.getByText('périmètre non rattaché')).toBeInTheDocument()
    expect(screen.getByText('angle non évalué')).toBeInTheDocument()
    // …and the card says the unevaluable axes leave the calculation.
    expect(screen.getByText(/sortent du calcul/)).toBeInTheDocument()
  })

  it('renders nothing when the server shipped no breakdown (no invented explanation)', () => {
    const noBreakdown = { ...CONTACT, contact_score_breakdown: null } as Contact
    const { container } = render(<ContactScoreBreakdown contact={noBreakdown} />)
    expect(container).toBeEmptyDOMElement()
  })
})
