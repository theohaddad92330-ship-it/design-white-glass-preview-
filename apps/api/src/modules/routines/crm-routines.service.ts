import { Injectable, Logger } from '@nestjs/common'
import { EMPLOYMENT_CHECK_EVERY_DAYS, employmentCheckState, type ObservedEmployment } from './employment-check'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  DECIDED_STAGES,
  LIVE_STAGES,
  EVIDENCE_GAP_LABELS,
  NOT_NOW_REVALIDATION_DAYS,
  OPEN_PIPELINE_STAGES,
  UNDECIDED_STAGES,
  isDefinitiveRefusal,
  isReexaminationDue,
  jobChangeOpening,
  meetsEvidenceLevel,
  needStaffableNotRefusedSql,
  needStillOpenSql,
  noGoMessageRefusal,
  NEAR_SIGNING_STAGES,
  projectStageInSql,
} from '@bellum/contracts'
import { returnedRows } from '../../database/returned-rows'
import { AccountEntity } from '../../database/entities/account.entity'
import { type RoutineRead } from './routine-read'

/** Les stades dont l'ISSUE n'est pas connue, en littéraux SQL. Les valeurs
 *  viennent de l'énumération du contrat, jamais d'une saisie — aucune
 *  interpolation d'entrée utilisateur ici. */

/** Un compte écarté, avec ce qu'il faut pour savoir si son refus a fait son temps. */
type ParkedAccount = {
  company_name: string
  gate_reason: string
  gate_decided_at: string | null
}

/**
 * Le résultat d'une lecture de routine CRM (D715, 30/08/2026).
 *
 * `measured: false` NE VEUT JAMAIS DIRE « zéro résultat » — la requête n'a pas
 * pu s'exécuter, et `rows` est vide par CONSTRUCTION, pas par mesure. Avant
 * cette distinction, `rows()` rendait `[]` dans les deux cas : une panne SQL et
 * un vrai zéro produisaient l'EXACTE même valeur, et l'appelant — donc
 * l'utilisateur, à l'écran Réglages › Routines — lisait « aucun projet
 * immobile » sur une requête qui venait de casser. C'est le défaut nommé
 * « cassé et non mesurable se ressemblent » : un verdict ne se conclut pas
 * d'un silence.
 *
 * C'est à l'APPELANT de décider quoi faire d'une lecture non mesurée — se
 * taire, l'écrire dans la trace, ou (§13) continuer avec ce que l'autre
 * moitié d'un calcul À DEUX lectures a quand même trouvé. `rows()` ne décide
 * rien de plus que « ai-je pu regarder ».
 */

/**
 * La requête de « besoins sans shortlist », EXPORTÉE.
 *
 * Elle ne vit pas dans le corps de la méthode pour une seule raison : la preuve
 * qui compte est qu'elle S'EXÉCUTE, et une preuve qui RECOPIE la requête ne
 * prouve rien de la requête qui tourne en production. `crm-routines.db.spec.ts`
 * importe cette fonction et fait analyser sa sortie par un vrai Postgres —
 * c'est la même chaîne, à l'octet près, que celle que le service envoie.
 *
 * Les deux prédicats métier viennent du contrat (`needStillOpenSql`,
 * `needStaffableNotRefusedSql`) : ni la liste des statuts ouverts ni la forme de
 * la porte G3 ne se recopient ici.
 */
export function needsWithoutShortlistSql(): string {
  return `SELECT n.title,
              FLOOR(EXTRACT(EPOCH FROM (now() - n.created_at)) / 86400)::int AS days
         FROM project_needs n
        WHERE n.workspace_id = $1
          AND ${needStillOpenSql('n.status')}
          AND ${needStaffableNotRefusedSql('n.staffable')}
          AND n.created_at < now() - ($2 || ' days')::interval
          AND NOT EXISTS (SELECT 1 FROM shortlists s WHERE s.need_id = n.id)
        ORDER BY n.created_at ASC
        LIMIT 20`
}

/** Un contact dont l'employeur détecté ne correspond plus à son compte.
 *
 * EXPORTÉ : `copilot-bridge` (capacité `contacts/job-changes`) en a besoin
 * pour typer la même liste — voir {@link contactMovesAccountsSql} pour la
 * raison de cette extraction. */
export type ContactMove = {
  full_name: string
  company_name: string
  new_employer: string
  known_since: string | null
  /** Le compte du nouvel employeur, s'il est DÉJÀ suivi. `null` sinon — et on
   *  n'en crée pas : inventer une fiche sur un nom deviné est exactement ce que
   *  le dépôt s'interdit. */
  new_account_id: string | null
  /**
   * #2845 — l'identifiant du CONTACT, additif (même patron que `a.id AS
   * account_id` du LOT 17) : `contactJobChange` (routine-executors.ts) en a
   * besoin pour mettre en pause les séquences ACTIVES de ce contact, chose que
   * l'ancienne requête — sans identifiant — ne permettait pas.
   */
  contact_id: string
}

/** #4016.L2 / #4286.13 — la lecture d'un contact à relire, partagée par la routine et l'ouverture de fiche. */
const EMPLOYMENT_TARGET_SELECT = `SELECT c.id AS contact_id,
                c.full_name,
                c.raw_data ->> 'apolloId' AS apollo_id,
                c.raw_data -> 'apolloDetails' ->> 'organization' AS organization,
                lower(coalesce(c.decision_role, '')) IN ('champion', 'sponsor') AS is_champion,
                a.company_name AS account_name
           FROM contacts c
           LEFT JOIN accounts a ON a.id = c.account_id AND a.workspace_id = c.workspace_id`

/** Jamais relu, ou relu il y a plus de `$2` jours (la constante unique `EMPLOYMENT_CHECK_EVERY_DAYS`). */
const EMPLOYMENT_DUE_SQL = `(c.raw_data -> 'employmentCheck' ->> 'at' IS NULL
                 OR (c.raw_data -> 'employmentCheck' ->> 'at')::timestamptz < now() - ($2::int * interval '1 day'))`

/** #4016.L2 — un champion dont l'employeur courant est à relire. */
export type EmploymentCheckTarget = {
  contact_id: string
  full_name: string
  apollo_id: string
  organization: string | null
  /** #4016.2c — champion/sponsor ; les autres contacts sont relus après eux. */
  is_champion: boolean
  /** #4055.8 — le compte du contact : l'employeur observé se compare à lui, jamais à un nom deviné. */
  account_name?: string | null
}

/**
 * UNE MÊME PERSONNE ne produit jamais deux signaux.
 *
 * `contactsWhoMayHaveMoved` (comptes) et `esnContactsWhoMayHaveMoved` (ESN du
 * référentiel) SE RECOUVRENT dès que le compte suivi d'un contact est
 * lui-même une ESN : la requête des comptes ne l'exclut pas — elle ne connaît
 * pas `esn_directory` — et la jointure ESN ne fait qu'AJOUTER une
 * qualification sur une partie de la même population, jamais une population
 * disjointe. Sans dédoublonnage, la routine annoncerait « 2 contacts à
 * vérifier » pour une seule personne, et `openDoorFromMove` tenterait
 * d'ouvrir la même porte deux fois.
 *
 * Identité par `full_name` + `company_name` + `new_employer` : `ContactMove`
 * ne porte pas l'identifiant du contact (la requête des comptes, gelée, ne le
 * sélectionne pas), et ce triplet est déjà celui qui distingue une ligne
 * d'une autre à l'écran.
 *
 * ⚠️ LE SIGNAL ESN GAGNE — `priority` passe en premier. C'est celui qui vaut
 * le plus sur le second marché (l'énoncé du chantier qui a fait exister cette
 * fonction) : en cas de divergence future entre les deux jointures, perdre
 * la qualification ESN serait perdre l'information la plus utile.
 *
 * EXPORTÉE pour la même raison que les deux requêtes ci-dessous : `copilot-bridge`
 * fusionne les deux populations pour Laura et doit appliquer EXACTEMENT cette
 * règle, pas une recopie qui pourrait un jour diverger sur l'ordre de priorité.
 */
