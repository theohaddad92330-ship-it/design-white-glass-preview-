import { afterEach, describe, expect, it } from 'vitest'
import type { AgentChatHistoryItem } from '@/features/chat/api/agentChatApi'
import { dateBucketOf, groupThreadsByAccount, groupThreadsByDate } from './thread-groups'

/**
 * #1911.7 à #1911.10 — les fils de Laura, rangés par date OU par compte.
 *
 * Décision de Louis du 13/09/2026 (batch 11), qui défait la liste plate du
 * 30/08. Ce fichier tient ce que l'écran AFFIRME en rangeant un fil : « tu lui
 * as parlé aujourd'hui », « cette semaine », « ce fil parle de LATECOERE ». Ce
 * sont des affirmations, donc elles se testent aux bornes — minuit, le lundi,
 * le dimanche, le fuseau — et sans navigateur.
 */

const thread = (over: Partial<AgentChatHistoryItem> = {}): AgentChatHistoryItem => ({
  id: 'row-1',
  account_id: null,
  conversation_id: 'conv-1',
  title: 'Stellantis — cadrage',
  created_at: '2020-01-01T09:00:00Z',
  ...over,
})

/** Un instant LOCAL, construit composante par composante : il ne dépend d'aucun fuseau. */
const local = (day: number, hours = 0, minutes = 0, seconds = 0, ms = 0) =>
  new Date(2026, 8, day, hours, minutes, seconds, ms)

describe('dateBucketOf — les bornes (#1911.7 / #1911.8 / #1911.9)', () => {
  it('le calendrier des tests est le bon : le 13/09/2026 est un dimanche, le 14 un lundi', () => {
    // Sans cette ligne, un décalage d'un jour dans `local` rendrait tous les
    // tests ci-dessous verts pour une autre semaine que celle qu'ils décrivent.
    expect(local(13).getDay()).toBe(0)
    expect(local(14).getDay()).toBe(1)
    expect(local(16).getDay()).toBe(3)
  })

  it('minuit pile appartient à AUJOURD’HUI ; une milliseconde avant, c’est hier', () => {
    const now = local(16, 10)
    expect(dateBucketOf(local(16).toISOString(), now)).toBe('today')
    expect(dateBucketOf(local(15, 23, 59, 59, 999).toISOString(), now)).toBe('thisWeek')
  })

  it('à minuit pile, le fil de 23 h 59 la veille n’est plus « aujourd’hui »', () => {
    const now = local(16)
    expect(dateBucketOf(local(15, 23, 59).toISOString(), now)).toBe('thisWeek')
    expect(dateBucketOf(local(16).toISOString(), now)).toBe('today')
  })

  it('la semaine commence le LUNDI à minuit : dimanche 23 h 59 est « plus ancien »', () => {
    const now = local(16, 10)
    expect(dateBucketOf(local(14).toISOString(), now)).toBe('thisWeek')
    expect(dateBucketOf(local(13, 23, 59, 59, 999).toISOString(), now)).toBe('older')
  })

  it('un lundi, « cette semaine » ne contient rien d’autre qu’aujourd’hui — la veille est plus ancienne', () => {
    const monday = local(14, 8)
    expect(dateBucketOf(local(14, 0, 30).toISOString(), monday)).toBe('today')
    expect(dateBucketOf(local(13, 22).toISOString(), monday)).toBe('older')
  })

  it('un DIMANCHE, la semaine remonte au lundi précédent — pas au lendemain', () => {
    // `getDay()` rend 0 le dimanche : un calcul naïf (`date - getDay() + 1`) y
    // pose le début de semaine le LENDEMAIN, et range toute la semaine en
    // « plus ancien ».
    const sunday = local(20, 18)
    expect(dateBucketOf(local(14, 9).toISOString(), sunday)).toBe('thisWeek')
    expect(dateBucketOf(local(13, 9).toISOString(), sunday)).toBe('older')
  })

  it('une activité dans le FUTUR (horloge du poste en retard) reste « aujourd’hui »', () => {
    expect(dateBucketOf(local(17, 9).toISOString(), local(16, 23))).toBe('today')
  })

  it('sait dire NON — une date absente ou illisible n’est rangée dans aucun jour', () => {
    // « Plus ancien » serait une affirmation : on ne sait pas quand ce fil a vécu.
    expect(dateBucketOf(null, local(16))).toBe('undated')
    expect(dateBucketOf(undefined, local(16))).toBe('undated')
    expect(dateBucketOf('pas une date', local(16))).toBe('undated')
  })
})

describe('dateBucketOf — le fuseau est celui du NAVIGATEUR', () => {
  const original = process.env.TZ
  afterEach(() => {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  })

  it('un même instant est « aujourd’hui » à Paris et « cette semaine » à Montréal', () => {
    const now = new Date('2026-09-16T12:00:00Z')
    // 02:30 UTC le 16 : 04:30 le 16 à Paris, 22:30 le 15 à Montréal.
    const instant = '2026-09-16T02:30:00Z'

    process.env.TZ = 'Europe/Paris'
    // La preuve que le test LIT un fuseau : sans elle, un environnement qui
    // ignorerait le changement rendrait les deux assertions pour le même fuseau.
    expect(now.getTimezoneOffset()).toBe(-120)
    expect(dateBucketOf(instant, now)).toBe('today')

    process.env.TZ = 'America/Toronto'
    expect(now.getTimezoneOffset()).toBe(240)
    expect(dateBucketOf(instant, now)).toBe('thisWeek')
  })

  it('le début de semaine suit le fuseau : lundi 01:30 à Paris, dimanche 19:30 à Montréal', () => {
    const now = new Date('2026-09-16T12:00:00Z')
    const instant = '2026-09-13T23:30:00Z'

    process.env.TZ = 'Europe/Paris'
    expect(dateBucketOf(instant, now)).toBe('thisWeek')

    process.env.TZ = 'America/Toronto'
    expect(dateBucketOf(instant, now)).toBe('older')
  })
})

