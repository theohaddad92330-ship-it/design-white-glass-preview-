import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  RUNNING_MISSION_STATUSES,
  buildNeedVerdict,
  accessFreshness,
  bestAccessFact,
  chooseCommercialMethod,
  consentState,
  daysBeforeConsentExpiry,
  needStillOpenSql,
  taskStillOpenSql,
  needStaffableNotRefusedSql,
  type NeedAcceptanceFact,
  type NeedVerdict,
  type NeedVerdictProfile,
  type NeedVerdictResponse,
  matchAxisResultSchema,
  matchInClear,
  type MatchInClear,
} from '@bellum/contracts'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { NEED_STALE_AFTER_DAYS } from '../briefing/briefing-actions'

/**
 * LE VERDICT « GO / NO-GO » D'UN BESOIN — la lecture qui alimente les six axes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE SERVICE NE CALCULE RIEN. IL LIT.
 * ─────────────────────────────────────────────────────────────────────────────
 * La décision entière vit dans `buildNeedVerdict`
 * (`packages/contracts/src/schemas/need-verdict.ts`), qui est pur et testé à
 * part. Ici il n'y a que sept `SELECT` et le passage des grandeurs. C'est
 * délibéré : une règle recopiée dans un service diverge de sa version de
 * contrat au premier réglage, et c'est le web qui affiche l'une pendant que
 * l'API applique l'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ POURQUOI AUCUN RAPPROCHEMENT N'EST LANCÉ ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux axes sur six (capacité à staffer, faisabilité) ont besoin d'un
 * classement de profils. On pourrait en lancer un — et ce serait une faute :
 * « lancer un matching est une MUTATION, pas une lecture » (docblock de
 * `useRunMatch`), elle écrit un journal, et une obligation de conformité ne se
 * déclenche pas en ouvrant un onglet. Cette fiche remplirait le journal
 * d'exécutions que personne n'a demandées.
 *
 * On lit donc le DERNIER rapprochement DÉJÀ exécuté (`match_runs` /
 * `match_run_entries`, écrits par `MatchingService`). Aucun n'a jamais tourné ⇒
 * les deux axes sont NON RENSEIGNÉS, ils le disent, et le verdict devient
 * « je manque de données ». Ce qui est vrai : personne n'a regardé le vivier.
 *
 * C'est aussi pourquoi la réponse porte `runAt` : ce verdict est LU dans un
 * journal, pas recalculé, et une mesure sans date se relit comme fraîche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AUCUN CRITÈRE PROTÉGÉ NE VOYAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois profils rendus sont RANGÉS (par rang du classement). Le seul champ
 * de personne lu par ce fichier est `full_name` — l'une des deux exceptions
 * nommées de `c58_criteres_proteges` : le livrable DÉSIGNE la personne, et le
 * nom n'entre dans aucun ordre (le rang vient de `match_run_entries.rank`, que
 * le moteur a écrit sans jamais recevoir d'identité). Ni photo, ni date de
 * naissance, ni genre, ni nationalité, ni adresse n'est SÉLECTIONNÉ — ce que la
 * spec de ce service vérifie sur le SQL réellement émis.
 */
@Injectable()
export class NeedVerdictService {
  constructor(
    @InjectRepository(ProjectNeedEntity)
    private readonly needs: Repository<ProjectNeedEntity>,
  ) {}

  /** Combien de profils la maquette montre. Au-delà, ce n'est plus une lecture,
   *  c'est le tiroir de rapprochement — qui existe déjà, et à sa place. */
  private static readonly PROFILES_SHOWN = 3

  /** #3390.9 — le compte du besoin (ou `null`), borné à l'espace : le contrôleur lit les 5P dessus. */
  async accountIdOf(workspaceId: string, needId: string): Promise<string | null> {
    const [need] = (await this.needs.manager.query(
      `SELECT n.account_id FROM project_needs n WHERE n.id = $1 AND n.workspace_id = $2 LIMIT 1`,
      [needId, workspaceId],
    )) as { account_id: string | null }[]
    if (!need) throw new NotFoundException('Besoin introuvable')
    return need.account_id
  }

