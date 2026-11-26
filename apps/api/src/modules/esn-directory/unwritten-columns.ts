/**
 * Les colonnes d'`esn_directory` que RIEN n'écrit — et la raison de chacune.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une colonne lue et jamais écrite ne se voit NULLE PART, parce que son repli
 * est honnête : le calcul lit la valeur par défaut et répond exactement ce
 * qu'il doit répondre pour une donnée absente. `risk_flag` vaut `aucun` sur
 * toutes les lignes, donc `overflowScore` n'exclut jamais personne, donc
 * l'écran ne dit rien — et « rien à signaler » se lit comme une bonne nouvelle
 * plutôt que comme « personne n'a regardé ».
 *
 * Trois exigences du référentiel reposent sur ce seul drapeau : **S12** (la
 * procédure collective comme signal négatif), **PAR-04** (une ESN en procédure
 * est retirée, irréversiblement) et le refus « je ne te propose pas comme
 * partenaire une ESN en procédure collective ». Le producteur existe —
 * `esnRisk()` dans `packages/contracts/src/schemas/esn-directory.ts`, écrit et
 * couvert par ses tests — et **il n'a aucun appelant**. Le refus se lit donc
 * « gardé » alors qu'il est tenu par une donnée absente.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ON NE LUI DONNE PAS UN PRODUCTEUR TOUT DE SUITE
 * ─────────────────────────────────────────────────────────────────────────────
 * Parce qu'il n'y a rien à lui donner, et que l'appeler quand même serait PIRE
 * que de ne pas l'appeler. Les trois entrées d'`esnRisk` sont :
 *
 *  · `collectiveProceeding` — le BODACC. ⚠️ Branché le 09/10/2026 (#3916.b) :
 *    voir l'encadré « Le risque » plus bas — la seule entrée désormais lue ;
 *  · `headcountDropped` — `headcount_tranche` n'existe qu'au présent, chaque
 *    résolution l'écrase. Sans historique, « en baisse d'un cran » n'a rien à
 *    comparer (même cause que `headcountGrowing` dans `UNCOLLECTED_ON_TERRITORY`) ;
 *  · `leadershipChanged` — rien ne suit les changements de direction d'une ESN.
 *
 * L'appeler avec trois `undefined` rendrait `{ flag: 'aucun', evidence: null }`
 * et poserait `risk_checked_at`. Autrement dit : on écrirait « vérifié, aucun
 * risque » sur 477 ESN que personne n'a regardées, et l'écran aurait enfin de
 * quoi affirmer ce qu'il ne peut pas savoir. C'est exactement le défaut que la
 * fonction elle-même refuse dans son docblock — « l'absence d'évènement n'est
 * pas une preuve d'absence de risque ».
 *
 * Donc : **on le DIT**, ici et en test, plutôt que de le laisser passer pour
 * tenu. C'est le modèle `UNCOLLECTED_ON_TERRITORY` (`territory.controller.ts`),
 * appliqué à des colonnes plutôt qu'à des signaux. Ce fichier ne fait que
 * DÉCRIRE — il n'exécute rien, et c'est ce qui lui permet de dire la vérité, y
 * compris quand elle est déplaisante.
 *
 * ⚠️ Cette liste se RÉTRÉCIT quand un écrivain apparaît, elle ne s'allonge
 * jamais pour faire taire une garde. `unwritten-columns.spec.ts` échoue dans
 * les DEUX sens : une colonne sans écrivain et non déclarée le fait tomber, et
 * une colonne déclarée ici que quelqu'un s'est mis à écrire le fait tomber
 * aussi — c'est la justification périmée, en plus discret.
 */

/** Une colonne du référentiel qu'aucun chemin du PRODUIT ne renseigne. Non
 *  exportée : elle ne sert qu'à typer la liste ci-dessous, et un type exporté
 *  que personne n'importe est une promesse d'API que rien ne tient. */
