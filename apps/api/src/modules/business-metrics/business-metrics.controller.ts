import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Put, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { SaveTreasuryDto, TakeSnapshotDto } from './dto/business-metrics.dto'
import {
  BusinessMetricsService,
  type BusinessMonth,
  type BusinessPosition,
  type MonthlyClientMovement,
  type TreasuryInput,
  type TreasuryMonthView,
  type TreasuryView,
} from './business-metrics.service'
import { monthOf } from './mrr-movements'

/** Ce que l'écran « Trésorerie » et le futur cockpit lisent d'un coup. */
interface BusinessMetricsOverview {
  /** Les mois FIGÉS, du plus ancien au plus récent. */
  series: BusinessMonth[]
  /** La position du MOMENT — jamais figée, jamais confondue avec un instantané. */
  current: Omit<BusinessPosition, 'lines'>
  treasury: TreasuryView
}

/**
 * Les chiffres de BELLUM, pour le back-office opérateur (#1645, #1649).
 *
 * Même modèle de confiance que le reste d'`internal/admin` : la seule porte est
 * le secret interne, que la console attache côté serveur. Le rôle, lui, est
 * vérifié dans la console — `treasury.read` / `treasury.write`, réservés au
 * propriétaire (`apps/dashboard-manager/src/lib/roles.ts`).
 *
 * ⚠️ AUCUNE ROUTE D'ÉCRITURE VERS LA FACTURATION. On fige une mesure, on saisit
 * une trésorerie. Rien ici ne change un prix, un abonnement, une facture ou un
 * crédit — et rien ne le pourra : le service n'a pas ces repositories.
 */
@Controller('internal/admin/business-metrics')
@UseGuards(InternalSecretGuard)
export class BusinessMetricsController {
  constructor(private readonly metrics: BusinessMetricsService) {}

  /** La série figée, la position du moment et la trésorerie, en une lecture. */
  @Get()
  async overview(): Promise<BusinessMetricsOverview> {
    const [series, position, treasury] = await Promise.all([
      this.metrics.series(),
      this.metrics.currentPosition(),
      this.metrics.treasuryView(),
    ])
    const { lines: _lines, ...current } = position
    return { series, current, treasury }
  }

  /**
   * Fige un mois. Rendre `frozen: false` n'est PAS une erreur : c'est la preuve
   * que l'instantané est immuable (T1 de #1645).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * UN SEUL MOIS EST FIGEABLE : CELUI QUI VIENT DE FINIR
   * ─────────────────────────────────────────────────────────────────────────
   * Arbitrage de Louis du 07/09/2026. Ce geste ne LIT pas un mois passé : il
   * photographie les abonnements D'AUJOURD'HUI et range la photo sous une
   * étiquette de mois. Pour le mois qui vient de finir, c'est la meilleure
   * approximation disponible et la seule possible — rien n'enregistre l'état
   * des abonnements au jour le jour.
   *
   * Pour n'importe quel autre mois, ce serait un MENSONGE DURABLE : rattraper
   * mars en septembre écrirait la position de septembre sous l'étiquette de
   * mars, et l'instantané étant immuable, elle y resterait pour toujours. Un
   * mois manqué reste donc un TROU NOMMÉ dans la série — « non mesuré n'est pas
   * mesuré à zéro », et ce n'est pas non plus « mesuré à la valeur d'un autre
   * mois ».
   *
   * ⚠️ La porte est ICI, au contrôleur, et pas dans le service : le passage
   * automatique du 1er (`business-metrics-snapshot.service.ts`) vise déjà le
   * mois qui vient de finir par construction, et un rattrapage de secours par
   * un script reste possible pour qui SAIT ce qu'il écrit. C'est le geste
   * d'OPÉRATEUR qu'on borne, parce que c'est lui qui ne peut pas voir la
   * conséquence depuis un bouton.
   */
  @Post('snapshot')
  takeSnapshot(@Body() dto: TakeSnapshotDto): Promise<{ frozen: boolean; month: string; snapshot: BusinessMonth }> {
    const now = new Date()
    const figeable = this.metrics.monthToFreeze(now)
    const month = dto.month ?? figeable
    // Le mois à venir garde SA phrase : « pas encore » et « plus jamais » sont
    // deux refus différents, et un message unique ferait chercher au mauvais
    // endroit.
    if (month > monthOf(now)) {
      throw new BadRequestException('Un mois à venir ne se fige pas : sa position n’existe pas encore.')
    }
    if (month !== figeable) {
      throw new BadRequestException(
        `Seul ${figeable}, le mois qui vient de finir, peut être figé. Ce bouton photographie les abonnements ` +
          `d’aujourd’hui : les ranger sous l’étiquette de ${month} écrirait une position fausse, et un instantané ` +
          `ne se recalcule jamais. Un mois manqué reste un trou nommé dans la série.`,
      )
    }
    return this.metrics.takeSnapshot(month)
  }

  /** Les mois de trésorerie saisis, avec le burn et le runway qu'on en dérive. */
  @Get('treasury')
  treasury(): Promise<TreasuryView> {
    return this.metrics.treasuryView()
  }

  /**
   * Le tableau des mouvements PAR CLIENT d'un mois FIGÉ (#1646.6) — Client ·
   * Type (nouveau/expansion/contraction/attrition) · Montant · Date.
   *
   * ⚠️ Refus SYNCHRONE (méthode non `async`), même mécanique que
   * `saveTreasury` ci-dessous : un format illisible ne doit pas déclencher une
   * lecture pour rien.
   */
  @Get('movements/:month')
  movements(@Param('month') month: string): Promise<MonthlyClientMovement[]> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestException('Le mois s’écrit AAAA-MM.')
    }
    return this.metrics.monthlyClientMovements(month)
  }

  /**
   * Saisit ou corrige UN mois.
   *
   * `x-operator-email` est l'adresse relue par la console à chaque requête (elle
   * ne vient jamais du cookie). Absente, la ligne porte `null` : la couche
   * d'identité peut être au repos (`DM_ALLOWED_EMAILS` non posée), et un
   * `'inconnu'` ferait d'une lacune un auteur.
   */
  @Put('treasury/:month')
  saveTreasury(
    @Param('month') month: string,
    @Body() dto: SaveTreasuryDto,
    @Headers('x-operator-email') operator?: string,
  ): Promise<TreasuryMonthView> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestException('Le mois s’écrit AAAA-MM.')
    }
    if (month > monthOf(new Date())) {
      throw new BadRequestException('Un mois à venir ne se saisit pas.')
    }
    // Annoté : le DTO et le contrat du service se ressemblent aujourd'hui, et
    // c'est cette ligne qui fera échouer la compilation le jour où ils
    // divergeront — plutôt qu'un champ silencieusement ignoré.
    const patch: TreasuryInput = dto
    return this.metrics.saveTreasuryMonth(month, patch, operator?.trim() || null)
  }
}
