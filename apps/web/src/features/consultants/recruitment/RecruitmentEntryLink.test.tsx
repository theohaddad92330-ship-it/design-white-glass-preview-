import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { RecruitmentEntryLink } from './RecruitmentEntryLink'

// Théo C talents-recrutement — l'écran est atteignable depuis le vivier.
describe('RecruitmentEntryLink', () => {
  it('mène à /consultants/recrutement', async () => {
    renderWithRouter(<RecruitmentEntryLink />)
    const link = await screen.findByRole('link', { name: 'Recrutement' })
    expect(link.getAttribute('href')).toBe('/consultants/recrutement')
  })
})
