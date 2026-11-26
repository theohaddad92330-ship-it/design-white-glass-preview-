import { ORG_CORRECTION_FIELDS_BY_OBJECT, orgGraphSchema } from '@bellum/contracts'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CORRECTION_EVIDENCE_KINDS,
  ENTITY_CORRECTION_FIELDS,
  PERSON_CORRECTION_FIELDS,
  buildPersonCorrection,
  correctionEditor,
  correctionObjectType,
  currentPersonValue,
  draftValue,
  emptyDraft,
  motiveAssertsValue,
  readGraphConflict,
} from './orgCorrectionDraft'

const SOURCE = { id: 's-off', kind: 'official_site' as const, grounding: 'A' as const, date: '2026-08-01' }

const GRAPH = orgGraphSchema.parse({
  graphVersion: 7,
  entities: [
    { id: 'e-grp', name: 'ACME SA', type: 'groupe', parentId: null, confidence: 90, sources: [SOURCE] },
    { id: 'e-it', name: 'Direction des systèmes d’information', type: 'bu', parentId: 'e-grp', confidence: 70 },
  ],
  people: [
    {
      id: 'p-marie-martin',
      fullName: 'Marie Martin',
      title: 'Directrice des systèmes d’information',
      entityId: 'e-it',
      hierarchyLevel: 'L1',
      decisionRoles: ['economic_buyer'],
      identityStatus: 'actionable',
      confidence: 80,
      sources: [SOURCE],
    },
    {
      id: 'p-paul-durand',
      fullName: 'Paul Durand',
      title: 'Responsable infrastructure',
      entityId: 'e-it',
      hierarchyLevel: 'L3',
      decisionRoles: [],
      identityStatus: 'classified',
      confidence: 55,
      sources: [],
    },
  ],
  hierarchyEdges: [],
  influenceEdges: [],
})

/**
 * Le brouillon de correction — la partie PURE du tiroir.
 *
 * Ce que ces tests tiennent, et qui n'est pas décoratif :
 *
 *  1. **la liste des champs vient du CONTRAT**, jamais d'une recopie. Le jour
 *     où le ledger apprend un sixième champ, l'écran le propose sans qu'on y
 *     touche — et le jour où il en perd un, l'écran cesse de le proposer ;
 *  2. **une requête est validée contre le contrat AVANT de partir.** Un tiroir
 *     qui envoie une preuve d'identité pour prouver un rattachement fait un
 *     aller-retour réseau pour se faire dire non ;
 *  3. **`''` devient `null`, jamais la chaîne vide** — « retiré ⇒ inconnu » ;
 *  4. **le corps du 409 se relit**, sinon le verrou optimiste devient une perte
 *     de saisie silencieuse.
 */
describe('orgCorrectionDraft — le corpus n’est pas vide', () => {
  it('lit des champs corrigibles, des preuves et un graphe peuplé', () => {
    expect(PERSON_CORRECTION_FIELDS.length).toBeGreaterThan(0)
    expect(CORRECTION_EVIDENCE_KINDS.length).toBeGreaterThan(0)
    expect(GRAPH.people.length).toBeGreaterThan(0)
    expect(GRAPH.entities.length).toBeGreaterThan(0)
  })
})

describe('les champs proposés viennent du contrat', () => {
  it('propose EXACTEMENT les champs que le ledger sait écrire sur une personne', () => {
    expect([...PERSON_CORRECTION_FIELDS]).toEqual([...ORG_CORRECTION_FIELDS_BY_OBJECT.person])
  })

  it('ne propose aucun champ qui appartient à un autre objet', () => {
    for (const field of PERSON_CORRECTION_FIELDS) {
      expect(ORG_CORRECTION_FIELDS_BY_OBJECT.entity as readonly string[]).not.toContain(field)
      expect(ORG_CORRECTION_FIELDS_BY_OBJECT.edge as readonly string[]).not.toContain(field)
    }
  })
})