export function dedupeContactMoves(priority: readonly ContactMove[], rest: readonly ContactMove[]): ContactMove[] {
  const seen = new Map<string, ContactMove>()
  for (const move of [...priority, ...rest]) {
    const key = `${move.full_name}|${move.company_name}|${move.new_employer}`
    if (!seen.has(key)) seen.set(key, move)
  }
  return [...seen.values()]
}

/**
 * La requête des COMPTES de `contactsWhoMayHaveMoved`, EXPORTÉE — même raison
 * que {@link needsWithoutShortlistSql} : la preuve qui compte est qu'elle
 * S'EXÉCUTE, et `crm-routines.service.spec.ts` la fige au caractère près.
 *
 * ⚠️ Une SECONDE raison s'ajoute ici, propre à ce chantier : `copilot-bridge`
 * (capacité `contacts/job-changes`, tome 4 / §16) a besoin d'appeler EXACTEMENT
 * cette requête, mais SANS passer par `CrmRoutinesService.rows()`. Jusqu'au
 * 30/08/2026, cette méthode avalait ses erreurs et rendait `[]` indifféremment
 * d'un vrai zéro (« un échec rend `[]`, donc "rien à signaler" », acceptable
 * pour une routine privée qui retente le mois suivant, mais pas pour une
 * capacité qui parle à Laura : un `[]` de panne s'y lirait « personne n'a
 * changé de poste » — une phrase fausse). Ce défaut est corrigé (D715,
 * `rows()` rend désormais `{ measured, rows }`), mais l'extraction reste
 * justifiée sans lui : `copilot-bridge` ne dépend de toute façon jamais d'un
 * service d'un autre module (GA-07), et sa propre gestion d'erreur — la sienne,
 * pas la forme `{ measured, rows }` d'une routine interne — lui appartient.
 *
 * ⚠️ #1473 — la jointure `JOIN accounts` de ces deux requêtes est un INNER, et
 * c'est VOULU : la routine compare l'employeur rendu par l'enrichissement au
 * NOM DU COMPTE pour détecter un départ. Un contact « à qualifier » n'a pas
 * d'employeur connu à comparer — « il a changé d'entreprise » ne veut rien dire
 * pour lui. Le commentaire vit ICI et non dans la chaîne SQL : celle-ci est
 * épinglée au caractère près par `crm-routines.service.spec.ts`, précisément
 * pour qu'elle ne dérive pas.
 *
 * ⚠️ LOT 17 — CETTE REQUÊTE PORTE DÉSORMAIS `a.id AS account_id` EN PLUS
 * (colonne ADDITIVE, en fin de `SELECT` — rien d'existant ne bouge). Raison :
 * le CLOISONNEMENT DE PORTEFEUILLE (décision D5, `portfolioScopeFor` de
 * `@bellum/contracts`) — même mécanisme que `chains.service.ts` applique déjà
 * à `blockers()` (LOT 15), rejoué ici plutôt qu'inventé une seconde fois.
 * `chains.service.ts` a délibérément gardé son SQL de PROJECTEUR figé à un
 * seul paramètre et résout « qui porte quoi » par une requête SÉPARÉE
 * (`ownedSubjectIds`), pour que le FILTRAGE reste du TypeScript testable sans
 * base — {@link ownedAccountIdsSql} rejoue ce même patron ici. `account_id`
 * est ce qui permet à `copilot-bridge` de faire cette jointure EN MÉMOIRE
 * (`Set.has`), jamais par le NOM du compte — une jointure par libellé se
 * tromperait sur les homonymies, exactement ce que ce fichier refuse déjà
 * pour le rattachement ESN (voir plus bas).
 */
export function contactMovesAccountsSql(): string {
  return `SELECT c.full_name,
              a.company_name,
              c.raw_data -> 'apolloDetails' ->> 'organization' AS new_employer,
              c.created_at AS known_since,
              -- Le compte du NOUVEL employeur, s'il est déjà suivi. Une
              -- jointure sur le libellé, donc approximative : c'est pourquoi
              -- rien ne s'écrit sans elle, et pourquoi son absence ne crée
              -- jamais de compte — inventer une fiche sur un nom deviné est
              -- exactement ce que le dépôt s'interdit.
              (SELECT n.id FROM accounts n
                WHERE n.workspace_id = c.workspace_id
                  AND lower(n.company_name) = lower(c.raw_data -> 'apolloDetails' ->> 'organization')
                  AND n.status <> 'archived'
                LIMIT 1) AS new_account_id,
              -- LOT 17 — le compte SUIVI (pas le nouvel employeur ci-dessus) :
              -- l'identifiant dont copilot-bridge a besoin pour appliquer le
              -- cloisonnement de portefeuille EN MÉMOIRE, jamais par le NOM.
              a.id AS account_id,
              -- #2845 — l'identifiant du CONTACT, additif : contactJobChange
              -- en a besoin pour mettre en pause SES séquences actives.
              c.id AS contact_id
         FROM contacts c
         JOIN accounts a ON a.id = c.account_id
        WHERE c.workspace_id = $1
          AND c.deleted_at IS NULL
          AND c.excluded_at IS NULL
          AND c.raw_data -> 'apolloDetails' ->> 'organization' IS NOT NULL
          AND lower(c.raw_data -> 'apolloDetails' ->> 'organization') <> lower(a.company_name)
        ORDER BY c.last_enrichment_at DESC NULLS LAST
        LIMIT 20`
}

/**
 * La requête ESN de `esnContactsWhoMayHaveMoved`, EXPORTÉE — même raison que
 * {@link contactMovesAccountsSql}, `account_id` (LOT 17) et `contact_id`
 * (#2845) compris.
 */
export function contactMovesEsnSql(): string {
  return `SELECT c.full_name,
              a.company_name,
              c.raw_data -> 'apolloDetails' ->> 'organization' AS new_employer,
              c.created_at AS known_since,
              (SELECT n.id FROM accounts n
                WHERE n.workspace_id = c.workspace_id
                  AND lower(n.company_name) = lower(c.raw_data -> 'apolloDetails' ->> 'organization')
                  AND n.status <> 'archived'
                LIMIT 1) AS new_account_id,
              a.id AS account_id,
              c.id AS contact_id
         FROM contacts c
         JOIN accounts a ON a.id = c.account_id
         JOIN esn_directory e ON e.siren = a.siren
        WHERE c.workspace_id = $1
          AND c.deleted_at IS NULL
          AND c.excluded_at IS NULL
          AND a.siren IS NOT NULL
          AND c.raw_data -> 'apolloDetails' ->> 'organization' IS NOT NULL
          AND lower(c.raw_data -> 'apolloDetails' ->> 'organization') <> lower(a.company_name)
        ORDER BY c.last_enrichment_at DESC NULLS LAST
        LIMIT 20`
}

