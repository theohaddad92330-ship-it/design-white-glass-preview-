import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import type {
  CockpitCoverage,
  CockpitCoverageAnomaly,
  CockpitDormantOpportunity,
  CockpitPerspective,
  CockpitProvenance,
  CockpitRelationshipPulse,
  CockpitSeries,
  CockpitSeriesPoint,
  CockpitSource,
  CockpitTrajectory,
} from '@bellum/contracts'
import { interactionActivityKindsSql, LIVE_STAGES, marketHeatRank, projectStageInSql } from '@bellum/contracts'
import { ACCOUNT_HYGIENE_PREDICATES } from '../accounts/account-hygiene.sql'
import { shortReason } from './priority-reason'
import type { MarketCompanyLookup } from '../market-memory/market-memory.service'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { ShortTtlCache } from '../../common/short-ttl-cache'

/**
 * LE RECUL DU COCKPIT PERSONNEL (#1404 → #1411).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est pas une seconde page « Aujourd'hui », et c'est la demande n°1 du lot
 * (#1404). Aucune méthode ici ne rend une liste d'objets À TRAITER : elles
 * MESURENT (combien, depuis quand, sur quelle population) et l'écran renvoie
 * vers la page qui traite. La seule liste servie — les anomalies de couverture —
 * est bornée à cinq et n'admet un compte que s'il RÉVÈLE un problème.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS INVARIANTS, TENUS PAR LA STRUCTURE ET PAS PAR LA DISCIPLINE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Chaque bloc échoue SÉPARÉMENT.** `Promise.allSettled`, et une lecture
 *    ratée rend `null` pour SES mesures — jamais zéro, et jamais en éteignant
 *    les quatre autres blocs. « Je n'ai pas pu lire » et « il n'y en a pas » ne
 *    se disent pas pareil, et c'est ce que la colonne `sources` de la
 *    provenance permet à l'écran d'écrire.
 * 2. **Un prédicat partagé se RÉFÉRENCE, il ne se recopie pas** (GA-53) :
 *    `ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask` est interpolé depuis son
 *    module. Deux copies identiques aujourd'hui sont l'état d'où part toute
 *    divergence.
 * 3. **La portée est le PORTEFEUILLE, c'est-à-dire le responsable**
 *    (`accounts.assigned_to`), pas le créateur (#1408). Voir
 *    {@link PORTFOLIO_SCOPE_SQL}.
 */

/**
 * LA PORTÉE DU COCKPIT : mon PORTEFEUILLE, c'est-à-dire ce dont je suis
 * RESPONSABLE (`accounts.assigned_to`).
 *
 * ⚠️ #1408 — c'était la contradiction du lot, et elle était de fond, pas de
 * pixel. « Mes comptes » filtrait sur le CRÉATEUR (`accounts.user_id`) pendant
 * que `/comptes` filtrait sur le RESPONSABLE : deux populations, deux vérités,
 * et le même mot pour les deux. Le mot qui reste est « portefeuille », et il ne
 * désigne plus qu'une chose dans tout le produit.
 *
 * Rendre les deux écrans d'accord demandait un troisième correctif, sans lequel
 * l'alignement aurait VIDÉ le cockpit : le chemin d'ANALYSE créait un compte
 * sans jamais poser `assigned_to` (seul « Ajouter au portefeuille » le posait),
 * si bien qu'analyser une entreprise ne rendait personne responsable d'elle.
 * Corrigé dans `AccountsService.createForAnalysis` + migration de rattrapage.
 * Effet de bord voulu : le manager cesse de compter ces comptes-là comme des
 * zones blanches (#1460).
 */
const PORTFOLIO_SCOPE_SQL = `a.workspace_id = $1 AND a.assigned_to = $2 AND a.status <> 'deleted'`

/**
 * Ce qui compte comme une INTERACTION avec le client.
 *
 * `note`, `stage_change`, `crm_export`, `analysis` et `workflow` sont des gestes
 * INTERNES : les compter ferait passer « j'ai relu la fiche » pour « je lui ai
 * parlé », et un compte silencieux depuis six mois paraîtrait vivant parce que
 * quelqu'un l'a ouvert. Un échange suppose l'autre bout.
 */
/**
 * ⚠️ La liste ne s'écrit plus ici (#1581.1) — elle vit dans `@bellum/contracts`,
 * parce que le contexte du copilote pose EXACTEMENT la même question et qu'une
 * seconde écriture de la même règle finit par diverger.
 */
const INTERACTION_KINDS_SQL = interactionActivityKindsSql()

/** La fenêtre de silence de la couverture et de la dynamique (#1408, #1409). */
const NO_INTERACTION_DAYS = 30
/** Un signal « neuf » — même fenêtre que `accountListCounters.newSignals7d`. */
const NEW_SIGNAL_DAYS = 7
/**
 * Le silence à partir duquel une relation passée devient une opportunité à
 * réveiller (#1407). Trois mois : en dessous, c'est une relance en cours, et
 * elle a déjà son écran.
 */
const DORMANT_SILENCE_DAYS = 90
/** « 3 à 5 anomalies maximum » — la borne est dans le retour (#1408). */
const MAX_ANOMALIES = 5
/** Les opportunités endormies : une file de décision, pas un inventaire. */
const MAX_DORMANT = 5
/** Treize semaines — de quoi couvrir la bascule 30 j / 90 j de #1410. */
const SERIES_WEEKS = 13
/**
 * La borne d'un libellé sur une carte d'opportunité endormie.
 *
 * Plus court que les 90 caractères d'une ligne de priorité : ici le libellé vit
 * à côté d'une date et d'une raison, dans une carte qui en empile jusqu'à
 * quatre. Mesuré en recette le 04/09 — sans borne, une seule preuve occupait
 * cinq lignes.
 */
const DORMANT_LABEL_CHARS = 70

