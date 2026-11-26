import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MoreThanOrEqual, Repository } from 'typeorm'
import { ConnectorCapabilityProbeEntity } from '../../database/entities/connector-capability-probe.entity'
import { ConnectorCapabilityIncidentEntity } from '../../database/entities/connector-capability-incident.entity'
import type { ConnectorErrorCode } from '@bellum/contracts'
import { aggregateClientFacingErrors, type ClientFacingErrorReport, type ProbeErrorRow } from './client-facing-errors'
import { deriveDependencyHealth, type DependencyHealth } from './dependency-health.logic'
import { DEPENDENCIES, DEPENDENCY_IDS, isConfigured, type DependencyId } from './dependency-registry'
import { DependencyProbeService } from './dependency-probe.service'

/**
 * #1660 — ce que la page Santé du back-office lit.
 *
 * Deux questions distinctes, une seule route, et elles ne se contaminent pas :
 * une panne de l'une ne doit jamais masquer l'autre (c'est déjà la façon dont
 * l'écran charge l'état des sources et celui des interrupteurs).
 *
 * ⚠️ CE SERVICE NE VA CHERCHER AUCUN SERVICE D'UN AUTRE MODULE. La grille des
 * onze dépendances aurait pu se composer ici en important le service des runs
 * (pour Claude, Brave, Firecrawl, Pappers, Apollo) : GA-07 est un cliquet AU
 * PLAFOND côté fichiers (124/124), et cet import l'aurait fait tomber. La
 * composition se fait donc au bord — l'écran appelle DEUX routes qui existent
 * déjà chacune pour sa raison, et le registre des dépendances lui dit laquelle
 * remplit quelle tuile (`usageSource`).
 */

/** La fenêtre du tableau « ce qui casse, vu du client ». Sept jours, l'issue.
 *  En-fichier seulement : elle voyage jusqu'à l'écran DANS la charge utile
 *  (`windowDays`), pour que le libellé et le calcul ne puissent pas diverger. */
const CLIENT_ERROR_WINDOW_DAYS = 7

/**
 * Une tuile, dans l'un de ses deux régimes de mesure.
 *
 * ⚠️ C'est une UNION et non un objet à champs optionnels : une tuile mesurée à
 * l'usage n'a PAS de latence médiane locale, et un champ nullable ferait écrire
 * `latence ?? 0` à l'écran. Le régime décide de ce qui existe.
 */
type DependencyReading =
  | {
      id: DependencyId
      label: string
      cuts: string
      /** La clé est-elle posée ? Absente = capacité éteinte à dessein, pas panne. */
      configured: boolean
      measuredBy: 'probe'
      health: DependencyHealth
    }
  | {
      id: DependencyId
      label: string
      cuts: string
      configured: boolean
      measuredBy: 'usage'
      /** Le nom sous lequel l'écran retrouvera son état dans le rapport des
       *  sources — la seule table de correspondance, et elle vit ici. */
      usageSource: string
    }

/**
 * #2445.12 (épopée #2766) — une ligne de la chronologie d'incidents : QUAND
 * une capacité a cessé, ou repris, de répondre. Jamais le FOURNISSEUR — même
 * discipline que {@link ProbeErrorRow} ci-dessus : nos fournisseurs ne se
 * nomment jamais à l'écran (doctrine).
 */
/** En-fichier seulement : knip refuse un type exporté que seul son propre fichier consomme. */
type IncidentTimelineEntry = {
  /** #2445.12 (lot SRC5 28/09 soir) — `connector_capability_incidents.id`, pour adresser CET incident (impact, actions, communication). */
  id: string
  capability: string
  transition: 'degraded' | 'recovered'
  code: ConnectorErrorCode | null
  occurredAt: string
}

/** En-fichier seulement : knip refuse un type exporté que seul son propre fichier consomme. */
type IncidentTimelineReport = {
  entries: IncidentTimelineEntry[]
  /** #2445.12 — les incidents actuellement OUVERTS (dernière transition connue = « degraded »). */
  open: IncidentTimelineEntry[]
}