/**
 * LOT 17 — les identifiants des COMPTES que CET utilisateur porte, pour
 * appliquer le cloisonnement de portefeuille (D5) à `contacts/job-changes`
 * sans toucher `chains.service.ts` (hors périmètre de ce chantier).
 *
 * ⚠️ UNE SECONDE DÉFINITION, ASSUMÉE : `chains.service.ts` porte déjà
 * exactement ce prédicat pour `accounts` dans son `OWNER_SUBJECT_SQL.account`
 * (LOT 15) — même colonne (`assigned_to`), même forme (`$2` OU `$3` ET NULL).
 * Elle n'est pas exportée de là (privée à `ChainsService`, et ce module reste
 * hors du cliquet GA-07 qui compterait un import service→service), donc cette
 * requête EXPORTÉE est la sienne, propre à `crm-routines`/`copilot-bridge`, et
 * `crm-routines.service.spec.ts` la fige au caractère près comme les deux
 * précédentes.
 *
 * `includeUnassigned` (troisième paramètre) garde visibles les comptes que
 * PERSONNE ne porte — sans quoi ils disparaîtraient de la vue de tout le monde
 * sauf des responsables, exactement ce que documente `portfolioScopeFor`.
 */
export function ownedAccountIdsSql(): string {
  return `SELECT id::text AS id
         FROM accounts
        WHERE workspace_id = $1
          AND (assigned_to = $2 OR ($3 AND assigned_to IS NULL))`
}

/**
 * Les lectures des cinq automatisations CRM du §13 (PDF 2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DES REQUÊTES ET PAS DES SERVICES
 * ─────────────────────────────────────────────────────────────────────────────
 * Ces cinq routines lisent cinq domaines — projets, plans, besoins, comptes,
 * contacts. Les servir par cinq services importés ferait traverser cinq fois
 * une frontière que la règle §3.2 veut voir traversée le moins possible, et
 * ferait monter le cliquet GA-07 d'autant.
 *
 * On lit donc le SCHÉMA, comme le fait déjà le module d'analytique : un
 * couplage de schéma se voit à la migration suivante (les gardes SQL le
 * disent), là où un couplage de services se découvre le jour où l'on veut
 * retirer un module.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'AUCUNE DE CES LECTURES NE FAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elles ne décident rien et n'écrivent rien. Un projet immobile n'appelle pas un
 * message automatique au client : il appelle une décision du commercial. Toutes
 * les routines qui s'en servent sont en N1 — elles préparent et notifient.
 */