/** Une lecture qui a échoué ne rend pas zéro : elle rend `null` et le DIT. */
function provenance(
  sources: CockpitSource[],
  windowDays: number | null,
  population: number | null,
  at: string,
): CockpitProvenance {
  return { sources, window_days: windowDays, population, computed_at: at }
}

/** `numeric` de PostgreSQL arrive en chaîne : un `Number()` nu rendrait `NaN`
 *  silencieusement, et `NaN` traverse `z.number().nullable()` sans broncher. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toIso(value: unknown): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

@Injectable()
export class CockpitPerspectiveService {
  private readonly logger = new Logger(CockpitPerspectiveService.name)

  private readonly cache = new ShortTtlCache<CockpitPerspective>(60_000)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly marketMemory: MarketMemoryService,
  ) {}

  /**
   * @param canReadFinance Le droit `finance:read` de l'APPELANT. Il voyage
   * jusqu'ici parce que la règle du dépôt est « c'est le champ financier qui se
   * garde, pas la lecture » (`invoice-readiness.controller.ts`) : le bloc reste
   * servi, ses montants valent `null` sans le droit, et l'écran dit « pas ton
   * périmètre » plutôt que « non mesurable ». Sans ce paramètre, cette route —
   * qui ne porte que `JwtGuard` et `@PersonalScope` — aurait rendu le facturé et
   * l'encaissé à un `sales` que `/delivery` masque, c'est-à-dire rouvert par la
   * fenêtre la porte que #1457 venait de condamner.
   */
  /**
   * Complète les anomalies avec les parcours observés par la mémoire marché (#1572).
   *
   * ⚠️ Trois façons de ne rien dire, et une seule façon de dire quelque chose :
   * · la mémoire est INDISPONIBLE → la ligne reste exactement ce qu'elle est.
   *   Un « 0 parcours » sur une panne serait un mensonge, et cet écran sert à
   *   agir, pas à auditer la donnée ;
   * · le compte n'est pas couvert → même chose, silence ;
   * · le compte est sous le seuil → même chose, et surtout pas « 2 parcours ».
   *
   * L'appel porte sur cinq comptes au plus (les anomalies sont déjà bornées) :
   * il ne coûte qu'une requête, faite APRÈS la coupe, jamais sur le portefeuille
   * entier.
   */
  private async withMarketPaths(
    anomalies: CockpitCoverageAnomaly[],
    rows: { id: string; company_name: string | null; website: string | null; registry_country: string | null }[],
    // #1617.4 — l'espace, pour que les corrections humaines de rapprochement
    // s'appliquent ici comme sur le portefeuille : deux lectures du même compte
    // qui divergent est le défaut que ce module a déjà payé deux fois.
    workspaceId: string,
  ): Promise<CockpitCoverageAnomaly[]> {
    const byId = new Map(rows.map(row => [row.id, row]))
    const lookups: MarketCompanyLookup[] = []
    for (const anomaly of anomalies) {
      const row = byId.get(anomaly.account_id)
      const name = row?.company_name ?? anomaly.company_name
      // Un compte sans nom ne se rapproche de RIEN : une clé vide rapprocherait
      // n'importe quelle entreprise du corpus, ce qui est pire qu'un silence.
      if (!name) continue
      // #1617 — le pays départage deux homonymes du corpus (« CGI » en France
      // et « CGI » au Canada ne sont pas la même entreprise). Absent ⇒ on ne
      // devine pas, et l'ambiguïté reste une ambiguïté.
      lookups.push({
        ref: anomaly.account_id,
        name,
        website: row?.website ?? anomaly.website ?? null,
        country: row?.registry_country ?? null,
      })
    }

    const paths = await this.readMarketPaths(lookups, workspaceId)
    if (paths === null) return anomalies

    return anomalies.map(anomaly => {
      const observed = paths.get(anomaly.account_id) ?? null
      return observed === null ? anomaly : { ...anomaly, market_paths: observed }
    })
  }

  /**
   * L'UNIQUE lecture de la mémoire marché de ce service — deux blocs la lisent
   * (les anomalies de couverture #1572, les opportunités endormies #1574.1) et
   * ils doivent en tirer exactement la même conclusion.
   *
   * `null` = la mémoire n'a rien pu dire (panne, service coupé). Ce n'est PAS
   * « aucun parcours » : l'appelant laisse alors ses lignes strictement
   * intactes, parce qu'un « 0 » sur une panne serait un mensonge.
   */
  private async readMarketPaths(
    lookups: MarketCompanyLookup[],
    workspaceId: string,
  ): Promise<ReadonlyMap<string, number | null> | null> {
    const read = await this.marketMemory.pathsFor(lookups, { workspaceId })
    return read.status === 'ok' ? read.paths : null
  }

  /**
   * #1574.1 — LA MÉMOIRE MARCHÉ SUR UNE OPPORTUNITÉ ENDORMIE.
   *
   * ⚠️ CE QU'ELLE A LE DROIT DE FAIRE, ET CE QU'ELLE N'A PAS LE DROIT DE FAIRE.
   *
   * Le retour est explicite : « ne jamais transformer cette mémoire en prétexte
   * automatique pour contacter le client ». Elle ne touche donc PAS au CTA
   * (seul `new_signal` le décide, côté écran).
   *
   * ⚠️ #4016.L10.c (Louis 11/10, codé le 13/10) — « un signal isolé suffit pour
   * chaud » : l'ORDRE est renversé. Ancien texte : ~~« elle n'arrive qu'en
   * TROISIÈME clé […] la mémoire marché AUGMENTE un potentiel, elle ne
   * FABRIQUE jamais une urgence »~~. Désormais :
   *
   *  1. la chaleur (`dormantHeat`) — un signal récent OU une présence marché ;
   *  2. à chaleur égale, un signal récent passe devant ;
   *  3. la force de la relation passée, mesurée par le nombre de preuves
   *     datées ;
   *  4. la date, comme avant.
   *
   * L'appel porte sur cinq comptes au plus — il est fait APRÈS la coupe, jamais
   * sur le portefeuille entier.
   */
  private async withDormantMarketPaths(
    opportunities: CockpitDormantOpportunity[],
    rows: { id: string; company_name: string | null; website: string | null; registry_country: string | null }[],
    // #1617.4 — l'espace, pour que les corrections humaines de rapprochement
    // s'appliquent ici comme sur le portefeuille : deux lectures du même compte
    // qui divergent est le défaut que ce module a déjà payé deux fois.
    workspaceId: string,
  ): Promise<CockpitDormantOpportunity[]> {
    const byId = new Map(rows.map(row => [row.id, row]))
    const lookups: MarketCompanyLookup[] = []
    for (const item of opportunities) {
      const row = byId.get(item.account_id)
      const name = row?.company_name ?? item.company_name
      // Un compte sans nom ne se rapproche de RIEN : une clé vide rapprocherait
      // n'importe quelle entreprise du corpus, ce qui est pire qu'un silence.
      if (!name) continue
      lookups.push({
        ref: item.account_id,
        name,
        // #1617 — le pays départage deux homonymes du corpus. Absent ⇒ on ne
        // devine pas, et l'ambiguïté reste une ambiguïté.
        website: row?.website ?? item.website ?? null,
        country: row?.registry_country ?? null,
      })
    }

    const paths = await this.readMarketPaths(lookups, workspaceId)
    if (paths === null) return opportunities

    const annotated = opportunities.map(item => {
      const observed = paths.get(item.account_id) ?? null
      return observed === null ? item : { ...item, market_paths: observed }
    })

    // Le second tri se fait ICI, sur le tableau DÉJÀ annoté : le faire plus tôt
    // comparerait des `market_paths` qui n'existent pas encore, chaque carte
    // vaudrait `undefined`, et le tri n'aurait aucun effet — exactement le
    // défaut que #1573.5 avait corrigé sur les anomalies.
    // #4016.L10.c — « un signal isolé suffit pour chaud » (Louis 11/10) : la
    // CHALEUR mène (un signal neuf OU une présence marché), le signal neuf ne
    // fait plus que départager à chaleur égale — renversement assumé de GA-262.
    return annotated.sort(
      (left, right) =>
        dormantHeat(right) - dormantHeat(left) ||
        Number(Boolean(right.new_signal)) - Number(Boolean(left.new_signal)) ||
        right.evidence.length - left.evidence.length ||
        Date.parse(right.evidence[0].occurred_at) - Date.parse(left.evidence[0].occurred_at),
    )
  }

  /**
   * Perf 29/09/2026 (`GET /dashboard/me` 4-5 s en prod) — le recul (7 requêtes
   * agrégées + mémoire marché) est lu 60 s au plus, une entrée par
   * personne × espace × droit financier : le contenu ne change pas, il a au plus
   * une minute (`provenance.computed_at` le dit). Un échec n'est jamais retenu.
   */
  getPerspective(userId: string, workspaceId: string, canReadFinance: boolean): Promise<CockpitPerspective> {
    return this.cache.getOrLoad(`u:${userId}|ws:${workspaceId}|fin:${canReadFinance}`, () =>
      this.computePerspective(userId, workspaceId, canReadFinance),
    )
  }

  private async computePerspective(
    userId: string,
    workspaceId: string,
    canReadFinance: boolean,
  ): Promise<CockpitPerspective> {
    const computedAt = new Date().toISOString()
    const [trajectory, coverage, relationship, dormant, series] = await Promise.all([
      this.trajectory(userId, workspaceId, computedAt, canReadFinance),
      this.coverage(userId, workspaceId, computedAt),
      this.relationship(userId, workspaceId, computedAt),
      this.dormant(userId, workspaceId),
      this.series(userId, workspaceId, computedAt),
    ])
    return {
      trajectory,
      coverage,
      // UN SEUL CALCUL, DEUX LECTEURS. « Comptes sans échange depuis 30 jours »
      // s'écrit dans les deux blocs ; le recalculer produirait deux nombres pour
      // la même phrase, qui est très exactement le défaut mesuré au lot 6 (une
      // tuile annonçait 2, son filtre rendait zéro ligne — trois dénominateurs).
      relationship: { ...relationship, accounts_without_interaction: coverage.no_interaction_30d },
      dormant,
      series,
    }
  }

  /**
   * MA TRAJECTOIRE (#1407, 1re section) — quatre mesures, chacune faillible
   * seule.
   *
   * Le retour demandait « pipe personnel · CA signé / produit / facturé /
   * encaissé si mesurable · missions actives · capacité disponible si
   * mesurable ». Deux des quatre CA n'ont AUCUN objet porteur dans le produit
   * (« signé » et « produit ») : ils ne sont pas servis plutôt que devinés —
   * le « si mesurable » du retour est pris au mot.
   *
   * ⚠️ Le pipe réutilise `LIVE_STAGES` et `projectStageInSql` (GA-57), donc le
   * MÊME euro que `PipelineValueCard` côté équipe. Deux définitions du mot
   * « pipe » dans un même produit font douter des deux.
   */
  private async trajectory(
    userId: string,
    workspaceId: string,
    at: string,
    canReadFinance: boolean,
  ): Promise<CockpitTrajectory> {
    const sources: CockpitSource[] = []
    const [pipelineRow, missionsRow, billingRow] = await Promise.allSettled([
      this.dataSource.query<{ amount: string | null; valued: string; total: string }[]>(
        `SELECT COALESCE(SUM(o.estimated_amount) FILTER (WHERE o.estimated_amount IS NOT NULL), 0)::float8 AS "amount",
                COUNT(*) FILTER (WHERE o.estimated_amount IS NOT NULL)::int AS "valued",
                COUNT(*)::int AS "total"
           FROM opportunities o
           JOIN accounts a ON a.id = o.account_id
          WHERE ${PORTFOLIO_SCOPE_SQL}
            AND ${projectStageInSql('o.stage', LIVE_STAGES)}`,
        [workspaceId, userId],
      ),
      this.dataSource.query<{ count: string }[]>(
        `SELECT COUNT(*)::int AS "count"
           FROM missions m
           JOIN accounts a ON a.id = m.account_id
          WHERE ${PORTFOLIO_SCOPE_SQL}
            AND m.status IN ('onboarding', 'active', 'renewed')`,
        [workspaceId, userId],
      ),
      // Sans `finance:read`, la requête ne part même pas : on retire le MOYEN,
      // pas seulement l'affichage. Le champ reste PRÉSENT et vide (D45).
      canReadFinance
        ? this.dataSource.query<{ invoiced: string | null; collected: string | null }[]>(
            // Un mois ANNULÉ sort du facturé : l'annulation existe précisément
            // pour qu'un chiffre faux cesse d'être compté.
            `SELECT SUM(ir.invoiced_amount_cents) FILTER (WHERE ir.invoiced_at IS NOT NULL AND ir.invoice_cancelled_at IS NULL) AS "invoiced",
                SUM(ir.paid_amount_cents) FILTER (WHERE ir.paid_at IS NOT NULL) AS "collected"
           FROM invoice_readiness ir
           JOIN missions m ON m.id = ir.mission_id
           JOIN accounts a ON a.id = m.account_id
          WHERE ${PORTFOLIO_SCOPE_SQL}`,
            [workspaceId, userId],
          )
        : Promise.resolve([]),
    ])

    let pipeline: CockpitTrajectory['pipeline'] = null
    if (pipelineRow.status === 'fulfilled') {
      sources.push('bellum')
      const row = pipelineRow.value[0]
      const total = toNumber(row?.total) ?? 0
      const valued = toNumber(row?.valued) ?? 0
      pipeline = {
        // Aucune affaire chiffrée ⇒ pas de somme du tout. « 0 € » sur trente
        // affaires sans montant est un chiffre FAUX, pas un chiffre bas.
        amount_euros: valued > 0 ? toNumber(row?.amount) : null,
        open_count: total,
        valued_count: valued,
      }
    } else {
      this.logger.warn('cockpit trajectory: pipeline read failed', { error: pipelineRow.reason })
    }

    const centsToEuros = (value: unknown): number | null => {
      const cents = toNumber(value)
      return cents === null ? null : cents / 100
    }

    return {
      pipeline,
      missions_active: missionsRow.status === 'fulfilled' ? toNumber(missionsRow.value[0]?.count) : null,
      invoiced_euros: billingRow.status === 'fulfilled' ? centsToEuros(billingRow.value[0]?.invoiced) : null,
      collected_euros: billingRow.status === 'fulfilled' ? centsToEuros(billingRow.value[0]?.collected) : null,
      finance_readable: canReadFinance,
      // ⚠️ POPULATION À `null`, ET C'EST UNE CORRECTION DE RECETTE.
      //
      // Elle valait `pipeline.open_count`, et l'écran l'a rendue « sur 644
      // comptes » — or 644 est un nombre d'AFFAIRES. Un compteur juste sous un
      // nom faux est pire qu'une absence : il se croise avec les 28 de la tuile
      // « Mon portefeuille » et fait douter des deux.
      //
      // Ce bloc n'a d'ailleurs PAS de population unique : le pipe compte des
      // affaires, les missions des missions, la facturation des mois. Il n'y a
      // pas un dénominateur, il y en a trois — et le seul honnête est aucun.
      // Chaque mesure porte le sien là où il existe (« 21 affaires chiffrées
      // sur 644 ouvertes »).
      provenance: provenance(sources, null, null, at),
    }
  }

  /**
   * MON PORTEFEUILLE, LU EN COUVERTURE (#1408).
   *
   * Cinq compteurs et, au plus, cinq anomalies. La règle d'admission est celle
   * du retour, mot pour mot : « un compte listé ici doit apparaître parce qu'il
   * révèle un problème de couverture ou une opportunité, pas simplement parce
   * qu'il existe » — d'où le `kind` porté par chaque ligne, sans lequel la
   * liste redeviendrait « Mes comptes » sous un autre titre.
   *
   * ⚠️ `followedAccounts` et `noUpcomingTask` sont RÉFÉRENCÉS depuis
   * `ACCOUNT_HYGIENE_PREDICATES` (GA-53), jamais recopiés : `/pilotage`, la
   * liste des comptes et cet écran disent le même chiffre parce qu'ils lisent
   * la même définition.
   */
  private async coverage(userId: string, workspaceId: string, at: string): Promise<CockpitCoverage> {
    const empty: CockpitCoverage = {
      followed: null,
      without_next_action: null,
      no_interaction_30d: null,
      new_signals_7d: null,
      never_worked: null,
      anomalies: [],
      provenance: provenance([], NO_INTERACTION_DAYS, null, at),
    }

    try {
      const rows = await this.dataSource.query<
        {
          id: string
          company_name: string | null
          logo_url: string | null
          website: string | null
          registry_country: string | null
          followed: boolean
          without_next_action: boolean
          last_interaction: Date | null
          new_signal_at: Date | null
          ever_worked: boolean
        }[]
      >(
        `SELECT a.id,
                NULLIF(btrim(a.company_name), '') AS "company_name",
                a.logo_url,
                a.website,
                -- #1617 — le pays du registre départage deux homonymes de la
                -- mémoire marché. La colonne existait ; cette projection ne la
                -- sélectionnait pas, donc le rapprochement ne pouvait pas s'en
                -- servir. Un écran ne peut pas peser ce qu'on ne lui envoie pas.
                a.registry_country,
                (${ACCOUNT_HYGIENE_PREDICATES.followedAccounts}) AS "followed",
                (${ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask}) AS "without_next_action",
                (SELECT MAX(ac.occurred_at) FROM activities ac
                  WHERE ac.account_id = a.id AND ac.kind IN ${INTERACTION_KINDS_SQL}) AS "last_interaction",
                (SELECT MAX(sh.last_seen_at) FROM signal_history sh
                  WHERE sh.account_id = a.id AND sh.status = 'active'
                    AND sh.first_detection_exact
                    AND sh.first_detected_at >= now() - ($3 || ' days')::interval) AS "new_signal_at",
                EXISTS (SELECT 1 FROM user_actions ua WHERE ua.account_id = a.id) AS "ever_worked"
           FROM accounts a
          WHERE ${PORTFOLIO_SCOPE_SQL}`,
        [workspaceId, userId, String(NEW_SIGNAL_DAYS)],
      )

      const silenceCutoff = Date.now() - NO_INTERACTION_DAYS * 86_400_000
      const anomalies: CockpitCoverageAnomaly[] = []
      let followed = 0
      let withoutNextAction = 0
      let silent = 0
      let newSignals = 0
      let neverWorked = 0

      for (const row of rows) {
        const lastInteraction = toIso(row.last_interaction)
        const isSilent = row.followed && (lastInteraction === null || Date.parse(lastInteraction) < silenceCutoff)
        if (row.followed) followed += 1
        if (row.followed && row.without_next_action) withoutNextAction += 1
        if (isSilent) silent += 1
        if (row.new_signal_at) newSignals += 1
        if (row.followed && !row.ever_worked) neverWorked += 1

        // L'ORDRE des tests EST la priorité : un signal neuf que personne n'a
        // touché passe avant un silence, qui passe avant une absence de plan.
        // Un compte ne produit qu'UNE anomalie — le même compte répété trois
        // fois ferait une liste de cinq lignes pour deux problèmes.
        const kind: CockpitCoverageAnomaly['kind'] | null =
          row.new_signal_at && !row.ever_worked
            ? 'new_signal_untouched'
            : row.followed && !row.ever_worked
              ? 'never_worked'
              : isSilent
                ? 'no_recent_interaction'
                : row.followed && row.without_next_action
                  ? 'without_next_action'
                  : null
        if (!kind) continue
        anomalies.push({
          account_id: row.id,
          company_name: row.company_name,
          kind,
          since: kind === 'no_recent_interaction' ? lastInteraction : toIso(row.new_signal_at),
          logo_url: row.logo_url,
          website: row.website,
        })
      }

      // Les plus graves d'abord, puis les plus anciennes : `since` à `null`
      // veut dire « jamais », qui est le silence le plus long qui soit. Ce tri
      // décide QUI entre dans les cinq — la mémoire marché n'y participe pas
      // encore, faute d'avoir été interrogée (elle ne l'est qu'APRÈS la coupe,
      // voir `withMarketPaths`).
      const cut = anomalies
        .sort(
          (left, right) => ANOMALY_RANK[left.kind] - ANOMALY_RANK[right.kind] || compareSince(left.since, right.since),
        )
        .slice(0, MAX_ANOMALIES)
      const annotated = await this.withMarketPaths(cut, rows, workspaceId)

      return {
        followed,
        without_next_action: withoutNextAction,
        no_interaction_30d: silent,
        new_signals_7d: newSignals,
        never_worked: neverWorked,
        /**
         * #1573.5 — LA MÉMOIRE MARCHÉ DANS LE CLASSEMENT.
         *
         * ⚠️ RENVERSÉ le 13/10/2026 (#4016.L10.c, décision Louis 11/10) —
         * ancien texte : ~~« `marketPotentialRank` ne joue qu'À ÉGALITÉ DE
         * `kind` […] la mémoire marché AUGMENTE un potentiel, elle ne
         * FABRIQUE jamais une urgence »~~. La chaleur (`anomalyHeat`) mène
         * désormais : une présence marché seule rend un compte chaud.
         *
         * Ce second tri se fait ICI, sur `annotated` (le tableau déjà
         * complété par `withMarketPaths`) : le trier PLUS TÔT, sur `cut`
         * avant l'annotation, comparerait des `market_paths` qui n'existent
         * pas encore — chaque anomalie vaudrait `undefined`, et le tri
         * n'aurait aucun effet, exactement le défaut que ce lot corrige.
         */
        // #4016.L10.c — la CHALEUR mène (signal neuf OU présence marché),
        // `ANOMALY_RANK` départage à chaleur égale : un signal neuf reste en
        // tête des comptes chauds (rang 0), mais un compte observé par la
        // mémoire marché passe devant un compte froid — renversement de GA-262.
        anomalies: annotated.sort(
          (left, right) =>
            anomalyHeat(right) - anomalyHeat(left) ||
            ANOMALY_RANK[left.kind] - ANOMALY_RANK[right.kind] ||
            compareSince(left.since, right.since),
        ),
        provenance: provenance(['bellum'], NO_INTERACTION_DAYS, rows.length, at),
      }
    } catch (error) {
      this.logger.warn('cockpit coverage read failed', { error })
      return empty
    }
  }

  /**
   * LA DYNAMIQUE RELATIONNELLE (#1409) — une synthèse, pas une seconde boîte de
   * réception.
   *
   * ⚠️ AUCUN corps de message ne traverse cette méthode, et c'est une doctrine
   * (D65) : le corps d'un message ne sort jamais vers un humain autre que son
   * propriétaire. On compte des fils ; « le détail des emails reste dans
   * Messagerie », dit le retour lui-même.
   *
   * ⚠️ `accounts_without_interaction` n'est PAS calculé ici — il est recopié du
   * bloc Couverture par {@link getPerspective}. C'est le piège le plus cher du
   * lot 6 : une tuile annonçait 2 et son filtre rendait zéro ligne, parce que
   * trois requêtes comptaient trois populations sous le même mot. Deux blocs
   * qui affichent « comptes sans échange depuis 30 jours » doivent afficher le
   * MÊME nombre, et la seule façon de le garantir est qu'il n'y ait qu'un
   * calcul.
   */
  private async relationship(userId: string, workspaceId: string, at: string): Promise<CockpitRelationshipPulse> {
    try {
      const [row] = await this.dataSource.query<
        { active_threads: string; awaiting_reply: string; replies_received: string }[]
      >(
        `WITH mine AS (
            SELECT a.id FROM accounts a WHERE ${PORTFOLIO_SCOPE_SQL}
         ),
         touched AS (
            SELECT ac.account_id,
                   MAX(ac.occurred_at) AS last_at,
                   MAX(ac.occurred_at) FILTER (WHERE ac.direction = 'inbound') AS last_inbound,
                   MAX(ac.occurred_at) FILTER (WHERE ac.direction = 'outbound') AS last_outbound
              FROM activities ac
              JOIN mine ON mine.id = ac.account_id
             WHERE ac.kind IN ${INTERACTION_KINDS_SQL}
               AND ac.occurred_at >= now() - ($3 || ' days')::interval
             GROUP BY ac.account_id
         )
         SELECT COUNT(*)::int AS "active_threads",
                COUNT(*) FILTER (
                  WHERE last_outbound IS NOT NULL
                    AND (last_inbound IS NULL OR last_inbound < last_outbound)
                )::int AS "awaiting_reply",
                COALESCE((
                  SELECT COUNT(*)::int FROM activities ac2
                    JOIN mine ON mine.id = ac2.account_id
                   WHERE ac2.direction = 'inbound'
                     AND ac2.kind IN ${INTERACTION_KINDS_SQL}
                     AND ac2.occurred_at >= now() - ($3 || ' days')::interval
                ), 0) AS "replies_received"
           FROM touched`,
        [workspaceId, userId, String(NO_INTERACTION_DAYS)],
      )

      return {
        active_threads: toNumber(row?.active_threads),
        awaiting_reply: toNumber(row?.awaiting_reply),
        replies_received: toNumber(row?.replies_received),
        // Rempli par `getPerspective` depuis le bloc Couverture — un seul calcul.
        accounts_without_interaction: null,
        provenance: provenance(['bellum', 'mailbox'], NO_INTERACTION_DAYS, toNumber(row?.active_threads), at),
      }
    } catch (error) {
      this.logger.warn('cockpit relationship read failed', { error })
      return {
        active_threads: null,
        awaiting_reply: null,
        replies_received: null,
        accounts_without_interaction: null,
        provenance: provenance([], NO_INTERACTION_DAYS, null, at),
      }
    }
  }

  /**
   * LES OPPORTUNITÉS À RÉVEILLER (#1407, 2e section) — le bloc dont le retour
   * dit qu'il est « réellement différenciant ».
   *
   * ⚠️ « Dormante » est un CROISEMENT, jamais un état de cycle de vie — et
   * depuis #2117.21 (Louis, 15/09/2026) la distinction compte DOUBLE : la
   * valeur `dormant` (« En veille ») existe, mais elle est DÉCLARÉE par un
   * commercial, avec son motif. Ce bloc ne la lit pas et ne l'écrit pas : il
   * croise un silence, ce qui n'est pas la même phrase. Un compte mis en veille
   * a quelqu'un qui a dit pourquoi ; un compte silencieux n'a que notre absence
   * de nouvelles — les confondre ferait dire à l'écran ce que personne n'a dit.
   *
   * Le croisement est en trois temps, et les trois sont FACTUELS ET DATÉS :
   *  1. une relation a EXISTÉ — un profil poussé, un contact connu, un échange,
   *     un besoin ouvert ou une analyse menée ;
   *  2. elle s'est TUE depuis au moins {@link DORMANT_SILENCE_DAYS} ;
   *  3. et parfois, un signal NEUF donne une raison de rouvrir maintenant.
   *
   * ⚠️ Le troisième temps est facultatif ET le bloc le dit. Le retour écrit
   * « Ne jamais inventer une relation passée : source + date obligatoires » ;
   * inventer un signal pour rendre la carte plus vendeuse serait la même faute
   * d'un cran plus loin. Sans signal, la raison EST le silence.
   */
  private async dormant(userId: string, workspaceId: string): Promise<CockpitDormantOpportunity[]> {
    try {
      const rows = await this.dataSource.query<
        {
          id: string
          company_name: string | null
          logo_url: string | null
          website: string | null
          registry_country: string | null
          last_interaction: Date | null
          last_submission: Date | null
          submission_label: string | null
          last_message: Date | null
          contact_since: Date | null
          contact_label: string | null
          need_since: Date | null
          need_label: string | null
          signal_label: string | null
          signal_at: Date | null
        }[]
      >(
        `SELECT a.id,
                NULLIF(btrim(a.company_name), '') AS "company_name",
                a.logo_url,
                a.website,
                a.registry_country,
                (SELECT MAX(ac.occurred_at) FROM activities ac
                  WHERE ac.account_id = a.id AND ac.kind IN ${INTERACTION_KINDS_SQL}) AS "last_interaction",
                sub.submitted_at AS "last_submission",
                sub.label       AS "submission_label",
                (SELECT MAX(ac.occurred_at) FROM activities ac
                  WHERE ac.account_id = a.id AND ac.kind = 'email') AS "last_message",
                ct.created_at AS "contact_since",
                ct.full_name  AS "contact_label",
                nd.first_detected_at AS "need_since",
                nd.label             AS "need_label",
                sig.label   AS "signal_label",
                sig.seen_at AS "signal_at"
           FROM accounts a
           LEFT JOIN LATERAL (
                SELECT s.submitted_at, o.label
                  FROM submissions s
                  JOIN opportunities o ON o.id = s.project_id
                 WHERE o.account_id = a.id AND s.submitted_at IS NOT NULL
                 ORDER BY s.submitted_at DESC LIMIT 1
           ) sub ON TRUE
           LEFT JOIN LATERAL (
                SELECT c.created_at, c.full_name
                  FROM contacts c
                 WHERE c.account_id = a.id
                 ORDER BY c.created_at ASC LIMIT 1
           ) ct ON TRUE
           LEFT JOIN LATERAL (
                SELECT o.first_detected_at, o.label
                  FROM opportunities o
                 WHERE o.account_id = a.id
                   AND ${projectStageInSql('o.stage', LIVE_STAGES)}
                 ORDER BY o.first_detected_at DESC LIMIT 1
           ) nd ON TRUE
           LEFT JOIN LATERAL (
                SELECT sh.label, sh.last_seen_at AS seen_at
                  FROM signal_history sh
                 WHERE sh.account_id = a.id AND sh.status = 'active'
                   AND sh.last_seen_at >= now() - ($4 || ' days')::interval
                 ORDER BY sh.last_seen_at DESC LIMIT 1
           ) sig ON TRUE
          WHERE ${PORTFOLIO_SCOPE_SQL}
            AND COALESCE(
                  (SELECT MAX(ac.occurred_at) FROM activities ac
                    WHERE ac.account_id = a.id AND ac.kind IN ${INTERACTION_KINDS_SQL}),
                  'epoch'::timestamptz
                ) < now() - ($3 || ' days')::interval`,
        [workspaceId, userId, String(DORMANT_SILENCE_DAYS), String(NO_INTERACTION_DAYS)],
      )

      const opportunities: CockpitDormantOpportunity[] = []
      for (const row of rows) {
        const evidence: CockpitDormantOpportunity['evidence'] = []
        // ⚠️ RECETTE LIVE DU 04/09 — CES LIBELLÉS SONT DES PARAGRAPHES.
        //
        // `opportunities.label` et `signal_history.label` portent des analyses
        // entières : « Les besoins IT propres à … ne sont pas documentés dans
        // les sources. Hypothèse à vérifier : une structure de conseil et de
        // services rattachée à un groupe européen de transport pourrait avoir
        // des besoins de consolidation de données, de sécurisation des flux… » —
        // quatre-vingts mots, dans une carte qui en attend cinq. Rendus tels
        // quels, ils donnaient des pastilles de CINQ LIGNES et rendaient la
        // carte illisible. Aucun test ne pouvait le voir : jsdom ne met rien en
        // page, et la chaîne était juste.
        //
        // `shortReason` existe pour ça, et a déjà servi au même défaut sur les
        // libellés de relance : on coupe NOUS, sur un mot entier, et on le dit
        // par un « … ». Une phrase tronquée par la mise en page ne signale rien
        // et se lit comme une donnée abîmée. Rien n'est perdu — « Voir
        // pourquoi » ouvre la fiche, qui porte le texte entier.
        const push = (
          kind: CockpitDormantOpportunity['evidence'][number]['kind'],
          label: string | null,
          when: unknown,
        ) => {
          const occurredAt = toIso(when)
          if (occurredAt) {
            evidence.push({
              kind,
              label: label ? shortReason(label, DORMANT_LABEL_CHARS) : null,
              occurred_at: occurredAt,
            })
          }
        }
        push('proposal_sent', row.submission_label, row.last_submission)
        push('message_exchanged', null, row.last_message)
        push('need_open', row.need_label, row.need_since)
        push('contact_known', row.contact_label, row.contact_since)

        // Aucune preuve DATÉE ⇒ ce n'est pas une opportunité endormie, c'est un
        // compte dont on ne sait rien. Il ne rentre pas.
        if (evidence.length === 0) continue

        opportunities.push({
          account_id: row.id,
          company_name: row.company_name,
          logo_url: row.logo_url,
          website: row.website,
          evidence: evidence.sort((left, right) => Date.parse(right.occurred_at) - Date.parse(left.occurred_at)),
          last_interaction_at: toIso(row.last_interaction),
          new_signal:
            row.signal_label && toIso(row.signal_at)
              ? {
                  label: shortReason(row.signal_label, DORMANT_LABEL_CHARS),
                  detected_at: toIso(row.signal_at) as string,
                }
              : null,
        })
      }

      // Un signal neuf d'abord — c'est lui qui donne une raison d'agir CETTE
      // semaine ; à défaut, la relation la plus forte, mesurée par le nombre de
      // preuves qu'elle a laissées.
      const cut = opportunities
        .sort(
          (left, right) =>
            Number(Boolean(right.new_signal)) - Number(Boolean(left.new_signal)) ||
            right.evidence.length - left.evidence.length ||
            Date.parse(right.evidence[0].occurred_at) - Date.parse(left.evidence[0].occurred_at),
        )
        .slice(0, MAX_DORMANT)
      // #1574.1 — la mémoire marché n'est interrogée QU'APRÈS la coupe : cinq
      // comptes au plus, jamais le portefeuille entier. Elle ne décide donc pas
      // QUI entre dans le bloc, seulement l'ordre des cinq qui y sont.
      return this.withDormantMarketPaths(cut, rows, workspaceId)
    } catch (error) {
      this.logger.warn('cockpit dormant read failed', { error })
      return []
    }
  }

  /**
   * LES SÉRIES (#1410) — servies SEULEMENT quand un historique réel existe.
   *
   * ⚠️ DEUX FORMES D'ABSENCE, ET ELLES NE SE DISENT PAS PAREIL.
   *
   *  · **Aucun historique du tout** ⇒ la série vaut `null`. Le retour le
   *    demande en toutes lettres — « si aucune série temporelle fiable n'existe,
   *    afficher une synthèse statique plutôt qu'un graphique artificiel » — et
   *    l'écran affiche alors les mêmes chiffres en texte.
   *  · **Une semaine ANTÉRIEURE à la première trace** ⇒ le point vaut `null`.
   *    On ne mesurait pas : écrire zéro dessinerait une vallée avant l'arrivée
   *    de l'utilisateur, et cette vallée se lirait comme un effondrement.
   *
   * Une semaine POSTÉRIEURE à la première trace et sans activité vaut `0`, et
   * ce zéro est VRAI : on mesurait, il ne s'est rien passé. C'est exactement la
   * question que le dépôt pose partout ailleurs — « si cette valeur est absente,
   * "0" est-il VRAI ? » —, et ici la réponse dépend de la semaine.
   *
   * `interaction-laws.ts` nommait ce trou comme non gardé : les primitives
   * `UnknownValue`/`MeasuredValue` tiennent l'invariant dans le TEXTE, rien ne
   * le tenait dans une courbe. Le contrat le tient maintenant, et la courbe
   * s'interrompt sur un `null` au lieu de plonger.
   */
  private async series(userId: string, workspaceId: string, at: string): Promise<CockpitSeries> {
    try {
      const rows = await this.dataSource.query<{ week: Date; covered: string; outreach: string; measured: boolean }[]>(
        `WITH mine AS (
            SELECT a.id FROM accounts a WHERE ${PORTFOLIO_SCOPE_SQL}
         ),
         first_trace AS (
            SELECT MIN(ua.created_at) AS at FROM user_actions ua
             WHERE ua.user_id = $2 AND ua.workspace_id = $1
         ),
         weeks AS (
            SELECT generate_series(
                     date_trunc('week', now()) - (($3::int - 1) || ' weeks')::interval,
                     date_trunc('week', now()),
                     '1 week'
                   ) AS week
         )
         SELECT w.week,
                COALESCE((
                  SELECT COUNT(DISTINCT ac.account_id)::int FROM activities ac
                    JOIN mine ON mine.id = ac.account_id
                   WHERE ac.occurred_at >= w.week AND ac.occurred_at < w.week + INTERVAL '1 week'
                     AND ac.kind IN ${INTERACTION_KINDS_SQL}
                ), 0) AS "covered",
                COALESCE((
                  SELECT COUNT(*)::int FROM activities ac
                    JOIN mine ON mine.id = ac.account_id
                   WHERE ac.occurred_at >= w.week AND ac.occurred_at < w.week + INTERVAL '1 week'
                     AND ac.direction = 'outbound' AND ac.kind IN ${INTERACTION_KINDS_SQL}
                ), 0) AS "outreach",
                (SELECT at IS NOT NULL AND at < w.week + INTERVAL '1 week' FROM first_trace) AS "measured"
           FROM weeks w
          ORDER BY w.week ASC`,
        [workspaceId, userId, String(SERIES_WEEKS)],
      )

      const point = (row: (typeof rows)[number], key: 'covered' | 'outreach'): CockpitSeriesPoint => ({
        at: (toIso(row.week) ?? new Date().toISOString()).slice(0, 10),
        value: row.measured ? (toNumber(row[key]) ?? 0) : null,
      })
      // Pas UNE semaine mesurée ⇒ pas de série. Une courbe entièrement creuse
      // n'est pas un graphique, c'est un décor.
      const measured = rows.some(row => row.measured)

      return {
        coverage: measured ? rows.map(row => point(row, 'covered')) : null,
        outreach: measured ? rows.map(row => point(row, 'outreach')) : null,
        provenance: provenance(measured ? ['bellum', 'mailbox'] : [], SERIES_WEEKS * 7, rows.length, at),
      }
    } catch (error) {
      this.logger.warn('cockpit series read failed', { error })
      return { coverage: null, outreach: null, provenance: provenance([], SERIES_WEEKS * 7, null, at) }
    }
  }
}

