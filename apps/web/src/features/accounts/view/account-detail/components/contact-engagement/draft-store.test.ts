import { describe, expect, it, vi } from 'vitest'
import type { AssistantEntry } from './conversation'
import { createEngagementDraftStore, draftKey, parseDraftKey } from './draft-store'

function assistantEntry(overrides: Partial<AssistantEntry> = {}): AssistantEntry {
  return { id: 'a-1', role: 'assistant', channel: 'email', subject: 'Objet', text: 'Corps.', ...overrides }
}

describe('parseDraftKey — l’inverse de draftKey (#3695.4/.6)', () => {
  it('retrouve contactId et channel même si le canal ne porte jamais « : »', () => {
    expect(parseDraftKey(draftKey('contact-1', 'email'))).toEqual({ contactId: 'contact-1', channel: 'email' })
  })
})

describe('createEngagementDraftStore — persistVersion (#3695.4/.6)', () => {
  it('sans option : aucun appel, comportement historique inchangé', () => {
    const drafts = createEngagementDraftStore()
    const key = draftKey('contact-1', 'email')
    drafts.set(key, { entries: [assistantEntry({ usedStyleId: 'style-1' })], context: '', parameters: {} })
    expect(drafts.get(key)?.entries).toHaveLength(1)
  })

  it('un tour avec modèle/style APPLIQUÉ (nouveau) part en persistance, une seule fois', () => {
    const persistVersion = vi.fn()
    const drafts = createEngagementDraftStore({ persistVersion })
    const key = draftKey('contact-1', 'email')
    const entry = assistantEntry({ usedTemplate: { source: 'Relance', version: 2 } })
    drafts.set(key, { entries: [entry], context: '', parameters: {} })
    expect(persistVersion).toHaveBeenCalledTimes(1)
    expect(persistVersion).toHaveBeenCalledWith(key, entry, 'generated')
    // Une frappe dans `context` ne change pas `entries` : aucun second appel.
    drafts.set(key, { entries: [entry], context: 'Relancer après le silence', parameters: {} })
    expect(persistVersion).toHaveBeenCalledTimes(1)
  })

  it('un tour SANS trace (brouillon généré sans modèle ni style) ne part jamais en persistance', () => {
    const persistVersion = vi.fn()
    const drafts = createEngagementDraftStore({ persistVersion })
    const key = draftKey('contact-1', 'email')
    drafts.set(key, { entries: [assistantEntry()], context: '', parameters: {} })
    expect(persistVersion).not.toHaveBeenCalled()
  })

  it('#3696.3 — une correction manuelle sur un tour déjà présent part en persistance (kind "edited")', () => {
    const persistVersion = vi.fn()
    const drafts = createEngagementDraftStore({ persistVersion })
    const key = draftKey('contact-1', 'email')
    const original = assistantEntry({ usedStyleId: 'style-1' })
    drafts.set(key, { entries: [original], context: '', parameters: {} })
    persistVersion.mockClear()
    const edited: AssistantEntry = { ...original, edited: { subject: 'Objet corrigé', body: 'Corps corrigé.' } }
    drafts.set(key, { entries: [edited], context: '', parameters: {} })
    expect(persistVersion).toHaveBeenCalledTimes(1)
    expect(persistVersion).toHaveBeenCalledWith(key, edited, 'edited')
  })

  it('SAIT DIRE NON — rouvrir le même brouillon (edited identique, même référence) ne reposte rien', () => {
    const persistVersion = vi.fn()
    const drafts = createEngagementDraftStore({ persistVersion })
    const key = draftKey('contact-1', 'email')
    const edited = { subject: 'Objet corrigé', body: 'Corps corrigé.' }
    const entry = assistantEntry({ edited })
    drafts.set(key, { entries: [entry], context: '', parameters: {} })
    persistVersion.mockClear()
    drafts.set(key, { entries: [{ ...entry }], context: 'autre chose', parameters: {} })
    expect(persistVersion).not.toHaveBeenCalled()
  })
})

