import { Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  CONSENT_STATES,
  type DiscoverResponse,
  DEFAULT_MAX_RECRUITERS_SHOWN,
  type ConsentState,
  type MatchNeed,
  type ReverseMarket,
  type TerritorySnapshotSource,
} from '@bellum/contracts'
import { WorkspaceContextService } from '../../workspace/workspace-context.service'
import { TerritorySnapshotEntity } from '../../../database/entities/territory-snapshot.entity'
import { EsnDirectoryEntity } from '../../../database/entities/esn-directory.entity'
import { ContactEntity } from '../../../database/entities/contact.entity'
import { AccountEntity } from '../../../database/entities/account.entity'
import { IaClient } from '../../ia/ia.client'
import { EsnProfileReader } from '../../esn-profile/esn-profile-reader.service'
import { MatchingService } from './matching.service'
// #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes :
// le réglage du marché inversé vit désormais dans le module `workspace`, à
// UN seul endroit (GA-26), sur la table de production.
import { WorkspaceReverseMarketSettingsService } from '../../workspace/workspace-reverse-market-settings.service'
import {
  demandFromSnapshot,
  departmentsFromZones,
  placementTargetsFromCandidates,
  rankRecruiters,
  recruiterKey,
  reverseMarketUnavailability,
  signalZonesFromProfileZones,
  type MarketSnapshot,
} from './reverse-market'

/**
 * La PROSPECTION INVERSÉE vers le marché — la lecture (§6.2, BEL-ATS-010).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS SOURCES, DEUX SERVICES, ZÉRO COLLECTE NOUVELLE
 * ─────────────────────────────────────────────────────────────────────────
 * Le §6.2 demande, pour UN consultant, trois sources de besoins :
 *
 *  1. les besoins ouverts de l'espace → `InverseMatchingService`, qui existe et
 *     n'est pas touché ici. L'écran monte les deux côte à côte ;
 *  2. les offres publiées sur le marché ;
 *  3. les ESN qui recrutent sur sa zone — le second marché.
 *
 * Les deux dernières se lisent dans `territory_snapshots`, que la veille
 * territoriale remplit déjà chaque lundi depuis quatre sources publiques. C'est
 * le PDF 1 qui autorise ce raccourci et le rend obligatoire : « le même signal
 * se lit dans les deux sens — un filtre, pas une source nouvelle ». Ce service
 * n'ouvre donc AUCUNE connexion sortante : il n'y a pas de code réseau à
 * relire, ni de robots.txt à respecter, ni de user-agent à ne pas falsifier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL RÉUTILISE `loadCandidates`
 * ─────────────────────────────────────────────────────────────────────────
 * Les zones, les compétences et l'état du consentement d'un consultant sont
 * déjà chargés, filtrés par espace et normalisés par `MatchingService`. Les
 * relire ici en SQL en ferait une seconde lecture, qui dériverait — et la
 * première porte déjà la garde des critères protégés (`MatchCandidate` n'a ni
 * nom, ni photo, ni date de naissance, ni adresse).
 */
/** KEVIN-FIX K.6 — ce que la demande de Laura dit d'un profil : prime sur la fiche. */
type ReverseMarketRequest = { skills?: readonly string[]; zones?: readonly string[] }

function cleanTerms(values: readonly string[] | undefined): string[] {
  const out: string[] = []
  for (const value of values ?? []) {
    const term = value.trim()
    if (term && !out.some(known => known.toLowerCase() === term.toLowerCase())) out.push(term)
  }
  return out
}

@Injectable()
export class ReverseMarketService {
  /** Combien de relevés on remonte par département : le plus récent suffit à
   *  dire l'état du marché, et l'historique a son propre écran. */
  private static readonly SNAPSHOTS_PER_DEPARTMENT = 1

