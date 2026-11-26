import { describe, expect, it } from 'vitest'
import { VISIT_MEMORY_DAYS } from './auto-open'
import { alreadySeen, openVisit, readVisit, rememberVisit, serializeVisit, type StoredVisit } from './visit-memory'

const NOW = 1_800_000_000_000
const DAY = 24 * 60 * 60 * 1000

const STORED: StoredVisit = {
  version: 1,
  lastSeenAt: NOW - 2 * DAY,
  visitCount: 2,
  seen: ['Une question sur les crédits ?'],
  lastTopic: 'pricing',
}

describe('relire ce qui est stocké', () => {
  it('relit une visite récente', () => {
    expect(readVisit(serializeVisit(STORED), NOW)).toEqual(STORED)
  })

  it('OUBLIE au-delà de trente jours', () => {
    const old = { ...STORED, lastSeenAt: NOW - (VISIT_MEMORY_DAYS + 1) * DAY }
    expect(readVisit(serializeVisit(old), NOW)).toBeNull()
  })

  it.each([
    ['rien de stocké', null],
    ['du JSON illisible', '{oups'],
    ['autre chose qu’un objet', '"bonjour"'],
    ['une version inconnue', '{"version":2,"lastSeenAt":1,"visitCount":1}'],
    ['un compteur manquant', '{"version":1,"lastSeenAt":1}'],
  ])('accueille comme la première fois quand il y a %s', (_label, raw) => {
    // Une mémoire à moitié comprise produirait un « content de te revoir » à
    // quelqu'un qui n'est jamais venu, ce qui est pire que rien.
    expect(readVisit(raw, NOW)).toBeNull()
  })

  it('nettoie ce qui n’a pas la forme attendue plutôt que de le recopier', () => {
    const raw = JSON.stringify({ version: 1, lastSeenAt: NOW, visitCount: 1.9, seen: ['a', 42, 'b'] })
    const visit = readVisit(raw, NOW)
    expect(visit?.visitCount).toBe(1)
    expect(visit?.seen).toEqual(['a', 'b'])
  })
})

describe('compter les visites', () => {
  it('démarre à un quand on ne connaît personne', () => {
    expect(openVisit(null, NOW, { alreadyCounted: false })).toEqual({
      version: 1,
      lastSeenAt: NOW,
      visitCount: 1,
      seen: [],
    })
  })

  it('incrémente une seule fois par session de navigateur', () => {
    // Sans ce garde-fou, chaque navigation entre deux pages compterait une
    // visite, et Laura dirait « content de te revoir » au deuxième clic.
    expect(openVisit(STORED, NOW, { alreadyCounted: false }).visitCount).toBe(3)
    expect(openVisit(STORED, NOW, { alreadyCounted: true }).visitCount).toBe(2)
  })

  it('garde ce qu’on savait déjà', () => {
    const opened = openVisit(STORED, NOW, { alreadyCounted: true })
    expect(opened.lastTopic).toBe('pricing')
    expect(opened.seen).toEqual(STORED.seen)
  })
})

describe("l'identifiant de visiteur des expériences (§11)", () => {
  it('amorce un identifiant sur une toute première visite', () => {
    expect(openVisit(null, NOW, { alreadyCounted: false, visitorId: 'abc123' }).visitorId).toBe('abc123')
  })

  it("n'amorce rien sans identifiant fourni — jamais un placeholder deviné", () => {
    expect(openVisit(null, NOW, { alreadyCounted: false }).visitorId).toBeUndefined()
  })

  it('ne le change JAMAIS une fois posé — même variante à chaque visite', () => {
    const withId: StoredVisit = { ...STORED, visitorId: 'deja-la' }
    expect(openVisit(withId, NOW, { alreadyCounted: true, visitorId: 'un-autre' }).visitorId).toBe('deja-la')
  })

  it('survit à une relecture depuis le stockage', () => {
    const withId: StoredVisit = { ...STORED, visitorId: 'persiste' }
    expect(readVisit(serializeVisit(withId), NOW)?.visitorId).toBe('persiste')
  })
})

describe('ne jamais rejouer le même message', () => {
  it('reconnaît une accroche déjà servie', () => {
    expect(alreadySeen(STORED, 'Une question sur les crédits ?')).toBe(true)
    expect(alreadySeen(STORED, 'Tu veux voir la démo ?')).toBe(false)
    expect(alreadySeen(null, "n'importe quoi")).toBe(false)
  })

  it('ajoute sans doublon, et borne la liste', () => {
    let visit: StoredVisit = { version: 1, lastSeenAt: NOW, visitCount: 1, seen: [] }
    for (let index = 0; index < 20; index += 1) visit = rememberVisit(visit, { message: `msg-${index}` })
    expect(visit.seen).toHaveLength(12)
    expect(visit.seen.at(-1)).toBe('msg-19')
    expect(rememberVisit(visit, { message: 'msg-19' }).seen).toHaveLength(12)
  })

  it('ne mute jamais ce qu’on lui donne', () => {
    const before = JSON.stringify(STORED)
    rememberVisit(STORED, { message: 'nouveau', topic: 'demo' })
    expect(JSON.stringify(STORED)).toBe(before)
  })

  it('borne le fil conservé en gardant la FIN', () => {
    const turns = Array.from({ length: 40 }, (_, index) => ({ role: 'user' as const, content: `t${index}` }))
    expect(rememberVisit(STORED, { turns }).turns).toHaveLength(20)
    expect(rememberVisit(STORED, { turns }).turns?.at(-1)?.content).toBe('t39')
  })
})