/** Combien de transitions récentes l'écran affiche. Un plafond ÉCRIT, jamais
 *  un « tout » qui grossirait sans fin. */
const INCIDENT_TIMELINE_LIMIT = 50

/** #2445.12 — combien de transitions on parcourt pour trouver, par capacité, la
 *  dernière : un plafond ÉCRIT. Une capacité sans transition dans cette fenêtre
 *  n'apparaît pas (on n'affiche pas ce qu'on n'a pas). */
const INCIDENT_OPEN_SCAN_LIMIT = 500

/**
 * Supervision 30/09 — lecture des erreurs client IMPOSSIBLE : un état distinct
 * d'un rapport vide (qui se lirait « aucune erreur », un faux zéro).
 */
type ClientFacingErrorsUnavailable = { status: 'unavailable'; windowDays: number }

export type OperatorHealthReport = {
  generatedAt: string
  dependencies: DependencyReading[]
  clientFacingErrors: ClientFacingErrorReport | ClientFacingErrorsUnavailable
  incidentTimeline: IncidentTimelineReport
}

@Injectable()
export class OperatorHealthService {
  private readonly logger = new Logger(OperatorHealthService.name)

  constructor(
    private readonly probes: DependencyProbeService,
    @InjectRepository(ConnectorCapabilityProbeEntity)
    private readonly connectorProbes: Repository<ConnectorCapabilityProbeEntity>,
    // #2445.12 (LOT écrivain 28/09, passe 2) — le journal des transitions,
    // repository injecté DIRECTEMENT (GA-07 ne compte pas les repositories),
    // déclaré dans `health.module.ts` (GA-20).
    @InjectRepository(ConnectorCapabilityIncidentEntity)
    private readonly connectorIncidents: Repository<ConnectorCapabilityIncidentEntity>,
  ) {}

  async report(now: Date = new Date()): Promise<OperatorHealthReport> {
    const [dependencies, clientFacingErrors, incidentTimeline] = await Promise.all([
      this.dependencies(now),
      this.clientFacingErrors(now),
      this.incidentTimeline(),
    ])
    return { generatedAt: now.toISOString(), dependencies, clientFacingErrors, incidentTimeline }
  }

  private async dependencies(now: Date): Promise<DependencyReading[]> {
    const history = await this.probes.history(now.getTime())

    return DEPENDENCY_IDS.map(id => {
      const descriptor = DEPENDENCIES[id]
      const configured = isConfigured(descriptor)
      const base = { id, label: descriptor.label, cuts: descriptor.cuts, configured }

      if (descriptor.measuredBy === 'usage') {
        // ⚠️ `usageSource` est non nul par construction pour ce régime ; le
        // repli sur l'identifiant évite un `!` et ne change jamais rien : le
        // registre déclare les cinq.
        return { ...base, measuredBy: 'usage' as const, usageSource: descriptor.usageSource ?? id }
      }

      return {
        ...base,
        measuredBy: 'probe' as const,
        health: deriveDependencyHealth({
          samples: history[id] ?? [],
          now: now.getTime(),
          configured,
          // Deux sondes ne mesurent aucun aller-retour : le processus qui répond
          // (`api`) et le registre de vivacité du worker. Leur latence est
          // `not_applicable`, ce qui n'est pas « 0 ms » et pas non plus
          // « pas de mesure ».
          producesLatency: id !== 'api' && id !== 'worker',
        }),
      }
    })
  }

