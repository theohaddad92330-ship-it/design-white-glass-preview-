import { createContext, useContext, type ReactNode } from 'react'
import type { PendingChatAction } from '@bellum/contracts'
import { STARTUP_SEGMENT_AGE, STARTUP_SEGMENT_LEGAL_FORM } from '@/features/discover/lib/discover-query'
import { STARTUP_SEGMENT_HEADCOUNT } from '@/features/discover/lib/discover-size-bounds'

/**
 * #2472 — LE PASSAGE DU CHAT VERS DÉCOUVRIR N'ARRIVE JAMAIS NU.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RETOUR
 * ─────────────────────────────────────────────────────────────────────────────
 * « quand je clique sur découvrir la requete de decouvrir est pas préremplie »
 * (16/09/2026, depuis le SaaS, élément pointé : une bulle de réponse de Laura).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX CHEMINS MÈNENT À DÉCOUVRIR, UN SEUL EMPORTAIT LES CRITÈRES
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **La carte de proposition** (`PendingActions.tsx`) : le clic fait
 *     `navigate({ to: '/discover', search: discoverSearch(action) })`, le rail
 *     de Découvrir relit ces paramètres (`discover-prefill.ts`), pose
 *     « préparé par Laura » et lance la recherche. Ce chemin marchait.
 *  2. **Le lien écrit dans le TEXTE de la réponse** (`markdown.tsx`) : le prompt
 *     demande explicitement à Laura d'écrire `[Découvrir](/discover)` dès
 *     qu'elle nomme l'écran (« MONTRER LE CHEMIN », #1778,
 *     `apps/ia/app/prompts/bellum_advisor.py:767`). Ce lien partait NU — même
 *     bulle, mêmes critères affichés juste au-dessus, écran d'arrivée vide.
 *
 * C'est le défaut que le dépôt connaît bien : la capacité existe, elle est
 * juste, et un des chemins qui y mène ne l'appelle pas. Un raccourci qui perd
 * le contexte est pire que pas de raccourci — la personne vient de décrire
 * précisément ce qu'elle cherche et retrouve un écran vierge.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST BRANCHÉ ICI, ET CE QUI NE L'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La dérivation `critères → paramètres d'URL` vit désormais à UN endroit
 * (GA-26) : `discoverSearch`, appelée par les deux chemins. Elle vivait dans
 * `PendingActions.tsx` ; la recopier pour le lien du texte aurait donné deux
 * dérivations de la même chose, donc une divergence au premier critère ajouté.
 *
 * ⚠️ On n'INVENTE aucun critère. Les seuls qui voyagent sont ceux que Laura a
 * réellement composés avec son outil `find_accounts` — la proposition que la
 * personne a sous les yeux. Une réponse qui ne porte aucune proposition laisse
 * le lien tel quel : « - **[Découvrir](/discover)** : pour en trouver de
 * nouveaux », dans une liste d'écrans, est une mention légitime de l'écran, pas
 * un raccourci qui perd quelque chose. Et un lien que le modèle a lui-même
 * paramétré (`/discover?sectors=finance`) n'est pas réécrit : ce qu'il a écrit
 * est ce qu'il a annoncé.
 *
 * ⚠️ La route reste celle que `appRouteTarget` a validée (GA-277) : ce module
 * ne crée aucune destination, il ajoute des critères à une destination déjà
 * autorisée. Jamais de navigation vers une cible devinée.
 */

type FindAccounts = Extract<PendingChatAction, { action: 'find_accounts' }>

/** L'écran de prospection, tel que le routeur le déclare. */
export const DISCOVER_ROUTE = '/discover'

/**
 * Critères → paramètres d'URL lus par le rail de Découvrir (`discover-prefill`).
 *
 * L'UNIQUE dérivation : la carte de proposition et le lien du texte l'appellent
 * tous les deux (GA-26).
 */
