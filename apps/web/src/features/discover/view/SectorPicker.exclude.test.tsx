import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { APPLICATION_SECTORS } from '@bellum/contracts'
import { SectorPicker } from './SectorPicker'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}))

const CODE = APPLICATION_SECTORS[0]!.code

// #4301.1 — les secteurs EXCLUS ne se lisent pas comme les inclus.
describe('SectorPicker — secteurs exclus (#4301.1)', () => {
  it('SAIT DIRE NON puis OUI : inclusion en violet, exclusion en rouge', () => {
    const { unmount } = render(<SectorPicker selected={[CODE]} onChange={() => {}} />)
    const included = screen.getAllByRole('button', { pressed: true })[0]!
    expect(included.getAttribute('style')).toContain('--accent-soft-bg')
    unmount()
    render(<SectorPicker selected={[CODE]} onChange={() => {}} tone="exclude" />)
    const excluded = screen.getAllByRole('button', { pressed: true })[0]!
    expect(excluded.getAttribute('style')).toContain('--danger-soft-bg')
    expect(excluded.getAttribute('style')).not.toContain('--accent-soft-bg')
  })
})
