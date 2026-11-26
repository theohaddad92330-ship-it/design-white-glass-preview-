/**
 * #1939.13 / #1939.14 — le message dicté part par le chemin d'envoi EXISTANT :
 * `POST /ia/chat/messages`, avec l'identifiant de l'enregistrement. Un message
 * tapé garde un corps byte-identique (clé omise, jamais `null`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { i18n } from '@/i18n'
import {
  assignPendingAction,
  createAgentChatMessage,
  exportAgentChatThread,
  listAgentChatMessages,
  searchAgentChatThreads,
} from './agentChatApi'

vi.mock('@/features/documents/api', () => ({ downloadDocument: vi.fn() }))
const { downloadDocument } = await import('@/features/documents/api')
const downloadDocumentMock = vi.mocked(downloadDocument)

const apiFetchMock = vi.mocked(apiFetch)
const VOICE_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  apiFetchMock.mockReset().mockResolvedValue({ message: { id: 'm-1' } })
  downloadDocumentMock.mockReset().mockResolvedValue(undefined)
})

const sentBody = () => (apiFetchMock.mock.calls[0]?.[0] as { body: Record<string, unknown> }).body

describe('#1939.13 — l’enregistrement voyage avec le message, par la porte existante', () => {
  it('un message tapé : corps identique à avant, sans clé voiceObjectId', async () => {
    await createAgentChatMessage({ accountId: null, conversationId: 'c-1', role: 'user', content: 'Bonjour' })
    expect(apiFetchMock.mock.calls[0]?.[0]).toMatchObject({ path: '/ia/chat/messages', method: 'POST' })
    expect(sentBody()).toEqual({ accountId: null, conversationId: 'c-1', role: 'user', content: 'Bonjour' })
    expect(Object.keys(sentBody())).not.toContain('voiceObjectId')
  })

  it('un message dicté porte l’identifiant de son enregistrement', async () => {
    await createAgentChatMessage({
      accountId: null,
      conversationId: 'c-1',
      role: 'user',
      content: 'Quels signaux sur Airbus ?',
      voiceObjectId: VOICE_ID,
    })
    expect(sentBody()).toEqual({
      accountId: null,
      conversationId: 'c-1',
      role: 'user',
      content: 'Quels signaux sur Airbus ?',
      voiceObjectId: VOICE_ID,
    })
  })

  it('`voiceObjectId: null` : clé omise, pas envoyée à vide', async () => {
    await createAgentChatMessage({
      accountId: null,
      conversationId: 'c-1',
      role: 'user',
      content: 'Bonjour',
      voiceObjectId: null,
    })
    expect(Object.keys(sentBody())).not.toContain('voiceObjectId')
  })
})

/**
 * #1952.10 — la carte EST un run, elle survit au rechargement.
 *
 * `askLauraStreaming` rend le `turnId` que `withTurnCards` a stampé sur
 * l'événement `done` ; c'est cette porte-ci qui doit le renvoyer à la
 * persistance pour que `GET /ia/chat/messages` retrouve les cartes du tour.
 */
describe('#1952.10 — le tour de la réponse voyage avec le message enregistré', () => {
  const TURN_ID = '33333333-3333-4333-8333-333333333333'

  it('une réponse de Laura porte le tour', async () => {
    await createAgentChatMessage({
      accountId: null,
      conversationId: 'c-1',
      role: 'assistant',
      content: 'Voici le dossier.',
      turnId: TURN_ID,
    })
    expect(sentBody()).toEqual({
      accountId: null,
      conversationId: 'c-1',
      role: 'assistant',
      content: 'Voici le dossier.',
      turnId: TURN_ID,
    })
  })

  it('pas de tour connu : clé omise, jamais envoyée vide', async () => {
    await createAgentChatMessage({ accountId: null, conversationId: 'c-1', role: 'assistant', content: 'Bonjour' })
    expect(Object.keys(sentBody())).not.toContain('turnId')
  })
})

