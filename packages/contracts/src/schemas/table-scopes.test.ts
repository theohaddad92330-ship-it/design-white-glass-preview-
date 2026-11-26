import { describe, expect, it } from 'vitest'
import { RETIRED_TABLES, TABLE_SCOPES } from './table-scopes.js'

/**
 * Ce que ce test tient, et ce qu'il ne peut PAS tenir.
 *
 * Il vit dans `packages/contracts`, qui ne connaît ni les entités TypeORM ni le
 * schéma : il ne peut donc rien dire de la COMPLÉTUDE du registre — c'est le
 * travail de GA-65 (`apps/api/src/architecture/table-scope-registry.spec.ts`),
 * qui lit les métadonnées des entités réellement enregistrées.
 *
 * Il tient ce qui se vérifie sans base : la FORME. Un nom de table mal écrit,
 * une jointure qui pointe sur elle-même, une entrée « à classer » qui ne pose
 * aucune question — trois fautes qui laisseraient GA-65 parfaitement vert, parce
 * qu'une entrée mal formée reste une entrée.
 */
describe('Le registre des tables scoped / shared', () => {
  it('LIT quelque chose — un registre peuplé, et les DEUX catégories présentes', () => {
    const entries = Object.entries(TABLE_SCOPES)
    expect(entries.length).toBeGreaterThan(20)
    // Le jour où l'une des deux catégories disparaît, la distinction du tome 7
    // §23.1 a cessé d'exister et personne ne s'en apercevrait autrement.
    expect(entries.filter(([, scope]) => scope.category === 'scoped').length).toBeGreaterThan(0)
    expect(entries.filter(([, scope]) => scope.category === 'shared').length).toBeGreaterThan(0)
  })

  it('chaque clé est un nom de table PostgreSQL, en minuscules', () => {
    const malformed = [...Object.keys(TABLE_SCOPES), ...Object.keys(RETIRED_TABLES)].filter(
      name => !/^[a-z][a-z0-9_]*$/.test(name),
    )
    expect(malformed).toEqual([])
  })

  it('une table isolée par un parent ne se cite pas elle-même', () => {
    const circular = Object.entries(TABLE_SCOPES)
      .filter(([name, scope]) => scope.category === 'scoped' && scope.by === 'parent' && scope.parent === name)
      .map(([name]) => name)
    expect(circular).toEqual([])
  })

  it('une table isolée par un parent nomme une colonne, pas une portée devinée', () => {
    const vague = Object.entries(TABLE_SCOPES)
      .filter(([, scope]) => scope.category === 'scoped' && scope.by === 'parent')
      .filter(([, scope]) => scope.category === 'scoped' && scope.by === 'parent' && !/_id$/.test(scope.column))
      .map(([name]) => name)
    expect(vague).toEqual([])
  })

  it('une table « à classer » POSE une question', () => {
    const mute = Object.entries(TABLE_SCOPES)
      .filter(([, scope]) => scope.category === 'to-classify')
      .filter(([, scope]) => scope.category === 'to-classify' && !scope.question.includes('?'))
      .map(([name]) => name)
    expect(mute).toEqual([])
  })

  it('une table retirée n’est pas classée en même temps', () => {
    expect(Object.keys(RETIRED_TABLES).filter(name => name in TABLE_SCOPES)).toEqual([])
  })

  it('sait dire NON — les trois formes fautives sont bien détectées', () => {
    // Rejoué sur des entrées fabriquées : abîmer une vraie entrée pour le
    // prouver ferait courir le risque qu'on oublie de la remettre.
    expect(/^[a-z][a-z0-9_]*$/.test('Match_Run_Entries')).toBe(false)
    expect(/^[a-z][a-z0-9_]*$/.test('match_run_entries')).toBe(true)
    expect(/_id$/.test('shortlist')).toBe(false)
    expect(/_id$/.test('shortlist_id')).toBe(true)
    expect('Cette table appartient-elle à un espace ?'.includes('?')).toBe(true)
    expect('On verra plus tard.'.includes('?')).toBe(false)
  })
})
