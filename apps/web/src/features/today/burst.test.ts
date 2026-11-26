import { describe, expect, it } from 'vitest'
import {
  burstPrimary,
  burstProgress,
  initialBurst,
  keyToBurstCommand,
  reduceBurst,
  foldRecipients,
  summarizeBurst,
  type BurstState,
} from './burst'
import type { TodayItem } from './todayQueue'

const DECK = ['a', 'b', 'c', 'd']

const run = (events: Parameters<typeof reduceBurst>[1][], from: BurstState = initialBurst()) =>
  events.reduce((state, event) => reduceBurst(state, event, DECK), from)

describe('reduceBurst — une carte à la fois', () => {
  it('commence sur la première carte', () => {
    expect(initialBurst().index).toBe(0)
    expect(burstProgress(initialBurst(), DECK.length)).toEqual({ current: 1, total: 4, handled: 0 })
  })

  it('j / k : suivant et précédent, bornés au paquet', () => {
    expect(run([{ type: 'next' }, { type: 'next' }]).index).toBe(2)
    expect(run([{ type: 'prev' }]).index).toBe(0)
    expect(run([{ type: 'next' }, { type: 'next' }, { type: 'next' }, { type: 'next' }]).index).toBe(3)
  })

  it('traiter une carte l’enregistre et passe à la suivante non traitée', () => {
    const state = run([{ type: 'handled', id: 'a', outcome: 'done' }])
    expect(state.index).toBe(1)
    expect(state.handled).toEqual({ a: 'done' })
    expect(burstProgress(state, DECK.length)).toEqual({ current: 2, total: 4, handled: 1 })
  })

  it('saute les cartes déjà traitées en avançant', () => {
    const state = run([
      { type: 'next' },
      { type: 'handled', id: 'b', outcome: 'skipped' },
      { type: 'prev' },
      { type: 'prev' },
      { type: 'handled', id: 'a', outcome: 'validated' },
    ])
    expect(state.index).toBe(2)
  })

  it('la dernière carte traitée termine la rafale', () => {
    const state = run([
      { type: 'handled', id: 'a', outcome: 'done' },
      { type: 'handled', id: 'b', outcome: 'done' },
      { type: 'handled', id: 'c', outcome: 'postponed' },
      { type: 'handled', id: 'd', outcome: 'skipped' },
    ])
    expect(state.finished).toBe(true)
    expect(burstProgress(state, DECK.length).handled).toBe(4)
  })

  it('traiter une carte du milieu quand les suivantes sont faites revient aux précédentes non traitées', () => {
    const state = run([
      { type: 'next' },
      { type: 'next' },
      { type: 'next' },
      { type: 'handled', id: 'd', outcome: 'done' },
    ])
    expect(state.finished).toBe(false)
    expect(state.index).toBe(0)
  })

  it('e entre en édition ; Échap sort de l’édition AVANT de sortir de la rafale', () => {
    const editing = run([{ type: 'edit' }])
    expect(editing.editing).toBe(true)
    const back = reduceBurst(editing, { type: 'exit' }, DECK)
    expect(back.editing).toBe(false)
    expect(back.exited).toBe(false)
    expect(reduceBurst(back, { type: 'exit' }, DECK).exited).toBe(true)
  })

  it('« enregistrer » ou « annuler » sort de l’édition sans quitter la rafale', () => {
    const state = run([{ type: 'edit' }, { type: 'stopEdit' }])
    expect(state.editing).toBe(false)
    expect(state.exited).toBe(false)
  })

  it('? ouvre puis ferme l’aide ; Échap ferme l’aide avant de sortir', () => {
    const open = run([{ type: 'help' }])
    expect(open.helpOpen).toBe(true)
    expect(reduceBurst(open, { type: 'help' }, DECK).helpOpen).toBe(false)
    const closed = reduceBurst(open, { type: 'exit' }, DECK)
    expect(closed.helpOpen).toBe(false)
    expect(closed.exited).toBe(false)
  })

  it('changer de carte quitte l’édition', () => {
    expect(run([{ type: 'edit' }, { type: 'next' }]).editing).toBe(false)
  })

  it('un paquet vide ne casse pas', () => {
    expect(reduceBurst(initialBurst(), { type: 'next' }, []).index).toBe(0)
    expect(burstProgress(initialBurst(), 0)).toEqual({ current: 0, total: 0, handled: 0 })
  })
})

const key = (k: string, extra: Partial<Parameters<typeof keyToBurstCommand>[0]> = {}) =>
  keyToBurstCommand({ key: k, ctrl: false, meta: false, alt: false, target: 'other', ...extra })

