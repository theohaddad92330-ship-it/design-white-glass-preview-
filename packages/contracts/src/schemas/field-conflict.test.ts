import { describe, expect, it } from 'vitest'
import {
  conflictedFieldSchema,
  detectFieldConflict,
  isConflictOpen,
  pipelineFieldScopeClaim,
} from './field-conflict.js'

/**
 * Le détecteur de contradiction — PDF6IA §5.3.
 *
 * La règle que ces tests tiennent : « une correction humaine gagne toujours,
 * quelle que soit sa date ». « Résolution par récence » ne veut PAS dire que le
 * plus récent gagne — c'est le contresens que le nom invite à faire, d'où le
 * renommage en `authority_wins` (#3219, #190.2).
 */
describe('detectFieldConflict — deux sources qui disent l’inverse', () => {
  const base = {
    field: 'headcount',
    incomingValue: 5000,
    incomingSource: 'pipeline' as const,
    incomingAt: '2026-08-18T09:00:00.000Z',
    currentValue: 4200,
    currentSource: 'pipeline' as const,
    currentObservedAt: '2026-08-14T09:00:00.000Z',
  }

  it('NE VOIT AUCUNE contradiction quand les deux valeurs sont identiques', () => {
    expect(detectFieldConflict({ ...base, incomingValue: 4200 })).toBeNull()
  })

  it('NE VOIT AUCUNE contradiction quand l’une des deux valeurs est un blanc', () => {
    // Un fournisseur qui ne trouve rien n'est pas un fournisseur qui contredit.
    expect(detectFieldConflict({ ...base, incomingValue: null })).toBeNull()
    expect(detectFieldConflict({ ...base, currentValue: '   ' })).toBeNull()
  })

  it('ne tranche PAS entre deux sources automatiques de MÊME autorité', () => {
    // C'est l'exemple du PDF : le registre dit 4 200, le site officiel dit 5 000.
    const conflict = detectFieldConflict(base)
    expect(conflict?.resolvedBy).toBe('unresolved')
    expect(conflict?.field).toBe('headcount')
    // La valeur ÉCARTÉE garde sa date — on archive, on ne supprime pas.
    expect(conflict?.valueA).toEqual({ value: 4200, source: 'pipeline', at: '2026-08-14T09:00:00.000Z', authority: 2 })
    expect(conflict?.valueB).toEqual({ value: 5000, source: 'pipeline', at: '2026-08-18T09:00:00.000Z', authority: 2 })
  })

  it('date la contradiction de l’instant où elle APPARAÎT, pas de la valeur la plus ancienne', () => {
    // `conflictSince` répond à « depuis quand est-ce que je ne sais pas ? ».
    expect(detectFieldConflict(base)?.conflictSince).toBe('2026-08-18T09:00:00.000Z')
  })

  // #190.1 — `authority` numérique par côté (`fieldSourceRank`), pour qualifier
  // `authority_wins` sans redemander le rang à `fieldSourceRank` en aval.
  it('porte l’autorité numérique de chaque côté (#190.1)', () => {
    const conflict = detectFieldConflict({ ...base, incomingSource: 'connector' })
    expect(conflict?.valueA.authority).toBe(2) // pipeline
    expect(conflict?.valueB.authority).toBe(3) // connector
  })

  // #190.1 — `claims` (pluriel) : les deux prétentions, dans l'ordre chronologique
  // (`valueA` est toujours la plus ancienne — voir `FieldConflictService`, LAG SQL).
  it('porte `claims` — les deux prétentions dans l’ordre chronologique (#190.1)', () => {
    const conflict = detectFieldConflict(base)
    expect(conflict?.claims).toEqual([conflict?.valueA, conflict?.valueB])
  })

  // #190.1 — `entity` : absente ici (fonction pure, ne connaît pas l'entité),
  // c'est `FieldConflictService` qui l'attache — voir field-conflict.service.spec.ts.
  it('ne porte PAS `entity` — la fonction pure ne connaît pas l’entité (#190.1)', () => {
    expect(detectFieldConflict(base)?.entity).toBeUndefined()
  })

  // #190.1 — `sourceTypes` : dédupliqué à UNE catégorie quand les deux côtés
  // sont de même source, deux quand elles diffèrent.
  it('déduplique `sourceTypes` quand les deux côtés sont de la même source (#190.1)', () => {
    expect(detectFieldConflict(base)?.sourceTypes).toEqual(['pipeline'])
  })

  it('porte les deux catégories quand les sources diffèrent (#190.1)', () => {
    const conflict = detectFieldConflict({ ...base, incomingSource: 'connector' })
    expect(conflict?.sourceTypes).toEqual(['pipeline', 'connector'])
  })

  it('résout en `resolved` quand la valeur ENTRANTE est humaine — le second EST la décision', () => {
    const conflict = detectFieldConflict({ ...base, incomingSource: 'human' })
    expect(conflict?.resolvedBy).toBe('resolved')
    // #190.1 — la correction humaine ENTRANTE est ce que la fiche porte.
    expect(conflict?.chosenValue).toBe(5000)
  })

  it('résout en `workspace_override` quand la valeur EN PLACE est humaine, même si l’entrante est plus récente', () => {
    // LE test qui compte. Le pipeline tourne toutes les nuits, l'humain une fois
    // par mois : « le plus récent » donnerait TOUJOURS la machine.
    const conflict = detectFieldConflict({
      ...base,
      currentSource: 'human',
      currentObservedAt: '2026-01-04T09:00:00.000Z',
      incomingAt: '2026-08-18T09:00:00.000Z',
    })
    expect(conflict?.resolvedBy).toBe('workspace_override')
    // #190.1 — la correction humaine EN PLACE n'est jamais écrasée : c'est
    // elle que la fiche porte, pas l'entrée automatique plus récente.
    expect(conflict?.chosenValue).toBe(4200)
  })

  it('résout en `authority_wins` quand les autorités DIFFÈRENT — la plus forte l’emporte, côté ENTRANT', () => {
    const conflict = detectFieldConflict({ ...base, incomingSource: 'connector' })
    expect(conflict?.resolvedBy).toBe('authority_wins')
    // #190.1 — connector (3) > pipeline (2) : l'entrante l'emporte.
    expect(conflict?.chosenValue).toBe(5000)
  })

  it('résout en `authority_wins` côté EN PLACE — l’entrante plus faible ne l’emporte pas', () => {
    const conflict = detectFieldConflict({ ...base, currentSource: 'connector', incomingSource: 'pipeline' })
    expect(conflict?.resolvedBy).toBe('authority_wins')
    // #190.1 — connector (3) en place > pipeline (2) entrant : la fiche ne bouge pas.
    expect(conflict?.chosenValue).toBe(4200)
  })

  it('ne dit `unresolved` QUE pour une égalité d’autorité entre deux sources automatiques', () => {
    for (const source of ['connector', 'pipeline', 'model'] as const) {
      const conflict = detectFieldConflict({ ...base, currentSource: source, incomingSource: source })
      expect(conflict?.resolvedBy).toBe('unresolved')
      // #190.1 — PAS de `chosenValue` : le seul statut où le produit dit
      // explicitement qu'il ne tranche pas ne montre aucune valeur choisie,
      // même si l'arbitre (autorité égale) a mécaniquement accepté l'entrante.
      expect(conflict?.chosenValue).toBeNull()
    }
    // Deux humains ne sont jamais « non tranché » : le second EST la décision,
    // et une décision humaine entrante est toujours `resolved`, qu'elle
    // conteste une valeur humaine antérieure ou non.
    expect(detectFieldConflict({ ...base, currentSource: 'human', incomingSource: 'human' })?.resolvedBy).toBe(
      'resolved',
    )
  })

  it('rend une forme que le schéma accepte', () => {
    expect(() => conflictedFieldSchema.parse(detectFieldConflict(base))).not.toThrow()
  })

  it('refuse une date illisible plutôt que d’inventer un instant', () => {
    expect(detectFieldConflict({ ...base, incomingAt: 'pas une date' })).toBeNull()
    expect(detectFieldConflict({ ...base, currentObservedAt: 'pas une date' })).toBeNull()
  })
})

