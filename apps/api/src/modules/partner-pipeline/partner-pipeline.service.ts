import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  deriveGovernanceStatus,
  partnerGovernanceReadiness,
  partnerRelationScore,
  type PartnerGovernanceFields,
  type PartnerGovernanceReadiness,
  type PartnerGovernanceStatus,
  type PartnerRelationScore,
  type PartnerScoreAxis,
  type PartnerStage,
  type UpdatePartnerGovernance,
} from '@bellum/contracts'
import { PartnerRelationEntity } from '../../database/entities/partner-relation.entity'
import {
  ESN_DIRECTORY_BY_DEPARTMENT,
  ESN_PROFILE_ANSWERS_READER,
  MARKET_ESN_OBSERVATION_READER,
  type EsnDirectoryByDepartment,
  type EsnProfileAnswersReader,
  type MarketEsnObservationReader,
} from './profile-match-tokens'
import {
  attachObservedClients,
  isPlausibleEsnName,
  mergeEsnByMatchKey,
  stripCertaintyDecoration,
} from './esn-on-accounts-merge'
import type { AccountObservationStatus, EsnOnAccountsRow, RawAccountPartnerRow } from './esn-on-accounts-merge'
import { departmentsFromGeoZones } from './profile-geo-zones'

/**
 * Les axes du score partenaire qu'AUCUNE source branchée ne peut nourrir — et
 * la raison de chacun, vérifiée dans le code le 29/08/2026.
 *
 * Ils étaient passés en `null` muet, ce qui se lit « la valeur n'est pas encore
 * arrivée » alors qu'elle ne peut PAS arriver. C'est le même défaut, et le même
 * remède, que `UNCOLLECTED_ON_TERRITORY` dans `territory.controller.ts` : un
 * axe qu'on ne peut pas mesurer sort du dénominateur — ça, le contrat le fait
 * déjà — mais il doit aussi être NOMMÉ, sinon l'écran laisse croire qu'il
 * suffit d'attendre, ou pire, de saisir quelque chose.
 *
 * ⚠️ Cette liste se RÉTRÉCIT quand une source apparaît — elle ne s'allonge
 * jamais pour faire taire un axe. Retirer une entrée sans brancher sa source
 * ferait mentir le calcul dans l'autre sens.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RE-VÉRIFIÉ LE 30/08/2026 (D90 du 29/08 demandait de câbler les deux) — et
 * la conclusion ne change PAS. Deux chemins de plus ont été examinés avant
 * de la confirmer :
 *
 * · MARGE — un chemin existe bien pour un SOUS-ENSEMBLE des missions : un
 *   consultant en sous-traitance porte `partner_account_id` (référence
 *   `accounts.id`, pas `partner_relations.id` — `1789561203847-TalentEngagementAndRates.ts:71`),
 *   qu'on pourrait rapprocher d'une relation par SIREN (`accounts.siren` ↔
 *   `partner_relations.siren`, tous deux réels), puis suivre
 *   `mission_assignments` (`consultant_id` → `mission_id`) jusqu'à
 *   `mission_commercial_terms`. Chaîne à trois jointures, RIEN d'inventé —
 *   et pourtant écartée : elle ne couvre que le sous-traitant, pas tout le
 *   canal « partenaire » (`mission_commercial_terms.channel`), donc une
 *   « marge moyenne » construite dessus mesurerait un sous-ensemble en le
 *   faisant passer pour le tout. Et elle est aujourd'hui VIDE : zéro
 *   consultant de démo ne porte `engagement_kind = 'sous_traitance'`
 *   (`demo-seed.service.ts:871-878`), donc la câbler n'aurait rien changé
 *   à l'écran, y compris en démo.
 * · ACCÈS — le jeu de démo confirme la seconde moitié du `why` ci-dessous à
 *   la main : les quatre `partner_relations` de démo (Astréa Conseil,
 *   Ovalis Technologies, Novéris Digital, Kaerneo Systems —
 *   `demo-dataset.ts:6832-6890`) et les `account_partners` du client fictif
 *   (Vertex Systèmes, Orsan Conseil — `demo-dataset.ts:4978-4991`) ne
 *   partagent AUCUN nom. Rapprocher les deux tables par nom resterait un
 *   rapprochement TEXTUEL sur une table qui ne porte ni SIREN ni
 *   `partner_relation_id` (`account-partner.entity.ts`) — et répondrait de
 *   toute façon à la mauvaise question : une présence n'est pas une
 *   introduction (raison déjà posée plus bas).
 *
 * Câbler correctement l'un ou l'autre demande une colonne neuve — un
 * `partner_relation_id` sur `missions` ou `mission_commercial_terms`, un
 * flag « introduit par ce partenaire » sur `account_partners` — donc une
 * migration, hors du périmètre de fichiers de ce lot
 * (`apps/api/src/modules/partner-pipeline/**` et le contrat associé
 * uniquement). Ce que CE lot a fait : fermer le repli `?? 100` / `?? 0` qui
 * mentait sur la direction d'une valeur inconnue (voir `canRank1` dans
 * `partner-pipeline.ts`) — un défaut réel, indépendant de la question « la
 * source existe-t-elle ».
 * ─────────────────────────────────────────────────────────────────────────
 */
