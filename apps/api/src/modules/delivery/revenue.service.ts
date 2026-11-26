import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  aggregateMargin,
  computeDso,
  intermediationCost,
  marginByChannel,
  trueDailyCostCents,
  MISSION_CHANNELS,
  type MissionChannel,
  marginBelowThreshold,
  marginPercent,
  measurability,
  MEASURABILITY_THRESHOLDS,
  type DsoResult,
  type RevenueBreakdown,
  type RevenueLine,
  financeScopeClause,
  legalEntityClause,
  UNASSIGNED_MISSIONS_SQL,
  type FinanceScope,
  type FinanceScopeInfo,
  type ConfirmedRevenue,
} from '@bellum/contracts'
import { MissionEntity } from '../../database/entities/mission.entity'

/**
 * Les quatre chiffres d'affaires, et la marge (PDF 5 §9-10).
 *
 * Le service ne fond RIEN : il rend quatre lignes, chacune avec sa source et
 * son compteur de « non chiffré ». Un chiffre unique serait le plus dangereux
 * de l'outil, parce que chacun croirait qu'il parle du sien.
 *
 * Une ligne dont la source n'existe pas rend `null` avec sa raison. `null` n'est
 * pas 0 : « aucune source de paiement branchée » et « personne n'a payé » font
 * chercher la panne à deux endroits opposés.
 */
@Injectable()
export class RevenueService {
  private readonly logger = new Logger(RevenueService.name)

  constructor(
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
  ) {}

  /**
   * ⚠️ `legalEntityId` — la SOCIÉTÉ de l'ESN qui porte la mission (01/09/2026).
   *
   * `null` = toutes les sociétés, et c'est le défaut. Il s'INTERSECTE avec la
   * portée par personne plutôt que de la remplacer : demander « ma société »
   * depuis un cockpit restreint doit rendre ce qui est à la fois mien et à
   * elle. Remplacer élargirait l'une des deux en silence — et c'est toujours
   * l'élargissement qu'on ne remarque pas.
   */
  async breakdown(scope: FinanceScope, month: string, legalEntityId: string | null = null): Promise<RevenueBreakdown> {
    const periodMonth = `${month}-01`
    const lines: RevenueLine[] = [
      await this.signed(scope, periodMonth, legalEntityId),
      await this.produced(scope, periodMonth, legalEntityId),
      await this.invoiced(scope, periodMonth, legalEntityId),
      await this.collected(scope, periodMonth, legalEntityId),
    ]
    return { periodMonth, lines }
  }

  /**
   * Ce que la portée laisse DEHORS — et qu'il faut dire.
   *
   * Sur un espace où rien n'est attribué, une portée restreinte rendrait « 0 € »
   * partout. Or « 0 € » se lit « je n'ai rien vendu », alors que la vérité est
   * « rien ne m'est rattaché ». Le nombre est donc rendu à l'écran, comme les
   * lignes sans montant le sont déjà.
   *
   * `null` sur la portée « espace » : il n'y a rien dehors, et afficher
   * « 0 hors périmètre » en permanence est un bruit qui cesse d'être lu.
   */
  async scopeInfo(scope: FinanceScope): Promise<FinanceScopeInfo> {
    if (scope.kind === 'workspace') return { kind: 'workspace', outsideAnyPortfolio: null }
    try {
      const rows = await this.missions.manager.query<{ count: string }[]>(UNASSIGNED_MISSIONS_SQL, [scope.workspaceId])
      return { kind: 'own', outsideAnyPortfolio: Number(rows[0]?.count ?? 0) }
    } catch (err) {
      // Une lecture en échec rend `null`, jamais 0 : « je n'ai pas pu compter »
      // n'est pas « il n'y a rien dehors ».
      this.logger.error('scopeInfo error', { error: err })
      return { kind: 'own', outsideAnyPortfolio: null }
    }
  }

