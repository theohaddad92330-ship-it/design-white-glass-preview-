/**
 * LA RÉPARTITION DES RELEVÉS, EN TROIS TEINTES — variante 16 du dossier du
 * 26/08, corrigée par le dossier lui-même.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI TROIS, ET NON QUATRE NI HUIT
 * ─────────────────────────────────────────────────────────────────────────────
 * L'annexe garde les couleurs sémantiques de la variante 6 « mais réduites à
 * trois (validé, en attente, en conflit). **“À valider” et “à saisir” sont deux
 * étapes du même “pas fini”.** »
 *
 * Le modèle porte NEUF statuts (`TIMESHEET_STATUSES`), et l'écran des relevés en
 * peint quatre teintes. Huit états sont justes pour AGIR — relancer un relevé
 * jamais déposé et corriger un relevé refusé sont deux gestes différents. Ils
 * sont faux pour LIRE : sur un tableau de bord, la seule question est « combien
 * de mois de facturation sont bloqués, et par quoi ».
 *
 * ⚠️ Ce fichier ne redéfinit AUCUN statut. Il regroupe ceux que le serveur a
 * déjà comptés (`summary` de `GET /delivery/timesheets`), et c'est ce qui le
 * rend sûr : le jour où un neuvième statut apparaît, il n'entre dans aucun
 * groupe et sort du total — visiblement, par `unclassified`, jamais en silence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI SORT DU DÉNOMINATEUR, ET POURQUOI ON LE DIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `notRequired` — les missions au forfait, celles qui n'attendent aucun relevé.
 * Les compter en « en attente » inventerait un retard qui n'existe pas ; les
 * compter dans le total ferait baisser la part de « validé » sans que rien
 * n'aille mal. Ils sortent donc du calcul **et sont NOMMÉS** : un dénominateur
 * amputé en silence est exactement ce que « un agrégat dit sa population » veut
 * empêcher.
 */

/** Le résumé que sert `GET /delivery/timesheets` — la seule source de ce calcul. */
export type TimesheetSummary = {
  total: number
  awaiting: number
  /** #2196.6 — mois clos, rien reçu : sorti d'`awaiting` par le serveur. */
  late?: number
  submitted: number
  validated: number
  disputed: number
  rejected: number
  /** #2196.24 — troisième relance sans dépôt : le sujet attend un humain. */
  escalated?: number
  notRequired: number
}

/** Les trois groupes, dans l'ordre où ils se lisent. */
export const TIMESHEET_SPLIT_GROUPS = ['validated', 'pending', 'conflict'] as const
export type TimesheetSplitGroup = (typeof TIMESHEET_SPLIT_GROUPS)[number]

/** Local : consommé par `TimesheetSplit` seul. */
type TimesheetSplitBand = {
  group: TimesheetSplitGroup
  count: number
  /**
   * La part du total mesuré, en %. `null` quand il n'y a RIEN à rapporter —
   * jamais « 0 % », qui se lirait « aucun relevé validé » sur un mois où aucun
   * relevé n'est attendu.
   */
  share: number | null
}

/** Local : c'est le type de RETOUR de `timesheetSplit`, que les appelants
 *  infèrent. Le nommer publiquement n'ajouterait rien. */
type TimesheetSplit = {
  bands: TimesheetSplitBand[]
  /** Les relevés réellement classés — le dénominateur des trois parts. */
  measured: number
  /** Les relevés non attendus (forfait), SORTIS du calcul et nommés. */
  notRequired: number
  /**
   * Ce que le serveur a compté sans qu'aucun groupe ne le reconnaisse.
   *
   * `> 0` veut dire qu'un statut a été ajouté au modèle sans être classé ici. On
   * l'AFFICHE plutôt que de le noyer : une répartition dont les parts ne font
   * pas 100 % doit dire pourquoi, sinon quelqu'un passe une heure à chercher
   * l'erreur d'arrondi.
   */
  unclassified: number
}

/** Une valeur de compteur exploitable : un entier positif fini. */
function counted(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

/**
 * Les trois teintes, calculées une fois pour l'écran et pour l'export.
 *
 * @param summary Le résumé servi par le serveur, ou `null` si la lecture a
 *                échoué — auquel cas TOUT est à zéro et `measured` vaut 0, ce
 *                que l'appelant lit comme « rien à montrer », jamais comme
 *                « aucun relevé n'existe ».
 */
export function timesheetSplit(summary: TimesheetSummary | null | undefined): TimesheetSplit {
  const validated = counted(summary?.validated)
  // « à saisir » (`awaiting` : expected/missing/draft) et « à valider »
  // (`submitted`) sont deux étapes du MÊME « pas fini » — c'est la correction
  // que l'annexe apporte à sa propre maquette.
  //
  // #2196.6 / #2196.24 — `late` et `escalated` sont deux formes du même « rien
  // reçu » que le serveur compte désormais à part : ils bloquent la facturation
  // exactement comme `awaiting`, ils ne sont ni un litige ni un forfait.
  const pending =
    counted(summary?.awaiting) + counted(summary?.late) + counted(summary?.escalated) + counted(summary?.submitted)
  // Un relevé RENVOYÉ à son auteur est un refus, pas une nuance de brouillon :
  // il porte la même gravité qu'un litige. L'écran des relevés le peint déjà
  // ainsi ; on ne crée pas une seconde lecture.
  const conflict = counted(summary?.disputed) + counted(summary?.rejected)

  const notRequired = counted(summary?.notRequired)
  const measured = validated + pending + conflict
  const total = counted(summary?.total)
  // ⚠️ `Math.max(0, …)` : un total serveur inférieur à la somme des groupes
  // (impossible en théorie, jamais garanti) donnerait un « non classé » négatif,
  // c'est-à-dire un chiffre faux affiché avec aplomb.
  const unclassified = Math.max(0, total - measured - notRequired)

  const share = (count: number): number | null =>
    measured === 0 ? null : Number(((count / measured) * 100).toFixed(2))

  return {
    bands: [
      { group: 'validated', count: validated, share: share(validated) },
      { group: 'pending', count: pending, share: share(pending) },
      { group: 'conflict', count: conflict, share: share(conflict) },
    ],
    measured,
    notRequired,
    unclassified,
  }
}