interface UnwrittenColumn {
  /** Le nom de la propriété d'entité (camelCase), tel que la garde le lit. */
  property: string
  /** Ce qui manque, et pourquoi ce n'est pas un simple câblage à faire. */
  why: string
}

/**
 * Ce que la base pose elle-même. Ce ne sont pas des trous : personne ne les
 * écrit, et c'est juste.
 */
export const ESN_DIRECTORY_DB_GENERATED: readonly string[] = ['id', 'createdAt', 'updatedAt']

export const ESN_DIRECTORY_UNWRITTEN: readonly UnwrittenColumn[] = [
  /* ---- Le risque : sorti de cette liste le 09/10/2026 (#3916.b, lot M03) ----
   * `riskFlag`, `riskEvidence` et `riskCheckedAt` ont un écrivain : la veille
   * des registres publics (`watchlist-refresh/public-registry-watch.ts`,
   * `syncEsnRisk`) appelle `esnRisk()` avec une procédure collective LUE au
   * BODACC pour le SIREN de l'ESN. Seule une preuve écrit : l'absence de
   * procédure ne pose ni `aucun` ni date de vérification — le piège décrit en
   * tête de ce fichier reste fermé. Limite nommée : seules les ESN dont le
   * SIREN est celui d'un compte SUIVI sont lues (jamais tout le parc). */

  /* ---- L'ouverture au rang 2 : sortie de cette liste le 30/08/2026 (N16) ----
   * `EsnDirectoryService.declareSubcontracting()` écrit désormais CINQ
   * colonnes qui vivaient ici — `open_to_subcontracting`,
   * `subcontracting_confidence`, `subcontracting_evidence`,
   * `subcontracting_declared_at`, `subcontracting_sources_count` — via
   * l'agrégat communautaire `subcontractingAggregate()` (`@bellum/contracts`),
   * posé sur `esn_subcontracting_declarations` (table scopée, D589). C'est
   * l'exemple que ce fichier promet en tête : la liste RÉTRÉCIT.
   *
   * `subcontractingMentioned`, lui, reste non collecté : personne ne lit les
   * offres ni les pages à la recherche d'une mention de sous-traitance — ça
   * reste vrai, et c'est `UNCOLLECTED_ON_TERRITORY` (`territory-overflow.ts`)
   * qui le porte, pas ce fichier. */

  /* ---- La commande publique : `publicAwards` et `awardsRefreshedAt` sortis de cette liste le 16/10/2026 (#3921.10),
   * `publicExposure` le 17/10/2026 (#3921.12 : dérivée de `publicAwards` à chaque relecture) ----
   * La relecture nocturne des ESN (`esn-registry-rotation.ts`) appelle `PublicRegistryWatch.syncEsnAwards`,
   * qui écrit les marchés publics GAGNÉS (rôle TITULAIRE, source DECP) et la date de lecture. Une panne
   * n'écrit rien : « non mesuré » n'est pas « 0 ». Limite nommée : un tour de ~30 ESN par nuit, donc une
   * ESN pas encore relue garde une liste vide SANS date de lecture. */

  /* ---- Le reste du registre ---- */
  {
    property: 'establishments',
    why: 'Le détail des établissements (SIRET, commune, département, tranche). La résolution au registre n’écrit que leur NOMBRE (`establishmentCount`) : le service IA ne renvoie pas la liste, si bien que le tableau reste `[]` partout et que « où est-elle implantée » n’a pas de réponse.',
  },
  {
    property: 'domain',
    why: 'Le site officiel de l’ESN. La résolution au registre ne le renvoie pas, et 93 % des domaines du fichier d’origine étaient DÉRIVÉS du nom — c’est justement pour ça qu’on ne les a pas repris.',
  },
  {
    property: 'domainStatus',
    why: 'L’état d’un domaine qu’on n’écrit pas. `unverified` est le défaut honnête et il n’a rien à vérifier tant qu’aucun domaine n’est enregistré.',
  },
]
