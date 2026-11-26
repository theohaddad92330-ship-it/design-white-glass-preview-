import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2074.12 — L'APPELANT : `useCommercialAudit()` relie le bandeau du vivier
 * (`useTalentStats`) aux règles de tension. Sans ce câblage, le mouvement
 * « un engagement à faire avancer » ne pouvait sortir sur aucun espace réel.
 */
const talentStats = vi.fn()
const submissions = vi.fn()
const renewals = vi.fn()
const needsSignals = vi.fn()
const contactFollowUpStats = vi.fn()

vi.mock('@/features/consultants/hooks', () => ({ useTalentStats: () => talentStats() }))
vi.mock('@/features/submissions/api', () => ({ useSubmissions: () => submissions() }))
vi.mock('@/features/missions/api', () => ({ useRenewals: () => renewals() }))
vi.mock('@/features/projects/open-needs/hooks/useOpenNeeds', () => ({
  useOpenNeedsCommercialAuditSignals: () => needsSignals(),
}))
vi.mock('@/features/contacts/hooks/useContactFollowUpStats', () => ({
  useContactFollowUpStats: () => contactFollowUpStats(),
}))
vi.mock('@/features/actions/hooks/useMyActions', () => ({ useMyActions: () => ({ data: [], isLoading: false }) }))
vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useOnboardingState: () => ({ data: { answers: {} }, isLoading: false }),
}))
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({
  useProfileContext: () => ({ data: null, isLoading: false }),
}))
vi.mock('@/features/profile-context/hooks/useProfileContextRevisions', () => ({
  useProfileContextRevisions: () => ({ data: [], isLoading: false }),
}))

const { useCommercialAudit } = await import('./useCommercialAudit')

const stats = (availableNow: number) => ({
  data: {
    total: 12,
    availableNow,
    availabilityUnknownCount: 4,
    enrichedPercent: null,
    refreshedThisWeekPercent: null,
    lastUpdatedAt: null,
  },
})

describe('#2074.12 — useCommercialAudit relie le vivier réel', () => {
  beforeEach(() => {
    talentStats.mockReset()
    submissions.mockReturnValue({ data: undefined, isLoading: false })
    renewals.mockReturnValue({ data: undefined, isLoading: false })
    needsSignals.mockReturnValue({ data: undefined, isLoading: false })
    contactFollowUpStats.mockReturnValue({ data: undefined, isLoading: false })
  })

  it('un vivier connu sans disponible fait sortir la rupture « vivier sans disponibilité »', () => {
    talentStats.mockReturnValue(stats(0))
    const { result } = renderHook(() => useCommercialAudit())
    const rules = (result.current.auditContext.contradictions ?? []).map(item => item.ruleId)
    expect(rules).toContain('poolWithoutAvailability')
  })

  it('sait dire NON — statistiques non lues : aucune rupture de vivier inventée', () => {
    talentStats.mockReturnValue({ data: undefined })
    const { result } = renderHook(() => useCommercialAudit())
    const rules = (result.current.auditContext.contradictions ?? []).map(item => item.ruleId)
    expect(rules).not.toContain('poolWithoutAvailability')
  })
})

/**
 * #2842 (épopée #2074.13-.19) — deux producteurs réels de plus, MÊME câblage
 * que le vivier ci-dessus : `useSubmissions()` (déjà l'écran Positionnements)
 * et `useRenewals()` (déjà l'écran de décision de renouvellement).
 */
