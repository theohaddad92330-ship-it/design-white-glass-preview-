/**
 * Ce que le plafond quotidien du copilote COMPTE — la dérivation, à UN endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉCISION
 * ─────────────────────────────────────────────────────────────────────────────
 * Louis, 30/08/2026 : **le plafond borne les DEMANDES, pas les allers-retours
 * que Laura provoque elle-même.** Depuis que Laura pose une question de
 * précision quand la demande est incomplète (`_BLOCK_ASK_FIRST`,
 * `bellum_advisor.py`), répondre à cette question consommait un message du
 * plafond : quelqu'un à qui elle ne demande jamais rien s'en trouvait
 * avantagé, et quelqu'un qu'elle interroge, puni. Sur une question toutes les
 * trois demandes, 50 messages ne valaient plus que ≈ 37 demandes utiles.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST EXONÉRÉ, ET CE QUI NE L'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Exonéré : le message qui RÉPOND à un tour que Laura a MARQUÉ elle-même
 * (`ask_clarification` → `context.clarification`). Le marquage vient de la
 * SOURCE, jamais d'une relecture du texte : « le message précédent de Laura
 * contenait un point d'interrogation » exonérerait tout — Laura finit
 * régulièrement par une proposition (« Tu veux analyser quelques comptes ? »,
 * `fr/laura.json`), qui n'est pas une question de précision.
 *
 * Non exonéré : tout le reste, **y compris la question de précision posée dans
 * le TEXTE de la réponse**. Elle n'est connue de personne d'autre que du
 * modèle qui l'écrit ; l'exonérer demanderait qu'il se déclare lui-même, et une
 * déclaration qui rend le message suivant gratuit est exactement la porte que
 * ce lot existe pour tenir fermée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX BORNES
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Un seul saut par fil** — tenu à l'écriture (`ChatMessagesService`), qui
 *     n'exonère qu'un message par conversation. C'est le jumeau serveur de la
 *     borne du modèle (« une clarification par conversation »,
 *     `chat_orchestrator.py`). Sans elle, un fil qui tourne en rond ne
 *     consommerait rien.
 *  2. **Une part du plafond, ici** — au-delà de {@link precisionHopCeiling},
 *     tout recompte. Une exonération reste un appel modèle facturé : la borner
 *     est ce qui empêche l'exception de manger la règle.
 */

import { SHIPPED_PLAN_CODES, SHIPPED_PLAN_GRID, type ChatQuotaLimitSource } from '@bellum/contracts'

/**
 * La fenêtre du plafond — GLISSANTE, jamais « depuis minuit » : un plafond qui
 * se réarme à minuit s'épuise d'un coup en fin de journée. Elle vit ici parce
 * que deux endroits la lisent — la comparaison (`assertChatQuota`) et la borne
 * d'un saut par fil (`ChatMessagesService`) — et que deux fenêtres différentes
 * feraient diverger le comptage de ce qu'il exonère.
 */
export const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000

// décision Louis 13/09 batch 13 — plafond selon le plan
/**
 * Le plafond de demandes d'un PLAN, lu dans la grille des plans
 * (`SHIPPED_PLAN_GRID.chatDailyMessageLimit`) — la valeur vit là, et seulement
 * là (GA-26).
 *
 * `null` quand le plan n'a pas de valeur LISIBLE : plan absent, code inconnu
 * (y compris les clés du prototype, `constructor`…), valeur non entière ou ≤ 0.
 * `null` n'est ni « zéro demande » ni « illimité » : c'est
 * {@link effectiveChatDailyLimit} qui retombe alors sur le plafond opérateur.
 */
export function chatDailyLimitOfPlan(plan: string | null | undefined): number | null {
  const code = SHIPPED_PLAN_CODES.find(candidate => candidate === plan)
  if (!code) return null
  const limit = SHIPPED_PLAN_GRID[code].chatDailyMessageLimit
  return Number.isInteger(limit) && limit > 0 ? limit : null
}

const GRID_CHAT_LIMITS = SHIPPED_PLAN_CODES.map(code => SHIPPED_PLAN_GRID[code].chatDailyMessageLimit)

/**
 * #4016 L7 — le plancher de repli quand NI le plan NI l'opérateur ne disent
 * rien : le plafond le plus BAS de la grille. Dérivé, jamais une variable de
 * plus (GA-26) — et jamais 0 ni l'illimité.
 */
export const CHAT_FALLBACK_DAILY_LIMIT = Math.min(...GRID_CHAT_LIMITS)

/** Le plafond le plus HAUT de la grille — aucun plan ne le dépasse. */
const CHAT_HIGHEST_PLAN_DAILY_LIMIT = Math.max(...GRID_CHAT_LIMITS)

/** Un plafond opérateur POSÉ (nombre fini) ; tout le reste = « pas posé ». */
function posedOperatorLimit(operatorLimit: number | null | undefined): number | null {
  return typeof operatorLimit === 'number' && Number.isFinite(operatorLimit) ? operatorLimit : null
}

