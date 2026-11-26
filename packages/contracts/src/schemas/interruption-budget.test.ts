import { describe, expect, it } from 'vitest'
import {
  adaptiveCapFor,
  afterIntervention,
  afterReaction,
  canInterrupt,
  CLOSED_BEFORE_RETREAT,
  EMPTY_INTERRUPTION_STATE,
  ENGAGED_USER_CAP,
  GOLDEN_MOMENTS,
  GOLDEN_MOMENT_INTERVENTIONS,
  IGNORED_BEFORE_THROTTLE,
  isInterruptionSilenced,
  isRefusal,
  MIN_GAP_MINUTES,
  SPONTANEOUS_QUERIES_FOR_RAISE,
  startOfDay,
  THROTTLED_CAP,
  type DailyObservation,
  type InterruptionState,
} from './interruption-budget.js'
import { LAURA_INTERVENTIONS } from './laura-interventions.js'

const NOW = 1_800_000_000_000
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

function ask(state: Partial<InterruptionState>, overrides: Partial<Parameters<typeof canInterrupt>[0]> = {}) {
  return canInterrupt({
    state: { ...EMPTY_INTERRUPTION_STATE, ...state },
    screen: '/accounts',
    busy: false,
    sentToday: 0,
    cap: 3,
    now: NOW,
    ...overrides,
  })
}

describe('les trois durcissements du §5.3', () => {
  it('laisse passer une première intervention', () => {
    expect(ask({})).toEqual({ allowed: true, capForToday: 3, capReason: 'user_setting' })
  })

  it('n’en pose qu’UNE par écran', () => {
    // Le plafond journalier laisse passer trois messages sur le même écran en
    // une minute — trois fois raisonnable, une fois insupportable.
    expect(ask({ screensServed: ['/accounts'] })).toEqual({ allowed: false, reason: 'screen_already_served' })
    expect(ask({ screensServed: ['/missions'] }).allowed).toBe(true)
  })

  it('attend vingt minutes entre deux', () => {
    const verdict = ask({ lastInterventionAt: NOW - 5 * MINUTE })
    expect(verdict).toMatchObject({ allowed: false, reason: 'too_soon' })
    expect(ask({ lastInterventionAt: NOW - MIN_GAP_MINUTES * MINUTE }).allowed).toBe(true)
  })

  it('ne parle jamais pendant que la personne travaille', () => {
    expect(ask({}, { busy: true })).toEqual({ allowed: false, reason: 'busy' })
  })

  it('respecte le plafond du jour', () => {
    expect(ask({}, { sentToday: 3, cap: 3 })).toEqual({ allowed: false, reason: 'cap_reached' })
  })
})

describe('l’ordre des refus suit la volonté de l’utilisateur', () => {
  it('« coupé » gagne sur tout le reste', () => {
    // Répondre « le délai n'est pas écoulé » à quelqu'un qui a coupé la
    // fonction serait absurde.
    expect(ask({ disabled: true, retreatUntil: NOW + DAY }, { busy: true, sentToday: 99 })).toEqual({
      allowed: false,
      reason: 'disabled',
    })
  })

  it('le retrait gagne sur les bornes mécaniques', () => {
    expect(ask({ retreatUntil: NOW + DAY }, { busy: true })).toMatchObject({ allowed: false, reason: 'retreat' })
  })

  it('un retrait expiré ne bloque plus rien', () => {
    expect(ask({ retreatUntil: NOW - 1 }).allowed).toBe(true)
  })
})

