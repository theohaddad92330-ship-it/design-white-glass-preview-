import type { MeetingCascade as Cascade } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CrmDealPipelines } from '@/features/crm/api'
import { i18n } from '@/i18n'
import { MeetingCascade } from './MeetingCascade'

/**
 * #1934.18 — LA CARTE « MISE À JOUR CRM » DEMANDE L'AFFAIRE ET LE STADE RÉELS.
 *
 * Le compte rendu propose un LIBELLÉ de stade (« Négociation ») ; il ne sait ni
 * quelle affaire du CRM il désigne, ni quel IDENTIFIANT de stade lui correspond
 * — et `dealstage` n'accepte qu'un identifiant. Valider sans les deux
 * déplacerait une affaire que personne n'a nommée, ou partirait avec un libellé
 * que le CRM refuse.
 *
 * Les trois obligations d'une garde :
 *  - elle LIT quelque chose (la cascade rendue porte bien sa carte, comptée) ;
 *  - elle sait dire NON (sans affaire ET stade réels, ou stades illisibles,
 *    « Valider » est fermé, et la raison est écrite) ;
 *  - elle n'attrape pas ce qu'elle ne vise pas (témoin : la carte « Compte
 *    rendu », voisine et sans cible, garde son bouton ouvert).
 */

const CASCADE: Cascade = {
  cards: [
    {
      kind: 'recap',
      position: 1,
      band: 'a1',
      state: 'to_validate',
      itemCount: 1,
      evidence: [{ kind: 'notes-derived' }],
      reachesOutside: false,
    },
    {
      kind: 'crm_stage',
      position: 7,
      band: 'a2',
      state: 'stage_proposed',
      itemCount: 1,
      evidence: [{ kind: 'notes-derived' }],
      reachesOutside: false,
    },
  ],
  summary: {
    internalWrites: [{ kind: 'crm_stage', count: 1 }],
    externalDrafts: [],
    estimatedCredits: 0,
    sources: [],
    droppedWithoutEvidence: 0,
  },
}

const PIPELINES: CrmDealPipelines = {
  status: 'ready',
  pipelines: [
    {
      id: 'default',
      label: 'Pipeline commercial',
      stages: [
        { id: 'appointmentscheduled', label: 'Découverte' },
        { id: 'contractsent', label: 'Négociation' },
      ],
    },
  ],
}
const DEAL = { id: 'hs-deal-42', name: 'ACME — TMA Data', stage: 'appointmentscheduled', pipeline: 'default' }

type Target = NonNullable<Parameters<typeof MeetingCascade>[0]['stageTarget']>

function target(overrides: Partial<Target> = {}): Target {
  return {
    crmConnected: true,
    deals: [DEAL],
    pipelines: PIPELINES,
    selectedDealId: 'hs-deal-42',
    selectedStageId: 'contractsent',
    proposedStage: 'Négociation',
    onSelectDeal: vi.fn(),
    onSelectStage: vi.fn(),
    ...overrides,
  }
}

function renderCascade(stageTarget: Target) {
  return render(
    <MeetingCascade
      cascade={CASCADE}
      fromTranscript={false}
      onApprove={vi.fn()}
      approving={false}
      stageTarget={stageTarget}
    />,
  )
}

/** Le bouton « Valider » de la carte dont le titre est passé. */
function validateButtonOf(title: string): HTMLButtonElement {
  const card = screen.getByText(title).closest('div.flex.flex-col')
  if (!card) throw new Error(`Carte introuvable : ${title}`)
  const button = Array.from(card.querySelectorAll('button')).find(node => node.textContent?.includes('Valider'))
  if (!button) throw new Error(`Bouton « Valider » introuvable sur : ${title}`)
  return button as HTMLButtonElement
}

describe('#1934.18 — la carte de stade CRM ne valide rien sans affaire ET stade réels', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('elle LIT quelque chose : les deux cartes sont rendues, et le pipeline est nommé', () => {
    renderCascade(target())
    expect(CASCADE.cards).toHaveLength(2)
    expect(screen.getByText('Mise à jour CRM')).toBeInTheDocument()
    expect(screen.getByText('Compte rendu structuré')).toBeInTheDocument()
    expect(screen.getByText(/Pipeline : Pipeline commercial/)).toBeInTheDocument()
  })

  it('une affaire et un stade RÉELS choisis ouvrent le bouton', () => {
    renderCascade(target())
    expect(validateButtonOf('Mise à jour CRM')).toBeEnabled()
  })

  it('sait dire NON : aucune affaire choisie ⇒ fermé', () => {
    renderCascade(target({ selectedDealId: '', selectedStageId: '' }))
    expect(validateButtonOf('Mise à jour CRM')).toBeDisabled()
  })

  it('sait dire NON : un LIBELLÉ à la place de l’identifiant ⇒ fermé', () => {
    renderCascade(target({ selectedStageId: 'Négociation' }))
    expect(validateButtonOf('Mise à jour CRM')).toBeDisabled()
  })

  it('sait dire NON : stades illisibles ⇒ fermé, et la raison est ÉCRITE', () => {
    renderCascade(target({ pipelines: { status: 'unreadable', reason: 'scope_missing', pipelines: [] } }))
    expect(validateButtonOf('Mise à jour CRM')).toBeDisabled()
    expect(screen.getByText(/n’autorise pas la lecture de ses stades/)).toBeInTheDocument()
  })

  it('sait dire NON : pipeline de l’affaire introuvable ⇒ fermé, et la raison est ÉCRITE', () => {
    renderCascade(target({ deals: [{ ...DEAL, pipeline: '8812' }] }))
    expect(validateButtonOf('Mise à jour CRM')).toBeDisabled()
    expect(screen.getByText(/pipeline de cette affaire n’a pas été retrouvé/)).toBeInTheDocument()
  })

  it('un stade proposé sans égalité EXACTE est dit, jamais rapproché', () => {
    renderCascade(target({ proposedStage: 'négociation', selectedStageId: '' }))
    expect(screen.getByText(/ne correspond exactement à aucun stade/)).toBeInTheDocument()
    expect(validateButtonOf('Mise à jour CRM')).toBeDisabled()
  })

  it('TÉMOIN — la carte voisine, qui n’a pas de cible, garde son bouton ouvert', () => {
    renderCascade(target({ selectedDealId: '', selectedStageId: '' }))
    // Si cette ligne tombait, la garde aurait fermé tout l'écran au lieu d'une
    // seule carte.
    expect(validateButtonOf('Compte rendu structuré')).toBeEnabled()
  })

  it('« aucun CRM branché » et « aucune affaire ouverte » sont DEUX phrases', () => {
    const { unmount } = renderCascade(target({ crmConnected: false, deals: [] }))
    expect(screen.getByText(/Aucun CRM branché/)).toBeInTheDocument()
    unmount()

    renderCascade(target({ deals: [] }))
    expect(screen.getByText(/Aucune affaire ouverte/)).toBeInTheDocument()
  })
})