describe('l’éditeur de valeur borne le geste à ce que l’API sait écrire', () => {
  it('un titre se saisit librement', () => {
    expect(correctionEditor(GRAPH, 'title', 'p-marie-martin').kind).toBe('text')
  })

  it('une entité se CHOISIT parmi celles du graphe — jamais un identifiant tapé à la main', () => {
    const editor = correctionEditor(GRAPH, 'entityId', 'p-marie-martin')
    expect(editor.kind).toBe('choice')
    if (editor.kind !== 'choice') throw new Error('éditeur inattendu')
    expect(editor.options.map(o => o.value)).toEqual(['e-grp', 'e-it'])
    expect(editor.options.map(o => o.label)).toEqual(['ACME SA', 'Direction des systèmes d’information'])
  })

  it('un N+1 se choisit parmi les AUTRES personnes — personne ne se rapporte à soi-même', () => {
    const editor = correctionEditor(GRAPH, 'reportsTo', 'p-marie-martin')
    if (editor.kind !== 'choice') throw new Error('éditeur inattendu')
    expect(editor.options.map(o => o.value)).toEqual(['p-paul-durand'])
  })

  it('un niveau et des rôles se choisissent dans l’énumération du contrat', () => {
    const level = correctionEditor(GRAPH, 'hierarchyLevel', 'p-marie-martin')
    expect(level.kind).toBe('level')
    if (level.kind !== 'level') throw new Error('éditeur inattendu')
    expect(level.options).toContain('L0')
    expect(level.options).toContain('L5')

    const roles = correctionEditor(GRAPH, 'decisionRoles', 'p-marie-martin')
    if (roles.kind !== 'roles') throw new Error('éditeur inattendu')
    expect(roles.options).toContain('economic_buyer')
  })
})

describe('ce que le graphe dit AUJOURD’HUI, pour ne pas corriger à l’aveugle', () => {
  it('rend la valeur courante de chaque champ', () => {
    expect(currentPersonValue(GRAPH, 'p-marie-martin', 'title')).toBe('Directrice des systèmes d’information')
    expect(currentPersonValue(GRAPH, 'p-marie-martin', 'entityId')).toBe('e-it')
    expect(currentPersonValue(GRAPH, 'p-marie-martin', 'hierarchyLevel')).toBe('L1')
    expect(currentPersonValue(GRAPH, 'p-marie-martin', 'decisionRoles')).toEqual(['economic_buyer'])
  })

  it('rend `null` — jamais « 0 » ni la chaîne vide — quand le graphe ne sait pas', () => {
    expect(currentPersonValue(GRAPH, 'p-paul-durand', 'reportsTo')).toBeNull()
    expect(currentPersonValue(GRAPH, 'p-inconnu', 'title')).toBeNull()
  })
})

describe('la valeur du brouillon', () => {
  it('une saisie vide vaut « information inconnue », jamais la chaîne vide', () => {
    expect(draftValue({ ...emptyDraft('title'), text: '   ' })).toBeNull()
  })

  it('un titre saisi est rogné', () => {
    expect(draftValue({ ...emptyDraft('title'), text: '  Directeur technique  ' })).toBe('Directeur technique')
  })

  it('les rôles voyagent en tableau', () => {
    expect(draftValue({ ...emptyDraft('decisionRoles'), roles: ['champion', 'blocker'] })).toEqual([
      'champion',
      'blocker',
    ])
  })
})

describe('la requête est validée contre le contrat AVANT de partir', () => {
  const base = {
    ...emptyDraft('title'),
    text: 'Directrice générale déléguée',
    reason: 'Titre relevé sur la page Gouvernance du site du groupe.',
    evidenceKind: 'official_site' as const,
    evidenceRef: 'https://acme.example/gouvernance',
    evidenceDate: '2026-08-20',
  }

  it('pose la preuve QUE LE CHAMP EXIGE, sans que l’écran ait à la connaître', () => {
    const request = buildPersonCorrection({
      expectedGraphVersion: 7,
      personId: 'p-marie-martin',
      draft: base,
    })
    expect(request).not.toBeNull()
    expect(request?.claims[0]?.evidence.claim).toBe('title')
    expect(request?.expectedGraphVersion).toBe(7)
    expect(request?.objectType).toBe('person')
    expect(request?.objectId).toBe('p-marie-martin')
  })

  it('corriger un N+1 exige une preuve de RELATION, pas d’identité', () => {
    const request = buildPersonCorrection({
      expectedGraphVersion: 7,
      personId: 'p-paul-durand',
      draft: { ...base, field: 'reportsTo', text: 'p-marie-martin' },
    })
    expect(request?.claims[0]?.evidence.claim).toBe('relation')
  })

  it('refuse une correction sans raison écrite — une correction sans raison n’est pas une correction', () => {
    expect(
      buildPersonCorrection({
        expectedGraphVersion: 7,
        personId: 'p-marie-martin',
        draft: { ...base, reason: '   ' },
      }),
    ).toBeNull()
  })

  it('refuse une version attendue absurde — le verrou n’est pas optionnel', () => {
    expect(buildPersonCorrection({ expectedGraphVersion: 0, personId: 'p-marie-martin', draft: base })).toBeNull()
  })

  it('n’envoie ni référence ni date vides — un champ vide n’est pas une preuve', () => {
    const request = buildPersonCorrection({
      expectedGraphVersion: 7,
      personId: 'p-marie-martin',
      draft: { ...base, evidenceRef: '  ', evidenceDate: '' },
    })
    expect(request?.claims[0]?.evidence.ref).toBeUndefined()
    expect(request?.claims[0]?.evidence.date).toBeUndefined()
  })
})

