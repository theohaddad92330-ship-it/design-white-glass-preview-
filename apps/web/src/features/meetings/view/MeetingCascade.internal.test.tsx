import type { MeetingCascade as Cascade } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MeetingCascade } from './MeetingCascade'

/**
 * #2103.31 — CAS LIMITE, RDV INTERNE : les sorties qui visent l'EXTÉRIEUR
 * (mail de suivi, relance) ne se proposent jamais sur un rendez-vous sans
 * invité externe. `deriveMeetingType` (déjà là, `meeting-brief.ts`) dit déjà
 * qu'un rendez-vous est interne ; ce test garde le CÂBLAGE jusqu'à la
 * cascade — `reachesOutside` (déjà porté par chaque carte, `meeting-notes.ts`)
 * est la source, jamais une seconde liste de kinds recopiée ici.
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
      kind: 'follow_up_email',
      position: 8,
      band: 'a3',
      state: 'separate_draft',
      itemCount: 1,
      evidence: [{ kind: 'notes-derived' }],
      reachesOutside: true,
    },
  ],
  summary: {
    internalWrites: [{ kind: 'recap', count: 1 }],
    externalDrafts: ['follow_up_email'],
    estimatedCredits: 0,
    sources: [],
    droppedWithoutEvidence: 0,
  },
}

function renderCascade(isInternalMeeting?: boolean) {
  return render(
    <MeetingCascade
      cascade={CASCADE}
      fromTranscript={false}
      onApprove={vi.fn()}
      approving={false}
      {...(isInternalMeeting === undefined ? {} : { isInternalMeeting })}
    />,
  )
}

describe('MeetingCascade — #2103.31 (rendez-vous interne, cartes externes masquées)', () => {
  it('rendez-vous interne : la carte qui vise l’extérieur ne s’affiche PAS', () => {
    renderCascade(true)
    expect(screen.getByText('Compte rendu structuré')).toBeInTheDocument()
    expect(screen.queryByText('Mail de suivi')).not.toBeInTheDocument()
  })

  it('témoin — rendez-vous non marqué interne : les deux cartes restent affichées, comportement inchangé', () => {
    renderCascade(undefined)
    expect(screen.getByText('Compte rendu structuré')).toBeInTheDocument()
    expect(screen.getByText('Mail de suivi')).toBeInTheDocument()
  })
})
