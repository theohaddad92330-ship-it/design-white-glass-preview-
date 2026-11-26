import { emptyNeedFilters, type NeedFilters } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { needFiltersToSavedRecord, savedRecordToNeedFilters } from './saved-view-filters'

function filters(over: Partial<NeedFilters> = {}): NeedFilters {
  return { ...emptyNeedFilters(), ...over }
}

describe('vue enregistrable — ce qu’on garde d’un filtre', () => {
  it('ne garde AUCUN critère quand rien n’est filtré — c’est ce refus que l’écran affiche avant le clic', () => {
    expect(needFiltersToSavedRecord(emptyNeedFilters())).toEqual({})
  })

  it('ne garde jamais la pagination — une vue qui stockait sa page s’ouvrirait page 3 d’une liste qui a changé', () => {
    const record = needFiltersToSavedRecord(filters({ skill: 'kubernetes' }))
    expect(record).not.toHaveProperty('offset')
    expect(record).not.toHaveProperty('limit')
    expect(record).toEqual({ skill: 'kubernetes' })
  })

  it('ne garde qu’un champ RÉELLEMENT rempli — une suite d’espaces n’est pas un critère', () => {
    expect(needFiltersToSavedRecord(filters({ location: '   ' }))).toEqual({})
  })

  it('rejoue à l’identique ce qui a été enregistré', () => {
    const posed = filters({
      q: 'plateforme',
      skill: 'kubernetes',
      seniority: 'senior',
      location: 'Lyon',
      urgency: 'haute',
      status: 'open',
      contract_kind: 'regie',
      source: 'client_email',
      starting_within_days: 30,
      without_shortlist: true,
      deadline_passed: true,
      include_closed: true,
    })
    expect(savedRecordToNeedFilters(needFiltersToSavedRecord(posed))).toEqual(posed)
  })

  it('rejoue l’ORIGINE, et OUBLIE une origine que le contrat ne connaît plus', () => {
    // La relecture défensive s'applique à l'origine comme aux autres listes
    // fermées : une vue vit des mois, et une valeur retirée du contrat qu'on
    // retransmettrait ferait un 400 au clic — donc une liste vide sans mot.
    expect(savedRecordToNeedFilters({ source: 'client_email' }).source).toBe('client_email')
    expect(savedRecordToNeedFilters({ source: 'linkedin' }).source).toBe('')
  })

  it('IGNORE un critère que le serveur ne connaît plus — le relire tel quel produirait un 400 sur un clic', () => {
    expect(savedRecordToNeedFilters({ skill: 'go', tjm_max: 700 })).toEqual(filters({ skill: 'go' }))
  })

  it('IGNORE une valeur d’énumération inconnue plutôt que de la transmettre', () => {
    expect(savedRecordToNeedFilters({ urgency: 'brûlante', status: 'open' })).toEqual(filters({ status: 'open' }))
  })

  it('rend « je ne filtre pas sur le démarrage » sur un nombre hors bornes — jamais 0, qui est une autre question', () => {
    expect(savedRecordToNeedFilters({ starting_within_days: 0 }).starting_within_days).toBeNull()
    expect(savedRecordToNeedFilters({ starting_within_days: 999 }).starting_within_days).toBeNull()
    expect(savedRecordToNeedFilters({ starting_within_days: '30' }).starting_within_days).toBeNull()
    expect(savedRecordToNeedFilters({ starting_within_days: 30 }).starting_within_days).toBe(30)
  })

  it('ne prend un drapeau QUE s’il vaut vrai — « sans shortlist : non » n’est pas une question', () => {
    expect(savedRecordToNeedFilters({ without_shortlist: 'oui' }).without_shortlist).toBe(false)
    expect(savedRecordToNeedFilters({ without_shortlist: true }).without_shortlist).toBe(true)
  })

  it('rend les filtres vides sur un enregistrement illisible plutôt que de tomber', () => {
    expect(savedRecordToNeedFilters(null)).toEqual(emptyNeedFilters())
    expect(savedRecordToNeedFilters([])).toEqual(emptyNeedFilters())
    expect(savedRecordToNeedFilters('kubernetes')).toEqual(emptyNeedFilters())
  })
})

describe('Théo C projects-besoins.R3 — le statut affiché se garde et se relit', () => {
  it('aller-retour du statut affiché', () => {
    const record = needFiltersToSavedRecord(filters({ theo_status: 'covered' }))
    expect(record).toEqual({ theo_status: 'covered' })
    expect(savedRecordToNeedFilters(record).theo_status).toBe('covered')
  })
  it('SAIT DIRE NON : une valeur inconnue est ignorée, jamais retransmise', () => {
    expect(savedRecordToNeedFilters({ theo_status: 'matching' }).theo_status).toBe('')
  })
})
