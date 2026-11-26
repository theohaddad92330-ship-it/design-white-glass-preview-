import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VerdictUnchanged } from '@bellum/contracts'
import { VerdictUnchangedLine } from './VerdictUnchangedLine'

const read = vi.hoisted(() => ({ unchanged: null as VerdictUnchanged | null | undefined }))
vi.mock('@/features/accounts/hooks/useAccountVerdictUnchanged', () => ({
  useAccountVerdictUnchanged: () => ({ data: read.unchanged }),
}))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useHasOfferObjective: () => true }))

describe('VerdictUnchangedLine — #4180 (R41), « Même verdict depuis le … » à l’ouverture de la Vue d’ensemble', () => {
  beforeEach(() => {
    read.unchanged = null
  })

  it('verdict inchangé : la ligne datée est rendue', () => {
    read.unchanged = { unchangedSince: '2026-10-12T08:00:00.000Z' }
    render(<VerdictUnchangedLine accountId="a1" />)
    expect(screen.getByTestId('verdict-unchanged')).toHaveTextContent(/12/)
  })

  it('verdict changé, illisible ou une seule analyse (`null`) : aucune ligne, jamais une date devinée', () => {
    const { container } = render(<VerdictUnchangedLine accountId="a1" />)
    expect(container).toBeEmptyDOMElement()
  })
})