  /**
   * SIGNÉ — les missions qui démarrent sur ce mois, au montant du PROJET qui
   * les a produites.
   *
   * Le montant vient du projet et de nulle part ailleurs. La tentation est
   * d'estimer « TJM × durée » ; ce serait un chiffre inventé, qui varierait
   * selon qu'on compte 20 ou 21 jours par mois, et il figurerait dans un
   * tableau de chiffre d'affaires. Une mission dont le projet ne porte aucun
   * montant n'est donc pas chiffrée — elle est COMPTÉE à part, et le total dit
   * qu'il est un plancher.
   */
  private async signed(scope: FinanceScope, periodMonth: string, legalEntityId: string | null): Promise<RevenueLine> {
    const perimeter = financeScopeClause(scope, 'm', 3)
    // ⚠️ L'index du paramètre de la société DÉPEND de la portée : `own` a déjà
    // consommé `$3`. Le coder en dur casserait silencieusement l'une des deux
    // — et un paramètre décalé rend une erreur SQL, ce qui vaut encore mieux
    // qu'un filtre appliqué sur la mauvaise colonne, mais casse la lecture.
    const entity = legalEntityClause(legalEntityId, 'm', 3 + perimeter.params.length)
    return this.sum(
      'signed',
      `SELECT SUM(o.estimated_amount * 100) AS cents, COUNT(*) AS source_rows,
              COUNT(*) FILTER (WHERE o.estimated_amount IS NULL) AS without_amount
         FROM missions m
         LEFT JOIN opportunities o ON o.id = m.opportunity_id
        WHERE m.workspace_id = $1
          AND m.started_on >= $2::date
          AND m.started_on < ($2::date + interval '1 month')${perimeter.sql}${entity.sql}`,
      [scope.workspaceId, periodMonth, ...perimeter.params, ...entity.params],
    )
  }

  /**
   * PRODUIT — les jours réellement déclarés × le TJM. Le chiffre du delivery.
   *
   * #2407.10 / #2417.7 — NO-GO « aucun tarif historique modifié
   * rétroactivement ». `rate` n'est PLUS `m.daily_rate` en dur : la jointure
   * latérale choisit le TJM qui était en vigueur PENDANT `ts.period_month`
   * (`mission_rate_history`, posée par `DeliveryService.updateMission` à
   * chaque changement) et ne retombe sur le TJM courant que pour les mois
   * qu'aucun changement n'a jamais recouverts — byte-identique à avant pour
   * toute mission qui n'a encore jamais changé de tarif.
   */
  private async produced(scope: FinanceScope, periodMonth: string, legalEntityId: string | null): Promise<RevenueLine> {
    const perimeter = financeScopeClause(scope, 'm', 3)
    const entity = legalEntityClause(legalEntityId, 'm', 3 + perimeter.params.length)
    return this.sum(
      'produced',
      `SELECT SUM(ts.days * COALESCE(h.daily_rate, m.daily_rate) * 100) AS cents, COUNT(*) AS source_rows,
              COUNT(*) FILTER (WHERE COALESCE(h.daily_rate, m.daily_rate) IS NULL) AS without_amount
         FROM mission_timesheets ts
         JOIN missions m ON m.id = ts.mission_id
         LEFT JOIN LATERAL (
           SELECT mrh.daily_rate
             FROM mission_rate_history mrh
            WHERE mrh.mission_id = m.id
              AND ts.period_month >= mrh.effective_from
              AND ts.period_month < mrh.effective_to
            ORDER BY mrh.effective_from DESC
            LIMIT 1
         ) h ON true
        WHERE m.workspace_id = $1
          AND ts.period_month = $2::date
          -- Un relevé ATTENDU ou MANQUANT ne produit rien : ses zéro jours
          -- sont l'absence d'une information, pas une journée non travaillée.
          AND ts.status NOT IN ('expected', 'missing', 'not_required')${perimeter.sql}${entity.sql}`,
      [scope.workspaceId, periodMonth, ...perimeter.params, ...entity.params],
    )
  }

