import { describe, expect, it } from 'vitest'
import {
  addAttachment,
  buildReviewItems,
  editItem,
  itemState,
  markReviewed,
  removeAttachment,
  sendGate,
  sendTargets,
  setExcluded,
  withGeneratedDraft,
  withStoredDraft,
} from './bulkEmailReview'

const contact = (id: string, email: string | null = `${id}@corp.fr`) => ({
  id,
  full_name: `Contact ${id}`,
  title: 'DSI',
  entity: 'Acme',
  email,
})

const stored = { subject: 'Objet', body: 'Corps' }

function loaded() {
  let items = buildReviewItems([contact('a'), contact('b'), contact('c')])
  for (const id of ['a', 'b', 'c']) items = withStoredDraft(items, id, { subject: `S-${id}`, body: `B-${id}` })
  return items
}

/** #4042 — revue par personne : chaque mail est SON état, jamais celui d'un autre. */
describe('bulkEmailReview', () => {
  it('ne garde que les contacts avec une adresse, dans l’ordre de la sélection', () => {
    const items = buildReviewItems([contact('a'), contact('x', null), contact('b')])
    expect(items.map(item => item.contactId)).toEqual(['a', 'b'])
  })

  it('un brouillon stocké est « prêt » ; l’absence de brouillon est « manquant », pas un mail vide', () => {
    let items = buildReviewItems([contact('a'), contact('b')])
    expect(itemState(items[0]!)).toBe('loading')
    items = withStoredDraft(items, 'a', stored)
    items = withStoredDraft(items, 'b', null)
    expect(itemState(items[0]!)).toBe('ready')
    expect(itemState(items[1]!)).toBe('missing')
    expect(items[1]!.body).toBe('')
  })

  it('un mail généré est « à revoir » jusqu’à ce que la personne l’ait vu', () => {
    let items = withStoredDraft(buildReviewItems([contact('a')]), 'a', null)
    items = withGeneratedDraft(items, 'a', stored)
    expect(itemState(items[0]!)).toBe('to_review')
    items = markReviewed(items, 'a')
    expect(itemState(items[0]!)).toBe('ready')
  })

  it('éditer UN mail ne touche ni le texte ni l’état des autres', () => {
    const before = loaded()
    const after = editItem(before, 'b', { body: 'Bonjour Contact b, sur Acme…' })
    expect(after[1]!.body).toBe('Bonjour Contact b, sur Acme…')
    expect(itemState(after[1]!)).toBe('modified')
    expect(after[0]).toBe(before[0])
    expect(after[2]).toBe(before[2])
  })

  it('remettre le texte d’origine redonne « prêt »', () => {
    const edited = editItem(loaded(), 'a', { body: 'autre' })
    expect(itemState(editItem(edited, 'a', { body: 'B-a' })[0]!)).toBe('ready')
  })

  it('une pièce jointe peut aller à UN mail, ou à TOUS, et se retirer', () => {
    const one = addAttachment(loaded(), 'doc-1', ['b'])
    expect(one.map(item => item.attachmentIds)).toEqual([[], ['doc-1'], []])

    const all = addAttachment(one, 'doc-2', 'all')
    expect(all.map(item => item.attachmentIds)).toEqual([['doc-2'], ['doc-1', 'doc-2'], ['doc-2']])

    const removed = removeAttachment(all, 'b', 'doc-1')
    expect(removed[1]!.attachmentIds).toEqual(['doc-2'])
    expect(removed[0]!.attachmentIds).toEqual(['doc-2'])
  })

  it('« à tous » n’ajoute pas deux fois la même pièce, ni aux mails exclus', () => {
    let items = addAttachment(loaded(), 'doc-1', ['a'])
    items = setExcluded(items, 'c', true)
    items = addAttachment(items, 'doc-1', 'all')
    expect(items.map(item => item.attachmentIds)).toEqual([['doc-1'], ['doc-1'], []])
  })

  it('un mail exclu ne part pas, et se réintègre dans son état d’avant', () => {
    let items = editItem(loaded(), 'a', { subject: 'Nouveau' })
    items = setExcluded(items, 'a', true)
    expect(itemState(items[0]!)).toBe('excluded')
    expect(sendTargets(items).map(item => item.contactId)).toEqual(['b', 'c'])
    items = setExcluded(items, 'a', false)
    expect(itemState(items[0]!)).toBe('modified')
  })

  describe('sendGate — aucun envoi sans geste, sans messagerie, ni avant la fin de la revue', () => {
    const ready = { mailboxReady: true, demo: false, attachmentRefused: () => false }

    it('ouvert quand tout est relu et la messagerie prête', () => {
      expect(sendGate(loaded(), ready)).toEqual({ ok: true, count: 3 })
    })

    it('fermé sans messagerie connectée : la raison est nommée', () => {
      expect(sendGate(loaded(), { ...ready, mailboxReady: false })).toEqual({ ok: false, reason: 'no_mailbox' })
    })

    it('fermé en démonstration : rien ne part', () => {
      expect(sendGate(loaded(), { ...ready, demo: true })).toEqual({ ok: false, reason: 'demo' })
    })

    it('fermé tant qu’un mail est manquant, en chargement ou généré mais pas relu', () => {
      let items = withStoredDraft(buildReviewItems([contact('a'), contact('b')]), 'a', stored)
      expect(sendGate(items, ready)).toEqual({ ok: false, reason: 'pending' })
      items = withStoredDraft(items, 'b', null)
      expect(sendGate(items, ready)).toEqual({ ok: false, reason: 'pending' })
      items = withGeneratedDraft(items, 'b', stored)
      expect(sendGate(items, ready)).toEqual({ ok: false, reason: 'pending' })
      expect(sendGate(markReviewed(items, 'b'), ready)).toEqual({ ok: true, count: 2 })
    })

    it('les exclus ne bloquent pas ; tous exclus = rien à envoyer', () => {
      let items = withStoredDraft(buildReviewItems([contact('a'), contact('b')]), 'a', stored)
      items = setExcluded(items, 'b', true)
      expect(sendGate(items, ready)).toEqual({ ok: true, count: 1 })
      expect(sendGate(setExcluded(items, 'a', true), ready)).toEqual({ ok: false, reason: 'nothing' })
    })

    it('un corps vide ne part pas', () => {
      const items = editItem(loaded(), 'a', { body: '   ' })
      expect(sendGate(items, ready)).toEqual({ ok: false, reason: 'empty_body' })
    })

    it('une pièce refusée sur un mail bloque l’envoi', () => {
      const items = addAttachment(loaded(), 'doc-1', ['a'])
      expect(sendGate(items, { ...ready, attachmentRefused: item => item.contactId === 'a' })).toEqual({
        ok: false,
        reason: 'attachment_refused',
      })
    })
  })
})