describe('#190.2 — freshness_wins, obsolete_source, nextCheck (lot E1 30/09)', () => {
  const base = {
    field: 'headcount',
    incomingValue: 5000,
    incomingSource: 'pipeline' as const,
    incomingAt: '2026-08-18T09:00:00.000Z',
    currentValue: 4200,
    currentSource: 'pipeline' as const,
    currentObservedAt: '2026-08-14T09:00:00.000Z',
  }
  const old = { currentObservedAt: '2026-01-01T09:00:00.000Z' }

  it('`freshness_wins` : même autorité, l’ancien relevé a 180 jours ou plus — le frais l’emporte, et ça se ferme', () => {
    const conflict = detectFieldConflict({ ...base, ...old })
    expect(conflict?.resolvedBy).toBe('freshness_wins')
    expect(conflict?.chosenValue).toBe(5000)
    expect(conflict ? isConflictOpen(conflict) : null).toBe(false)
    expect(conflict?.freshnessGapDays).toBeGreaterThanOrEqual(180)
  })

  it('sait dire NON : 179 jours d’écart restent `unresolved`', () => {
    const conflict = detectFieldConflict({ ...base, currentObservedAt: '2026-02-21T09:00:00.000Z' })
    expect(conflict?.freshnessGapDays).toBe(178)
    expect(conflict?.resolvedBy).toBe('unresolved')
  })

  it('`obsolete_source` : la source en place a cessé d’écrire — elle perd, même à moins de 180 jours', () => {
    const conflict = detectFieldConflict({
      ...base,
      currentSource: 'model',
      obsoleteSources: ['model'],
    })
    expect(conflict?.resolvedBy).toBe('obsolete_source')
    expect(conflict?.chosenValue).toBe(5000)
    expect(conflict ? isConflictOpen(conflict) : null).toBe(false)
  })

  it('sait dire NON : une source obsolète ne perd pas contre ELLE-MÊME', () => {
    const conflict = detectFieldConflict({ ...base, obsoleteSources: ['pipeline'] })
    expect(conflict?.resolvedBy).toBe('unresolved')
  })

  it('une correction humaine EN PLACE gagne sur tout, même contre une source obsolète ou 180 jours', () => {
    const conflict = detectFieldConflict({ ...base, ...old, currentSource: 'human', obsoleteSources: ['human'] })
    expect(conflict?.resolvedBy).toBe('workspace_override')
    expect(conflict?.chosenValue).toBe(4200)
  })

  it('`nextCheck` : une contradiction OUVERTE se revérifie 14 jours après son apparition, jamais une tranchée', () => {
    const open = detectFieldConflict(base)
    expect(open?.nextCheck).toBe('2026-09-01T09:00:00.000Z')
    const settled = detectFieldConflict({ ...base, currentSource: 'human' })
    expect(settled?.nextCheck).toBeNull()
  })
})