export function discoverSearch(action: FindAccounts): Record<string, string> {
  const search: Record<string, string> = {}
  if (action.sectors?.length) search.sectors = action.sectors.join(',')
  if (action.signals?.length) search.signals = action.signals.join(',')
  if (action.department) search.department = action.department
  // #3876.5 — la commune que Laura a résolue part dans le champ « Ville » de
  // Découvrir, qui la borne à la commune : jamais remplacée par son département.
  if (action.city) search.city = action.city
  // #3392 (reste, recette prod 30/09) — « la carte Découvrir n'a pas le
  // filtre région AURA » : `discoverSearch` ignorait le champ `region` que
  // `find_accounts` sait désormais composer, donc le clic vers Découvrir
  // perdait la seule contrainte géographique large que Laura ait proposée.
  if (action.region?.length) search.region = action.region.join(',')
  if (action.headcount) search.headcount = action.headcount
  if (action.keywords) search.keywords = action.keywords
  // #2454.4/.5/.9 — le mode de contexte RÉSOLU du tour (`chat.py`,
  // `req.context_mode`, relayé par `chat_tools.py`) voyage comme les autres
  // critères. `contextModeFromSearch` (`discover-context-mode.ts`) lit la
  // MÊME clé `context` sur `?context=neutral` : un clic qui ouvre Découvrir
  // depuis Laura ne fait plus retomber la recherche sur le défaut d'espace.
  if (action.context_mode) search.context = action.context_mode
  // #3941.1 — le préréglage « Startup » de Découvrir s'écrit dans les TROIS
  // champs génériques que `discover-prefill.ts` lit déjà (`age`, `legalForm`,
  // `headcount`) : même préréglage que le chip du rail
  // (`discover-query.ts::applyStartupSegment`), jamais un quatrième champ.
  if (action.company_profile === 'startup') {
    search.age = STARTUP_SEGMENT_AGE
    search.legalForm = STARTUP_SEGMENT_LEGAL_FORM
    search.headcount = STARTUP_SEGMENT_HEADCOUNT.join(',')
  }
  // #2165.64 — marque l'ORIGINE conversation. `searchFromFilters`
  // (`discover-prefill.ts`) écrit les MÊMES clés (`sectors`, `department`…)
  // quand le commercial recharge SA PROPRE recherche déjà lancée — sans ce
  // marqueur, l'écran ne pourrait pas distinguer les deux et dirait « préparé
  // par Laura » sur une recherche qu'elle n'a jamais vue. Jamais posé sur une
  // proposition sans critère : un objet `{ laura: '1' }` tout seul ressemble
  // à un préremplissage et n'en est pas un.
  if (Object.keys(search).length > 0) search.laura = '1'
  return search
}

/**
 * Les critères que Laura vient de composer, ou `null` — jamais un objet vide.
 *
 * On lit à REBOURS : la proposition la plus récente est celle que la personne a
 * sous les yeux quand elle clique. Une proposition `find_accounts` dont tous les
 * critères ont été écartés (`chat_tools.py` refuse des mots-clés orphelins) ne
 * vaut pas mieux qu'une absence : elle rendrait `/discover?` — une requête vide
 * qui a l'air d'un préremplissage.
 */
export function discoverCriteriaOfReply(
  actions: readonly (PendingChatAction | null | undefined)[],
): Record<string, string> | null {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]
    if (!action || action.action !== 'find_accounts') continue
    const search = discoverSearch(action)
    if (Object.keys(search).length > 0) return search
  }
  return null
}

const DiscoverCriteriaContext = createContext<Readonly<Record<string, string>> | null>(null)

/**
 * Ce que la réponse a préparé, offert aux liens qu'elle contient.
 *
 * Un contexte plutôt qu'une prop : le lien naît au fond du moteur markdown,
 * sous les titres, les puces et le gras imbriqué — le faire descendre de main
 * en main aurait demandé de traverser sept composants dont aucun n'a de raison
 * de connaître Découvrir.
 */
export function DiscoverHandoff({
  criteria,
  children,
}: {
  criteria: Readonly<Record<string, string>> | null
  children: ReactNode
}) {
  return <DiscoverCriteriaContext.Provider value={criteria}>{children}</DiscoverCriteriaContext.Provider>
}

/** Les critères de la réponse courante, `null` hors d'une réponse. */
export function useDiscoverCriteria(): Readonly<Record<string, string>> | null {
  return useContext(DiscoverCriteriaContext)
}

/**
 * Le chemin FINAL d'un lien interne rendu dans une réponse — la cible validée
 * telle quelle, ou la même cible avec les critères de la réponse.
 *
 * Trois refus, et chacun est un témoin :
 *  - aucune proposition dans la réponse → rien à emporter ;
 *  - une cible qui n'est pas Découvrir → les autres écrans ne lisent pas ces
 *    paramètres, les y coller serait un filtre fantôme ;
 *  - un lien qui porte déjà sa requête ou son ancre → ce que le modèle a écrit
 *    est ce qu'il a annoncé, on ne le réécrit pas.
 *
 * ⚠️ UNE chaîne, et une seule, parce que l'ancre et le routeur doivent emporter
 * exactement la même chose : `href` la porte pour le cmd+clic, `navigate({ to })`
 * la reçoit pour le clic simple. Un `href` écrit à la main d'un côté et un objet
 * `search` de l'autre auraient été deux dérivations de la même chose — et c'est
 * un mot-clé à virgule ET espace qui les aurait séparées. L'aller-retour est
 * MESURÉ (16/09/2026) : `URLSearchParams` → routeur → `filtersFromSearch` rend
 * bien `headcount: '1000+'`, `department: '31'`, et les mots-clés avec leur
 * espace.
 */
export function discoverHandoffTarget(target: string, criteria: Readonly<Record<string, string>> | null): string {
  if (!criteria) return target
  if (target.includes('?') || target.includes('#')) return target
  const path = target.length > 1 && target.endsWith('/') ? target.slice(0, -1) : target
  if (path !== DISCOVER_ROUTE) return target
  return `${DISCOVER_ROUTE}?${new URLSearchParams(criteria).toString()}`
}