const UNCOLLECTED_ON_PARTNER_RELATIONS: readonly { axis: PartnerScoreAxis; why: string }[] = [
  {
    axis: 'marge',
    // La marge se calcule sur `mission_commercial_terms` (D43, 28/08 : c'est LA
    // source du coût chargé). Mais aucune mission ne sait de QUEL partenaire
    // elle vient : `channel` dit « partner » — une catégorie —, il n'existe
    // aucun `partner_relation_id`, ni sur `missions`, ni sur les conditions
    // commerciales. Une marge moyenne « par partenaire » supposerait donc de
    // répartir au hasard les missions du canal partenaire entre les relations.
    why: 'Aucune mission n’est rattachable à un partenaire précis : le canal (« partenaire ») est une catégorie, pas une identité. Tant qu’une mission ne nomme pas sa relation, une marge par partenaire serait une répartition inventée.',
  },
  {
    axis: 'acces',
    // « Les comptes finaux qu'il ouvre et que nous n'avions pas ». `accounts.origin`
    // existe et ne connaît que `discover | search | import | crm | manual` :
    // « ouvert par un partenaire » n'est pas une valeur possible.
    // `account_partners` dit qui est EN PLACE chez nos comptes — ce qui est un
    // autre fait, et compter une présence comme une introduction gonflerait
    // l'axe avec l'empreinte de nos concurrents.
    why: 'Rien n’enregistre qu’un partenaire nous a ouvert un compte : l’origine d’un compte ne connaît pas « par un partenaire », et une ESN en place chez un client n’est pas une ESN qui nous y a fait entrer.',
  },
]

/**
 * #1798 — UNE ESN DU RÉFÉRENTIEL QUI COLLE AU PROFIL.
 *
 * Un LISTING, pas un score : Louis l'a demandé en ces termes (« juste le
 * listing des ESN qui collent avec le profil »), et la doctrine l'impose de
 * toute façon — `esn_directory` ne connaît ni secteur ni expertise d'une ESN,
 * seulement son siège et sa position de sous-traitance. Un score CALCULÉ sur
 * un seul axe (la géographie) se lirait comme une note globale qu'il n'est
 * pas. Chaque fait reste donc NOMMÉ, et `null` quand le référentiel ne l'a pas
 * encore résolu — jamais un texte de remplissage.
 */