describe('le 409 se relit — sinon le verrou devient une perte de saisie', () => {
  const body = {
    error: 'graph_version_mismatch',
    code: 'graph_version_mismatch',
    yours: 7,
    current: 9,
    diffSummary: '2 corrections depuis la version 7',
    intervening: [
      {
        objectType: 'person',
        objectId: 'p-marie-martin',
        field: 'title',
        by: 'Claire Dubois',
        at: '2026-08-29T09:00:00.000Z',
      },
    ],
    message: "L'organigramme a été corrigé entre-temps.",
  }

  it('relit le diff porté par l’erreur', () => {
    const conflict = readGraphConflict(Object.assign(new Error('conflit'), { status: 409, details: body }))
    expect(conflict?.current).toBe(9)
    expect(conflict?.yours).toBe(7)
    expect(conflict?.intervening).toHaveLength(1)
    expect(conflict?.intervening[0]?.by).toBe('Claire Dubois')
  })

  it('rend `null` sur une erreur qui n’est pas un conflit de version', () => {
    expect(readGraphConflict(new Error('réseau'))).toBeNull()
    expect(readGraphConflict(Object.assign(new Error('x'), { details: { error: 'autre_chose' } }))).toBeNull()
  })

  it('rend `null` quand la base n’est PAS en avance — un conflit suppose qu’on est en retard', () => {
    expect(readGraphConflict(Object.assign(new Error('x'), { details: { ...body, current: 7 } }))).toBeNull()
  })
})

describe('#2126.25-.30 / .36 — le motif choisit ce que la requête affirme', () => {
  const base = () => ({ ...emptyDraft('title'), reason: 'Revu en rendez-vous le 12/09' })
  const current = currentPersonValue(GRAPH, 'p-marie-martin', 'title')

  it('part de « corriger », portée « compte » — le geste d’avant, à l’identique', () => {
    expect(emptyDraft('title')).toMatchObject({ motive: 'corrected', scope: 'account' })
  })

  it('seul « corriger » demande une nouvelle valeur', () => {
    expect(motiveAssertsValue('corrected')).toBe(true)
    for (const motive of ['confirmed', 'obsolete', 'not_relevant', 'unknown', 'source_added'] as const) {
      expect(motiveAssertsValue(motive)).toBe(false)
    }
  })

  it('« confirmer » envoie la valeur que le graphe porte AUJOURD’HUI, pas une saisie', () => {
    const request = buildPersonCorrection({
      expectedGraphVersion: 7,
      personId: 'p-marie-martin',
      draft: { ...base(), motive: 'confirmed', text: 'autre chose' },
      current,
    })
    expect(request).toMatchObject({ motive: 'confirmed', claims: [{ value: current }] })
  })

  it('« obsolète » envoie `null` — le fait redevient inconnu, jamais « 0 » ni la chaîne vide', () => {
    const request = buildPersonCorrection({
      expectedGraphVersion: 7,
      personId: 'p-marie-martin',
      draft: { ...base(), motive: 'obsolete', text: 'DSI' },
      current,
    })
    expect(request).toMatchObject({ motive: 'obsolete', claims: [{ value: null }] })
  })

  it('#2126.40 / .44 — la portée voyage avec la requête', () => {
    const request = buildPersonCorrection({
      expectedGraphVersion: 7,
      personId: 'p-marie-martin',
      draft: { ...base(), scope: 'personal', text: 'Directrice de la transformation' },
      current,
    })
    expect(request).toMatchObject({ motive: 'corrected', scope: 'personal' })
  })

  it('« ajouter une source » sans référence n’est pas envoyable — une source vide n’est pas une source', () => {
    expect(
      buildPersonCorrection({
        expectedGraphVersion: 7,
        personId: 'p-marie-martin',
        draft: { ...base(), motive: 'source_added' },
        current,
      }),
    ).toBeNull()
    expect(
      buildPersonCorrection({
        expectedGraphVersion: 7,
        personId: 'p-marie-martin',
        draft: { ...base(), motive: 'source_added', evidenceRef: 'https://acme.fr/equipe' },
        current,
      }),
    ).toMatchObject({ motive: 'source_added' })
  })
})

