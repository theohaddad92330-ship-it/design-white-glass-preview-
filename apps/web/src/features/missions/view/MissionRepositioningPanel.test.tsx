import { cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MissionView } from '../api'
import { MissionRepositioningPanel } from './MissionRepositioningPanel'

const MISSION_ID = '11111111-1111-4111-8111-111111111111'

function mission(overrides: Partial<MissionView> = {}): MissionView {
  return {
    id: MISSION_ID,
    workspace_id: '44444444-4444-4444-8444-444444444444',
    account_id: '22222222-2222-4222-8222-222222222222',
    opportunity_id: null,
    label: 'Migration du socle applicatif',
    status: 'active',
    started_on: '2026-01-05',
    ends_on: '2026-12-31',
    daily_rate: 620,
    daily_cost: 400,
    contract_kind: 'regie',
    role_title: 'Ingénieure plateforme',
    billing_contact_id: null,
    owner_id: null,
    stage_entered_at: null,
    created_at: '2026-01-05T09:00:00.000Z',
    updated_at: '2026-09-01T09:00:00.000Z',
    marginPercent: 35,
    renewal: 'j30',
    assignees: [],
    ...overrides,
  } as MissionView
}

beforeEach(() => {
  cleanup()
})

describe('MissionRepositioningPanel — #2986 (#2414.34-.48), l’appelant qui manquait', () => {
  it('ne rend RIEN sans repositionTrigger (API plus ancienne que ce champ)', () => {
    const { container } = render(<MissionRepositioningPanel mission={mission()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend RIEN sur `pas_encore` — on n’affiche pas ce qu’on n’a pas', () => {
    const { container } = render(
      <MissionRepositioningPanel
        mission={mission({
          repositionTrigger: { state: 'pas_encore', reasonKey: 'tier_far' },
          repositionReasons: ['tier_far'],
        })}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend RIEN sur `non_mesure`', () => {
    const { container } = render(
      <MissionRepositioningPanel
        mission={mission({
          repositionTrigger: { state: 'non_mesure', reasonKey: 'no_end_date' },
          repositionReasons: ['no_end_date'],
        })}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('sur `a_commencer`, NOMME chaque raison qui tient (jamais une seule)', () => {
    render(
      <MissionRepositioningPanel
        mission={mission({
          repositionTrigger: { state: 'a_commencer', reasonKey: 'tier_close' },
          repositionReasons: ['tier_close', 'partners', 'relations'],
        })}
      />,
    )
    // #2986 — l'échéance est nommée ICI (fenêtre j30), et nulle part ailleurs (GA-26).
    expect(screen.getByText('La fin approche : un mois.')).toBeInTheDocument()
    expect(screen.getByText('Un partenaire est déjà connu sur le compte client.')).toBeInTheDocument()
    expect(screen.getByText('Une relation déclarée existe déjà sur le compte client.')).toBeInTheDocument()
  })

  // #2986 (recette démo 10/10) — le mot « Repositionnement » apparaissait deux fois : l'étape de la bande
  // et le titre de ce bloc. L'étape garde le mot ; le bloc dit POURQUOI.
  it('#2986 : le titre du bloc n’est pas « Repositionnement » (déjà le nom de l’étape de la bande)', () => {
    render(
      <MissionRepositioningPanel
        mission={mission({
          repositionTrigger: { state: 'a_commencer', reasonKey: 'partners' },
          repositionReasons: ['partners'],
        })}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Pourquoi repositionner' })).toBeInTheDocument()
    expect(screen.queryByText('Repositionnement')).not.toBeInTheDocument()
  })

  // #2986 — décision Louis 10/10 : l'échéance se NOMME dans ce bloc (la bande se tait quand il est affiché).
  it('#2986 — la seule raison est l’échéance : le bloc la nomme (fenêtre de renouvellement)', () => {
    render(
      <MissionRepositioningPanel
        mission={mission({
          renewal: 'j30',
          repositionTrigger: { state: 'a_commencer', reasonKey: 'tier_close' },
          repositionReasons: ['tier_close'],
        })}
      />,
    )
    expect(screen.getAllByText('La fin approche : un mois.')).toHaveLength(1)
  })

  it('nomme le TEXTE de chaque contrainte déclarée, avec le nom du consultant', () => {
    render(
      <MissionRepositioningPanel
        mission={mission({
          repositionTrigger: { state: 'a_commencer', reasonKey: 'constraints' },
          repositionReasons: ['constraints'],
          repositionConstraints: [
            { consultantName: 'Inès Kaczmarek', kind: 'mobility', text: 'Télétravail uniquement, Île-de-France.' },
          ],
        })}
      />,
    )
    expect(screen.getByText('Inès Kaczmarek — Télétravail uniquement, Île-de-France.')).toBeInTheDocument()
  })

  it('n’annonce JAMAIS une disponibilité — aucun mot « disponible » dans le panneau', () => {
    render(
      <MissionRepositioningPanel
        mission={mission({
          repositionTrigger: { state: 'a_commencer', reasonKey: 'ending_confirmed' },
          repositionReasons: ['ending_confirmed'],
        })}
      />,
    )
    expect(screen.queryByText(/disponible/i)).not.toBeInTheDocument()
  })
})
