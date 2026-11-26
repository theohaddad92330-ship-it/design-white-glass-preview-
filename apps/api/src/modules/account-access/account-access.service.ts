import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, In, Not, Repository } from 'typeorm'
import {
  estimateAccessCost,
  type AccessCostEstimate,
  ACCESS_QUESTION_ANSWERS,
  ACCESS_QUESTION_MOMENTS,
  accessBarrierSchema,
  addressabilitySchema,
  withoutStaleHeadcount,
  accessLevelFact,
  accountAccessLevel,
  type AccessBarrier,
  type AccessBarrierClass,
  type AccessLevelFact,
  type AccountAccessLevel,
  type Addressability,
  rankAccessEntities,
  ACCESS_ENTITY_AXES,
  type AccessEntityAxis,
  type AccessEntityReasonFact,
  shouldAvoidGroupEntry,
  accessFreshness,
  aggregateAccessFacts,
  bestAccessFact,
  lockFromAnswer,
  rankAccessModes,
  type AccessFact,
  type AccessFactKind,
  type AccessStatusDeclaration,
  declaredAccessStatus,
  type AccessLockState,
  type AccessMode,
  type AccessModeFeasibility,
  type AccessAnswerValue,
  type AccessQuestionMoment,
  type CommunityAggregate,
  type CreateAccessFact,
  type Rank1Incumbent,
  LINK_KIND_TO_VOIE,
  partnerAccessContradictions,
  partnerRegistrySourceKind,
  personalAccessCertainty,
  personalAccessFreshness,
  personalAccessRisk,
  readRelationshipState,
  type LinkKind,
  type RelationalWarmth,
  type PartnerAccessContradiction,
  type PersonalAccessPath,
  type PersonalAccessSourceKind,
  type PersonalAccessVoie,
  type DataforgeAccountAccess,
} from '@bellum/contracts'
import { AccessFactEntity } from '../../database/entities/access-fact.entity'
import { AccountEntityRow } from '../../database/entities/account-entity.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { ConsultantExperienceEntity } from '../../database/entities/consultant-experience.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { TestimonialEntity } from '../../database/entities/testimonial.entity'
import { ANSWER_DETAIL } from './purchasing-panel'
import { readDataforgeAccess } from './dataforge-access.reader'
import {
  readAccumulatedRouteCriteria,
  declaredRouteCriteriaOf,
  talentAtAccount,
  routeFactsOf,
  routeSignalsOf,
  type AccumulatedRouteCriteria,
  type DeclaredRouteCriteria,
  type RouteSignals,
} from './route-signals'

