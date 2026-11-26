import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { PlanActionItem } from './PlanActionItem'

const item = { text: 'Contacter le DSI', deadline: 'Semaine 1' }

describe('PlanActionItem — deadline chip', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('shows the deadline produced by the analysis when no date is set yet', () => {
    // Regression: the chip rendered a bare « Échéance » even though the analysis
    // had produced one — the value existed but was dropped at display time.
    render(<PlanActionItem item={item} dueDate={null} onDueDateChange={vi.fn()} />)
    expect(screen.getByText('Semaine 1')).toBeInTheDocument()
  })

  it('reads as an explicit action when there is genuinely no deadline', () => {
    render(<PlanActionItem item={{ text: 'Contacter le DSI' }} dueDate={null} onDueDateChange={vi.fn()} />)
    expect(screen.getByText('Ajouter une échéance')).toBeInTheDocument()
  })

  it('prefers the persisted calendar date over the textual one', () => {
    render(<PlanActionItem item={item} dueDate="2026-03-04" onDueDateChange={vi.fn()} />)
    expect(screen.queryByText('Semaine 1')).not.toBeInTheDocument()
    expect(screen.getByText(/04/)).toBeInTheDocument()
  })

  it('shows a static badge when the item is not trackable', () => {
    render(<PlanActionItem item={item} />)
    expect(screen.getByText('Semaine 1')).toBeInTheDocument()
    expect(screen.queryByText('Ajouter une échéance')).not.toBeInTheDocument()
  })

  it('shows no deadline chip at all for an untrackable item without a deadline', () => {
    render(<PlanActionItem item={{ text: 'Contacter le DSI' }} />)
    expect(screen.queryByText('Ajouter une échéance')).not.toBeInTheDocument()
  })

  // #2107.32 — un lien externe (la Veille) doit pouvoir amener SA ligne, sans
  // second réglage de mise en avant : `anchorId` pose l'identifiant que
  // `revealTarget` va chercher (même contrat que la recherche transversale du
  // dossier, `dossierItemAnchorId`, #2128.50).
  it('porte l’identifiant de destination quand `anchorId` est fourni, absent sinon', () => {
    const { rerender } = render(<PlanActionItem item={item} anchorId="dossier-action-a1" />)
    expect(document.getElementById('dossier-action-a1')).toBe(screen.getByRole('button'))

    rerender(<PlanActionItem item={item} />)
    expect(document.getElementById('dossier-action-a1')).toBeNull()
  })
})

/**
 * Les échéances RELATIVES du pipeline (`J+10`, `M+3S+2`) — recette live du
 * 27/08/2026. Données à `new Date()`, elles rendaient le 1ᵉʳ octobre **2001** ;
 * `M+3S+2` rendait « Invalid Date ». Le jeton se lit, il ne se devine pas.
 */
describe('PlanActionItem — échéance relative', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  const relative = { text: 'Contacter le DSI', deadline: 'J+10' }

  it('date le jeton contre la date qui a produit le plan', () => {
    render(<PlanActionItem item={relative} deadlineBase="2026-08-27T09:12:00.000Z" />)
    expect(screen.getByText('06/09/2026')).toBeInTheDocument()
    expect(screen.queryByText(/2001/)).not.toBeInTheDocument()
  })

  it('sans base, DIT l’horizon en clair au lieu d’inventer une date', () => {
    render(<PlanActionItem item={relative} />)
    expect(screen.getByText('sous 10 jours')).toBeInTheDocument()
    expect(screen.queryByText(/2001/)).not.toBeInTheDocument()
  })

  it('ne rend jamais « Invalid Date » sur une forme composée', () => {
    render(<PlanActionItem item={{ text: 'Cadrage', deadline: 'M+3S+2' }} />)
    expect(screen.getByText('sous 104 jours')).toBeInTheDocument()
    expect(screen.queryByText(/Invalid/)).not.toBeInTheDocument()
  })
})

/**
 * #2123.25 / #2123.26 — le CANAL et le PORTEUR d'une action GÉNÉRÉE.
 *
 * `helpers/plan.ts` normalise `outil` (badge canal, ligne ~150) et
 * `responsable` (`MetaBadge`, ligne ~128) depuis `bellum_plan.py` ; l'écran les
 * câblait déjà. Ce qui manquait : aucun test n'affirmait le libellé RENDU —
 * on pouvait casser le badge sans faire rougir la suite.
 */
describe('PlanActionItem — canal et porteur d’une action générée', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('affiche le canal généré dans le badge — #2123.25', () => {
    render(<PlanActionItem item={{ text: 'Contacter le DSI', outil: 'linkedin' }} />)
    expect(screen.getByText('linkedin')).toBeInTheDocument()
  })

  it('affiche le porteur généré dans sa puce — #2123.26', () => {
    render(<PlanActionItem item={{ text: 'Contacter le DSI', responsable: 'Toi (fondateur)' }} />)
    expect(screen.getByText('Toi (fondateur)')).toBeInTheDocument()
  })
})

/**
 * #2715.1 (corrigé 23/09 — revue du coordinateur) — DEUX badges distincts,
 * jamais un seul « Succès » qui confondrait un e-mail VÉRIFIÉ et un geste
 * DÉCLARATIF (LinkedIn, un appel renseigné) — exactement ce que la doctrine
 * interdit : « "Fait" ne porte jamais de preuve d'envoi » (CLAUDE.md
 * § Doctrine, `c73_fait_ne_porte_pas_preuve_denvoi`). Le client se plaignait
 * justement que le plan ne distinguait pas LinkedIn de l'e-mail.
 */
describe('PlanActionItem — statut d’envoi (#2715.1)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('affiche « E-mail envoyé » — VÉRIFIÉ — quand `sendStatus` vaut `email_sent`', () => {
    render(<PlanActionItem item={{ text: 'Contacter le DSI' }} sendStatus="email_sent" />)
    expect(screen.getByText('E-mail envoyé')).toBeInTheDocument()
    expect(screen.queryByText('Marqué fait')).not.toBeInTheDocument()
  })

  it('affiche « Marqué fait » — DÉCLARATIF — quand `sendStatus` vaut `declared`, jamais « E-mail envoyé »', () => {
    render(<PlanActionItem item={{ text: 'Contacter le DSI' }} sendStatus="declared" />)
    expect(screen.getByText('Marqué fait')).toBeInTheDocument()
    expect(screen.queryByText('E-mail envoyé')).not.toBeInTheDocument()
  })

  it('n’affiche rien sans envoi enregistré — jamais un badge inventé', () => {
    render(<PlanActionItem item={{ text: 'Contacter le DSI' }} sendStatus={null} />)
    expect(screen.queryByText('E-mail envoyé')).not.toBeInTheDocument()
    expect(screen.queryByText('Marqué fait')).not.toBeInTheDocument()
  })
})