describe('le retrait — deux mécaniques qui ne disent pas la même chose', () => {
  it('deux interventions IGNORÉES font descendre le plafond à un, une semaine', () => {
    let state = EMPTY_INTERRUPTION_STATE
    for (let i = 0; i < IGNORED_BEFORE_THROTTLE; i += 1) state = afterReaction(state, 'ignored', NOW)
    expect(state.throttleUntil).toBeGreaterThan(NOW)
    expect(state.consecutiveIgnored).toBe(0)
    expect(ask(state, { sentToday: THROTTLED_CAP, cap: 5 })).toEqual({ allowed: false, reason: 'cap_reached' })
  })

  it('trois FERMETURES sans lecture font taire Laura sept jours', () => {
    // Ignorer, c'est ne pas répondre — la personne était occupée. Fermer sans
    // lire, c'est un geste, et un geste veut dire « pas ça ».
    let state = EMPTY_INTERRUPTION_STATE
    for (let i = 0; i < CLOSED_BEFORE_RETREAT; i += 1) state = afterReaction(state, 'closed_unread', NOW)
    expect(state.retreatUntil).toBe(NOW + 7 * DAY)
    expect(ask(state)).toMatchObject({ allowed: false, reason: 'retreat' })
  })

  it('deux fermetures ne suffisent pas', () => {
    let state = EMPTY_INTERRUPTION_STATE
    state = afterReaction(afterReaction(state, 'closed_unread', NOW), 'closed_unread', NOW)
    expect(state.retreatUntil).toBeNull()
    expect(ask(state).allowed).toBe(true)
  })

  it('un geste UTILE remet tout à zéro — c’est le seul signal qui dit « continue »', () => {
    const stressed: InterruptionState = {
      ...EMPTY_INTERRUPTION_STATE,
      consecutiveIgnored: 1,
      consecutiveClosedUnread: 2,
      throttleUntil: NOW + DAY,
    }
    const after = afterReaction(stressed, 'acted', NOW)
    expect(after.consecutiveIgnored).toBe(0)
    expect(after.consecutiveClosedUnread).toBe(0)
    expect(after.throttleUntil).toBeNull()
  })

  it('un refus explicite ne compte comme aucun des deux', () => {
    // Il porte sur une PROPOSITION, pas sur Laura : le §5.7 s'en occupe
    // autrement (« tu ne la reproposes pas avant 30 jours »).
    const state: InterruptionState = { ...EMPTY_INTERRUPTION_STATE, consecutiveIgnored: 1 }
    expect(afterReaction(state, 'refused', NOW)).toEqual(state)
  })

  it('#2403.33 — `refused_stale_data` ne compte comme aucun des deux non plus, exactement comme `refused`', () => {
    const state: InterruptionState = { ...EMPTY_INTERRUPTION_STATE, consecutiveIgnored: 1 }
    expect(afterReaction(state, 'refused_stale_data', NOW)).toEqual(state)
  })

  it('#2403.33 — `refused_handled_elsewhere` ne compte comme aucun des deux non plus, exactement comme `refused`', () => {
    const state: InterruptionState = { ...EMPTY_INTERRUPTION_STATE, consecutiveIgnored: 1 }
    expect(afterReaction(state, 'refused_handled_elsewhere', NOW)).toEqual(state)
  })
})

describe('#2403.33 — isRefusal, une seule fonction pour les trois formes de refus', () => {
  it('reconnaît les trois formes RÉELLES', () => {
    expect(isRefusal('refused')).toBe(true)
    expect(isRefusal('refused_stale_data')).toBe(true)
    expect(isRefusal('refused_handled_elsewhere')).toBe(true)
  })

  it('rejette tout le reste, y compris `null` et une valeur illisible', () => {
    expect(isRefusal('acted')).toBe(false)
    expect(isRefusal('ignored')).toBe(false)
    expect(isRefusal('closed_unread')).toBe(false)
    expect(isRefusal(null)).toBe(false)
    expect(isRefusal('un-texte-quelconque')).toBe(false)
  })
})

describe('la tenue de l’état', () => {
  it('note l’écran servi et l’heure', () => {
    const after = afterIntervention(EMPTY_INTERRUPTION_STATE, '/missions', NOW)
    expect(after.screensServed).toEqual(['/missions'])
    expect(after.lastInterventionAt).toBe(NOW)
  })

  it('ne double jamais un écran', () => {
    const once = afterIntervention(EMPTY_INTERRUPTION_STATE, '/missions', NOW)
    expect(afterIntervention(once, '/missions', NOW).screensServed).toEqual(['/missions'])
  })

  it('réarme les écrans chaque jour, sans effacer le retrait', () => {
    const state: InterruptionState = {
      ...EMPTY_INTERRUPTION_STATE,
      screensServed: ['/a', '/b'],
      retreatUntil: NOW + DAY,
      throttleUntil: NOW + DAY,
    }
    const fresh = startOfDay(state)
    expect(fresh.screensServed).toEqual([])
    expect(fresh.retreatUntil).toBe(NOW + DAY)
    expect(fresh.throttleUntil).toBe(NOW + DAY)
  })
})