describe('keyToBurstCommand — les raccourcis', () => {
  it('j k e s x ? Entrée Échap', () => {
    expect(key('j')).toBe('next')
    expect(key('k')).toBe('prev')
    expect(key('e')).toBe('edit')
    expect(key('s')).toBe('postpone')
    expect(key('x')).toBe('skip')
    expect(key('?')).toBe('help')
    expect(key('Enter')).toBe('primary')
    expect(key('Escape')).toBe('exit')
  })

  it('insensible à la casse des lettres', () => {
    expect(key('J')).toBe('next')
    expect(key('X')).toBe('skip')
  })

  it('ne vole jamais un raccourci du navigateur (Ctrl/Cmd/Alt + lettre)', () => {
    expect(key('s', { ctrl: true })).toBeNull()
    expect(key('j', { meta: true })).toBeNull()
    expect(key('x', { alt: true })).toBeNull()
  })

  it('pendant la saisie : rien sauf Échap (quitter l’édition) et Ctrl/Cmd+Entrée (valider)', () => {
    expect(key('j', { target: 'editable' })).toBeNull()
    expect(key('x', { target: 'editable' })).toBeNull()
    expect(key('Enter', { target: 'editable' })).toBeNull()
    expect(key('Escape', { target: 'editable' })).toBe('exit')
    expect(key('Enter', { target: 'editable', ctrl: true })).toBe('primary')
    expect(key('Enter', { target: 'editable', meta: true })).toBe('primary')
  })

  it('sur un bouton ou un lien, Entrée appartient à l’élément (jamais un double geste)', () => {
    expect(key('Enter', { target: 'interactive' })).toBeNull()
    expect(key('j', { target: 'interactive' })).toBe('next')
  })

  it('une touche inconnue ne fait rien', () => {
    expect(key('a')).toBeNull()
  })
})

describe('burstPrimary — le geste d’Entrée, jamais un envoi tout seul (c82)', () => {
  const item = (over: Partial<TodayItem>): TodayItem =>
    ({
      id: 'x:1',
      kind: 'message',
      group: 'validate',
      channel: 'email',
      draft: { subject: 'S', body: 'B' },
      gestures: { validate: true, reject: false, edit: true, done: false, postpone: true },
      ...over,
    }) as TodayItem

  it('un message ou un envoi de playbook : « valider » SEULEMENT sous mandat, sinon copier et ouvrir', () => {
    expect(burstPrimary(item({}), { hasMandate: true, opened: false })).toBe('validate')
    expect(burstPrimary(item({}), { hasMandate: false, opened: false })).toBe('copyOpen')
    expect(burstPrimary(item({ kind: 'playbook_send' }), { hasMandate: false, opened: false })).toBe('copyOpen')
    expect(burstPrimary(item({ kind: 'playbook_send' }), { hasMandate: true, opened: false })).toBe('validate')
  })

  it('une approbation ou une écriture CRM/ERP se valide (aucun e-mail ne part de ce geste)', () => {
    expect(
      burstPrimary(item({ kind: 'approval', channel: null, draft: null }), { hasMandate: false, opened: false }),
    ).toBe('validate')
    expect(
      burstPrimary(item({ kind: 'crm_write', channel: null, draft: null }), { hasMandate: false, opened: false }),
    ).toBe('validate')
  })

  it('ce qui ne peut pas être validé n’offre aucun geste d’Entrée', () => {
    const blocked = item({ gestures: { validate: false, reject: false, edit: true, done: false, postpone: false } })
    expect(burstPrimary(blocked, { hasMandate: true, opened: false })).toBeNull()
  })

  it('une relance avec brouillon : Entrée copie et ouvre, puis marque fait une fois ouvert', () => {
    const step = item({
      kind: 'sequence_step',
      group: 'email',
      gestures: { validate: false, reject: false, edit: false, done: true, postpone: true },
    })
    expect(burstPrimary(step, { hasMandate: true, opened: false })).toBe('copyOpen')
    expect(burstPrimary(step, { hasMandate: true, opened: true })).toBe('done')
  })

  it('sans brouillon (appel, tâche), Entrée marque fait', () => {
    const call = item({
      kind: 'call_task',
      group: 'call',
      channel: 'phone',
      draft: null,
      gestures: { validate: false, reject: false, edit: false, done: true, postpone: true },
    })
    expect(burstPrimary(call, { hasMandate: false, opened: false })).toBe('done')
  })
})

describe('summarizeBurst — qui reçoit quoi, AVANT de traiter le lot (#4354.1)', () => {
  const item = (over: Partial<TodayItem>): TodayItem =>
    ({
      id: 'x:1',
      kind: 'message',
      group: 'validate',
      channel: 'email',
      contactId: 'c1',
      recipient: null,
      draft: { subject: 'Votre DSI recrute', body: 'Bonjour Marie' },
      gestures: { validate: true, reject: false, edit: true, done: false, postpone: true },
      ...over,
    }) as TodayItem

  it('compte les destinataires DISTINCTS, les canaux présents et prend un texte type', () => {
    const summary = summarizeBurst([
      item({ id: 'm:1', contactId: 'c1' }),
      item({ id: 'm:2', contactId: 'c2', draft: { subject: null, body: 'Autre' } }),
      item({ id: 'm:3', contactId: 'c1', channel: 'linkedin' }),
    ])
    expect(summary.total).toBe(3)
    expect(summary.recipients).toBe(2)
    expect(summary.channels.map(({ channel, count }) => ({ channel, count }))).toEqual([
      { channel: 'email', count: 2 },
      { channel: 'linkedin', count: 1 },
    ])
    expect(summary.outward).toBe(3)
    expect(summary.sample).toEqual({ subject: 'Votre DSI recrute', body: 'Bonjour Marie' })
  })

  it('un lot sans destinataire connu ni brouillon ne fabrique rien : null, jamais 0 (GA-18)', () => {
    const summary = summarizeBurst([
      item({ id: 't:1', kind: 'plan_item', contactId: null, channel: null, draft: null }),
    ] as TodayItem[])
    expect(summary.recipients).toBeNull()
    expect(summary.channels).toEqual([])
    expect(summary.outward).toBe(0)
    expect(summary.sample).toBeNull()
  })
})