/** Ce que l'onglet Accès affiche pour un compte. */
export type AccessLandscape = {
  /** L'état retenu, et le fait qui le porte. `inconnu` quand rien ne le dit. */
  lock: { state: AccessLockState; fact: (AccessFact & { freshness: string }) | null }
  /**
   * #4802 — l'état d'accès POSÉ À LA MAIN (référencé / à bâtir / inconnu) : il réordonne les
   * interlocuteurs (#4271), jamais ne les filtre (c76). `null` tant que personne ne l'a posé : l'écran
   * dit « Accès inconnu », une absence nommée. Lu SANS péremption — une correction humaine gagne toujours.
   */
  accessStatus: AccessStatusDeclaration | null
  modes: { mode: AccessMode; feasibility: AccessModeFeasibility }[]
  /** Le coût d'accès DÉCLARÉ. Jamais moyenné (D60). */
  cost: (AccessFact & { freshness: string }) | null
  /**
   * #4016.L4 — sans coût déclaré ICI : la déclaration la plus récente de l'ESPACE sur un autre de ses
   * comptes au même verrou, badgée « estimé » à l'écran (`estimateAccessCost`). Jamais lue hors de
   * l'espace (art. 101 TFUE), jamais une moyenne. `null` = aucune base.
   */
  costEstimate: AccessCostEstimate | null
  /** Tous les faits, les périmés compris — ils ne disparaissent pas, ils se
   *  signalent. */
  facts: (AccessFact & { freshness: string })[]
  /**
   * #3403 — LES VOIES D'ACCÈS PERSONNELLES : « par qui » on entre, jamais
   * « par quelle structure » (les `modes` ci-dessous répondent à cette
   * seconde question). Huit voies réelles agrégées depuis quatre tables déjà
   * existantes — voir le docblock de `PERSONAL_ACCESS_VOIES`
   * (`@bellum/contracts`) pour le détail de chaque dérivation.
   *
   * Une voie sans instance n'apparaît PAS ici (doctrine « on n'affiche pas ce
   * qu'on n'a pas ») : ce tableau ne porte que des chemins réels, jamais les
   * onze catégories à vide.
   */
  personalPaths: PersonalAccessPath[]
  /**
   * Les entités DÉCLARÉES du compte, et par quoi commencer.
   *
   * Le tome 1 §7.1 : « sur un compte dont la proportion est mauvaise, l'écran
   * propose les entités les plus accessibles au lieu du siège ». Le conseil que
   * Théo donne de vive voix — « j'irais attaquer chacune des filiales plutôt
   * que le siège » — existait dans les prompts et dans le jeu de démonstration,
   * jamais comme une recommandation à l'écran.
   *
   * Lues dans la TABLE `account_entities`, qui n'avait aucun consommateur web
   * depuis sa création : l'API la servait, l'onglet Sites lisait le blob
   * d'analyse à côté.
   */
  entities: {
    id: string
    name: string
    kind: string
    rank1_incumbent: string
    /** Le rang d'entrée et la RAISON qui le donne (tome 3, `BEL-ADR-003`). */
    score: number
    reason: string
    /** Les mêmes faits, structurés : l'écran les dit dans la langue de l'utilisateur (#3473). */
    reason_facts: AccessEntityReasonFact[]
    /** #4016 L9 — les axes du barème sans fait connu, NOMMÉS sous le score (jamais un « 0 »). */
    missing_axes: AccessEntityAxis[]
  }[]
  /**
   * Le groupe est-il à éviter comme porte d'entrée ?
   *
   * Vrai dès la classe C de la barrière d'achat : « ne pas attaquer le siège ».
   * C'est la règle qui empêche de proposer Nanterre à une ESN de quatre
   * personnes. Faux quand la barrière n'est pas estimable — écarter le groupe
   * faute d'information reviendrait à conclure d'un silence.
   */
  avoidGroupEntry: boolean
  /**
   * #3473 — combien d'entités l'ANALYSE a cartographiées (filiales, entités
   * exhaustives), déclarées ou non. Sert à NOMMER l'absence quand `entities`
   * est vide : le bloc « Par quelle entité entrer » disait rien en prod
   * (La Poste) alors que l'analyse en connaissait. Jamais classées ici : sans
   * déclaration, aucun rang inventé.
   */
  analysisEntityCount: number
  /**
   * Lot 776 (Louis 02/11) — « Accès au compte · Base commune » : accessibilité, barrières, route d'achat, priorité, en
   * énumérations métier. `null` = pas de bloc (jamais « 0 »). Aucun identifiant de personne n'y entre.
   */
  dataforgeAccess: DataforgeAccountAccess | null
  /**
   * Un avertissement HORS barème (tome 3 §28) — aujourd'hui la procédure
   * collective publiée au BODACC.
   *
   * Il ne touche pas au score : une entreprise en redressement est souvent
   * très joignable, et c'est le piège. `date` peut être `null` quand l'annonce
   * n'en portait pas — taire un risque faute de date serait pire.
   */
  warning: { kind: string; date: string | null; label: string; url: string | null } | null
  /**
   * La barrière d'ACHAT estimée, DÉCOMPOSÉE (tome 3 §4 et §5.1).
   *
   * Elle est calculée à chaque analyse par `access_scoring.py`, écrite dans
   * `raw_analysis.access_barrier` et semée en démonstration. Ce service la
   * lisait pour en tirer **deux booléens** — `avoidGroupEntry` et `warning` —
   * pendant que le score, la classe, les six proxies et la liste de ce qui
   * manque pour estimer n'avaient aucun chemin vers un écran. On payait le
   * calcul à chaque analyse sans jamais le montrer.
   *
   * Servie telle quelle, sans résumé : un score sans ses axes est exactement
   * la forme que la doctrine refuse, et c'est le seul endroit du produit qui
   * peut dire POURQUOI la porte est dure.
   *
   * `null` a deux causes, et elles se ressemblent à l'écran sans être la même
   * chose — l'écran le dit :
   *  - le compte n'a pas de barrière (analysé avant que ce calcul existe, ou
   *    jamais analysé) ;
   *  - la structure stockée ne se lit pas contre le contrat.
   * Dans les deux cas, servir `{}` ferait afficher « 0/10 », c'est-à-dire
   * « ouvert probable » — la lecture inverse de « je n'ai pas regardé ».
   *
   * ⚠️ L'AVERTISSEMENT est retiré ici : il est déjà servi à côté, hors barème.
   * L'inclure dans la barrière le rangerait dans un score dont le tome 3 le
   * sort délibérément (une entreprise en redressement est très joignable), et
   * l'écran l'afficherait deux fois.
   */
  barrier: Omit<AccessBarrier, 'warning'> | null
  /**
   * L'ADRESSABILITÉ — les cinq axes (verrou · proportion · chemin · relation ·
   * coût d'accès, tome 1 §6) : « peux-tu ENTRER », face à « pourquoi c'est
   * intéressant ». Structurellement voisine de la barrière ci-dessus mais
   * jamais confondue avec elle (§6.4 : « intérêt 68/80 · adressabilité 4/20 »
   * dit un compte parfait et hors de portée — un score unique ne le dirait
   * pas).
   *
   * ⚠️ CORRIGÉ #1606/#1631 — CE COMMENTAIRE AFFIRMAIT « aucun producteur
   * n'écrit ce champ » ; c'est FAUX depuis la PR #1689 (06/09/2026, #1580/#1579).
   * `phase1_research.py:1518` pose désormais `result["addressability"] =
   * addressability_for_company(...)` à CHAQUE analyse, exactement comme il pose
   * `raw_analysis.access_barrier` juste au-dessus — la valeur REJOINT le
   * portefeuille au lieu de rester cantonnée à une recherche Découvrir. Le
   * calcul lui-même reste côté IA (GA-26 : « une dérivation vit à un seul
   * endroit ») ; ce service se contente de LIRE `raw_analysis.addressability`,
   * jamais de le recalculer. Un compte analysé AVANT cette PR porte encore
   * `null` — l'onglet le dit honnêtement plutôt que d'inventer un score —
   * jusqu'à sa prochaine analyse.
   */
  addressability: Addressability | null
  /**
   * #2298.4 (réfuté en production le 19/09/2026) — la date du dernier calcul
   * de l'adressabilité, donc de l'axe RELATION. `signals_collected_at` est
   * stampée par `AccountsService.applyResearch` dans la MÊME écriture que
   * `raw_analysis.addressability` (Phase 1) : c'est la date exacte du calcul,
   * jamais une approximation. `null` = ce compte n'a jamais été analysé.
   *
   * L'écran la compare à `SEGMENT_CAPABILITY_EPOCH.access_relation`
   * (`isSegmentCollectionStale`, `@bellum/contracts`) pour dire honnêtement
   * qu'un calcul est antérieur à la capacité #2298.4 (missions/agenda/
   * e-mails/correction) — sans elle, deux comptes du même espace peuvent se
   * contredire sur l'état d'un connecteur selon la date de leur dernière
   * analyse (ACTIA/LVMH, mesuré en production le 19/09).
   */
  addressabilityCollectedAt: string | null
  /** #3504 — l'effectif lu par la barrière est périmé ou contredit l'en-tête : il est sorti du calcul. */
  headcountToRecheck: boolean
  /**
   * Ce que les AUTRES espaces disent du verrouillage de ce compte (tome 2 §25).
   *
   * `null` quand la question ne se pose pas : compte sans SIREN — donc sans
   * identité qui traverse un espace — ou aucune déclaration nulle part.
   */
  community: CommunityAggregate | null
  /**
   * La question à poser MAINTENANT, ou `null`. Une seule à la fois, une seule
   * fois par compte et par espace, et jamais reposée si elle est ignorée.
   */
  question: { moment: AccessQuestionMoment; answers: readonly AccessAnswerValue[] } | null
  /**
   * #2646.1 (décision Louis 20/09/2026) — L'ACCÈS NOMMÉ : `direct` / `rang2` /
   * `rang3_plus` / `inconnu`. Un ÉTAT, jamais une probabilité (doctrine refusée
   * six fois). Dérivé par la fonction pure `accountAccessLevel`
   * (`@bellum/contracts`, GA-26) depuis deux faits déjà connus : un rang 1 est-il
   * en place sur une entité de ce compte (`account_entities.rank1_incumbent`),
   * et l'espace a-t-il déclaré un partenaire sur ce compte (`account_partners`,
   * `relationship = 'partner'`, non écarté). Voir le docblock de la fonction
   * pour la règle exacte de `rang3_plus`.
   */
  accessLevel: AccountAccessLevel
  /**
   * #2646.1 (badge sans preuve, corrigé le 21/09/2026) — LE FAIT qui fonde
   * `accessLevel` : les entités déclarées (rang 1 en place ou non) et, pour
   * `rang2`, le partenaire déclaré. `null` UNIQUEMENT pour `inconnu` — aucun
   * fait n'est établi, en inventer un violerait « on n'affiche pas ce qu'on
   * n'a pas ». Dérivé par `accessLevelFact` (`@bellum/contracts`, GA-26),
   * jamais recalculé côté écran.
   */
  accessLevelFact: AccessLevelFact | null
  /**
   * #2130.102 — la contradiction Partenaires / Accès, matrice minimale : la
   * même entité « concurrent » côté Partenaires ET verrouillée côté Accès.
   * Liste VIDE quand rien ne se contredit (aucune ligne, doctrine « on
   * n'affiche pas ce qu'on n'a pas »).
   */
  contradictions: PartnerAccessContradiction[]
}

/**
 * L'accès à un compte : ce qui le verrouille, par où on entre, ce que ça coûte.
 *
 * Module autonome (règle #7) : le retirer ne casse rien d'autre. Il ne va
 * chercher aucun service d'un autre module — l'arbitrage entre faits est une
 * fonction PURE de `@bellum/contracts`, et le reste est de la lecture de table.
 */
@Injectable()
export class AccountAccessService {
  private readonly logger = new Logger(AccountAccessService.name)

