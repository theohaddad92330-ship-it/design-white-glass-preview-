import { taskStillOpenSql } from '@bellum/contracts'

/**
 * #3942.5 — LA DATE « DERNIÈRE ANALYSE », EN SQL — celle que la colonne
 * `/accounts` AFFICHE, et le tri par défaut de cette liste (`SORT_MAP.date_desc`,
 * `accounts.service.ts`).
 *
 * Le tri de cette colonne portait sur `account.created_at`, c'est-à-dire la
 * date de CRÉATION de la ligne. Or un compte canonique n'est créé qu'une fois :
 * relancer son analyse ne bouge pas `created_at`. Un dossier ré-analysé
 * aujourd'hui restait donc enfoui au milieu de la liste, sous des dossiers
 * datés de la semaine dernière, alors que la colonne triée affichait bien sa
 * date du jour — le tri contredisait visiblement ce qu'il classait.
 *
 * L'expression reproduit EXACTEMENT le repli de `lastAnalyzedDate` côté web :
 * la vraie date de fin de run d'abord ; à défaut, pour un dossier `completed`
 * antérieur au suivi des runs, sa date de création (c'est ce que l'écran
 * montre) ; sinon NULL — l'écran affiche « — » et la ligne n'est pas datable.
 * Trier sur autre chose que ce qui est affiché reproduirait le bug sous une
 * autre forme.
 *
 * Exportée ici (même raison que les prédicats d'hygiène plus bas, GA-53) : le
 * lot F05 ordonne la portée « Recommandés » de `/contacts` PAR COMPTE, avec la
 * MÊME priorité que `/accounts` — une seconde expression aurait pu diverger du
 * tri qu'elle prétend reproduire.
 */
export const LAST_ANALYZED_SQL = `COALESCE(
  (SELECT MAX(r.completed_at)
     FROM analysis_runs r
    WHERE r.account_id = account.id
      AND r.completed_at IS NOT NULL
      AND r.status = 'completed'),
  CASE WHEN account.status = 'completed' THEN account.created_at END
)`

/**
 * Les contrôles de qualité, lus COMPTE PAR COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `data-hygiene.service.ts` (cockpit) COMPTE les objets d'un contrôle : « 7
 * comptes suivis sans prochaine action ». Un décompte d'espace ne dit pas à la
 * ligne du portefeuille si c'est ELLE, et c'est pourtant sur cette ligne que le
 * geste se fait. Ce fichier DÉSIGNE les objets concernés.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE SEULE RÈGLE, DEUX LECTURES — ET UNE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Compter et désigner sont deux questions, pas deux règles. Les prédicats
 * ci-dessous sont donc LE SQL du cockpit : il les importe et les interpole, il
 * ne les recopie pas. GA-53 (`account-hygiene-parity.spec.ts`) refuse le merge
 * dès qu'il en réécrit un. Sans elle, l'écran finirait par avertir sur des
 * comptes que le cockpit ne compte pas, et personne ne saurait laquelle des
 * deux lectures a raison.
 *
 * ⚠️ Jusqu'au 28/08/2026, les deux étaient deux COPIES tenues égales par une
 * comparaison de chaînes. Deux copies identiques passaient — c'est exactement
 * l'état d'où part une divergence, et c'en est une qui a fini par arriver sur
 * « une tâche encore à faire ». Il n'y a plus qu'une chaîne.
 *
 * ⚠️ Le calcul ne remonte PAS ici : le cockpit reste la source du décompte. Ce
 * fichier ne fait que poser la même question à la même table.
 */

/**
 * Ce que l'écran reçoit.
 *
 * ⚠️ `null` n'est PAS `[]` / `{}` : une liste vide se lit « tout est propre »,
 * et une lecture qui a échoué doit se lire « je n'ai pas pu regarder ». Les deux
 * lectures échouent séparément.
 */
export type AccountHygieneByAccount = {
  /** Les comptes suivis sans prochaine action programmée. */
  withoutNextAction: { ids: string[]; truncated: boolean } | null
  /** Par compte, ses contacts sans adresse — et sur combien. Seuls les comptes
   *  qui en portent au moins un y figurent. */
  contactsWithoutEmail: { byAccount: Record<string, { count: number; total: number }>; truncated: boolean } | null
}

