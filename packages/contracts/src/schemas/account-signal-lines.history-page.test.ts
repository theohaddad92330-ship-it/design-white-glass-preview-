import { describe, expect, it } from 'vitest'
import {
  HISTORY_PAGE_MAX,
  HISTORY_PAGE_SIZE,
  historyAccountMatchesSearch,
  parseSearch,
  workspaceSignalHistoryQuerySchema,
  workspaceSignalHistorySchema,
} from '../index.js'

/** Lot 785 (#5213) — le contrat de la page d'Historique : ce qu'il accepte, et surtout ce qu'il REFUSE. */
describe('workspaceSignalHistoryQuerySchema', () => {
  it('défaut : 50 comptes, depuis le début, sans recherche', () => {
    expect(workspaceSignalHistoryQuerySchema.parse({})).toEqual({ limit: HISTORY_PAGE_SIZE, offset: 0 })
    expect(HISTORY_PAGE_SIZE).toBe(50)
  })
  it('lit limit / offset / q de la query-string (chaînes) ; q est rogné, un q vide est absent', () => {
    expect(workspaceSignalHistoryQuerySchema.parse({ limit: '20', offset: '40', q: '  power bi ' })).toEqual({
      limit: 20,
      offset: 40,
      q: 'power bi',
    })
    expect(workspaceSignalHistoryQuerySchema.parse({ q: '   ' }).q).toBeUndefined()
  })
  it('REFUS : un paramètre inconnu n’est pas avalé (« search » au lieu de « q »)', () => {
    expect(workspaceSignalHistoryQuerySchema.safeParse({ search: 'java' }).success).toBe(false)
    expect(workspaceSignalHistoryQuerySchema.safeParse({ page: '2' }).success).toBe(false)
  })
  it('REFUS : limite hors borne, offset négatif', () => {
    expect(workspaceSignalHistoryQuerySchema.safeParse({ limit: String(HISTORY_PAGE_MAX + 1) }).success).toBe(false)
    expect(workspaceSignalHistoryQuerySchema.safeParse({ limit: '0' }).success).toBe(false)
    expect(workspaceSignalHistoryQuerySchema.safeParse({ offset: '-1' }).success).toBe(false)
  })
})

describe('workspaceSignalHistorySchema — la page', () => {
  it('une réponse sans `page` (API non paginée) reste lisible ; avec `page`, elle porte le total', () => {
    expect(workspaceSignalHistorySchema.safeParse({ accounts: [] }).success).toBe(true)
    const paged = workspaceSignalHistorySchema.parse({ accounts: [], page: { total: 1325, offset: 0, limit: 50 } })
    expect(paged.page?.total).toBe(1325)
    expect(workspaceSignalHistorySchema.safeParse({ accounts: [], page: { total: 1 } }).success).toBe(false)
  })
})

describe('historyAccountMatchesSearch — la règle de l’écran, rejouée côté serveur', () => {
  const line = (title: string, over: Record<string, unknown> = {}) => ({ title, detail: null, ...over })
  const account = (company_name: string, lines: ReturnType<typeof line>[]) => ({
    company_name,
    lines: lines as never,
  })
  it('un mot d’un besoin, une variante, le nom du compte', () => {
    const search = parseSearch('power bi')!
    expect(historyAccountMatchesSearch(account('Norauto', [line('Consultant PowerBI')]), search)).toBe(true)
    expect(historyAccountMatchesSearch(account('Norauto', [line('Chef de projet SAP')]), search)).toBe(false)
    expect(historyAccountMatchesSearch(account('Power BI Corp', [line('x')]), search)).toBe(true)
  })
  it('TOUS les mots doivent se lire (dans un champ ou un autre) ; les compétences comptent', () => {
    const search = parseSearch('java lille')!
    expect(historyAccountMatchesSearch(account('A', [line('Dev à Lille', { technologies: ['Java'] })]), search)).toBe(
      true,
    )
    expect(historyAccountMatchesSearch(account('A', [line('Dev à Paris', { technologies: ['Java'] })]), search)).toBe(
      false,
    )
  })
})
