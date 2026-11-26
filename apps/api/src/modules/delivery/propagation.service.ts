import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  aggregateMargin,
  financeScopeClause,
  missionsOfAccount,
  missionsOfConsultant,
  propagated,
  redactFinance,
  type AccountPropagation,
  type AccountRevenuePropagation,
  type ConsultantMarginPropagation,
  type ConsultantPropagation,
  type ContactPropagation,
  type FinancePropagationDigest,
  type FinanceScope,
  type PropagationDigest,
} from '@bellum/contracts'
import { MissionEntity } from '../../database/entities/mission.entity'
import { loadedCostCents } from './revenue.service'

/**
 * LES SIX AGRÉGATS DE PROPAGATION (PDF 2 du dossier du 26/08, §4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE SERT, ET POURQUOI IL EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Sans lui, un commercial entre en rendez-vous chez un client sans savoir ce
 * que ce client lui a rapporté. Les données existent depuis le Delivery OS —
 * missions, mois facturés, affectations — mais elles ne vivent que sur l'écran
 * des Missions. §4.1 : « une donnée du back-office apparaît partout où elle
 * change une décision. »
 *
 * Cinq agrégats ici ; le sixième — la DERNIÈRE MISSION par consultant — est
 * déjà livré (`talent.service.ts`, `DISTINCT ON (ma.consultant_id)`) et n'est
 * pas refait : le motif qui revient dans tous les chantiers de ce dépôt est
 * « du code juste que personne n'appelle », pas « du code manquant ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ §4.4 — CHAQUE BLOC PORTE SA SOURCE, ET NE S'ÉDITE JAMAIS SUR PLACE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le CA cumulé d'un compte se LIT sur la fiche compte ; il se CALCULE dans les
 * missions ; on ne le corrige pas depuis le compte. Sans cette règle, le même
 * chiffre devient corrigible à deux endroits et les deux divergent.
 *
 * Elle est tenue par le CODE et pas par une convention : tout ce que ce service
 * rend passe par `propagated(…, source)`, qui pose le lien ET `editable: false`
 * — et ce fichier n'a AUCUN chemin d'écriture, ce que
 * `propagation-source-link.spec.ts` vérifie en relisant son texte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AUCUN `COALESCE(SUM(…), 0)` — LA CAUSE RACINE DÉJÀ PAYÉE TROIS FOIS
 * ─────────────────────────────────────────────────────────────────────────────
 * `SUM` et `AVG` rendent `NULL` quand il n'y a rien à sommer, et c'est
 * exactement ce qu'on veut : un compte sans mission n'a pas « rapporté 0 € »,
 * il n'a rien à afficher. Un compte sans aucune ligne ne produit d'ailleurs
 * AUCUNE entrée — la liste est vide, l'écran n'écrit rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CINQ REQUÊTES GROUPÉES, JAMAIS N
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois pour le digest d'espace, deux pour le digest financier — le même nombre
 * sur un compte que sur trois cents. Un agrégat par ligne rendrait la liste du
 * portefeuille inutilisable ; c'est le défaut que `loadedCostsByMission` et
 * `assigneesByMission` avaient déjà corrigé dans ce module.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUCUN try/catch, DÉLIBÉRÉMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Même parti pris que `accountNamesOf` : ces chiffres SONT la réponse, pas une
 * décoration. Une table illisible doit faire échouer la lecture — l'écran dit
 * alors « les chiffres n'ont pas pu être chargés », ce qui est vrai — plutôt
 * que de rendre des listes vides qui se lisent « ce client ne vous a jamais
 * rien rapporté ». « Cassé » et « non mesurable » se ressemblent trop pour
 * qu'on les confonde ici.
 */
@Injectable()
export class PropagationService {
  constructor(
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
  ) {}

  /**
   * Les trois agrégats qui ne portent AUCUN montant gardé.
   *
   * Le tarif vendu moyen en fait partie : le prix de VENTE est visible par
   * design (doctrine de `mission.ts`, 28/08/2026), ce sont les entrées de la
   * marge qui se gardent. Deux fausses alertes ont déjà été levées là-dessus.
   */
  async digest(workspaceId: string): Promise<PropagationDigest> {
    const [accounts, contacts, consultants] = await Promise.all([
      this.accountsOf(workspaceId),
      this.contactsOf(workspaceId),
      this.placementsOf(workspaceId),
    ])
    return { accounts, contacts, consultants }
  }

