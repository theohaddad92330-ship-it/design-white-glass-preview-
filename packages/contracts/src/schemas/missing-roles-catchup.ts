/**
 * #2637.1 (21/09/2026) — LE RATTRAPAGE AUTOMATIQUE DES RÔLES MANQUANTS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE #2637.1 DEMANDAIT, ET CE QUI LE DISTINGUE DE `segment-catchup.ts`
 * ─────────────────────────────────────────────────────────────────────────
 * « Relancer automatiquement la recherche quand des rôles manquent » réutilise
 * la FORME du rattrapage ciblé par segment (#AF, `segment-catchup.ts`) — un
 * interrupteur, un ciblage par DATE jamais par symptôme, un lot borné, une
 * correction humaine héritée sans rien réécrire. Mais ce segment n'est PAS un
 * septième membre de `SegmentCatchupDimension` : `missing_roles` rejoue
 * `OrgEnrichmentJobService.advance({ mode: 'missing_roles' })` — LE MÊME
 * chemin que le bouton « Enrichir les rôles manquants », qui DÉBITE
 * normalement le crédit du client (`targeted_refresh`) — jamais un des cinq
 * chemins on-demand dédiés que rejouent les six segments. Mélanger les deux
 * familles sous un même type ferait croire à un mécanisme identique alors que
 * l'un réutilise `enrichSegment`/`SEGMENT_KILL_SWITCH` et l'autre un job
 * PERSISTANT à vagues.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2637.1 — GRATUIT (décision Louis, 21/09/2026) : LA QUESTION CI-DESSOUS EST TRANCHÉE
 * ─────────────────────────────────────────────────────────────────────────
 * Ce rattrapage automatique ne débite PAS le client — aligné sur les six
 * segments : « un correctif de collecte rattrape l'existant », améliorer NOTRE
 * collecte ne se facture pas. Louis a explicitement écarté le réglage de
 * consentement par espace, le lancement au cas par cas, et l'attente. Le
 * mécanisme reste `OrgEnrichmentJobService.advance` (jamais un chemin
 * dupliqué) : `MissingRolesCatchupService` est le SEUL appelant qui passe
 * `{ free: true }`, qui saute `hasCredit`/`consumeAnalysisSlot` sans y
 * toucher pour `enrich-gaps` (le bouton manuel, qui n'appelle jamais cette
 * option). Le coût réel reste mesuré (`actual_credits`) : gratuit pour le
 * client, pas invisible pour nous. Voir `OrgEnrichmentJobService.advance` /
 * `create` et `OrgEnrichmentPlannerService.runWave`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX BORNES, PAS UNE — POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * Un enrichissement dépense des crédits : un rattrapage qui reviendrait sans
 * fin sur un compte qui n'a rien à trouver les brûlerait pour rien. D'où deux
 * garde-fous distincts, jamais un seul :
 *  - `MISSING_ROLES_CATCHUP_CAPABILITY_AT` — la date de LA CAPACITÉ, comparée
 *    à `missing_roles_catchup_at` (quand CE compte a été rattrapé pour la
 *    dernière fois) par `isSegmentCollectionStale` — même fonction pure que
 *    les six segments, réutilisée telle quelle (GA-26).
 *  - `MISSING_ROLES_CATCHUP_MAX_ATTEMPTS` — le nombre de passages automatiques
 *    qu'un compte peut encore recevoir avant qu'on cesse de le reproposer,
 *    même si son job reste `partial`/`failed`. Un compte qui a ÉPUISÉ ses
 *    tentatives ou dont le job est allé au bout (`completed`) est marqué
 *    `missing_roles_catchup_at = now()` et sort du ciblage — voir le docblock
 *    de `MissingRolesCatchupService.markAttempt`.
 *
 * ⚠️ Ces deux colonnes ne sont lues/écrites QUE par ce rattrapage AUTOMATIQUE.
 * Le bouton manuel (`AnalysisController.enrichGaps` → `enrich-gaps`) ne les
 * consulte jamais : un client dont le compte est « épuisé » côté rattrapage
 * automatique peut toujours cliquer lui-même, sans aucune limite héritée d'ici.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUI CONSENT À LA DÉPENSE — TRANCHÉ (#2637.1, voir plus haut)
 * ─────────────────────────────────────────────────────────────────────────
 * La question posée par le lot précédent (« un opérateur lance le lot, pas
 * l'utilisateur — qui paie ? ») est résolue : personne côté client, la
 * dépense reste À NOTRE CHARGE, comme les six segments de
 * `segment-catchup.ts`. Ce qui n'a pas changé : l'invocation reste un geste
 * d'opérateur explicite (`#AF.4`, aucun cron, aucun boot ne l'appelle jamais).
 */
// `isSegmentCollectionStale` (fonction pure, même double lecture délibérée que
// les six segments) vit dans `segment-catchup.ts` et est déjà exportée par le
// barrel `@bellum/contracts` — jamais réexportée ici (deux `export *` sur le
// même nom feraient échouer la compilation du barrel).

/** La date de LA CAPACITÉ — quand ce mécanisme de rattrapage a existé pour la
 *  première fois. Un compte jamais rattrapé DEPUIS cette date est concerné. */
export const MISSING_ROLES_CATCHUP_CAPABILITY_AT = '2026-09-21T15:30:00.000Z'

/** Le nombre de passages automatiques qu'un compte peut recevoir avant qu'on
 *  cesse de le reproposer — voir le docblock du fichier. */
export const MISSING_ROLES_CATCHUP_MAX_ATTEMPTS = 3

export type MissingRolesCatchupOutcome = {
  /** Comptes CONCERNÉS trouvés ce passage — jamais tout le parc, borné par `limit`. */
  scanned: number
  /** Une vague a réellement tourné (job créé/repris, avec ou sans succès de la vague). */
  launched: number
  /** Rien à lancer : aucune zone blanche, ou crédit insuffisant — le compte est marqué rattrapé. */
  skipped: number
  /** La vague a échoué et reste reprenable — comptée à part, comme dans `segment-catchup.ts`. */
  failed: number
  /** L'interrupteur d'arrêt a coupé la course : rien n'a été exécuté. */
  cut: boolean
}
