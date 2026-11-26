import { z } from 'zod'

/**
 * #2450.1 (reste partiel, épopée #2882) — LE MODE DE RECHERCHE D'UN TOUR DE
 * CHAT, tel qu'une PERSONNE le choisit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE C'EST, ET CE QUE CE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Un mode de recherche dit QUELLE PROFONDEUR le tour doit atteindre —
 * aujourd'hui, le seul levier réel est le PALIER DE MODÈLE (`chat_model_routing.py`,
 * `MODE_TIER`), forcé par `rapide`/`verifie`/`approfondi` et laissé à
 * l'heuristique habituelle par `auto`. La policy à 14 paramètres (budget,
 * outils, arrêt, evidence graph…) que #2450.2-.10 décrivent RESTE hors de ce
 * lot — voir l'épopée #2882 pour la raison (système à concevoir, pas à
 * deviner).
 *
 * Ce n'est PAS `LauraContextMode` (`laura-context-mode.ts`, #2453) : celui-là
 * dit QUELLES COUCHES personnelles/commerciales entrent dans le raisonnement,
 * jamais QUELLE PROFONDEUR de recherche. Les deux se combinent, comme
 * `LauraContextMode` et `ChatScope` déjà.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ LA RÈGLE S'APPLIQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Au service IA (`apps/ia/app/services/chat_model_routing.py::choose_chat_tier`),
 * via `ChatTierContext.requested_mode`. Miroir Python : `RequestedMode`
 * (même fichier) — même ordre, mêmes quatre valeurs.
 */
export const CHAT_RESEARCH_MODES = ['auto', 'rapide', 'verifie', 'approfondi'] as const
export type ChatResearchMode = (typeof CHAT_RESEARCH_MODES)[number]

/** « Auto » par défaut : c'est le comportement d'avant ce champ — l'heuristique
 *  habituelle décide, jamais un mode forcé en silence. */
export const DEFAULT_CHAT_RESEARCH_MODE: ChatResearchMode = 'auto'

export const chatResearchModeSchema = z.enum(CHAT_RESEARCH_MODES)

/**
 * #2450.1/.2/.9 (épopée #2882) — la POLITIQUE de chaque mode, telle que le
 * service IA l'applique (`CHAT_MODE_POLICIES`, `chat_model_routing.py`). Ne
 * porte QUE des faits réels (jamais un budget ou un arrêt non calculé) ; la
 * parité avec le module Python est tenue par `chat-research-mode.parity.test.ts`.
 *
 * - `tier` : `auto` = rien n'est forcé, l'heuristique décide ; sinon le palier forcé.
 * - `publicSearch` : `auto` = selon le tour, `excluded` = retirée du catalogue,
 *   `allowed` = permise.
 * - `proposesUpgrade` : le mode propose le passage au-dessus quand il ne peut
 *   garantir l'actualité (jamais un coût engagé en silence).
 *
 * Le modèle et le fournisseur n'y figurent JAMAIS (doctrine) : `tier` nomme une
 * profondeur, pas un modèle.
 */
export type ChatModePolicyFacts = {
  tier: 'auto' | 'fast' | 'deep'
  publicSearch: 'auto' | 'excluded' | 'allowed'
  proposesUpgrade: boolean
}

export const CHAT_MODE_POLICY_FACTS: Record<ChatResearchMode, ChatModePolicyFacts> = {
  auto: { tier: 'auto', publicSearch: 'auto', proposesUpgrade: false },
  rapide: { tier: 'fast', publicSearch: 'excluded', proposesUpgrade: true },
  verifie: { tier: 'deep', publicSearch: 'allowed', proposesUpgrade: false },
  approfondi: { tier: 'deep', publicSearch: 'allowed', proposesUpgrade: false },
}
