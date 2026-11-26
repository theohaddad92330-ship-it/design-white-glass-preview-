import { afterEach, describe, expect, it } from 'vitest'
import {
  COMPACT_PROJECT_COLUMNS,
  DEFAULT_PROJECT_COLUMNS,
  PINNED_PROJECT_COLUMN,
  PROJECT_COLUMN_KEYS,
  projectColumnsStorageKey,
  readStoredProjectColumns,
  writeStoredProjectColumns,
} from './project-columns'

// #4337.1 — neuf colonnes ne tiennent pas à 1 280 px : les secondaires passent derrière « Colonnes ».
afterEach(() => window.localStorage.clear())

describe('project-columns', () => {
  it("le nom de l'affaire est la colonne épinglée, hors du choix", () => {
    expect(PINNED_PROJECT_COLUMN).toBe('project')
    expect(PROJECT_COLUMN_KEYS).not.toContain('project')
  })

  it('« Origine » suit tout de suite le nom (#4336.2) : première des colonnes choisissables', () => {
    expect(PROJECT_COLUMN_KEYS[0]).toBe('origin')
  })

  it('par défaut tout est affiché ; en compact, les deux secondaires (activité, âge) sortent', () => {
    expect(DEFAULT_PROJECT_COLUMNS).toEqual(PROJECT_COLUMN_KEYS)
    expect(COMPACT_PROJECT_COLUMNS).not.toContain('lastActivity')
    expect(COMPACT_PROJECT_COLUMNS).not.toContain('age')
    expect(COMPACT_PROJECT_COLUMNS).toContain('stage')
    expect(COMPACT_PROJECT_COLUMNS).toContain('amount')
  })

  it("un choix enregistré revient dans l'ordre canonique, les clés inconnues écartées", () => {
    writeStoredProjectColumns('u1', ['age', 'stage', 'origin'])
    expect(readStoredProjectColumns('u1')).toEqual(['origin', 'stage', 'age'])
    window.localStorage.setItem(projectColumnsStorageKey('u1'), JSON.stringify(['stage', 'bogus']))
    expect(readStoredProjectColumns('u1')).toEqual(['stage'])
  })

  it('un contenu illisible ou vide retombe sur « pas de choix » (null)', () => {
    window.localStorage.setItem(projectColumnsStorageKey('u1'), '{nope')
    expect(readStoredProjectColumns('u1')).toBeNull()
    window.localStorage.setItem(projectColumnsStorageKey('u1'), JSON.stringify(['bogus']))
    expect(readStoredProjectColumns('u1')).toBeNull()
  })

  it('déconnecté : rien ne s’écrit', () => {
    writeStoredProjectColumns(null, ['stage'])
    expect(window.localStorage.length).toBe(0)
  })
})