/**
 * #2494 — les documents ENVOYÉS avec un message voyagent par la même porte :
 * c'est ce qui fait que le nom de la pièce jointe survit à un rechargement du
 * fil (le serveur les retrouve dans l'espace de l'appelant et écrit leur nom).
 */
describe('#2494 — les documents joints voyagent avec le message', () => {
  it('un message avec pièce jointe porte les identifiants des documents', async () => {
    await createAgentChatMessage({
      accountId: null,
      conversationId: 'c-1',
      role: 'user',
      content: 'Résume ce CV',
      documentIds: ['doc-1'],
    })
    expect(sentBody()).toEqual({
      accountId: null,
      conversationId: 'c-1',
      role: 'user',
      content: 'Résume ce CV',
      documentIds: ['doc-1'],
    })
  })

  it('sans pièce jointe : clé omise, corps identique à avant ce lot', async () => {
    await createAgentChatMessage({ accountId: null, conversationId: 'c-1', role: 'user', content: 'Bonjour' })
    expect(Object.keys(sentBody())).not.toContain('documentIds')
  })

  it('une liste VIDE : clé omise, jamais envoyée vide', async () => {
    await createAgentChatMessage({
      accountId: null,
      conversationId: 'c-1',
      role: 'user',
      content: 'Bonjour',
      documentIds: [],
    })
    expect(Object.keys(sentBody())).not.toContain('documentIds')
  })
})

/**
 * #1911.11 — la recherche porte sur TOUT L'HISTORIQUE, pas seulement la page
 * chargée par `listAgentChatHistory`. La route existait déjà côté serveur
 * (#1955.2) sans qu'aucun client web ne l'appelle.
 */
/**
 * ⚠️ ANTÉRIORITÉ — #1955.2 (déjà en production) revient sur #1911.11, délibérément.
 *
 * Les deux lots avaient écrit `searchAgentChatThreads`, chacun de son côté.
 * L'intégration n'en garde qu'UNE (GA-26) : celle de #1955.2, qui BORNE la
 * requête (`limit=50`, le plafond du serveur) et refuse une requête vide avant
 * de partir. Les URL attendues ci-dessous portent donc `limit=50` À DESSEIN :
 * ce n'est pas une régression, ne pas le retirer.
 */