interface ProfileMatchEsn {
  readonly name: string
  readonly city: string | null
  readonly department: string | null
  readonly sizeClass: string | null
  /** Tel que promu sur `esn_directory` — un agrégat ANONYME inter-espaces
   *  (voir `EsnDirectoryService.declareSubcontracting`), jamais une déclaration
   *  d'un espace précis. `'inconnu'` = personne ne l'a déclaré. */
  readonly openToSubcontracting: string
}

/**
 * `no_geo_signal` distingue deux causes qui n'appellent pas le même geste :
 * `unset` (aucune zone déclarée → aller compléter le profil) et `unmappable`
 * (des zones existent, mais aucune ne désigne un territoire précis : remote,
 * national, international → aller chercher plus précisément).
 */
export interface ProfileMatchResult {
  readonly status: 'matched' | 'no_geo_signal'
  readonly reason: 'unset' | 'unmappable' | null
  readonly geoZones: readonly string[]
  readonly matches: readonly ProfileMatchEsn[]
}

export interface PartnerRelationView {
  id: string
  siren: string | null
  name: string
  stage: string
  roles: string[]
  contactName: string | null
  notes: string | null
  needsReceived90d: number
  needsGiven90d: number
  placementsActive: number
  placementsTotal: number
  lastActivityAt: string | null
  /** La clause de non-sollicitation, telle qu'elle a été DÉCLARÉE. `null` =
   *  personne ne l'a déclarée — ce n'est pas « il n'y en a pas ». */
  nonSolicitation: boolean | null
  /** Le score à cinq axes, ou son absence MOTIVÉE. */
  score: PartnerRelationScore
  /** Les axes que personne ne peut renseigner, et pourquoi. À distinguer de
   *  `score.unmeasured`, qui dit « pas encore mesuré » sans dire s'il sert à
   *  quelque chose d'attendre. */
  notCollected: { axis: PartnerScoreAxis; why: string }[]
  /** #3270 — les dix-sept champs du cadre, tels que cadrés. */
  governance: PartnerGovernanceFields
  /** #3270 — PARTNER READINESS : ce qui est cadré, ce qui manque, le risque,
   *  les comptes/profils concernés, la prochaine validation. */
  governanceReadiness: PartnerGovernanceReadiness
  /** #3270 — STATUTS PARTENAIRE, dérivé (jamais un second champ stocké). */
  governanceStatus: PartnerGovernanceStatus
  pausedAt: string | null
  pausedReason: string | null
  blockedAt: string | null
  blockedReason: string | null
}

/**
 * Chaque champ passe par `?? null` : une ligne antérieure à la migration (en
 * base réelle, TypeORM la rend `null` ; dans les tests unitaires du service,
 * qui construisent des lignes à la main, la clé est simplement absente et
 * vaudrait `undefined`) doit se lire « non cadré », jamais « cadré avec une
 * valeur vide » — `isFramed` compare à `!== null`, pas à `!== undefined`.
 */
function governanceFieldsOf(row: PartnerRelationEntity): PartnerGovernanceFields {
  return {
    entryDoorScope: row.entryDoorScope ?? null,
    accountsAccessible: row.accountsAccessible ?? null,
    accountsForbidden: row.accountsForbidden ?? null,
    profilesSought: row.profilesSought ?? null,
    domainsCovered: row.domainsCovered ?? null,
    marginFloorPercent: row.marginFloorPercent ?? null,
    marginSharePercent: row.marginSharePercent ?? null,
    accountOwnership: (row.accountOwnership as PartnerGovernanceFields['accountOwnership']) ?? null,
    actionOwnership: (row.actionOwnership as PartnerGovernanceFields['actionOwnership']) ?? null,
    presentationTerms: row.presentationTerms ?? null,
    paymentTerms: row.paymentTerms ?? null,
    delayTerms: row.delayTerms ?? null,
    ourContactName: row.ourContactName ?? null,
    ourContactEmail: row.ourContactEmail ?? null,
    durationTerms: row.durationTerms ?? null,
    exitConditions: row.exitConditions ?? null,
    referencingProof: row.referencingProof ?? null,
    confidentialityLevel: (row.confidentialityLevel as PartnerGovernanceFields['confidentialityLevel']) ?? null,
  }
}

