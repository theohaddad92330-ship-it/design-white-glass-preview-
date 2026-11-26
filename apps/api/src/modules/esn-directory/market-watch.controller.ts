import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  MIN_SNAPSHOTS_FOR_BASELINE,
  TERRITORY_COLLECTION_LIMITS,
  TERRITORY_MEASURE_KEYS,
  TERRITORY_MEASURE_REGISTRIES,
  TERRITORY_MEASURE_TARGETS,
  type MarketWatch,
  type TerritoryMeasureKey,
  type TerritorySnapshot,
  type TerritorySnapshotSource,
  readTerritoryCount,
  territoryChanges,
  territoryStructuralTrend,
  territoryTrend,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { MarketData } from '../../common/decorator/market-data.decorator'
import { TerritorySnapshotEntity } from '../../database/entities/territory-snapshot.entity'
import { TerritorySubscriptionEntity } from '../../database/entities/territory-subscription.entity'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { EsnDirectoryService } from './esn-directory.service'
import { TerritoryWatchService } from './territory-watch.service'

const followSchema = z.object({ department: z.string().min(1).max(3) })
class FollowDto extends createZodDto(followSchema) {}

/**
 * L'écran Marché — « qu'est-ce qui a bougé sur mes territoires ? » (tome 4 §21.3).
 *
 * L'ABONNEMENT est scopé à l'espace ; les PHOTOS ne le sont pas. C'est
 * l'asymétrie qui porte l'écran : suivre la Haute-Garonne est une intention
 * commerciale, le nombre d'offres IT publiées là-bas est un fait de marché.
 *
 * Aucune permission dédiée : suivre un département n'ouvre aucune donnée
 * d'espace, et `records:write` interdirait à un `viewer` de suivre une ville,
 * ce qui n'a aucun sens. Le geste est personnel et son effet est public.
 */
