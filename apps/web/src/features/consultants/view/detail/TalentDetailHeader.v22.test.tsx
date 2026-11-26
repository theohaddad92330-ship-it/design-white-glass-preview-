import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Consultant, TalentRow } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { TalentDetailHeader } from './TalentDetailHeader'

vi.mock('../TalentPhotoUpload', () => ({ TalentPhotoUpload: () => null }))

/**
 * #4576.5 / #4576.9 (arbitrage Louis 01/11) — l'en-tête suit la maquette V22 (`talentDetail`, Bellum_V22_Produit_Complet) :
 * UN titre, UNE ligne d'identité (métier · lieu), UNE ligne de méta (statut · « suivi par » · mise à jour), les gestes
 * À DROITE. Le statut ne vit plus sur la ligne du titre, « suivi par » et la date ne tombent plus sous les gestes.
 * Les fonctions existantes (trois gestes, assignation du référent, TJM) restent, sans quatrième bouton.
 */
const talent = {
  id: 't1',
  full_name: 'Nadia Berrada',
  title: 'Architecte data',
  kind: 'consultant',
  seniority: 'senior',
  years_experience: 12,
  contract_type: 'freelance',
  engagement_kind: 'freelance',
  availability: 'immediate',
  tjm: 650,
  zones: ['Lyon'],
  location: 'Lyon',
  contact_visible: true,
  mobility: { zones: [], remote: null, travel: null },
  owner_user_id: 'u1',
  owner_name: 'Théo Martin',
  archived_at: null,
  updated_at: '2026-09-20T10:00:00.000Z',
} as unknown as Consultant

const row = { id: 't1', photoUrl: null, reviewStatus: 'needs_review' } as unknown as TalentRow

function renderHeader() {
  return render(
    <TalentDetailHeader
      talent={talent}
      row={row}
      rowIsLoading={false}
      talentName="Nadia Berrada"
      hasCurrentMission={false}
      onViewMissions={() => undefined}
      onAddToNeed={() => undefined}
      onPrepareMessage={() => undefined}
      ownerCandidates={[]}
      onSetOwner={() => undefined}
      settingOwner={false}
    />,
  )
}

describe('TalentDetailHeader — forme de la maquette V22 (#4576.5 / #4576.9)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('une ligne de méta réunit « suivi par » et la mise à jour, SOUS le titre et AVANT les gestes', () => {
    renderHeader()
    const meta = document.querySelector('[data-talent-meta]') as HTMLElement
    expect(meta).not.toBeNull()
    expect(meta.textContent).toContain('Théo Martin')
    expect(meta.textContent).toContain('Mis à jour le')
    const h1 = screen.getByRole('heading', { level: 1 })
    const actions = screen.getByRole('group', { name: /gestes|actions/i })
    // h1 → méta → gestes, dans l'ordre du document (la maquette met les gestes à droite de l'identité).
    expect(h1.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(meta.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('le statut vit sur la ligne de méta, plus sur la ligne du titre', () => {
    renderHeader()
    const meta = document.querySelector('[data-talent-meta]') as HTMLElement
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(meta.textContent).toContain('Fiche incomplète')
    expect(h1.parentElement?.textContent).not.toContain('Fiche incomplète')
  })

  it('le lieu rejoint la ligne d’identité (« métier · lieu »), sans seconde ligne', () => {
    renderHeader()
    const header = screen.getByRole('region', { name: 'Nadia Berrada' })
    expect(header.textContent).toContain('Architecte data')
    expect(header.textContent).toContain('Lyon')
  })

  it('garde trois gestes au plus et l’assignation du référent (fonctions existantes)', () => {
    renderHeader()
    const actions = screen.getByRole('group', { name: /gestes|actions/i })
    expect(actions.querySelectorAll('button').length).toBeLessThanOrEqual(3)
    expect(screen.getByRole('button', { name: /assigner|attribuer|référent/i })).toBeInTheDocument()
  })
})