describe('createEngagementDraftStore — hydrate (#3696 parité démo)', () => {
  it('pose le cliché serveur quand rien n’existe encore pour cette clé, et notifie onDeliver', () => {
    const drafts = createEngagementDraftStore()
    const key = draftKey('contact-1', 'email')
    const delivered: string[] = []
    drafts.onDeliver(k => delivered.push(k))
    const snapshot = { entries: [assistantEntry()], context: '', parameters: {} }
    drafts.hydrate(key, snapshot)
    expect(drafts.get(key)).toBe(snapshot)
    expect(delivered).toEqual([key])
  })

  it('SAIT DIRE NON — n’écrase jamais un brouillon déjà là (édition en cours, ou déjà restauré)', () => {
    const drafts = createEngagementDraftStore()
    const key = draftKey('contact-1', 'email')
    const local = {
      entries: [assistantEntry({ edited: { subject: 'Objet', body: 'Ma correction.' } })],
      context: '',
      parameters: {},
    }
    drafts.set(key, local)
    drafts.hydrate(key, { entries: [assistantEntry({ id: 'server-1' })], context: '', parameters: {} })
    expect(drafts.get(key)).toBe(local)
  })

  it('#3696 — un cliché VIDE posé par le montage du fil ne bloque pas la lecture serveur (panneau vide en démo)', () => {
    const drafts = createEngagementDraftStore()
    const key = draftKey('contact-1', 'email')
    // Le fil monte et pose son état initial (aucun tour, aucune saisie) AVANT la réponse du serveur.
    drafts.set(key, { entries: [], context: '', parameters: { goal: 'follow_up' } as never })
    const server = {
      entries: [assistantEntry({ id: 'v1' }), assistantEntry({ id: 'v2' })],
      context: '',
      parameters: {},
    }
    drafts.hydrate(key, server)
    expect(drafts.get(key)?.entries.map(e => e.id)).toEqual(['v1', 'v2'])
    // Le brief déjà choisi dans le panneau survit à la lecture.
    expect(drafts.get(key)?.parameters).toEqual({ goal: 'follow_up' })
  })

  it('SAIT DIRE NON — une saisie non envoyée (context) n’est pas « vide » : la lecture serveur ne l’écrase pas', () => {
    const drafts = createEngagementDraftStore()
    const key = draftKey('contact-1', 'email')
    const local = { entries: [], context: 'Relancer après le comité', parameters: {} }
    drafts.set(key, local)
    drafts.hydrate(key, { entries: [assistantEntry({ id: 'v1' })], context: '', parameters: {} })
    expect(drafts.get(key)).toBe(local)
  })

  it('un cliché hydraté ne reparti pas en persistance (on ne reposte pas ce qu’on vient de lire)', () => {
    const persistVersion = vi.fn()
    const drafts = createEngagementDraftStore({ persistVersion })
    const key = draftKey('contact-1', 'email')
    drafts.hydrate(key, {
      entries: [assistantEntry({ usedTemplate: { source: 'Relance', version: 1 } })],
      context: '',
      parameters: {},
    })
    expect(persistVersion).not.toHaveBeenCalled()
  })
})

describe('createEngagementDraftStore — hydrate (#3694.7)', () => {
  const snapshot = { entries: [], context: 'Angle : renouvellement', parameters: { objective: 'relance' } }

  it('pose le cliché reçu du serveur quand la clé est encore vide', () => {
    const store = createEngagementDraftStore()
    store.hydrate('c1:email', snapshot)
    expect(store.get('c1:email')).toEqual(snapshot)
  })

  it("n'écrase jamais un brouillon déjà présent — le commercial a déjà tapé pendant le chargement", () => {
    const store = createEngagementDraftStore()
    const typed = { entries: [], context: 'déjà tapé', parameters: {} }
    store.set('c1:email', typed)
    store.hydrate('c1:email', snapshot)
    expect(store.get('c1:email')).toEqual(typed)
  })

  it('notifie les abonnés `onDeliver` — le panneau ouvert sur cette clé adopte le cliché hydraté', () => {
    const store = createEngagementDraftStore()
    const delivered = vi.fn()
    store.onDeliver(delivered)
    store.hydrate('c1:email', snapshot)
    expect(delivered).toHaveBeenCalledWith('c1:email')
  })

  it("n'avertit personne quand la clé est déjà occupée — rien n'a changé", () => {
    const store = createEngagementDraftStore()
    store.set('c1:email', snapshot)
    const delivered = vi.fn()
    store.onDeliver(delivered)
    store.hydrate('c1:email', { entries: [], context: 'autre', parameters: {} })
    expect(delivered).not.toHaveBeenCalled()
  })
})