@Controller('pilotage/marche')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class MarketWatchController {
  constructor(
    @InjectRepository(TerritorySubscriptionEntity)
    private readonly subscriptions: Repository<TerritorySubscriptionEntity>,
    @InjectRepository(TerritorySnapshotEntity)
    private readonly snapshots: Repository<TerritorySnapshotEntity>,
    private readonly watch: TerritoryWatchService,
    private readonly directory: EsnDirectoryService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * `@MarketData` et non une permission : tout ce que cette lecture rend est du
   * fait de marché — offres publiées, ESN implantées, appels d'offres ouverts.
   * La seule ligne d'espace qui la traverse est la LISTE DES CODES de
   * département suivis, qui n'est pas un enregistrement métier : la voir
   * n'apprend rien sur le portefeuille, les contacts ou la marge. Comprendre
   * son marché n'est le privilège de personne, `viewer` compris.
   */
  @MarketData()
  @Get()
  async marketWatch(@CurrentUser() user: CurrentUserPayload): Promise<MarketWatch> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const followed = await this.subscriptions.find({ where: { workspaceId }, order: { department: 'ASC' } })
    if (followed.length === 0) return { territories: [] }

    // La salle de démonstration lit SES photos, un espace client les siennes.
    // C'est la seule différence, et elle vaut dans les deux sens : un client ne
    // voit jamais un décor, la salle ne montre jamais un chiffre qu'elle n'a pas
    // fabriqué elle-même.
    const source: TerritorySnapshotSource = (await this.workspaceContext.isDemoWorkspace(user.userId))
      ? 'demo'
      : 'sweep'
    const coverage = await this.directory.coverage()

    const territories = await Promise.all(
      followed.map(async row => {
        const history = await this.watch.history(row.department, MIN_SNAPSHOTS_FOR_BASELINE * 2, source)
        const latest = history.at(-1) ?? null
        const previous = history.length >= 2 ? (history.at(-2) ?? null) : null
        const changes = territoryChanges(previous, latest)
        const esn = await this.directory.departmentBreakdown(row.department)
        const portfolio = await this.portfolio(workspaceId, row.department)

        return {
          department: row.department,
          lastSnapshotOn: latest?.takenOn ?? null,
          snapshots: history.length,
          measures: TERRITORY_MEASURE_KEYS.map(key => this.measure(key, row.department, latest, previous, history)),
          changes,
          // Trois silences différents, trois phrases différentes : une veille
          // qui démarre, une première comparaison qui n'a pas encore de terme
          // de référence, et un marché qui n'a réellement pas bougé.
          reason: !latest
            ? 'La veille vient de démarrer — la première photo sera prise lundi.'
            : !previous
              ? 'Première photo prise. La comparaison arrivera avec la suivante, lundi prochain.'
              : changes.length === 0
                ? 'Rien de notable depuis la semaine dernière.'
                : null,
          esn: { ...esn, resolved: coverage.resolved, total: coverage.total },
          hiringEsn: latest?.esnHiring ?? [],
          technologies: await this.technologies(row.department, latest?.takenOn ?? null, source),
          portfolio,
        }
      }),
    )
    return { territories }
  }

  /**
   * UNE MESURE, AVEC TOUT CE QU'IL FAUT POUR LA LIRE.
   *
   * C'est ici que « Offres IT : 100 » cesse d'être un dénombrement. La borne
   * enregistrée avec la photo (ou, pour les photos anciennes, celle en vigueur)
   * dit si le chiffre est un compte ou un plancher, et la tendance REFUSE de se
   * calculer entre deux plafonds.
   *
   * #2206.42 — DEUX horizons, jamais un seul. `trend` reste les deux DERNIÈRES
   * photos (l'ACTUEL, inchangé) ; `structuralTrend` ajoute la plus ANCIENNE
   * contre la plus RÉCENTE de `history` (le STRUCTUREL) — même arithmétique,
   * même refus des plafonds, calculée par `territoryStructuralTrend` plutôt que
   * recopiée ici.
   */
  private measure(
    key: TerritoryMeasureKey,
    department: string,
    latest: TerritorySnapshot | null,
    previous: TerritorySnapshot | null,
    history: TerritorySnapshot[],
  ): MarketWatch['territories'][number]['measures'][number] {
    const ceiling = latest?.collectionLimits?.[key] ?? TERRITORY_COLLECTION_LIMITS[key]
    const reading = readTerritoryCount(latest?.[key] ?? null, ceiling, key)
    const trend = territoryTrend({ key, previous, latest })
    const structuralTrend = territoryStructuralTrend({ key, history })
    const template = TERRITORY_MEASURE_TARGETS[key]
    return {
      key,
      value: reading.state === 'unmeasured' ? null : reading.value,
      bounded: reading.state === 'at_least',
      ceiling,
      registry: TERRITORY_MEASURE_REGISTRIES[key],
      observedOn: latest?.takenOn ?? null,
      trend,
      structuralTrend,
      // La destination part DÉJÀ CADRÉE sur ce territoire : l'écran n'a aucune
      // décision à reprendre, et le département ne peut pas se perdre en route.
      target:
        template.kind === 'route' ? { ...template, search: { ...(template.search ?? {}), department } } : template,
    }
  }

  /**
   * Les technologies demandées à la dernière photo.
   *
   * Elles vivent dans la colonne `top_technologies`, que `history()` ne rend
   * pas : elle sert la MOYENNE de recrutement et n'a aucune raison de traîner
   * huit termes par semaine sur vingt-six semaines. Une lecture ciblée d'UNE
   * ligne coûte moins qu'un champ de plus sur toutes.
   */
  private async technologies(
    department: string,
    takenOn: string | null,
    source: TerritorySnapshotSource,
  ): Promise<{ term: string; count: number }[]> {
    if (!takenOn) return []
    const row = await this.snapshots.findOne({ where: { department, takenOn, source } })
    return row?.topTechnologies ?? []
  }

  /**
   * LE LIEN AVEC LE PORTEFEUILLE — l'INTENTION de l'espace, jamais un fait de
   * marché.
   *
   * ⚠️ La frontière de GA-43 passe exactement ici : le nombre d'offres IT d'un
   * département se partage (c'est un fait), le nombre de comptes qu'un espace y
   * suit ne se partage JAMAIS (c'est une position commerciale, et les espaces
   * sont des concurrents). Ces deux nombres sont donc calculés PAR espace, à
   * chaque lecture, et n'entrent dans aucune table partagée.
   *
   * ⚠️ Ce que le chiffre COMPTE, exactement : les comptes qui ont AU MOINS UN
   * SITE déclaré dont le code postal tombe dans le département. Un compte sans
   * site déclaré n'est pas « ailleurs », il est INCONNU — d'où `accountsWithSite`,
   * le dénominateur RÉEL, qui part avec le chiffre pour qu'aucun écran ne le lise
   * comme « je n'ai que trois comptes ici ».
   *
   * ⚠️ Limite connue, écrite plutôt que masquée : la Corse. Les codes postaux
   * corses commencent par 20 alors que les départements s'écrivent 2A et 2B ;
   * les deux départements sont donc indiscernables par le code postal, et un
   * compte ajaccien remonte sur les deux. C'est une imprécision NOMMÉE, pas un
   * chiffre faux — l'alternative serait de ne rien afficher pour la Corse.
   */
  private async portfolio(
    workspaceId: string,
    department: string,
  ): Promise<{ accountsHere: number; accountsWithSite: number; partnersHere: number }> {
    const prefix = department.toUpperCase() === '2A' || department.toUpperCase() === '2B' ? '20' : department
    const rows = (await this.subscriptions.manager.query(
      `SELECT count(DISTINCT a.id) FILTER (WHERE s.postal_code LIKE $2)::int AS here,
              count(DISTINCT a.id)::int AS with_site
         FROM accounts a
         JOIN sites s ON s.account_id = a.id
        WHERE a.workspace_id = $1
          AND s.postal_code IS NOT NULL`,
      [workspaceId, `${prefix}%`],
    )) as Array<{ here: number; with_site: number }>
    const counts = rows[0] ?? { here: 0, with_site: 0 }

    // Les ESN partenaires de l'espace, rapprochées du référentiel par leur nom
    // NORMALISÉ — la même normalisation que partout ailleurs, jamais une
    // seconde écrite à la main. Une partenaire absente du référentiel n'est pas
    // comptée : on ne devine pas où se trouve son siège.
    const partners = (await this.subscriptions.manager.query(
      `SELECT name FROM partner_relations WHERE workspace_id = $1`,
      [workspaceId],
    )) as Array<{ name: string }>
    const normalized = partners.map(partner => EsnDirectoryService.normalize(partner.name)).filter(Boolean)
    const facts = await this.directory.factsByName([...new Set(normalized)])
    const partnersHere = [...facts.values()].filter(fact => fact.headquartersDepartment === department).length

    return { accountsHere: counts.here ?? 0, accountsWithSite: counts.with_site ?? 0, partnersHere }
  }

  /** Suivre engage l'ESPACE — tout le monde y verra le territoire. */
  @RequirePermission('records:write')
  @Post()
  async follow(@CurrentUser() user: CurrentUserPayload, @Body() dto: FollowDto): Promise<{ department: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const department = dto.department.trim().toUpperCase()
    await this.subscriptions
      .createQueryBuilder()
      .insert()
      .values({ workspaceId, userId: user.userId, department })
      .orIgnore()
      .execute()
    return { department }
  }

  @RequirePermission('records:write')
  @Delete(':department')
  async unfollow(
    @CurrentUser() user: CurrentUserPayload,
    @Param('department') department: string,
  ): Promise<{ department: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.subscriptions.delete({ workspaceId, department: department.trim().toUpperCase() })
    return { department }
  }
}