@Injectable()
export class CrmRoutinesService {
  private readonly logger = new Logger(CrmRoutinesService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  /**
   * #3405.3 — LA GARDE NO-GO DE LA RELANCE AUTOMATIQUE : la phrase de refus
   * (`noGoMessageRefusal`) quand le contact relève d'un compte en NO-GO, sinon
   * `null`. Une routine qui rédige seule est le cas le plus net de « relancer
   * un NO-GO sans nouveau motif » : personne ne voit le compte passer.
   */
  async messageRefusalForContact(contactId: string): Promise<string | null> {
    const rows = await this.accounts.manager.query<{ sprint: string | null; sprint_reason: string | null }[]>(
      `SELECT a.sprint, a.sprint_reason FROM contacts c JOIN accounts a ON a.id = c.account_id
        WHERE c.id = $1 LIMIT 1`,
      [contactId],
    )
    return noGoMessageRefusal(rows[0]?.sprint, rows[0]?.sprint_reason)
  }

  /**
   * Les projets ouverts immobiles depuis plus de `days` jours.
   *
   * Un projet SANS date d'entrée d'étape n'alerte jamais : on ne sait pas
   * depuis quand il est là, et supposer « depuis toujours » ferait remonter en
   * tête de liste exactement les dossiers dont on ne sait rien.
   *
   * ⚠️ « Ouvert » vaut ici {@link UNDECIDED_STAGES}, `dormant` COMPRIS — et non
   * les stades « encore en jeu » du prévisionnel. L'écart est voulu : une
   * routine de relance existe précisément pour réveiller ce qui dort. L'aligner
   * sur l'autre définition l'éteindrait sans que rien ne le montre — elle
   * continuerait de tourner, simplement sans jamais rien remonter.
   */
  async stalledProjects(
    workspaceId: string,
    days = 21,
  ): Promise<RoutineRead<{ label: string; stage: string; days: number }>> {
    return this.rows(
      `SELECT o.label, o.stage,
              FLOOR(EXTRACT(EPOCH FROM (now() - o.stage_entered_at)) / 86400)::int AS days
         FROM opportunities o
        WHERE o.workspace_id = $1
          AND ${projectStageInSql('o.stage', UNDECIDED_STAGES)}
          AND o.stage_entered_at IS NOT NULL
          AND o.stage_entered_at < now() - ($2 || ' days')::interval
        ORDER BY o.stage_entered_at ASC
        LIMIT 20`,
      [workspaceId, days],
      'stalledProjects',
    )
  }

  /**
   * #2916 (#2399.2, Louis 15/10/2026) — LES CINQ LECTURES DU PIPELINE. Elles lisent `opportunities` comme
   * `stalledProjects`, bornées à l'espace ; aucune n'écrit. Une date de clôture ABSENTE n'est jamais
   * « bientôt » ni « dépassée » : elle est lue à part (`dealsWithoutCloseDate`), jamais inventée.
   *
   * Les affaires ouvertes sont `LIVE_STAGES` (le dormant en est exclu : il a sa propre routine).
   */
  async dealCloseDatesSoon(
    workspaceId: string,
    days = 14,
  ): Promise<RoutineRead<{ label: string; stage: string; days: number }>> {
    return this.rows(
      `SELECT o.label, o.stage, (o.expected_close_on - CURRENT_DATE)::int AS days
         FROM opportunities o
        WHERE o.workspace_id = $1
          AND ${projectStageInSql('o.stage', LIVE_STAGES)}
          AND o.closed_at IS NULL
          AND o.expected_close_on IS NOT NULL
          AND o.expected_close_on >= CURRENT_DATE
          AND o.expected_close_on <= CURRENT_DATE + ($2 || ' days')::interval
        ORDER BY o.expected_close_on ASC
        LIMIT 20`,
      [workspaceId, days],
      'dealCloseDatesSoon',
    )
  }

  async dealCloseDatesOverdue(
    workspaceId: string,
  ): Promise<RoutineRead<{ label: string; stage: string; days: number }>> {
    return this.rows(
      `SELECT o.label, o.stage, (CURRENT_DATE - o.expected_close_on)::int AS days
         FROM opportunities o
        WHERE o.workspace_id = $1
          AND ${projectStageInSql('o.stage', LIVE_STAGES)}
          AND o.closed_at IS NULL
          AND o.expected_close_on IS NOT NULL
          AND o.expected_close_on < CURRENT_DATE
        ORDER BY o.expected_close_on ASC
        LIMIT 20`,
      [workspaceId],
      'dealCloseDatesOverdue',
    )
  }

  async dealsWithoutCloseDate(workspaceId: string): Promise<RoutineRead<{ label: string; stage: string }>> {
    return this.rows(
      `SELECT o.label, o.stage
         FROM opportunities o
        WHERE o.workspace_id = $1
          AND ${projectStageInSql('o.stage', NEAR_SIGNING_STAGES)}
          AND o.closed_at IS NULL
          AND o.expected_close_on IS NULL
        ORDER BY o.stage_entered_at ASC NULLS LAST
        LIMIT 20`,
      [workspaceId],
      'dealsWithoutCloseDate',
    )
  }

  /** Une affaire GAGNÉE il y a deux à six mois, sur un compte sans aucune affaire ouverte. */
  async wonDealsToExpand(workspaceId: string): Promise<RoutineRead<{ company_name: string; days: number }>> {
    return this.rows(
      `SELECT a.company_name,
              FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(o.closed_at, o.stage_entered_at))) / 86400)::int AS days
         FROM opportunities o
         JOIN accounts a ON a.id = o.account_id AND a.workspace_id = o.workspace_id
        WHERE o.workspace_id = $1
          AND o.stage = 'won'
          AND COALESCE(o.closed_at, o.stage_entered_at) IS NOT NULL
          AND COALESCE(o.closed_at, o.stage_entered_at) <= now() - interval '60 days'
          AND COALESCE(o.closed_at, o.stage_entered_at) > now() - interval '180 days'
          AND NOT EXISTS (
            SELECT 1 FROM opportunities open_o
             WHERE open_o.workspace_id = o.workspace_id
               AND open_o.account_id = o.account_id
               AND ${projectStageInSql('open_o.stage', LIVE_STAGES)}
          )
        ORDER BY COALESCE(o.closed_at, o.stage_entered_at) ASC
        LIMIT 20`,
      [workspaceId],
      'wonDealsToExpand',
    )
  }

  /** Une affaire PERDUE il y a six à huit mois, sur un compte sans aucune affaire ouverte. */
  async lostDealsToRevisit(
    workspaceId: string,
  ): Promise<RoutineRead<{ company_name: string; days: number; loss_reason: string | null }>> {
    return this.rows(
      `SELECT a.company_name, o.loss_reason,
              FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(o.closed_at, o.stage_entered_at))) / 86400)::int AS days
         FROM opportunities o
         JOIN accounts a ON a.id = o.account_id AND a.workspace_id = o.workspace_id
        WHERE o.workspace_id = $1
          AND o.stage = 'lost'
          AND COALESCE(o.closed_at, o.stage_entered_at) IS NOT NULL
          AND COALESCE(o.closed_at, o.stage_entered_at) <= now() - interval '180 days'
          AND COALESCE(o.closed_at, o.stage_entered_at) > now() - interval '240 days'
          AND NOT EXISTS (
            SELECT 1 FROM opportunities open_o
             WHERE open_o.workspace_id = o.workspace_id
               AND open_o.account_id = o.account_id
               AND ${projectStageInSql('open_o.stage', LIVE_STAGES)}
          )
        ORDER BY COALESCE(o.closed_at, o.stage_entered_at) ASC
        LIMIT 20`,
      [workspaceId],
      'lostDealsToRevisit',
    )
  }

  /** Les plans de compte non revus depuis `days` jours, du plus ancien d'abord. */
  async staleAccountPlans(
    workspaceId: string,
    days = 30,
  ): Promise<RoutineRead<{ company_name: string; days: number }>> {
    return this.rows(
      `SELECT a.company_name,
              FLOOR(EXTRACT(EPOCH FROM (now() - p.updated_at)) / 86400)::int AS days
         FROM action_plans p
         JOIN accounts a ON a.id = p.account_id
        WHERE p.workspace_id = $1 AND p.updated_at < now() - ($2 || ' days')::interval
        ORDER BY p.updated_at ASC
        LIMIT 20`,
      [workspaceId, days],
      'staleAccountPlans',
    )
  }

  /**
   * Les besoins ouverts depuis `days` jours sans aucune shortlist.
   *
   * Un besoin déclaré NON staffable est écarté : la question a déjà reçu sa
   * réponse, et la reposer chaque semaine apprendrait à ignorer la routine. Un
   * besoin `unknown`, lui, RESTE — il n'a pas été jugé non staffable, il n'a pas
   * été jugé du tout, et c'est exactement celui que la routine doit remonter.
   *
   * ⚠️ CETTE ROUTINE N'A JAMAIS PRODUIT UNE SEULE LIGNE (corrigé le 28/08/2026).
   * Le prédicat de staffabilité s'écrivait `COALESCE(n.staffable, true) = true`
   * sur une colonne `text NOT NULL DEFAULT 'unknown'` : Postgres refuse de faire
   * correspondre `text` et `boolean` et rejette la requête ENTIÈRE, à chaque
   * exécution. Le second défaut vivait dans la même clause — `NOT IN ('closed',
   * 'cancelled', 'filled')` nommait deux statuts qui n'existent pas, si bien
   * qu'un besoin gagné, perdu ou pourvu n'était pas exclu.
   *
   * Les deux prédicats se DEMANDENT désormais au contrat. C'est le fond de la
   * correction : ni la liste des statuts ouverts ni la forme de la porte G3 ne
   * se recopient dans une chaîne SQL, où rien ne les relit.
   */
  async needsWithoutShortlist(workspaceId: string, days = 5): Promise<RoutineRead<{ title: string; days: number }>> {
    return this.rows(needsWithoutShortlistSql(), [workspaceId, days], 'needsWithoutShortlist')
  }

  /**
   * Les besoins ENCORE OUVERTS de l'espace — #2782 / #2392.6.
   *
   * La revue hebdomadaire (`weeklyRecap`, routine-executors.ts) portait les
   * dossiers DÉCIDÉS (won/lost, {@link projectsDecidedThisWeek} juste
   * dessous) mais rien sur ce qui reste À DÉCIDER — le registre demande « les
   * deux séparément », jamais un solde qui les confondrait (même principe que
   * won/lost). `needStillOpenSql` est le MÊME prédicat que
   * {@link needsWithoutShortlistSql} lit déjà (GA-26) : aucune deuxième
   * définition d'« ouvert » pour un besoin dans ce fichier.
   */
  async openNeeds(workspaceId: string): Promise<RoutineRead<{ title: string }>> {
    return this.rows(
      `SELECT n.title
         FROM project_needs n
        WHERE n.workspace_id = $1
          AND ${needStillOpenSql('n.status')}
        ORDER BY n.created_at ASC
        LIMIT 50`,
      [workspaceId],
      'openNeeds',
    )
  }

  /**
   * Les dossiers RÉELLEMENT DÉCIDÉS depuis `since` — #2782 / #2392.6.
   *
   * `weekly_recap` (routine-executors.ts) ne comptait que les rendez-vous
   * TENUS : un signal d'AGENDA, jamais un signal de PIPE. « Trois rendez-vous »
   * ne dit pas si un dossier a avancé. `DECIDED_STAGES` (won/lost) est la même
   * énumération que `stalledProjects` lit à l'envers (`UNDECIDED_STAGES`) — ce
   * n'est donc pas une troisième liste de stades à tenir à jour.
   *
   * ⚠️ AUCUNE probabilité, aucun prévisionnel pondéré (doctrine du dépôt) :
   * cette lecture ne compte QUE ce qui s'est réellement conclu (`closed_at`
   * posé), jamais ce qui pourrait se conclure — c'est `projectsExpectedToCloseSoon`
   * juste en dessous qui porte cette question, séparément.
   */
  async projectsDecidedThisWeek(
    workspaceId: string,
    since: Date,
  ): Promise<RoutineRead<{ label: string; stage: string }>> {
    return this.rows(
      `SELECT o.label, o.stage
         FROM opportunities o
        WHERE o.workspace_id = $1
          AND ${projectStageInSql('o.stage', DECIDED_STAGES)}
          AND o.closed_at IS NOT NULL
          AND o.closed_at >= $2
        ORDER BY o.closed_at DESC
        LIMIT 20`,
      [workspaceId, since.toISOString()],
      'projectsDecidedThisWeek',
    )
  }

  /**
   * Les dossiers OUVERTS dont l'échéance ATTENDUE tombe dans la fenêtre donnée
   * — #2782 / #2392.8 (« le forecast se prépare, il ne se fabrique pas »).
   *
   * `expected_close_on` est une date SAISIE par le commercial, jamais dérivée
   * ni devinée : une ligne ici dit « quelqu'un a estimé que ce dossier se
   * conclurait à cette date », pas « ce dossier a X % de chances de se
   * conclure ». Aucune pondération, aucune probabilité — l'appelant qui trouve
   * `rows` vide DIT qu'il n'a pas assez d'éléments pour préparer un forecast,
   * il n'en fabrique pas un.
   *
   * `OPEN_PIPELINE_STAGES` exclut `won` : un dossier déjà gagné n'est plus une
   * question de forecast, c'est `projectsDecidedThisWeek` qui le porte.
   */
  async projectsExpectedToCloseSoon(
    workspaceId: string,
    from: Date,
    to: Date,
  ): Promise<RoutineRead<{ label: string; stage: string; expected_close_on: string }>> {
    return this.rows(
      `SELECT o.label, o.stage, o.expected_close_on
         FROM opportunities o
        WHERE o.workspace_id = $1
          AND ${projectStageInSql('o.stage', OPEN_PIPELINE_STAGES)}
          AND o.expected_close_on IS NOT NULL
          AND o.expected_close_on BETWEEN $2 AND $3
        ORDER BY o.expected_close_on ASC
        LIMIT 20`,
      [workspaceId, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)],
      'projectsExpectedToCloseSoon',
    )
  }

