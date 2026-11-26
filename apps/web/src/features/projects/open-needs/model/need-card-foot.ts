import { daysInStatus, type OpenNeedRow, type ProjectNeedStatus } from '@bellum/contracts'

/**
 * LE PIED D'UNE CARTE DU KANBAN DES BESOINS — celui qui CHANGE selon la colonne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Les onze colonnes du kanban affichaient le MÊME pied de carte : « N postes à
 * X €/j ». Un pied identique partout n'aide personne — il occupe la place de la
 * seule information qui, dans cette colonne-là, décide du geste suivant. Dans
 * « à qualifier », cette information est le TEMPS qui passe ; dans « profil
 * proposé », c'est le NOMBRE de profils sur la table. Les deux tiennent sur une
 * ligne, mais ce n'est pas la même ligne.
 *
 * La source le demande en toutes lettres : « Le **pied change selon la
 * colonne** : “créé il y a N j” · “N candidats suggérés” · “N présentations en
 * cours” · “en négociation depuis N j” · “démarre le JJ/MM” » (PDF-03:169-170,
 * relevé C20 de `agent_docs/passe-b-dossier-26-aout/passeB-groupe-A.md`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX FAMILLES, ET POURQUOI PAS CINQ
 * ─────────────────────────────────────────────────────────────────────────────
 * La source décrit cinq pieds pour CINQ colonnes (Nouveaux · Rapprochement ·
 * Présentation · Négociation · Gagnés). Le dépôt a livré **onze** colonnes — un
 * état de besoin, une colonne (`NEED_OPEN_STATUSES`) —, et cet écart-là est un
 * arbitrage antérieur qui ne se re-litige pas ici. Chaque colonne livrée reçoit
 * donc le pied de la QUESTION qu'elle pose, et il n'y en a que deux :
 *
 *  · `stage_age` — « depuis combien de temps est-ce immobile ? ». C'est la
 *    question des colonnes où rien d'autre ne bouge : à qualifier, qualifié,
 *    en validation client, en veille, à réactiver.
 *  · `profiles` — « combien de profils sont déjà sur la table ? ». C'est la
 *    question des colonnes de rapprochement et de présentation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QU'ON REFUSE D'ÉCRIRE ICI, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * **« créé il y a N j »** (le pied de la colonne « Nouveaux ») n'est PAS livré :
 * `OpenNeedRow` ne porte pas de date de création. `status_changed_at` mesure
 * l'entrée dans l'ÉTAPE, ce qui est un autre fait — un besoin créé il y a huit
 * mois et requalifié hier afficherait « créé il y a 1 j ». Le pied de ces
 * colonnes dit donc ce qu'il mesure vraiment (« à qualifier depuis N j »).
 *
 * **« N candidats suggérés »** n'est pas livré non plus sous ce nom :
 * `shortlist_count` compte les POSITIONNEMENTS (`submissions`), pas les
 * suggestions d'une exécution de matching. Ce sont deux objets distincts, et
 * leur donner le même nom est exactement la dérive « même nom, forme
 * différente ». Le libellé dit « profils positionnés ».
 *
 * **« démarre le JJ/MM »** est le pied de la colonne « Gagnés », qui n'existe
 * pas : `won` est un état CLOS, et l'écran s'appelle « besoins ouverts ».
 *
 * **Aucune couleur d'alerte.** Un pied qui vire au rouge suppose un objectif ;
 * la « durée type » que la source invoque n'est chiffrée nulle part — la raison
 * longue est dans `daysInStatus` (`packages/contracts/src/schemas/open-needs.ts`).
 * Le pied rend le fait, jamais le jugement.
 */
type FootFamily = 'stage_age' | 'profiles'

/**
 * Quel pied porte quelle colonne.
 *
 * TOTAL sur les quatorze états, volontairement : un état ajouté demain fait
 * échouer la compilation tant que personne n'a dit ce que sa colonne raconte.
 * `null` = pas de colonne dans cet écran (les états CLOS) — c'est une réponse,
 * pas un oubli.
 */
const FOOT_FAMILY: Record<ProjectNeedStatus, FootFamily | null> = {
  to_qualify: 'stage_age',
  qualified: 'stage_age',
  to_match: 'profiles',
  matching: 'profiles',
  shortlist_ready: 'profiles',
  submitted: 'profiles',
  client_review: 'stage_age',
  // #2942 — même famille que `client_review` : ni l'un ni l'autre ne porte de
  // compteur de profils propre, la question qu'ils posent est « depuis
  // combien de temps ce besoin est-il immobile à cette étape ? ».
  interview: 'stage_age',
  negotiation: 'stage_age',
  on_hold: 'stage_age',
  to_reactivate: 'stage_age',
  /** Valeur d'avant la reprise. Toujours servie, donc toujours affichée. */
  open: 'stage_age',
  won: null,
  lost: null,
  cancelled: null,
  staffed: null,
  /** #2323.1 — pas de colonne dans ce kanban : `detected` n'entre dans
   *  `NEED_OPEN_STATUSES` d'aucune manière, donc jamais dans cet écran. */
  detected: null,
}

/**
 * Ce que la vue a besoin de savoir : quelle phrase, et avec quel nombre.
 *
 * La clé est rendue ICI plutôt qu'un texte : la dérivation vit à un seul
 * endroit, et la traduction reste dans les deux fichiers de langue. `count`
 * vaut `null` quand la phrase n'en porte pas — la passer quand même à `t()`
 * ferait chercher à i18next un pluriel qui n'existe pas.
 */
export function needCardFoot(row: OpenNeedRow, now: Date): { key: string; count: number | null } | null {
  const family = FOOT_FAMILY[row.status]
  if (family === null || family === undefined) return null

  if (family === 'profiles') {
    // ⚠️ ZÉRO EST UNE VRAIE RÉPONSE, et c'est même l'alerte du §16 (« besoins
    // ouverts sans shortlist, seuil 0 »). Un besoin sans profil positionné
    // n'est PAS un besoin non mesuré : la requête a compté, elle a trouvé zéro.
    // Le faire passer par « non mesuré » inverserait le sens de l'écran.
    return row.shortlist_count === 0
      ? { key: `needsKanban.foot.${row.status}_none`, count: null }
      : { key: `needsKanban.foot.${row.status}`, count: row.shortlist_count }
  }

  const days = daysInStatus(row.status_changed_at, now)
  // `null` = ce besoin n'a jamais franchi de transition. « 0 j » se lirait
  // « ça vient de bouger » et enterrerait exactement les besoins qu'on cherche.
  if (days === null) return { key: 'needsKanban.foot.stageAgeUnknown', count: null }
  // « À qualifier depuis 0 j » est vrai et illisible. Le jour même a sa phrase.
  if (days === 0) return { key: 'needsKanban.foot.enteredToday', count: null }
  return { key: `needsKanban.foot.${row.status}`, count: days }
}
