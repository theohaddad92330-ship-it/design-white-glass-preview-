import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  TERRITORY_COLLECTION_LIMITS,
  type TerritorySnapshot,
  type TerritorySnapshotSource,
  hiringBaseline,
} from '@bellum/contracts'
import { EsnDirectoryEntity } from '../../database/entities/esn-directory.entity'
import { TerritorySnapshotEntity } from '../../database/entities/territory-snapshot.entity'
import { TerritorySubscriptionEntity } from '../../database/entities/territory-subscription.entity'
import { IaClient } from '../ia/ia.client'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { EsnDirectoryService } from './esn-directory.service'
import { killSwitchCut } from '../../common/kill-switches'

/**
 * La photo hebdomadaire d'un territoire (tome 4 §21.3).
 *
 * Elle sert DEUX choses, et la seconde est la plus importante :
 *
 * 1. L'écran Marché — « qu'est-ce qui a bougé sur mes départements ? », qui est
 *    la question d'un commercial qui suit un territoire, là où l'écran
 *    Territoire répond à « qu'est-ce qu'il y a là-bas ? ».
 * 2. **La moyenne de recrutement des ESN**, que RIEN n'écrivait jusqu'ici.
 *    `esn_directory.hiring_baseline` existait, le score de débordement la
 *    lisait, et elle était vide sur les 477 lignes : son axe « Volume » était
 *    donc structurellement non mesurable. Chaque photo la construit. La
 *    première semaine ne dit rien, la treizième dit tout.
 *
 * Une seule passe par département et par semaine, quel que soit le nombre
 * d'espaces qui le suivent : les offres publiées en Haute-Garonne sont les
 * mêmes pour tout le monde, et interroger quatre sources publiques une fois par
 * client serait payer plusieurs fois pour un résultat identique.
 */
@Injectable()
export class TerritoryWatchService {
  private readonly logger = new Logger(TerritoryWatchService.name)

  constructor(
    @InjectRepository(TerritorySnapshotEntity)
    private readonly snapshots: Repository<TerritorySnapshotEntity>,
    @InjectRepository(TerritorySubscriptionEntity)
    private readonly subscriptions: Repository<TerritorySubscriptionEntity>,
    @InjectRepository(EsnDirectoryEntity)
    private readonly directory: Repository<EsnDirectoryEntity>,
    private readonly ia: IaClient,
    // Verrou de tick — `@Optional()` et EN DERNIER, comme partout ailleurs :
    // les specs qui construisent le service à la main ne changent pas, et son
    // absence dégrade vers le comportement mono-instance plutôt que de casser.
    @Optional() private readonly locks?: SingletonLockService,
  ) {}

  /**
   * Le balayage du lundi matin. Kill-switch : `TERRITORY_WATCH_DISABLED=true`.
   *
   * Tôt, et avant les routines de 8-9 h : la routine qui NOTIFIE la variation
   * lit ces photos, et une photo prise après elle ferait annoncer la semaine
   * précédente.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI UN VERROU ICI, ALORS QUE LE CRON D'À CÔTÉ N'EN A PAS
   * ─────────────────────────────────────────────────────────────────────────
   * L'index unique `(department, taken_on)` empêche déjà la ligne en double :
   * si le verrou ne servait qu'à protéger la BASE, il serait superflu. Ce qu'il
   * protège est le COÛT. `snapshot()` interroge quatre sources publiques par
   * département AVANT d'écrire quoi que ce soit, donc à N répliques on paie N
   * fois la même semaine, et la contrainte n'intervient qu'après.
   *
   * Et l'index seul ment sur le résultat : la réplique perdante prend la
   * violation d'unicité dans son `catch` et journalise « Photo du département 31
   * manquée » — un échec annoncé sur une photo qui a bel et bien été prise.
   *
   * Le bris de glace est testé AVANT la prise de verrou : éteindre la veille ne
   * doit pas consommer le tick, sinon la rallumer dans la journée resterait sans
   * effet jusqu'à l'expiration du verrou.
   */
  @Cron('0 5 * * 1', { name: 'territory-watch', timeZone: 'Europe/Paris' })
  async takeWeeklySnapshots(): Promise<void> {
    // ⚠️ Une SEULE lecture. Ma fusion avait gardé les deux — celle du registre
    //    et la lecture directe qu'elle remplace — et GA-84 l'a attrapée : deux
    //    lectures d'un même interrupteur peuvent dire l'inverse l'une de l'autre
    //    le jour où leur convention diverge (le dépôt en a quatre).
    if (killSwitchCut('territory.weekly_watch')) return
    await withSingletonLock(this.locks, 'territory-watch', () => this.sweep())
  }

  /** Le balayage lui-même — déjà sous verrou, exposé pour la recette. */
  private async sweep(): Promise<void> {
    const departments = await this.followedDepartments()
    if (departments.length === 0) return
    let taken = 0
    for (const department of departments) {
      // Un département en échec n'arrête pas les autres : perdre une photo se
      // rattrape la semaine suivante, perdre le balayage entier laisse tous les
      // territoires sans mesure et creuse un trou dans toutes les moyennes.
      try {
        if (await this.snapshot(department)) taken += 1
      } catch (error) {
        this.logger.warn(`Photo du département ${department} manquée : ${String(error)}`)
      }
    }
    this.logger.log(`Veille territoriale : ${taken}/${departments.length} photo(s) prise(s)`)
  }

  /** Les départements suivis par au moins un espace. */
  async followedDepartments(): Promise<string[]> {
    const rows = (await this.subscriptions.manager.query(
      `SELECT DISTINCT department FROM territory_subscriptions ORDER BY department`,
    )) as Array<{ department: string }>
    return rows.map(row => row.department)
  }