  /**
   * FACTURÉ — ce qui est sorti vers l'outil comptable, à son montant réel.
   *
   * #2197.41 — filtre sur `r.state = 'invoiced'` (PROUVÉ par le connecteur),
   * jamais sur `invoiced_at IS NOT NULL`. Cette colonne est posée par le seul
   * chemin d'écriture qui existe aujourd'hui (`InvoiceReadinessService.
   * markInvoiced`) — une DÉCLARATION humaine, sans aucune preuve de
   * connecteur — donc `invoiced_at IS NOT NULL` comptait, depuis l'origine,
   * une déclaration comme si elle avait été prouvée. Tant qu'aucun connecteur
   * ne confirme une facture, cette ligne rend honnêtement `0` (ou `null`),
   * jamais le total des déclarations.
   */
  private async invoiced(scope: FinanceScope, periodMonth: string, legalEntityId: string | null): Promise<RevenueLine> {
    // La jointure sur `missions` n'existe que pour porter la PORTÉE :
    // `invoice_readiness` ne connaît ni propriétaire ni compte. Elle est en
    // `JOIN` et non `LEFT JOIN` — une ligne de facturation sans mission serait
    // orpheline, et l'inclure dans un total ne veut rien dire.
    //
    // ⚠️ Elle porte DEUX resserrements désormais : la personne et la SOCIÉTÉ.
    // `legal_entity_id` vit sur la mission et nulle part ailleurs — c'est
    // exactement pourquoi la jointure était déjà là.
    const perimeter = financeScopeClause(scope, 'm', 3)
    const entity = legalEntityClause(legalEntityId, 'm', 3 + perimeter.params.length)
    return this.sum(
      'invoiced',
      `SELECT SUM(r.invoiced_amount_cents) AS cents, COUNT(*) AS source_rows,
              COUNT(*) FILTER (WHERE r.invoiced_amount_cents IS NULL) AS without_amount
         FROM invoice_readiness r
         JOIN missions m ON m.id = r.mission_id
        WHERE r.workspace_id = $1 AND r.period_month = $2::date
          AND r.state = 'invoiced'${perimeter.sql}${entity.sql}`,
      [scope.workspaceId, periodMonth, ...perimeter.params, ...entity.params],
    )
  }

  /** ENCAISSÉ — ce que le client a réellement payé. */
  private async collected(
    scope: FinanceScope,
    periodMonth: string,
    legalEntityId: string | null,
  ): Promise<RevenueLine> {
    const perimeter = financeScopeClause(scope, 'm', 3)
    const entity = legalEntityClause(legalEntityId, 'm', 3 + perimeter.params.length)
    return this.sum(
      'collected',
      `SELECT SUM(r.paid_amount_cents) AS cents, COUNT(*) AS source_rows,
              COUNT(*) FILTER (WHERE r.paid_amount_cents IS NULL) AS without_amount
         FROM invoice_readiness r
         JOIN missions m ON m.id = r.mission_id
        WHERE r.workspace_id = $1 AND r.period_month = $2::date
          AND r.paid_at IS NOT NULL${perimeter.sql}${entity.sql}`,
      [scope.workspaceId, periodMonth, ...perimeter.params, ...entity.params],
    )
  }