  /**
   * #3390.10/.11 — le besoin OUVERT le plus récent d'un compte, ou `null`. Laura lit
   * la méthode de CE besoin (la même que l'écran) quand un dossier est ouvert au chat.
   * Même définition d'« ouvert » que le verdict (`needStillOpenSql`, GA-26) ; borné à l'espace.
   */
  async openNeedIdOfAccount(workspaceId: string, accountId: string): Promise<string | null> {
    const [row] = (await this.needs.manager.query(
      `SELECT n.id FROM project_needs n
        WHERE n.workspace_id = $1 AND n.account_id = $2 AND ${needStillOpenSql('n.status')}
        ORDER BY n.created_at DESC
        LIMIT 1`,
      [workspaceId, accountId],
    )) as { id: string }[]
    return row?.id ?? null
  }

  async forNeed(
    workspaceId: string,
    needId: string,
    now: Date = new Date(),
    userId: string | null = null,
  ): Promise<NeedVerdictResponse> {
    const manager = this.needs.manager

    // ── 1. Le besoin, et l'appartenance à l'espace ─────────────────────────
    // Elle se vérifie AVANT tout le reste : on ne compte pas les missions d'un
    // compte qu'on n'a pas le droit de lire.
    const [need] = (await manager.query(
      // #2558.1 — un besoin existe sans projet : le compte se lit sur le
      // BESOIN, et le projet n'est plus exigé. En INNER, le verdict d'un
      // besoin sans projet rendait « Besoin introuvable » — un 404 sur un
      // besoin parfaitement visible sur le board d'à-côté.
      `SELECT n.id, n.target_tjm_cents, n.min_tjm_cents, n.start_on, n.project_id, n.account_id,
              n.status, n.staffable, n.created_at, n.procurement_involvement,
              o.risks AS project_risks
         FROM project_needs n
         LEFT JOIN opportunities o ON o.id = n.project_id
        WHERE n.id = $1 AND n.workspace_id = $2
        LIMIT 1`,
      [needId, workspaceId],
    )) as NeedRow[]
    if (!need) throw new NotFoundException('Besoin introuvable')

    const accountId = need.account_id
    const startOn = need.start_on === null ? null : String(need.start_on).slice(0, 10)

    // ── 2. Le dernier rapprochement DÉJÀ exécuté ───────────────────────────
    // ⚠️ `workspace_id = $2` strictement : la colonne est nullable, et un
    // `OR IS NULL` ferait remonter une exécution d'un autre espace. Une ligne
    // ancienne sans espace n'est donc pas trouvée — l'axe le dit, il ne devine
    // pas.
    const [run] = (await manager.query(
      `SELECT r.id, r.threshold, r.evaluated_count, r.created_at
         FROM match_runs r
        WHERE r.need_id = $1 AND r.workspace_id = $2 AND r.direction = 'need_to_pool'
        ORDER BY r.created_at DESC
        LIMIT 1`,
      [needId, workspaceId],
    )) as RunRow[]

    let aboveThreshold: number | null = null
    let entries: EntryRow[] = []
    if (run) {
      // Le COMPTE vient de la base et non des lignes rendues : les trois cartes
      // sont un extrait, « 3 profils passent le seuil » est un total.
      const [counted] = (await manager.query(
        `SELECT COUNT(*)::int AS above FROM match_run_entries WHERE run_id = $1 AND bucket = 'recommended'`,
        [run.id],
      )) as { above: number }[]
      aboveThreshold = toInt(counted?.above) ?? 0
      entries = (await manager.query(
        `SELECT e.consultant_id, e.correspondence_score, e.pushable_score, e.axes
           FROM match_run_entries e
          WHERE e.run_id = $1 AND e.bucket = 'recommended'
          ORDER BY e.rank ASC
          LIMIT $2`,
        [run.id, NeedVerdictService.PROFILES_SHOWN],
      )) as EntryRow[]
    }

    // ── 3. Relation et concurrence — les deux lectures de COMPTE ───────────
    // Sans compte rattaché, on ne les émet pas : une requête sur `NULL` rendrait
    // zéro, et ce zéro se lirait « aucune mission », qui est une affirmation.
    let activeMissions: number | null = null
    let partnersOnAccount: { total: number; competitors: number } | null = null
    if (accountId) {
      const [missions] = (await manager.query(
        `SELECT COUNT(*)::int AS active
           FROM missions
          WHERE workspace_id = $1 AND account_id = $2 AND status = ANY($3::text[])`,
        [workspaceId, accountId, [...RUNNING_MISSION_STATUSES]],
      )) as { active: number }[]
      activeMissions = toInt(missions?.active) ?? 0

      // ⚠️ `total` compte TOUTES les lignes du panel, pas seulement les
      // concurrents : c'est lui qui distingue « personne en face » de « personne
      // n'a regardé ». Sans cette distinction, un compte dont le panel n'a
      // jamais été saisi sortirait « zéro concurrent », rassurant et faux.
      const [partners] = (await manager.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE relationship = 'competitor')::int AS competitors
           FROM account_partners
          WHERE workspace_id = $1 AND account_id = $2 AND dismissed_at IS NULL`,
        [workspaceId, accountId],
      )) as { total: number; competitors: number }[]
      partnersOnAccount = { total: toInt(partners?.total) ?? 0, competitors: toInt(partners?.competitors) ?? 0 }
    }

    // ── 4. L'accès — les contacts de l'AFFAIRE et leur rôle ────────────────
    // On compte des RÔLES, on ne classe personne. `project_contacts.role`
    // porte `decideur` depuis le chantier CRM.
    const [contacts] = (await manager.query(
      `SELECT COUNT(*)::int AS contacts,
              COUNT(*) FILTER (WHERE role = 'decideur')::int AS deciders
         FROM project_contacts
        WHERE project_id = $1`,
      [need.project_id],
    )) as { contacts: number; deciders: number }[]
    const contactsKnown = toInt(contacts?.contacts) ?? 0

    // #3389.8 — l'accès ORGANISATIONNEL : le verrou du compte, lu dans les faits d'accès
    // (même règle que l'onglet Accès : le meilleur fait, et un fait périmé redevient inconnu).
    let accessLock: 'ouvert' | 'semi_ouvert' | 'verrouille' | 'inconnu' = 'inconnu'
    if (accountId) {
      const lockRows = (await manager.query(
        `SELECT value, provenance, observed_at
           FROM access_facts
          WHERE workspace_id = $1 AND account_id = $2 AND kind = 'lock'`,
        [workspaceId, accountId],
      )) as { value: string; provenance: string; observed_at: Date | string | null }[]
      const facts = lockRows.map(row => ({
        kind: 'lock' as const,
        value: row.value,
        provenance: row.provenance as 'human' | 'connector' | 'pipeline' | 'model',
        observed_at: row.observed_at ? new Date(row.observed_at).toISOString() : null,
      }))
      const best = bestAccessFact(facts)
      if (best && accessFreshness(best, now) === 'fresh') {
        accessLock = (['ouvert', 'semi_ouvert', 'verrouille'] as const).find(state => state === best.value) ?? 'inconnu'
      }
    }

    // ── 5. Les profils, et leur lecture d'acceptation ──────────────────────
    const profiles = await this.buildProfiles(entries, workspaceId, accountId, now)

    // ── 5 bis. Refonte Théo — les POSITIONNÉS, leur correspondance en clair ─
    // Lue sur le MÊME rapprochement que les cartes : sans rapprochement, aucune
    // ligne — une correspondance devinée serait la donnée inventée refusée.
    let positionedInClear: { consultantId: string; inClear: MatchInClear }[] = []
    if (run) {
      const positioned = (await manager.query(
        `SELECT e.consultant_id, e.axes
           FROM match_run_entries e
          WHERE e.run_id = $1
            AND e.consultant_id IN (
              SELECT s.consultant_id FROM submissions s WHERE s.need_id = $2 AND s.workspace_id = $3
            )`,
        [run.id, needId, workspaceId],
      )) as { consultant_id: string | null; axes: unknown }[]
      positionedInClear = positioned
        .filter((row): row is { consultant_id: string; axes: unknown } => Boolean(row.consultant_id))
        .map(row => ({ consultantId: row.consultant_id, inClear: axesInClear(row.axes) }))
    }

    const bestAxes = entries[0] ? readAxes(entries[0].axes) : null

    const verdict = buildNeedVerdict({
      staffingCapacity: {
        aboveThreshold,
        threshold: toInt(run?.threshold) ?? 0,
        evaluated: run ? (toInt(run.evaluated_count) ?? 0) : null,
      },
      economics: {
        targetRateCents: toInt(need.target_tjm_cents),
        floorRateCents: toInt(need.min_tjm_cents),
      },
      relationship: { activeMissions, accountKnown: accountId !== null },
      competition: {
        competitorsOnAccount: partnersOnAccount?.competitors ?? null,
        panelLooked: (partnersOnAccount?.total ?? 0) > 0,
      },
      // La faisabilité lit l'axe 8 du PROFIL LE MIEUX CLASSÉ : c'est celui
      // qu'on présentera. La moyenne des trois dirait « à peu près tenable »,
      // ce qui n'est vrai de personne.
      feasibility: { availabilityScore: bestAxes?.availability ?? null, startOn },
      access: { contactsKnown, decisionMakerKnown: (toInt(contacts?.deciders) ?? 0) > 0, accessLock },
      // #3389.9/.10 — deux lectures déjà en base, jamais recalculées ici.
      // Une valeur hors des deux déclarées se lit « non renseigné », pas deviné.
      procurement: {
        procurementInvolvement:
          need.procurement_involvement === 'implique' || need.procurement_involvement === 'non_implique'
            ? need.procurement_involvement
            : null,
      },
      contractRisk: { riskText: need.project_risks ?? null },
    })

    // ── 6. #3390 — la méthode, choisie à partir du MÊME verdict ────────────
    // ⚠️ `stale` relit le prédicat de `needsWithoutShortlistSql` (#2107.3,
    // `crm-routines.service.ts`) plutôt que de le recopier : même seuil, même
    // porte G3, même définition d'« ouvert » — GA-26.
    const [staleRow] = (await manager.query(
      `SELECT ${needStillOpenSql('n.status')} AND ${needStaffableNotRefusedSql('n.staffable')}
              AND n.created_at < now() - ($2 || ' days')::interval
              AND NOT EXISTS (SELECT 1 FROM shortlists s WHERE s.need_id = n.id) AS stale
         FROM project_needs n
        WHERE n.id = $1`,
      [needId, NEED_STALE_AFTER_DAYS],
    )) as { stale: boolean }[]

    const commercialContext = await this.readCommercialLoad(workspaceId, userId)

    return {
      verdict,
      profiles,
      positionedInClear,
      runAt: run ? new Date(run.created_at).toISOString() : null,
      // Les 5P du compte sont lus par le contrôleur (`AccountStrategy5PService`, autre module) : ici `null`.
      commercialContext,
      method: chooseCommercialMethod({
        verdict: {
          verdict: verdict.verdict,
          blockingAxes: verdict.blockingAxes,
          unmeasuredDecisiveAxes: verdict.unmeasuredDecisiveAxes,
        },
        relationshipState: axisState(verdict, 'relationship') as 'positive' | 'attention' | null,
        accessState: axisState(verdict, 'access') as 'positive' | 'attention' | null,
        staffingState: axisState(verdict, 'staffing_capacity'),
        stale: staleRow?.stale === true,
      }),
    }
  }

  /**
   * #3390.9 — la charge du commercial : capacité DÉCLARÉE + actions en retard. UNE lecture (GA-26),
   * partagée par le verdict d'un besoin et par la méthode d'un compte sans besoin ouvert.
   */
  private async readCommercialLoad(workspaceId: string, userId: string | null) {
    const manager = this.needs.manager
    // `null` = non déclarée (ou 0 h, qui n'est pas une capacité) : aucune ligne à l'écran, jamais « 0 h ».
    const [load] = (await manager.query(
      `SELECT weekly_available_hours FROM workspace_commercial_load_settings WHERE workspace_id = $1`,
      [workspaceId],
    )) as { weekly_available_hours: number | null }[]
    const declaredHours = toInt(load?.weekly_available_hours)
    // #3390.9 (reste) — la charge RÉELLE : les actions ouvertes en retard du lecteur. Sans lecteur, rien n'est lu (`null`).
    const [overdueRow] = userId
      ? ((await manager.query(
          `SELECT COUNT(*)::int AS overdue FROM tasks t
            WHERE t.workspace_id = $1 AND t.owner_id = $2 AND ${taskStillOpenSql('t')} AND t.due_on < CURRENT_DATE`,
          [workspaceId, userId],
        )) as { overdue: number }[])
      : []
    return {
      weeklyAvailableHours: declaredHours !== null && declaredHours > 0 ? declaredHours : null,
      // Les 5P du compte sont lus par le contrôleur (`AccountStrategy5PService`, autre module) : ici `null`.
      fiveP: null,
      overdueActions: userId ? (toInt(overdueRow?.overdue) ?? 0) : null,
    }
  }

  /**
   * #3390.10 (recette prod 04/10) — la méthode d'un compte cadré SANS besoin ouvert. Le lecteur de Laura
   * ne rendait la méthode que sur un besoin ouvert : « Quelle approche pour ce compte ? » restait sans
   * bloc Méthode. Sans besoin, le verdict n'est pas évaluable : le MÊME moteur tourne sur « données
   * insuffisantes », relation et accès NON mesurés (jamais devinés), capacité à staffer non mesurée.
   */
  async methodWithoutOpenNeed(
    workspaceId: string,
    userId: string | null,
  ): Promise<Pick<NeedVerdictResponse, 'method' | 'commercialContext'>> {
    return {
      commercialContext: await this.readCommercialLoad(workspaceId, userId),
      method: chooseCommercialMethod({
        verdict: { verdict: 'insufficient_data', blockingAxes: [], unmeasuredDecisiveAxes: ['staffing_capacity'] },
        relationshipState: null,
        accessState: null,
        staffingState: null,
        stale: false,
      }),
    }
  }

  /**
   * Les trois cartes de la maquette.
   *
   * ⚠️ Un profil dont le NOM ne se résout pas est ÉCARTÉ, jamais rendu sous un
   * « inconnu » : une carte anonyme dans une liste de personnes est exactement
   * la donnée inventée que la doctrine refuse. Il continue en revanche de
   * compter au seuil — ce total vient de la base, pas de cette boucle.
   */
  private async buildProfiles(
    entries: readonly EntryRow[],
    workspaceId: string,
    accountId: string | null,
    now: Date,
  ): Promise<NeedVerdictProfile[]> {
    const ids = entries.map(entry => entry.consultant_id).filter((id): id is string => Boolean(id))
    if (ids.length === 0) return []

    const people = (await this.needs.manager.query(
      `SELECT c.id, c.full_name, c.consent_given_at, c.consent_expires_at
         FROM consultants c
        WHERE c.workspace_id = $1 AND c.id = ANY($2::uuid[])`,
      [workspaceId, ids],
    )) as PersonRow[]
    const byId = new Map(people.map(person => [person.id, person]))

    // Les positionnements CLOS de ces personnes CHEZ CE CLIENT — le premier des
    // quatre drapeaux sourcés de SOL6. Sans compte, la question ne se pose pas.
    const decided = new Map<string, { accepted: number; rejected: number }>()
    if (accountId) {
      const rows = (await this.needs.manager.query(
        `SELECT s.consultant_id,
                COUNT(*) FILTER (WHERE s.stage = 'accepted')::int AS accepted,
                COUNT(*) FILTER (WHERE s.stage = 'rejected')::int AS rejected
           FROM submissions s
           JOIN opportunities p ON p.id = s.project_id
          WHERE s.workspace_id = $1 AND p.account_id = $2 AND s.consultant_id = ANY($3::uuid[])
          GROUP BY s.consultant_id`,
        [workspaceId, accountId, ids],
      )) as { consultant_id: string; accepted: number; rejected: number }[]
      for (const row of rows) {
        decided.set(row.consultant_id, { accepted: toInt(row.accepted) ?? 0, rejected: toInt(row.rejected) ?? 0 })
      }
    }

    const built: NeedVerdictProfile[] = []
    for (const entry of entries) {
      const person = entry.consultant_id ? byId.get(entry.consultant_id) : undefined
      const fullName = person?.full_name?.trim()
      if (!person || !fullName) continue
      // Le MÊME objet sert aux deux lectures : l'état et les jours restants
      // doivent parler du même consentement, sinon une fiche affiche « expire
      // dans 28 j » à côté d'un état « valide » calculé sur autre chose.
      const consent = {
        givenAt: person.consent_given_at ? new Date(person.consent_given_at).toISOString() : null,
        expiresAt: person.consent_expires_at ? new Date(person.consent_expires_at).toISOString() : null,
        basis: null,
        restrictions: null,
      }
      built.push({
        consultantId: person.id,
        fullName,
        correspondenceScore: toInt(entry.correspondence_score) ?? 0,
        pushableScore: toInt(entry.pushable_score) ?? 0,
        acceptance: acceptanceFacts(decided.get(person.id) ?? null, readAxes(entry.axes), accountId !== null),
        consentState: consentState(consent, now),
        consentDaysLeft: daysBeforeConsentExpiry(consent, now),
        inClear: axesInClear(entry.axes),
      })
    }
    return built
  }
}

/* ------------------------------------------------------------------ */
/* Les lectures — toutes tolérantes, aucune devinette                  */
/* ------------------------------------------------------------------ */

type NeedRow = {
  id: string
  target_tjm_cents: string | number | null
  min_tjm_cents: string | number | null
  start_on: string | Date | null
  project_id: string
  account_id: string | null
  status: string
  staffable: string
  created_at: string | Date
  procurement_involvement?: string | null
  project_risks?: string | null
}
type RunRow = { id: string; threshold: number | string; evaluated_count: number | string; created_at: string | Date }
type EntryRow = {
  consultant_id: string | null
  correspondence_score: number | string
  pushable_score: number | string
  axes: unknown
}
type PersonRow = {
  id: string
  full_name: string | null
  consent_given_at: string | Date | null
  consent_expires_at: string | Date | null
}

/**
 * L'état d'UN axe du verdict, par son nom — ce que `chooseCommercialMethod`
 * lit, jamais une seconde dérivation des mêmes grandeurs (GA-26).
 */
function axisState(
  verdict: NeedVerdict,
  axis: NeedVerdict['axes'][number]['axis'],
): 'positive' | 'attention' | 'blocking' | null {
  return verdict.axes.find(item => item.axis === axis)?.state ?? null
}

/**
 * Un entier, ou `null` — jamais `NaN`, jamais un zéro de repli.
 *
 * ⚠️ Le pilote `pg` rend les colonnes `bigint` en CHAÎNE (`target_tjm_cents`
 * est un `bigint`). Comparer deux chaînes avec `>=` est lexicographique :
 * « 9000 » serait alors « supérieur » à « 65000 », et un besoin très en dessous
 * de son plancher sortirait au vert. La spec de ce service tient ce cas.
 */
function toInt(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

/**
 * Les trois axes du rapprochement dont ce verdict a besoin, relus dans le
 * `jsonb` du journal.
 *
 * On lit des SCORES, jamais les phrases : « un motif ne se relit pas dans du
 * texte français » (`missingClearances`). Un axe absent ou illisible rend
 * `null`, qui traverse jusqu'au contrat et y devient « non renseigné ».
 */
/** Refonte Théo — les axes écrits par le moteur, relus au contrat ; un axe illisible est ignoré, jamais deviné. */
function axesInClear(raw: unknown): MatchInClear {
  const parsed = Array.isArray(raw)
    ? raw.flatMap(item => {
        const read = matchAxisResultSchema.safeParse(item)
        return read.success ? [read.data] : []
      })
    : []
  return matchInClear(parsed)
}

function readAxes(raw: unknown): { availability: number | null; rate: number | null; sector: number | null } {
  const empty = { availability: null, rate: null, sector: null }
  if (!Array.isArray(raw)) return empty
  const find = (name: string): number | null => {
    const found = raw.find(
      (item): item is { axis: string; score: unknown } =>
        typeof item === 'object' && item !== null && (item as { axis?: unknown }).axis === name,
    )
    const score = found?.score
    return typeof score === 'number' && Number.isFinite(score) ? score : null
  }
  return { availability: find('availability'), rate: find('rate'), sector: find('sector') }
}

/**
 * La LECTURE D'ACCEPTATION — les quatre drapeaux sourcés de SOL6.
 *
 * Chaque fait vient d'une donnée qu'on peut montrer, et un fait qu'on ne peut
 * pas établir est simplement ABSENT de la liste : on n'écrit pas « pas de refus
 * connu » quand on n'a rien lu. C'est la même discipline qu'un axe non
 * renseigné, appliquée à une ligne de carte.
 *
 * ⚠️ « Jamais présenté ici » n'est émis QUE lorsqu'on a pu poser la question —
 * c'est-à-dire quand le besoin porte un compte. Sans compte, l'absence de
 * réponse n'est pas une page blanche, c'est une question non posée.
 */
function acceptanceFacts(
  decided: { accepted: number; rejected: number } | null,
  axes: { availability: number | null; rate: number | null; sector: number | null },
  accountKnown: boolean,
): { fact: NeedAcceptanceFact; count: number | null }[] {
  const facts: { fact: NeedAcceptanceFact; count: number | null }[] = []
  if (accountKnown) {
    if (decided && decided.accepted > 0) facts.push({ fact: 'accepted_here', count: decided.accepted })
    if (decided && decided.rejected > 0) facts.push({ fact: 'rejected_here', count: decided.rejected })
    if (!decided || decided.accepted + decided.rejected === 0) {
      facts.push({ fact: 'never_presented_here', count: null })
    }
  }
  if (axes.rate !== null) {
    facts.push({ fact: axes.rate >= 100 ? 'rate_within_target' : 'rate_above_target', count: null })
  }
  if (axes.availability !== null) {
    facts.push({ fact: axes.availability >= 100 ? 'available_by_start' : 'available_later', count: null })
  }
  if (axes.sector !== null) {
    facts.push({ fact: axes.sector >= 100 ? 'sector_practised' : 'sector_missing', count: null })
  }
  return facts
}