  /**
   * Les deux agrégats sous droit financier, chacun avec SON droit.
   *
   * Le CA cumulé accepte les deux portées de D1 (`finance:read` voit l'espace,
   * `finance:read:own` restreint au portefeuille) — c'est l'agrégat par compte
   * de la ligne « facturé » du chiffre d'affaires, et le servir sous un autre
   * droit que sa ligne serait le vrai défaut.
   *
   * La marge par consultant, elle, décrit l'ÉQUIPE : un consultant n'a pas de
   * propriétaire commercial, et lui en inventer un pour les besoins d'un filtre
   * produirait une marge fausse. Elle reste donc sous `finance:read` seul —
   * même raison que `capacity` et `margin-by-channel` — et se vide par
   * `redactFinance` pour qui ne l'a pas.
   */
  async financeDigest(scope: FinanceScope, canReadFinance: boolean): Promise<FinancePropagationDigest> {
    const [accounts, consultants] = await Promise.all([
      this.revenueOf(scope),
      this.marginsOf(scope.workspaceId, canReadFinance),
    ])
    return { accounts, consultants, canReadFinance }
  }

  /* ── 3. Tarif vendu moyen par compte, et le « sur N missions » ─────────── */

  /**
   * ⚠️ `AVG(m.daily_rate)` et non `COALESCE(AVG(…), 0)` : `AVG` ignore les
   * `NULL` et rend `NULL` quand il n'en reste aucun. Un compte qui n'a que des
   * forfaits — lesquels se facturent aux jalons et ne portent aucun TJM —
   * afficherait sinon « ce client achète à 0 € », ce qu'aucun écran ne peut
   * rattraper.
   */
  private async accountsOf(workspaceId: string): Promise<AccountPropagation[]> {
    const rows = await this.missions.manager.query<
      { account_id: string; missions: string; missions_without_rate: string; average_daily_rate: string | null }[]
    >(
      `SELECT m.account_id,
              COUNT(*)::text AS missions,
              COUNT(*) FILTER (WHERE m.daily_rate IS NULL)::text AS missions_without_rate,
              AVG(m.daily_rate)::text AS average_daily_rate
         FROM missions m
        WHERE m.workspace_id = $1
        GROUP BY m.account_id`,
      [workspaceId],
    )
    return (rows ?? []).map(row =>
      propagated(
        {
          accountId: row.account_id,
          missions: count(row.missions),
          missionsWithoutRate: count(row.missions_without_rate),
          // `daily_rate` est en EUROS (`numeric`) ; la réponse est en centimes,
          // comme tous les montants du produit.
          averageSoldDailyRateCents: euroToCents(row.average_daily_rate),
        },
        missionsOfAccount(row.account_id),
      ),
    )
  }

  /* ── 2. Missions signées par contact ───────────────────────────────────── */

  /**
   * « Ce contact a signé 2 missions. »
   *
   * DEUX chemins, réunis par un `UNION` : le contact à qui la facture part
   * (`missions.billing_contact_id`) et celui qui tient un rôle d'ACHAT sur le
   * projet qui a produit la mission. Ni l'un ni l'autre seul ne suffit — une
   * ESN qui ne remplit pas le contact de facturation perdrait le badge, et un
   * projet sans comité aussi.
   *
   * ⚠️ Les rôles `prescripteur`, `utilisateur` et `bloqueur` sont EXCLUS : ils
   * n'ont rien signé. Les compter ferait d'un prospect un client, ce qui est
   * exactement l'erreur que ce badge existe pour empêcher.
   *
   * ⚠️ `COUNT(DISTINCT)` : un contact à la fois destinataire de la facture et
   * acheteur du projet compterait sinon la même mission deux fois.
   *
   * Le compte est celui du CONTACT et non celui de la mission : `contacts.id`
   * est unique, donc une ligne par contact — grouper sur le compte de la
   * mission produirait deux lignes pour un contact rattaché à deux comptes, et
   * le badge s'afficherait deux fois.
   */
  private async contactsOf(workspaceId: string): Promise<ContactPropagation[]> {
    const rows = await this.missions.manager.query<
      { contact_id: string; account_id: string; signed_missions: string }[]
    >(
      `SELECT s.contact_id, c.account_id, COUNT(DISTINCT s.mission_id)::text AS signed_missions
         FROM (
           SELECT m.billing_contact_id AS contact_id, m.id AS mission_id
             FROM missions m
            WHERE m.workspace_id = $1 AND m.billing_contact_id IS NOT NULL
           UNION
           SELECT pc.contact_id, m.id AS mission_id
             FROM missions m
             JOIN project_contacts pc ON pc.project_id = m.opportunity_id
            WHERE m.workspace_id = $1 AND pc.role IN ('acheteur', 'decideur', 'sponsor')
         ) s
         JOIN contacts c ON c.id = s.contact_id
        GROUP BY s.contact_id, c.account_id`,
      [workspaceId],
    )
    return (rows ?? []).flatMap(row => {
      const signedMissions = count(row.signed_missions)
      // Aucune ligne à zéro : un contact qui n'a rien signé n'apparaît pas.
      // « A signé 0 mission » se lirait comme une mesure.
      if (signedMissions <= 0) return []
      return [
        propagated(
          { contactId: row.contact_id, accountId: row.account_id, signedMissions },
          missionsOfAccount(row.account_id),
        ),
      ]
    })
  }