describe('F1-FIX #4354 — le compte des destinataires ne ment pas, la liste dit QUI reçoit QUOI', () => {
  const mail = (over: Partial<TodayItem>): TodayItem =>
    ({
      id: 'x:1',
      kind: 'message',
      group: 'validate',
      channel: 'email',
      contactId: null,
      contactName: null,
      accountName: null,
      recipient: null,
      draft: null,
      gestures: { validate: true, reject: false, edit: true, done: false, postpone: true },
      ...over,
    }) as TodayItem

  it('des cartes sans identifiant de contact mais avec un nom ne s’effondrent pas en « 1 destinataire »', () => {
    const summary = summarizeBurst([
      mail({ id: 'a', contactName: 'Frederic' }),
      mail({ id: 'b', contactName: 'Steve Anavi' }),
      mail({ id: 'c', contactName: 'Enrique Martinez' }),
    ])
    expect(summary.recipients).toBe(3)
    expect(summary.channels[0]?.people.map(person => person.name)).toEqual([
      'Frederic',
      'Steve Anavi',
      'Enrique Martinez',
    ])
  })

  it('88 actions sans destinataire nommé + 1 nommée : le récap dit « 1 » ET « 88 sans destinataire », jamais 1 pour 89', () => {
    const deck = [
      mail({ id: 'n', contactId: 'c1', contactName: 'Frederic' }),
      ...Array.from({ length: 88 }, (_, index) => mail({ id: `u:${index}` })),
    ]
    const summary = summarizeBurst(deck)
    expect(summary.total).toBe(89)
    expect(summary.recipients).toBe(1)
    expect(summary.unnamed).toBe(88)
    expect(summary.channels[0]).toMatchObject({ channel: 'email', count: 89, unnamed: 88 })
  })

  it('une même personne jointe par deux canaux compte pour UNE, et figure sous chacun', () => {
    const summary = summarizeBurst([
      mail({ id: 'a', contactId: 'c1', contactName: 'Frederic' }),
      mail({ id: 'b', contactId: 'c1', contactName: 'Frederic', channel: 'linkedin' }),
    ])
    expect(summary.recipients).toBe(1)
    expect(summary.channels.map(entry => entry.people.length)).toEqual([1, 1])
  })

  it('un lot où personne n’est nommé : recipients reste null (jamais 0) et tout est « sans destinataire »', () => {
    const summary = summarizeBurst([mail({ id: 'a' }), mail({ id: 'b' })])
    expect(summary.recipients).toBeNull()
    expect(summary.unnamed).toBe(2)
  })

  it('foldRecipients : au-delà de la limite, la liste se replie et DIT combien d’autres', () => {
    const people = Array.from({ length: 8 }, (_, index) => ({ key: `p${index}`, name: `P${index}`, accountName: null }))
    expect(foldRecipients(people, 5)).toEqual({ shown: people.slice(0, 5), hidden: 3 })
    expect(foldRecipients(people.slice(0, 5), 5)).toEqual({ shown: people.slice(0, 5), hidden: 0 })
  })
})

describe('#4521.4 — les destinataires résolus depuis le plan comptent comme nommés', () => {
  const planMail = (over: Partial<TodayItem>): TodayItem =>
    ({
      id: 'plan_item:1',
      kind: 'plan_item',
      group: 'email',
      channel: 'email',
      contactId: null,
      contactName: null,
      recipient: null,
      accountName: 'ALSEDIS',
      draft: null,
      gestures: { validate: false, reject: false, edit: false, done: true, postpone: true },
      ...over,
    }) as TodayItem

  it('« 88 actions sans destinataire nommé » ne se dit plus quand le plan les nomme', () => {
    const summary = summarizeBurst([
      planMail({ id: 'plan_item:1', contactId: 'c1', contactName: 'Muriel Kumpflen' }),
      planMail({ id: 'plan_item:2', contactId: 'c2', contactName: 'Jean Dupont' }),
    ])
    expect(summary.recipients).toBe(2)
    expect(summary.unnamed).toBe(0)
    expect(summary.channels[0]?.people.map(person => person.name)).toEqual(['Muriel Kumpflen', 'Jean Dupont'])
  })

  it('SAIT DIRE NON — une carte du plan sans contact résolu reste dite « sans destinataire »', () => {
    const summary = summarizeBurst([
      planMail({ id: 'plan_item:1', contactId: 'c1', contactName: 'Muriel' }),
      planMail({ id: 'plan_item:2' }),
    ])
    expect(summary.recipients).toBe(1)
    expect(summary.unnamed).toBe(1)
  })
})
