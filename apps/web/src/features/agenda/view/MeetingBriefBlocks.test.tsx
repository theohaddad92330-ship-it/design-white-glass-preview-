import type { MeetingBriefBlock } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MeetingBriefBlockCard } from './MeetingBriefBlocks'

/**
 * #2102.31 — les inconnues PAR BLOC : sous un bloc, ce qu'il n'a pas pu établir est nommé. Un bloc complet ne
 * montre rien — jamais « 0 inconnue », jamais un blanc rassurant.
 */
function blockOf(over: Partial<MeetingBriefBlock> = {}): MeetingBriefBlock {
  return {
    index: 1,
    key: 'who',
    lines: ['Camille Martin — Head of Data'],
    note: null,
    ground: { kind: 'sourced', sources: ['contact_record'], observedAt: '2026-08-29T06:00:00.000Z' },
    moreCount: 0,
    unknowns: [],
    ...over,
  }
}

describe('MeetingBriefBlockCard — inconnues du bloc (#2102.31)', () => {
  it('nomme chaque inconnue sous le bloc', () => {
    render(<MeetingBriefBlockCard block={blockOf({ unknowns: ['decision_role', 'tenure'] })} />)
    expect(screen.getByText(/Non établi/)).toBeInTheDocument()
    expect(screen.getByText(/rôle de décision/i)).toBeInTheDocument()
    expect(screen.getByText(/ancienneté dans le poste/i)).toBeInTheDocument()
  })

  it('sans inconnue, ne dit RIEN — ni « 0 », ni « Non établi »', () => {
    render(<MeetingBriefBlockCard block={blockOf({ unknowns: [] })} />)
    expect(screen.queryByText(/Non établi/)).not.toBeInTheDocument()
  })
})