describe('isConflictOpen — ce qui se MONTRE', () => {
  const conflict = conflictedFieldSchema.parse({
    field: 'headcount',
    valueA: { value: 4200, source: 'pipeline', at: '2026-08-14T09:00:00.000Z', authority: 2 },
    valueB: { value: 5000, source: 'pipeline', at: '2026-08-18T09:00:00.000Z', authority: 2 },
    claims: [
      { value: 4200, source: 'pipeline', at: '2026-08-14T09:00:00.000Z', authority: 2 },
      { value: 5000, source: 'pipeline', at: '2026-08-18T09:00:00.000Z', authority: 2 },
    ],
    sourceTypes: ['pipeline'],
    conflictSince: '2026-08-18T09:00:00.000Z',
    resolvedBy: 'unresolved',
    chosenValue: null,
    freshnessGapDays: 4,
    nextCheck: '2026-09-01T09:00:00.000Z',
  })

  it('ouvre le seul cas où le produit ne sait pas', () => {
    expect(isConflictOpen(conflict)).toBe(true)
  })

  it('ferme un conflit tranché — par un humain, par une autorité, ou par override', () => {
    expect(isConflictOpen({ ...conflict, resolvedBy: 'resolved' })).toBe(false)
    expect(isConflictOpen({ ...conflict, resolvedBy: 'workspace_override' })).toBe(false)
    expect(isConflictOpen({ ...conflict, resolvedBy: 'authority_wins' })).toBe(false)
    expect(isConflictOpen({ ...conflict, resolvedBy: 'freshness_wins' })).toBe(false)
    expect(isConflictOpen({ ...conflict, resolvedBy: 'obsolete_source' })).toBe(false)
  })

  it('accepte un `entity` optionnel — attaché par le service, jamais par le détecteur', () => {
    const withEntity = { ...conflict, entity: { type: 'account' as const, id: 'acc-1' } }
    expect(() => conflictedFieldSchema.parse(withEntity)).not.toThrow()
    expect(isConflictOpen(withEntity)).toBe(true)
  })
})