/* ------------------------------------------------------------------ */
/*  §13.2 — le budget adaptatif                                        */
/* ------------------------------------------------------------------ */

const NOTHING_OBSERVED: DailyObservation = { sent: 0, accepted: 0, spontaneousQueries: null }

function capFor(yesterday: DailyObservation | null, cap = 3, throttleUntil: number | null = null) {
  return adaptiveCapFor({ cap, yesterday, throttleUntil, now: NOW })
}

describe('le budget adaptatif — la BAISSE (§13.2)', () => {
  it('« 3 interventions, 1 acceptée » donne un plafond de 2 le lendemain', () => {
    // La ligne du tome, mot pour mot. C'est la seule des cinq qui n'était
    // tenue par rien : le retrait daté couvre « 0 acceptée », le geste utile
    // couvre « 3 acceptées », et l'acceptation PARTIELLE n'existait pas.
    expect(capFor({ sent: 3, accepted: 1, spontaneousQueries: null })).toEqual({
      cap: 2,
      reason: 'partial_acceptance',
    })
  })

  it('« 3 interventions, 3 acceptées » maintient le plafond', () => {
    expect(capFor({ sent: 3, accepted: 3, spontaneousQueries: null })).toEqual({ cap: 3, reason: 'user_setting' })
  })

  it('ne baisse que si la journée a été PLEINE', () => {
    // Une seule intervention envoyée hier ne dit rien du plafond : on n'a pas
    // observé le comportement AU plafond, on a observé une intervention.
    expect(capFor({ sent: 1, accepted: 0, spontaneousQueries: null })).toEqual({ cap: 3, reason: 'user_setting' })
  })

  it('ne descend jamais sous le plancher du réglage', () => {
    expect(capFor({ sent: 1, accepted: 0, spontaneousQueries: null }, 1)).toMatchObject({ cap: 1 })
  })

  it('un plafond déjà DESCENDU par le retrait daté gagne sur la baisse', () => {
    // Deux dérivations du même plafond divergeraient. Le retrait est daté et
    // porte sept jours : il passe avant l'observation d'hier.
    expect(capFor({ sent: 3, accepted: 1, spontaneousQueries: 9 }, 3, NOW + DAY)).toEqual({
      cap: THROTTLED_CAP,
      reason: 'throttled',
    })
  })
})

describe('le budget adaptatif — la HAUSSE (§13.2)', () => {
  it('plus de cinq sollicitations spontanées dans la journée portent le plafond à quatre', () => {
    expect(capFor({ ...NOTHING_OBSERVED, spontaneousQueries: SPONTANEOUS_QUERIES_FOR_RAISE + 1 })).toEqual({
      cap: ENGAGED_USER_CAP,
      reason: 'engaged_user',
    })
  })

  it('CINQ pile ne suffit pas — le tome écrit « > 5 »', () => {
    expect(capFor({ ...NOTHING_OBSERVED, spontaneousQueries: SPONTANEOUS_QUERIES_FOR_RAISE })).toEqual({
      cap: 3,
      reason: 'user_setting',
    })
  })

  it('ne fait jamais DESCENDRE un plafond réglé plus haut', () => {
    // « → 4 » est une hausse, pas une valeur imposée : quelqu'un qui a réglé
    // 5 et qui pose dix questions ne doit pas se retrouver à 4.
    expect(capFor({ ...NOTHING_OBSERVED, spontaneousQueries: 10 }, 5)).toEqual({ cap: 5, reason: 'user_setting' })
  })

  it('la baisse gagne sur la hausse', () => {
    // Poser des questions ET ignorer ce qu'on propose veut dire « je te veux
    // à la demande », pas « interromps-moi plus ».
    expect(capFor({ sent: 3, accepted: 1, spontaneousQueries: 20 })).toEqual({
      cap: 2,
      reason: 'partial_acceptance',
    })
  })
})