/**
 * Le pipeline partenaire d'un espace (tome 4, `BEL-PART-001`).
 *
 * Ce que ce service NE calcule pas : le débordement. C'est l'autre score, il
 * porte sur des sources publiques et vit côté IA. Les fondre donnerait un
 * nombre qui répond à deux questions à la fois, donc à aucune.
 */
@Injectable()
export class PartnerPipelineService {
  constructor(
    @InjectRepository(PartnerRelationEntity)
    private readonly repo: Repository<PartnerRelationEntity>,
    // #1798 / GA-07 — par JETON, jamais par la classe : le cliquet est au
    // plafond, et importer les deux services ici le ferait lever sans
    // decoupler quoi que ce soit. La composition vit dans le .module.ts.
    @Inject(ESN_DIRECTORY_BY_DEPARTMENT) private readonly esnDirectoryByDepartment: EsnDirectoryByDepartment,
    @Inject(ESN_PROFILE_ANSWERS_READER) private readonly readProfileAnswers: EsnProfileAnswersReader,
    // #2151.32 — un troisième JETON, même raison que les deux au-dessus.
    @Inject(MARKET_ESN_OBSERVATION_READER) private readonly readMarketObservation: MarketEsnObservationReader,
  ) {}

  /**
   * #1798 — LES ESN QUI COLLENT AU PROFIL, SANS PASSER PAR LE TERRITOIRE.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUE « COLLER AU PROFIL » VEUT DIRE ICI, ET CE QUE ÇA NE VEUT PAS DIRE
   * ─────────────────────────────────────────────────────────────────────────
   * Le seul axe qui se calcule honnêtement est la GÉOGRAPHIE : `esn_directory`
   * ne porte ni secteur ni expertise d'une ESN (voir `EsnDirectoryEntity`), donc
   * un score « profil » sur plusieurs axes serait inventé sur les axes qui
   * manquent. Ce que ce calcul rend est un LISTING des ESN du référentiel dont
   * le SIÈGE tombe dans une zone du profil — c'est aussi tout ce que Louis a
   * demandé (« juste le listing », pas un score).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE PROFIL SE RÉSOUT CÔTÉ SERVEUR, JAMAIS ENVOYÉ PAR LE CLIENT
   * ─────────────────────────────────────────────────────────────────────────
   * `EsnProfileReader` est la source UNIQUE que Analysis/Discover/Chat/Score
   * lisent déjà pour le profil vendeur (voir son docblock : « the front never
   * sends it »). Cet appel suit la même règle plutôt que d'inventer un second
   * chemin où le client posterait ses `geo_zones`.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE COÛT, MESURÉ
   * ─────────────────────────────────────────────────────────────────────────
   * `byDepartment` est une lecture INDEXÉE sur `esn_directory` — 477 lignes de
   * référentiel au total, aucun appel externe, aucun modèle. Au plus une
   * poignée de requêtes (une par zone déclarée, dédoublonnées par département).
   * C'est ce qui rend inutile un job de fond : la réponse est disponible dès
   * que le profil existe, sans étape de pré-calcul à attendre.
   */
  async profileMatches(userId: string): Promise<ProfileMatchResult> {
    const answers = await this.readProfileAnswers(userId)
    const geoZones = answers.geo_zones ?? []
    const departments = departmentsFromGeoZones(geoZones)

    if (departments.length === 0) {
      return {
        status: 'no_geo_signal',
        reason: geoZones.length === 0 ? 'unset' : 'unmappable',
        geoZones,
        matches: [],
      }
    }

    const rowsByDepartment = await Promise.all(
      departments.map(department => this.esnDirectoryByDepartment(department, 50)),
    )

    const seen = new Set<string>()
    const matches: ProfileMatchEsn[] = []
    for (const rows of rowsByDepartment) {
      for (const row of rows) {
        // #1798 — réutilise le filtre de #1799 : un nom d'ESN est une société,
        // pas une phrase. `esn_directory` vient d'un fichier semé à la main
        // ET d'une résolution registre — les deux peuvent porter une entrée
        // dégradée, et ce filtre est la même défense en profondeur qu'ailleurs.
        const name = stripCertaintyDecoration(row.legalName ?? row.inputName)
        if (!isPlausibleEsnName(name)) continue

        // La clé de dédoublonnage est le SIREN quand il est résolu (deux
        // départements ne peuvent pas se disputer la même ESN), et le nom
        // normalisé sinon — jamais le nom brut, qui dédoublonnerait moins bien
        // qu'il ne le devrait (voir #1799.1, même défaut, autre écran).
        const key = row.siren ?? name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)

        matches.push({
          name,
          city: row.headquartersCity,
          department: row.headquartersDepartment,
          sizeClass: row.sizeClass,
          openToSubcontracting: row.openToSubcontracting,
        })
      }
    }
    matches.sort((left, right) => left.name.localeCompare(right.name))