/**
 * Les prédicats partagés avec le cockpit — LA seule écriture de chacun.
 *
 * ⚠️ `apps/api/src/modules/pilotage/data-hygiene.service.ts` les interpole
 * depuis ici. Une retouche vaut donc pour les deux écrans d'un coup ; c'est
 * voulu, et GA-53 refuse qu'on en recopie un.
 */
export const ACCOUNT_HYGIENE_PREDICATES = {
  /** La population du contrôle « comptes suivis » : un compte qu'on ne suit pas
   *  n'attend rien de personne, il n'a rien à faire dans la liste de travail. */
  followedAccounts: `a.commercial_status IN ('watching', 'opportunity', 'opening', 'customer') AND a.status <> 'deleted'`,
  /**
   * Rien de programmé : aucune tâche OUVERTE dont l'échéance est encore devant.
   *
   * ⚠️ Corrigé le 28/08/2026. Ce prédicat disait `status <> 'done'`, et le
   * commentaire qui l'accompagnait donnait pour raison « une tâche annulée
   * n'est pas une action programmée » — ce qui est l'argument du prédicat
   * INVERSE. La prose avait donc raison et le SQL faisait le contraire : une
   * tâche ANNULÉE suffisait à faire disparaître un compte de la liste de
   * travail, sans que rien ne soit prévu dessus.
   *
   * « Ouverte » ne se réécrit plus ici : `taskStillOpenSql` (contrats) est la
   * seule définition, et `taskBucket` — l'agenda — en dérive lui aussi. Garde
   * GA-54.
   */
  noUpcomingTask: `NOT EXISTS ( SELECT 1 FROM tasks t WHERE t.account_id = a.id AND ${taskStillOpenSql('t')} AND t.due_on >= CURRENT_DATE)`,
  /** Une adresse absente, ou faite d'espaces. */
  contactWithoutEmail: `COALESCE(btrim(email), '') = ''`,
} as const

export type AccountHygienePredicateName = keyof typeof ACCOUNT_HYGIENE_PREDICATES

/**
 * Le SQL débarrassé de ce qui n'est pas une règle.
 *
 * Les commentaires SORTENT : une garde qui cherche « commercial_status »
 * trouverait la phrase qui en parle et se croirait verte pendant que la requête
 * dit autre chose. Les espaces sont réduits parce que l'indentation d'un
 * fragment dépend de l'endroit où il est écrit, pas de ce qu'il dit.
 */
