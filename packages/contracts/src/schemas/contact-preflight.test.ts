import { describe, expect, it } from 'vitest'
import { detectFieldConflict, type ConflictedField } from './field-conflict.js'
import { compileContactPreflight, contactPreflightSchema, titlesDiffer } from './contact-preflight.js'

/**
 * #3219 (#190.2 côté CONTACT, décision Louis 11/10) — le contrôle de périmètre
 * AVANT une action sur un contact. Ce fichier tient trois promesses :
 *  - il ne fabrique aucun moteur : les contradictions viennent de
 *    `detectFieldConflict` (le même que la fiche compte), le périmètre vient de
 *    la porte d'éligibilité (sa raison est passée telle quelle) ;
 *  - il ne tranche jamais : aucune valeur « choisie », aucun verdict « bloqué » ;
 *  - il dit ce qu'il n'a pas pu lire, sans jamais le confondre avec « rien ».
 */

const AT_OLD = '2026-09-01T10:00:00.000Z'
const AT_NEW = '2026-10-05T10:00:00.000Z'

function conflict(overrides: Partial<Parameters<typeof detectFieldConflict>[0]> = {}): ConflictedField {
  const detected = detectFieldConflict({
    field: 'title',
    incomingValue: 'DSI France',
    incomingSource: 'pipeline',
    incomingAt: AT_NEW,
    currentValue: 'DSI Groupe',
    currentSource: 'pipeline',
    currentObservedAt: AT_OLD,
    ...overrides,
  })
  if (!detected) throw new Error('fixture: aucune contradiction détectée')
  return detected
}

const EVALUATED_IN_SCOPE = { state: 'evaluated' as const, exclusion: null, entity: 'SNCF Connect & Tech' }

function base() {
  return {
    contactId: 'c1',
    action: null,
    conflicts: [] as ConflictedField[],
    accountScope: EVALUATED_IN_SCOPE,
    employer: null,
    title: null,
  }
}

describe('compileContactPreflight — rien à signaler', () => {
  it('sans aucune différence, le statut le DIT et la liste est vide', () => {
    const result = compileContactPreflight(base())
    expect(result.status).toBe('no_difference')
    expect(result.items).toEqual([])
    expect(result.unknowns).toEqual([])
    expect(contactPreflightSchema.parse(result)).toEqual(result)
  })
})