  /**
   * Les comptes dont le refus a fait son temps (tome 1 §11.5).
   *
   * Le déclencheur n'est pas un signal, c'est le TEMPS — et c'est ce qui manquait :
   * `parked_account_signal` ne rouvrait un compte que si quelque chose bougeait,
   * si bien qu'un « pas de budget » de janvier restait écarté pour toujours dans
   * un compte silencieux. Or c'est exactement le cas que raconte le bêta
   * testeur : « je l'avais vue trois mois avant, elle m'a dit non, j'avais lâché
   * l'affaire » — puis elle lui confie des besoins.
   *
   * La cadence dépend du MOTIF, et elle est calculée par une fonction pure
   * (`isReexaminationDue`) plutôt qu'en SQL : « ne plus me contacter » ne se
   * rouvre jamais, et une règle aussi lourde de conséquence ne doit pas vivre
   * dans une clause `WHERE` que personne ne relit.
   *
   * ⚠️ L'ÉCHÉANCE CONNUE AVANCE LE RÉEXAMEN. Le tome écrit « déjà un
   * prestataire → à l'échéance du contrat SI CONNUE, sinon 12 mois », et le
   * dépôt connaît cette échéance depuis le 23/08 : `access_facts.reopens_on`,
   * calculée depuis l'attribution DECP. Les deux moitiés ne se parlaient pas —
   * l'alerte de fenêtre disait « prépare tes preuves, ça s'ouvre dans neuf
   * mois » pendant que cette routine gardait le compte écarté douze mois, donc
   * au-delà du seul moment où le panel s'ouvre.
   *
   * La jointure prend la PLUS PROCHE échéance connue du compte (une entité peut
   * en porter plusieurs) ; la fonction pure décide ensuite, et ne retient jamais
   * une date plus lointaine que la cadence du motif.
   */
  async accountsDueForReexamination(workspaceId: string, now = new Date()): Promise<RoutineRead<ParkedAccount>> {
    const read = await this.rows<ParkedAccount & { reopens_on: string | null }>(
      `SELECT a.company_name,
              COALESCE(a.gate_reason, '') AS gate_reason,
              a.gate_decided_at,
              (SELECT MIN(f.reopens_on)
                 FROM access_facts f
                WHERE f.account_id = a.id
                  AND f.reopens_on IS NOT NULL) AS reopens_on
         FROM accounts a
        WHERE a.workspace_id = $1
          AND a.priority_gate = 'parked'
          AND a.gate_decided_at IS NOT NULL
          AND a.status NOT IN ('deleted', 'archived')
        ORDER BY a.gate_decided_at ASC
        LIMIT 50`,
      [workspaceId],
      'accountsDueForReexamination',
    )
    // Le filtre après-coup ne PORTE PAS la mesure : sur un échec, `read.rows`
    // est déjà vide, et le filtrer ne le rend pas « mesuré ». `measured` se
    // relaie tel quel.
    return {
      measured: read.measured,
      rows: read.rows.filter(row =>
        isReexaminationDue(row.gate_reason || null, row.gate_decided_at, now, {
          reopensOn: row.reopens_on ? new Date(row.reopens_on).toISOString() : null,
        }),
      ),
    }
  }

  /**
   * Les comptes ÉCARTÉS dont le dossier a bougé APRÈS la décision.
   *
   * La comparaison porte sur la date de décision : un signal antérieur à
   * l'écart ne le remet pas en question — il était sous les yeux de celui qui a
   * décidé. Sans date de décision, aucun rappel : on ne sait pas si le signal
   * est postérieur.
   *
   * ⚠️ UN REFUS DÉFINITIF FERME AUSSI CETTE VOIE. Un compte écarté se rouvre par
   * deux chemins — le temps écoulé et « il s'est passé quelque chose » — et
   * seule la cadence gardait « ne plus me contacter ». Ici, rien ne le filtrait :
   * un compte dont l'interlocuteur avait demandé à ne plus être contacté
   * remontait dans les propositions dès qu'un signal arrivait. Le tome 1
   * l'interdit en toutes lettres (« opt-out : jamais relancé », U34), et c'est
   * la faute la plus visible qu'un outil de prospection puisse commettre.
   *
   * Le filtre est appliqué en TypeScript, avec la liste du contrat, plutôt que
   * dans le `WHERE` : recopié en SQL, il divergerait le jour où un motif
   * définitif s'ajoute — et personne ne relit une clause `WHERE`.
   */
  async parkedAccountsWithSignal(
    workspaceId: string,
  ): Promise<RoutineRead<{ company_name: string; gate_reason: string }>> {
    const read = await this.rows<{ company_name: string; gate_reason: string }>(
      `SELECT a.company_name, COALESCE(a.gate_reason, '') AS gate_reason
         FROM accounts a
        WHERE a.workspace_id = $1
          AND a.priority_gate = 'parked'
          AND a.gate_decided_at IS NOT NULL
          AND a.updated_at > a.gate_decided_at
          AND jsonb_array_length(COALESCE(a.recent_signals, '[]'::jsonb)) > 0
        ORDER BY a.updated_at DESC
        LIMIT 20`,
      [workspaceId],
      'parkedAccountsWithSignal',
    )
    return {
      measured: read.measured,
      rows: read.rows.filter(row => !isDefinitiveRefusal(row.gate_reason)).slice(0, 10),
    }
  }