/**
 * #2310.54 — « corriger une mauvaise ENTITÉ », pas seulement une personne.
 *
 * Mesuré sur `origin/main` : le contrat et la route API acceptaient déjà
 * `objectType: 'entity'` (`ORG_CORRECTION_FIELDS_BY_OBJECT.entity`,
 * `org-graph-correction.ts:260`), mais `orgCorrectionDraft.ts:224` écrivait
 * `objectType: 'person' as const` — la SEULE occurrence d'`objectType` côté
 * web, et codée en dur. Ces tests tiennent le correctif : le champ corrigé
 * détermine l'objet, jamais un littéral.
 */
describe('#2310.54 — les champs d’une ENTITÉ viennent aussi du contrat', () => {
  it('propose EXACTEMENT les champs que le ledger sait écrire sur une entité', () => {
    expect([...ENTITY_CORRECTION_FIELDS]).toEqual([...ORG_CORRECTION_FIELDS_BY_OBJECT.entity])
  })

  it('le champ SEUL détermine l’objet visé — jamais un littéral', () => {
    expect(correctionObjectType('title')).toBe('person')
    expect(correctionObjectType('reportsTo')).toBe('person')
    expect(correctionObjectType('name')).toBe('entity')
    expect(correctionObjectType('parentId')).toBe('entity')
  })

  it('un nom d’entité se saisit librement, une entité parente se CHOISIT parmi les AUTRES', () => {
    expect(correctionEditor(GRAPH, 'name', 'e-it').kind).toBe('text')
    const editor = correctionEditor(GRAPH, 'parentId', 'e-it')
    if (editor.kind !== 'choice') throw new Error('éditeur inattendu')
    // e-it elle-même est exclue — une entité ne se rattache pas à elle-même.
    expect(editor.options.map(o => o.value)).toEqual(['e-grp'])
  })

  it('lit le nom et le parent AUJOURD’HUI — `null` pour la racine, jamais « 0 »', () => {
    expect(currentPersonValue(GRAPH, 'e-it', 'name')).toBe('Direction des systèmes d’information')
    expect(currentPersonValue(GRAPH, 'e-it', 'parentId')).toBe('e-grp')
    expect(currentPersonValue(GRAPH, 'e-grp', 'parentId')).toBeNull()
  })

  it('la requête porte `objectType: "entity"` — plus jamais « person » écrit en dur', () => {
    const request = buildPersonCorrection({
      expectedGraphVersion: 7,
      personId: 'e-it',
      draft: {
        ...emptyDraft('name'),
        text: 'DSI Groupe',
        reason: 'Nom légal relevé sur le registre du commerce.',
        evidenceKind: 'registry',
        evidenceRef: 'https://registre.example/e-it',
        evidenceDate: '2026-09-20',
      },
    })
    expect(request?.objectType).toBe('entity')
    expect(request?.objectId).toBe('e-it')
    // Le champ décide de la preuve exigée, ici aussi : un nom prouve une IDENTITÉ.
    expect(request?.claims[0]?.evidence.claim).toBe('identity')
  })
})

/** Le source SANS ses commentaires — un littéral CITÉ dans un docblock n'est pas le même défaut qu'un littéral ÉCRIT. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

describe('#2310.54 — le détecteur sait dire NON à une régression', () => {
  const HARDCODED_PERSON = /objectType:\s*'person'\s*as\s*const/

  it("le CODE ne contient plus `objectType: 'person' as const` écrit en dur", () => {
    const source = readFileSync(join(__dirname, 'orgCorrectionDraft.ts'), 'utf8')
    expect(withoutComments(source)).not.toMatch(HARDCODED_PERSON)
  })

  it('un extrait qui le réintroduit dans le CODE serait vu par la même expression', () => {
    const fautif = withoutComments(`    objectType: 'person' as const,`)
    expect(fautif).toMatch(HARDCODED_PERSON)
  })
})