    return { status: 'matched', reason: null, geoZones, matches }
  }

  /**
   * Les ESN en place sur MES comptes — le troisième onglet de l'écran.
   *
   * Lecture directe de `account_partners`, agrégée par ESN : la même maison
   * peut tenir trois comptes, et la voir trois fois ne dit pas qu'elle est un
   * concurrent systémique. Le nombre de comptes, lui, le dit.
   *
   * ⚠️ On ne joint PAS avec `partner_relations` : une ESN peut être en place
   * chez un client sans qu'on ait la moindre relation avec elle, et l'inverse
   * est vrai aussi. Les fondre ferait disparaître l'un des deux.
   *
   * #1799.1 — CORRIGÉ : l'agrégation groupait par `p.name`, le texte SAISI,
   * comparé octet par octet. « Capgemini » (déclarée) et « CAPGEMINI »
   * (détectée sur un autre compte) formaient deux groupes SQL — donc deux
   * lignes pour la même ESN. La requête rend maintenant les lignes BRUTES, et
   * `mergeEsnByMatchKey` les regroupe avec `marketMatchKey` — le normaliseur
   * DÉJÀ utilisé par la mémoire marché pour ce rapprochement, plutôt qu'un
   * second qui ne le rencontrerait jamais. Voir ce fichier pour le détail et
   * le test témoin qui prouve que deux ESN réellement distinctes ne
   * fusionnent pas.
   *
   * Le plafond de 20 000 lignes brutes est une borne de SÉCURITÉ (mémoire),
   * très au-dessus de tout espace réel — il ne tronque pas avant l'agrégation
   * comme le ferait un `LIMIT` posé sur des groupes déjà classés : on regroupe
   * d'abord, sur la totalité des lignes d'un espace, puis on borne l'affichage
   * à 50 ESN.
   */
  async onMyAccounts(workspaceId: string): Promise<EsnOnAccountsRow[]> {
    // #1799 — `p.certainty` voyage désormais avec la ligne : c'est la place
    // de la certitude, jamais le nom (voir `esn-on-accounts-merge.ts`).
    // #2151.62 — LEFT JOIN sur `accounts` : un seul chemin de lecture (GA-26)
    // pour nommer les comptes, la même table que lit la fiche compte pour son
    // onglet écosystème. LEFT et non JOIN : un compte supprimé après coup ne
    // doit pas faire disparaître la ligne `account_partners` qui le cite.
    // #2151.32 — `a.website`/`a.registry_country` rejoignent la projection :
    // ce sont exactement les trois champs que `MarketCompanyLookup` demande
    // (voir `PartnersService.observedEsn`, la MÊME forme de lecture, module
    // `partners`), lus ici en une seule requête plutôt qu'une par compte.
    // #2298.8 — p.detected_at voyage désormais avec la ligne : c'est elle qui
    // date l'observation de rang 2 (rank2Observations, esn-on-accounts-merge.ts),
    // jamais une date devinée à l'écran.
    const rows: (RawAccountPartnerRow & { account_website?: string | null; account_country?: string | null })[] =
      await this.repo.manager.query(
        `SELECT p.name AS name,
              p.account_id AS account_id,
              p.rank AS rank,
              p.relationship AS relationship,
              p.certainty AS certainty,
              p.detected_at AS detected_at,
              a.company_name AS account_name,
              a.website AS account_website,
              a.registry_country AS account_country
         FROM account_partners p
         LEFT JOIN accounts a ON a.id = p.account_id
        WHERE p.workspace_id = $1
          AND p.dismissed_at IS NULL
        LIMIT 20000`,
        [workspaceId],
      )
    const merged = mergeEsnByMatchKey(rows)

    // #2151.32 — UN compte de l'espace n'est interrogé qu'UNE fois (Map par
    // `account_id`), même si plusieurs ESN le citent : la mémoire marché est
    // un appel réseau par compte, jamais par présence.
    const accountsById = new Map<string, { name: string; website: string | null; country: string | null }>()
    for (const row of rows) {
      if (accountsById.has(row.account_id) || !row.account_name) continue
      accountsById.set(row.account_id, {
        name: row.account_name,
        website: row.account_website ?? null,
        country: row.account_country ?? null,
      })
    }
    const statusByAccountId = new Map<string, AccountObservationStatus>(
      await Promise.all(
        [...accountsById.entries()].map(
          async ([accountId, account]): Promise<[string, AccountObservationStatus]> => [
            accountId,
            await this.readMarketObservation({ ref: accountId, ...account }),
          ],
        ),
      ),
    )

    return attachObservedClients(merged, statusByAccountId).slice(0, 50)
  }

  async list(workspaceId: string): Promise<PartnerRelationView[]> {
    const rows = await this.repo.find({ where: { workspaceId }, order: { name: 'ASC' } })
    return rows.map(row => this.toView(row))
  }

  /**
   * #3757 (reste) — les SIREN que CET espace a déclarés partenaires, pour
   * Découvrir : un candidat qui porte l'un de ces SIREN est un fait DÉCLARÉ
   * (`classify_actor_type(is_declared_partner=…)`, apps/ia), pas une
   * hypothèse NAF — le badge dit « Partenaire déclaré » plutôt que
   * « concurrente ou partenaire rang 2 ».
   *
   * Lecture ÉTROITE, à dessein : `list()` calcule score/gouvernance/lecture
   * marché pour l'écran Partenaires, un coût que CHAQUE recherche Découvrir
   * n'a pas à payer pour une seule colonne. Une relation `retirée` ne compte
   * plus — la pierre tombale du pipeline (`stage: 'retire'`) vaut ici aussi.
   */
  async declaredSirens(workspaceId: string): Promise<string[]> {
    const rows = await this.repo.find({
      where: { workspaceId },
      select: { siren: true, stage: true },
    })
    return rows.filter(row => row.siren && row.stage !== 'retire').map(row => row.siren as string)
  }

  async create(
    workspaceId: string,
    input: { name: string; siren?: string | null; stage?: PartnerStage; roles?: string[]; contactName?: string | null },
  ): Promise<PartnerRelationView> {
    const row = this.repo.create({
      workspaceId,
      name: input.name.trim(),
      siren: input.siren?.trim() || null,
      stage: input.stage ?? 'identifie',
      roles: input.roles ?? [],
      contactName: input.contactName?.trim() || null,
      lastActivityAt: new Date(),
    })
    return this.toView(await this.repo.save(row))
  }

  /**
   * Déplacer une relation d'une étape à l'autre.
   *
   * Aucune transition n'est interdite, et c'est délibéré : un partenaire peut
   * passer de « dormant » à « flux actif » en un appel, et l'inverse aussi.
   * Interdire des chemins ici obligerait le commercial à mentir sur l'étape
   * pour refléter ce qui s'est réellement passé.
   */
  async setStage(workspaceId: string, id: string, stage: PartnerStage): Promise<PartnerRelationView | null> {
    const row = await this.repo.findOne({ where: { id, workspaceId } })
    if (!row) return null
    row.stage = stage
    row.lastActivityAt = new Date()
    return this.toView(await this.repo.save(row))
  }

  /**
   * Déclarer — ou retirer — la clause de non-sollicitation du cadre.
   *
   * C'est un geste d'UTILISATEUR sur sa propre relation : le clic EST la
   * décision, il n'y a pas de porte à franchir. `null` remet la relation dans
   * son état honnête (« personne ne l'a déclarée »), et ce n'est pas la même
   * chose que déclarer qu'il n'y a pas de clause — d'où les trois états.
   */
  async setNonSolicitation(
    workspaceId: string,
    id: string,
    nonSolicitation: boolean | null,
  ): Promise<PartnerRelationView | null> {
    const row = await this.repo.findOne({ where: { id, workspaceId } })
    if (!row) return null
    row.nonSolicitation = nonSolicitation
    row.lastActivityAt = new Date()
    return this.toView(await this.repo.save(row))
  }

  /**
   * #3270 — UN FORMULAIRE GÉNÉRIQUE pour les dix-sept champs du cadre
   * (doctrine c75 : pas dix-sept routes dédiées). `undefined` laisse un champ
   * intact, `null` l'efface — même geste que `setNonSolicitation`.
   *
   * `pausedReason`/`blockedReason` arment `pausedAt`/`blockedAt` : poser une
   * raison non vide pose la date (si elle n'y était pas déjà) ; poser `null`
   * lève la pause ou le blocage et efface la date avec elle (GA-11 : la
   * contrainte SQL `partner_paused_reason_check`/`partner_blocked_reason_check`
   * interdit de toute façon une date sans raison).
   */
  async updateGovernance(
    workspaceId: string,
    id: string,
    patch: UpdatePartnerGovernance,
  ): Promise<PartnerRelationView | null> {
    const row = await this.repo.findOne({ where: { id, workspaceId } })
    if (!row) return null

    const { pausedReason, blockedReason, ...fields } = patch
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue
      ;(row as unknown as Record<string, unknown>)[key] = value
    }
    if (pausedReason !== undefined) {
      row.pausedReason = pausedReason
      row.pausedAt = pausedReason === null ? null : (row.pausedAt ?? new Date())
    }
    if (blockedReason !== undefined) {
      row.blockedReason = blockedReason
      row.blockedAt = blockedReason === null ? null : (row.blockedAt ?? new Date())
    }
    row.lastActivityAt = new Date()
    return this.toView(await this.repo.save(row))
  }

  private toView(row: PartnerRelationEntity): PartnerRelationView {
    const governance = governanceFieldsOf(row)
    const governanceReadiness = partnerGovernanceReadiness({
      fields: governance,
      nonSolicitation: row.nonSolicitation ?? null,
      partnerContactName: row.contactName,
    })
    const governanceStatus = deriveGovernanceStatus({
      stage: row.stage as PartnerStage,
      pausedAt: row.pausedAt ? row.pausedAt.toISOString() : null,
      blockedAt: row.blockedAt ? row.blockedAt.toISOString() : null,
      readiness: governanceReadiness,
    })
    return {
      id: row.id,
      siren: row.siren,
      name: row.name,
      stage: row.stage,
      roles: row.roles ?? [],
      contactName: row.contactName,
      notes: row.notes,
      needsReceived90d: row.needsReceived90d,
      needsGiven90d: row.needsGiven90d,
      placementsActive: row.placementsActive,
      placementsTotal: row.placementsTotal,
      lastActivityAt: row.lastActivityAt ? row.lastActivityAt.toISOString() : null,
      nonSolicitation: row.nonSolicitation ?? null,
      score: partnerRelationScore({
        // Ce qui n'est pas enregistré vaut `null` et SORT du dénominateur : le
        // score mesurerait sinon la complétude de notre saisie, pas la qualité
        // du partenaire.
        needsReceived12m: row.needsReceived90d > 0 ? row.needsReceived90d : null,
        missionsCompleted: row.placementsTotal > 0 ? row.placementsTotal - row.placementsActive : null,
        missionsTotal: row.placementsTotal > 0 ? row.placementsTotal : null,
        // ⚠️ Ces deux-là restent `null`, et c'est un CONSTAT, pas un oubli :
        // aucune source ne peut les produire aujourd'hui. La différence avec
        // hier est qu'ils sont NOMMÉS — `UNCOLLECTED_ON_PARTNER_RELATIONS` dit
        // lequel manque et pourquoi, et l'écran le répète. Un `null` muet se
        // lisait « ça va arriver ».
        //
        // ⚠️ Conséquence à connaître : « viser le rang 1 » est une règle
        // DORMANTE. Le contrat exige `access !== null && access >= 20`, et
        // l'Accès vaut `null` ici — la garde refuse avant même de regarder la
        // marge. `hasProof` et `hasDirectDecisionMaker`, qu'il exige
        // `=== true`, ne sont stockés nulle part non plus. La recommandation
        // est écrite, traduite et testée, et aucune donnée du produit ne peut
        // la produire tant que marge et accès restent `null` ici. Le test
        // `« viser le rang 1 » est une règle DORMANTE` le fige pour qu'elle ne
        // réapparaisse pas par accident.
        //
        // ⚠️ Corrigé le 30/08/2026 : le contrat repliait la marge sur
        // `averageMarginPct ?? 100` et l'accès sur `access ?? 0`
        // (`packages/contracts/src/schemas/partner-pipeline.ts`) — deux
        // valeurs INVENTÉES (« non mesuré » n'est ni 100, ni 0, ni 25). Elles
        // échouaient du bon côté (elles refusaient), mais un jour où
        // quelqu'un aurait changé l'une des deux constantes, le refus serait
        // devenu une recommandation sur une valeur que personne n'a mesurée.
        // `canRank1` compare désormais `!== null` avant toute comparaison
        // numérique : aucune constante de repli ne peut plus faire passer un
        // axe inconnu. Gardé par deux tests dédiés dans
        // `partner-pipeline.test.ts` (un par borne).
        averageMarginPct: null,
        accountsOpened: null,
        needsGiven12m: row.needsGiven90d > 0 ? row.needsGiven90d : null,
        placementsTotal: row.placementsTotal,
        // Les DEUX gardes dures, enfin armées. Elles étaient écrites, testées
        // au contrat, et jamais passées : `rank1Blocked` valait `null` partout,
        // et un refus qui ne se déclenche jamais se lit comme une protection.
        //
        // « Aussi notre client » se lisait déjà dans la ligne — il ne manquait
        // que l'appel. La clause, elle, ne se déduit de rien : elle se déclare,
        // et `undefined` plutôt que `false` quand elle ne l'a pas été, pour ne
        // pas écrire une permission que personne n'a donnée.
        isAlsoClient: (row.roles ?? []).includes('client'),
        nonSolicitation: row.nonSolicitation ?? undefined,
      }),
      notCollected: UNCOLLECTED_ON_PARTNER_RELATIONS.map(item => ({ ...item })),
      governance,
      governanceReadiness,
      governanceStatus,
      pausedAt: row.pausedAt ? row.pausedAt.toISOString() : null,
      pausedReason: row.pausedReason,
      blockedAt: row.blockedAt ? row.blockedAt.toISOString() : null,
      blockedReason: row.blockedReason,
    }
  }
}
