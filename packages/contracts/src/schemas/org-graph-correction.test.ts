import { describe, expect, it } from 'vitest'
import {
  ORG_CORRECTION_CLAIM_BY_FIELD,
  ORG_CORRECTION_FIELDS,
  ORG_CORRECTION_FIELDS_BY_OBJECT,
  ORG_CORRECTION_MOTIVES,
  ORG_CORRECTION_OBJECT_TYPES,
  ORG_CORRECTION_SCOPES,
  ORG_CORRECTION_VISIBILITIES,
  orgCorrectionChangesSharedGraph,
  orgCorrectionHoldsField,
  orgCorrectionVisibilityFor,
  orgCorrectionRequestSchema,
  orgGraphConflictSchema,
  orgGraphCorrectionSchema,
  orgCorrectionRevertRequestSchema,
} from './org-graph-correction.js'
import { orgClaimSchema, orgSourceSchema } from './org-graph.js'

/** Une correction minimale et valide : le titre d'une personne, prouvé par une
 *  preuve qui porte SUR LE TITRE. */
const titleClaim = () => ({
  field: 'title' as const,
  value: 'Directeur des Systèmes d’Information',
  reason: 'Vu sur la page « Notre gouvernance » du site officiel',
  evidence: {
    kind: 'official_site' as const,
    ref: 'https://exemple.fr/gouvernance',
    date: '2026-08-20',
    claim: 'title' as const,
  },
})

const request = (overrides: Record<string, unknown> = {}) => ({
  expectedGraphVersion: 8,
  objectType: 'person' as const,
  objectId: 'p-julien-nicolas',
  claims: [titleClaim()],
  ...overrides,
})

describe('les champs corrigibles', () => {
  it('couvre les cinq champs du tiroir de correction (titre, entité, niveau, rôles, N+1)', () => {
    for (const field of ['title', 'entityId', 'hierarchyLevel', 'decisionRoles', 'reportsTo']) {
      expect(ORG_CORRECTION_FIELDS_BY_OBJECT.person).toContain(field)
    }
  })

  it('rattache chaque champ à UN type d’objet et à un seul', () => {
    const seen = new Map<string, string>()
    for (const objectType of ORG_CORRECTION_OBJECT_TYPES) {
      for (const field of ORG_CORRECTION_FIELDS_BY_OBJECT[objectType]) {
        expect(seen.has(field), `${field} appartient déjà à ${seen.get(field)}`).toBe(false)
        seen.set(field, objectType)
      }
    }
    // La garde LIT quelque chose : le corpus n'est pas vide et couvre l'énumération.
    expect(seen.size).toBe(ORG_CORRECTION_FIELDS.length)
    expect(seen.size).toBeGreaterThan(5)
  })

  it('donne à CHAQUE champ la preuve qu’il exige — aucun champ sans réponse', () => {
    for (const field of ORG_CORRECTION_FIELDS) {
      expect(orgClaimSchema.safeParse(ORG_CORRECTION_CLAIM_BY_FIELD[field]).success).toBe(true)
    }
  })
})

