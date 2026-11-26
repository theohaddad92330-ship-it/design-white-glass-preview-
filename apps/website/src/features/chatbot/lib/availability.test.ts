import { afterEach, describe, expect, it } from 'vitest'
import {
  HUMAN_REPLY_HORIZON_MINUTES,
  declaredAvailability,
  handoffPromiseInstruction,
  humanReplyPromise,
  parseChatbotAvailability,
  type ChatbotAvailability,
} from './availability'

/**
 * La règle que ce fichier tient : **on ne promet que ce que quelqu'un tiendra.**
 *
 * « Quelqu'un te répond dans l'heure » à 17 h 50 un vendredi est un mensonge qui
 * coûte plus cher que « on te répond lundi matin » — le visiteur attend, ne
 * reçoit rien, et la première impression du produit est celle d'une équipe qui
 * ne rappelle pas.
 */

const OFFICE: ChatbotAvailability = {
  timeZone: 'Europe/Paris',
  // Lundi → vendredi, 9 h – 18 h.
  windows: [1, 2, 3, 4, 5].map(day => ({ day, startMinute: 9 * 60, endMinute: 18 * 60 })),
}

/** Un instant donné en heure de Paris, pour que les tests se lisent. */
function paris(iso: string): Date {
  return new Date(iso)
}

describe('la déclaration de disponibilité', () => {
  it('se lit dans un format compact', () => {
    const parsed = parseChatbotAvailability('1-5 09:00-18:00')
    expect(parsed).toHaveLength(5)
    expect(parsed?.[0]).toEqual({ day: 1, startMinute: 540, endMinute: 1080 })
  })

  it('accepte plusieurs plages séparées par un point-virgule', () => {
    const parsed = parseChatbotAvailability('1-5 09:00-18:00 ; 6 10:00-12:30')
    expect(parsed).toHaveLength(6)
    expect(parsed?.at(-1)).toEqual({ day: 6, startMinute: 600, endMinute: 750 })
  })

  it('rend null sur une déclaration vide — absente n’est pas « ouvert 24 h/24 »', () => {
    expect(parseChatbotAvailability('')).toBeNull()
    expect(parseChatbotAvailability(undefined)).toBeNull()
    expect(parseChatbotAvailability('   ')).toBeNull()
  })

  it('JETTE une plage illisible au lieu de la deviner', () => {
    expect(parseChatbotAvailability('lundi matin')).toBeNull()
    expect(parseChatbotAvailability('1-5 18:00-09:00')).toBeNull()
    expect(parseChatbotAvailability('9 09:00-18:00')).toBeNull()
    expect(parseChatbotAvailability('1-5 09:00-25:00')).toBeNull()
  })

  it('garde les plages valides quand une seule est illisible ? non — tout ou rien', () => {
    // Une déclaration à moitié comprise produirait une promesse à moitié vraie.
    expect(parseChatbotAvailability('1-5 09:00-18:00 ; nawak')).toBeNull()
  })
})