  constructor(
    private readonly matching: MatchingService,
    @InjectRepository(TerritorySnapshotEntity) private readonly snapshots: Repository<TerritorySnapshotEntity>,
    @InjectRepository(EsnDirectoryEntity) private readonly directory: Repository<EsnDirectoryEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    // #2035.10 — le plafond de recruteurs remontés est désormais un réglage
    // d'espace, plus un littéral (`REVERSE_MARKET_RECRUITERS_MAX`).
    private readonly reverseMarketSettings: WorkspaceReverseMarketSettingsService,
    // LUD.4 — la lecture des signaux d'un métier hors informatique. EN DERNIER et optionnels : absents,
    // la lecture d'avant (relevés IT) est la seule.
    @Optional() private readonly ia?: IaClient,
    @Optional() private readonly profileReader?: EsnProfileReader,
  ) {}

  /**
   * KEVIN-FIX K.6 — `request` = ce que la DEMANDE dit (compétences, zones en départements) : elle GAGNE sur la fiche
   * du vivier, rubrique par rubrique. Une fiche sans zone n'annule donc pas la zone dite ; une rubrique absente de
   * la demande retombe sur la fiche. Sans `request`, le calcul est celui de l'écran, à l'identique.
   */
  async forTalent(
    consultantId: string,
    workspaceId: string | null,
    userId: string,
    request?: ReverseMarketRequest,
  ): Promise<ReverseMarket | null> {
    const [candidate] = await this.matching.loadCandidates(workspaceId, userId, EMPTY_NEED, [consultantId])
    // Absent de cet espace : c'est un 404, pas une réponse vide.
    if (!candidate) return null

    const ficheZones = candidate.zones.map(zone => zone.trim()).filter(Boolean)
    const ficheSkills = candidate.skills.map(skill => skill.term).filter(Boolean)
    return this.readMarket({
      consultantId,
      workspaceId,
      userId,
      candidate,
      zones: cleanTerms(request?.zones).length > 0 ? cleanTerms(request?.zones) : ficheZones,
      skillTerms: cleanTerms(request?.skills).length > 0 ? cleanTerms(request?.skills) : ficheSkills,
    })
  }

  /**
   * KEVIN-FIX K.6 (#3816/#3865) — un profil décrit EN TEXTE LIBRE (« développeur full stack Java/Spring/Vue, Lille »)
   * suffit : pas de fiche du vivier, les compétences et la zone de la demande sont la seule source.
   */
  async forProfile(request: ReverseMarketRequest, workspaceId: string | null, userId: string): Promise<ReverseMarket> {
    return this.readMarket({
      consultantId: '',
      workspaceId,
      userId,
      candidate: { consentState: 'valid' },
      zones: cleanTerms(request.zones),
      skillTerms: cleanTerms(request.skills),
    })
  }

