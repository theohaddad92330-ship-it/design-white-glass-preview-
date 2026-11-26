import { z } from 'zod'

/**
 * Le panneau d'effet, réduit à ses règles (Tome 7 §47).
 *
 * Un déplacement d'objet métier peut déclencher autre chose que le déplacement :
 * créer une mission, écarter un compte, envoyer un message. Le tome pose quatre
 * règles, et la troisième est une règle de SÉCURITÉ produit :
 *
 *  1. les cases pré-cochées sont exclusivement de niveau N1 — ce que le produit
 *     fait seul, sans rien envoyer dehors ;
 *  2. « Déplacer seulement » est TOUJOURS disponible, en un clic ;
 *  3. **aucune case déclenchant un envoi externe n'est pré-cochée** ;
 *  4. le panneau s'ouvre aussi au clavier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER PLUTÔT QU'UNE RÈGLE DANS LE COMPOSANT
 * ─────────────────────────────────────────────────────────────────────────────
 * Parce que la règle 3 ne doit pas dépendre du catalogue qui décrit les
 * propositions. `stage-move.ts` marque bien ses envois externes `checked: false`
 * — aujourd'hui. Le jour où quelqu'un ajoute une proposition externe en la
 * cochant « pour rendre service », rien ne l'arrête : la case part pré-cochée,
 * l'utilisateur confirme sans la voir, et le message part.
 *
 * `initialSelection` est donc un SECOND verrou, qui ne fait pas confiance au
 * premier : il retire toute proposition externe de la sélection initiale, quoi
 * qu'en dise le catalogue. Même construction que la garde anti-invention de la
 * réécriture de CV, pour la même raison — une consigne et un verrou qui la
 * vérifie valent mieux que deux consignes.
 */

/** Une proposition affichée dans le panneau. Le contrat ne connaît que ce qui
 *  décide de sa PRÉ-COCHE : le reste (libellé, icône) appartient à l'écran. */
export const effectProposalSchema = z.object({
  key: z.string().min(1),
  /** Ce que le catalogue SOUHAITE. `initialSelection` peut le refuser. */
  checked: z.boolean(),
  /** La proposition sort-elle du produit ? Un message, un export, une écriture
   *  chez un tiers. C'est le seul champ qui rend une pré-coche dangereuse. */
  external: z.boolean(),
  /** Qui exécute : le serveur au moment du geste, ou l'utilisateur ailleurs.
   *  Une proposition exécutée par l'UTILISATEUR est un rappel — la pré-cocher
   *  ne déclenche rien, mais lui promettre une exécution serait faux. */
  performedBy: z.enum(['server', 'user']),
})
export type EffectProposal = z.infer<typeof effectProposalSchema>

/**
 * Ce qui est coché à l'ouverture du panneau.
 *
 * Une proposition EXTERNE n'est jamais pré-cochée, même si le catalogue le
 * demande. C'est la règle 3, appliquée ici plutôt que déclarée ailleurs.
 */
export function initialSelection(proposals: readonly EffectProposal[]): string[] {
  return proposals.filter(proposal => proposal.checked && !proposal.external).map(proposal => proposal.key)
}

/**
 * « Déplacer seulement » : le geste sans aucun de ses effets.
 *
 * Toujours disponible, et c'est le point — sans lui, refuser les propositions
 * demande de décocher les cases une par une, ce que personne ne fait. Un
 * utilisateur pressé confirme donc ce qu'on lui a pré-coché.
 */
export function moveOnlySelection(): string[] {
  return []
}

/**
 * Ce qui est mal déclaré dans un catalogue de propositions.
 *
 * Rend les clés fautives plutôt qu'un booléen : une garde qui dit « il y a un
 * problème » sans dire lequel envoie chercher dans tout le fichier.
 */
export function effectPanelProblems(proposals: readonly EffectProposal[]): string[] {
  const problems: string[] = []
  for (const proposal of proposals) {
    if (proposal.external && proposal.checked) {
      problems.push(`${proposal.key} : une proposition externe ne peut pas être pré-cochée`)
    }
  }
  const keys = proposals.map(proposal => proposal.key)
  const duplicated = keys.filter((key, index) => keys.indexOf(key) !== index)
  for (const key of new Set(duplicated)) {
    problems.push(`${key} : proposition en double — deux cases pour le même effet`)
  }
  return problems
}
