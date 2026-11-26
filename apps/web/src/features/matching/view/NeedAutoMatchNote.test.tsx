import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { NeedAutoMatch } from '@bellum/contracts'

const autoMatch: { current: NeedAutoMatch | null | undefined } = { current: undefined }
vi.mock('@/features/matching/hooks', () => ({
  useNeedAutoMatch: () => ({ data: autoMatch.current }),
}))

const { NeedAutoMatchNote } = await import('./NeedAutoMatchNote')

const base: NeedAutoMatch = {
  status: 'done',
  runId: '00000000-0000-4000-8000-000000000001',
  launchedAt: '2026-10-09T08:00:00.000Z',
  settledAt: '2026-10-09T08:00:05.000Z',
  evaluatedCount: 12,
  recommendedCount: 3,
  borderlineCount: 2,
}

describe('NeedAutoMatchNote — « lancé automatiquement » sur la fiche besoin (#2916, c93)', () => {
  it('un run écrit se dit LANCÉ AUTOMATIQUEMENT, avec son résultat, et s’ouvre', () => {
    autoMatch.current = base
    const onOpen = vi.fn()
    render(<NeedAutoMatchNote needId="n-1" onOpen={onOpen} />)
    const note = screen.getByTestId('need-auto-match')
    expect(note).toHaveTextContent('Matching lancé automatiquement')
    expect(note).toHaveTextContent('3 profils recommandés')
    expect(note).toHaveTextContent('2 à la marge')
    fireEvent.click(screen.getByRole('button', { name: 'Voir le rapprochement' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('aucun profil recommandé se DIT en mots, jamais « 0 »', () => {
    autoMatch.current = { ...base, recommendedCount: 0, borderlineCount: 0 }
    render(<NeedAutoMatchNote needId="n-1" onOpen={() => {}} />)
    const note = screen.getByTestId('need-auto-match')
    expect(note).toHaveTextContent('aucun profil recommandé')
    expect(note).not.toHaveTextContent(/\b0\b/)
  })

  it('un délai dépassé est une issue INCONNUE, jamais un échec', () => {
    autoMatch.current = { ...base, status: 'unknown', runId: null, recommendedCount: null, borderlineCount: null }
    render(<NeedAutoMatchNote needId="n-1" onOpen={() => {}} />)
    const note = screen.getByTestId('need-auto-match')
    expect(note).toHaveTextContent('issue inconnue')
    expect(note).not.toHaveTextContent('échec')
  })

  it('plafond atteint et besoin sans compétence se NOMMENT', () => {
    autoMatch.current = { ...base, status: 'capped', runId: null, recommendedCount: null, borderlineCount: null }
    const { unmount } = render(<NeedAutoMatchNote needId="n-1" onOpen={() => {}} />)
    expect(screen.getByTestId('need-auto-match')).toHaveTextContent('plafond quotidien')
    unmount()
    autoMatch.current = { ...base, status: 'no_criteria', runId: null, recommendedCount: null, borderlineCount: null }
    render(<NeedAutoMatchNote needId="n-1" onOpen={() => {}} />)
    expect(screen.getByTestId('need-auto-match')).toHaveTextContent('aucune compétence')
  })

  it('on n’affiche pas ce qu’on n’a pas : sans run automatique, RIEN', () => {
    autoMatch.current = null
    const { container } = render(<NeedAutoMatchNote needId="n-1" onOpen={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