  private async readMarket(input: {
    consultantId: string
    workspaceId: string | null
    userId: string
    candidate: { consentState: string }
    zones: string[]
    skillTerms: string[]
  }): Promise<ReverseMarket> {
    const { consultantId, workspaceId, userId, candidate, zones, skillTerms } = input
    // LUD.4 — un espace dont le domaine d'offre n'est PAS l'informatique ne lit pas les relevés IT (Java, React) :
    // il cherche les entreprises qui recrutent le MÉTIER de la fiche dans sa zone.
    // LUD.7 — la salle de démonstration ne lance JAMAIS de lecture live : elle garde ses relevés semés (`demo`).
    const isDemo = await this.workspaceContext.isDemoWorkspace(userId)
    const pack = isDemo ? null : await this.nonItOfferDomain(userId)
    if (pack) {
      return this.forNonItTalent({ consultantId, workspaceId, userId, candidate, zones, skillTerms, pack })
    }
    // ─────────────────────────────────────────────────────────────────────────
    // LA SALLE LIT SES PHOTOS, UN CLIENT LES SIENNES (01/09/2026)
    // ─────────────────────────────────────────────────────────────────────────
    // `territory_snapshots` est PARTAGÉE entre tous les espaces, et depuis le
    // lot « Marché détaillé » elle porte AUSSI des photos de démonstration
    // (`source = 'demo'`). Sans cet aiguillage, les deux lectures ci-dessous
    // prenaient TOUTES les lignes : un vrai client qui suit la Haute-Garonne
    // ou le Rhône aurait vu le décor de la salle présenté comme un relevé de
    // marché. C'est « JAMAIS de donnée fictive », et ça ne se rattrape pas —
    // un chiffre inventé lu par un commercial devient une phrase dite à un
    // prospect.
    //
    // ⚠️ Ni l'un ni l'autre des deux lots ne pouvait le voir : celui qui a semé
    // les photos a vérifié la médiane du référentiel, le balayage du lundi et
    // l'écran Marché — les trois filtrent bien sur `'sweep'` — mais ce
    // service-ci vivait sur l'autre branche. C'est l'aiguillage que
    // `market-watch.controller.ts` pose déjà, appliqué au deuxième lecteur.
    const source: TerritorySnapshotSource = isDemo ? 'demo' : 'sweep'
    const known = await this.knownDepartments(source)
    const { departments, unresolved } = departmentsFromZones(zones, known)
    const snapshots = departments.length > 0 ? await this.latestSnapshots(departments, source) : []

    const unavailableReason = reverseMarketUnavailability(zones, departments, skillTerms, snapshots.length)
    const { baselines, declaredOpen } = await this.esnSignals(snapshots)
    // #2035.10 — un utilisateur sans espace (chemin hérité) n'a AUCUNE ligne
    // possible dans `workspace_reverse_market_settings` (clé `workspace_id`
    // NOT NULL) : le défaut de code, jamais une exception.
    const maxRecruiters = workspaceId
      ? await this.reverseMarketSettings.maxRecruitersShownFor(workspaceId)
      : DEFAULT_MAX_RECRUITERS_SHOWN

    return {
      consultantId,
      zones,
      departments,
      unresolvedZones: unresolved,
      skillTerms,
      unavailableReason,
      demand: snapshots.map(snapshot => demandFromSnapshot(snapshot, skillTerms)),
      recruiters: rankRecruiters(snapshots, baselines, declaredOpen, maxRecruiters),
      consentState: readConsentState(candidate.consentState),
    }
  }

  /** LUD.4 — le domaine d'offre de l'espace s'il n'est pas informatique ; `null` = lecture d'avant. Un profil
   *  illisible ne casse jamais la lecture : il retombe sur elle. */
  private async nonItOfferDomain(userId: string): Promise<string | null> {
    if (!this.profileReader || !this.ia) return null
    try {
      const offered = (await this.profileReader.resolveProfileData(userId)).offerDomain
      return offered && offered !== 'esn_it' ? offered : null
    } catch {
      return null
    }
  }

  /**
   * LUD.4 — « Où placer ce profil ? » pour un métier hors informatique : les entreprises qui recrutent CE métier
   * (offres datées, via le moteur de signaux, pack de l'espace + métier de la fiche) dans la zone de la fiche —
   * à défaut, celle de l'espace — avec les interlocuteurs que l'espace connaît déjà. Aucune technologie n'est
   * demandée. Rien trouvé = `companies: []` avec le métier et la zone cherchés, pas un silence.
   */
  private async forNonItTalent(input: {
    consultantId: string
    workspaceId: string | null
    userId: string
    candidate: { consentState: string }
    zones: string[]
    skillTerms: string[]
    pack: string
  }): Promise<ReverseMarket> {
    const { consultantId, workspaceId, userId, candidate, skillTerms, pack } = input
    let zones = input.zones
    if (zones.length === 0) {
      // La zone de l'espace, quand la fiche n'en porte pas.
      try {
        const geo = (await this.profileReader?.resolveProfileData(userId))?.geoZone
        zones = (geo ?? '')
          .split(',')
          .map(zone => zone.trim())
          .filter(Boolean)
      } catch {
        zones = []
      }
    }
    const { queries, unresolved } = signalZonesFromProfileZones(zones)
    const base = {
      consultantId,
      zones,
      departments: [],
      unresolvedZones: unresolved,
      skillTerms,
      demand: [],
      recruiters: [],
      consentState: readConsentState(candidate.consentState),
    }
    const searched = { roles: skillTerms, zones, offerDomain: pack }
    const unavailableReason = reverseMarketUnavailability(
      zones,
      queries.length > 0 ? ['zone'] : [],
      skillTerms,
      1, // pas de relevé hebdomadaire sur ce chemin : la lecture est celle des signaux du jour
    )
    if (unavailableReason) return { ...base, unavailableReason, placementTargets: { searched, companies: [] } }

    const readings = await Promise.allSettled(
      queries.slice(0, 3).map(query =>
        this.ia!.discoverSignals({
          filters: { ...query, sources: ['hiring'], sinceDays: 90, limit: 20 },
          // Le pack de l'espace ET le métier de la fiche : jamais une technologie.
          profileData: { offerDomain: pack, placedRoles: skillTerms },
        }),
      ),
    )
    // Une entreprise par SIREN, dans l'ordre de lecture.
    const seen = new Set<string>()
    const found: DiscoverCandidate[] = []
    for (const reading of readings) {
      if (reading.status !== 'fulfilled') continue
      for (const candidateFound of reading.value.candidates ?? []) {
        if (!candidateFound.siren || seen.has(candidateFound.siren)) continue
        seen.add(candidateFound.siren)
        found.push(candidateFound)
      }
    }
    const contacts = await this.knownContacts(
      found.map(company => company.siren),
      workspaceId,
      userId,
    )
    return {
      ...base,
      unavailableReason: null,
      placementTargets: { searched, companies: placementTargetsFromCandidates(found, contacts) },
    }
  }

