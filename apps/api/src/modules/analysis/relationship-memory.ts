import type { RelationshipMemory } from '@bellum/contracts'

/**
 * Rend la mémoire de relation (bloc « Mémoire » de la couche zéro, annexe méthodo
 * p8) en texte injectable dans le contexte du run, pour que la couche zéro côté
 * IA la relise au run suivant.
 *
 * N'affiche QUE les champs réellement saisis — un champ vide n'apparaît pas, rien
 * n'est deviné. Renvoie `''` quand rien n'est saisi (le contexte reste inchangé).
 */
export function formatRelationshipMemory(memory: RelationshipMemory | null | undefined): string {
  if (!memory) return ''
  const lines: string[] = []
  const push = (label: string, value: string | null | undefined) => {
    const v = value?.trim()
    if (v) lines.push(`- ${label} : ${v}`)
  }
  push('Relation', memory.relation)
  push('Dernier contact', memory.lastContactAt)
  push('Owner côté ESN', memory.owner)
  push('Prochaine revue', memory.nextReviewAt)
  push('Issue de la dernière interaction', memory.issue)
  push('Source de cette mémoire', memory.source)

  const blocks: string[] = []
  if (lines.length > 0) {
    blocks.push(
      "MÉMOIRE DE RELATION (saisie par le commercial — ce que l'ESN sait déjà de ce compte, cité tel quel) :\n" +
        lines.join('\n') +
        "\nCe compte n'est donc PAS froid : appuie-toi sur cette mémoire (relance l'owner, respecte la prochaine revue, " +
        "tiens compte de l'issue passée) plutôt que d'ouvrir à froid.",
    )
  }

  // #1085 — bloc SÉPARÉ, et c'est tout l'intérêt : ce que le commercial sait de
  // sa position se connaît sans avoir jamais parlé au compte. Le ranger avec les
  // faits de relation ferait conclure « pas froid » à quelqu'un qui a seulement
  // écrit ce qu'il sait vendre, et le plan partirait d'une relation inexistante.
  const edge = memory.competitiveEdge?.trim()
  if (edge) {
    blocks.push(
      "POSITION DU VENDEUR SUR CE COMPTE (saisie par le commercial, citée telle quelle — c'est ce qu'il SAIT, pas ce " +
        "qu'on a observé) :\n" +
        `- ${edge}\n` +
        "Appuie-toi dessus pour l'angle et la preuve à citer. Cela ne dit RIEN de l'état de la relation : un avantage " +
        'se connaît sans avoir jamais parlé à ce compte.',
    )
  }

  return blocks.join('\n\n')
}
