import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GARDE #2434.55/.56 — UNE COMMANDE VOCALE NE LANCE JAMAIS UNE ACTION
 * COÛTEUSE SANS L'ÉCRAN DE CONFIRMATION EXISTANT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le mode conversation (`useVoiceConversation.ts`, #2434.8/.9/.10/.12/.24/.30)
 * ENVOIE la question dictée — un geste qui, tapé, n'a jamais exécuté qu'une
 * action GRATUITE (une réponse de Laura). Toute action qui COÛTE (enrichir en
 * masse, écrire dans un CRM, dépenser des crédits) passe par une CARTE
 * (`PendingActions.tsx`) dont `confirm()` est le SEUL endroit qui appelle
 * l'endpoint réel, et que RIEN n'appelle automatiquement (garde GA-387,
 * `la-confirmation-dune-carte-est-un-geste-jamais-automatique.test.ts`).
 *
 * Ce que CETTE garde ajoute, spécifique à la voix : le nouveau code du mode
 * conversation (qui, lui, envoie automatiquement — contrairement à la dictée
 * simple, #1939.10) ne doit ni appeler l'exécuteur d'une carte directement, ni
 * emprunter un chemin d'envoi DIFFÉRENT de celui du bouton « Envoyer » manuel
 * — auquel cas les mêmes portes (le tour ordinaire, `laura-turn.ts`, la carte
 * de confirmation en aval) s'appliquent identiquement, dictée, conversation ou
 * clavier confondus.
 *
 * Elle prouve qu'elle LIT (corpus non vide) et sait dire NON (une source
 * fabriquée qui appellerait l'exécuteur directement la fait rougir).
 */

const WEB_SRC = join(__dirname, '..')
const VOICE_CONVERSATION_HOOK = join(WEB_SRC, 'features', 'chat', 'voice', 'useVoiceConversation.ts')
const VOICE_CONVERSATION_UI = join(WEB_SRC, 'features', 'chat', 'voice', 'VoiceConversation.tsx')
const CHAT_VIEW = join(WEB_SRC, 'features', 'chat', 'view', 'Chat.tsx')

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

/** Les commentaires se retirent AVANT lecture, comme les gardes voisines. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Les symboles qui EXÉCUTENT une action coûteuse — ceux que `confirm()`, et
 *  lui seul, appelle dans `PendingActions.tsx` (enrichissement, écriture CRM,
 *  génération de brouillon). Un mode vocal qui les appellerait CONTOURNERAIT
 *  la carte. */
const COST_EXECUTORS = ['contactsApi.enrich', 'generateDraft', 'assignPendingAction']

describe('#2434.55/.56 — la voix ne contourne jamais la confirmation coûteuse', () => {
  it('lit un corpus non vide — les trois fichiers existent', () => {
    expect(read(VOICE_CONVERSATION_HOOK).length).toBeGreaterThan(200)
    expect(read(VOICE_CONVERSATION_UI).length).toBeGreaterThan(200)
    expect(read(CHAT_VIEW).length).toBeGreaterThan(500)
  })

  it('le mode conversation n’appelle AUCUN exécuteur d’action coûteuse — seulement `onSend`', () => {
    const hook = stripComments(read(VOICE_CONVERSATION_HOOK))
    const ui = stripComments(read(VOICE_CONVERSATION_UI))
    for (const executor of COST_EXECUTORS) {
      expect(hook).not.toContain(executor)
      expect(ui).not.toContain(executor)
    }
    // Ni la carte de confirmation elle-même, ni son geste de confirmation :
    // le mode vocal ne les IMPORTE pas, ne les référence pas.
    expect(hook).not.toMatch(/PendingActions|confirmPendingChatAction/)
    expect(ui).not.toMatch(/PendingActions|confirmPendingChatAction/)
  })

  it('`<VoiceConversation>` reçoit le MÊME `onSend` que le bouton d’envoi manuel — pas un second chemin', () => {
    const chat = stripComments(read(CHAT_VIEW))
    // Le composer manuel (formulaire, bouton « Envoyer ») ET la conversation
    // vocale reçoivent la prop `onSend` — le même nom, porté par le même
    // paramètre de `Composer`, jamais un `onVoiceSend` séparé qui pourrait un
    // jour emprunter une route différente (une seule porte, un seul appelant
    // du tour, GA-26).
    expect(chat).toMatch(/<VoiceConversation[\s\S]{0,400}onSend=\{onSend\}/)
    expect(chat).toMatch(/onSend:\s*\(text\?:\s*string\)\s*=>\s*void/)
  })

  it('sait dire NON — un appel direct à un exécuteur coûteux, depuis le mode vocal, est vu', () => {
    const fakeHook = 'await contactsApi.enrich(contactId, payload) // court-circuite la carte'
    expect(fakeHook).toContain('contactsApi.enrich')
  })
})