/**
 * Le plafond EFFECTIF.
 *
 * Décision Louis 13/09 batch 13 (contre la recommandation) : le plafond dépend
 * du plan. Elle défait la règle d'avant, « un seul plafond pour tout le monde ».
 *
 * ⚠️ RENVERSEMENT DATÉ — #4016 L7, décision Louis 11/10/2026 : **le PLAN fait
 * foi.** Jusqu'au 11/10, `CHAT_DAILY_MESSAGE_LIMIT` avait un défaut (50) et le
 * plafond effectif était le MINIMUM des deux : Growth (100) restait bridé à 50
 * tant que personne ne relevait la variable sur l'hébergeur. La variable n'a
 * plus de défaut ; elle reste un plafond de SÉCURITÉ OPTIONNEL de l'opérateur.
 *
 *  · opérateur POSÉ à `0` (ou négatif) → `null` : l'interrupteur de
 *    l'opérateur désactive la borne ENTIÈRE, comme avant ;
 *  · opérateur NON posé (`null`, `undefined`, illisible) → le plafond du plan,
 *    source `plan` ; plan illisible → {@link CHAT_FALLBACK_DAILY_LIMIT}, source
 *    `operator` (l'écran ne prétend pas que c'est « ton plan ») — jamais 0,
 *    jamais l'illimité ;
 *  · opérateur posé → le plus bas des deux ; à égalité, le plan (source
 *    `plan`) ; plan illisible → le plafond opérateur.
 */
export function effectiveChatDailyLimit(args: {
  operatorLimit: number | null | undefined
  planLimit: number | null
}): { limit: number; source: ChatQuotaLimitSource } | null {
  const operatorLimit = posedOperatorLimit(args.operatorLimit)
  const { planLimit } = args
  if (operatorLimit !== null && operatorLimit <= 0) return null
  const planReadable = planLimit !== null && Number.isInteger(planLimit) && planLimit > 0
  if (operatorLimit === null) {
    return planReadable
      ? { limit: planLimit, source: 'plan' }
      : { limit: CHAT_FALLBACK_DAILY_LIMIT, source: 'operator' }
  }
  if (!planReadable) return { limit: operatorLimit, source: 'operator' }
  return planLimit <= operatorLimit
    ? { limit: planLimit, source: 'plan' }
    : { limit: operatorLimit, source: 'operator' }
}

/**
 * #4016 L7 — la borne des titres de fils rédigés par Laura (route écrite par le
 * navigateur, donc bornée). Elle suivait le plafond opérateur, qui avait un
 * défaut ; sans lui, elle prend le plafond le plus HAUT de la grille — aucune
 * personne ne peut légitimement titrer plus de fils qu'elle n'a de demandes.
 * `0` posé = aucune borne, comme le chat.
 */
export function chatTitleDailyCap(operatorLimit: number | null | undefined): number | null {
  const posed = posedOperatorLimit(operatorLimit)
  if (posed === null) return CHAT_HIGHEST_PLAN_DAILY_LIMIT
  return posed > 0 ? posed : null
}

/**
 * L'utilisateur est-il exempté du plafond par l'OPÉRATEUR
 * (`CHAT_QUOTA_EXEMPT_USER_IDS`, ids séparés par des virgules) ?
 *
 * Louis 29/09/2026 : la recette de Laura butait sur le plafond du plan. Le
 * plafond d'un plan est un tarif ; l'exemption, elle, nomme un compte précis
 * et ne s'active que sur l'hébergeur. Une valeur absente ou illisible
 * n'exempte PERSONNE — jamais l'inverse.
 */
export function isChatQuotaExempt(userId: string, raw: unknown): boolean {
  if (typeof raw !== 'string' || !userId) return false
  return raw
    .split(',')
    .map(id => id.trim())
    .some(id => id.length > 0 && id === userId)
}

/**
 * Une demande sur trois — la fréquence que Louis a mesurée sur la nouvelle
 * règle. Le plafond des sauts en découle : au-delà, ce n'est plus Laura qui
 * provoque l'aller-retour.
 */
export const PRECISION_HOP_DIVISOR = 3

/** Combien de sauts au plus sont exonérés sur la fenêtre, pour ce plafond. */
export function precisionHopCeiling(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return 0
  return Math.ceil(limit / PRECISION_HOP_DIVISOR)
}

/**
 * Le nombre de messages qui COMPTENT contre le plafond.
 *
 * ⚠️ Un comptage impossible n'est pas « zéro message consommé » : un `NaN` qui
 * traverserait cette fonction rouvrirait le plafond en grand. Il lève.
 */
export function countableMessages(args: { total: number; exempt: number; limit: number }): number {
  const { total, exempt, limit } = args
  if (!Number.isFinite(total)) {
    throw new Error(`Comptage du plafond illisible (total=${String(total)}) — un comptage impossible n'est pas zéro.`)
  }
  if (!Number.isFinite(exempt)) {
    throw new Error(`Comptage des sauts illisible (exempt=${String(exempt)}) — un comptage impossible n'est pas zéro.`)
  }
  const granted = Math.min(Math.max(exempt, 0), precisionHopCeiling(limit))
  return Math.max(total - granted, 0)
}