describe('une preuve PAR CLAIM', () => {
  it('accepte une preuve qui porte sur ce qu’on affirme', () => {
    expect(orgCorrectionRequestSchema.safeParse(request()).success).toBe(true)
  })

  it('REFUSE une preuve d’identité comme preuve d’une relation (le défaut P0)', () => {
    const parsed = orgCorrectionRequestSchema.safeParse(
      request({
        claims: [
          {
            field: 'reportsTo',
            value: 'p-claire-dubois',
            reason: 'Profil LinkedIn de la personne',
            // LinkedIn connaît la personne — il ne dit RIEN de son N+1.
            evidence: { kind: 'linkedin', ref: 'https://…', claim: 'identity' },
          },
        ],
      }),
    )
    expect(parsed.success).toBe(false)
    expect(JSON.stringify(parsed.error?.issues)).toContain('relation')
  })

  it('REFUSE une preuve unique posée pour plusieurs affirmations différentes', () => {
    // Deux claims, une seule preuve « globale » de titre : le N+1 n'est pas prouvé.
    const parsed = orgCorrectionRequestSchema.safeParse(
      request({
        claims: [
          titleClaim(),
          {
            field: 'reportsTo',
            value: 'p-claire-dubois',
            reason: 'Même page',
            evidence: { kind: 'official_site', ref: 'https://exemple.fr/gouvernance', claim: 'title' },
          },
        ],
      }),
    )
    expect(parsed.success).toBe(false)
  })

  it('accepte la même page comme preuve de DEUX affirmations quand elle porte les deux claims', () => {
    const parsed = orgCorrectionRequestSchema.safeParse(
      request({
        claims: [
          titleClaim(),
          {
            field: 'reportsTo',
            value: 'p-claire-dubois',
            reason: 'L’organigramme officiel montre le rattachement',
            evidence: {
              kind: 'org_chart',
              ref: 'https://exemple.fr/gouvernance',
              date: '2026-08-20',
              claim: 'relation',
            },
          },
        ],
      }),
    )
    expect(parsed.success).toBe(true)
  })

  it('REFUSE un champ qui n’appartient pas au type d’objet visé', () => {
    expect(orgCorrectionRequestSchema.safeParse(request({ objectType: 'edge' })).success).toBe(false)
  })

  it('exige une raison écrite — une correction sans raison n’est pas une correction', () => {
    const claim = { ...titleClaim(), reason: '' }
    expect(orgCorrectionRequestSchema.safeParse(request({ claims: [claim] })).success).toBe(false)
  })

  it('exige une preuve — pas de correction sourcée « parce que je le dis »', () => {
    const { evidence: _dropped, ...claimSansPreuve } = titleClaim()
    expect(orgCorrectionRequestSchema.safeParse(request({ claims: [claimSansPreuve] })).success).toBe(false)
  })
})

describe('le verrou optimiste', () => {
  it('exige expectedGraphVersion sur TOUTE écriture', () => {
    const { expectedGraphVersion: _dropped, ...sansVersion } = request()
    expect(orgCorrectionRequestSchema.safeParse(sansVersion).success).toBe(false)
  })

  it('exige expectedGraphVersion sur une annulation aussi', () => {
    expect(orgCorrectionRevertRequestSchema.safeParse({}).success).toBe(false)
    expect(orgCorrectionRevertRequestSchema.safeParse({ expectedGraphVersion: 9 }).success).toBe(true)
  })

  it('refuse une version nulle ou négative — une version commence à 1', () => {
    expect(orgCorrectionRequestSchema.safeParse(request({ expectedGraphVersion: 0 })).success).toBe(false)
    expect(orgCorrectionRequestSchema.safeParse(request({ expectedGraphVersion: -1 })).success).toBe(false)
  })

  it('décrit un conflit par ce qui s’est intercalé, pas par un résumé seul', () => {
    const conflict = orgGraphConflictSchema.parse({
      error: 'graph_version_mismatch',
      yours: 8,
      current: 9,
      diffSummary: 'Louis a modifié le titre de Julien Nicolas.',
      intervening: [
        {
          objectType: 'person',
          objectId: 'p-julien-nicolas',
          field: 'title',
          by: 'Louis',
          at: '2026-08-29T10:00:00.000Z',
        },
      ],
    })
    expect(conflict.intervening).toHaveLength(1)
    expect(conflict.current).toBeGreaterThan(conflict.yours)
  })

  it('refuse un conflit qui prétendrait que la version courante est en retard', () => {
    const parsed = orgGraphConflictSchema.safeParse({
      error: 'graph_version_mismatch',
      yours: 9,
      current: 8,
      diffSummary: '…',
    })
    expect(parsed.success).toBe(false)
  })

  it('ne nomme pas un auteur qu’on ne connaît pas — `by` peut être null, jamais inventé', () => {
    const conflict = orgGraphConflictSchema.parse({
      error: 'graph_version_mismatch',
      yours: 8,
      current: 9,
      diffSummary: 'Une autre personne a modifié le titre de Julien Nicolas.',
      intervening: [
        { objectType: 'person', objectId: 'p-x', field: 'title', by: null, at: '2026-08-29T10:00:00.000Z' },
      ],
    })
    expect(conflict.intervening[0]!.by).toBeNull()
  })
})