describe('groupThreadsByDate', () => {
  const now = local(16, 10)

  it('range dans l’ordre Aujourd’hui → Cette semaine → Plus ancien, et garde l’ordre servi par l’API', () => {
    const groups = groupThreadsByDate(
      [
        thread({ id: 'a', last_message_at: local(16, 9).toISOString() }),
        thread({ id: 'b', last_message_at: local(16, 8).toISOString() }),
        thread({ id: 'c', last_message_at: local(14, 8).toISOString() }),
        thread({ id: 'd', last_message_at: local(2, 8).toISOString() }),
      ],
      now,
    )
    expect(groups.map(group => [group.key, group.threads.map(item => item.id)])).toEqual([
      ['today', ['a', 'b']],
      ['thisWeek', ['c']],
      ['older', ['d']],
    ])
  })

  it('un groupe VIDE ne s’affiche pas', () => {
    const groups = groupThreadsByDate(
      [
        thread({ id: 'a', last_message_at: local(16, 9).toISOString() }),
        thread({ id: 'd', last_message_at: local(1).toISOString() }),
      ],
      now,
    )
    expect(groups.map(group => group.key)).toEqual(['today', 'older'])
  })

  it('lit la DERNIÈRE activité, et retombe sur l’ouverture quand l’API ne la sert pas', () => {
    const groups = groupThreadsByDate(
      [
        // Ouvert en juin, relancé ce matin : il est d'aujourd'hui.
        thread({ id: 'relance', created_at: '2026-06-01T09:00:00Z', last_message_at: local(16, 8).toISOString() }),
        thread({ id: 'ancienne-api', created_at: local(15, 8).toISOString() }),
      ],
      now,
    )
    expect(groups.map(group => [group.key, group.threads.map(item => item.id)])).toEqual([
      ['today', ['relance']],
      ['thisWeek', ['ancienne-api']],
    ])
  })

  it('un fil sans date lisible va dans son propre groupe, en dernier', () => {
    const groups = groupThreadsByDate(
      [thread({ id: 'x', created_at: 'illisible' }), thread({ id: 'a', last_message_at: local(16, 9).toISOString() })],
      now,
    )
    expect(groups.map(group => group.key)).toEqual(['today', 'undated'])
  })

  it('aucun fil, aucun groupe', () => {
    expect(groupThreadsByDate([], now)).toEqual([])
  })
})

describe('groupThreadsByAccount (#1911.10)', () => {
  it('un groupe par compte, dans l’ordre de sa dernière activité ; « Sans compte » en dernier', () => {
    const groups = groupThreadsByAccount([
      thread({ id: 'portefeuille', account_id: null }),
      thread({ id: 'lat-1', account_id: 'a-1', account_name: 'LATECOERE' }),
      thread({ id: 'saf-1', account_id: 'a-2', account_name: 'SAFRAN' }),
      thread({ id: 'lat-2', account_id: 'a-1', account_name: 'LATECOERE' }),
    ])
    expect(groups.map(group => [group.kind, group.label, group.threads.map(item => item.id)])).toEqual([
      ['account', 'LATECOERE', ['lat-1', 'lat-2']],
      ['account', 'SAFRAN', ['saf-1']],
      ['noAccount', null, ['portefeuille']],
    ])
  })

  it('retombe sur les comptes CONNUS de l’écran quand l’API ne sert pas encore le nom', () => {
    // La fenêtre de déploiement : front neuf, API d'avant.
    const groups = groupThreadsByAccount([thread({ id: 't', account_id: 'a-1' })], new Map([['a-1', 'LATECOERE']]))
    expect(groups.map(group => [group.kind, group.label])).toEqual([['account', 'LATECOERE']])
  })

  it('sait dire NON — un compte sans nom lisible ne s’affiche jamais par son identifiant', () => {
    const groups = groupThreadsByAccount(
      [
        thread({ id: 'efface', account_id: '5f0c2a52-8a51-4a39-9a3e-0b6e1b0c9a11' }),
        thread({ id: 'blanc', account_id: 'a-3', account_name: '   ' }),
        thread({ id: 'lat', account_id: 'a-1', account_name: 'LATECOERE' }),
        thread({ id: 'portefeuille', account_id: null }),
      ],
      new Map([['a-3', '']]),
    )
    expect(groups.map(group => [group.kind, group.label, group.threads.map(item => item.id)])).toEqual([
      ['account', 'LATECOERE', ['lat']],
      // Deux comptes introuvables ne font qu'UN groupe : deux intercalaires au
      // même libellé ne se distingueraient pas.
      ['unknownAccount', null, ['efface', 'blanc']],
      ['noAccount', null, ['portefeuille']],
    ])
    expect(JSON.stringify(groups.map(group => group.label))).not.toContain('5f0c2a52')
  })

  it('n’attrape pas le voisin — deux comptes HOMONYMES restent deux groupes', () => {
    // Le groupe se fait sur le compte, jamais sur le nom : deux fiches « Orange »
    // (deux entités) ne se fondent pas l'une dans l'autre.
    const groups = groupThreadsByAccount([
      thread({ id: 'o1', account_id: 'a-1', account_name: 'Orange' }),
      thread({ id: 'o2', account_id: 'a-2', account_name: 'Orange' }),
    ])
    expect(groups.map(group => group.threads.map(item => item.id))).toEqual([['o1'], ['o2']])
    expect(new Set(groups.map(group => group.key)).size).toBe(2)
  })

  it('aucun fil, aucun groupe', () => {
    expect(groupThreadsByAccount([])).toEqual([])
  })
})