  /**
   * Les erreurs vues du client, sur sept jours.
   *
   * ⚠️ La source est le journal de PREUVES des connecteurs
   * (`connector_capability_probes`) : la dernière erreur par espace, outil et
   * capacité. Elle ne compte pas les occurrences, et `client-facing-errors.ts`
   * dit pourquoi ce nombre n'est pas publié plutôt que d'en inventer un.
   *
   * Une panne de lecture rend l'état `unavailable` avec sa fenêtre (jamais un
   * rapport vide, qui se lirait « aucune erreur », ni une exception : le reste
   * de l'écran doit continuer à s'afficher).
   */
  private async clientFacingErrors(now: Date): Promise<ClientFacingErrorReport | ClientFacingErrorsUnavailable> {
    const since = new Date(now.getTime() - CLIENT_ERROR_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    let rows: ProbeErrorRow[] = []
    try {
      // ⚠️ `MoreThanOrEqual` et non `Not(IsNull())` : une comparaison SQL écarte
      // déjà les NULL, et la fenêtre se dit une seule fois. La première version
      // combinait les deux avec `&&`, qui en JavaScript jette simplement le
      // premier opérande — la condition « pas nul » n'existait pas.
      const found = await this.connectorProbes.find({
        where: { last_error_at: MoreThanOrEqual(since) },
        select: ['workspace_id', 'capability', 'last_error_code', 'last_error_at'],
        take: 2_000,
      })
      rows = found
        .filter(row => row.last_error_at !== null)
        .map(row => ({
          workspaceId: row.workspace_id,
          capability: row.capability,
          code: row.last_error_code,
          occurredAt: row.last_error_at,
        }))
    } catch (error) {
      this.logger.warn('Client-facing errors unreadable', {
        error: error instanceof Error ? error.message : String(error),
      })
      return { status: 'unavailable', windowDays: CLIENT_ERROR_WINDOW_DAYS }
    }

    return aggregateClientFacingErrors(rows, { now, windowDays: CLIENT_ERROR_WINDOW_DAYS })
  }

  /**
   * #2445.12 (épopée #2766, LOT écrivain 28/09 passe 2) — la chronologie des
   * transitions récentes, la plus récente d'abord. `connector_capability_
   * probes` n'a jamais gardé QUAND une capacité a cessé ou repris de
   * répondre ; `ConnectorProbeService` journalise désormais ce fait dans
   * `connector_capability_incidents`, ceci ne fait que le LIRE.
   *
   * Une panne de lecture rend une chronologie VIDE, jamais une erreur : le
   * reste de l'écran doit continuer à s'afficher.
   */
  private async incidentTimeline(): Promise<IncidentTimelineReport> {
    try {
      const rows = await this.connectorIncidents.find({
        select: ['id', 'capability', 'transition', 'error_code', 'occurred_at'],
        order: { occurred_at: 'DESC' },
        take: INCIDENT_OPEN_SCAN_LIMIT,
      })
      // Le tri redemandé ici, en plus de `order` ci-dessus : un test (ou un
      // futur appelant) qui ne respecterait pas l'ordre SQL ne doit pas
      // afficher une chronologie mélangée.
      const sorted = [...rows].sort((a, b) => b.occurred_at.getTime() - a.occurred_at.getTime())
      const toEntry = (row: (typeof sorted)[number]): IncidentTimelineEntry => ({
        // #2445.12 (lot SRC5 28/09 soir) — l'identifiant de la transition,
        // pour que la console puisse ADRESSER cet incident précis
        // (impact, actions, communication — `ConnectorIncidentOpsService`,
        // module `tool-registry`). Composé au BORD (l'écran appelle les deux
        // routes), jamais importé ici : ce service ne va chercher aucun
        // service d'un autre module (voir le docblock de fichier).
        id: row.id,
        capability: row.capability,
        transition: row.transition,
        code: row.error_code as ConnectorErrorCode | null,
        occurredAt: row.occurred_at.toISOString(),
      })
      // #2445.12 — vue de triage : `sorted` est le plus récent d'abord, donc la
      // première ligne rencontrée d'une capacité est sa dernière transition ; elle
      // est « ouverte » seulement si c'est un « degraded ».
      const seen = new Set<string>()
      const open: IncidentTimelineEntry[] = []
      for (const row of sorted) {
        if (seen.has(row.capability)) continue
        seen.add(row.capability)
        if (row.transition === 'degraded') open.push(toEntry(row))
      }
      return { entries: sorted.slice(0, INCIDENT_TIMELINE_LIMIT).map(toEntry), open }
    } catch (error) {
      this.logger.warn('Incident timeline unreadable', {
        error: error instanceof Error ? error.message : String(error),
      })
      return { entries: [], open: [] }
    }
  }
}