  constructor(
    @InjectRepository(AccessFactEntity)
    private readonly facts: Repository<AccessFactEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(AccountEntityRow)
    private readonly entities: Repository<AccountEntityRow>,
    // #3278.1 (lot M11) — le vivier, pour la route « depuis un talent ».
    // Optionnel : les specs à constructeur nu restent byte-identiques.
    @Optional()
    @InjectRepository(ConsultantExperienceEntity)
    private readonly experiences?: Repository<ConsultantExperienceEntity>,
  ) {}

  /**
   * #3278.1 / #3278.2 (lot M11 09/10) — ce que la route commerciale de CE
   * compte de CET espace lit côté API :
   *
   * - `signals` — routes « veille seule » et « depuis un talent »
   *   ({@link routeSignalsOf}). Le talent : une expérience du vivier ACTIF
   *   (consultant non archivé) au nom exact du compte (raison sociale ou nom
   *   commercial), client non masqué. Jamais le nom du talent : Laura nomme la
   *   route, pas la personne.
   * - `declaredCriteria` — les six critères sans source structurée, DÉCLARÉS
   *   sur la fiche ({@link declaredRouteCriteriaOf}).
   */
  async routeInputs(
    workspaceId: string,
    accountId: string,
  ): Promise<{
    signals: RouteSignals
    declaredCriteria: DeclaredRouteCriteria
    facts: { event?: string; inbound?: string }
    accumulated: AccumulatedRouteCriteria
  }> {
    const account = await this.accounts.findOne({
      where: { id: accountId, workspace_id: workspaceId },
      select: {
        id: true,
        sprint: true,
        sector: true,
        company_name: true,
        trade_name: true,
        declared_route_scope: true,
        declared_route_objectives: true,
        declared_route_available_roles: true,
        declared_route_partners: true,
        declared_route_history: true,
        declared_route_timing: true,
        declared_route_budget: true,
        declared_route_availability: true,
        declared_route_network: true,
        declared_route_event: true,
        declared_route_inbound: true,
      },
    })
    if (!account) return { signals: {}, declaredCriteria: {}, facts: {}, accumulated: {} }
    const talent = this.experiences
      ? await talentAtAccount(
          (sql, params) => this.experiences!.manager.query<Array<{ name: string | null }>>(sql, params),
          workspaceId,
          account,
        )
      : false
    return {
      signals: routeSignalsOf(account, talent),
      declaredCriteria: declaredRouteCriteriaOf(account),
      facts: routeFactsOf(account),
      accumulated: await this.accumulatedCriteria(workspaceId, account),
    }
  }

  /**
   * #3278.3 (#3259.3) — preuves et historique des canaux, lus dans CET espace seulement. Une lecture qui
   * échoue ne fabrique rien (`{}` : le critère reste « non évalué »). Jamais le corps d'un message (D65) :
   * seul `channel` est lu.
   */
  private async accumulatedCriteria(
    workspaceId: string,
    account: { id: string; sector?: string | null },
  ): Promise<AccumulatedRouteCriteria> {
    // #3278.a — le lecteur est partagé avec le plan asynchrone (`route-signals.ts`).
    const manager = this.accounts.manager as EntityManager | undefined
    return (
      (await readAccumulatedRouteCriteria(manager, workspaceId, account, message =>
        this.logger.warn(`accumulatedCriteria: ${message}`),
      )) ?? {}
    )
  }

  /**
   * #3247 (décision Louis 15/10/2026, QCM) — l'accès à un compte que l'espace NE POSSÈDE PAS.
   *
   * `landscape` exige un compte possédé (ses faits, ses contacts, ses entités). Pour un candidat jamais
   * ajouté au portefeuille, il n'y a rien de tel — mais le verrou communautaire se lit par SIREN
   * (`communityLock` : agrégat anonyme, trois espaces distincts, partage réciproque, GA-43). Un SIREN
   * POSSÉDÉ est marqué `owned: true` sans verrou servi (son onglet Accès fait foi) ; un SIREN sans aucun
   * fait est ABSENT (« on ne sait pas » n'est pas « fermé »). Le périmètre est TOUJOURS l'espace
   * demandeur ; aucune écriture ; au plus 20 SIREN de 9 chiffres.
   */
  async communityAccessBySiren(
    workspaceId: string,
    sirens: readonly string[],
  ): Promise<Record<string, { owned: boolean; community: CommunityAggregate | null }>> {
    const clean = [...new Set(sirens.filter(siren => /^\d{9}$/.test(siren)))].slice(0, 20)
    if (clean.length === 0) return {}
    const owned = new Set(
      (
        await this.accounts.find({
          where: { workspace_id: workspaceId, siren: In(clean) },
          select: { id: true, siren: true },
        })
      ).map(account => account.siren),
    )
    const out: Record<string, { owned: boolean; community: CommunityAggregate | null }> = {}
    for (const siren of clean) {
      if (owned.has(siren)) {
        out[siren] = { owned: true, community: null }
        continue
      }
      const community = await this.communityLock(workspaceId, siren)
      if (community) out[siren] = { owned: false, community }
    }
    return out
  }