  /* ── 4. Nombre de placements par consultant ────────────────────────────── */

  /**
   * « Placé 4 fois. »
   *
   * ⚠️ UN PLACEMENT N'EST PAS UN POSITIONNEMENT. Le vivier comptait déjà des
   * `submissions` (`talent.service.ts`) et l'écran les montrait à côté de la
   * dernière mission : une `submission` est une PROPOSITION envoyée à un
   * client, un placement est une mission qui a DÉMARRÉ. Les confondre gonfle le
   * compteur de tous ceux qu'on présente beaucoup et qu'on place peu —
   * exactement la personne qu'un recruteur doit repérer.
   *
   * D'où le filtre sur `started_on` : une affectation posée sur une mission qui
   * commence le mois prochain n'est pas encore un placement, et l'annoncer
   * comme tel ferait compter deux fois la même personne si la mission ne
   * démarre jamais.
   */
  private async placementsOf(workspaceId: string): Promise<ConsultantPropagation[]> {
    const rows = await this.missions.manager.query<{ consultant_id: string; placements: string }[]>(
      `SELECT ma.consultant_id, COUNT(DISTINCT ma.mission_id)::text AS placements
         FROM mission_assignments ma
         JOIN missions m ON m.id = ma.mission_id
        WHERE m.workspace_id = $1
          AND m.started_on IS NOT NULL
          AND m.started_on <= CURRENT_DATE
        GROUP BY ma.consultant_id`,
      [workspaceId],
    )
    return (rows ?? []).flatMap(row => {
      const placements = count(row.placements)
      if (placements <= 0) return []
      return [propagated({ consultantId: row.consultant_id, placements }, missionsOfConsultant(row.consultant_id))]
    })
  }

  /* ── 1. CA cumulé par compte ───────────────────────────────────────────── */

  /**
   * « Ce client vous a rapporté X € sur N missions. »
   *
   * La source est `invoice_readiness` — les mois réellement FACTURÉS, au
   * montant réel — et c'est la même que la ligne « facturé » de
   * `RevenueService`. La tentation serait d'estimer « TJM × durée » : ce serait
   * un chiffre inventé, qui varierait selon qu'on compte 20 ou 21 jours par
   * mois, et il figurerait dans un bandeau de chiffre d'affaires.
   *
   * ⚠️ `SUM` sans `COALESCE` : un compte dont aucun mois facturé ne porte de
   * montant rend `null`, jamais 0. Et les mois sans montant sont COMPTÉS — le
   * total annoncé est alors un plancher, et il le dit.
   */
  private async revenueOf(scope: FinanceScope): Promise<AccountRevenuePropagation[]> {
    const perimeter = financeScopeClause(scope, 'm', 2)
    const rows = await this.missions.manager.query<
      {
        account_id: string
        invoiced_cents: string | null
        invoiced_months: string
        missions: string
        months_without_amount: string
      }[]
    >(
      `SELECT m.account_id,
              SUM(r.invoiced_amount_cents)::text AS invoiced_cents,
              COUNT(*)::text AS invoiced_months,
              COUNT(DISTINCT m.id)::text AS missions,
              COUNT(*) FILTER (WHERE r.invoiced_amount_cents IS NULL)::text AS months_without_amount
         FROM invoice_readiness r
         JOIN missions m ON m.id = r.mission_id
        WHERE r.workspace_id = $1 AND r.invoiced_at IS NOT NULL${perimeter.sql}
        GROUP BY m.account_id`,
      [scope.workspaceId, ...perimeter.params],
    )
    return (rows ?? []).map(row =>
      propagated(
        {
          accountId: row.account_id,
          // `bigint` revient en CHAÎNE depuis pg, et `Number('')` vaut 0 : une
          // somme illisible s'afficherait « 0 € ». Elle vaut `null`.
          invoicedCents: amountCents(row.invoiced_cents),
          invoicedMonths: count(row.invoiced_months),
          missions: count(row.missions),
          monthsWithoutAmount: count(row.months_without_amount),
        },
        missionsOfAccount(row.account_id),
      ),
    )
  }

  /* ── 5. Marge moyenne par consultant ───────────────────────────────────── */