describe('#1911.11 / #1955.2 — searchAgentChatThreads appelle la route serveur, pas le filtre local', () => {
  beforeEach(() => {
    apiFetchMock.mockReset().mockResolvedValue({ items: [] })
  })

  it('envoie `q` borné par `limit`, sur la route dédiée', async () => {
    await searchAgentChatThreads('PAYFIT')
    expect(apiFetchMock.mock.calls[0]?.[0]).toMatchObject({ path: '/ia/chat/threads/search?q=PAYFIT&limit=50' })
  })

  it('`archived: true` voyage dans la requête ; par défaut, la clé est omise', async () => {
    await searchAgentChatThreads('PAYFIT', true)
    expect(apiFetchMock.mock.calls[0]?.[0]).toMatchObject({
      path: '/ia/chat/threads/search?q=PAYFIT&limit=50&archived=true',
    })
    apiFetchMock.mockClear()
    await searchAgentChatThreads('PAYFIT', false)
    expect(apiFetchMock.mock.calls[0]?.[0]).toMatchObject({ path: '/ia/chat/threads/search?q=PAYFIT&limit=50' })
  })

  it('une requête vide ne part pas — le serveur la refuserait (`q` min. 1)', async () => {
    expect(await searchAgentChatThreads('   ')).toEqual([])
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('sait dire NON — une réponse illisible rend une liste vide, jamais `undefined`', async () => {
    apiFetchMock.mockResolvedValue(undefined as never)
    expect(await searchAgentChatThreads('PAYFIT')).toEqual([])
  })
})

/**
 * #1955.18 — l'export d'un fil déclare la langue de l'INTERFACE, même
 * dérivation que `laura-turn.ts` (#1958.8) : `i18n.language`, jamais un
 * second concept. Sert à choisir la locale de la DATE affichée dans le
 * document (.md/.pdf) — le format machine (.json) n'est pas concerné.
 */
describe('#1955.18 — exportAgentChatThread déclare la langue de l’interface', () => {
  afterEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('« fr » par défaut (le défaut du produit)', async () => {
    await i18n.changeLanguage('fr')
    await exportAgentChatThread({ conversationId: 'c-1', accountId: null }, 'md')
    const [path] = downloadDocumentMock.mock.calls[0] as [string, string]
    expect(path).toContain('interfaceLanguage=fr')
  })

  it('« en » quand l’interface est en anglais', async () => {
    await i18n.changeLanguage('en')
    await exportAgentChatThread({ conversationId: 'c-1', accountId: null }, 'md')
    const [path] = downloadDocumentMock.mock.calls[0] as [string, string]
    expect(path).toContain('interfaceLanguage=en')
  })

  it('sait dire NON : une langue non supportée retombe sur « fr », jamais un troisième canal deviné', async () => {
    await i18n.changeLanguage('de' as never)
    await exportAgentChatThread({ conversationId: 'c-1', accountId: null }, 'md')
    const [path] = downloadDocumentMock.mock.calls[0] as [string, string]
    expect(path).toContain('interfaceLanguage=fr')
  })

  it('ne casse pas le chemin existant — conversationId/accountId restent inchangés', async () => {
    await exportAgentChatThread({ conversationId: 'c-1', accountId: 'a-1' }, 'pdf')
    const [path] = downloadDocumentMock.mock.calls[0] as [string, string]
    expect(path).toContain('/ia/chat/threads/export.pdf')
    expect(path).toContain('conversationId=c-1')
    expect(path).toContain('accountId=a-1')
  })
})

describe('#1940.7 — assignPendingAction envoie le fil, le compte, le résumé et le collègue choisi', () => {
  it('poste sur /ia/chat/actions/assign avec le corps attendu', async () => {
    apiFetchMock.mockReset().mockResolvedValue({ assignedTo: 'u-alice' })
    const result = await assignPendingAction(
      { conversationId: 'c-1', accountId: 'a-1' },
      'Relancer SNCF sur le devis cybersécurité',
      'u-alice',
    )
    expect(apiFetchMock.mock.calls[0]?.[0]).toMatchObject({ path: '/ia/chat/actions/assign', method: 'POST' })
    expect(sentBody()).toEqual({
      conversationId: 'c-1',
      accountId: 'a-1',
      summary: 'Relancer SNCF sur le devis cybersécurité',
      assigneeUserId: 'u-alice',
    })
    expect(result).toEqual({ assignedTo: 'u-alice' })
  })
})

describe('#1944.20 — listAgentChatMessages porte `before`, le curseur de pagination', () => {
  beforeEach(() => {
    apiFetchMock.mockReset().mockResolvedValue({ messages: [] })
  })

  it('sans `before`, la requête ne porte pas la clé — comportement byte-identique à avant', async () => {
    await listAgentChatMessages({ accountId: null, conversationId: 'c-1' })
    const { path } = apiFetchMock.mock.calls[0]?.[0] as { path: string }
    expect(path).not.toContain('before=')
  })

  it('avec `before`, la requête porte la date de coupure en ISO', async () => {
    await listAgentChatMessages({ accountId: null, conversationId: 'c-1', before: new Date('2026-09-20T10:00:00Z') })
    const { path } = apiFetchMock.mock.calls[0]?.[0] as { path: string }
    expect(path).toContain(`before=${encodeURIComponent('2026-09-20T10:00:00.000Z')}`)
  })

  it('`before` et `version` sont deux clés DISTINCTES — jamais l’une à la place de l’autre', async () => {
    await listAgentChatMessages({
      accountId: null,
      conversationId: 'c-1',
      version: 3,
      before: new Date('2026-09-20T10:00:00Z'),
    })
    const { path } = apiFetchMock.mock.calls[0]?.[0] as { path: string }
    expect(path).toContain('version=3')
    expect(path).toContain('before=')
  })
})