  /**
   * Les contacts dont l'employeur du dernier enrichissement ne correspond plus
   * au compte de la fiche — COMPTES ordinaires, puis ESN du référentiel
   * partagé (§13, PDF 2, et le second marché du tome 4).
   *
   * Une comparaison de LIBELLÉS, donc approximative — et c'est pour ça que la
   * routine notifie « à vérifier » et ne modifie jamais une fiche. Un contact
   * jamais enrichi n'apparaît pas : il n'y a rien à comparer.
   *
   * ⚠️ La requête des COMPTES, ci-dessous, N'A PAS BOUGÉ : c'est exactement
   * celle qui existait avant que `esnContactsWhoMayHaveMoved` n'existe.
   * `crm-routines.service.spec.ts` la fige au caractère près.
   *
   * Les deux populations SE RECOUVRENT quand le compte suivi d'un contact est
   * LUI-MÊME une ESN du référentiel : rien n'excluait déjà ce cas côté comptes
   * (elle ne connaît pas `esn_directory`), donc la même personne ressortirait
   * deux fois sans `dedupeContactMoves` — deux signaux pour un seul contact.
   * Voir sa doc pour l'arbitrage : le signal ESN GAGNE.
   */
  async contactsWhoMayHaveMoved(workspaceId: string): Promise<RoutineRead<ContactMove>> {
    const [accountMoves, esnMoves] = await Promise.all([
      this.rows<ContactMove>(contactMovesAccountsSql(), [workspaceId], 'contactMovesAccounts'),
      this.esnContactsWhoMayHaveMoved(workspaceId),
    ])
    return {
      // Une SEULE des deux lectures en échec suffit à rendre l'image
      // INCOMPLÈTE — mais pas à jeter ce que l'autre a trouvé. C'est la
      // résilience du §13 : cinq automatisations, une casse, les quatre autres
      // (et la moitié mesurée ICI) sortent quand même.
      measured: accountMoves.measured && esnMoves.measured,
      rows: dedupeContactMoves(esnMoves.rows, accountMoves.rows),
    }
  }

  /**
   * LE MÊME PATRON que `contactsWhoMayHaveMoved`, avec la bonne jointure :
   * `esn_directory` au lieu de `accounts`. Un contact rattaché à une ESN
   * partenaire qui change d'employeur n'était jamais détecté — le signal qui
   * vaut le plus sur le second marché (tome 4).
   *
   * ⚠️ LA FORME RÉELLE D'`esn_directory` : table PARTAGÉE entre espaces, SANS
   * `workspace_id`, SANS clé étrangère vers `contacts` (voir son entité —
   * `esn-directory.entity.ts`). Le seul pont documenté vers un compte d'espace
   * est le SIREN : `partner_relations.siren` le dit déjà, « un LIEN vers
   * `esn_directory`, pas une clé étrangère ». Le rattachement d'un contact à
   * une ESN passe donc par SON COMPTE SUIVI (`contacts.account_id ->
   * accounts`), dont le SIREN matche une entrée du référentiel — jamais une
   * comparaison de libellés, qui se tromperait sur les innombrables homonymies
   * du secteur (« Sopra » / « Sopra Steria » / « Sopra Steria Next »). Un
   * compte sans SIREN ne matche donc jamais : ce n'est pas une lacune, c'est la
   * même prudence que le reste du fichier, qui ne devine jamais un
   * rattachement.
   */
  async esnContactsWhoMayHaveMoved(workspaceId: string): Promise<RoutineRead<ContactMove>> {
    return this.rows(contactMovesEsnSql(), [workspaceId], 'contactMovesEsn')
  }

  /**
   * Ouvre une PORTE sur le nouveau compte, quand il est déjà suivi.
   *
   * Le badge RISQUE reste sur le compte d'origine : il dit une vérité — ne plus
   * écrire à cette personne là-bas. Ce qui manquait est l'autre moitié : un
   * contact qui change d'entreprise transforme une relation morte en porte
   * ouverte, dans un compte qu'on n'avait pas ciblé.
   *
   * Stade `detected` toujours (règle de non-régression du §4) : une porte n'est
   * pas une affaire, et aucune détection ne fait avancer un projet dans le pipe.
   * Idempotent par le libellé : la routine tourne tous les mois, elle ne doit
   * pas empiler douze fois la même porte.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE BARÈME DE PREUVE, EXIGÉ À LA CRÉATION
   * ─────────────────────────────────────────────────────────────────────────
   * `EVIDENCE_REQUIREMENTS.detected_project` demande un fait daté et sourcé
   * PLUS au moins un élément qui le rattache à un chantier — une offre ou un
   * domaine, un périmètre, un décideur, une prochaine action. Une porte
   * n'apporte que le fait, au mieux : un employeur détecté par comparaison de
   * LIBELLÉS, et rien qui dise quel travail il y aurait à faire. Elle entrait
   * pourtant dans la table sans confiance déclarée, et l'écran la comptait
   * parmi ses « 383 projets détectés à reprendre » — pour un seul projet
   * réellement au pipe. Le barème existe exactement pour ça, et personne ne
   * l'appelait.
   *
   * ⚠️ Le barème a été CORRIGÉ le 28/08/2026 (D27) : il exigeait deux faits
   * datés convergents, que la table ne peut pas porter. La porte ne le
   * franchit toujours pas, et c'est le bon verdict — ce qui a changé est que
   * le refus est désormais ATTEIGNABLE par une ligne qui le mérite, au lieu
   * d'être refusé à toutes.
   *
   * ⚠️ Ce qui ne satisfait pas le barème ne DISPARAÎT PAS. La porte est créée,
   * sous sa nature `signal`, à son étape, consultable : c'est le cas que le
   * tome 1 appelle « le plus rentable des six », et l'éteindre au nom de la
   * rigueur serait perdre la seule moitié rentable du traitement. Ce qui change
   * est ce qu'elle PRÉTEND être — sa confiance est celle de sa preuve — et le
   * refus est ÉCRIT plutôt que tu.
   */
  async openDoorFromMove(workspaceId: string, move: ContactMove): Promise<boolean> {
    if (!move.new_account_id) return false
    const opening = jobChangeOpening({
      contactName: move.full_name,
      previousAccountName: move.company_name,
      newEmployer: move.new_employer,
      knownSince: move.known_since ? new Date(move.known_since).toLocaleDateString('fr-FR') : null,
    })
    if (!opening) return false

    const verdict = meetsEvidenceLevel(
      {
        // Le changement de poste est UN fait, daté par ce qu'on sait de la
        // relation. Sans cette date, il n'est même pas daté : le mot du refus
        // change, et il doit changer.
        datedFacts: move.known_since ? 1 : 0,
        // Personne n'a rien demandé, et c'est toute la différence entre une
        // porte et un besoin. La confondre fait écrire à un DSI qu'on a « noté
        // son besoin » quand il n'a rien dit.
        explicitlyExpressed: false,
        hasFit: false,
        hasPerimeter: false,
        hasDecisionMaker: false,
        hasNextAction: false,
      },
      'detected_project',
    )
    if (!verdict.met) {
      // Lisible, jamais silencieux. L'exigence est celle du barème, mot pour
      // mot : la reformuler ici garantirait deux versions divergentes.
      this.logger.log(
        `Porte ouverte pour ${move.full_name} chez ${move.new_employer} au niveau « fait », ` +
          `pas « projet détecté ». ${verdict.requirement.fr} ` +
          `Manque : ${verdict.missing.map(gap => EVIDENCE_GAP_LABELS[gap].fr).join(' ')}`,
      )
    }
    // La confiance suit la preuve, elle ne la précède pas. Même échelle que la
    // matérialisation des signaux (sans source : `low`, avec : `medium`) — il
    // n'y a pas deux barèmes de confiance dans ce dépôt.
    const confidence = verdict.met ? 'medium' : 'low'

    try {
      const inserted = await this.accounts.manager.query(
        `INSERT INTO opportunities
           (workspace_id, account_id, kind, label, detail, source, stage, stage_entered_at,
            access_mode, confidence, first_detected_at, updated_at)
         SELECT $1, $2, 'signal', $3, $4, $5, 'detected', now(), $6, $7, now(), now()
          WHERE NOT EXISTS (
            SELECT 1 FROM opportunities o
             WHERE o.account_id = $2 AND o.label = $3
          )
         RETURNING id`,
        [
          workspaceId,
          move.new_account_id,
          opening.label,
          opening.detail,
          'relation antérieure',
          opening.accessMode,
          confidence,
        ],
      )
      return returnedRows<{ id: string }>(inserted).length > 0
    } catch {
      // Une porte manquée se rattrape au balayage suivant ; une routine qui
      // tombe emporte les sept autres.
      return false
    }
  }

