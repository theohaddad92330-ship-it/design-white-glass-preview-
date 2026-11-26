import { describe, expect, it } from 'vitest'
import fr from '@/i18n/locales/fr/chat.json'
import en from '@/i18n/locales/en/chat.json'
import type { AgentChatHistoryItem } from '@/features/chat/api/agentChatApi'
import { threadStatusLabelKey, threadStatusOf, type ThreadStatus } from './thread-status'

/**
 * #1911.5 — LE STATUT DÉCRIT LE FIL (décision de Louis du 16/09/2026).
 *
 * Ce fichier sait dire NON de trois façons :
 *  1. remplacer la lecture de `last_message_role` par une déduction de date
 *     (`last_message_at`) fait rougir « une date ne dit pas QUI a parlé » ;
 *  2. rendre `'awaiting'` au lieu de `null` quand le rôle est inconnu fait
 *     rougir « un rôle inconnu n'affiche AUCUN statut » ;
 *  3. il LIT un corpus non vide : les libellés FR et EN sont relus dans les
 *     fichiers de traduction, donc un statut ajouté sans son libellé — ou un
 *     libellé ajouté dans une seule langue — fait rougir.
 */

const thread = (over: Partial<AgentChatHistoryItem> = {}): AgentChatHistoryItem => ({
  id: 'row-1',
  account_id: null,
  conversation_id: 'conv-1',
  title: 'Stellantis — cadrage',
  created_at: '2026-09-16T09:00:00Z',
  ...over,
})

const ALL_STATUSES: ThreadStatus[] = ['awaiting', 'answered', 'closed', 'unknown']

describe('threadStatusOf — le statut se dérive du RÔLE, jamais d’une date', () => {
  it('j’ai écrit, Laura n’a pas encore répondu → « en attente »', () => {
    expect(threadStatusOf(thread({ last_message_role: 'user' }), { archived: false })).toBe('awaiting')
  })

  it('Laura a répondu → « reçu »', () => {
    expect(threadStatusOf(thread({ last_message_role: 'assistant' }), { archived: false })).toBe('answered')
  })

  it('un fil RANGÉ est « terminé » — un geste posé, pas une inactivité devinée', () => {
    // Le rôle du dernier message ne change rien : ranger est plus récent que
    // tout ce que le fil contient.
    expect(threadStatusOf(thread({ last_message_role: 'user' }), { archived: true })).toBe('closed')
    expect(threadStatusOf(thread({ last_message_role: 'assistant' }), { archived: true })).toBe('closed')
  })

  it('rôle INCONNU → aucun statut, jamais « en attente » par défaut', () => {
    // Une API antérieure au champ, ou une lecture du rôle en échec. Dire « en
    // attente » ici affirmerait qu'on doit une réponse sans le savoir.
    expect(threadStatusOf(thread(), { archived: false })).toBeNull()
    expect(threadStatusOf(thread({ last_message_role: null }), { archived: false })).toBeNull()
  })

  it('une DATE ne produit aucun statut — c’est exactement ce qui manquait avant ce point', () => {
    // Le témoin : deux fils à la même date, l'un sans rôle. Si la dérivation
    // retombait sur `last_message_at`, celui-ci porterait un statut.
    const sansRole = thread({ last_message_at: '2026-09-16T10:00:00Z' })
    const avecRole = thread({ last_message_at: '2026-09-16T10:00:00Z', last_message_role: 'assistant' })
    expect(threadStatusOf(sansRole, { archived: false })).toBeNull()
    expect(threadStatusOf(avecRole, { archived: false })).toBe('answered')
  })
})

describe('threadStatusOf — #4462.2 un fil sans réponse depuis longtemps est « inconnu », jamais « en attente » à l’infini', () => {
  const sentAt = '2026-10-23T10:00:00Z'
  const at = (minutes: number) => Date.parse(sentAt) + minutes * 60_000

  it('quelques secondes après ma question : « en attente »', () => {
    const t = thread({ last_message_role: 'user', last_message_at: sentAt })
    expect(threadStatusOf(t, { archived: false, now: at(1) })).toBe('awaiting')
  })

  it('50 minutes plus tard, sans réponse : « inconnu » (statut nommé)', () => {
    const t = thread({ last_message_role: 'user', last_message_at: sentAt })
    expect(threadStatusOf(t, { archived: false, now: at(50) })).toBe('unknown')
  })

  it('une réponse de Laura reste « reçu » quel que soit l’âge', () => {
    const t = thread({ last_message_role: 'assistant', last_message_at: sentAt })
    expect(threadStatusOf(t, { archived: false, now: at(500) })).toBe('answered')
  })
})

describe('threadStatusOf — les libellés existent DANS LES DEUX LANGUES', () => {
  const read = (bundle: typeof fr, key: string): unknown =>
    key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle)

  it('le corpus relu n’est pas vide', () => {
    // Sans cette ligne, un `chat.json` vidé rendrait les cas ci-dessous verts
    // en ne lisant rien du tout.
    expect(ALL_STATUSES).toHaveLength(4)
    expect(Object.keys((fr.sidebarThreads as Record<string, unknown>).status as object).length).toBeGreaterThan(0)
  })

  it.each(ALL_STATUSES)('« %s » a son libellé et sa description en FR et en EN', status => {
    const key = threadStatusLabelKey(status)
    for (const bundle of [fr, en]) {
      expect(typeof read(bundle, key)).toBe('string')
      expect(read(bundle, key)).not.toBe('')
      expect(typeof read(bundle, `${key}Label`)).toBe('string')
    }
    // Un libellé monolingue n'est pas livré : FR et EN doivent DIFFÉRER pour au
    // moins un des trois, sinon la traduction a été recopiée.
    expect(read(fr, key)).toBeTruthy()
    expect(read(en, key)).toBeTruthy()
  })

  it('FR et EN ne sont pas la même chaîne recopiée', () => {
    const differ = ALL_STATUSES.filter(s => read(fr, threadStatusLabelKey(s)) !== read(en, threadStatusLabelKey(s)))
    expect(differ.length).toBe(ALL_STATUSES.length)
  })
})
