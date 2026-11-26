import { DEMO_ACTIVITIES } from './demo-dataset'
import { isAccountKnownFromTraces, KNOWN_ACCOUNT_ACTIVITY_KINDS } from '../accounts/account-known'

/**
 * #2556 — « ET EN DÉMONSTRATION, UN COMPTE DÉJÀ CONNU MONTRE QUOI ? »
 *
 * Sans cette preuve, la salle pourrait très bien ne compter QUE des comptes
 * qui ressemblent à un import en masse jamais travaillé — et la feature du
 * jour serait invisible pour tout visiteur. Cette garde lit le VRAI prédicat
 * (#2556.1) sur le VRAI jeu de données (`DEMO_ACTIVITIES`), pas une
 * affirmation dans un commentaire.
 */
describe('couverture démo — au moins un compte DÉJÀ CONNU (#2556)', () => {
  it('lit un corpus NON VIDE — sans lui, la garde passerait au vert sur du vide', () => {
    expect(DEMO_ACTIVITIES.length).toBeGreaterThan(0)
  })

  it('au moins un compte de la salle porte une trace D’ACTIVITÉ suffisante pour être « connu »', () => {
    const byCompany = new Map<string, number>()
    for (const activity of DEMO_ACTIVITIES) {
      if (!(KNOWN_ACCOUNT_ACTIVITY_KINDS as readonly string[]).includes(activity.kind)) continue
      byCompany.set(activity.company, (byCompany.get(activity.company) ?? 0) + 1)
    }
    const knownCompanies = [...byCompany.entries()]
      .filter(([, count]) => isAccountKnownFromTraces({ missions: 0, activeActivities: count }))
      .map(([company]) => company)

    // Si ce test tombe : plus AUCUN compte de démonstration ne serait « connu »,
    // et la carte #2556 resterait invisible pour tout visiteur — exactement le
    // défaut que cette garde existe pour attraper avant la CI.
    expect(knownCompanies.length).toBeGreaterThan(0)
    expect(knownCompanies).toEqual(expect.arrayContaining(['SNCF']))
  })

  // Témoin — une activité PASSIVE (import, analyse, consultation Laura) ne doit
  // JAMAIS suffire, même en démonstration : casser la liste des natures visées
  // doit faire rougir ce test, pas seulement celui du prédicat pur.
  it('témoin — une activité HORS `KNOWN_ACCOUNT_ACTIVITY_KINDS` ne rend PAS un compte connu', () => {
    const passiveOnly = { missions: 0, activeActivities: 0 }
    expect(isAccountKnownFromTraces(passiveOnly)).toBe(false)
    expect(KNOWN_ACCOUNT_ACTIVITY_KINDS).not.toContain('analysis')
    expect(KNOWN_ACCOUNT_ACTIVITY_KINDS).not.toContain('crm_lookup')
  })
})
