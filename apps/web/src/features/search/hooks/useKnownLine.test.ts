import type { Account, Contact, RecordFieldAudit } from '@bellum/contracts'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { useKnownLine } from './useKnownLine'

const contact = (sourceTag: string | null) => ({ source_tag: sourceTag }) as unknown as Contact

describe('useKnownLine — les phrases de « ce que Bellum sait déjà »', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('un compte jamais analysé n’a aucune phrase — jamais un zéro', () => {
    const { result } = renderHook(() => useKnownLine({ account: null, contacts: [], corrections: undefined }))
    expect(result.current).toEqual([])
  })

  it('sépare les faits (identifiant réel) des probables, et ne compte que les signaux frais', () => {
    const account = {
      last_analyzed_at: '2026-09-03T10:00:00Z',
      raw_analysis: {
        recent_signals: [
          { title: 'a', freshness: 'current' },
          { title: 'b', freshness: 'archive' },
        ],
      },
    } as unknown as Account
    const { result } = renderHook(() =>
      useKnownLine({
        account,
        contacts: [contact('INTERNE'), contact('PUBLIC'), contact('HYPOTHÈSE')],
        corrections: [{ id: 'x' }] as unknown as RecordFieldAudit[],
      }),
    )
    const text = result.current.join(' · ')
    expect(text).toMatch(/Analysé le /)
    expect(text).toContain('3 contacts identifiés')
    expect(text).toContain('2 vérifiés, 1 probable, à confirmer')
    expect(text).toContain('1 signal depuis')
    expect(text).toContain('1 correction de l’équipe')
  })

  it('n’écrit pas « probables » quand il n’y en a aucun', () => {
    const { result } = renderHook(() =>
      useKnownLine({ account: null, contacts: [contact('INTERNE')], corrections: undefined }),
    )
    expect(result.current.join(' ')).not.toMatch(/probable/)
  })
})
