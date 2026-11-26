import { describe, expect, it } from 'vitest'
import { TIMESHEET_STATUSES, dayGap, expectedWorkingDays, rejectTimesheetSchema } from './mission.js'

/**
 * La charge attendue d'un mois, et l'écart avec ce qui a été déclaré.
 *
 * `anomalies` était un tableau de texte libre que rien ne remplissait. Le
 * bloqueur `timesheet_anomalies` de « prêt à facturer » ne pouvait donc jamais
 * se déclencher : un relevé à 3 jours sur un mois qui en compte 21 passait pour
 * normal, et le mois partait « prêt ».
 *
 * Deux décisions valent d'être relues :
 *  - les jours fériés sont un PARAMÈTRE. Un calendrier français en dur serait
 *    faux au Luxembourg, faux en Alsace-Moselle, et périmé le jour où un férié
 *    bouge. Sans liste, on compte les jours de semaine et on ne prétend rien de
 *    plus ;
 *  - un écart inconnu vaut `null`, jamais `0`. Un zéro se lirait « le relevé
 *    est juste », c'est-à-dire l'exact contraire de ce qu'on sait.
 */
describe('expectedWorkingDays', () => {
  it('compte les jours de semaine d’un mois ordinaire', () => {
    // Août 2026 : du samedi 1er au lundi 31 → 21 jours de semaine.
    expect(expectedWorkingDays('2026-08-01')).toBe(21)
  })

  it('retire les jours fériés fournis, et seulement ceux-là', () => {
    expect(expectedWorkingDays('2026-08-01', ['2026-08-15'])).toBe(21) // un samedi : déjà exclu
    expect(expectedWorkingDays('2026-08-01', ['2026-08-14'])).toBe(20) // un vendredi : compté en moins
  })

  it('ignore un férié hors du mois — une liste annuelle ne fausse pas le calcul', () => {
    expect(expectedWorkingDays('2026-08-01', ['2026-12-25'])).toBe(21)
  })

  it('gère février d’une année bissextile', () => {
    expect(expectedWorkingDays('2028-02-01')).toBe(21)
  })

  it('accepte une date complète comme un début de mois — la colonne porte le 1er', () => {
    expect(expectedWorkingDays('2026-08-19')).toBe(expectedWorkingDays('2026-08-01'))
  })

  it('rend `null` sur une période illisible plutôt qu’un chiffre inventé', () => {
    expect(expectedWorkingDays('pas-une-date')).toBeNull()
    expect(expectedWorkingDays('2026-13-01')).toBeNull()
    expect(expectedWorkingDays('')).toBeNull()
  })
})

