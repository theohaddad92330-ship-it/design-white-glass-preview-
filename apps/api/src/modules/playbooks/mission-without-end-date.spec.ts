import { INTERVENTION_THRESHOLDS } from '@bellum/contracts'
import { detectMissionsWithoutEndDate, type MissionWithoutEndDateRow } from './intervention-rules'

/**
 * `MIS-12` — « mission sans date de fin > 30 j → RAPPEL UNIQUE au propriétaire ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE AUTOMATISATION-LÀ, ET PAS UNE AUTRE DES VINGT-QUATRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le produit sait DÉJÀ compter les missions sans date de fin — le board les
 * porte en alerte `no_end_date`, l'en-tête en donne le nombre
 * (`withoutEndDateCount`), le KPI du PDF 5 en fixe la cible à zéro, et le
 * calcul de risque les classe `unknown` plutôt que de leur inventer une
 * échéance. Le rapport de la passe B le résume d'une phrase :
 * « on sait compter le trou, personne ne relance pour le combler. »
 *
 * Et l'absence coûte deux fois, parce que le reste du module s'interdit
 * explicitement d'agir sans cette date : `detectRenewalsAtRisk` se tait,
 * `mission_ending` se tait, le CA restant l'exclut. Le silence est juste — il
 * n'est simplement adressé à personne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE REFUS, ET CE QUE CHACUN ÉVITE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Une mission qui n'a pas DÉMARRÉ ne remonte pas.** Sans `started_on`,
 *     « depuis trente jours » ne désigne rien, et le compter depuis la création
 *     reprocherait un retard de saisie à quelqu'un qui n'a pas encore commencé.
 *     C'est le même refus que `plan_j30_review` (« sans date de démarrage,
 *     J+30 ne désigne rien »).
 *  2. **Un contrat au FORFAIT ne remonte pas.** Il se suit aux jalons (D35) :
 *     ne pas avoir de date de fin y est un état normal, pas un oubli. Relancer
 *     dessus produirait une alerte que personne ne peut résoudre.
 *  3. **Un contrat de nature INCONNUE ne remonte pas.** La doctrine du module
 *     est écrite en toutes lettres : ce qu'on ne sait pas n'alerte jamais.
 *  4. **Une mission qui a sa date de fin ne remonte pas** — évidemment, et
 *     c'est le contrôle qui prouve que la règle sait dire non aussi bien que
 *     oui.
 *
 * Le garde-fou « 1 seul » de la source n'est pas réimplémenté ici : il est
 * porté par l'index unique `interventions_unique (workspace_id, kind,
 * subject_id)` et le `ON CONFLICT DO NOTHING` de `PlaybooksService.open`. La
 * ligne survit à sa résolution, donc le rappel ne repart jamais. Un compteur de
 * plus serait une seconde vérité sur le même fait.
 */

const NOW = new Date('2026-06-15T12:00:00Z')

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString().slice(0, 10)
}

const base: MissionWithoutEndDateRow = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Supervision du socle',
  ends_on: null,
  started_on: daysAgo(90),
  contract_kind: 'regie',
  user_id: 'user-1',
}

describe('MIS-12 — une mission qui court sans date de fin finit par se dire', () => {
  it('remonte au propriétaire, en NOMMANT la mission et son ancienneté', () => {
    const [draft] = detectMissionsWithoutEndDate([base], NOW)
    expect(draft).toBeDefined()
    expect(draft?.kind).toBe('mission_without_end_date')
    expect(draft?.subjectType).toBe('mission')
    expect(draft?.subjectId).toBe(base.id)
    expect(draft?.ownerId).toBe('user-1')
    expect(draft?.detail).toContain('Supervision du socle')
    expect(draft?.detail).toContain('90')
  })

  it('se tait tant que le seuil n’est pas atteint — et le franchit au jour près', () => {
    const justUnder = INTERVENTION_THRESHOLDS.missionWithoutEndDateDays - 1
    expect(detectMissionsWithoutEndDate([{ ...base, started_on: daysAgo(justUnder) }], NOW)).toHaveLength(0)

    const exactly = INTERVENTION_THRESHOLDS.missionWithoutEndDateDays
    expect(detectMissionsWithoutEndDate([{ ...base, started_on: daysAgo(exactly) }], NOW)).toHaveLength(1)
  })

  it('une mission qui A sa date de fin ne remonte jamais', () => {
    expect(detectMissionsWithoutEndDate([{ ...base, ends_on: '2026-12-31' }], NOW)).toHaveLength(0)
  })

  it('une mission jamais DÉMARRÉE ne remonte pas — « depuis 30 jours » ne désignerait rien', () => {
    expect(detectMissionsWithoutEndDate([{ ...base, started_on: null }], NOW)).toHaveLength(0)
  })

  it('un FORFAIT ne remonte pas — il se suit aux jalons, l’absence de fin y est normale', () => {
    expect(detectMissionsWithoutEndDate([{ ...base, contract_kind: 'forfait' }], NOW)).toHaveLength(0)
  })

  it('un RECRUTEMENT ne remonte pas — il se termine à la signature', () => {
    expect(detectMissionsWithoutEndDate([{ ...base, contract_kind: 'recrutement' }], NOW)).toHaveLength(0)
  })

  it('une nature de contrat INCONNUE ne remonte pas — ce qu’on ne sait pas n’alerte jamais', () => {
    expect(detectMissionsWithoutEndDate([{ ...base, contract_kind: 'inconnu' }], NOW)).toHaveLength(0)
    // Et une valeur qu'aucune énumération ne porte non plus : une faute de
    // frappe en base ne doit pas ouvrir une file entière.
    expect(detectMissionsWithoutEndDate([{ ...base, contract_kind: 'REGIE' }], NOW)).toHaveLength(0)
  })

  it('un propriétaire absent reste `null` — c’est déjà une information', () => {
    const [draft] = detectMissionsWithoutEndDate([{ ...base, user_id: null }], NOW)
    expect(draft?.ownerId).toBeNull()
  })

  it('une date de démarrage illisible se tait plutôt que d’inventer une ancienneté', () => {
    expect(detectMissionsWithoutEndDate([{ ...base, started_on: 'pas-une-date' }], NOW)).toHaveLength(0)
  })
})