  /** LUD.4 — les interlocuteurs que l'ESPACE connaît déjà chez ces entreprises (par SIREN), jamais inventés. */
  private async knownContacts(
    sirens: readonly string[],
    workspaceId: string | null,
    userId: string,
  ): Promise<Map<string, { name: string; title: string | null }[]>> {
    const out = new Map<string, { name: string; title: string | null }[]>()
    if (sirens.length === 0) return out
    // Le périmètre de l'espace : sa fiche d'espace, sinon les contacts du seul utilisateur (espace non partagé).
    const qb = this.snapshots.manager
      .getRepository(ContactEntity)
      .createQueryBuilder('c')
      .innerJoin(AccountEntity, 'a', 'a.id = c.account_id')
      .select(['a.siren AS siren', 'c.full_name AS full_name', 'c.title AS title'])
      .where('a.siren IN (:...sirens)', { sirens })
      .andWhere('c.deleted_at IS NULL')
      .orderBy('c.full_name', 'ASC')
    if (workspaceId) qb.andWhere('c.workspace_id = :workspaceId', { workspaceId })
    else qb.andWhere('c.user_id = :userId', { userId })
    const rows = await qb.getRawMany<{ siren: string; full_name: string; title: string | null }>()
    for (const row of rows) {
      const list = out.get(row.siren) ?? []
      if (list.length < 3) list.push({ name: row.full_name, title: row.title })
      out.set(row.siren, list)
    }
    return out
  }

  /**
   * Les départements que la veille relève RÉELLEMENT.
   *
   * C'est la seule liste de référence : un référentiel écrit dans le code en
   * ferait un second, qui dirait « 44 est un département » un an après que la
   * veille a cessé de le couvrir.
   */
  private async knownDepartments(source: TerritorySnapshotSource): Promise<string[]> {
    const rows = await this.snapshots.manager.query<{ department: string }[]>(
      `SELECT DISTINCT department FROM territory_snapshots WHERE source = $1 ORDER BY department`,
      [source],
    )
    return rows.map(row => row.department)
  }

  /** Le relevé le plus récent de chaque département demandé. */
  private async latestSnapshots(
    departments: readonly string[],
    source: TerritorySnapshotSource,
  ): Promise<MarketSnapshot[]> {
    const rows = await this.snapshots.manager.query<
      {
        department: string
        taken_on: string
        offers: number | null
        top_technologies: { term: string; count: number }[] | null
        esn_hiring: { name: string; offers: number }[] | null
      }[]
    >(
      `SELECT DISTINCT ON (department) department, taken_on, offers, top_technologies, esn_hiring
         FROM territory_snapshots
        WHERE department = ANY($1::text[]) AND source = $2
        ORDER BY department, taken_on DESC
        LIMIT ${departments.length * ReverseMarketService.SNAPSHOTS_PER_DEPARTMENT}`,
      [departments, source],
    )
    return rows.map(row => ({
      department: row.department,
      // `taken_on` est une DATE : le pilote peut la rendre en `Date`. On la
      // ramène au jour, sans heure — une date de relevé n'en a pas.
      takenOn: String(row.taken_on).slice(0, 10),
      offers: row.offers,
      topTechnologies: row.top_technologies ?? [],
      esnHiring: row.esn_hiring ?? [],
    }))
  }