describe('compileContactPreflight — contradictions de champ (même détecteur que le compte)', () => {
  it('une contradiction OUVERTE se nomme avec ses deux prétentions et sa revérification', () => {
    const open = conflict()
    expect(open.resolvedBy).toBe('unresolved')
    const result = compileContactPreflight({ ...base(), conflicts: [open] })
    expect(result.status).toBe('differences')
    expect(result.items).toEqual([
      {
        kind: 'open_conflict',
        field: 'title',
        claims: [
          { value: 'DSI Groupe', source: 'pipeline', at: AT_OLD },
          { value: 'DSI France', source: 'pipeline', at: AT_NEW },
        ],
        nextCheck: open.nextCheck,
      },
    ])
  })

  it('#3400 — un tableau sérialisé au journal sort en liste lisible, jamais en JSON ; vide = aucune valeur', () => {
    const open = conflict({
      field: 'careerLevers',
      incomingValue: '["Promotion visée","Reconnaissance"]',
      currentValue: '[]',
    })
    const result = compileContactPreflight({ ...base(), conflicts: [open] })
    const item = result.items[0]
    if (item?.kind !== 'open_conflict') throw new Error('fixture: contradiction ouverte attendue')
    const values = item.claims.map(claim => claim.value)
    expect(values).toContain('Promotion visée, Reconnaissance')
    expect(values).toContain(null)
    expect(JSON.stringify(values)).not.toMatch(/\\"|\[\\/)
  })

  it('#190.2 — `scope_difference` : deux vérités, chacune dans sa portée DÉCLARÉE, sans valeur choisie', () => {
    const scoped = conflict({ incomingScope: 'Filiales', currentScope: 'Groupe entier' })
    expect(scoped.resolvedBy).toBe('scope_difference')
    const result = compileContactPreflight({ ...base(), conflicts: [scoped] })
    expect(result.items).toEqual([
      {
        kind: 'scope_difference',
        field: 'title',
        claims: [
          { value: 'DSI Groupe', source: 'pipeline', at: AT_OLD, scope: 'Groupe entier' },
          { value: 'DSI France', source: 'pipeline', at: AT_NEW, scope: 'Filiales' },
        ],
      },
    ])
    expect(JSON.stringify(result)).not.toMatch(/chosen/i)
  })

  it('une correction humaine gagne toujours : `resolved` et `workspace_override` ne font AUCUNE ligne', () => {
    const humanIncoming = conflict({ incomingSource: 'human' })
    const humanInPlace = conflict({ currentSource: 'human' })
    expect(humanIncoming.resolvedBy).toBe('resolved')
    expect(humanInPlace.resolvedBy).toBe('workspace_override')
    const result = compileContactPreflight({ ...base(), conflicts: [humanIncoming, humanInPlace] })
    expect(result.items).toEqual([])
    expect(result.status).toBe('no_difference')
  })

  it('un conflit tranché par la machine (autorité, fraîcheur) reste au journal, pas au contrôle', () => {
    const authority = conflict({ currentSource: 'connector' })
    expect(authority.resolvedBy).toBe('authority_wins')
    expect(compileContactPreflight({ ...base(), conflicts: [authority] }).items).toEqual([])
  })

  it('sait dire NON — un journal ILLISIBLE n’est jamais « aucune contradiction »', () => {
    const result = compileContactPreflight({ ...base(), conflicts: null })
    expect(result.status).toBe('incomplete')
    expect(result.unknowns).toEqual([{ section: 'field_conflicts', reason: 'unreadable' }])
  })
})

describe('compileContactPreflight — périmètre du compte (la porte d’éligibilité, relue)', () => {
  it('`entity_mismatch` → contact hors du périmètre retenu, avec l’entité qu’il déclare', () => {
    const result = compileContactPreflight({
      ...base(),
      accountScope: { state: 'evaluated', exclusion: 'entity_mismatch', entity: 'Filiale hors secteur' },
    })
    expect(result.items).toEqual([{ kind: 'out_of_account_scope', entity: 'Filiale hors secteur' }])
  })

  it('`homonym_conflict` → doute d’identité', () => {
    const result = compileContactPreflight({
      ...base(),
      accountScope: { state: 'evaluated', exclusion: 'homonym_conflict', entity: null },
    })
    expect(result.items).toEqual([{ kind: 'identity_doubt' }])
  })

  it('les autres raisons d’exclusion (écarté, historique) ne sont PAS des différences de périmètre', () => {
    for (const exclusion of ['permission_denied', 'former_employee', 'flagged_incorrect_contact'] as const) {
      const result = compileContactPreflight({
        ...base(),
        accountScope: { state: 'evaluated', exclusion, entity: null },
      })
      expect(result.items).toEqual([])
    }
  })

  it('un périmètre non évaluable se NOMME (sans compte, sans cartographie, sans entité)', () => {
    for (const reason of ['no_account', 'no_account_scope_mapped', 'no_contact_entity', 'unreadable'] as const) {
      const result = compileContactPreflight({ ...base(), accountScope: { state: 'unknown', reason } })
      expect(result.unknowns).toEqual([{ section: 'account_scope', reason }])
      expect(result.status).toBe('incomplete')
    }
  })

  it('une différence trouvée l’emporte sur « incomplet » : le statut dit qu’il y a à lire', () => {
    const result = compileContactPreflight({
      ...base(),
      conflicts: [conflict()],
      accountScope: { state: 'unknown', reason: 'no_account' },
    })
    expect(result.status).toBe('differences')
    expect(result.unknowns).toHaveLength(1)
  })
})

describe('compileContactPreflight — poste et entreprise selon la source', () => {
  it('l’entreprise rapportée par une source diffère de la fiche : les deux valeurs, et qui garde la main', () => {
    const result = compileContactPreflight({
      ...base(),
      employer: { recordValue: 'SNCF', sourceValue: 'Capgemini', recordKeptByHuman: true },
    })
    expect(result.items).toEqual([
      { kind: 'employer_differs', recordValue: 'SNCF', sourceValue: 'Capgemini', recordKeptByHuman: true },
    ])
  })

  it('le poste rapporté diffère VRAIMENT → une ligne ; une simple variante d’écriture → rien', () => {
    const differs = compileContactPreflight({
      ...base(),
      title: { recordValue: 'Directeur des achats', sourceValue: 'Responsable RH', recordKeptByHuman: false },
    })
    expect(differs.items).toEqual([
      {
        kind: 'title_differs',
        recordValue: 'Directeur des achats',
        sourceValue: 'Responsable RH',
        recordKeptByHuman: false,
      },
    ])
    const variant = compileContactPreflight({
      ...base(),
      title: {
        recordValue: 'Directeur des Achats',
        sourceValue: 'directeur des achats groupe',
        recordKeptByHuman: false,
      },
    })
    expect(variant.items).toEqual([])
  })

  it('le même désaccord ne compte jamais deux fois : un conflit journalisé sur `title` masque la comparaison de profil', () => {
    const result = compileContactPreflight({
      ...base(),
      conflicts: [conflict()],
      title: { recordValue: 'DSI France', sourceValue: 'Responsable RH', recordKeptByHuman: false },
    })
    expect(result.items.map(item => item.kind)).toEqual(['open_conflict'])
  })

  it('un employeur différent rend le poste incomparable : seule la ligne entreprise sort', () => {
    const result = compileContactPreflight({
      ...base(),
      employer: { recordValue: 'SNCF', sourceValue: 'Capgemini', recordKeptByHuman: false },
      title: { recordValue: 'DSI', sourceValue: 'Consultant senior', recordKeptByHuman: false },
    })
    expect(result.items.map(item => item.kind)).toEqual(['employer_differs'])
  })
})

describe('compileContactPreflight — l’action change le cadre, jamais le contenu', () => {
  it('trois actions, MÊMES lignes dans le MÊME ordre', () => {
    const input = {
      ...base(),
      conflicts: [conflict()],
      accountScope: { state: 'evaluated' as const, exclusion: 'entity_mismatch' as const, entity: 'X' },
      employer: { recordValue: 'SNCF', sourceValue: 'Capgemini', recordKeptByHuman: false },
    }
    const items = (['prepare_message', 'add_to_sequence', 'export_crm'] as const).map(
      action => compileContactPreflight({ ...input, action }).items,
    )
    expect(items[0]).toEqual(items[1])
    expect(items[1]).toEqual(items[2])
    expect(items[0]?.map(item => item.kind)).toEqual(['open_conflict', 'employer_differs', 'out_of_account_scope'])
  })
})

describe('titlesDiffer', () => {
  it('ignore la casse, les accents, la ponctuation et l’inclusion', () => {
    expect(titlesDiffer('Directeur Général', 'directeur general')).toBe(false)
    expect(titlesDiffer('DSI', 'DSI — Groupe')).toBe(false)
    expect(titlesDiffer('DSI', 'Directrice financière')).toBe(true)
  })
  it('un blanc n’est jamais une différence', () => {
    expect(titlesDiffer(null, 'DSI')).toBe(false)
    expect(titlesDiffer('  ', 'DSI')).toBe(false)
  })
})
