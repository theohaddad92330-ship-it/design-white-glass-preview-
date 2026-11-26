import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact, OutreachSequence } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useOutreachSequences } from '@/features/outreach/hooks/useOutreachSequences'
import { ContactSolicitationCollisionAlert } from './ContactSolicitationCollisionAlert'

vi.mock('@/features/outreach/hooks/useOutreachSequences', () => ({
  useOutreachSequences: vi.fn(),
}))

const contact = { id: 'contact-1', full_name: 'Claire Dubois' } as Contact

function setSequences(data: OutreachSequence[] | undefined) {
  vi.mocked(useOutreachSequences).mockReturnValue({ data } as unknown as ReturnType<typeof useOutreachSequences>)
}

function sequence(over: Partial<OutreachSequence> = {}): OutreachSequence {
  return { id: 's-1', contact_id: 'contact-1', status: 'active', ...over } as unknown as OutreachSequence
}

describe('ContactSolicitationCollisionAlert (#3687.13)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('deux séquences ACTIVES sur la même personne → alerte, sans nommer un commercial', () => {
    setSequences([sequence({ id: 's-1' }), sequence({ id: 's-2' })])
    render(<ContactSolicitationCollisionAlert contact={contact} />)
    expect(screen.getByText(/2 séquences actives/)).toBeInTheDocument()
    expect(screen.queryByText(/Claire Dubois/)).not.toBeInTheDocument()
  })

  it('une seule séquence active → rien ne se rend', () => {
    setSequences([sequence({ id: 's-1' })])
    render(<ContactSolicitationCollisionAlert contact={contact} />)
    expect(screen.queryByText(/séquences actives/)).not.toBeInTheDocument()
  })

  it('deux séquences dont une seule active (l’autre `paused`) → rien ne se rend : une séquence arrêtée ne sollicite plus', () => {
    setSequences([sequence({ id: 's-1', status: 'active' }), sequence({ id: 's-2', status: 'paused' })])
    render(<ContactSolicitationCollisionAlert contact={contact} />)
    expect(screen.queryByText(/séquences actives/)).not.toBeInTheDocument()
  })

  it('aucune séquence chargée → rien ne se rend', () => {
    setSequences(undefined)
    render(<ContactSolicitationCollisionAlert contact={contact} />)
    expect(screen.queryByText(/séquences actives/)).not.toBeInTheDocument()
  })
})