export function normaliseSql(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(?<!:)\/\/[^\n]*/g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Les prédicats que le cockpit ne PARTAGE pas — recopiés, ou disparus.
 *
 * ⚠️ La garde comparait des CHAÎNES : « le SQL du cockpit contient-il, au
 * caractère près, le texte du prédicat ? ». Deux copies identiques passaient,
 * ce qui est justement l'état d'où part toute divergence — le 28/08/2026, une
 * copie disait `status <> 'done'` et l'autre `status = 'todo'`, et chacune
 * avait été verte le jour où elle a été écrite. Ce qu'on vérifie maintenant est
 * plus fort : le cockpit doit RÉFÉRENCER le prédicat par son nom. Une copie,
 * fût-elle exacte aujourd'hui, est refusée.
 */
export function divergentPredicates(cockpitSource: string): AccountHygienePredicateName[] {
  // Commentaires retirés : une phrase qui CITE le nom du prédicat n'est pas une
  // requête qui l'utilise.
  const code = normaliseSql(cockpitSource)
  return (Object.keys(ACCOUNT_HYGIENE_PREDICATES) as AccountHygienePredicateName[]).filter(
    name => !code.includes(`ACCOUNT_HYGIENE_PREDICATES.${name}`),
  )
}

/**
 * Au-delà de cette borne, l'absence d'un compte dans la réponse ne veut plus
 * dire « il va bien » — elle peut vouloir dire « on s'est arrêté avant lui ».
 * D'où le drapeau `truncated`, PROPRE À CHAQUE LECTURE : une lecture bornée ne
 * doit pas rendre l'autre muette. L'écran le lit avant d'affirmer quoi que ce
 * soit sur un compte absent.
 */
export const ACCOUNT_HYGIENE_SCAN_LIMIT = 2_000

/**
 * Les comptes suivis sur lesquels rien n'est programmé.
 *
 * #2084.24 — une FONCTION et non plus une constante : le cloisonnement par
 * unité opérationnelle s'ajoute ici, et sa forme vit dans
 * `business-unit-scope.clause.ts` (GA-26), jamais réécrite au passage.
 *
 * ⚠️ `perimetre` vide (le cas de tout le monde à cette heure) rend un SQL
 * BYTE-IDENTIQUE à ce qu'il était : la borne d'espace `$1` et la limite `$2`
 * ne bougent pas, et aucun troisième paramètre n'apparaît.
 */
export const accountsWithoutNextActionSql = (perimetre: string | null = null): string => `
  SELECT a.id
    FROM accounts a
   WHERE a.workspace_id = $1
     AND ${ACCOUNT_HYGIENE_PREDICATES.followedAccounts}
     AND ${ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask}${perimetre ? `\n     AND ${perimetre}` : ''}
   ORDER BY a.updated_at DESC
   LIMIT $2`

/**
 * Le DÉCOMPTE, pas la liste des identifiants — même règle, troisième lecture.
 *
 * #3851 (GA-07, lot W01, #2916/#2399.2) — `routine-executors.ts` (module
 * `routines`) avait besoin de ce même décompte pour la routine « comptes sans
 * prochaine action », et importait jusqu'ici `DataHygieneService` (module
 * `pilotage`) pour l'obtenir — une injection de service à travers une
 * frontière de module, ce que GA-07 mesure et plafonne. La requête ELLE-MÊME
 * n'avait pourtant besoin d'aucun service : elle n'interpole que les deux
 * mêmes prédicats que `data-hygiene.service.ts` référence déjà (GA-53, qui ne
 * surveille que ce fichier-là et reste inchangée). En la posant ici, à côté
 * d'`accountsWithoutNextActionSql` ci-dessus, la règle reste à un seul endroit
 * (GA-26) et les deux appelants — le cockpit ET la routine — l'interpolent
 * sans jamais s'importer l'un l'autre.
 */
export const accountsWithoutNextActionCountSql = (): string => `
  SELECT COUNT(*) FILTER (WHERE ${ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask})::int AS n,
         COUNT(*)::int AS total
    FROM accounts a
   WHERE a.workspace_id = $1
     AND ${ACCOUNT_HYGIENE_PREDICATES.followedAccounts}`

/**
 * Les contacts sans adresse, RAMENÉS À LEUR COMPTE.
 *
 * Seuls les comptes qui en portent au moins un sortent : la réponse sert à
 * marquer des lignes, pas à décrire tout le portefeuille. Le dénominateur
 * voyage avec — « 3 » ne dit rien, « 3 sur 7 » se lit.
 */
/**
 * #2084.24 — LE CLOISONNEMENT D'UNE TABLE QUI NE PORTE PAS LA COLONNE.
 *
 * `contacts` n'a pas de `business_unit_id` : la borne se lit sur le COMPTE du
 * contact, par un `EXISTS` corrélé. ⚠️ Un `JOIN accounts` aurait fait la même
 * chose ET quelque chose de plus — faire disparaître les contacts dont le
 * compte n'existe plus, ce qui n'est pas la question posée ici et changerait
 * silencieusement un dénombrement d'hygiène.
 *
 * `perimetre` vide rend un SQL byte-identique à celui d'avant.
 */
export const contactsWithoutEmailByAccountSql = (perimetre: string | null = null): string => `
  SELECT c.account_id AS id,
         COUNT(*) FILTER (WHERE ${ACCOUNT_HYGIENE_PREDICATES.contactWithoutEmail})::int AS n,
         COUNT(*)::int AS total
    FROM contacts c
   WHERE c.workspace_id = $1 AND c.account_id IS NOT NULL${
     perimetre ? `\n     AND EXISTS (SELECT 1 FROM accounts a WHERE a.id = c.account_id AND ${perimetre})` : ''
   }
   GROUP BY c.account_id
  HAVING COUNT(*) FILTER (WHERE ${ACCOUNT_HYGIENE_PREDICATES.contactWithoutEmail}) > 0
   ORDER BY 2 DESC
   LIMIT $2`
