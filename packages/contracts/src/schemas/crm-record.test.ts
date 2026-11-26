import { describe, expect, it } from 'vitest'
import {
  accountCorePatchSchema,
  buildFieldCorrectionView,
  contactCorePatchSchema,
  createContactSchema,
  CORRECTION_IMPACTED_SURFACES,
  CORRECTION_SURFACE_TRACES,
  type RecordFieldAudit,
} from './crm-record.js'
import { createNoteSchema, updateNoteSchema, NOTE_MAX_LENGTH } from './note.js'

describe('accountCorePatchSchema', () => {
  it('accepte une correction de raison sociale', () => {
    expect(accountCorePatchSchema.parse({ companyName: '  TF1 PUB ' })).toEqual({ companyName: 'TF1 PUB' })
  })

  it('accepte `null` pour effacer un champ', () => {
    expect(accountCorePatchSchema.parse({ headquarters: null })).toEqual({ headquarters: null })
  })

  // #2117.9 (épopée #2813) — le nom commercial : un champ qu'aucune collecte ne
  // remplit, même geste que `phone` / `address`.
  it('accepte une saisie de nom commercial, et son effacement', () => {
    expect(accountCorePatchSchema.parse({ tradeName: '  TF1 PUB  ' })).toEqual({ tradeName: 'TF1 PUB' })
    expect(accountCorePatchSchema.parse({ tradeName: null })).toEqual({ tradeName: null })
  })

  it('refuse un corps vide — un PATCH sans champ est une erreur d’appel', () => {
    expect(accountCorePatchSchema.safeParse({}).success).toBe(false)
  })

  it('refuse un champ inconnu plutôt que de l’ignorer en silence', () => {
    expect(accountCorePatchSchema.safeParse({ score: 42 }).success).toBe(false)
  })

  it('refuse une raison sociale vide — le compte doit garder un nom', () => {
    expect(accountCorePatchSchema.safeParse({ companyName: '   ' }).success).toBe(false)
  })

  it('refuse un SIREN qui n’en est pas un', () => {
    expect(accountCorePatchSchema.safeParse({ siren: '12345' }).success).toBe(false)
    expect(accountCorePatchSchema.safeParse({ siren: '552081317' }).success).toBe(true)
    expect(accountCorePatchSchema.safeParse({ siren: null }).success).toBe(true)
  })
})

describe('contactCorePatchSchema', () => {
  it('refuse une adresse qui n’en est pas une plutôt que de la garder', () => {
    expect(contactCorePatchSchema.safeParse({ email: 'pas-une-adresse' }).success).toBe(false)
  })

  it('convertit une adresse vidée en `null`', () => {
    expect(contactCorePatchSchema.parse({ email: '' })).toEqual({ email: null })
  })

  it('accepte de désattribuer un contact', () => {
    expect(contactCorePatchSchema.parse({ assignedTo: null })).toEqual({ assignedTo: null })
  })

  // #2861 (#2437.2) — le niveau DESTINATAIRE de langue, même catalogue que
  // `marketLocaleSchema` (`workspace.defaultLocale`, GA-26).
  it('accepte une langue du catalogue partagé', () => {
    expect(contactCorePatchSchema.parse({ locale: 'en' })).toEqual({ locale: 'en' })
  })

  it('accepte `null` — non renseigné, jamais deviné', () => {
    expect(contactCorePatchSchema.parse({ locale: null })).toEqual({ locale: null })
  })

  it('refuse une langue hors catalogue plutôt que de la garder', () => {
    expect(contactCorePatchSchema.safeParse({ locale: 'es' }).success).toBe(false)
  })
})

