import { isRoutineDue, nextRoutineTrigger, occurrenceKey, routineObjectKey, routineRunKey } from './routine-schedule'

/**
 * Le seul endroit du moteur où une erreur est à la fois invisible et coûteuse.
 * Une routine qui ne part jamais ne se remarque pas — l'utilisateur croit qu'il
 * n'y avait rien à dire. Une routine qui part deux fois fait désinstaller le
 * produit.
 */
const PARIS = { enabled: true, hour: 8, weekday: null, timeZone: 'Europe/Paris' }

describe('isRoutineDue', () => {
  it('part à l’heure LOCALE, pas à l’heure du serveur', () => {
    // 06:30 UTC = 08:30 à Paris en été. Une routine « du matin » calée sur UTC
    // tomberait à 6 h 30 pour un commercial parisien.
    expect(isRoutineDue(PARIS, 'weekdays', new Date('2026-08-03T06:30:00Z'), null)).toBe(true)
    // 12:30 UTC = 14:30 à Paris : hors de l'heure demandée ET hors rattrapage.
    expect(isRoutineDue(PARIS, 'weekdays', new Date('2026-08-03T12:30:00Z'), null)).toBe(false)
  })

  it('RATTRAPE une occurrence manquée plus tard dans la journée', () => {
    // Défaut réel de production : la routine de 18 h n'est pas partie le
    // 15 août. Une fenêtre d'une heure suffit à perdre l'occurrence
    // DÉFINITIVEMENT si le service redémarre pendant cette heure-là — et
    // l'écran affiche alors la veille, sans que rien ne distingue « rien à
    // dire » de « ça n'a pas tourné ».
    // 09:30 UTC = 11:30 à Paris, soit 3 h 30 après une routine de 8 h : trop tard.
    expect(isRoutineDue(PARIS, 'weekdays', new Date('2026-08-03T09:30:00Z'), null)).toBe(false)
    // 08:30 UTC = 10:30, dans la fenêtre de rattrapage.
    expect(isRoutineDue(PARIS, 'weekdays', new Date('2026-08-03T08:30:00Z'), null)).toBe(true)
  })

  it('ne rattrape PAS ce qui est déjà parti', () => {
    // Le rattrapage élargit la fenêtre, il ne touche pas à l'idempotence.
    expect(isRoutineDue(PARIS, 'weekdays', new Date('2026-08-03T08:30:00Z'), '2026-08-03')).toBe(false)
  })

  it('ne rattrape jamais AVANT l’heure demandée', () => {
    // 05:30 UTC = 07:30 à Paris : un brief « de 8 h » ne part pas à 7 h 30.
    expect(isRoutineDue(PARIS, 'weekdays', new Date('2026-08-03T05:30:00Z'), null)).toBe(false)
  })

  it('tient compte du passage à l’heure d’hiver', () => {
    // 07:30 UTC = 08:30 à Paris en hiver (UTC+1).
    expect(isRoutineDue(PARIS, 'weekdays', new Date('2026-01-05T07:30:00Z'), null)).toBe(true)
  })

  it('accepte toute l’heure demandée — le balayeur passe toutes les 15 min', () => {
    for (const minute of ['00', '15', '30', '45']) {
      expect(isRoutineDue(PARIS, 'weekdays', new Date(`2026-08-03T06:${minute}:00Z`), null)).toBe(true)
    }
  })

  it('ne repart pas une seconde fois le même jour', () => {
    const now = new Date('2026-08-03T06:45:00Z')
    expect(isRoutineDue(PARIS, 'weekdays', now, '2026-08-03')).toBe(false)
  })

  it('repart le lendemain', () => {
    expect(isRoutineDue(PARIS, 'weekdays', new Date('2026-08-04T06:30:00Z'), '2026-08-03')).toBe(true)
  })

  it('une routine « jours ouvrés » saute le week-end', () => {
    // Samedi 8 et dimanche 9 août 2026.
    expect(isRoutineDue(PARIS, 'weekdays', new Date('2026-08-08T06:30:00Z'), null)).toBe(false)
    expect(isRoutineDue(PARIS, 'weekdays', new Date('2026-08-09T06:30:00Z'), null)).toBe(false)
  })

  it('une routine quotidienne, elle, tourne le week-end', () => {
    expect(isRoutineDue(PARIS, 'daily', new Date('2026-08-08T06:30:00Z'), null)).toBe(true)
  })

  it('une routine hebdomadaire n’accepte que SON jour', () => {
    const friday = { ...PARIS, weekday: 5, hour: 16 }
    // Vendredi 7 août 2026, 16 h à Paris = 14 h UTC.
    expect(isRoutineDue(friday, 'weekly', new Date('2026-08-07T14:00:00Z'), null)).toBe(true)
    // Jeudi 6 août, même heure.
    expect(isRoutineDue(friday, 'weekly', new Date('2026-08-06T14:00:00Z'), null)).toBe(false)
  })

  it('une routine désactivée ne part jamais', () => {
    expect(isRoutineDue({ ...PARIS, enabled: false }, 'weekdays', new Date('2026-08-03T06:30:00Z'), null)).toBe(false)
  })
})

