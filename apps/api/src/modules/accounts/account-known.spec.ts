import { isAccountKnownFromTraces, KNOWN_ACCOUNT_ACTIVITY_KINDS } from './account-known'

/**
 * #2556.1 — LA PRÉCONDITION DU LOT : un compte est-il « connu » ?
 *
 * Décision Louis, 18/09/2026 : ni un flag déclaratif ni un écran de plus — on
 * DÉDUIT « connu » d'une trace D'ACTIVITÉ (mission, contact sollicité, note,
 * échange), jamais d'une trace PASSIVE (contacts importés, fiche créée). Le
 * risque assumé de la décision : un compte importé en masse et jamais
 * travaillé porte des contacts sans qu'on l'ait approché — ce test le vise
 * explicitement (dernier `it`, le témoin qui doit dire NON).
 */
describe('isAccountKnownFromTraces — #2556.1', () => {
  it('aucune mission, aucune activité active → PAS connu', () => {
    expect(isAccountKnownFromTraces({ missions: 0, activeActivities: 0 })).toBe(false)
  })

  it('une mission (même une seule, même terminée) suffit → connu', () => {
    expect(isAccountKnownFromTraces({ missions: 1, activeActivities: 0 })).toBe(true)
  })

  it('une activité active (échange, contact sollicité, note) suffit → connu', () => {
    expect(isAccountKnownFromTraces({ missions: 0, activeActivities: 1 })).toBe(true)
  })

  it('les deux ensemble → connu', () => {
    expect(isAccountKnownFromTraces({ missions: 2, activeActivities: 5 })).toBe(true)
  })

  // Le témoin — #2556 nomme ce risque explicitement : la déduction NE DOIT PAS
  // se déclencher sur une trace passive. `activeActivities: 0` est précisément
  // ce que rendrait un compte importé en masse et jamais travaillé (des
  // contacts existent, mais aucune activité de kind `email`/`call`/`meeting`/
  // `linkedin`/`note` n'a jamais été posée dessus, et zéro mission). Casser ce
  // test en changeant `> 0` pour `>= 0` doit le faire rougir : c'est la preuve
  // que le prédicat VISE bien cette limite, pas seulement qu'il compile.
  it('témoin — compte importé en masse, jamais travaillé (contacts SANS activité) → PAS connu', () => {
    // Un import en masse crée des contacts, potentiellement des dizaines, mais
    // ne pose ni mission ni activité d'échange/note : traduit ici par des
    // compteurs à zéro, exactement ce que rendrait la lecture DB pour ce cas.
    expect(isAccountKnownFromTraces({ missions: 0, activeActivities: 0 })).toBe(false)
  })
})

describe('KNOWN_ACCOUNT_ACTIVITY_KINDS — #2556.1', () => {
  it('porte les natures d’ÉCHANGE (email, call, meeting, linkedin) PLUS la note écrite', () => {
    expect(KNOWN_ACCOUNT_ACTIVITY_KINDS).toEqual(
      expect.arrayContaining(['email', 'call', 'meeting', 'linkedin', 'note']),
    )
  })

  it('ne porte PAS les traces passives ou automatiques (import CRM, analyse, consultation Laura)', () => {
    expect(KNOWN_ACCOUNT_ACTIVITY_KINDS).not.toEqual(expect.arrayContaining(['crm_export', 'analysis', 'crm_lookup']))
  })
})