describe('le budget adaptatif — « non mesuré » n’est jamais « zéro »', () => {
  it('sans hier du tout, le plafond reste celui de la personne', () => {
    expect(capFor(null)).toEqual({ cap: 3, reason: 'user_setting' })
  })

  it('des sollicitations NON MESURÉES ne valent pas « zéro question posée »', () => {
    expect(capFor({ ...NOTHING_OBSERVED, spontaneousQueries: null })).toEqual({ cap: 3, reason: 'user_setting' })
  })

  it('un espace sans aucune intervention hier n’a pas un taux d’acceptation de 0 %', () => {
    // `sent: 0` est une mesure VRAIE — on a lu les traces — mais elle ne dit
    // rien de l'acceptation : zéro envoyée, zéro à accepter.
    expect(capFor(NOTHING_OBSERVED)).toEqual({ cap: 3, reason: 'user_setting' })
  })

  it('un réglage ILLISIBLE retombe sur le défaut, jamais sur l’infini', () => {
    // Avant l'unification du clamp, la porte faisait `Math.max(1, trunc(cap))` :
    // un `cap` non numérique donnait `NaN`, `sentToday >= NaN` valait `false`,
    // et le plafond disparaissait — Laura devenait illimitée sans un seul refus.
    expect(capFor(null, Number.NaN)).toEqual({ cap: 3, reason: 'user_setting' })
    expect(ask({}, { cap: Number.NaN, sentToday: 99 })).toEqual({ allowed: false, reason: 'cap_reached' })
    // Et le plafond ne dépasse jamais les bornes de D40, des deux côtés.
    expect(capFor(null, 12)).toMatchObject({ cap: 5 })
    expect(capFor(null, -4)).toMatchObject({ cap: 1 })
  })

  it('le plafond adaptatif est la SEULE dérivation lue par la porte', () => {
    // La porte ne recalcule rien : elle rend le plafond que la dérivation a
    // décidé, avec sa raison. Deux chemins divergeraient au premier réglage.
    const verdict = ask({}, { yesterday: { sent: 3, accepted: 1, spontaneousQueries: null } })
    expect(verdict).toEqual({ allowed: true, capForToday: 2, capReason: 'partial_acceptance' })
    expect(ask({}, { sentToday: 2, yesterday: { sent: 3, accepted: 1, spontaneousQueries: null } })).toEqual({
      allowed: false,
      reason: 'cap_reached',
    })
  })
})

/* ------------------------------------------------------------------ */
/*  §13.3 — les trois moments d'or                                     */
/* ------------------------------------------------------------------ */