/** La gravité d'une anomalie de couverture — l'ordre de la file de décision. */
const ANOMALY_RANK: Record<CockpitCoverageAnomaly['kind'], number> = {
  new_signal_untouched: 0,
  never_worked: 1,
  no_recent_interaction: 2,
  without_next_action: 3,
}

/**
 * #4016.L10.c — LA CHALEUR D'UNE ANOMALIE DE COUVERTURE, pour le tri PREMIER.
 *
 * ⚠️ RENVERSEMENT DATÉ (Louis 11/10/2026, « un signal isolé suffit pour
 * chaud ») de #1573.5 / GA-262, où la présence marché (`marketPotentialRank`)
 * ne jouait qu'en départage À ÉGALITÉ DE `kind`. Un seul signal suffit : un
 * signal neuf jamais travaillé, OU la couverture du compte par la mémoire
 * marché (`market_paths` non nul — le service qui la lit applique déjà son
 * seuil). Une PRÉSENCE, jamais un volume : la règle vit dans le contrat
 * (`marketHeatRank`), pas ici.
 */
function anomalyHeat(anomaly: CockpitCoverageAnomaly): number {
  return marketHeatRank({ recentSignal: anomaly.kind === 'new_signal_untouched', marketPaths: anomaly.market_paths })
}

/**
 * #4016.L10.c — la MÊME chaleur, sur une opportunité endormie (#1574.1) : un
 * signal neuf OU une présence marché. Le CTA, lui, reste décidé par le seul
 * `new_signal` côté écran : « chaud » ordonne, il ne fabrique aucune raison
 * datée de contacter.
 */
function dormantHeat(item: CockpitDormantOpportunity): number {
  return marketHeatRank({ recentSignal: Boolean(item.new_signal), marketPaths: item.market_paths })
}

/** `null` = JAMAIS d'interaction, donc le silence le plus long : il passe en
 *  tête, il ne tombe pas en fin de liste comme le ferait une date manquante. */
function compareSince(left: string | null, right: string | null): number {
  if (left === right) return 0
  if (left === null) return -1
  if (right === null) return 1
  return Date.parse(left) - Date.parse(right)
}