  /**
   * #2845 — MET EN PAUSE (jamais un arrêt) les séquences ACTIVES d'un contact
   * dont l'employeur détecté ne correspond plus au compte suivi
   * (`contactsWhoMayHaveMoved`). Cause `contact_to_verify`
   * (`OUTREACH_SEQUENCE_PAUSE_EVENTS`, déjà déclarée) — jusqu'ici SANS
   * appelant : `contactJobChange` (routine-executors.ts) détectait le contact
   * mais ne suspendait rien (#2160.51/.63).
   *
   * Même patron que `MailboxService.pauseSequencesForContact` (raw SQL + CTE
   * qui capture l'état PRÉCÉDENT en une seule requête, transition journalisée
   * dans `outreach_transitions`) — RAW SQL VOLONTAIRE : ce module ne dépend
   * jamais de `MailboxModule` (GA-07), la méthode vit ICI plutôt que d'être
   * importée.
   *
   * ⚠️ TOUTES LES SÉQUENCES ACTIVES DU CONTACT, TOUS PORTEURS — pas seulement
   * celles du porteur qui aurait détecté le changement : cette routine tourne
   * par WORKSPACE (`workspaceId`), pas par utilisateur, et plusieurs
   * commerciaux peuvent chacun porter une séquence vivante sur la même
   * personne. Le signal — l'employeur ne correspond plus au compte suivi —
   * vaut pour tout le monde à la fois, pas seulement pour celui qui l'a
   * détecté le premier.
   *
   * `actor: NULL` / `actor_kind: 'system'` — `outreach_transitions.actor` est
   * NULLABLE précisément pour cet acteur système sans utilisateur précis
   * (aucun humain n'a déclenché cette pause) ; `user_id` de la transition
   * reste celui du PROPRIÉTAIRE de la séquence (colonne NOT NULL), retrouvé
   * par la même requête plutôt qu'un import cross-module.
   *
   * ⚠️ Pas de `updated_at` dans l'UPDATE, à la différence du patron de
   * `mailbox.service.ts` : `outreach_sequences` NE PORTE PAS cette colonne
   * (`OutreachSequences1785830000000` — seule `created_at` existe) — l'écrire
   * ferait échouer la requête en production.
   *
   * Comme `openDoorFromMove`, une pause manquée ne fait jamais tomber les sept
   * autres routines : l'erreur est journalisée et le compte de pauses reste à
   * zéro plutôt que de remonter.
   */
  async pauseSequencesForJobChange(workspaceId: string, contactId: string): Promise<number> {
    try {
      const paused = await this.accounts.manager.query<{ id: string; user_id: string; previous_status: string }[]>(
        `WITH previous AS (
           SELECT id, user_id, status FROM outreach_sequences
            WHERE contact_id = $1 AND workspace_id = $2 AND status = 'active'
         ), updated AS (
           UPDATE outreach_sequences s SET status = 'paused'
             FROM previous WHERE s.id = previous.id
         )
         SELECT id, user_id, status AS previous_status FROM previous`,
        [contactId, workspaceId],
      )
      for (const row of paused) {
        await this.accounts.manager.query(
          `INSERT INTO outreach_transitions
             (workspace_id, user_id, subject_kind, subject_id, from_state, to_state, actor, actor_kind, cause, result)
           VALUES ($1, $2, 'sequence', $3, $4, 'paused', NULL, 'system', 'contact_to_verify', 'applied')`,
          [workspaceId, row.user_id, row.id, row.previous_status],
        )
      }
      return paused.length
    } catch (error) {
      this.logger.error('Pause de séquence sur changement de poste en échec (contact_to_verify)', { error })
      return 0
    }
  }

  /**
   * #4016.L2 / #4016.2c — les contacts dont l'employeur courant est À RELIRE (les
   * champions d'abord, puis les autres dans le budget restant) : porteurs d'un
   * identifiant d'annuaire (`raw_data.apolloId`), jamais contrôlés depuis `days`
   * jours, les plus anciens d'abord, au plus `limit`. Un échec rend `[]` : la
   * routine continue sur la détection existante.
   */
  async championsDueForEmploymentCheck(workspaceId: string, limit: number): Promise<EmploymentCheckTarget[]> {
    try {
      return await this.accounts.manager.query<EmploymentCheckTarget[]>(
        `${EMPLOYMENT_TARGET_SELECT}
          WHERE c.workspace_id = $1
            AND c.deleted_at IS NULL
            AND c.excluded_at IS NULL
            AND c.raw_data ->> 'apolloId' IS NOT NULL
            AND ${EMPLOYMENT_DUE_SQL}
          ORDER BY CASE WHEN lower(coalesce(c.decision_role, '')) IN ('champion', 'sponsor') THEN 0 ELSE 1 END,
                   (c.raw_data -> 'employmentCheck' ->> 'at') ASC NULLS FIRST
          LIMIT $3`,
        [workspaceId, EMPLOYMENT_CHECK_EVERY_DAYS, limit],
      )
    } catch (error) {
      this.logger.error('Lecture des champions à contrôler en échec (employment-check)', { error })
      return []
    }
  }

  /**
   * #4286.13 — le contact à relire à l'ouverture de sa fiche : la MÊME lecture et la MÊME règle d'échéance que
   * `championsDueForEmploymentCheck` (30 jours), pour UN contact. `null` s'il n'est plus dû (relu entre-temps), s'il
   * n'a pas d'identifiant d'annuaire, ou si la lecture échoue — la relecture est alors simplement sautée.
   */
  async employmentCheckTargetFor(workspaceId: string, contactId: string): Promise<EmploymentCheckTarget | null> {
    try {
      const rows = await this.accounts.manager.query<EmploymentCheckTarget[]>(
        `${EMPLOYMENT_TARGET_SELECT}
          WHERE c.workspace_id = $1
            AND c.id = $3
            AND c.deleted_at IS NULL
            AND c.excluded_at IS NULL
            AND c.raw_data ->> 'apolloId' IS NOT NULL
            AND ${EMPLOYMENT_DUE_SQL}
          LIMIT 1`,
        [workspaceId, EMPLOYMENT_CHECK_EVERY_DAYS, contactId],
      )
      return rows[0] ?? null
    } catch (error) {
      this.logger.error('Lecture du contact à relire en échec (employment-check)', { error })
      return null
    }
  }