describe('les moments d’or — le plafond ne s’applique pas', () => {
  it.each(GOLDEN_MOMENTS)('« %s » fait passer une intervention au-delà du plafond', moment => {
    expect(ask({}, { sentToday: 3, cap: 3 })).toEqual({ allowed: false, reason: 'cap_reached' })
    expect(ask({}, { sentToday: 3, cap: 3, goldenMoment: moment })).toMatchObject({
      allowed: true,
      goldenMoment: moment,
    })
  })

  it('ne dit « moment d’or » que quand l’exception a SERVI', () => {
    // Sous le plafond, l'intervention passait de toute façon : annoncer une
    // dérogation ferait croire à un budget dépensé qui ne l'a pas été.
    expect(ask({}, { sentToday: 0, goldenMoment: 'real_blocker' })).not.toHaveProperty('goldenMoment')
  })

  it('ne contourne NI l’interrupteur de la personne, NI le retrait', () => {
    // D49 : une Laura qu'on ne peut pas couper est une Laura qu'on subit.
    expect(ask({ disabled: true }, { sentToday: 9, goldenMoment: 'real_blocker' })).toEqual({
      allowed: false,
      reason: 'disabled',
    })
    // Le retrait a été ANNONCÉ une fois : le contourner ferait de l'annonce
    // un mensonge.
    expect(ask({ retreatUntil: NOW + DAY }, { sentToday: 9, goldenMoment: 'real_blocker' })).toMatchObject({
      allowed: false,
      reason: 'retreat',
    })
  })

  it('ne contourne ni « occupé », ni l’unicité par écran, ni les vingt minutes', () => {
    // Le tome dit « le plafond ne s'applique pas ». Il ne dit pas « toutes les
    // bornes sautent » — et trois messages d'affilée sur le même écran est ce
    // qui fait couper la fonction.
    expect(ask({}, { busy: true, sentToday: 9, goldenMoment: 'long_action_finished' })).toEqual({
      allowed: false,
      reason: 'busy',
    })
    expect(ask({ screensServed: ['/accounts'] }, { sentToday: 9, goldenMoment: 'long_action_finished' })).toEqual({
      allowed: false,
      reason: 'screen_already_served',
    })
    expect(
      ask({ lastInterventionAt: NOW - MINUTE }, { sentToday: 9, goldenMoment: 'return_from_absence' }),
    ).toMatchObject({ allowed: false, reason: 'too_soon' })
  })

  it('chaque moment d’or ne porte que des interventions du CATALOGUE', () => {
    // Sans cette table, une dérogation obtenue par un connecteur mort ferait
    // passer n'importe quel message — l'exception deviendrait le trou.
    const known = new Set(LAURA_INTERVENTIONS.map(intervention => intervention.key))
    expect(known.size).toBeGreaterThan(20)
    // La table LIT quelque chose : au moins un moment porte réellement une clé.
    expect(GOLDEN_MOMENTS.flatMap(moment => [...GOLDEN_MOMENT_INTERVENTIONS[moment]]).length).toBeGreaterThan(0)
    for (const moment of GOLDEN_MOMENTS) {
      for (const key of GOLDEN_MOMENT_INTERVENTIONS[moment]) expect(known).toContain(key)
    }
  })

  it('« fin d’action longue » ne porte AUCUNE clé, et c’est écrit', () => {
    // Le catalogue n'a rien qui dise « ton analyse est prête ». Le moment est
    // détecté et honoré ; il ne trouve rien à dire, et Laura se tait. Écrire
    // ici une clé approchante ferait annoncer autre chose à sa place.
    expect(GOLDEN_MOMENT_INTERVENTIONS.long_action_finished).toEqual([])
  })
})

/**
 * #1938.13 — `isInterruptionSilenced` porte le sous-ensemble du budget qui
 * vaut pour TOUT canal, pas seulement la bulle sur un écran : « coupé » et
 * « en retrait » sont les deux refus de `canInterrupt` qui ne dépendent ni
 * d'un écran ni d'un plafond de volume. Un canal SANS écran (les
 * notifications) peut donc les consulter sans emprunter le reste.
 */
describe('#1938.13 — isInterruptionSilenced, le sous-ensemble valable hors écran', () => {
  it('coupé : silencieux', () => {
    expect(isInterruptionSilenced({ ...EMPTY_INTERRUPTION_STATE, disabled: true }, NOW)).toBe(true)
  })

  it('en retrait : silencieux', () => {
    expect(isInterruptionSilenced({ ...EMPTY_INTERRUPTION_STATE, retreatUntil: NOW + DAY }, NOW)).toBe(true)
  })

  it('un retrait EXPIRÉ ne bloque plus rien', () => {
    expect(isInterruptionSilenced({ ...EMPTY_INTERRUPTION_STATE, retreatUntil: NOW - 1 }, NOW)).toBe(false)
  })

  it('ni coupé ni en retrait : pas silencieux — le throttle et le plafond ne comptent pas ici', () => {
    // Un témoin volontairement voisin : le THROTTLE réduit le plafond
    // (`adaptiveCapFor`), il ne coupe rien. `isInterruptionSilenced` ne doit
    // pas s'en emparer — un canal sans plafond n'a rien à en faire, et le
    // confondre avec « en retrait » ferait taire un canal qui ne le doit pas.
    expect(isInterruptionSilenced({ ...EMPTY_INTERRUPTION_STATE, throttleUntil: NOW + DAY }, NOW)).toBe(false)
  })

  it('reste d’accord avec `canInterrupt` sur les deux mêmes cas — une dérivation à un seul endroit', () => {
    const disabled = { ...EMPTY_INTERRUPTION_STATE, disabled: true }
    const retreating = { ...EMPTY_INTERRUPTION_STATE, retreatUntil: NOW + DAY }
    expect(isInterruptionSilenced(disabled, NOW)).toBe(!ask(disabled).allowed)
    expect(isInterruptionSilenced(retreating, NOW)).toBe(!ask(retreating).allowed)
  })
})