  /**
   * LE CA CONFIRMÉ — #2900 (#2415.10). L'ENCAISSÉ, moins ce qui est CONTESTÉ.
   *
   * N'est PAS un cinquième chiffre d'affaires : `breakdown()` reste EXACTEMENT
   * quatre lignes (PDF 5 §10, doctrine tenue). C'est une dérivation séparée,
   * pour la seule question à laquelle Laura doit pouvoir répondre — qu'un jour
   * contesté (`contestedDays`/`correctionDeadline`, `get_timesheets`) est
   * exclu du chiffre « confirmé », ce que l'ENCAISSÉ ne dit pas : il compte
   * aujourd'hui une facture contestée comme n'importe quelle autre.
   *
   * Même discipline que les quatre lignes : `null` n'est jamais 0. Les lignes
   * contestées sortent du calcul ET du dénominateur (`sourceRows` ne les
   * compte pas) — mais elles ne disparaissent pas : `excludedDisputed` les
   * NOMME, à part.
   */
  async confirmedRevenue(
    scope: FinanceScope,
    month: string,
    legalEntityId: string | null = null,
  ): Promise<ConfirmedRevenue> {
    const periodMonth = `${month}-01`
    try {
      const perimeter = financeScopeClause(scope, 'm', 3)
      const entity = legalEntityClause(legalEntityId, 'm', 3 + perimeter.params.length)
      const rows = await this.missions.manager.query<
        {
          cents: string | null
          without_amount: string | null
          source_rows: string | null
          excluded_disputed: string | null
        }[]
      >(
        `SELECT
                SUM(r.paid_amount_cents) FILTER (WHERE r.disputed_at IS NULL) AS cents,
                COUNT(*) FILTER (WHERE r.disputed_at IS NULL AND r.paid_amount_cents IS NULL) AS without_amount,
                COUNT(*) FILTER (WHERE r.disputed_at IS NULL) AS source_rows,
                COUNT(*) FILTER (WHERE r.disputed_at IS NOT NULL) AS excluded_disputed
           FROM invoice_readiness r
           JOIN missions m ON m.id = r.mission_id
          WHERE r.workspace_id = $1 AND r.period_month = $2::date
            AND r.paid_at IS NOT NULL${perimeter.sql}${entity.sql}`,
        [scope.workspaceId, periodMonth, ...perimeter.params, ...entity.params],
      )
      const row = rows[0]
      const withoutAmount = Number(row?.without_amount ?? 0)
      const sourceRows = Number(row?.source_rows ?? 0)
      const excludedDisputed =
        row?.excluded_disputed === null || row?.excluded_disputed === undefined ? null : Number(row.excluded_disputed)
      const cents = row?.cents === null || row?.cents === undefined ? null : Math.round(Number(row.cents))

      if (cents === null) {
        return {
          periodMonth,
          amountCents: null,
          withoutAmount,
          unavailableReason: sourceRows === 0 ? 'no_source' : 'no_amount',
          sourceRows,
          excludedDisputed,
        }
      }
      return { periodMonth, amountCents: cents, withoutAmount, unavailableReason: null, sourceRows, excludedDisputed }
    } catch (err) {
      this.logger.error('confirmedRevenue error', { error: err })
      return {
        periodMonth,
        amountCents: null,
        withoutAmount: 0,
        unavailableReason: 'unavailable',
        sourceRows: null,
        excludedDisputed: null,
      }
    }
  }

  /**
   * Une ligne, ou son absence NOMMÉE.
   *
   * Une requête en échec ne rend pas 0 : elle rend `null` avec sa raison. Un
   * zéro silencieux sur un chiffre d'affaires est exactement ce qui a laissé
   * croire pendant des semaines qu'un run coûtait 0,75 €.
   */
  private async sum(kind: RevenueLine['kind'], sql: string, params: unknown[]): Promise<RevenueLine> {
    try {
      const rows = await this.missions.manager.query<
        { cents: string | null; without_amount: string | null; source_rows: string | null }[]
      >(sql, params)
      const row = rows[0]
      const withoutAmount = Number(row?.without_amount ?? 0)
      const sourceRows = Number(row?.source_rows ?? 0)
      const cents = row?.cents === null || row?.cents === undefined ? null : Math.round(Number(row.cents))

      // ⚠️ Trois situations que le `COALESCE(SUM(...), 0)` d'avant fondait en
      // une seule, et qui ne se réparent pas de la même façon :
      //
      //  - AUCUNE ligne source — le cas de l'ENCAISSÉ, dont la colonne
      //    `paid_at` est lue ici et écrite par rien dans le dépôt. Tous les
      //    espaces lisaient « encaissé : 0 € », ce qui se lit « nos clients
      //    n'ont rien payé » quand la vérité est « personne n'a jamais
      //    enregistré un paiement ». La première fait appeler la comptabilité,
      //    la seconde fait remplir une fiche ;
      //  - des lignes, mais aucune chiffrée — `withoutAmount` porte le compte ;
      //  - un VRAI zéro, qui reste zéro : une mission signée à 0 € est une
      //    anomalie de saisie, et la masquer empêcherait de la voir.
      if (cents === null) {
        return {
          kind,
          amountCents: null,
          withoutAmount,
          unavailableReason: sourceRows === 0 ? 'no_source' : 'no_amount',
          sourceRows,
        }
      }
      // `sourceRows` est le DÉNOMINATEUR de la ligne : il était calculé par le
      // SQL et jeté. « Explique-moi ce chiffre » en a besoin — « 3 lignes sans
      // montant » ne se lit pas pareil sur 4 missions et sur 400.
      return { kind, amountCents: cents, withoutAmount, unavailableReason: null, sourceRows }
    } catch (err) {
      this.logger.error('revenue line error', { error: err, tags: { kind } })
      // ⚠️ La lecture a ÉCHOUÉ : le total n'est pas « zéro ligne », il est
      // INCONNU. Rendre 0 ferait dire « calculé sur rien » à une panne.
      return { kind, amountCents: null, withoutAmount: 0, unavailableReason: 'unavailable', sourceRows: null }
    }
  }

