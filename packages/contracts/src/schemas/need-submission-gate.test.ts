import { describe, expect, it } from 'vitest'
import { needHasConsultantAgreement, needHasEngagedConsultant } from './need-submission-gate.js'

/**
 * #2323.23 / #2323.25 — l'AGRÉGATION need-level de ce qui existe déjà au
 * niveau du POSITIONNEMENT (Submission), sans migration : deux fonctions
 * pures qui lisent `stage`/`substatus`, jamais un champ nouveau.
 *
 * ⚠️ Ce que ces fonctions REFUSENT de dire, et pourquoi : un `substatus` à
 * `null` (ligne créée avant #2335) ou à `withdrawn`/`archived` ne prouve RIEN
 * sur le passage — la machine (`SUBSTATUS_TRANSITIONS`, submission.ts)
 * autorise un retrait depuis N'IMPORTE quelle étape, y compris avant l'accord.
 * Répondre `true` sur une preuve ambiguë fabriquerait un accord qu'on n'a pas
 * (doctrine « jamais de donnée fictive ») — la fonction répond `false`, ce qui
 * est le repli honnête, jamais une victoire par défaut.
 */
describe('needHasConsultantAgreement (#2323.23 — gate PRÉSENTER : accord consultant)', () => {
  it('aucun positionnement : pas d’accord', () => {
    expect(needHasConsultantAgreement([])).toBe(false)
  })

  it('encore à qualifier : pas encore demandé', () => {
    expect(needHasConsultantAgreement([{ stage: 'shortlisted', substatus: 'to_qualify' }])).toBe(false)
  })

  it('accord EN ATTENTE : pas encore obtenu', () => {
    expect(needHasConsultantAgreement([{ stage: 'shortlisted', substatus: 'consultant_agreement_pending' }])).toBe(
      false,
    )
  })

  it('« prêt à présenter » : l’accord a été franchi', () => {
    expect(needHasConsultantAgreement([{ stage: 'shortlisted', substatus: 'ready_to_present' }])).toBe(true)
  })

  it('un entretien programmé implique l’accord (impossible d’y arriver sans passer par lui)', () => {
    expect(needHasConsultantAgreement([{ stage: 'interview', substatus: 'interview_scheduled' }])).toBe(true)
  })

  it('converti en mission implique l’accord', () => {
    expect(needHasConsultantAgreement([{ stage: 'accepted', substatus: 'converted_to_mission' }])).toBe(true)
  })

  it('ligne ANTÉRIEURE à #2335 (`substatus` null) : le stage suffit dès qu’il a quitté `shortlisted`', () => {
    expect(needHasConsultantAgreement([{ stage: 'submitted', substatus: null }])).toBe(true)
  })

  it('ligne antérieure encore `shortlisted` sans sous-statut : rien ne prouve l’accord', () => {
    expect(needHasConsultantAgreement([{ stage: 'shortlisted', substatus: null }])).toBe(false)
  })

  it('un retrait (`withdrawn`) est AMBIGU — il peut survenir avant l’accord — et ne prouve rien', () => {
    expect(needHasConsultantAgreement([{ stage: 'withdrawn', substatus: 'withdrawn' }])).toBe(false)
  })

  it('un archivage (`archived`) est tout aussi ambigu', () => {
    expect(needHasConsultantAgreement([{ stage: 'withdrawn', substatus: 'archived' }])).toBe(false)
  })

  it('UN SEUL positionnement qui a franchi l’étape suffit parmi plusieurs', () => {
    expect(
      needHasConsultantAgreement([
        { stage: 'shortlisted', substatus: 'to_qualify' },
        { stage: 'shortlisted', substatus: 'ready_to_present' },
      ]),
    ).toBe(true)
  })
})

/**
 * #2323.25 — « le client prend le profil » (`SUBMISSION_STAGES.accepted`) ET
 * « converti en mission » (`converted_to_mission`) retombent tous deux sur le
 * MÊME stage (`SUBSTATUS_TO_STAGE.converted_to_mission === 'accepted'`,
 * submission.ts) : le stage seul suffit, aucune ambiguïté substatus/null ici.
 */
describe('needHasEngagedConsultant (#2323.25 — gate DÉMARRER : consultant engagé)', () => {
  it('aucun positionnement : pas de consultant engagé', () => {
    expect(needHasEngagedConsultant([])).toBe(false)
  })

  it('un CV simplement envoyé n’engage personne', () => {
    expect(needHasEngagedConsultant([{ stage: 'submitted', substatus: 'presented' }])).toBe(false)
  })

  it('le client PREND le profil (`accepted`) : engagé', () => {
    expect(needHasEngagedConsultant([{ stage: 'accepted', substatus: 'selected' }])).toBe(true)
  })

  it('converti en mission : engagé, même stage `accepted`', () => {
    expect(needHasEngagedConsultant([{ stage: 'accepted', substatus: 'converted_to_mission' }])).toBe(true)
  })

  it('ligne antérieure à #2335 (`substatus` null) : le stage `accepted` suffit', () => {
    expect(needHasEngagedConsultant([{ stage: 'accepted', substatus: null }])).toBe(true)
  })

  it('UN SEUL positionnement engagé suffit parmi plusieurs', () => {
    expect(
      needHasEngagedConsultant([
        { stage: 'rejected', substatus: 'declined' },
        { stage: 'accepted', substatus: 'selected' },
      ]),
    ).toBe(true)
  })
})