describe('ce que Laura peut promettre', () => {
  it('« dans l’heure » quand on est dans la plage avec au moins une heure devant', () => {
    // Mardi 10 h 00, heure de Paris (été = UTC+2).
    const promise = humanReplyPromise(paris('2026-09-01T08:00:00Z'), OFFICE)
    expect(promise.kind).toBe('within_hour')
  })

  it("NE promet PAS l'heure quand la plage se ferme avant", () => {
    // Mardi 17 h 40 : il reste 20 minutes, moins que l'horizon promis.
    const promise = humanReplyPromise(paris('2026-09-01T15:40:00Z'), OFFICE)
    expect(promise.kind).toBe('at_next_window')
    if (promise.kind !== 'at_next_window') throw new Error('kind inattendu')
    expect(promise.when).toBe('tomorrow')
    expect(promise.weekday).toBe(3)
    expect(promise.startMinute).toBe(540)
  })

  it('renvoie à louverture du jour quand on arrive avant', () => {
    // Mardi 7 h 30.
    const promise = humanReplyPromise(paris('2026-09-01T05:30:00Z'), OFFICE)
    expect(promise.kind).toBe('at_next_window')
    if (promise.kind !== 'at_next_window') throw new Error('kind inattendu')
    expect(promise.when).toBe('today')
    expect(promise.weekday).toBe(2)
  })

  it('saute le week-end au lieu de promettre samedi', () => {
    // Samedi 11 h.
    const promise = humanReplyPromise(paris('2026-09-05T09:00:00Z'), OFFICE)
    expect(promise.kind).toBe('at_next_window')
    if (promise.kind !== 'at_next_window') throw new Error('kind inattendu')
    expect(promise.weekday).toBe(1)
    expect(promise.when).toBe('later')
  })

  it('dit « demain » un vendredi soir ? non — lundi est « plus tard »', () => {
    // Vendredi 19 h.
    const promise = humanReplyPromise(paris('2026-09-04T17:00:00Z'), OFFICE)
    if (promise.kind !== 'at_next_window') throw new Error('kind inattendu')
    expect(promise.weekday).toBe(1)
    expect(promise.when).toBe('later')
  })

  it('ne promet RIEN quand aucune disponibilité n’est déclarée', () => {
    expect(humanReplyPromise(paris('2026-09-01T08:00:00Z'), null).kind).toBe('unknown')
    expect(humanReplyPromise(paris('2026-09-01T08:00:00Z'), { timeZone: 'Europe/Paris', windows: [] }).kind).toBe(
      'unknown',
    )
  })

  it("l'horizon promis est nommé, pas caché dans une constante magique", () => {
    expect(HUMAN_REPLY_HORIZON_MINUTES).toBe(60)
  })

  it('ne promet rien non plus quand le fuseau déclaré est illisible', () => {
    const broken: ChatbotAvailability = { timeZone: 'Mars/Olympus_Mons', windows: OFFICE.windows }
    expect(humanReplyPromise(paris('2026-09-01T08:00:00Z'), broken).kind).toBe('unknown')
  })

  it('lit bien le fuseau déclaré et pas celui de la machine', () => {
    // Le même instant : 10 h 30 à Paris (ouvert, une heure devant) et 17 h 30 à
    // Tokyo (ouvert, mais la plage ferme dans 30 minutes).
    const tokyo: ChatbotAvailability = { ...OFFICE, timeZone: 'Asia/Tokyo' }
    expect(humanReplyPromise(paris('2026-09-01T08:30:00Z'), OFFICE).kind).toBe('within_hour')
    expect(humanReplyPromise(paris('2026-09-01T08:30:00Z'), tokyo).kind).toBe('at_next_window')
  })
})

describe('la lecture de la déclaration en variable', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('sans variable : no-op strict, aucune disponibilité', () => {
    delete process.env.CHATBOT_AVAILABILITY_WINDOWS
    expect(declaredAvailability()).toBeNull()
  })

  it('avec une déclaration illisible : no-op strict aussi, jamais un défaut deviné', () => {
    process.env.CHATBOT_AVAILABILITY_WINDOWS = 'du lundi au vendredi'
    expect(declaredAvailability()).toBeNull()
  })

  it("retient le fuseau de l'équipe, avec Paris par défaut", () => {
    process.env.CHATBOT_AVAILABILITY_WINDOWS = '1-5 09:00-18:00'
    delete process.env.CHATBOT_AVAILABILITY_TZ
    expect(declaredAvailability()?.timeZone).toBe('Europe/Paris')
    process.env.CHATBOT_AVAILABILITY_TZ = 'Europe/Lisbon'
    expect(declaredAvailability()?.timeZone).toBe('Europe/Lisbon')
  })
})

describe('la consigne rendue au modèle', () => {
  it('autorise « dans l’heure » seulement quand c’est vrai', () => {
    expect(handoffPromiseInstruction({ kind: 'within_hour' })).toContain("dans l'heure")
  })

  it('donne l’heure d’ouverture, pas un « très vite »', () => {
    const text = handoffPromiseInstruction({
      kind: 'at_next_window',
      weekday: 1,
      startMinute: 9 * 60 + 30,
      when: 'tomorrow',
    })
    expect(text).toContain('09:30')
    expect(text).toContain('demain')
    expect(text).not.toContain("dans l'heure")
  })

  it("INTERDIT tout délai quand aucune disponibilité n'est déclarée", () => {
    const text = handoffPromiseInstruction({ kind: 'unknown' })
    expect(text).toContain('AUCUN')
    expect(text).not.toContain("dans l'heure")
  })
})