  /**
   * Les missions dont la marge passe sous le seuil de l'espace.
   *
   * Une marge inconnue n'alerte JAMAIS : envoyer un responsable renégocier un
   * TJM sur la foi d'une fiche incomplète est pire que ne rien dire. C'est le
   * garde-fou que le PDF 5 §12 attache à `FIN-10` — « jamais si coût absent ».
   *
   * ⚠️ `measured` dit si la LECTURE a abouti, et il ne se déduit d'aucun des
   * deux autres champs. Sans lui, « aucun seuil réglé » et « la requête a
   * cassé » sortaient d'ici sous la MÊME forme (`threshold: null`, `items: []`)
   * — et la routine hebdomadaire en tirait la phrase « Aucun seuil de marge
   * réglé pour cet espace », qui donne une CAUSE fausse à un silence. Un
   * verdict ne se conclut pas d'un silence.
   */
  async marginAlerts(
    scope: FinanceScope,
    legalEntityId: string | null = null,
  ): Promise<{
    /** `false` = la lecture a échoué. Rien de ce qui suit n'est alors une mesure. */
    measured: boolean
    threshold: number | null
    items: Array<{ missionId: string; label: string | null; margin: number }>
  }> {
    try {
      const perimeter = financeScopeClause(scope, 'm', 2)
      // La MÊME société que l'agrégat servi à côté : des alertes tirées sur
      // l'espace entier sous un agrégat filtré enverraient renégocier le TJM
      // d'une mission portée par une autre société.
      const entity = legalEntityClause(legalEntityId, 'm', 2 + perimeter.params.length)
      // Le coût CHARGÉ vient des conditions commerciales (D43) : `daily_cost`
      // n'est écrite par rien, et l'alerte de seuil ne s'est donc JAMAIS
      // déclenchée — pas parce que les marges étaient bonnes.
      const rows = await this.missions.manager.query<
        { id: string; label: string | null; daily_rate: string | null; loaded_daily_cost_cents: string | null }[]
      >(
        `SELECT m.id, m.label, m.daily_rate, t.loaded_daily_cost_cents
           FROM missions m
           LEFT JOIN mission_commercial_terms t ON t.mission_id = m.id
          WHERE m.workspace_id = $1 AND m.status IN ('active', 'onboarding')${perimeter.sql}${entity.sql}`,
        [scope.workspaceId, ...perimeter.params, ...entity.params],
      )
      const settings = await this.missions.manager.query<{ margin_alert_threshold_percent: string | null }[]>(
        `SELECT margin_alert_threshold_percent FROM workspaces WHERE id = $1`,
        [scope.workspaceId],
      )
      const raw = settings[0]?.margin_alert_threshold_percent
      const threshold = raw === null || raw === undefined ? null : Number(raw)

      const items = rows.flatMap(row => {
        // Un seul noyau (GA-26) : cette formule était recopiée à la main ici,
        // et elle arrondissait autrement que la fiche.
        const rounded = marginPercent(
          row.daily_rate === null ? null : Math.round(Number(row.daily_rate) * 100),
          loadedCostCents(row.loaded_daily_cost_cents),
        )
        if (!marginBelowThreshold(rounded, threshold) || rounded === null) return []
        return [{ missionId: row.id, label: row.label, margin: rounded }]
      })
      return { measured: true, threshold, items }
    } catch (err) {
      this.logger.error('marginAlerts error', { error: err })
      return { measured: false, threshold: null, items: [] }
    }
  }