describe('#190.2 — scope_difference (lot X51 02/10)', () => {
  const base = {
    field: 'headcount',
    incomingValue: 500,
    incomingSource: 'connector' as const,
    incomingAt: '2026-08-18T09:00:00.000Z',
    currentValue: 12,
    currentSource: 'connector' as const,
    currentObservedAt: '2026-08-14T09:00:00.000Z',
  }

  it('deux valeurs de PORTÉES DÉCLARÉES différentes ne se contredisent pas : `scope_difference`, jamais ouverte', () => {
    const conflict = detectFieldConflict({ ...base, incomingScope: 'groupe', currentScope: 'équipe Data' })
    expect(conflict?.resolvedBy).toBe('scope_difference')
    expect(conflict?.valueA.scope).toBe('équipe Data')
    expect(conflict?.valueB.scope).toBe('groupe')
    // Les deux sont vraies, chacune dans sa portée : rien n'est « choisi », rien à revérifier.
    expect(conflict?.chosenValue).toBeNull()
    expect(conflict?.nextCheck).toBeNull()
    expect(isConflictOpen(conflict!)).toBe(false)
    expect(conflictedFieldSchema.safeParse(conflict).success).toBe(true)
  })

  it('le NON : même portée déclarée → contradiction ordinaire (ouverte à autorité égale)', () => {
    const conflict = detectFieldConflict({ ...base, incomingScope: 'groupe', currentScope: ' groupe ' })
    expect(conflict?.resolvedBy).toBe('unresolved')
  })

  it('le NON : une portée absente d’un côté n’est pas devinée — contradiction ordinaire', () => {
    expect(detectFieldConflict({ ...base, incomingScope: 'groupe' })?.resolvedBy).toBe('unresolved')
    expect(detectFieldConflict({ ...base, currentScope: 'groupe' })?.resolvedBy).toBe('unresolved')
    expect(detectFieldConflict(base)?.valueA.scope).toBeUndefined()
  })

  it('une correction humaine passe avant : la portée ne lui retire rien', () => {
    const conflict = detectFieldConflict({
      ...base,
      incomingSource: 'human',
      incomingScope: 'groupe',
      currentScope: 'équipe Data',
    })
    expect(conflict?.resolvedBy).toBe('resolved')
  })
})

// #3219 (#190.2, lot P02 07/10) — le premier écrivain RÉEL de `scope` : le
// périmètre d'analyse DÉCLARÉ d'un run (`AnalysisScopeMode` : groupe/business_unit/…,
// choisi par le commercial avant de lancer, jamais deviné). Jusqu'ici aucun
// connecteur ne passait `scope` à `ProvenanceService.commit` — `scope_difference`
// restait un no-op strict, faute de deuxième relevé scopé à comparer.
describe('pipelineFieldScopeClaim — #3219, le premier écrivain de `scope`', () => {
  const labels = { groupe: 'Groupe entier', business_unit: 'Business unit' }

  it('nomme la claim quand la portée est connue et la valeur a changé', () => {
    expect(
      pipelineFieldScopeClaim({
        previousValue: '500',
        newValue: '12',
        scopeMode: 'business_unit',
        scopeLabels: labels,
      }),
    ).toEqual({ oldValue: '500', newValue: '12', scope: 'Business unit' })
  })

  it('aucune claim sans scopeMode déclaré (no-op strict, rien deviné)', () => {
    expect(
      pipelineFieldScopeClaim({ previousValue: '500', newValue: '12', scopeMode: null, scopeLabels: labels }),
    ).toBeNull()
    expect(
      pipelineFieldScopeClaim({ previousValue: '500', newValue: '12', scopeMode: undefined, scopeLabels: labels }),
    ).toBeNull()
  })

  it('aucune claim pour un scopeMode hors vocabulaire (jamais un libellé inventé)', () => {
    expect(
      pipelineFieldScopeClaim({
        previousValue: '500',
        newValue: '12',
        scopeMode: 'n’importe quoi',
        scopeLabels: labels,
      }),
    ).toBeNull()
  })

  it('aucune claim quand la valeur n’a pas changé — rien à journaliser', () => {
    expect(
      pipelineFieldScopeClaim({ previousValue: '500', newValue: '500', scopeMode: 'groupe', scopeLabels: labels }),
    ).toBeNull()
  })

  it('aucune claim pour une nouvelle valeur vide', () => {
    expect(
      pipelineFieldScopeClaim({ previousValue: '500', newValue: '  ', scopeMode: 'groupe', scopeLabels: labels }),
    ).toBeNull()
  })

  it('une valeur PRÉCÉDENTE absente (premier relevé) reste une claim valide — oldValue `null`', () => {
    expect(
      pipelineFieldScopeClaim({ previousValue: null, newValue: '12', scopeMode: 'business_unit', scopeLabels: labels }),
    ).toEqual({ oldValue: null, newValue: '12', scope: 'Business unit' })
  })
})