  /**
   * #4016.L2 — consigne le contrôle (« vu le <date> », c67) et, si l'annuaire
   * donne un employeur, le pose là où la détection de changement de poste le lit
   * (`apolloDetails.organization`). Rien lu (`null`) : seul le passage est daté,
   * l'employeur connu n'est jamais touché.
   */
  async recordEmploymentCheck(
    workspaceId: string,
    contactId: string,
    seen: ObservedEmployment | null,
    now: Date,
    accountName: string | null = null,
    /** Apollo Professional (02/11) — l'état lu sur un parcours DATÉ (People-Match) ; absent ⇒ comparaison d'employeurs. */
    reading?: { state: 'confirmed' | 'left' | 'not_found'; leftOn?: string },
  ): Promise<void> {
    const state = reading?.state ?? employmentCheckState(seen, accountName)
    const check = JSON.stringify({
      at: now.toISOString(),
      source: 'annuaire_professionnel',
      // #4055.8 — l'état DATÉ de la relecture ; « a quitté » ne s'écrit que sur un autre employeur observé.
      state,
      ...(seen ? { organization: seen.organization } : {}),
      // Date de fin de l'expérience chez l'employeur du compte, lue sur le parcours (jamais devinée).
      ...(state === 'left' && reading?.leftOn ? { leftOn: reading.leftOn } : {}),
    })
    try {
      if (seen) {
        await this.accounts.manager.query(
          `UPDATE contacts
              SET raw_data = jsonb_set(
                    jsonb_set(raw_data, '{apolloDetails}',
                      coalesce(raw_data -> 'apolloDetails', '{}'::jsonb) || jsonb_build_object('organization', $3::text)),
                    '{employmentCheck}', $4::jsonb)
            WHERE id = $1 AND workspace_id = $2`,
          [contactId, workspaceId, seen.organization, check],
        )
        // #4465 — un départ PROUVÉ (autre employeur observé, daté) sort la personne de la liste « dans l'entreprise » :
        // elle passe en « ancien » (`historique`), jamais supprimée. Même sortie que le signal de lecture (RISQUE).
        if (state === 'left') await this.archiveDepartedContact(workspaceId, contactId)
      } else {
        await this.accounts.manager.query(
          `UPDATE contacts
              SET raw_data = jsonb_set(raw_data, '{employmentCheck}', $3::jsonb)
            WHERE id = $1 AND workspace_id = $2`,
          [contactId, workspaceId, check],
        )
      }
    } catch (error) {
      this.logger.error('Contrôle d’employeur non consigné (employment-check)', { error })
    }
  }

  /**
   * #4465 — range en `historique` le contact dont le départ est prouvé par la relecture, et le journalise (même table
   * que `syncContactLifecycle`). Une ligne `manual`/`crm` ne bouge pas (une correction humaine gagne), ni un contact
   * déjà `historique` ou `rejete`. On archive, on ne supprime pas : la fiche et ses échanges restent.
   */
  private async archiveDepartedContact(workspaceId: string, contactId: string): Promise<void> {
    try {
      const moved = returnedRows<{ id: string }>(
        await this.accounts.manager.query(
          `UPDATE contacts SET lifecycle_state = 'historique'
          WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
            AND coalesce(source, '') NOT IN ('manual', 'crm')
            AND coalesce(lifecycle_state, '') NOT IN ('historique', 'rejete')
        RETURNING id`,
          [contactId, workspaceId],
        ),
      )
      if (moved.length === 0) return
      // L'état d'avant n'est pas relu (cliquet GA-405 : aucune lecture brute de `contacts` de plus) : `from_state` NULL.
      await this.accounts.manager.query(
        `INSERT INTO contact_lifecycle_transitions (contact_id, from_state, to_state, source, actor)
         VALUES ($1, NULL, 'historique', NULL, NULL)`,
        [contactId],
      )
    } catch (error) {
      this.logger.error('Contact parti non rangé en historique (employment-check)', { error })
    }
  }

  /**
   * Une lecture qui dit CE QU'ELLE A PU FAIRE (D715, 30/08/2026).
   *
   * ⚠️ Jusqu'ici, un échec rendait `[]` — l'exacte même valeur qu'un vrai
   * zéro, et « je n'ai pas pu regarder » disparaissait de la trace au profit
   * de « il n'y a rien ». `measured: false` rétablit la différence sans
   * changer CE QUE CE `catch` PROTÈGE : il continue d'empêcher qu'une seule
   * requête cassée fasse tomber toute une routine — cinq automatisations, une
   * casse, les quatre autres tournent quand même — et il reste posé ICI,
   * autour de la lecture, jamais retiré. Ce qui change est ce que l'appelant
   * reçoit à la place d'un `[]` muet : de quoi DIRE l'échec plutôt que le
   * taire, et — pour les lectures à deux requêtes du §13 — de quoi garder ce
   * que l'autre moitié a quand même trouvé.
   *
   * `label` identifie QUELLE lecture a cassé parmi les sept que ce service
   * expose, pour que la trace serve à quelque chose. L'erreur elle-même ne
   * porte ni jeton ni e-mail ni secret : c'est une exception SQL du driver
   * Postgres, jamais une charge utile applicative.
   */
  private async rows<T>(sql: string, params: unknown[], label: string): Promise<RoutineRead<T>> {
    try {
      const rows = await this.accounts.manager.query<T[]>(sql, params)
      return { measured: true, rows }
    } catch (error) {
      // Convention du dépôt : logger.error(...), jamais Sentry direct — le
      // transport capture automatiquement avec le correlation-id.
      this.logger.error(`Lecture de routine CRM en échec (${label})`, { error })
      return { measured: false, rows: [] }
    }
  }

  /**
   * #3061 / #2374.19 — le seul reste de l'épopée : rien ne faisait RESSURGIR
   * d'elle-même une pause « pas maintenant » arrivée à échéance (le point
   * d'ancrage, `OutreachService.get`/`list`, ne le dit qu'à qui ouvre déjà la
   * fiche). Même DISTINCT ON que `notNowRevalidationInfo` (outreach.service.ts) :
   * la transition la plus RÉCENTE vers `paused` par séquence, filtrée sur la
   * cause `not_now_deferred` et le délai `NOT_NOW_REVALIDATION_DAYS` — jamais
   * recalculée, la même constante que la fiche contact.
   *
   * Elle ne reprend RIEN : ni la séquence, ni le poste, ni un envoi. Elle NOMME
   * poste_still_valid (la seule revérification automatique honnête, même fait
   * que `resume()`) — contexte/signal/pertinence restent hors de cette lecture,
   * l'exécuteur les nomme non évalués sans les deviner.
   */
  async notNowDeferredsDue(
    workspaceId: string,
    days: number = NOT_NOW_REVALIDATION_DAYS,
  ): Promise<RoutineRead<NotNowDeferredDue>> {
    return this.rows(
      `WITH last_pause AS (
         SELECT DISTINCT ON (subject_id) subject_id, cause, occurred_at
           FROM outreach_transitions
          WHERE subject_kind = 'sequence' AND to_state = 'paused' AND workspace_id = $1
          ORDER BY subject_id, occurred_at DESC
       )
       SELECT s.id AS sequence_id, c.full_name,
              (c.lifecycle_state <> 'historique') AS poste_still_valid,
              FLOOR(EXTRACT(EPOCH FROM (now() - lp.occurred_at)) / 86400)::int AS days
         FROM outreach_sequences s
         JOIN last_pause lp ON lp.subject_id = s.id
         JOIN contacts c ON c.id = s.contact_id
        WHERE s.workspace_id = $1
          AND s.status = 'paused'
          AND lp.cause = 'not_now_deferred'
          AND lp.occurred_at < now() - ($2 || ' days')::interval
        ORDER BY lp.occurred_at ASC
        LIMIT 20`,
      [workspaceId, days],
      'notNowDeferredsDue',
    )
  }
}

/** Une pause « pas maintenant » arrivée à échéance de revérification. */
type NotNowDeferredDue = {
  sequence_id: string
  full_name: string
  poste_still_valid: boolean
  days: number
}
