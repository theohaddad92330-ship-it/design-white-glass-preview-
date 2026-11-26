import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import {
  HYGIENE_CHECKS,
  OPPORTUNITIES_ACTIVE_FROM_SQL,
  OPPORTUNITIES_ACTIVE_SQL,
  needStillOpenSql,
  type DataHygiene,
  type HygieneCheck,
  type HygieneLine,
} from '@bellum/contracts'
import { ACCOUNT_HYGIENE_PREDICATES } from '../accounts/account-hygiene.sql'

/**
 * La vue Qualité des données (PDF 8 §6.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHAQUE LIGNE MÈNE QUELQUE PART
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un indicateur de qualité qui ne mène nulle part ne sert à rien. » Les huit
 * lignes livrées sont exactement celles dont l'écran de destination EXISTE : une
 * ligne qui afficherait un compte sans qu'on puisse ouvrir la liste
 * transformerait une liste de travail en reproche.
 *
 * Le §6.3 en décrit une neuvième — « champs en conflit (provenance) ». Elle n'est
 * pas livrée : `field_provenance` enregistre d'où vient une valeur, jamais qu'une
 * autre source en propose une différente. Compter les lignes de provenance
 * donnerait un nombre qui n'a rien à voir avec un conflit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `null` PLUTÔT QUE ZÉRO, LIGNE PAR LIGNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque compte est lu séparément et échoue séparément. Un `Promise.all` ferait
 * disparaître les huit lignes parce qu'une seule requête a raté — et l'écran ne
 * dirait pas laquelle. Une lecture en échec rend `null`, qui s'affiche « non
 * lu » : un zéro se lirait « tout est propre », ce qui est exactement l'inverse
 * de ce qu'on sait.
 */
@Injectable()
export class DataHygieneService {
  private readonly logger = new Logger(DataHygieneService.name)

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async overview(workspaceId: string): Promise<DataHygiene> {
    const lines = await Promise.all(HYGIENE_CHECKS.map(key => this.line(key, workspaceId)))
    return { lines }
  }

  private async line(key: HygieneCheck, workspaceId: string): Promise<HygieneLine> {
    const link = LINKS[key]
    try {
      const [row] = await this.dataSource.query<{ n: string; total: string | null }[]>(QUERIES[key], [workspaceId])
      return {
        key,
        count: Number(row?.n ?? 0),
        total: row?.total === null || row?.total === undefined ? null : Number(row.total),
        link,
      }
    } catch (error) {
      // `error` et non `warn` : une ligne d'hygiène qui échoue n'est pas un
      // état dégradé, c'est un BUG — une requête cassée affiche « non lu » pour
      // toujours, et personne ne va vérifier une ligne qui a l'air d'attendre
      // une donnée. Le transport Sentry ne capture que les `error`.
      this.logger.error(`Hygiène ${key} illisible`, { error, tags: { hygiene: key } })
      return { key, count: null, total: null, link }
    }
  }
}

/**
 * L'écran qui montre LES OBJETS COMPTÉS — pas un écran du même sujet.
 *
 * Tous existent, et `hygiene-routes.spec.ts` le vérifie à chaque exécution des
 * tests. Depuis le 29/08/2026, elle vérifie aussi que la destination LIT la
 * population comptée : l'existence de la route ne suffisait pas.
 *
 * ⚠️ `unresolved_duplicates` a pointé sur `/team` jusqu'à cette date. `/team`
 * rend la couverture des comptes PAR COMMERCIAL — des comptes suivis par
 * plusieurs personnes — qui n'a rien à voir avec une paire de `duplicate_pairs`.
 * La route existait, donc la garde disait oui, et le lien envoyait chercher des
 * doublons là où il n'y en a jamais eu. Il mène désormais à `/contacts`, qui porte le
 * bloc d'arbitrage (Qualité des données, son premier hôte, est supprimé) : ces paires sont produites par la base
 * de l'espace, pas par un CRM, et le geste ne doit donc dépendre d'aucun
 * connecteur.
 */
const LINKS: Record<HygieneCheck, string> = {
  accounts_without_next_action: '/accounts',
  contacts_without_email: '/contacts',
  projects_without_amount: '/projects',
  missions_without_end_date: '/missions',
  needs_without_skills: '/projects/needs',
  // 16/09/2026 — le pool de réactivation est devenu une VUE du Vivier
  // (#2152.39/.40). `/consultants/pool` redirige, et une destination qui
  // redirige fait faire un aller-retour à qui la suit : on pointe la vue.
  talents_unknown_availability: '/consultants?view=reactivation',
  // 14/10/2026 (refonte Pilotage, L0a) — l'onglet Qualité des données est
  // supprimé : le panneau d'arbitrage vit sur `/contacts` (section « Doublons à
  // trancher », ancre `#hygiene-doublons` posée par le web).
  // #4503.7 (PR 12C, Louis 24/10) — le panneau a quitté la liste pour l'onglet « Imports & sources » : on pointe
  // la vue, pas `/contacts` qui ne ferait que rediriger.
  unresolved_duplicates: '/contacts/imports',
  missions_without_cost: '/missions/facturation',
  // #2126.59 — la fiche reste au dossier contacts ; c'est là qu'on la reprend.
  contacts_flagged_incorrect: '/contacts',
}

