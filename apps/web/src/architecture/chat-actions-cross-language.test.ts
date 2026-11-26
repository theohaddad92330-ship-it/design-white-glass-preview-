import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PENDING_CHAT_ACTION_TYPES } from '@bellum/contracts'

/**
 * GA — LES ACTIONS DU COPILOTE SONT LES MÊMES DES DEUX CÔTÉS DE LA FRONTIÈRE,
 * ET LEUR LISTE VIT À UN SEUL ENDROIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET CE QUE SON ABSENCE A COÛTÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `chat_tools.py` émet HUIT formes de proposition ; `PendingActions.tsx` n'en
 * connaissait SIX. Sur `open_screen` et `prepare_consultant_record`,
 * `ACTION_ICON[action.action]` rendait `undefined` et `<Icon />` faisait tomber
 * le rendu de la carte : un outil que le modèle a le droit d'appeler produisait
 * un écran cassé, en production, sans qu'un seul test rougisse.
 *
 * Aucune des deux suites ne pouvait le voir. Les tests Python vérifient que
 * l'outil rend la bonne charge utile ; les tests web montent les cartes qu'ils
 * connaissent. Le trou est PILE entre les deux — et c'est le motif que ce dépôt
 * nomme « porte unique dans un seul langage ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE NE DÉCOUPE PLUS DE CHAÎNE (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * Jusqu'au 16/09/2026 elle lisait les variantes en COUPANT le texte du `.tsx`
 * (`tsx.split('export type PendingChatAction =')[1]`). Une garde qui lit une
 * union en découpant une chaîne existe parce que la chose qu'elle garde est
 * DUPLIQUÉE : l'écran redéclarait à la main les treize variantes que
 * `packages/contracts/src/schemas/copilot-card.ts` dérive déjà de son
 * `z.discriminatedUnion`. Deux sources de vérité dans la même feature, et deux
 * chemins qui refont la même dérivation divergent : le 16/09/2026 les deux
 * listes coïncidaient encore CHAMP PAR CHAMP sur `main`, mais `prepare_campaign`
 * attendait sur une branche d'intégration avec son variant zod et SANS branche
 * dans l'union du `.tsx` — la divergence était déjà écrite, elle attendait un
 * merge. C'est une classe de défaut qu'on retire, pas un écart qu'on rattrape.
 *
 * La liste vient donc du CONTRAT (`PENDING_CHAT_ACTION_TYPES`, dérivée des
 * `options` du schéma zod, pas d'une seconde liste écrite à la main), et cette
 * garde vérifie EN PLUS que le `.tsx` ne remet pas une union à lui.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE SAIT PAS VOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Une action dont le nom serait construit côté Python (`f"{prefix}_screen"`) :
 * elle y lit des littéraux. C'est assumé — aucun des huit ne l'est, et une garde
 * qui tenterait de suivre une concaténation Python depuis TypeScript serait plus
 * fragile que ce qu'elle garde. Le filet d'exécution est ailleurs, dans
 * `PendingActions.tsx` lui-même : une action inconnue ne rend rien plutôt que de
 * casser l'écran.
 *
 * ⚠️ Côté web, rien ne VALIDE le JSON de l'IA à l'exécution : `pending_actions`
 * est relayé tel quel dans `Chat.tsx`. Le schéma zod est appliqué côté API
 * (`copilot-card.service.ts`) ; ici il ne sert que de source de vérité de TYPE.
 * Cette garde reste donc l'endroit où l'écart de NOMS se voit avant un client.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const CHAT_TOOLS = join(REPO_ROOT, 'apps', 'ia', 'app', 'services', 'chat_tools.py')
const PENDING_ACTIONS = join(REPO_ROOT, 'apps', 'web', 'src', 'features', 'chat', 'view', 'PendingActions.tsx')

/** Les `"action": "…"` littéraux du service IA — la liste QUI ÉMET. */
function emittedActions(python: string): string[] {
  // `matchAll`, jamais un `RegExp.test()` réutilisé : le drapeau `g` est
  // STATEFUL, et ce piège a déjà rendu une garde de ce dépôt aveugle une ligne
  // sur deux.
  const found = [...python.matchAll(/"action":\s*"([a-z_]+)"/g)].map(m => m[1])
  return [...new Set(found)].sort()
}

/**
 * Les variantes du CONTRAT — la liste QUI SAIT ÊTRE RENDUE. Elle est dérivée des
 * `options` du `z.discriminatedUnion`, donc une variante ajoutée au schéma y est
 * sans qu'on ait rien à recopier ici.
 */