describe('cadences mensuelle et trimestrielle', () => {
  const NINE = { ...PARIS, hour: 9 }

  it('mensuelle : part le 1er quand c’est un jour ouvré', () => {
    // Jeudi 1er octobre 2026, 9 h à Paris = 7 h UTC.
    expect(isRoutineDue(NINE, 'monthly', new Date('2026-10-01T07:00:00Z'), null)).toBe(true)
  })

  it('mensuelle : décale au lundi quand le 1er tombe un dimanche', () => {
    // Le 1er novembre 2026 est un dimanche → le 1er ouvré est le lundi 2.
    expect(isRoutineDue(NINE, 'monthly', new Date('2026-11-01T08:00:00Z'), null)).toBe(false)
    expect(isRoutineDue(NINE, 'monthly', new Date('2026-11-02T08:00:00Z'), null)).toBe(true)
  })

  it('mensuelle : décale au lundi 3 quand le 1er tombe un samedi', () => {
    // Le 1er août 2026 est un samedi → le 1er ouvré est le lundi 3.
    expect(isRoutineDue(NINE, 'monthly', new Date('2026-08-01T07:00:00Z'), null)).toBe(false)
    expect(isRoutineDue(NINE, 'monthly', new Date('2026-08-03T07:00:00Z'), null)).toBe(true)
  })

  it('mensuelle : ne part pas un 4 — un jour ouvré du mois est déjà passé', () => {
    expect(isRoutineDue(NINE, 'monthly', new Date('2026-08-04T07:00:00Z'), null)).toBe(false)
  })

  it('trimestrielle : n’accepte que janvier, avril, juillet et octobre', () => {
    expect(isRoutineDue(NINE, 'quarterly', new Date('2026-10-01T07:00:00Z'), null)).toBe(true)
    // Le 1er ouvré de septembre (mardi 1er) est bien un 1er ouvré, mais septembre
    // n'ouvre pas de trimestre.
    expect(isRoutineDue(NINE, 'quarterly', new Date('2026-09-01T07:00:00Z'), null)).toBe(false)
  })
})

describe('cadence continue', () => {
  it('ne regarde ni l’heure ni le jour — c’est l’objet qui porte l’idempotence', () => {
    expect(isRoutineDue({ ...PARIS, hour: 3 }, 'continuous', new Date('2026-08-08T22:14:00Z'), null)).toBe(true)
  })

  it('reste désactivable comme les autres', () => {
    expect(isRoutineDue({ ...PARIS, enabled: false }, 'continuous', new Date('2026-08-03T06:30:00Z'), null)).toBe(false)
  })
})

