/**
 * ⚠️ ANTÉRIORITÉ — #1955.2 (déjà en production) revient sur #1911.11, délibérément.
 *
 * Les deux lots ont écrit la MÊME fusion, chacun de son côté : #1911.11 ici dans
 * `mergeSearchResults`, #1955.2 en ligne dans `ConversationsPanel`. L'intégration
 * n'en garde qu'une (GA-26), et c'est celle de #1955.2 qui l'emporte sur deux
 * points, contre ce que ce fichier affirmait avant :
 *
 *   1. l'ordre n'est plus un tri global par récence, mais LOCAL D'ABORD puis le
 *      serveur — un tri global insère des lignes au milieu quand la réponse
 *      réseau arrive, et la liste se réordonne sous le doigt ;
 *   2. la clé de déduplication n'est plus `id` mais `conversation_id ?? id` —
 *      plusieurs lignes portent le même `conversation_id`, et dédupliquer par
 *      ligne affichait deux fois la même conversation.
 *
 * Les deux tests d'ordre ci-dessous ont donc basculé À DESSEIN. Ce n'est pas une
 * régression : ne pas les « réparer » vers le tri par date.
 */
import { describe, expect, it } from 'vitest'
import type { AgentChatHistoryItem } from '@/features/chat/api/agentChatApi'
import { dedupeThreads, filterThreads, mergeSearchResults, newConversationId } from './conversation'

const thread = (over: Partial<AgentChatHistoryItem> = {}): AgentChatHistoryItem => ({
  id: 'row-1',
  account_id: null,
  // Chaque fixture qui change d'`id` change AUSSI de `conversation_id` : la
  // déduplication porte sur le fil, pas sur la ligne (voir `mergeSearchResults`).
  conversation_id: 'conv-1',
  title: 'Stellantis — cadrage',
  created_at: '2026-08-20T09:00:00Z',
  ...over,
})

describe('filterThreads', () => {
  it('ignore la casse ET les accents', () => {
    // « rele » doit trouver « Relances » : un commercial tape sans accent.
    const threads = [thread({ title: 'Relances de la semaine' }), thread({ title: 'Vivier Java' })]
    expect(filterThreads(threads, 'RELE')).toHaveLength(0)
    expect(filterThreads(threads, 'relances')).toHaveLength(1)
    expect(filterThreads([thread({ title: 'Résumé' })], 'resume')).toHaveLength(1)
  })

  it('rend tout sur une recherche vide, et une COPIE', () => {
    const threads = [thread()]
    const all = filterThreads(threads, '   ')
    expect(all).toEqual(threads)
    expect(all).not.toBe(threads)
  })

  it('ne tombe pas sur un fil sans titre', () => {
    expect(filterThreads([thread({ title: null as never })], 'x')).toHaveLength(0)
  })

  /**
   * #1911.11 — LA RECHERCHE VOIT CE QUE LA LISTE MONTRE.
   *
   * Le panneau affiche le nom du compte d'un fil (#1911.10, `accountNameOf`) et
   * le prénom de qui l'a ouvert (#1911.4) — et il les GROUPE même par compte
   * (#1911.7). Chercher « PAYFIT » ne rendait pourtant rien sur un fil intitulé
   * « Relance après le webinar », alors que le mot est à l'écran, deux lignes
   * plus bas. Une recherche qui ne voit pas ce qui est affiché se lit comme
   * « ce fil n'existe pas » : c'est la même règle que la modale de portée,
   * « cherche sur l'intitulé ET son compte ».
   */
  it('cherche aussi sur le NOM DU COMPTE, que la liste affiche déjà', () => {
    const threads = [
      thread({ title: 'Relance après le webinar', account_name: 'PAYFIT' }),
      thread({ title: 'Vivier Java' }),
    ]
    expect(filterThreads(threads, 'payfit').map(item => item.title)).toEqual(['Relance après le webinar'])
    // Sans accents non plus, comme partout ailleurs.
    expect(filterThreads([thread({ title: 'Cadrage', account_name: 'LATÉCOÈRE' })], 'latecoere')).toHaveLength(1)
  })

  it('cherche aussi sur le PRÉNOM de qui a ouvert le fil, que la liste affiche déjà', () => {
    const threads = [
      thread({ title: 'Cadrage', author: { firstName: 'Sarah', avatarUrl: null } }),
      thread({ title: 'Vivier Java' }),
    ]
    expect(filterThreads(threads, 'sarah').map(item => item.title)).toEqual(['Cadrage'])
  })

  it('sait dire NON — un champ que la liste n’affiche PAS ne se cherche pas', () => {
    // L'identifiant technique est dans la charge utile et n'est nulle part à
    // l'écran : le rendre cherchable ferait « trouver » un fil sur une chaîne
    // que personne ne peut lire, donc sur un hasard.
    expect(filterThreads([thread({ id: 'row-42', conversation_id: 'conv-42' })], 'row-42')).toHaveLength(0)
    expect(filterThreads([thread({ id: 'row-42', conversation_id: 'conv-42' })], 'conv-42')).toHaveLength(0)
  })
})

/**
 * #1911.11 — la fusion du filtre INSTANTANÉ (page chargée) et de la recherche
 * SERVEUR (tout l'historique). Voir `ConversationsPanel.test.tsx` pour le
 * geste écran complet ; ces tests couvrent la dérivation seule.
 */