  /**
   * Règle le seuil d'alerte de marge de l'espace. `null` l'ÉTEINT.
   *
   * Éteint par défaut, et c'est délibéré : une alerte qui se déclenche seule le
   * premier jour apprend surtout à ignorer les alertes.
   */
  async setMarginThreshold(workspaceId: string, thresholdPercent: number | null): Promise<void> {
    await this.missions.manager.query(`UPDATE workspaces SET margin_alert_threshold_percent = $2 WHERE id = $1`, [
      workspaceId,
      thresholdPercent,
    ])
  }

  /**
   * Le délai moyen de paiement — ou ce qu'il manque pour le calculer.
   *
   * Le tracker du PDF 5 l'avait laissé « non mesuré » avec une raison juste :
   * un DSO calculé sur trois factures n'est pas un DSO. Ce qui manquait, c'est
   * la troisième réponse (décision de Louis du 21/08) : ne pas afficher un
   * chiffre faux, ne pas rester muet non plus, mais DIRE combien d'observations
   * manquent — « 3 factures sur les 10 nécessaires ».
   *
   * Un échec de lecture rend `null` avec zéro observation : c'est « je ne sais
   * pas », et non « ton historique est vide ».
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QU'IL SORT, IL LE DIT — LES CONTESTÉES SONT COMPTÉES
   * ─────────────────────────────────────────────────────────────────────────
   * L'exclusion des factures contestées était juste et SILENCIEUSE. Une médiane
   * qui ne dit pas sur quoi elle porte ment dans les deux sens : les garder
   * ferait gonfler le délai alors que le client n'a rien à payer tant que le
   * litige dure, et les sortir sans le dire cache de l'argent qui ne rentre pas.
   *
   * Les mal datées étaient déjà comptées ; les contestées le sont désormais.
   *
   * ⚠️ DEUX requêtes, et c'est délibéré. Tirer le compte de la requête des
   * lignes supposerait qu'il en reste au moins une après le filtre — or le cas
   * où TOUT est contesté est justement celui où le compte compte le plus, et
   * c'est là qu'il aurait disparu.
   */
  async dso(workspaceId: string): Promise<DsoResult> {
    // Pris AVANT, et indépendamment : savoir que dix factures sont contestées
    // reste vrai même si la médiane n'a pas pu se calculer.
    const disputed = await this.disputedPaidInvoices(workspaceId)
    try {
      // `invoice_readiness` et non `mission_timesheets` : c'est là que vivent
      // la date de facturation et le paiement (migration 1789693128476). La
      // garde SQL a attrapé l'erreur avant la production — un `paid_at` lu sur
      // la mauvaise table aurait rendu un DSO vide, ce qui se lit « personne ne
      // paie en retard ».
      const rows = await this.missions.manager.query<{ invoiced_at: string | null; paid_at: string | null }[]>(
        `SELECT to_char(ir.invoiced_at, 'YYYY-MM-DD') AS invoiced_at,
                to_char(ir.paid_at, 'YYYY-MM-DD') AS paid_at
           FROM invoice_readiness ir
          WHERE ir.workspace_id = $1 AND ir.paid_at IS NOT NULL
            -- BEL-MIS-011 : **le litige n'est pas un retard**. Le temps qu'une
            -- facture CONTESTÉE met à être réglée ne mesure pas la ponctualité
            -- d'un client, il mesure la durée d'une négociation — et c'est ce
            -- chiffre-là qu'un dirigeant regarde pour décider s'il faut changer
            -- ses conditions de règlement. Troisième refus du calcul, à côté de
            -- l'impayée (« un retard, pas un délai ») et de la mal datée.
            --
            -- Le filtre porte sur la date de litige et JAMAIS sur sa levée :
            -- lever un litige ne réécrit pas le temps qu'il a fait perdre.
            AND ir.disputed_at IS NULL`,
        [workspaceId],
      )
      return computeDso(
        rows.map(row => ({ invoicedAt: row.invoiced_at, paidAt: row.paid_at })),
        { disputed },
      )
    } catch (err) {
      this.logger.error('dso error', { error: err })
      return { days: null, measurability: measurability(0, MEASURABILITY_THRESHOLDS.dso), undatable: 0, disputed }
    }
  }