  async landscape(workspaceId: string, accountId: string, now = new Date()): Promise<AccessLandscape> {
    const account = await this.accounts.findOne({
      where: { id: accountId, workspace_id: workspaceId },
      // #2298.4 — `signals_collected_at` date le dernier calcul de
      // `raw_analysis.addressability` (voir le docblock du champ
      // `addressabilityCollectedAt` ci-dessus).
      select: {
        id: true,
        raw_analysis: true,
        siren: true,
        group_head_siren: true,
        priority_gate: true,
        signals_collected_at: true,
        employees: true,
      },
    })
    if (!account) throw new NotFoundException('Compte introuvable dans cet espace.')

    const rows = await this.facts.find({
      where: { workspace_id: workspaceId, account_id: accountId },
      order: { created_at: 'DESC' },
    })
    const facts = rows.map(row => this.toWire(row, now))

    const lockFact = bestAccessFact(facts.filter(fact => fact.kind === 'lock'))
    const costFact = bestAccessFact(facts.filter(fact => fact.kind === 'cost'))

    // Un fait PÉRIMÉ ne fait plus autorité sur l'état : il reste affiché avec sa
    // date, mais l'état retombe à `inconnu`. C'est la règle du §10.3 — « une
    // donnée périmée redevient inconnue » — et c'est la seule façon de ne pas
    // mentir six mois plus tard.
    const lockState: AccessLockState =
      lockFact && lockFact.freshness === 'fresh' ? (lockFact.value as AccessLockState) : 'inconnu'

    // Les entités déclarées, DEPUIS LA TABLE. L'entité d'accueil par défaut
    // (« Périmètre non déterminé ») est écartée : elle n'est pas une porte, elle
    // est l'endroit où atterrissent les contacts dont on ignore la division.
    const entityRows = await this.entities.find({
      where: { workspace_id: workspaceId, account_id: accountId },
      order: { name: 'ASC' },
    })
    const raw = (account.raw_analysis ?? {}) as Record<string, unknown>
    const visible = entityRows.filter(row => !row.is_default)
    // Combien de contacts sont rattachés à chaque entité : c'est le fait qui
    // décide de l'ordre, parce que la porte la plus courte est celle où l'on
    // connaît déjà quelqu'un.
    const entityIds = visible.map(row => row.id)
    const contactCounts = await this.contactsPerEntity(workspaceId, accountId, entityIds)
    // ⚠️ Les sites étaient passés à ZÉRO EN DUR depuis le 22/08 : l'axe existait,
    // il était testé, et il n'a jamais rien pesé. Une implantation retenue est
    // pourtant le fait le plus concret d'un périmètre — c'est là qu'on peut
    // aller.
    const siteCounts = await this.sitesPerEntity(workspaceId, accountId, entityIds)
    const ranking = new Map(
      rankAccessEntities(
        visible.map(row => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          rank1Incumbent: row.rank1_incumbent ?? null,
          contactCount: contactCounts.get(row.id) ?? 0,
          siteCount: siteCounts.get(row.id) ?? 0,
        })),
      ).map(ranked => [ranked.id, ranked]),
    )
    const entities = visible
      .map(row => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        rank1_incumbent: row.rank1_incumbent ?? 'unknown',
        score: ranking.get(row.id)?.score ?? 0,
        reason: ranking.get(row.id)?.reason ?? 'aucun fait connu sur ce périmètre',
        reason_facts: ranking.get(row.id)?.reasonFacts ?? [],
        missing_axes: ranking.get(row.id)?.missingAxes ?? [...ACCESS_ENTITY_AXES],
      }))
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))

    const analysisEntities = raw.entities_exhaustive ?? raw.entitiesExhaustive ?? raw.subsidiaries
    const presence = raw.esn_presence ?? raw.esnPresence

    // #2646.1 — L'ACCÈS NOMMÉ. `rank1Incumbent` agrège les entités DÉCLARÉES
    // (jamais l'entité par défaut, déjà écartée de `visible`) : `yes` dès
    // qu'UNE entité porte un rang 1 en place — c'est ce rang 1 qui verrouille
    // le compte, peu importe qu'une autre entité soit ouverte —, `unknown`
    // quand aucune n'est `yes` mais qu'au moins une reste à évaluer, `no`
    // seulement si TOUTES l'affirment et qu'il y a au moins une entité pour
    // l'affirmer. Zéro entité déclarée ⇒ `unknown` : l'absence de périmètre
    // documenté n'est pas une preuve d'ouverture (GA-18/GA-19).
    const rank1Incumbent: Rank1Incumbent = visible.some(row => row.rank1_incumbent === 'yes')
      ? 'yes'
      : visible.length > 0 && visible.every(row => row.rank1_incumbent === 'no')
        ? 'no'
        : 'unknown'
    const declaredPartnerName = await this.declaredPartnerName(workspaceId, accountId)
    const accessLevel = accountAccessLevel({
      rank1Incumbent,
      hasDeclaredPartner: declaredPartnerName !== null,
    })
    // #2646.1 (badge sans preuve, corrigé le 21/09/2026) — LE FAIT qui fonde
    // `accessLevel` : mêmes entités et même partenaire que ci-dessus, jamais
    // recalculés (GA-26). Voir le docblock du champ sur `AccessLandscape`.
    const accessLevelFactValue = accessLevelFact({
      rank1Incumbent,
      entities: visible.map(row => ({
        name: row.name,
        rank1Incumbent: (row.rank1_incumbent ?? 'unknown') as Rank1Incumbent,
      })),
      partnerName: declaredPartnerName,
    })

    const community = await this.communityLock(workspaceId, account.siren ?? null)
    const question = await this.pendingQuestion(workspaceId, accountId, {
      parked: (account.priority_gate ?? '') === 'parked',
      lockKnown: lockState !== 'inconnu',
    })

    const barrier = (raw.access_barrier ?? raw.accessBarrier ?? {}) as Record<string, unknown>
    const barrierClass = String(barrier.access_class ?? '')
    // La structure ENTIÈRE, validée contre le contrat. `safeParse` plutôt que
    // `parse` : une barrière illisible ne doit pas faire tomber l'onglet Accès
    // entier — le verrou, les portes et le coût déclaré restent vrais.
    const parsedBarrier = accessBarrierSchema.safeParse(barrier)
    // `warning` sort de la barrière : il est servi à côté, hors barème.
    const barrierView = parsedBarrier.success
      ? {
          score: parsedBarrier.data.score,
          accessibility: parsedBarrier.data.accessibility,
          access_class: parsedBarrier.data.access_class,
          label: parsedBarrier.data.label,
          proxies: parsedBarrier.data.proxies,
          measurable: parsedBarrier.data.measurable,
          missing: parsedBarrier.data.missing,
          corrections: parsedBarrier.data.corrections,
        }
      : null
    const rawWarning = barrier.warning as Record<string, unknown> | null | undefined
    const warning =
      rawWarning && typeof rawWarning === 'object' && rawWarning.kind
        ? {
            kind: String(rawWarning.kind),
            date: rawWarning.date ? String(rawWarning.date) : null,
            label: String(rawWarning.label ?? ''),
            // #3916.1 — le lien vers l'annonce BODACC, quand la ligne le porte.
            // `null` plutôt qu'un lien deviné : une ligne plus ancienne, mise
            // en cache avant ce lot, n'en porte pas.
            url: rawWarning.url ? String(rawWarning.url) : null,
          }
        : null

    // Même traitement que la barrière juste au-dessus : `safeParse`, jamais
    // `parse` — une structure absente ou illisible ne fait pas tomber l'onglet
    // Accès entier. Voir le commentaire du type `AccessLandscape.addressability`
    // pour ce qui manque encore côté producteur.
    const parsedAddressability = addressabilitySchema.safeParse(raw.addressability ?? {})
    const addressability = parsedAddressability.success ? parsedAddressability.data : null

    // #3504 — un effectif à REVÉRIFIER ne pèse pas : ni dans la somme de la barrière, ni dans
    // l'axe proportion (voir `withoutStaleHeadcount`). L'en-tête porte la valeur courante.
    const neutralized = withoutStaleHeadcount({
      barrier: barrierView,
      addressability,
      employees: account.employees,
      signalsCollectedAt: account.signals_collected_at,
    })

    const personalPaths = await this.personalAccessPaths(workspaceId, accountId, raw, now)

    const dataforgeAccess = await readDataforgeAccess((sql, params) => this.accounts.manager.query(sql, params), {
      siren: account.siren ?? null,
      groupHeadSiren: account.group_head_siren ?? null,
      rawAnalysis: account.raw_analysis,
    })

    return {
      dataforgeAccess,
      lock: { state: lockState, fact: lockFact ?? null },
      accessStatus: declaredAccessStatus(facts),
      community,
      question,
      entities,
      accessLevel,
      accessLevelFact: accessLevelFactValue,
      avoidGroupEntry: shouldAvoidGroupEntry(barrierClass || null),
      analysisEntityCount: Array.isArray(analysisEntities) ? analysisEntities.length : 0,
      warning,
      barrier: neutralized.barrier,
      addressability: neutralized.addressability,
      headcountToRecheck: neutralized.recheck,
      // #2298.4 — voir le docblock du champ sur `AccessLandscape`.
      addressabilityCollectedAt: account.signals_collected_at ? account.signals_collected_at.toISOString() : null,
      modes: rankAccessModes({
        lock: lockState,
        // Une entité DÉCLARÉE fait foi ; à défaut, celles que l'analyse a
        // cartographiées suffisent à dire qu'une porte de filiale existe.
        hasEntities: entities.length > 0 || (Array.isArray(analysisEntities) && analysisEntities.length > 0),
        hasIncumbent: Array.isArray(presence) && presence.length > 0,
        // La couche zéro n'est pas lue ici : elle vit dans un autre module, et
        // aller la chercher ferait de ce service un importateur de service. Le
        // mode « introduction » reste donc `possible`, jamais `available` —
        // l'annoncer disponible sans l'avoir vérifié serait une promesse.
        hasRelation: false,
      }),
      cost: costFact ?? null,
      costEstimate: costFact ? null : await this.costEstimate(workspaceId, accountId, lockState, now),
      facts,
      personalPaths,
      contradictions: partnerAccessContradictions(await this.competitorPartners(workspaceId, accountId), facts),
    }
  }

  /**
   * #4016.L4 — les coûts et verrous DÉCLARÉS par CET espace sur ses autres comptes, pour estimer le coût
   * d'accès d'un compte qui n'en a aucun. Bornée à `workspace_id` : un coût d'un autre espace est un
   * échange d'informations tarifaires entre concurrents (art. 101 TFUE), jamais lu ici.
   */
  private async costEstimate(
    workspaceId: string,
    accountId: string,
    lock: AccessLockState,
    now: Date,
  ): Promise<AccessCostEstimate | null> {
    if (lock === 'inconnu') return null
    const rows = await this.facts.find({
      where: { workspace_id: workspaceId, account_id: Not(accountId), kind: In(['cost', 'lock']) },
      order: { created_at: 'DESC' },
      take: 500,
    })
    const byAccount = new Map<string, (AccessFact & { freshness: string })[]>()
    for (const row of rows) {
      if (row.account_id === accountId) continue
      const wire = this.toWire(row, now)
      byAccount.set(row.account_id, [...(byAccount.get(row.account_id) ?? []), wire])
    }
    const ids = [...byAccount.keys()]
    if (ids.length === 0) return null
    const names = await this.accounts.find({
      where: { id: In(ids), workspace_id: workspaceId },
      select: { id: true, company_name: true },
    })
    const candidates = names.flatMap(account => {
      const facts = byAccount.get(account.id) ?? []
      const cost = bestAccessFact(facts.filter(fact => fact.kind === 'cost'))
      const lockFact = bestAccessFact(facts.filter(fact => fact.kind === 'lock'))
      if (!cost || !account.company_name) return []
      return [
        {
          accountId: account.id,
          companyName: account.company_name,
          cost: cost.value,
          costObservedAt: cost.observed_at,
          lock: lockFact && lockFact.freshness === 'fresh' ? (lockFact.value as AccessLockState) : ('inconnu' as const),
        },
      ]
    })
    return estimateAccessCost({ lock, candidates, now })
  }

  /**
   * #2130.102 — les partenaires « concurrent » rattachés à une ENTITÉ, lus pour
   * la matrice minimale `partnerAccessContradictions` (`@bellum/contracts`).
   * Écartés (`dismissed_at`) exclus ; sans `entity_id`, aucune clé : exclus.
   */
  private async competitorPartners(
    workspaceId: string,
    accountId: string,
  ): Promise<{ id: string; name: string; entity_id: string | null; relationship: string }[]> {
    const rows = (await this.facts.query(
      `SELECT id, name, entity_id, relationship FROM account_partners
        WHERE workspace_id = $1 AND account_id = $2 AND relationship = 'competitor'
          AND entity_id IS NOT NULL AND dismissed_at IS NULL`,
      [workspaceId, accountId],
    )) as { id: string; name: string; entity_id: string | null; relationship?: string }[]
    return rows
      .filter(row => row.relationship === 'competitor')
      .map(row => ({ id: row.id, name: row.name, entity_id: row.entity_id, relationship: 'competitor' }))
  }

  /**
   * #3403 — AGRÈGE LES VOIES D'ACCÈS PERSONNELLES DEPUIS QUATRE SOURCES RÉELLES.
   *
   * Aucune n'est recalculée (GA-26) : chacune est déjà écrite ailleurs pour sa
   * propre raison (l'autorisation d'introduction, l'écosystème de partenaires,
   * l'état de relation CRM, la routine de détection de changement de poste) —
   * ce service se contente de les LIRE et de les classer dans le vocabulaire
   * fermé de `PERSONAL_ACCESS_VOIES`.
   */
  private async personalAccessPaths(
    workspaceId: string,
    accountId: string,
    raw: Record<string, unknown>,
    now: Date,
  ): Promise<PersonalAccessPath[]> {
    const paths: PersonalAccessPath[] = []

    // 1) Les liens personnels déclarés (#3403.7) — un humain a classé le
    // contact via `ContactWarmIntroCard`, et l'autorisation a été ACCORDÉE :
    // un refus n'est jamais une voie ouverte.
    const linkRows = (await this.facts.query(
      `SELECT ia.id, ia.link_kind, ia.verified, ia.warmth, ia.authorized_at, ia.referrer_label, ia.channel,
              c.full_name AS contact_name, c.decision_role
         FROM introduction_authorizations ia
         JOIN contacts c ON c.id = ia.target_contact_id
        WHERE ia.workspace_id = $1 AND c.account_id = $2 AND ia.granted = true AND ia.link_kind IS NOT NULL`,
      [workspaceId, accountId],
    )) as {
      id: string
      link_kind: string
      verified: boolean
      warmth: RelationalWarmth | null
      authorized_at: Date
      referrer_label: string | null
      channel: string
      contact_name: string
      decision_role?: string | null
    }[]

    for (const row of linkRows) {
      const voie = LINK_KIND_TO_VOIE[row.link_kind as LinkKind]
      // Un type hors des onze voies nommées (ex. `plain_homonymy`,
      // `linkedin_interaction`) ne force pas une case : il ne produit rien ici.
      if (!voie) continue
      const observedAt = row.authorized_at.toISOString()
      const freshness = personalAccessFreshness(observedAt, now)
      const certainty = personalAccessCertainty({
        sourceKind: 'workspace_declared_link' satisfies PersonalAccessSourceKind,
        verified: row.verified,
        freshness,
        // #3403 (X68) — « distant » DÉCLARÉ sur un lien non vérifié = simple affinité.
        warmth: row.warmth,
      })
      paths.push({
        id: `link-${row.id}`,
        voie,
        subject: row.contact_name,
        proof: row.referrer_label,
        observedAt,
        freshness,
        certainty,
        risk: personalAccessRisk({ certainty, freshness }),
        sourceKind: 'workspace_declared_link',
        warmth: row.warmth ?? null,
        decisionRole: row.decision_role ?? null, // #3777
      })
    }

    // 2) Les partenaires déjà en place (#3403.5/.6) — `account_partners`,
    // écarté (`dismissed_at`) exclu comme partout ailleurs sur ce compte.
    const partnerRows = (await this.facts.query(
      `SELECT id, name, rank, source, placements, scope, detected_at
         FROM account_partners
        WHERE workspace_id = $1 AND account_id = $2 AND dismissed_at IS NULL AND rank IN ('rank1', 'rank2')`,
      [workspaceId, accountId],
    )) as {
      id: string
      name: string
      rank: string
      source: string
      placements: number
      scope: string | null
      detected_at: Date | null
    }[]

    for (const row of partnerRows) {
      const voie: PersonalAccessVoie = row.rank === 'rank2' ? 'partenaire_rang2' : 'esn_referencee'
      // Des placements RÉELS sont la seule preuve qu'une relation existe
      // vraiment (docblock de `AccountPartnerEntity.placements`) : ils priment
      // sur la simple déclaration. #3667.R1 — règle partagée avec les ESN
      // citées par la stratégie 5P (`account-strategy-5p.ts`), à un seul
      // endroit (GA-26).
      const sourceKind = partnerRegistrySourceKind(row)
      const observedAt = row.detected_at ? row.detected_at.toISOString() : null
      const freshness = personalAccessFreshness(observedAt, now)
      const certainty = personalAccessCertainty({ sourceKind, verified: false, freshness })
      paths.push({
        id: `partner-${row.id}`,
        voie,
        subject: row.name,
        proof: row.scope,
        observedAt,
        freshness,
        certainty,
        risk: personalAccessRisk({ certainty, freshness }),
        sourceKind,
      })
    }

    // 3) Le compte est-il déjà CLIENT (#3403.4) ? L'état de relation CRM déjà
    // lu par `org-graph.service.ts` pour le chemin d'approche — jamais
    // recalculé ici (GA-26), une seconde fois, sur une donnée qui pourrait
    // diverger.
    if (readRelationshipState(raw) === 'client_actif') {
      const freshness = personalAccessFreshness(null, now)
      const certainty = personalAccessCertainty({ sourceKind: 'crm_relationship', verified: false, freshness })
      paths.push({
        id: `client-${accountId}`,
        voie: 'client_existant',
        subject: 'Relation client active (CRM)',
        proof: null,
        observedAt: null,
        freshness,
        certainty,
        risk: personalAccessRisk({ certainty, freshness }),
        sourceKind: 'crm_relationship',
      })
    }

    // 4) Une personne qu'on connaît a rejoint ce compte (#3403.8) — le signal
    // déjà écrit par `openDoorFromMove` (`crm-routines.service.ts`), jamais
    // recalculé ici : `source = 'relation antérieure'` est le marqueur posé à
    // l'écriture, qui distingue ce signal des autres opportunités du compte.
    const jobChangeRows = (await this.facts.query(
      `SELECT id, label, detail, first_detected_at
         FROM opportunities
        WHERE workspace_id = $1 AND account_id = $2 AND kind = 'signal'
          AND source = 'relation antérieure' AND access_mode = 'introduction_relation'`,
      [workspaceId, accountId],
    )) as { id: string; label: string; detail: string | null; first_detected_at: Date | null }[]

    // #4292.2 — la personne arrivée chez ce compte est souvent un contact du compte : son rôle de décision
    // voyage avec la ligne (même pastille « Décideur » que la liste Contacts). Rapprochement par nom contenu
    // dans le libellé/détail, jamais deviné : aucun contact nommé → pas de rôle.
    const accountContacts =
      jobChangeRows.length > 0
        ? ((await this.facts.query(
            `SELECT full_name, decision_role FROM contacts WHERE workspace_id = $1 AND account_id = $2 AND decision_role IS NOT NULL`,
            [workspaceId, accountId],
          )) as { full_name: string | null; decision_role: string | null }[])
        : []

    for (const row of jobChangeRows) {
      const haystack = `${row.label} ${row.detail ?? ''}`.toLowerCase()
      const named = accountContacts.filter(c => c.full_name && haystack.includes(c.full_name.trim().toLowerCase()))
      const observedAt = row.first_detected_at ? row.first_detected_at.toISOString() : null
      const freshness = personalAccessFreshness(observedAt, now)
      const certainty = personalAccessCertainty({ sourceKind: 'detected_signal', verified: false, freshness })
      paths.push({
        id: `job-change-${row.id}`,
        voie: 'personne_changement_poste',
        subject: row.label,
        proof: row.detail,
        observedAt,
        freshness,
        certainty,
        risk: personalAccessRisk({ certainty, freshness }),
        sourceKind: 'detected_signal',
        decisionRole: named.length === 1 ? (named[0]?.decision_role ?? null) : null, // #4292.2
      })
    }

    return paths
  }

  /**
   * LE RÉSUMÉ D'ACCESSIBILITÉ DU PORTEFEUILLE — une classe par compte, pour
   * TOUT le workspace (manque B du 30/08).
   *
   * `raw_analysis.access_barrier` existe déjà sur chaque compte analysé et
   * atteint déjà l'onglet Accès (`landscape()` ci-dessus, depuis le 29/08) —
   * mais rien ne le fait remonter à la LISTE des comptes : le tableau du
   * portefeuille (`/accounts`) ne montre ni colonne ni filtre d'accessibilité.
   *
   * L'endpoint de liste lui-même (`GET /accounts`, module `accounts`) est
   * hors périmètre de ce chantier — un autre agent y travaille en ce moment.
   * Cette méthode sert donc la MÊME donnée par un second chemin, entièrement
   * dans CE module : le web fusionne ce résumé avec la liste déjà chargée
   * (comme il fusionne déjà d'autres compléments, ex. `AccountRevenueCell`).
   *
   * ⚠️ Elle ne RECALCULE rien (GA-26) : la MÊME lecture que `landscape()` —
   * `accessBarrierSchema.safeParse` sur `access_barrier ?? accessBarrier` —
   * appliquée à chaque ligne plutôt qu'à un seul compte.
   */
  async accessSummary(workspaceId: string): Promise<{ accountId: string; accessClass: AccessBarrierClass | null }[]> {
    // N18 — cette route répondait 500 en PRODUCTION, sans une seule ligne de
    // log : l'échec était donc invisible à la fois côté écran (« – » sur
    // chaque compte, indiscernable de « pas de barrière calculée ») et côté
    // serveur (rien à lire dans les traces pour le diagnostiquer). Une lecture
    // qui échoue est journalisée AVANT d'être relayée — jamais ravalée en
    // tableau vide, qui reproduirait exactement le même piège un cran plus
    // bas (un succès à 200 avec zéro ligne est, à l'écran, la même chose
    // qu'un espace sans compte analysé).
    let rows: AccountEntity[]
    try {
      rows = await this.accounts.find({
        where: { workspace_id: workspaceId },
        select: { id: true, status: true, raw_analysis: true },
      })
    } catch (error) {
      this.logger.error('accessSummary: lecture des comptes en échec', { error, tags: { workspaceId } })
      throw error
    }
    // Un compte SUPPRIMÉ (suppression douce) n'a plus sa place au portefeuille
    // — même exclusion que `DiscoverPortfolioService`, qui protège le même cas.
    return rows
      .filter(row => row.status !== 'deleted')
      .map(row => {
        // Une ligne à la forme si inattendue qu'elle échappe aux replis déjà
        // en place (`??`, `safeParse` — qui ne jette jamais) ne doit pas faire
        // tomber TOUT le portefeuille : elle est journalisée, nommée « non
        // mesurée » (`null`), et les AUTRES comptes restent lisibles.
        try {
          const raw = (row.raw_analysis ?? {}) as Record<string, unknown>
          const barrier = (raw.access_barrier ?? raw.accessBarrier ?? {}) as Record<string, unknown>
          const parsed = accessBarrierSchema.safeParse(barrier)
          return { accountId: row.id, accessClass: parsed.success ? parsed.data.access_class : null }
        } catch (error) {
          this.logger.error('accessSummary: barrière illisible sur un compte', {
            error,
            tags: { workspaceId, accountId: row.id },
          })
          return { accountId: row.id, accessClass: null }
        }
      })
  }

  /**
   * Ce que les AUTRES espaces disent du verrouillage de ce compte.
   *
   * TROIS PROPRIÉTÉS, et chacune protège quelqu'un :
   *
   * - le rapprochement se fait sur le **SIREN**, jamais sur le nom : deux
   *   espaces qui écrivent « SNCF » et « SNCF Réseau » ne parlent pas du même
   *   compte, et une identité approximative ferait circuler l'information d'un
   *   client vers le mauvais dossier d'un autre ;
   * - seules les déclarations **humaines** entrent : une déduction du pipeline
   *   n'est pas un témoignage, et trois pipelines qui déduisent la même chose
   *   de la même source publique ne font pas trois espaces d'accord ;
   * - seuls les espaces qui **partagent** alimentent le pool. Un espace qui
   *   s'en exclut n'y verse rien et n'en consomme rien — c'est la réciprocité,
   *   et c'est ce qui rend le mécanisme acceptable.
   *
   * Le SEUIL, lui, n'est pas ici : il vit dans `@bellum/contracts`
   * (`COMMUNITY_THRESHOLD`), avec la fonction pure qui l'applique. Recopié dans
   * ce service, il divergerait le jour où quelqu'un le change — et un client
   * verrait la donnée d'un autre trop tôt, sans que rien ne tombe.
   *
   * ⚠️ QUATRIÈME PROPRIÉTÉ, ET ELLE N'EST PAS PRODUIT : le `kind = 'lock'`
   * ci-dessous n'est pas une restriction de périmètre qu'on élargira au fil de
   * l'eau. Étendre l'agrégation aux MODES d'accès est prévu et légitime ;
   * l'étendre au COÛT ne l'est pas. Les espaces de Bellum sont des ESN, donc
   * des concurrents, et agréger ce que chacune paie de commission pour entrer
   * chez un client est un échange d'informations tarifaires entre concurrents —
   * le tome 8 le marque « à vérifier AVANT de l'ouvrir » en D70 et au §54.
   *
   * `COMMUNITY_AGGREGABLE_KINDS` porte la liste, `COMMUNITY_FORBIDDEN_KINDS` la
   * raison, et GA-43 refuse toute requête inter-espaces qui nomme une nature
   * interdite. Ce n'est pas de la prudence : l'information, une fois circulée,
   * ne se reprend pas.
   */
  private async communityLock(workspaceId: string, siren: string | null): Promise<CommunityAggregate | null> {
    if (!siren) return null
    const contributes = await this.workspaceShares(workspaceId)
    const rows = (await this.facts.query(
      `SELECT a.workspace_id AS workspace_id, f.value AS value, f.observed_at AS observed_at
         FROM access_facts f
         JOIN accounts a ON a.id = f.account_id
         JOIN workspaces w ON w.id = a.workspace_id
        WHERE f.kind = 'lock'
          AND f.provenance = 'human'
          AND a.siren = $1
          AND (w.community_data_sharing = true OR a.workspace_id = $2)`,
      [siren, workspaceId],
    )) as Array<{ workspace_id: string; value: string; observed_at: Date | string | null }>

    if (rows.length === 0) return null
    return aggregateAccessFacts({
      facts: rows.map(row => ({
        workspaceId: row.workspace_id,
        value: row.value,
        observedAt: row.observed_at ? new Date(row.observed_at).toISOString() : null,
      })),
      askingWorkspaceId: workspaceId,
      contributes,
    })
  }

  /** Contacts rattachés, par entité. Une entité sans contact rend 0 — pas une
   *  absence de ligne, que l'appelant lirait comme « inconnu ». */
  private async contactsPerEntity(
    workspaceId: string,
    accountId: string,
    entityIds: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>(entityIds.map(id => [id, 0]))
    if (entityIds.length === 0) return counts
    const rows = (await this.facts.query(
      // #1473 — INNER, et c'est VOULU : on compte les contacts des entités d'UN
      // compte donné (`c.account_id = $2` juste en dessous). Un contact à
      // qualifier n'appartient à aucun compte, donc à aucune de ses entités.
      `SELECT c.entity_id AS entity_id, COUNT(*)::int AS n
         FROM contacts c
         JOIN accounts a ON a.id = c.account_id
        WHERE a.workspace_id = $1 AND c.account_id = $2 AND c.entity_id = ANY($3::uuid[])
          AND c.excluded_at IS NULL
        GROUP BY c.entity_id`,
      [workspaceId, accountId, entityIds],
    )) as Array<{ entity_id: string; n: number }>
    for (const row of rows) counts.set(row.entity_id, Number(row.n) || 0)
    return counts
  }

  /** Les implantations RETENUES par l'ESN, par entité. Jamais les
   *  établissements du registre : un grand compte en a mille, presque tous
   *  administratifs, et les compter ferait gagner l'entité la plus paperassière. */
  private async sitesPerEntity(
    workspaceId: string,
    accountId: string,
    entityIds: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>(entityIds.map(id => [id, 0]))
    if (entityIds.length === 0) return counts
    const rows = (await this.facts.query(
      `SELECT s.entity_id AS entity_id, COUNT(*)::int AS n
         FROM sites s
         JOIN accounts a ON a.id = s.account_id
        WHERE a.workspace_id = $1 AND s.account_id = $2 AND s.entity_id = ANY($3::uuid[])
        GROUP BY s.entity_id`,
      [workspaceId, accountId, entityIds],
    )) as Array<{ entity_id: string; n: number }>
    for (const row of rows) counts.set(row.entity_id, Number(row.n) || 0)
    return counts
  }

  /**
   * #2646.1 — un partenaire est-il DÉCLARÉ sur ce compte ? N'importe quel
   * rang : ce qui compte pour la porte `rang2`, c'est qu'une relation
   * `partner` existe déjà sur le compte, pas qu'elle tienne précisément le
   * rang 1. Une ligne ÉCARTÉE (« Ce n'est pas exact ») ne compte pas — même
   * exclusion que `PartnersService.landscape` (`dismissed_at IS NULL`).
   */
  /**
   * #2646.1 (badge sans preuve, corrigé le 21/09/2026) — le NOM du partenaire
   * déclaré, pas seulement son existence : c'est ce nom qui fonde
   * `accessLevelFact` pour `rang2`. `hasDeclaredPartner` (booléen consommé par
   * `accountAccessLevel`) se déduit maintenant de `!== null`, ici même — une
   * seule requête, une seule vérité (GA-26).
   */
  private async declaredPartnerName(workspaceId: string, accountId: string): Promise<string | null> {
    const rows = (await this.facts.query(
      `SELECT name FROM account_partners
        WHERE workspace_id = $1 AND account_id = $2 AND relationship = 'partner' AND dismissed_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1`,
      [workspaceId, accountId],
    )) as { name: string }[]
    return rows[0]?.name ?? null
  }

  private async workspaceShares(workspaceId: string): Promise<boolean> {
    const rows = (await this.facts.query(`SELECT community_data_sharing FROM workspaces WHERE id = $1`, [
      workspaceId,
    ])) as Array<{ community_data_sharing: boolean }>
    // Repli FERMÉ : une lecture ratée ne doit jamais ouvrir le partage. C'est
    // l'inverse du repli du cloisonnement de portefeuille, et pour la même
    // raison — on se trompe toujours du côté qui ne divulgue rien.
    return rows[0]?.community_data_sharing === true
  }

  /**
   * La question à poser maintenant, ou aucune.
   *
   * Les moments sont évalués dans l'ordre de {@link ACCESS_QUESTION_MOMENTS}, et
   * cet ordre n'est pas cosmétique : on demande d'abord la raison d'un REFUS,
   * parce que c'est le seul moment où elle est encore fraîche dans la tête de
   * celui qui l'a essuyé. Un compte peut déclencher trois moments le même jour ;
   * on n'en pose qu'un.
   *
   * La trace est écrite en SERVANT la question, jamais en recevant la réponse :
   * « ignorée ⇒ jamais reposée » n'est tenable qu'ainsi, parce qu'on ne saura
   * jamais qu'une question a été ignorée. Le prix est assumé — une question
   * servie et jamais vue est brûlée.
   */
  private async pendingQuestion(
    workspaceId: string,
    accountId: string,
    state: { parked: boolean; lockKnown: boolean },
  ): Promise<{ moment: AccessQuestionMoment; answers: readonly AccessAnswerValue[] } | null> {
    // Rien à apprendre : on sait déjà ce qui verrouille ce compte. Poser la
    // question serait demander à quelqu'un de confirmer ce qu'il a déjà dit.
    if (state.lockKnown) return null

    const asked = (await this.facts.query(
      `SELECT moment FROM access_fact_questions WHERE workspace_id = $1 AND account_id = $2`,
      [workspaceId, accountId],
    )) as Array<{ moment: string }>
    const already = new Set(asked.map(row => row.moment))

    const due: AccessQuestionMoment[] = []
    if (state.parked) due.push('after_refusal')
    if (await this.hasFinishedMission(workspaceId, accountId)) due.push('mission_end')
    if (await this.hasOutboundActivity(workspaceId, accountId)) due.push('first_contact')
    if (await this.isInSprintThree(workspaceId, accountId)) due.push('sprint3_qualification')

    const moment = ACCESS_QUESTION_MOMENTS.find(candidate => due.includes(candidate) && !already.has(candidate))
    if (!moment) return null

    await this.facts.query(
      `INSERT INTO access_fact_questions (workspace_id, account_id, moment)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, account_id, moment) DO NOTHING`,
      [workspaceId, accountId, moment],
    )
    return { moment, answers: ACCESS_QUESTION_ANSWERS[moment] }
  }

  /**
   * Le compte est-il dans le Sprint 3 — la qualification au VOLUME ?
   *
   * Le board d'effort du tome 5 a trois colonnes et une sortie ; la troisième
   * est `volume`. C'est là que la grille de qualification se pose, et c'est le
   * seul moment des quatre qui DURE : les trois autres sont ponctuels. D'où son
   * rang en fin de {@link ACCESS_QUESTION_MOMENTS} — voir la raison écrite là-bas.
   *
   * Le sprint est une colonne de `accounts`, pas une table : il n'existe aucune
   * appartenance à joindre, et c'est volontaire côté produit.
   */
  private async isInSprintThree(workspaceId: string, accountId: string): Promise<boolean> {
    const rows = (await this.facts.query(
      `SELECT 1 FROM accounts WHERE workspace_id = $1 AND id = $2 AND sprint = 'volume' LIMIT 1`,
      [workspaceId, accountId],
    )) as unknown[]
    return rows.length > 0
  }

  private async hasFinishedMission(workspaceId: string, accountId: string): Promise<boolean> {
    // `ends_on` est une DATE (pas un horodatage) et elle est facultative : une
    // mission sans date de fin n'annonce jamais rien — la règle du PDF 5, et
    // elle vaut ici aussi. Sans elle, on ne poserait la question qu'au hasard.
    const rows = (await this.facts.query(
      `SELECT 1 FROM missions
        WHERE workspace_id = $1 AND account_id = $2
          AND ends_on IS NOT NULL AND ends_on < current_date
        LIMIT 1`,
      [workspaceId, accountId],
    )) as unknown[]
    return rows.length > 0
  }

  private async hasOutboundActivity(workspaceId: string, accountId: string): Promise<boolean> {
    const rows = (await this.facts.query(
      `SELECT 1 FROM activities
        WHERE workspace_id = $1 AND account_id = $2 AND direction = 'outbound'
        LIMIT 1`,
      [workspaceId, accountId],
    )) as unknown[]
    return rows.length > 0
  }

  /**
   * Répondre à la question posée — un clic, et c'est tout.
   *
   * Une réponse qui n'établit rien (« pas abordé », « refus de fond ») est
   * enregistrée comme RÉPONDUE mais n'écrit aucun fait : traduire « on n'en a
   * pas parlé » en « ouvert » inventerait une porte que personne n'a vue. C'est
   * la moitié de la valeur du mécanisme.
   */
  async answerQuestion(
    workspaceId: string,
    accountId: string,
    userLabel: string,
    input: { moment: AccessQuestionMoment; answer: AccessAnswerValue },
  ): Promise<{ recorded: boolean }> {
    const account = await this.accounts.findOne({
      where: { id: accountId, workspace_id: workspaceId },
      select: { id: true },
    })
    if (!account) throw new NotFoundException('Compte introuvable dans cet espace.')

    await this.facts.query(
      `INSERT INTO access_fact_questions (workspace_id, account_id, moment, answered_at, answer)
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (workspace_id, account_id, moment)
       DO UPDATE SET answered_at = now(), answer = EXCLUDED.answer`,
      [workspaceId, accountId, input.moment, input.answer],
    )

    const lock = lockFromAnswer(input.answer)
    if (!lock) return { recorded: false }

    await this.declare(workspaceId, accountId, userLabel, {
      kind: 'lock',
      value: lock,
      detail: ANSWER_DETAIL[input.answer] ?? null,
    } as CreateAccessFact)
    return { recorded: true }
  }

  /**
   * Déclarer un fait d'accès. Toujours en provenance `human` : c'est un geste
   * d'utilisateur, et c'est précisément ce qui lui donne autorité sur ce que le
   * pipeline déduira demain.
   */
  async declare(
    workspaceId: string,
    accountId: string,
    userLabel: string,
    input: CreateAccessFact,
  ): Promise<AccessFact> {
    const account = await this.accounts.findOne({
      where: { id: accountId, workspace_id: workspaceId },
      select: { id: true },
    })
    if (!account) throw new NotFoundException('Compte introuvable dans cet espace.')

    const saved = await this.facts.save(
      this.facts.create({
        workspace_id: workspaceId,
        account_id: accountId,
        entity_id: input.entity_id ?? null,
        kind: input.kind,
        value: input.value.trim(),
        detail: input.detail?.trim() || null,
        source: userLabel,
        provenance: 'human',
        // Une déclaration sans date d'observation vaut « constaté maintenant » :
        // c'est le seul cas où la date d'écriture EST la date du fait.
        observed_at: input.observed_at ? new Date(input.observed_at) : new Date(),
      }),
    )
    return this.toWire(saved, new Date())
  }

  private toWire(row: AccessFactEntity, now: Date): AccessFact & { freshness: string } {
    const observed = row.observed_at
      ? row.observed_at instanceof Date
        ? row.observed_at.toISOString()
        : String(row.observed_at)
      : null
    const fact: AccessFact = {
      id: row.id,
      account_id: row.account_id,
      entity_id: row.entity_id ?? null,
      kind: row.kind as AccessFactKind,
      value: row.value,
      detail: row.detail ?? null,
      source: row.source,
      provenance: row.provenance as AccessFact['provenance'],
      observed_at: observed,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }
    return { ...fact, freshness: accessFreshness(fact, now) }
  }
}