describe('mergeSearchResults', () => {
  it('ajoute les fils que seul le serveur connaît, sans retirer ceux du filtre local', () => {
    const local = [thread({ id: 'local-1', conversation_id: 'conv-local', title: 'Sujet local' })]
    const remote = [
      thread({ id: 'remote-1', conversation_id: 'conv-remote', title: 'PAYFIT — relance après le webinar' }),
    ]
    const merged = mergeSearchResults(local, remote)
    expect(merged.map(item => item.id).sort()).toEqual(['local-1', 'remote-1'])
  })

  it('sait dire NON — un fil trouvé par les deux ne compte qu’une fois', () => {
    const same = thread({ id: 'row-1', title: 'Cadrage' })
    const merged = mergeSearchResults([same], [same])
    expect(merged).toHaveLength(1)
  })

  it('un résultat local survit à un serveur qui ne le renvoie pas (échec, ou pas encore répondu)', () => {
    const local = [thread({ id: 'local-1' })]
    expect(mergeSearchResults(local, [])).toEqual(local)
  })

  it('garde le local d’abord, le serveur ensuite — même quand le serveur est plus récent', () => {
    const older = thread({ id: 'a', conversation_id: 'conv-a', last_message_at: '2026-08-01T00:00:00Z' })
    const newer = thread({ id: 'b', conversation_id: 'conv-b', last_message_at: '2026-09-10T00:00:00Z' })
    expect(mergeSearchResults([older], [newer]).map(item => item.id)).toEqual(['a', 'b'])
  })

  it('un fil sans date connue ne bouge pas de place — rien ne se réordonne', () => {
    const dated = thread({ id: 'dated', conversation_id: 'conv-dated', last_message_at: '2026-09-10T00:00:00Z' })
    const undated = thread({
      id: 'undated',
      conversation_id: 'conv-undated',
      last_message_at: undefined,
      created_at: undefined as never,
    })
    expect(mergeSearchResults([dated], [undated]).map(item => item.id)).toEqual(['dated', 'undated'])
  })

  it('sait dire NON — deux lignes du MÊME fil ne s’affichent pas deux fois', () => {
    const fromHistory = thread({ id: 'row-1', conversation_id: 'conv-1' })
    const fromServer = thread({ id: 'row-9', conversation_id: 'conv-1' })
    expect(mergeSearchResults([fromHistory], [fromServer]).map(item => item.id)).toEqual(['row-1'])
  })
})

/**
 * #3367 — recette du 30/09 : « la liste des fils affiche des doublons — même
 * fil en "En attente" (`href /chat`, sans `conversation_id`) et en "Reçu"
 * (`href ?conversationId=`) — visible sur tous les fils du jour. »
 */
describe('dedupeThreads', () => {
  it('efface la ligne SANS conversation_id quand une autre, même titre et même compte, en porte une', () => {
    const pending = thread({ id: 'row-pending', conversation_id: null as never, title: 'Prépare un message' })
    const received = thread({ id: 'row-received', conversation_id: 'conv-9', title: 'Prépare un message' })
    expect(dedupeThreads([pending, received])).toEqual([received])
  })

  it('ne fusionne pas deux comptes différents portant le même titre', () => {
    const pending = thread({ id: 'row-pending', conversation_id: null as never, account_id: 'acc-1', title: 'Cadrage' })
    const received = thread({ id: 'row-received', conversation_id: 'conv-9', account_id: 'acc-2', title: 'Cadrage' })
    expect(dedupeThreads([pending, received])).toEqual([pending, received])
  })

  it('garde un fil ANCIEN sans conversation_id quand aucun autre ne partage son titre', () => {
    const legacy = thread({ id: 'row-legacy', conversation_id: null as never, title: 'Fil d’avant' })
    expect(dedupeThreads([legacy])).toEqual([legacy])
  })

  /**
   * #3367.1 — recette du 30/09 : « la liste GARDE dix lignes "En attente" sans
   * conversationId que la déduplication ne couvre pas. » Deux tentatives de LA
   * MÊME question, ni l'une ni l'autre jamais promue à un `conversation_id`
   * réel, ne tombaient sous AUCUNE des deux branches déjà couvertes ci-dessus
   * (aucune des deux « porte » un `conversation_id »).
   */
  it('efface la tentative la plus ANCIENNE quand deux lignes, ni l’une ni l’autre, ne portent de conversation_id', () => {
    const older = thread({ id: 'row-older', conversation_id: null as never, title: 'Identifier 10 cibles cyber' })
    const newer = thread({ id: 'row-newer', conversation_id: null as never, title: 'Identifier 10 cibles cyber' })
    expect(dedupeThreads([newer, older])).toEqual([newer])
  })

  it('ne fusionne pas deux comptes différents quand ni l’une ni l’autre ligne ne porte de conversation_id', () => {
    const first = thread({ id: 'row-1', conversation_id: null as never, account_id: 'acc-1', title: 'Cadrage' })
    const second = thread({ id: 'row-2', conversation_id: null as never, account_id: 'acc-2', title: 'Cadrage' })
    expect(dedupeThreads([first, second])).toEqual([first, second])
  })

  it('une ligne sans conversation_id promue ailleurs disparaît AVANT même de comparer les autres orphelines', () => {
    const promoted = thread({ id: 'row-pending', conversation_id: null as never, title: 'Prépare un message' })
    const received = thread({ id: 'row-received', conversation_id: 'conv-9', title: 'Prépare un message' })
    const otherOrphan = thread({ id: 'row-other', conversation_id: null as never, title: 'Prépare un message' })
    expect(dedupeThreads([promoted, received, otherOrphan])).toEqual([received])
  })
})

describe('newConversationId', () => {
  it('ne rend jamais deux fois la même valeur', () => {
    expect(new Set([newConversationId(), newConversationId(), newConversationId()]).size).toBe(3)
  })
})
