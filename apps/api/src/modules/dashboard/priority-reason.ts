/**
 * Longueur au-delà de laquelle une raison cesse d'informer.
 *
 * Une ligne de tableau de bord se lit d'un coup d'œil. Au-delà, elle n'est plus
 * lue : elle est SURVOLÉE, et un survol ne retient rien d'une phrase coupée à
 * mi-mot par la largeur de la colonne.
 */
const MAX_REASON_CHARS = 90

/**
 * La raison d'une priorité, réduite à ce qui tient sur une ligne.
 *
 * Le libellé d'une relance est une CONSIGNE — « Contacter Untel (Head of Data
 * & Analytics, Société) par email personnalisé en référençant les 3 postes
 * ouverts le 24 juillet à Puteaux/Paris et… ». Utile dans la fiche de la
 * relance, illisible dans une liste de priorités, où elle se faisait couper par
 * la colonne au milieu d'un mot.
 *
 * On coupe donc NOUS, sur un mot entier et en le disant. Un « … » signale qu'il
 * y a une suite ; une phrase tronquée par la mise en page ne signale rien du
 * tout et se lit comme une donnée abîmée.
 */
export function shortReason(reason: string, max: number = MAX_REASON_CHARS): string {
  const clean = String(reason ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length <= max) return clean

  // On coupe au dernier espace AVANT la limite : couper au milieu d'un mot
  // donne « en référen… », qui ne se lit pas.
  const slice = clean.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > max / 2 ? slice.slice(0, lastSpace) : slice
  // La ponctuation traînante ferait « Puteaux/Paris,… ».
  return `${cut.replace(/[\s,;:.–—-]+$/, '')}…`
}