function renderedActions(): string[] {
  return [...new Set(PENDING_CHAT_ACTION_TYPES)].sort()
}

/** La table d'icônes du `.tsx`, extraite par équilibrage d'accolades. */
function actionIconTable(tsx: string): string {
  const after = tsx.split('const ACTION_ICON')[1] ?? ''
  const start = after.indexOf('{')
  if (start < 0) return ''
  let depth = 0
  for (let i = start; i < after.length; i += 1) {
    if (after[i] === '{') depth += 1
    else if (after[i] === '}') {
      depth -= 1
      if (depth === 0) return after.slice(start + 1, i)
    }
  }
  return ''
}

describe('les actions du copilote existent des deux côtés, et leur liste vit à un seul endroit', () => {
  const python = readFileSync(CHAT_TOOLS, 'utf8')
  const tsx = readFileSync(PENDING_ACTIONS, 'utf8')

  it('LIT quelque chose — les trois corpus, et ils sont bien ceux qu’on croit', () => {
    // Sans ce témoin, un fichier déplacé ou un baril réexporté à vide rendrait la
    // garde verte en comparant deux listes vides — et c'est exactement le défaut
    // qu'elle traque.
    expect(python.length).toBeGreaterThan(10_000)
    expect(tsx).toContain('const ACTION_ICON')
    expect(emittedActions(python).length).toBeGreaterThanOrEqual(8)
    expect(renderedActions().length).toBeGreaterThanOrEqual(13)
    expect(actionIconTable(tsx).length).toBeGreaterThan(100)
  })

  it('la liste vit à UN seul endroit — l’écran ne redéclare pas l’union (GA-26)', () => {
    // Le défaut retiré le 16/09/2026 : treize variantes écrites à la main dans le
    // `.tsx` en face des treize du contrat, sans rien pour tenir les deux listes
    // ensemble. Un type dérivé d'un schéma validé bat un type déclaré ; la
    // seconde copie ne revient pas.
    expect(tsx).not.toContain('export type PendingChatAction =')
    expect(tsx).toContain("from '@bellum/contracts'")
  })

  it('toute action ÉMISE par le service IA sait être RENDUE par le web', () => {
    const emitted = emittedActions(python)
    const rendered = renderedActions()
    const orphelines = emitted.filter(name => !rendered.includes(name))

    expect(`actions émises que le web ne sait pas rendre → ${orphelines.join(', ')}`).toBe(
      'actions émises que le web ne sait pas rendre → ',
    )
  })

  it('chaque action du contrat a une icône — c’est l’accès manquant qui cassait la carte', () => {
    const table = actionIconTable(tsx)
    for (const name of renderedActions()) {
      expect(`${name} dans ACTION_ICON : ${table.includes(`${name}:`)}`).toBe(`${name} dans ACTION_ICON : true`)
    }
  })

  it('sait dire NON — une action émise et non rendue est REPROCHÉE', () => {
    const fauxPython = '{"action": "burn_the_crm", "cost_credits": 0}'
    expect(emittedActions(fauxPython)).toEqual(['burn_the_crm'])
    expect(renderedActions()).not.toContain('burn_the_crm')
    // Et le reproche est bien FORMULÉ : la liste des orphelines n'est pas vide.
    const orphelines = emittedActions(fauxPython).filter(name => !renderedActions().includes(name))
    expect(orphelines).toEqual(['burn_the_crm'])
  })

  it('sait dire NON — une union redéclarée dans l’écran est REPROCHÉE', () => {
    const fauxTsx = `${tsx}\nexport type PendingChatAction = { action: 'burn_the_crm' }\n`
    expect(fauxTsx).toContain('export type PendingChatAction =')
  })

  it('n’attrape pas ce qu’elle ne vise pas — le web PEUT connaître plus que l’IA n’émet', () => {
    // Le témoin du cas légitime voisin : le sens de la garde est à SENS UNIQUE.
    // Une variante gardée côté web pour des réponses anciennes ne doit pas la
    // faire rougir — sinon elle pousserait à retirer un repli qui protège.
    const rendered = renderedActions()
    const emitted = emittedActions(python)
    expect(rendered.every(name => emitted.includes(name)) || rendered.length > emitted.length).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas — un IMPORT de type n’est pas une redéclaration', () => {
    // Le témoin de l'autre côté : la garde GA-26 vise `export type … =`, pas la
    // ligne qui LIT le contrat. Sans ce témoin, la cible même du refactor
    // (importer le type) ferait rougir la garde qui l'exige.
    const legitime = "import type { PendingChatAction } from '@bellum/contracts'"
    expect(legitime).not.toContain('export type PendingChatAction =')
  })
})
