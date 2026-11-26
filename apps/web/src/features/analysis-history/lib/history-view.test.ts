import { describe, expect, it } from 'vitest'
import { resumeSearchParams, rowActions } from './history-view'

describe('Théo B r2-mes-analyses.A5 — les gestes d’une ligne d’historique', () => {
  it('une analyse terminée à moi : reprendre, voir le dossier, retirer', () => {
    expect(rowActions({ status: 'completed', mine: true })).toEqual({
      resume: true,
      retry: false,
      viewDossier: true,
      remove: true,
    })
  })

  it('une analyse échouée à moi : réessayer, retirer, pas de dossier', () => {
    expect(rowActions({ status: 'error', mine: true })).toEqual({
      resume: false,
      retry: true,
      viewDossier: false,
      remove: true,
    })
  })

  it('l’analyse d’un collègue : on voit le dossier, jamais de reprise ni de retrait', () => {
    expect(rowActions({ status: 'completed', mine: false })).toEqual({
      resume: false,
      retry: false,
      viewDossier: true,
      remove: false,
    })
  })

  it('une analyse en cours ne se retire pas', () => {
    expect(rowActions({ status: 'analyzing', mine: true }).remove).toBe(false)
  })

  it('« Reprendre » rouvre le compte, sans inventer de nom', () => {
    expect(resumeSearchParams({ accountId: 'a', companyName: 'Altiver', scopeMode: 'groupe' })).toEqual({
      accountId: 'a',
      company: 'Altiver',
      scope: 'groupe',
    })
    expect(resumeSearchParams({ accountId: 'a', companyName: null, scopeMode: null })).toEqual({ accountId: 'a' })
  })
})
