import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Field } from './filter-controls'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}))

// F2-FIX #4301 — chaque filtre dit s'il INCLUT ou s'il EXCLUT, en mots simples.
describe('Field — inclus / exclu (F2-FIX #4301)', () => {
  it('SAIT DIRE NON : sans mode, aucune étiquette', () => {
    render(<Field label="Ville">x</Field>)
    expect(screen.queryByTestId('field-mode')).toBeNull()
  })

  it('un filtre qui garde se dit « inclus », un filtre qui écarte se dit « exclu »', () => {
    const { unmount } = render(
      <Field label="Secteurs" mode="include">
        x
      </Field>,
    )
    expect(screen.getByTestId('field-mode').textContent).toBe('rail.mode.include')
    unmount()
    render(
      <Field label="Secteurs exclus" mode="exclude">
        x
      </Field>,
    )
    expect(screen.getByTestId('field-mode').textContent).toBe('rail.mode.exclude')
  })

  it('LIT FilterRail : aucun champ du rail n’omet son mode, et deux seulement sont « exclude »', () => {
    const src = readFileSync(join(__dirname, 'FilterRail.tsx'), 'utf8')
    const opens = src.match(/<Field\b[^>]*>/g) ?? []
    expect(opens.length).toBeGreaterThan(20)
    expect(opens.filter(tag => !/mode="(include|exclude)"/.test(tag))).toEqual([])
    // Secteurs exclus + #4361.2 (interrupteur « exclure les sociétés cotées », Louis 20/10).
    expect(opens.filter(tag => /mode="exclude"/.test(tag))).toHaveLength(2)
  })
})