// #2266.27 — le prochain déclenchement, connu et affiché : calcul pur à
// partir des mêmes champs que `isRoutineDue`, jamais une fenêtre de
// rattrapage devinée.
describe('nextRoutineTrigger', () => {
  it('aujourd’hui même, quand l’heure nominale n’est pas encore passée', () => {
    // 06:30 UTC = 08:30 à Paris, avant l'heure nominale de 8 h... déjà passée
    // en fait (8h30 > 8h) : donc demain. Testons AVANT l'heure : 05:30 UTC = 07:30.
    expect(nextRoutineTrigger(PARIS, 'daily', new Date('2026-08-03T05:30:00Z'))).toBe('2026-08-03T06:00:00.000Z')
  })

  it('demain, quand l’heure nominale d’aujourd’hui est déjà passée', () => {
    // 08:30 UTC = 10:30 à Paris, après l'heure nominale de 8 h.
    expect(nextRoutineTrigger(PARIS, 'daily', new Date('2026-08-03T08:30:00Z'))).toBe('2026-08-04T06:00:00.000Z')
  })

  it('saute le week-end pour une routine « jours ouvrés »', () => {
    // Vendredi 7 août 2026, après l'heure nominale → lundi 10, jamais samedi/dimanche.
    expect(nextRoutineTrigger(PARIS, 'weekdays', new Date('2026-08-07T08:00:00Z'))).toBe('2026-08-10T06:00:00.000Z')
  })

  it('n’accepte que SON jour pour une routine hebdomadaire', () => {
    const friday = { ...PARIS, weekday: 5, hour: 16 }
    // Jeudi 6 août 2026 → vendredi 7, à 16 h locale (14 h UTC en été).
    expect(nextRoutineTrigger(friday, 'weekly', new Date('2026-08-06T10:00:00Z'))).toBe('2026-08-07T14:00:00.000Z')
  })

  it('mensuelle : décale au jour ouvré suivant quand le 1er tombe un week-end', () => {
    const nine = { ...PARIS, hour: 9 }
    // Le 1er novembre 2026 est un dimanche → 1er ouvré = lundi 2, 9 h Paris = 8 h UTC.
    expect(nextRoutineTrigger(nine, 'monthly', new Date('2026-10-15T00:00:00Z'))).toBe('2026-11-02T08:00:00.000Z')
  })

  it('trimestrielle : saute au trimestre suivant', () => {
    const nine = { ...PARIS, hour: 9 }
    // Après le 1er ouvré d'octobre (jeudi 1er), le prochain est janvier 2027
    // (vendredi 1er, un jour ouvré) — 9 h Paris = 8 h UTC en hiver.
    expect(nextRoutineTrigger(nine, 'quarterly', new Date('2026-10-15T00:00:00Z'))).toBe('2027-01-01T08:00:00.000Z')
  })

  it('`null` pour une routine désactivée — jamais une date devinée', () => {
    expect(nextRoutineTrigger({ ...PARIS, enabled: false }, 'daily', new Date('2026-08-03T05:30:00Z'))).toBeNull()
  })

  it('`null` pour une cadence continue — pas d’instant unique à nommer', () => {
    expect(nextRoutineTrigger(PARIS, 'continuous', new Date('2026-08-03T05:30:00Z'))).toBeNull()
  })
})

describe('occurrenceKey / routineRunKey', () => {
  it('découpe la journée sur le fuseau de l’utilisateur, pas sur UTC', () => {
    // 22 h 30 UTC un 4 août = déjà le 5 août à Paris.
    expect(occurrenceKey('Europe/Paris', new Date('2026-08-04T22:30:00Z'))).toBe('2026-08-05')
  })

  it('produit une clé lisible — quelqu’un doit pouvoir la lire en base', () => {
    const key = routineRunKey('user-1', 'daily_briefing', 'Europe/Paris', new Date('2026-08-03T06:30:00Z'))
    expect(key).toBe('user-1:daily_briefing:2026-08-03')
  })

  it('la clé d’un OBJET ne porte pas de date', () => {
    // « Ce rendez-vous a été annoncé » est vrai pour toujours : y mettre le jour
    // ferait re-notifier le même rendez-vous le lendemain matin.
    expect(routineObjectKey('user-1', 'meeting_checklist', 'evt-42')).toBe('user-1:meeting_checklist:obj:evt-42')
  })
})