  /**
   * Ce que le référentiel ESN sait des recruteurs relevés : leur habitude sur
   * CE département, et leur ouverture déclarée au rang 2.
   *
   * Les deux restent absents plutôt que faux : une ESN inconnue du référentiel
   * n'a ni habitude ni déclaration, et ça ne veut dire ni « zéro » ni « non ».
   */
  private async esnSignals(
    snapshots: readonly MarketSnapshot[],
  ): Promise<{ baselines: Map<string, number>; declaredOpen: Map<string, boolean> }> {
    const baselines = new Map<string, number>()
    const declaredOpen = new Map<string, boolean>()
    const names = [...new Set(snapshots.flatMap(snapshot => snapshot.esnHiring.map(esn => esn.name.trim())))].filter(
      Boolean,
    )
    if (names.length === 0) return { baselines, declaredOpen }

    const rows = await this.directory.manager.query<
      {
        input_name: string
        normalized_name: string
        hiring_baseline: Record<string, unknown> | null
        open_to_subcontracting: string | null
      }[]
    >(
      `SELECT input_name, normalized_name, hiring_baseline, open_to_subcontracting
         FROM esn_directory
        WHERE lower(normalized_name) = ANY($1::text[])`,
      [names.map(name => name.trim().toLowerCase())],
    )

    for (const row of rows) {
      const key = row.normalized_name
      if (row.open_to_subcontracting === 'oui') declaredOpen.set(normaliseName(key), true)
      else if (row.open_to_subcontracting === 'non') declaredOpen.set(normaliseName(key), false)
      // `inconnu` (et l'absence) ne posent RIEN : la carte muette rend `null`
      // côté contrat, et « jamais déclaré » n'est pas « non ».

      const baseline = row.hiring_baseline
      if (!baseline) continue
      for (const [department, value] of Object.entries(baseline)) {
        // `quarterlyAverage` est la moyenne TOUS départements confondus : elle
        // n'est pas l'habitude d'un territoire et ne doit pas s'y substituer.
        if (department === 'quarterlyAverage') continue
        if (typeof value === 'number' && Number.isFinite(value)) {
          baselines.set(recruiterKey(row.input_name || key, department), value)
        }
      }
    }
    return { baselines, declaredOpen }
  }
}

type DiscoverCandidate = DiscoverResponse['candidates'][number]

/** Sans accent ni casse — la même normalisation que `recruiterKey` applique. */
function normaliseName(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/**
 * L'état de consentement, ramené à la liste FERMÉE du contrat.
 *
 * `MatchCandidate.consentState` est typé `string` : une valeur hors liste
 * retombe sur `none` — « jamais recueilli », qui AVERTIT et laisse passer.
 * Retomber sur `valid` ouvrirait une porte sur une donnée illisible ; retomber
 * sur `expired` refuserait un positionnement sur une faute de frappe.
 */
function readConsentState(value: string): ConsentState {
  return (CONSENT_STATES as readonly string[]).includes(value) ? (value as ConsentState) : 'none'
}

/** Un besoin VIDE, seulement pour charger le candidat. Il ne sert à aucun
 *  calcul : tous ses axes seraient non évaluables. */
const EMPTY_NEED: MatchNeed = {
  needId: null,
  role: '',
  accountName: null,
  accountSector: null,
  projectSectors: [],
  skills: [],
  minYears: null,
  seniorityBand: null,
  environment: [],
  languages: [],
  clearances: [],
  location: null,
  remote: null,
  startOn: null,
  targetRateCents: null,
  contractKind: null,
}