describe('#2842 — useCommercialAudit relie les positionnements et les renouvellements réels', () => {
  beforeEach(() => {
    talentStats.mockReturnValue({ data: undefined, isLoading: false })
    submissions.mockReset()
    renewals.mockReset()
    needsSignals.mockReturnValue({ data: undefined, isLoading: false })
    contactFollowUpStats.mockReturnValue({ data: undefined, isLoading: false })
  })

  it('aucun retour client sur les positionnements fait sortir « profils sans engagement »', () => {
    submissions.mockReturnValue({
      data: { items: [{ firstFeedbackAt: null }, { firstFeedbackAt: null }] },
      isLoading: false,
    })
    renewals.mockReturnValue({ data: undefined, isLoading: false })
    const { result } = renderHook(() => useCommercialAudit())
    const rules = (result.current.auditContext.contradictions ?? []).map(item => item.ruleId)
    expect(rules).toContain('profilesWithoutCommitment')
  })

  it('sait dire NON — positionnements non lus : aucune rupture inventée', () => {
    submissions.mockReturnValue({ data: undefined, isLoading: false })
    renewals.mockReturnValue({ data: undefined, isLoading: false })
    const { result } = renderHook(() => useCommercialAudit())
    const rules = (result.current.auditContext.contradictions ?? []).map(item => item.ruleId)
    expect(rules).not.toContain('profilesWithoutCommitment')
  })

  it('aucune mission éligible renouvelée fait sortir « mission sans renouvellement »', () => {
    submissions.mockReturnValue({ data: undefined, isLoading: false })
    renewals.mockReturnValue({
      data: { missions: [{ renewal_status: 'non_engage' }, { renewal_status: 'bloque' }] },
      isLoading: false,
    })
    const { result } = renderHook(() => useCommercialAudit())
    const rules = (result.current.auditContext.contradictions ?? []).map(item => item.ruleId)
    expect(rules).toContain('missionWithoutRenewal')
  })

  it('sait dire NON — renouvellements non lus : aucune rupture inventée', () => {
    submissions.mockReturnValue({ data: undefined, isLoading: false })
    renewals.mockReturnValue({ data: undefined, isLoading: false })
    const { result } = renderHook(() => useCommercialAudit())
    const rules = (result.current.auditContext.contradictions ?? []).map(item => item.ruleId)
    expect(rules).not.toContain('missionWithoutRenewal')
  })
})

/**
 * #2842 (reste, 26/09) — trois producteurs réels de plus, MÊME câblage :
 * `useOpenNeedsCommercialAuditSignals()` (comptage backend neuf) et
 * `useContactFollowUpStats()` (comptage backend neuf).
 */
describe('#2842 (reste) — useCommercialAudit relie les besoins et les contacts réels', () => {
  beforeEach(() => {
    talentStats.mockReturnValue({ data: undefined, isLoading: false })
    submissions.mockReturnValue({ data: undefined, isLoading: false })
    renewals.mockReturnValue({ data: undefined, isLoading: false })
  })

  it('aucun besoin qualifié fait sortir « besoin sans qualification »', () => {
    needsSignals.mockReturnValue({
      data: { clientNeeds: { total: 3, qualified: 0 }, needDetailing: { total: 3, withOnlyATitle: 0 } },
      isLoading: false,
    })
    contactFollowUpStats.mockReturnValue({ data: undefined, isLoading: false })
    const { result } = renderHook(() => useCommercialAudit())
    const rules = (result.current.auditContext.contradictions ?? []).map(item => item.ruleId)
    expect(rules).toContain('needsWithoutQualification')
  })

  it('sait dire NON — besoins non lus : aucune rupture inventée', () => {
    needsSignals.mockReturnValue({ data: undefined, isLoading: false })
    contactFollowUpStats.mockReturnValue({ data: undefined, isLoading: false })
    const { result } = renderHook(() => useCommercialAudit())
    const rules = (result.current.auditContext.contradictions ?? []).map(item => item.ruleId)
    expect(rules).not.toContain('needsWithoutQualification')
  })

  it('aucun contact pris n’a de date de reprise fait sortir « contact sans date de reprise »', () => {
    needsSignals.mockReturnValue({ data: undefined, isLoading: false })
    contactFollowUpStats.mockReturnValue({ data: { total: 4, withNextStepDate: 0 }, isLoading: false })
    const { result } = renderHook(() => useCommercialAudit())
    const rules = (result.current.auditContext.contradictions ?? []).map(item => item.ruleId)
    expect(rules).toContain('contactWithoutFollowUpDate')
  })

  it('sait dire NON — contacts non lus : aucune rupture inventée', () => {
    needsSignals.mockReturnValue({ data: undefined, isLoading: false })
    contactFollowUpStats.mockReturnValue({ data: undefined, isLoading: false })
    const { result } = renderHook(() => useCommercialAudit())
    const rules = (result.current.auditContext.contradictions ?? []).map(item => item.ruleId)
    expect(rules).not.toContain('contactWithoutFollowUpDate')
  })
})
