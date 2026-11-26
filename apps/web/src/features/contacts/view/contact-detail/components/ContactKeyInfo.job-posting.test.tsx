import type { Contact } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { contactProvenanceKind, contactSourceLabel } from '@/features/contacts/lib/contactProvenance'
import { ContactKeyInfo } from './ContactKeyInfo'

// #4599.6 — la ligne « E-mail absent » porte la recherche d'« Enrichir » (react-query) : doublée ici, testée à part.
vi.mock('./ContactEnrichButton', () => ({
  useContactEnrich: () => ({ enrich: vi.fn(), setScope: vi.fn(), disabled: false, hint: undefined }),
  ContactEnrichConfirm: () => null,
}))

// #4504.3 — la carte porte « Responsable du contact » (session) : mêmes doublures que ContactKeyInfo.test.tsx.
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-moi' } }) }))
vi.mock('./ContactAssignControl', () => ({
  ContactAssignControl: ({ label }: { label?: string }) => <button type="button">{label ?? 'Attribuer'}</button>,
}))
vi.mock('@/features/team-guardrails/components/DoNotContactPreference', () => ({
  DoNotContactPreference: () => <span>Aucune opposition consignée</span>,
}))

/**
 * SIG-B (11/10/2026) — un recruteur NOMMÉ par une offre d'emploi publiée : la
 * fiche contact montre la PREUVE (l'offre, son lien, sa date), sous la source
 * « Offre d'emploi publiée ». On n'affiche que ce qu'on a : pas de date
 * inventée, pas de ligne sans preuve vérifiable. Le fournisseur n'est jamais nommé.
 */
function recruiter(rawData: Record<string, unknown> | null): Contact {
  return {
    id: 'c1',
    account_id: 'a1',
    full_name: 'Claire Martin',
    title: 'Talent Acquisition Partner',
    source: 'job_posting',
    raw_data: rawData,
  } as unknown as Contact
}

describe('ContactKeyInfo — preuve d’un recruteur nommé par une offre (SIG-B)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('montre l’offre, son lien et sa date de publication', () => {
    render(
      <ContactKeyInfo
        contact={recruiter({
          jobPosting: { title: 'Ingénieur DevOps', url: 'https://careers.example/1', postedAt: '2026-10-08' },
        })}
      />,
    )
    expect(screen.getByText('Offre d’emploi publiée')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Ingénieur DevOps/ })
    expect(link).toHaveAttribute('href', 'https://careers.example/1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText(/publiée le .*2026/)).toBeInTheDocument()
  })

  it('sans date de publication : aucune date inventée', () => {
    render(
      <ContactKeyInfo
        contact={recruiter({ jobPosting: { title: 'Ingénieur DevOps', url: 'https://careers.example/1' } })}
      />,
    )
    expect(screen.getByRole('link', { name: /Ingénieur DevOps/ })).toBeInTheDocument()
    expect(screen.queryByText(/publiée le/)).not.toBeInTheDocument()
  })

  it('sait dire NON : sans preuve, ou avec un lien non vérifiable, aucune ligne', () => {
    const { unmount } = render(<ContactKeyInfo contact={recruiter(null)} />)
    expect(screen.queryByText('Offre d’emploi publiée')).not.toBeInTheDocument()
    unmount()
    render(<ContactKeyInfo contact={recruiter({ jobPosting: { title: 'X', url: 'javascript:alert(1)' } })} />)
    expect(screen.queryByText('Offre d’emploi publiée')).not.toBeInTheDocument()
  })

  it('la source se lit « Offre d’emploi publiée », provenance publique — jamais un nom de fournisseur', () => {
    expect(contactSourceLabel('job_posting')).toBe('Offre d’emploi publiée')
    expect(contactProvenanceKind('job_posting')).toBe('public')
  })
})
