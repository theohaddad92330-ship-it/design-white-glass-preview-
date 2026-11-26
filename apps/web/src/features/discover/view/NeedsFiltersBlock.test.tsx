import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { emptyUnifiedFilters } from '../lib/discover-filters'
import { NeedsFiltersBlock, consultantOptionLabel, consultantSelectOptions } from './NeedsFiltersBlock'

/**
 * #5203 (lot 782) — « Cadrer la recherche » : période et nature des besoins (qui RETIRENT), et la recherche DEPUIS UN
 * CONSULTANT, qui pose ses compétences comme critères. Le consultant de l'espace se NOMME ; aucun fournisseur à l'écran.
 */
const consultants = [
  { id: 'c1', label: 'Architecte Java', stack: ['Java', 'Spring'] },
  { id: 'c2', label: 'Consultant SAP', stack: ['SAP FI', 'ABAP'] },
]

function setup(overrides = {}) {
  const onChange = vi.fn()
  const draft = { ...emptyUnifiedFilters(), ...overrides }
  render(<NeedsFiltersBlock draft={draft} onChange={onChange} consultants={consultants} />)
  return { onChange }
}

describe('#5203 — NeedsFiltersBlock', () => {
  it('« Tous » est le défaut : période et natures non posées', () => {
    setup()
    expect(screen.getByRole('combobox', { name: 'Période des besoins' })).toHaveTextContent('Tous')
    expect(screen.getByRole('button', { name: 'Recrutement' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('cocher une nature pose le filtre (qui retire)', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Mission' }))
    const next = onChange.mock.calls[0]![0](emptyUnifiedFilters())
    expect(next.needsNature).toEqual(['mission'])
  })

  it('décocher une nature la retire de la liste', () => {
    const { onChange } = setup({ needsNature: ['mission', 'projet'] })
    fireEvent.click(screen.getByRole('button', { name: 'Mission' }))
    const next = onChange.mock.calls[0]![0]({ ...emptyUnifiedFilters(), needsNature: ['mission', 'projet'] })
    expect(next.needsNature).toEqual(['projet'])
  })

  it('« depuis un consultant » pose ses compétences comme critères de la recherche', async () => {
    const { onChange } = setup()
    await userEvent.click(screen.getByRole('combobox', { name: 'Depuis un consultant' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Architecte Java' }))
    const next = onChange.mock.calls[0]![0](emptyUnifiedFilters())
    const posed = `${next.keywords} ${next.technologiesObserved}`
    expect(posed).toMatch(/Java/)
    expect(posed).toMatch(/Spring/)
  })

  it('aucun nom de fournisseur à l’écran ; sélecteur muet sans consultant', () => {
    const { container } = render(
      <NeedsFiltersBlock draft={emptyUnifiedFilters()} onChange={() => {}} consultants={[]} />,
    )
    expect(container.textContent).not.toMatch(/dataforge|market memory|mémoire marché/i)
    expect(screen.queryByRole('combobox', { name: 'Depuis un consultant' })).toBeNull()
  })

  it('le consultant de l’espace se nomme : « Nom — Poste », l’un des deux, sinon absent (Louis 03/11)', () => {
    expect(consultantOptionLabel('Alice Martin', 'Architecte Java')).toBe('Alice Martin — Architecte Java')
    expect(consultantOptionLabel('Alice Martin', null)).toBe('Alice Martin')
    expect(consultantOptionLabel('  ', 'Consultant SAP')).toBe('Consultant SAP')
    expect(consultantOptionLabel(null, undefined)).toBeNull()
  })

  describe('lot 786 (#5203 C) — le sélecteur ne montre ni doublon ni « Consultant N »', () => {
    const row = (id: string, full_name: string | null, title: string | null, stack = ['Java']) => ({
      id,
      full_name,
      title,
      stack,
      archived_at: null,
    })

    it('dédoublonne par id, puis par nom normalisé (casse, accents, espaces)', () => {
      const out = consultantSelectOptions([
        row('a', 'Élodie Martin', 'Architecte', ['Java']),
        row('a', 'Élodie Martin', 'Architecte', ['Java']),
        row('b', '  elodie   MARTIN ', 'Architecte Java', ['Spring']),
        row('c', 'Paul Durand', null),
      ])
      expect(out.map(o => o.id)).toEqual(['a', 'c'])
      expect(out[0]!.stack).toEqual(['Java', 'Spring'])
    })

    it('un nom vide ou « Consultant 22 » affiche le poste seul ; sans nom NI poste, l’entrée n’apparaît pas', () => {
      const out = consultantSelectOptions([
        row('x', null, 'Architecte SAP'),
        row('y', 'Consultant 22', 'Chef de projet'),
        row('z', 'consultant 81', null),
        row('w', 'Consultant 21', '  '),
        row('v', null, null),
      ])
      expect(out.map(o => o.label)).toEqual(['Architecte SAP', 'Chef de projet'])
      expect(out.some(o => /^consultant \d+$/i.test(o.label))).toBe(false)
    })

    it('lot 788 — deux fiches de MÊME libellé affiché (poste seul) ne font qu’une option, la plus complète gagne', () => {
      const title = 'Senior Cyber Security Consultant - Onepoint Sud Ouest'
      const out = consultantSelectOptions([
        row('p', null, title, ['SOC']),
        row('q', 'Consultant 75', title, ['SOC', 'SIEM', 'EDR']),
      ])
      expect(out).toHaveLength(1)
      expect(out[0]!.id).toBe('q')
      expect(out[0]!.stack).toEqual(['SOC', 'SIEM', 'EDR'])
    })

    it('lot 788 — le libellé se compare normalisé (casse, accents, espaces) et un nom réel passe avant un poste seul', () => {
      const out = consultantSelectOptions([
        row('a', null, 'Développeur  Java', ['Java']),
        row('b', null, 'développeur java', ['Java', 'Spring']),
      ])
      expect(out.map(o => o.id)).toEqual(['b'])
    })

    it('écarte archivés et sans pile', () => {
      const out = consultantSelectOptions([
        { ...row('a', 'A B', null), archived_at: '2026-01-01' },
        row('b', 'C D', null, []),
      ])
      expect(out).toEqual([])
    })
  })
})