const QUERIES: Record<HygieneCheck, string> = {
  // Un compte SUIVI sur lequel aucune tâche OUVERTE n'est encore à échoir. Un
  // compte qu'on ne suit pas n'a rien à voir ici : il n'attend rien de personne.
  //
  // ⚠️ Les prédicats sont RÉFÉRENCÉS, pas recopiés. Ils vivent dans
  // `accounts/account-hygiene.sql.ts` — le cockpit les COMPTE, la ligne du
  // portefeuille les DÉSIGNE, et une copie qui se recopie finit par diverger.
  // C'est déjà arrivé le 28/08/2026 sur « encore à faire ». Garde GA-53.
  accounts_without_next_action: `
    SELECT COUNT(*) FILTER (WHERE ${ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask})::int AS n,
           COUNT(*)::int AS total
      FROM accounts a
     WHERE a.workspace_id = $1
       AND ${ACCOUNT_HYGIENE_PREDICATES.followedAccounts}`,
  contacts_without_email: `
    SELECT COUNT(*) FILTER (WHERE ${ACCOUNT_HYGIENE_PREDICATES.contactWithoutEmail})::int AS n,
           COUNT(*)::int AS total
      FROM contacts WHERE workspace_id = $1`,
  // #4191 (G2) — le dénominateur est la définition de `opportunities_active`
  // (GET /crm-counters) : les affaires ACTIVES du Pipe, non archivées. Les
  // fragments sont PARTAGÉS (`OPPORTUNITIES_ACTIVE_SQL`), pas recopiés. Avant,
  // `LIVE_STAGES` (intake compris, archivées comprises) affichait « 453 sur
  // 462 » face à ~15 affaires au Pipe. Le numérateur se prend DANS ces affaires.
  projects_without_amount: `
    SELECT COUNT(*) FILTER (WHERE o.amount_cents IS NULL)::int AS n,
           COUNT(*)::int AS total
      ${OPPORTUNITIES_ACTIVE_FROM_SQL}
     WHERE ${OPPORTUNITIES_ACTIVE_SQL}`,
  missions_without_end_date: `
    SELECT COUNT(*) FILTER (WHERE ends_on IS NULL)::int AS n,
           COUNT(*)::int AS total
      FROM missions WHERE workspace_id = $1 AND status = 'active'`,
  needs_without_skills: `
    SELECT COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(skills, '[]'::jsonb)) = 0)::int AS n,
           COUNT(*)::int AS total
      FROM project_needs
     WHERE workspace_id = $1 AND ${needStillOpenSql('status')}`,
  // Ni disponibilité saisie, ni affectation en cours : le matching travaille à
  // l'aveugle sur ces profils. #3488 — les ARCHIVÉS sortent du compte, comme du
  // vivier actif : « 0 sur 20 » au-dessus d'un vivier vide se contredisait.
  talents_unknown_availability: `
    SELECT COUNT(*) FILTER (
             WHERE COALESCE(btrim(c.availability), '') = ''
               AND NOT EXISTS (
                 SELECT 1 FROM mission_assignments asg
                   JOIN missions m ON m.id = asg.mission_id
                  WHERE m.workspace_id = $1 AND asg.consultant_id = c.id
                    AND (asg.ends_on IS NULL OR asg.ends_on >= CURRENT_DATE))
           )::int AS n,
           COUNT(*)::int AS total
      FROM consultants c
     WHERE c.workspace_id = $1 AND c.kind = 'consultant' AND c.archived_at IS NULL`,
  // Un doublon n'est pas une PART de quelque chose : pas de dénominateur.
  unresolved_duplicates: `
    SELECT COUNT(*)::int AS n, NULL::int AS total
      FROM duplicate_pairs WHERE workspace_id = $1 AND decision = 'pending'`,
  missions_without_cost: `
    SELECT COUNT(*) FILTER (WHERE t.loaded_daily_cost_cents IS NULL)::int AS n,
           COUNT(*)::int AS total
      FROM missions m
      LEFT JOIN mission_commercial_terms t ON t.mission_id = m.id
     WHERE m.workspace_id = $1 AND m.status = 'active'`,
  // #2126.59 — un contact FLAGGÉ n'est pas une PART de quelque chose (même
  // raison que « unresolved_duplicates » juste au-dessus) : pas de dénominateur.
  // `DISTINCT` : un même contact peut porter plusieurs outcomes `incorrect_contact`
  // (une correction humaine n'efface jamais le fait précédent, #2126.60).
  contacts_flagged_incorrect: `
    SELECT COUNT(DISTINCT co.contact_id)::int AS n, NULL::int AS total
      FROM commercial_outcomes co
      JOIN contacts c ON c.id = co.contact_id
     WHERE co.workspace_id = $1 AND co.outcome_type = 'incorrect_contact' AND c.deleted_at IS NULL`,
}
