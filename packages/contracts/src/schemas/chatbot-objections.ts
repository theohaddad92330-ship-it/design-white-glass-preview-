/**
 * La bibliothèque d'objections VIVANTE — « Bibliothèque des objections enrichie
 * chaque semaine à partir des vraies conversations » (§11, P1 du rapport du
 * 17/08/2026) et « Top 20 objections/questions non couvertes » (§9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI NE VOYAGE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * **La phrase du visiteur ne quitte jamais le tour de conversation.** Ni vers un
 * humain, ni vers un stockage, ni vers un tableau de bord. Ce qui remonte est un
 * THÈME — un mot d'un vocabulaire fermé, décidé côté serveur sur le message
 * qu'on avait déjà sous la main, et qui ne désigne personne. « Trente personnes
 * ont posé une question de souveraineté cette semaine » se lit très bien sans
 * les trente phrases, et c'est précisément l'information dont on a besoin pour
 * écrire l'entrée manquante.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI NE S'ÉCRIT PAS TOUT SEUL
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce module **PROPOSE**. Il n'ajoute rien. C'est la même règle que « on propose
 * une fusion de doublons, on ne fusionne jamais » : une entrée de la
 * bibliothèque part dans le prompt de Laura, donc dans ce que le produit dit à
 * des prospects. Ça se relit, ça se signe, et ça se marie mal avec un
 * automatisme du dimanche soir.
 *
 * La garantie n'est pas une convention : il n'existe dans ce fichier aucune
 * fonction qui prenne la bibliothèque et en rende une version modifiée. Le test
 * `chatbot-objections.test.ts` balaie les exports pour que ça reste vrai.
 */

/**
 * Le vocabulaire fermé des thèmes d'objection.
 *
 * Fermé, parce qu'une chaîne libre produirait cent variantes du même thème en
 * trois semaines et un « top 20 » qui ne compte rien. Les onze premiers
 * recouvrent les 22 objections déjà écrites ; `other` existe pour ne pas ranger
 * de force — un thème inconnu rangé sous un thème connu est une donnée fausse,
 * un thème inconnu rangé sous `other` est une question à se poser.
 */
export const CHATBOT_OBJECTION_THEMES = [
  'price',
  'competitor',
  'trust_ai',
  'data_privacy',
  'fit_size',
  'integration',
  'adoption',
  'timing',
  'proof',
  'legal',
  'sovereignty',
  'support',
  'other',
] as const

export type ChatbotObjectionTheme = (typeof CHATBOT_OBJECTION_THEMES)[number]

/** Ce que la mesure a vu sur la fenêtre. `null` = non mesuré, jamais zéro. */
export type ChatbotObjectionGap = {
  theme: ChatbotObjectionTheme
  occurrences: number | null
}

/**
 * Combien de fois un thème doit revenir avant d'être proposé.
 *
 * Cinq sur une semaine : au-dessous, c'est une personne qui a insisté, pas un
 * angle mort de la bibliothèque. Le seuil est rendu avec les propositions pour
 * qu'il se discute plutôt que de se subir.
 */
export const OBJECTION_PROPOSAL_MIN_OCCURRENCES = 5

/** Le §9 demande un « top 20 ». Au-delà, une liste ne se relit plus. */
export const OBJECTION_PROPOSAL_LIMIT = 20

export type ChatbotObjectionProposal = {
  theme: ChatbotObjectionTheme
  occurrences: number
  /** Toujours `proposed`. Il n'existe aucun chemin qui produise autre chose. */
  status: 'proposed'
}

export type ChatbotObjectionProposalInput = {
  gaps: readonly ChatbotObjectionGap[]
  /** Les thèmes que la bibliothèque couvre DÉJÀ. */
  covered: readonly ChatbotObjectionTheme[]
  limit?: number
}

/**
 * Les thèmes qui méritent qu'un humain écrive une entrée.
 *
 * Rend une liste triée par fréquence décroissante. Un thème non mesuré est
 * ÉCARTÉ (et non compté zéro) : « on n'a pas mesuré ce thème » ne veut pas dire
 * « personne ne l'a soulevé », et un thème absent du classement pour cause de
 * mesure absente ne doit pas se lire comme un thème rare.
 */
export function proposeObjectionEntries(input: ChatbotObjectionProposalInput): ChatbotObjectionProposal[] {
  const covered = new Set<string>(input.covered)
  const limit = input.limit ?? OBJECTION_PROPOSAL_LIMIT

  return input.gaps
    .filter(
      (gap): gap is ChatbotObjectionGap & { occurrences: number } =>
        typeof gap.occurrences === 'number' &&
        Number.isFinite(gap.occurrences) &&
        gap.occurrences >= OBJECTION_PROPOSAL_MIN_OCCURRENCES &&
        !covered.has(gap.theme),
    )
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, Math.max(0, limit))
    .map(gap => ({ theme: gap.theme, occurrences: gap.occurrences, status: 'proposed' as const }))
}