describe('l’entrée du ledger', () => {
  const entry = () => ({
    id: '11111111-1111-1111-1111-111111111111',
    workspaceId: '22222222-2222-2222-2222-222222222222',
    accountId: '33333333-3333-3333-3333-333333333333',
    graphVersionBefore: 8,
    graphVersionAfter: 9,
    objectType: 'person' as const,
    objectId: 'p-julien-nicolas',
    field: 'title' as const,
    oldValue: 'DSI',
    newValue: 'Directeur des Systèmes d’Information',
    reason: 'Vu sur le site officiel',
    evidence: { kind: 'official_site' as const, ref: 'https://…', claim: 'title' as const },
    userId: '44444444-4444-4444-4444-444444444444',
    createdAt: '2026-08-29T10:00:00.000Z',
    revertedAt: null,
  })

  it('est versionnée : elle porte la version d’avant ET celle d’après', () => {
    const parsed = orgGraphCorrectionSchema.parse(entry())
    expect(parsed.graphVersionAfter).toBe(parsed.graphVersionBefore + 1)
  })

  it('est réversible : une pierre tombale, jamais une suppression', () => {
    const reverted = orgGraphCorrectionSchema.parse({ ...entry(), revertedAt: '2026-08-29T11:00:00.000Z' })
    expect(reverted.revertedAt).toBe('2026-08-29T11:00:00.000Z')
    // La ligne EXISTE toujours : on archive, on ne supprime pas.
    expect(reverted.newValue).toBe('Directeur des Systèmes d’Information')
  })

  it('distingue « la valeur d’avant était vide » de « on ne l’a pas lue »', () => {
    // `null` = la valeur n'existait pas. C'est une information, pas un zéro.
    const parsed = orgGraphCorrectionSchema.parse({ ...entry(), oldValue: null })
    expect(parsed.oldValue).toBeNull()
  })

  it('refuse une entrée dont la version n’avance pas', () => {
    expect(orgGraphCorrectionSchema.safeParse({ ...entry(), graphVersionAfter: 8 }).success).toBe(false)
  })
})

describe('la source d’une correction humaine', () => {
  it('sait dire qu’elle vient de l’espace de travail, et ce qu’elle prouve', () => {
    const parsed = orgSourceSchema.parse({
      id: 's-1',
      kind: 'workspace_user',
      grounding: 'A',
      claim: 'relation',
      date: '2026-08-29',
    })
    expect(parsed.kind).toBe('workspace_user')
    expect(parsed.claim).toBe('relation')
  })

  it('reste rétrocompatible : une source sans claim se parse toujours', () => {
    const parsed = orgSourceSchema.parse({ id: 's-2', kind: 'linkedin', grounding: 'B' })
    expect(parsed.claim).toBeUndefined()
  })
})

describe('#2126.26-.30 / .36 — le MOTIF d’une correction est catégorisé', () => {
  it('nomme les six gestes : corriger, confirmer, obsolète, pas pertinent, je ne sais pas, ajouter une source', () => {
    expect(ORG_CORRECTION_MOTIVES).toEqual([
      'corrected',
      'confirmed',
      'obsolete',
      'not_relevant',
      'unknown',
      'source_added',
    ])
  })

  it('garde « corriger » par défaut : une requête d’avant le motif se lit à l’identique', () => {
    const parsed = orgCorrectionRequestSchema.parse(request())
    expect(parsed.motive).toBe('corrected')
    expect(parsed.scope).toBe('account')
  })

  it('refuse un motif hors vocabulaire', () => {
    expect(orgCorrectionRequestSchema.safeParse(request({ motive: 'bof' })).success).toBe(false)
  })

  it('« obsolète » rend le fait INCONNU — jamais une nouvelle valeur glissée sous ce motif', () => {
    expect(
      orgCorrectionRequestSchema.safeParse(request({ motive: 'obsolete', claims: [{ ...titleClaim(), value: null }] }))
        .success,
    ).toBe(true)
    expect(orgCorrectionRequestSchema.safeParse(request({ motive: 'obsolete' })).success).toBe(false)
  })
})