// #219.8 (#3231, lot Q03) — la relation personne↔entreprise DÉCLARÉE, même
// vocabulaire que la contrainte SQL et le Python (`contact-relation.test.ts`).
describe('contactCorePatchSchema — relation personne↔entreprise déclarée', () => {
  it('accepte une valeur du vocabulaire', () => {
    expect(contactCorePatchSchema.parse({ declaredPersonCompanyRelation: 'employee_former' })).toEqual({
      declaredPersonCompanyRelation: 'employee_former',
    })
  })

  it('accepte `null` — relation inconnue, jamais devinée', () => {
    expect(contactCorePatchSchema.parse({ declaredPersonCompanyRelation: null })).toEqual({
      declaredPersonCompanyRelation: null,
    })
  })

  it('refuse une valeur hors vocabulaire et `unknown_relationship` (l’effacer, c’est null)', () => {
    expect(contactCorePatchSchema.safeParse({ declaredPersonCompanyRelation: 'manager ' }).success).toBe(false)
    expect(contactCorePatchSchema.safeParse({ declaredPersonCompanyRelation: 'unknown_relationship' }).success).toBe(
      false,
    )
  })
})

describe('createContactSchema', () => {
  it('exige un nom', () => {
    expect(
      createContactSchema.safeParse({ accountId: '11111111-1111-4111-8111-111111111111', fullName: '  ' }).success,
    ).toBe(false)
  })

  it('accepte une fiche minimale — un nom suffit à exister', () => {
    const parsed = createContactSchema.parse({
      accountId: '11111111-1111-4111-8111-111111111111',
      fullName: 'Camille Roux',
    })
    expect(parsed.fullName).toBe('Camille Roux')
  })

  // #1473 — le contact rencontré en salon, dont on ne connaît PAS l'entreprise.
  // Distinct de « l'entreprise n'est pas encore analysée », qui se crée à la
  // volée : ici il n'y a rien à créer, et lui inventer une société serait une
  // donnée fictive.
  it('accepte un contact SANS entreprise — « à qualifier »', () => {
    expect(createContactSchema.parse({ fullName: 'Camille Roux' }).accountId).toBeUndefined()
    expect(createContactSchema.parse({ fullName: 'Camille Roux', accountId: null }).accountId).toBeNull()
  })

  // La permissivité s'arrête là : un identifiant FOURNI reste un uuid. Accepter
  // « n/a » ferait un 500 côté base au lieu d'un 400 lisible.
  it('refuse toujours un identifiant de compte qui n’en est pas un', () => {
    expect(createContactSchema.safeParse({ fullName: 'Camille Roux', accountId: 'aucun' }).success).toBe(false)
  })
})