  /**
   * Combien de factures payées le DSO vient d'écarter POUR LITIGE.
   *
   * Le prédicat est le complément EXACT du refus posé dans `dso()` — mêmes
   * bornes d'espace et de paiement, `disputed_at IS NOT NULL` au lieu de `IS
   * NULL`. Deux prédicats qui divergeraient feraient parler les deux chiffres
   * de deux portefeuilles différents, et le compte cesserait de rendre compte.
   *
   * Il porte, lui aussi, sur l'OUVERTURE du litige et jamais sur sa levée :
   * lever un litige ne réécrit pas le temps qu'il a fait perdre, donc la facture
   * reste dehors et reste comptée.
   *
   * ⚠️ Rend `null`, JAMAIS `0`, quand la lecture échoue. « Aucune facture
   * contestée » est une mesure vraie et rassurante ; « on n'a pas su compter »
   * demande de réessayer. Les écrire pareil ferait dire « rien à signaler » à
   * une panne — c'est le défaut que « non mesuré n'est pas mesuré à zéro »
   * interdit (GA-18/GA-19), et le même piège qu'un `COALESCE(SUM(…), 0)`.
   */
  private async disputedPaidInvoices(workspaceId: string): Promise<number | null> {
    try {
      const rows = await this.missions.manager.query<{ disputed: number | string | null }[]>(
        `SELECT count(*)::int AS disputed
           FROM invoice_readiness ir
          WHERE ir.workspace_id = $1 AND ir.paid_at IS NOT NULL
            AND ir.disputed_at IS NOT NULL`,
        [workspaceId],
      )
      // Une absence de ligne n'est pas un zéro : `count(*)` en rend toujours
      // une, donc ne pas en avoir signifie qu'on n'a pas lu ce qu'on croit.
      const raw = rows?.[0]?.disputed
      if (raw === null || raw === undefined) return null
      // `count(*)` remonte en `bigint`, que le pilote rend en CHAÎNE ; le cast
      // `::int` l'évite, mais on ne parie pas là-dessus pour un chiffre affiché.
      const parsed = Number(raw)
      return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null
    } catch (err) {
      this.logger.error('dso disputed count error', { error: err })
      return null
    }
  }

  /** La marge agrégée d'un espace, pondérée par les jours réellement déclarés. */
  /**
   * La marge par CANAL — « l'indicateur le plus stratégique » du PDF 8 §5.3.
   *
   * L'écart entre le direct et le passage par un intermédiaire est ce qui
   * justifie ou non un chantier de référencement. Sans lui, la décision se prend
   * au feeling.
   *
   * Le canal vient de `mission_commercial_terms`, où il est SAISI. Un `LEFT
   * JOIN` sans ligne de conditions donne `unknown`, et `unknown` est compté à
   * part — jamais rangé avec le direct.
   */
  async marginByChannel(workspaceId: string, month: string, legalEntityId: string | null = null) {
    const periodMonth = `${month}-01`
    try {
      // ⚠️ Elle refuse `?scope=own` et accepte la SOCIÉTÉ, et ce n'est pas une
      // incohérence : découper par personne rendrait des parts qui ne
      // s'additionnent plus, alors qu'une société est un périmètre commercial
      // complet — ses canaux se comparent entre eux comme ceux de l'espace.
      const entity = legalEntityClause(legalEntityId, 'm', 3)
      const rows = await this.missions.manager.query<
        {
          channel: string | null
          daily_rate: string | null
          loaded_daily_cost_cents: string | null
          commission: string | null
          days: string | null
        }[]
      >(
        `SELECT COALESCE(t.channel, 'unknown') AS channel, m.daily_rate, t.loaded_daily_cost_cents, ts.days,
                t.partner_commission_daily_cents AS commission
           FROM missions m
           LEFT JOIN mission_commercial_terms t ON t.mission_id = m.id
           LEFT JOIN mission_timesheets ts
                  ON ts.mission_id = m.id
                 AND ts.period_month = $2::date
                 AND ts.status NOT IN ('expected', 'missing', 'not_required')
          WHERE m.workspace_id = $1${entity.sql}`,
        [workspaceId, periodMonth, ...entity.params],
      )
      const byChannel = marginByChannel(
        rows.map(row => ({
          channel: (MISSION_CHANNELS as readonly string[]).includes(row.channel ?? '')
            ? (row.channel as MissionChannel)
            : 'unknown',
          dailyRateCents: row.daily_rate === null ? null : Math.round(Number(row.daily_rate) * 100),
          // Le coût RÉEL : sur un canal intermédié, une commission inconnue
          // rend le coût inconnu plutôt que de faire passer l'intermédiaire
          // pour gratuit — et c'est précisément ce calcul-là qui prétend
          // mesurer le coût de l'intermédiation.
          loadedDailyCostCents: trueDailyCostCents(
            (MISSION_CHANNELS as readonly string[]).includes(row.channel ?? '')
              ? (row.channel as MissionChannel)
              : 'unknown',
            // ⚠️ La jointure sur `mission_commercial_terms` était DÉJÀ là — pour
            // le canal et la commission — et le coût se lisait quand même sur
            // `missions.daily_cost`, que rien n'écrit. La marge par canal,
            // « l'indicateur le plus stratégique » du PDF 8, était donc
            // intégralement « non mesurée ».
            loadedCostCents(row.loaded_daily_cost_cents),
            row.commission === null ? null : Number(row.commission),
          ),
          days: row.days === null ? null : Number(row.days),
        })),
      )
      return { periodMonth, byChannel, intermediationCost: intermediationCost(byChannel) }
    } catch (err) {
      this.logger.error('margin by channel error', { error: err })
      // Rien de lu : aucun canal, plutôt que quatre lignes à zéro qui se
      // liraient « toutes nos marges sont nulles ».
      return { periodMonth, byChannel: [], intermediationCost: null }
    }
  }

