import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { EsnAnswers, ProfileContext } from '@bellum/contracts'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { useEsnProfileWorkspaceMeta } from '@/features/profile/hooks/useEsnProfileWorkspaceMeta'
import { useSaveEsnField } from '@/features/profile/hooks/useSaveEsnField'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { buildCommercialAudit } from '../lib/build-audit'
import { AuditHero } from './AuditHero'

vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useEsnProfile: vi.fn() }))
vi.mock('@/features/profile/hooks/useEsnProfileWorkspaceMeta', () => ({ useEsnProfileWorkspaceMeta: vi.fn() }))
vi.mock('@/features/profile/hooks/useSaveEsnField', () => ({ useSaveEsnField: vi.fn() }))

const CONTEXT: ProfileContext = { esnArchetype: 'boutiqueExpert', sellingPosture: 'expertiseRare' }

// #4425.1 — les cinq faits de l'en-tête sont CALCULÉS : aucun ne s'édite lui-même,
// chacun montre la réponse du profil dont il dérive, corrigeable sur place.
describe("AuditHero — #4425.1 chaque fait de l'en-tête mène à sa réponse source", () => {
  it('montre, sous chaque carte, les champs source (posture ← mode d’intervention, type d’ESN ← taille…)', async () => {
    vi.mocked(useEsnProfile).mockReturnValue({
      data: { consultant_size: '10-30', positioning: 'Régie pure - on place des profils sur demande' },
    } as unknown as ReturnType<typeof useEsnProfile>)
    vi.mocked(useEsnProfileWorkspaceMeta).mockReturnValue({
      data: { shared: false, canEditCompany: true, role: 'owner' },
    } as unknown as ReturnType<typeof useEsnProfileWorkspaceMeta>)
    vi.mocked(useSaveEsnField).mockReturnValue(vi.fn())

    const audit = buildCommercialAudit(CONTEXT, [], null, null)
    renderWithRouter(<AuditHero audit={audit} validatedAt={null} />)

    expect(await screen.findAllByTestId('audit-sources')).toHaveLength(5)
    expect(screen.getByText('Régie pure - on place des profils sur demande')).toBeInTheDocument()
  })

  it('la valeur calculée elle-même n’a PAS de bouton Modifier (seule sa source en a)', async () => {
    vi.mocked(useEsnProfile).mockReturnValue({ data: {} as EsnAnswers } as unknown as ReturnType<typeof useEsnProfile>)
    vi.mocked(useEsnProfileWorkspaceMeta).mockReturnValue({
      data: { shared: false, canEditCompany: true, role: 'owner' },
    } as unknown as ReturnType<typeof useEsnProfileWorkspaceMeta>)
    vi.mocked(useSaveEsnField).mockReturnValue(vi.fn())

    const audit = buildCommercialAudit(CONTEXT, [], null, null)
    renderWithRouter(<AuditHero audit={audit} validatedAt={null} />)
    await screen.findAllByTestId('audit-sources')
    expect(screen.queryByRole('button', { name: /^Modifier$/ })).not.toBeInTheDocument()
  })
})