describe('notes', () => {
  it('refuse une note vide', () => {
    expect(
      createNoteSchema.safeParse({
        entityType: 'account',
        entityId: '11111111-1111-4111-8111-111111111111',
        body: '  ',
      }).success,
    ).toBe(false)
  })

  it('borne la longueur d’une note', () => {
    expect(
      createNoteSchema.safeParse({
        entityType: 'contact',
        entityId: '11111111-1111-4111-8111-111111111111',
        body: 'x'.repeat(NOTE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false)
  })

  it('refuse une modification qui ne modifie rien', () => {
    expect(updateNoteSchema.safeParse({}).success).toBe(false)
    expect(updateNoteSchema.safeParse({ pinned: true }).success).toBe(true)
  })
})

// #2318.6 — LAU-FINAL-059, CORRECTION UTILISATEUR : « avant, après, source
// contestée, portée, surfaces impactées, actions impactées, confirmation ».
describe('buildFieldCorrectionView (#2318.6)', () => {
  function auditEntry(over: Partial<RecordFieldAudit> = {}): RecordFieldAudit {
    return {
      id: '11111111-1111-4111-8111-111111111111',
      entityType: 'account',
      entityId: '22222222-2222-4222-8222-222222222222',
      field: 'headquarters',
      oldValue: 'Tours Société Générale, La Défense',
      newValue: '29 boulevard Haussmann, 75009 Paris',
      source: 'human',
      actorId: '33333333-3333-4333-8333-333333333333',
      actorName: 'Louis',
      createdAt: '2026-09-18T09:00:00.000Z',
      rule: null,
      ...over,
    }
  }

  it('rend les SEPT éléments : avant, après, source contestée, portée, surfaces, actions, confirmation', () => {
    const view = buildFieldCorrectionView(auditEntry(), 'pipeline')
    expect(view).toEqual({
      field: 'headquarters',
      before: 'Tours Société Générale, La Défense',
      after: '29 boulevard Haussmann, 75009 Paris',
      contestedSource: 'pipeline',
      scope: 'single_record',
      // #2318.7 — le registre MESURÉ, plus la liste de neuf promesses.
      impactedSurfaces: CORRECTION_SURFACE_TRACES,
      impactedActions: null,
      confirmed: true,
    })
  })

  it('rien à contester quand le champ était vide avant — jamais une source inventée', () => {
    const view = buildFieldCorrectionView(auditEntry({ oldValue: null }), 'pipeline')
    expect(view.contestedSource).toBeNull()
  })

  it('la source contestée est celle de l’écriture PRÉCÉDENTE, jamais celle de l’écriture entrante', () => {
    // entry.source = 'human' (qui corrige), mais ce qu'elle conteste vient
    // d'ailleurs (fourni par l'appelant, pas déduit de entry.source).
    const view = buildFieldCorrectionView(auditEntry({ source: 'human' }), 'model')
    expect(view.contestedSource).toBe('model')
  })

  it('« surfaces impactées » nomme les NEUF surfaces de la doctrine, jamais un fournisseur', () => {
    expect(CORRECTION_IMPACTED_SURFACES).toHaveLength(9)
    expect(CORRECTION_IMPACTED_SURFACES).toContain('laura')
    expect(CORRECTION_IMPACTED_SURFACES).toContain('future_research')
  })

  // ── #2318.7 — la promesse devient une mesure ────────────────────────────────
  describe('#2318.7 — chaque surface porte un STATUT et sa preuve', () => {
    it('couvre les neuf, sans en retirer une seule parce qu’elle était difficile', () => {
      expect(CORRECTION_SURFACE_TRACES).toHaveLength(9)
      expect(CORRECTION_SURFACE_TRACES.map(trace => trace.surface)).toEqual([...CORRECTION_IMPACTED_SURFACES])
    })

    it('ne rend jamais les neuf « atteintes » — une propagation qui réussit partout est une promesse', () => {
      const reached = CORRECTION_SURFACE_TRACES.filter(trace => trace.status === 'reached')
      expect(reached.length).toBeGreaterThan(0)
      expect(reached.length).toBeLessThan(9)
    })

    it('toute surface porte un fichier de preuve ET un ancrage — jamais un statut nu', () => {
      for (const trace of CORRECTION_SURFACE_TRACES) {
        expect(trace.evidenceFile).not.toBe('')
        expect(trace.evidenceAnchor).not.toBe('')
      }
    })

    it('toute surface NON atteinte porte la clé qui dit POURQUOI', () => {
      const mute = CORRECTION_SURFACE_TRACES.filter(trace => trace.status !== 'reached' && trace.reasonKey === '').map(
        trace => trace.surface,
      )
      expect(mute).toEqual([])
    })

    // Le NO-GO de LAU-FINAL-059, tel qu'il est VRAI aujourd'hui : « l'ancienne
    // information continue d'alimenter Laura, le score ou le plan ». Laura, elle,
    // relit bien la fiche ; le score et le plan, non. Ce test fige le constat —
    // le jour où l'un des deux est branché, il rougit et on remesure.
    it('nomme le score et le plan comme NON atteints — le NO-GO de l’issue, dit à voix haute', () => {
      const status = (surface: string): string | undefined =>
        CORRECTION_SURFACE_TRACES.find(trace => trace.surface === surface)?.status
      expect(status('score')).toBe('not_reached')
      expect(status('plan')).toBe('not_reached')
      expect(status('laura')).toBe('reached')
    })
  })

  it('« actions impactées » est `null` (non mesuré), jamais [] (mesuré, zéro)', () => {
    const view = buildFieldCorrectionView(auditEntry(), null)
    expect(view.impactedActions).toBeNull()
  })

  it('une ligne du journal est TOUJOURS confirmée — append-only, jamais un brouillon', () => {
    const view = buildFieldCorrectionView(auditEntry(), null)
    expect(view.confirmed).toBe(true)
  })
})