  /**
   * Une photo, et la mise à jour des moyennes qu'elle rend possibles.
   *
   * Rend `false` quand la photo du jour existe déjà : rejouer le balayage ne
   * doit pas compter deux fois la même semaine dans une médiane.
   */
  async snapshot(department: string): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10)
    // ⚠️ `source: 'sweep'` dans le prédicat, et ce n'est pas un détail : sans
    // lui, une photo de la salle de démonstration prise le même lundi ferait
    // croire au balayage que la semaine est déjà couverte. Il rendrait `false`
    // et la mesure RÉELLE du département serait perdue, en silence, pour le
    // seul département que la démonstration affiche.
    const existing = await this.snapshots.findOne({ where: { department, takenOn: today, source: 'sweep' } })
    if (existing) return false

    const known = await this.directory.find({ select: ['normalizedName'] })
    const overview = await this.ia.territoryOverview({
      department,
      sinceDays: 90,
      knownEsnNames: known.map(row => row.normalizedName),
    })

    // Un bloc `unavailable` écrit `null` et NON zéro. C'est toute la règle : une
    // source en panne un lundi ne doit pas se lire « le marché s'est effondré »
    // le lundi suivant.
    const market = overview.market
    const accessible = overview.accessible
    const competition = overview.competition
    const esnHiring = (overview.overflow.esn ?? []).map(item => ({ name: item.name, offers: item.offers }))

    await this.snapshots.save(
      this.snapshots.create({
        department,
        takenOn: today,
        offers: market.state === 'unavailable' ? null : (market.offers ?? null),
        esnPresent: competition.state === 'unavailable' ? null : (competition.esnPresent ?? null),
        openTenders: accessible.state === 'unavailable' ? null : (accessible.openTenders ?? null),
        awardedContracts: accessible.state === 'unavailable' ? null : (accessible.awardedContracts ?? null),
        buyersWithIncumbent: accessible.state === 'unavailable' ? null : (accessible.buyersWithIncumbent ?? null),
        topTechnologies: market.technologies ?? [],
        esnHiring,
        // La borne EN VIGUEUR au moment de la prise, écrite AVEC la mesure. Le
        // jour où la collecte passe de 100 à 300, cette photo-ci restera
        // lisible pour ce qu'elle est — sans quoi la hausse de la semaine
        // suivante serait entièrement due à la borne.
        collectionLimits: { ...TERRITORY_COLLECTION_LIMITS },
        source: 'sweep',
      }),
    )

    await this.refreshBaselines(department)
    return true
  }

  /**
   * La moyenne de recrutement de chaque ESN vue sur ce territoire.
   *
   * Elle est écrite sur la ligne du référentiel — donc partagée entre espaces,
   * comme les photos : « SII recrute d'habitude six personnes par trimestre en
   * Haute-Garonne » est un fait de marché, pas une donnée de client.
   *
   * Sous un trimestre d'historique, `hiringBaseline` rend `null` et on n'écrit
   * RIEN : une moyenne posée sur trois points ferait passer un axe pour
   * mesurable alors qu'il ne l'est pas, ce qui est pire que de le dire absent.
   */
  private async refreshBaselines(department: string): Promise<void> {
    const history = await this.history(department, 26)
    if (history.length === 0) return
    const names = new Set(history.flatMap(photo => photo.esnHiring.map(entry => entry.name)))
    const latest = history.at(-1)

    for (const name of names) {
      const baseline = hiringBaseline(history, name)
      const current = latest?.esnHiring.find(entry => entry.name === name)?.offers ?? null
      const normalized = EsnDirectoryService.normalize(name)
      if (!normalized) continue
      const row = await this.directory.findOne({ where: { normalizedName: normalized } })
      if (!row) continue

      const hiring90d = { ...(row.hiring90d ?? {}), [department]: current }
      // La moyenne n'écrase JAMAIS une valeur existante par `null` : perdre un
      // trimestre d'historique parce qu'une ESN a fait une semaine creuse
      // remettrait l'axe Volume à « non mesurable » sans raison.
      const previousBaseline = (row.hiringBaseline ?? {}) as Record<string, unknown>
      const nextBaseline =
        baseline === null
          ? previousBaseline
          : { ...previousBaseline, quarterlyAverage: baseline, [department]: baseline }

      await this.directory.manager.query(
        `UPDATE esn_directory
            SET hiring_90d = $2::jsonb, hiring_baseline = $3::jsonb, hiring_refreshed_at = now()
          WHERE id = $1`,
        [row.id, JSON.stringify(hiring90d), JSON.stringify(nextBaseline)],
      )
    }
  }

  /**
   * L'historique d'un département, du plus ancien au plus récent.
   *
   * ⚠️ `source` par DÉFAUT à `'sweep'` — c'est la valeur qui protège tout le
   * reste. Les photos de la salle de démonstration ne doivent entrer NI dans la
   * médiane de recrutement du référentiel (partagée entre tous les espaces), NI
   * dans le tableau d'un espace client qui suivrait le même département. Seul
   * l'appelant qui SAIT lire pour la salle demande explicitement `'demo'`.
   */
  async history(
    department: string,
    weeks: number,
    source: TerritorySnapshotSource = 'sweep',
  ): Promise<TerritorySnapshot[]> {
    const rows = await this.snapshots.find({
      where: { department, source },
      order: { takenOn: 'DESC' },
      take: Math.max(1, weeks),
    })
    return rows
      .map(row => ({
        takenOn: row.takenOn,
        offers: row.offers,
        esnPresent: row.esnPresent,
        openTenders: row.openTenders,
        awardedContracts: row.awardedContracts,
        esnHiring: row.esnHiring ?? [],
        collectionLimits: row.collectionLimits ?? {},
      }))
      .reverse()
  }
}