  async aggregate(scope: FinanceScope, month: string, legalEntityId: string | null = null) {
    const periodMonth = `${month}-01`
    try {
      const perimeter = financeScopeClause(scope, 'm', 3)
      const entity = legalEntityClause(legalEntityId, 'm', 3 + perimeter.params.length)
      const rows = await this.missions.manager.query<
        { daily_rate: string | null; loaded_daily_cost_cents: string | null; days: string | null }[]
      >(
        `SELECT m.daily_rate, t.loaded_daily_cost_cents, ts.days
           FROM missions m
           LEFT JOIN mission_commercial_terms t ON t.mission_id = m.id
           LEFT JOIN mission_timesheets ts
                  ON ts.mission_id = m.id
                 AND ts.period_month = $2::date
                 AND ts.status NOT IN ('expected', 'missing', 'not_required')
          WHERE m.workspace_id = $1${perimeter.sql}${entity.sql}`,
        [scope.workspaceId, periodMonth, ...perimeter.params, ...entity.params],
      )
      return aggregateMargin(
        rows.map(row => ({
          dailyRateCents: row.daily_rate === null ? null : Math.round(Number(row.daily_rate) * 100),
          dailyCostCents: loadedCostCents(row.loaded_daily_cost_cents),
          days: row.days === null ? null : Number(row.days),
        })),
      )
    } catch (err) {
      this.logger.error('aggregate margin error', { error: err })
      return { marginPercent: null, measured: 0, unmeasured: 0 }
    }
  }
}

/**
 * Le coût CHARGÉ d'une mission, en centimes — ou « on ne sait pas ».
 *
 * ⚠️ `loaded_daily_cost_cents` est un `bigint` : pg le rend en CHAÎNE, et
 * `Number('')` vaut `0`. Un coût illisible deviendrait donc « 100 % de marge »,
 * exactement le genre de chiffre qu'on croit une fois avant de ne plus jamais
 * croire l'écran. Il vaut `null`, et la mission sort du calcul en étant COMPTÉE.
 *
 * Écrit une fois pour les trois lectures de ce fichier (alertes de seuil, marge
 * par canal, agrégat) : trois conversions recopiées divergent.
 *
 * EXPORTÉ depuis le 28/08/2026 pour la quatrième — la marge moyenne par
 * consultant (`propagation.service.ts`). Une dérivation vit à UN seul endroit
 * (GA-26) : la recopier là-bas aurait produit deux lectures du même `bigint`
 * qui auraient fini par diverger sur le cas qui compte, la chaîne vide.
 */
export function loadedCostCents(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const cents = Number(raw)
  if (!Number.isFinite(cents) || cents < 0) return null
  return cents
}