describe('#2126.37 / .39-.44 — la PORTÉE et la VISIBILITÉ d’une correction', () => {
  it('propose Personnel, Espace, Compte — « BU » n’existe pas tant qu’aucune source ne la porte (#2118.9)', () => {
    expect(ORG_CORRECTION_SCOPES).toEqual(['personal', 'workspace', 'account'])
    expect(ORG_CORRECTION_SCOPES).not.toContain('bu')
  })

  it('dérive la visibilité de la portée : personnel = privé, sinon l’espace', () => {
    expect(ORG_CORRECTION_VISIBILITIES).toEqual(['private', 'workspace'])
    expect(orgCorrectionVisibilityFor('personal')).toBe('private')
    expect(orgCorrectionVisibilityFor('workspace')).toBe('workspace')
    expect(orgCorrectionVisibilityFor('account')).toBe('workspace')
  })

  it('#2126.44 — une correction PERSONNELLE ne change jamais le graphe partagé, quel que soit son motif', () => {
    for (const motive of ORG_CORRECTION_MOTIVES) {
      expect(orgCorrectionChangesSharedGraph({ motive, scope: 'personal' })).toBe(false)
      expect(orgCorrectionHoldsField({ motive, scope: 'personal' })).toBe(false)
    }
  })

  it('seuls « corriger » et « obsolète » réécrivent le graphe ; « confirmer » protège le champ sans le réécrire', () => {
    expect(orgCorrectionChangesSharedGraph({ motive: 'corrected', scope: 'account' })).toBe(true)
    expect(orgCorrectionChangesSharedGraph({ motive: 'obsolete', scope: 'workspace' })).toBe(true)
    for (const motive of ['confirmed', 'not_relevant', 'unknown', 'source_added'] as const) {
      expect(orgCorrectionChangesSharedGraph({ motive, scope: 'account' })).toBe(false)
    }
    expect(orgCorrectionHoldsField({ motive: 'confirmed', scope: 'account' })).toBe(true)
    expect(orgCorrectionHoldsField({ motive: 'unknown', scope: 'account' })).toBe(false)
  })

  it('une ligne qui ne change pas le graphe n’avance pas la version — et une qui le change l’avance toujours', () => {
    const base = {
      id: '11111111-1111-1111-1111-111111111111',
      workspaceId: '22222222-2222-2222-2222-222222222222',
      accountId: '33333333-3333-3333-3333-333333333333',
      objectType: 'person' as const,
      objectId: 'p-julien-nicolas',
      field: 'title' as const,
      oldValue: 'DSI',
      newValue: 'DSI',
      reason: 'Toujours vrai, revu en rendez-vous',
      evidence: { kind: 'workspace_user' as const, claim: 'title' as const },
      userId: '44444444-4444-4444-4444-444444444444',
      createdAt: '2026-09-15T10:00:00.000Z',
      revertedAt: null,
    }
    const confirmed = orgGraphCorrectionSchema.parse({
      ...base,
      motive: 'confirmed',
      graphVersionBefore: 9,
      graphVersionAfter: 9,
    })
    expect(confirmed.scope).toBe('account')
    expect(confirmed.visibility).toBe('workspace')
    const personal = orgGraphCorrectionSchema.parse({
      ...base,
      scope: 'personal',
      visibility: 'private',
      graphVersionBefore: 9,
      graphVersionAfter: 9,
    })
    expect(personal.visibility).toBe('private')
    expect(
      orgGraphCorrectionSchema.safeParse({ ...base, motive: 'corrected', graphVersionBefore: 9, graphVersionAfter: 9 })
        .success,
    ).toBe(false)
    expect(
      orgGraphCorrectionSchema.safeParse({ ...base, motive: 'confirmed', graphVersionBefore: 9, graphVersionAfter: 10 })
        .success,
    ).toBe(false)
  })

  it('refuse une ligne personnelle visible de l’espace — la visibilité suit la portée', () => {
    expect(
      orgGraphCorrectionSchema.safeParse({
        id: '1',
        workspaceId: '2',
        accountId: '3',
        graphVersionBefore: 9,
        graphVersionAfter: 9,
        objectType: 'person',
        objectId: 'p',
        field: 'title',
        oldValue: null,
        newValue: 'DSI',
        reason: 'r',
        evidence: { kind: 'workspace_user', claim: 'title' },
        userId: 'u',
        createdAt: '2026-09-15T10:00:00.000Z',
        scope: 'personal',
        visibility: 'workspace',
      }).success,
    ).toBe(false)
  })
})