/**
 * #1957.8 — L'INSTANT où le plafond se rouvre, sur la fenêtre glissante réelle.
 *
 * Le refus disait « il se réouvre au fil des heures » : vrai, et inutilisable —
 * la personne ne savait pas si elle retrouvait Laura dans dix minutes ou le
 * lendemain. La fenêtre étant GLISSANTE, le plafond se rouvre à l'instant où
 * assez de demandes sortent des 24 h pour repasser SOUS la borne. Ce n'est pas
 * toujours « la plus ancienne + 24 h » :
 *  · au-delà du plafond (un ancien client écrivait aussi les demandes REFUSÉES),
 *    il en faut plusieurs ;
 *  · une réponse exonérée qui sort ne libère rien tant que les sauts restaient
 *    sous leur propre plafond — la soustraction passe donc par
 *    {@link countableMessages}, la même que la comparaison, jamais une seconde.
 *
 * `null` quand il n'y a pas d'instant à annoncer (pas au plafond, pas de borne)
 * ou qu'on ne peut pas le calculer honnêtement (horodatage illisible). Jamais
 * une heure devinée : l'écran dit alors « au fil des heures », sans chiffre.
 *
 * L'instant suppose qu'aucune nouvelle demande n'est acceptée d'ici là — ce qui
 * est vrai au plafond, puisque rien ne passe.
 */
export function quotaReopensAt(args: {
  stamps: ReadonlyArray<{ at: Date; exempt: boolean }>
  limit: number
  windowMs?: number
}): Date | null {
  const { stamps, limit } = args
  const windowMs = args.windowMs ?? QUOTA_WINDOW_MS
  if (!Number.isFinite(limit) || limit <= 0) return null
  if (stamps.some(stamp => !Number.isFinite(stamp.at.getTime()))) return null

  const ordered = [...stamps].sort((a, b) => a.at.getTime() - b.at.getTime())
  let total = ordered.length
  let exempt = ordered.filter(stamp => stamp.exempt).length
  if (countableMessages({ total, exempt, limit }) < limit) return null

  for (const stamp of ordered) {
    total -= 1
    if (stamp.exempt) exempt -= 1
    if (countableMessages({ total, exempt, limit }) < limit) return new Date(stamp.at.getTime() + windowMs)
  }
  return null
}

/**
 * #1957.5 — « il te reste peu de demandes » : la part CONSOMMÉE qui déclenche
 * l'annonce, en pourcents.
 *
 * 80 — la même règle que l'annonce « bientôt à court » des crédits (D5, Louis
 * 28/08 : « livrer l'annonce AVANT le mur » ; `DEFAULT_CREDIT_LOW_THRESHOLD_PERCENT`,
 * `credits.service.ts`). Reproduite ici plutôt qu'importée : le plafond de Laura
 * n'est pas un pot de crédits (réglé par `CREDIT_LOW_THRESHOLD_PERCENT`, qui ne
 * doit pas le déplacer), et `credits.service` vit dans un autre module (GA-07).
 * Sur le plafond par défaut (50), l'annonce tombe à 10 demandes restantes.
 *
 * Le web ne recalcule jamais ce seuil : il lit `low` dans `GET /ia/chat/quota`.
 */
const CHAT_QUOTA_LOW_THRESHOLD_PERCENT = 80

/**
 * Reste-t-il PEU de demandes ? Borne INCLUSIVE, comparée en pourcents entiers
 * (même piège flottant que `isCreditLow`). Un plafond sans borne ne déclenche
 * rien : « non mesuré » n'est pas « épuisé ».
 */
export function isChatQuotaLow(remaining: number, limit: number): boolean {
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(remaining)) return false
  return remaining * 100 <= limit * (100 - CHAT_QUOTA_LOW_THRESHOLD_PERCENT)
}

/**
 * Laura a-t-elle posé une QUESTION DE PRÉCISION à ce tour ?
 *
 * La lecture du marquage vit ici, à un seul endroit. Elle ne regarde qu'une
 * chose : `data.context.clarification`, que le service IA ne pose que lorsque
 * le modèle a appelé `ask_clarification` — l'outil qui ARRÊTE le tour, donc
 * celui où Laura ne peut pas à la fois répondre et demander.
 *
 * ⚠️ Ce qu'elle ne fait PAS, et ne doit jamais faire : lire `data.reply`. Un
 * point d'interrogation dans le texte n'est pas une question de précision —
 * « Tu veux que je prépare le message ? » en est un aussi, et l'exonération
 * couvrirait alors presque tous les messages.
 */
export function askedForPrecision(envelope: { success?: boolean; data?: Record<string, unknown> } | null): boolean {
  if (!envelope?.success) return false
  const context = envelope.data?.['context']
  if (!context || typeof context !== 'object') return false
  const clarification = (context as Record<string, unknown>)['clarification']
  if (!clarification || typeof clarification !== 'object') return false
  const question = (clarification as Record<string, unknown>)['question']
  return typeof question === 'string' && question.trim().length > 0
}