  /**
   * La marge moyenne des missions sur lesquelles ce consultant a été placé.
   *
   * `aggregateMargin` et pas une seconde formule (GA-26) : pondérée par les
   * JOURS déclarés, une mission dont un terme manque sort du calcul ET du
   * dénominateur en étant COMPTÉE, et sous cinq missions le chiffre se dit
   * « non mesurable » plutôt que de s'afficher avec l'autorité d'un pourcentage.
   *
   * ⚠️ Les jours sont SOMMÉS PAR MISSION avant d'entrer dans le calcul. Sans le
   * `declared`, une mission de huit mois produirait huit lignes et compterait
   * pour huit observations au seuil de mesurabilité — un consultant sur une
   * seule mission longue passerait « mesurable » sans l'être.
   *
   * ⚠️ Le coût lu est celui des conditions commerciales (D43) : `daily_cost`
   * n'est écrite par personne, et calculer dessus rendrait « coût chargé non
   * renseigné » sur des missions dont la fiche affiche 32 %.
   *
   * ⚠️ La rédaction passe par `redactFinance` — via
   * `aggregateMarginRedacted` — et jamais par une condition écrite à la main
   * ici : trois rédactions manuelles avaient déjà divergé (D45).
   */
  private async marginsOf(workspaceId: string, canReadFinance: boolean): Promise<ConsultantMarginPropagation[]> {
    const rows = await this.missions.manager.query<
      {
        consultant_id: string
        daily_rate: string | null
        loaded_daily_cost_cents: string | null
        days: string | null
      }[]
    >(
      `WITH placed AS (
         SELECT DISTINCT ma.consultant_id, ma.mission_id
           FROM mission_assignments ma
           JOIN missions m ON m.id = ma.mission_id
          WHERE m.workspace_id = $1
       ),
       declared AS (
         SELECT ts.mission_id, SUM(ts.days) AS days
           FROM mission_timesheets ts
           JOIN missions m2 ON m2.id = ts.mission_id
          WHERE m2.workspace_id = $1
            AND ts.status NOT IN ('expected', 'missing', 'not_required')
          GROUP BY ts.mission_id
       )
       SELECT p.consultant_id,
              m.daily_rate::text AS daily_rate,
              t.loaded_daily_cost_cents::text AS loaded_daily_cost_cents,
              d.days::text AS days
         FROM placed p
         JOIN missions m ON m.id = p.mission_id
         LEFT JOIN mission_commercial_terms t ON t.mission_id = m.id
         LEFT JOIN declared d ON d.mission_id = m.id`,
      [workspaceId],
    )

    const byConsultant = new Map<
      string,
      { dailyRateCents: number | null; dailyCostCents: number | null; days: number | null }[]
    >()
    for (const row of rows ?? []) {
      const list = byConsultant.get(row.consultant_id) ?? []
      list.push({
        dailyRateCents: euroToCents(row.daily_rate),
        dailyCostCents: loadedCostCents(row.loaded_daily_cost_cents),
        days: row.days === null || row.days === '' ? null : Number(row.days),
      })
      byConsultant.set(row.consultant_id, list)
    }

    return [...byConsultant].map(([consultantId, missionRows]) => {
      const aggregate = aggregateMargin(missionRows)
      return propagated(
        {
          consultantId,
          // `redactFinance` et lui seul (D45) : la clé reste PRÉSENTE et vide
          // sans le droit, jamais retirée et jamais mise à zéro.
          ...redactFinance({ marginPercent: aggregate.marginPercent }, canReadFinance),
          // Ce qui n'est pas un montant reste lisible : combien de missions
          // sont entrées dans le calcul n'est pas une donnée financière, et le
          // masquer empêcherait l'écran de dire « non mesurable, il manque 3 ».
          measured: aggregate.measured,
          unmeasured: aggregate.unmeasured,
          measurability: aggregate.measurability,
        },
        missionsOfConsultant(consultantId),
      )
    })
  }
}

/**
 * Un compteur `COUNT(*)` de pg, en nombre.
 *
 * `::text` côté SQL et `Number` ici : `bigint` revient en chaîne, et une chaîne
 * comparée à un nombre passerait silencieusement. Une valeur illisible vaut 0 —
 * c'est un COMPTEUR, donc « zéro ligne » est vrai ; la règle « jamais 0 » porte
 * sur les montants et les moyennes, pas sur le nombre de lignes comptées.
 */
function count(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === '') return 0
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0
}

/**
 * Un montant en centimes, ou « on ne sait pas ».
 *
 * ⚠️ `Number('')` vaut 0. Sans ce filtre, une somme illisible s'afficherait
 * « 0 € rapporté » sur la fiche d'un client qui a payé pendant trois ans.
 */
function amountCents(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const cents = Math.round(Number(raw))
  return Number.isFinite(cents) ? cents : null
}

/**
 * Un montant en EUROS (`numeric`) rendu en centimes, ou `null`.
 *
 * ⚠️ Zéro rend `null` : un TJM moyen de 0 € n'est pas un prix, c'est une fiche
 * vide, et l'afficher ferait croire que ce client achète gratuitement.
 */
function euroToCents(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const euros = Number(raw)
  if (!Number.isFinite(euros) || euros <= 0) return null
  return Math.round(euros * 100)
}
