import { describe, expect, it } from 'vitest'
import { emptyPipelineFilters, pipelineFiltersToSavedRecord, savedRecordToPipelineFilters } from './pipeline-saved-view'

/**
 * #2170.52 — un aller-retour PUR entre les filtres rapides du pipe et ce
 * qu'on enregistre. Même propriété que `needFiltersToSavedRecord` : une vue
 * relue ne doit jamais composer un état que l'écran n'aurait pas produit
 * lui-même.
 */
describe('pipeline-saved-view (#2170.52)', () => {
  it('ne garde AUCUNE clé quand rien n’est filtré — le serveur refuse une vue sans critère', () => {
    expect(pipelineFiltersToSavedRecord(emptyPipelineFilters())).toEqual({})
  })

  it('garde le texte de recherche seulement s’il n’est pas vide', () => {
    expect(pipelineFiltersToSavedRecord({ ...emptyPipelineFilters(), q: '   ' })).toEqual({})
    expect(pipelineFiltersToSavedRecord({ ...emptyPipelineFilters(), q: '  ACME  ' })).toEqual({ q: 'ACME' })
  })

  it('garde chaque drapeau posé, jamais un `false`', () => {
    const record = pipelineFiltersToSavedRecord({
      ...emptyPipelineFilters(),
      stale: true,
      toSign: true,
    })
    expect(record).toEqual({ stale: true, toSign: true })
  })

  it('fait l’aller-retour exact sur un enregistrement complet', () => {
    const filters = {
      q: 'ACME',
      mine: true,
      withoutNextAction: true,
      stale: true,
      withoutProfile: true,
      toSign: true,
      interviewThisWeek: true,
    }
    expect(savedRecordToPipelineFilters(pipelineFiltersToSavedRecord(filters))).toEqual(filters)
  })

  it('IGNORE ce qu’elle ne reconnaît plus, plutôt que de le retransmettre — un vieux critère ne fait pas échouer la relecture', () => {
    expect(savedRecordToPipelineFilters({ q: 'ACME', notAKey: true, mine: 'oui' })).toEqual({
      ...emptyPipelineFilters(),
      q: 'ACME',
    })
  })

  it('rend les filtres VIDES sur un enregistrement illisible, jamais une exception', () => {
    expect(savedRecordToPipelineFilters(null)).toEqual(emptyPipelineFilters())
    expect(savedRecordToPipelineFilters(['pas', 'un', 'objet'])).toEqual(emptyPipelineFilters())
  })
})