describe('dayGap', () => {
  it('rend l’écart, signe compris', () => {
    expect(dayGap(18, 21)).toBe(-3)
    expect(dayGap(22, 21)).toBe(1)
    expect(dayGap(21, 21)).toBe(0)
  })

  it('gère les demi-journées sans traîner de décimales flottantes', () => {
    expect(dayGap(20.5, 21)).toBe(-0.5)
  })

  it('rend `null` quand la charge attendue est inconnue — pas 0', () => {
    // Un 0 se lirait « le relevé est juste ». C'est l'inverse de ce qu'on sait.
    expect(dayGap(18, null)).toBeNull()
  })

  it('rend `null` quand rien n’a été déclaré', () => {
    expect(dayGap(null, 21)).toBeNull()
    expect(dayGap(undefined, 21)).toBeNull()
  })

  it('rend `null` sur une valeur non finie plutôt que `NaN`', () => {
    expect(dayGap(Number.NaN, 21)).toBeNull()
    expect(dayGap(18, Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('distingue « zéro jour déclaré » de « rien déclaré » — le premier est un écart réel', () => {
    expect(dayGap(0, 21)).toBe(-21)
    expect(dayGap(null, 21)).toBeNull()
  })
})

/**
 * Le rejet d'un relevé, et son motif OBLIGATOIRE.
 *
 * Le patron est déjà posé deux fois dans le dépôt — annuler un « facturé »,
 * fermer un besoin — et il vaut ici pour la même raison : un relevé renvoyé sans
 * motif ne dit pas au consultant ce qu'il doit corriger, et ne dira à personne,
 * dans six mois, pourquoi ce mois a fait un aller-retour.
 */
describe('rejectTimesheetSchema', () => {
  it('accepte un motif renseigné, et le rend débarrassé de ses espaces', () => {
    expect(
      rejectTimesheetSchema.parse({
        reason: '  Trois jours de mars comptés en avril  ',
        contestedDays: 3,
        correctionDeadline: '2026-10-05',
      }),
    ).toEqual({
      reason: 'Trois jours de mars comptés en avril',
      contestedDays: 3,
      correctionDeadline: '2026-10-05',
    })
  })

  it('REFUSE un motif absent — c’est la garantie côté serveur, pas un champ grisé', () => {
    expect(rejectTimesheetSchema.safeParse({}).success).toBe(false)
  })

  it('refuse un motif vide ou fait d’espaces — `.trim()` court AVANT `.min(1)`', () => {
    expect(rejectTimesheetSchema.safeParse({ reason: '' }).success).toBe(false)
    expect(rejectTimesheetSchema.safeParse({ reason: '   ' }).success).toBe(false)
    expect(rejectTimesheetSchema.safeParse({ reason: '\n\t ' }).success).toBe(false)
  })

  it('borne le motif comme l’explication d’écart — un réglage vit à un seul endroit', () => {
    const base = { contestedDays: 3, correctionDeadline: '2026-10-05' }
    expect(rejectTimesheetSchema.safeParse({ ...base, reason: 'x'.repeat(500) }).success).toBe(true)
    expect(rejectTimesheetSchema.safeParse({ ...base, reason: 'x'.repeat(501) }).success).toBe(false)
  })

  it('est `.strict()` — un champ inconnu ne se glisse pas dans le corps', () => {
    expect(
      rejectTimesheetSchema.safeParse({
        reason: 'Motif',
        contestedDays: 3,
        correctionDeadline: '2026-10-05',
        status: 'validated',
      }).success,
    ).toBe(false)
  })

  // #2415.7 — motif, quantité contestée et deadline de correction : les TROIS
  // se conservent ensemble, comme le motif seul se conservait déjà. Sans la
  // quantité, personne ne sait QUOI corriger ; sans la deadline, un rejet n'a
  // pas d'échéance. Même garantie serveur que `reason` : REQUISES, pas
  // facultatives — un champ optionnel se ferait oublier sans que rien ne s'en
  // aperçoive.
  it('#2415.7 — REFUSE un rejet sans quantité contestée ni deadline de correction', () => {
    expect(rejectTimesheetSchema.safeParse({ reason: 'Motif' }).success).toBe(false)
    expect(rejectTimesheetSchema.safeParse({ reason: 'Motif', contestedDays: 3 }).success).toBe(false)
    expect(rejectTimesheetSchema.safeParse({ reason: 'Motif', correctionDeadline: '2026-10-05' }).success).toBe(false)
  })

  it('#2415.7 — accepte motif + quantité contestée + deadline, tous les trois', () => {
    expect(
      rejectTimesheetSchema.parse({
        reason: 'Trois jours de mars comptés en avril',
        contestedDays: 3,
        correctionDeadline: '2026-10-05',
      }),
    ).toEqual({
      reason: 'Trois jours de mars comptés en avril',
      contestedDays: 3,
      correctionDeadline: '2026-10-05',
    })
  })

  it('#2415.7 — refuse une quantité contestée nulle ou négative — 0 jour contesté n’est pas un rejet', () => {
    expect(
      rejectTimesheetSchema.safeParse({ reason: 'Motif', contestedDays: 0, correctionDeadline: '2026-10-05' }).success,
    ).toBe(false)
    expect(
      rejectTimesheetSchema.safeParse({ reason: 'Motif', contestedDays: -2, correctionDeadline: '2026-10-05' }).success,
    ).toBe(false)
  })

  it('#2415.7 — refuse une deadline qui n’est pas une date `AAAA-MM-JJ`', () => {
    expect(
      rejectTimesheetSchema.safeParse({ reason: 'Motif', contestedDays: 3, correctionDeadline: 'bientôt' }).success,
    ).toBe(false)
  })
})

describe('TIMESHEET_STATUSES', () => {
  it('connaît `rejected` et `escalated`, ajoutés EN FIN (GA-08)', () => {
    // Les huit valeurs d'avant gardent leur rang : aucune donnée en base n'a à
    // bouger, et aucune migration n'a à réécrire une colonne.
    //
    // #2196.24 — `escalated` (17/09/2026) : « le sujet remonte à un humain »
    // existait déjà en COMMENTAIRE (`dueReminders`) mais ne se posait sur
    // aucune ligne — la troisième relance disait juste « on ne relance plus »,
    // jamais « ceci a besoin d'un humain ». C'est `recordReminder` qui le pose,
    // au moment où la troisième relance est enregistrée.
    expect([...TIMESHEET_STATUSES]).toEqual([
      'draft',
      'submitted',
      'validated',
      'disputed',
      'expected',
      'missing',
      'not_required',
      'rejected',
      'escalated',
    ])
  })
})
