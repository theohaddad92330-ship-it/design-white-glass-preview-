import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Like, Repository } from 'typeorm'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import {
  ESN_SUGGEST_DEFAULT_LIMIT,
  type EsnDirectorySuggestion,
  type EsnSubcontractingConfidence,
  type EsnSubcontractingDeclarable,
  type EsnSubcontractingDeclarationResult,
  type HeadcountReading,
  hierarchyFromName,
  subcontractingAggregate,
} from '@bellum/contracts'
import { EsnDirectoryEntity } from '../../database/entities/esn-directory.entity'
import { returnedRows } from '../../database/returned-rows'
import { IaClient } from '../ia/ia.client'
import { esnSuggestNeedle, rankEsnSuggestions } from './esn-name-suggest'
import { normalizeEsnName } from './esn-normalize'
import { ESN_DIRECTORY_SEED } from './esn-seed-names'
import { esnDepartmentBreakdown, type EsnDepartmentBreakdown } from './territory-esn-breakdown'
import { killSwitchCut } from '../../common/kill-switches'

/**
 * Le référentiel ESN et son remplissage (tome 4, `BEL-DATA-001`).
 *
 * Le fichier d'origine est un SQUELETTE : 477 noms, sans SIREN, sans ville,
 * sans effectif. L'enrichissement est le travail, et il se fait **en tâche de
 * fond, par lots** (T4-C) — pas au premier affichage d'un écran. Un utilisateur
 * qui ouvre Territoire voit ce qui est déjà résolu et **combien restent** :
 * attendre 477 appels au registre pour afficher une page serait absurde, et
 * masquer le reste ferait croire que le territoire est vide.
 *
 * Ce que cette classe ne fait JAMAIS : supprimer une entrée. Un nom qui ne se
 * résout pas garde sa ligne et sa raison — c'est ce qui permet de savoir que la
 * couverture est à 80 % plutôt que de croire qu'elle est parfaite.
 */
@Injectable()
export class EsnDirectoryService {
  private readonly logger = new Logger(EsnDirectoryService.name)
  private seeded = false

  constructor(
    @InjectRepository(EsnDirectoryEntity)
    private readonly repo: Repository<EsnDirectoryEntity>,
    private readonly ia: IaClient,
  ) {}

  /**
   * Le remplissage du référentiel, par lots, en tâche de fond (T4-C).
   *
   * Toutes les heures et vingt-cinq noms à la fois : 477 noms se résolvent
   * ainsi en une nuit, sans jamais faire attendre un écran ni marteler un
   * registre public que tout le monde partage. Le premier utilisateur qui ouvre
   * Territoire voit ce qui est déjà résolu et COMBIEN restent — c'est ce qui
   * distingue « le référentiel se remplit » de « il n'y a pas d'ESN ici ».
   *
   * Kill-switch : `ESN_DIRECTORY_REFRESH_DISABLED=true`.
   *
   * **SANS VERROU :** le lot est RÉSERVÉ en base avant d'être traité —
   * `UPDATE … SET resolution_status = 'resolving' … FOR UPDATE SKIP LOCKED`
   * dans {@link resolvePending}. Deux répliques obtiennent donc deux lots
   * DISJOINTS : elles se partagent les 477 noms au lieu de s'attendre, et les
   * 477 se résolvent en une demi-nuit plutôt qu'en une. Un verrou singleton
   * ferait ici exactement l'inverse de ce qu'on veut — il diviserait le débit
   * par le nombre de répliques pour protéger d'une collision que la base refuse
   * déjà. Une réservation abandonnée (processus tué en plein lot) retombe
   * d'elle-même au bout d'une demi-heure, et une panne de registre rend le nom
   * `pending` plutôt que « non résolu » : rien ne se perd, rien ne se fige.
   * Tenu par GA-76.
   */
  @Cron('11 * * * *', { name: 'esn-directory-refresh', timeZone: 'Europe/Paris' })
  async refreshDirectory(): Promise<void> {
    if (killSwitchCut('referential.esn_directory_refresh')) return
    const { attempted, resolved } = await this.resolvePending(25)
    if (attempted > 0) {
      // La hiérarchie se recalcule après chaque lot : un « SII Est » résolu
      // avant « SII » ne trouverait sinon jamais son parent.
      const linked = await this.applyHierarchy()
      this.logger.log(`Référentiel ESN : ${resolved}/${attempted} résolues, ${linked} rattachements inférés`)
    }
  }

  /**
   * Le nom, réduit à ce qui permet de le reconnaître d'un fichier à l'autre.
   *
   * L'implémentation vit dans `esn-normalize.ts` depuis le 11/09/2026 : le
   * classement des suggestions (#1887) en a besoin aussi, et l'importer d'ici
   * ferait un cycle de modules. Ce point d'entrée reste, parce que c'est celui
   * que six appelants connaissent.
   */
  static normalize(name: string): string {
    return normalizeEsnName(name)
  }

  /**
   * Sème les 477 noms, une fois. Idempotent par nom normalisé : rejouer le seed
   * ne duplique rien et n'écrase aucune résolution déjà faite.
   */
  async seed(): Promise<number> {
    const rows = ESN_DIRECTORY_SEED.map(entry => ({
      inputName: entry.name,
      normalizedName: EsnDirectoryService.normalize(entry.name),
      seedSource: entry.source,
    })).filter(row => row.normalizedName.length > 0)

    const result = await this.repo
      .createQueryBuilder()
      .insert()
      .into(EsnDirectoryEntity)
      .values(rows)
      .orIgnore()
      .execute()
    this.seeded = true
    return result.identifiers.filter(Boolean).length
  }

  /** Sème au premier besoin — le référentiel n'a pas à exister avant qu'on le lise. */
  async ensureSeeded(): Promise<void> {
    if (this.seeded) return
    const count = await this.repo.count()
    if (count === 0) await this.seed()
    this.seeded = true
  }

  /**
   * Résout un LOT de noms encore en attente, les plus anciens d'abord.
   *
   * Renvoie ce qui a été traité, pour que l'appelant puisse le journaliser. Une
   * panne de registre ne marque RIEN : le nom redevient `pending` et le lot
   * suivant réessaiera. Écrire « non résolue » sur une panne ferait cesser
   * d'essayer — c'est la faute que le tome 2 a déjà corrigée ailleurs.
   *
   * Le lot est RÉSERVÉ avant d'être traité (`resolving`) plutôt que protégé par
   * un verrou global : deux instances se partagent alors les 477 noms au lieu
   * de s'attendre, et une réservation abandonnée retombe d'elle-même au bout
   * d'une demi-heure.
   */
  async resolvePending(limit = 25): Promise<{ attempted: number; resolved: number }> {
    await this.ensureSeeded()
    const claimed = await this.repo.query(
      `UPDATE esn_directory
          SET resolution_status = 'resolving', updated_at = now()
        WHERE id IN (
          SELECT id FROM esn_directory
           WHERE resolution_status = 'pending'
              OR (resolution_status = 'resolving' AND updated_at < now() - interval '30 minutes')
           ORDER BY created_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING id, input_name AS "inputName"`,
      [Math.max(1, Math.min(limit, 50))],
    )
    // ⚠️ `returnedRows` et non `claimed[0]` : TypeORM rend `[lignes, nombre]`
    // sur un UPDATE, et lire à la main donnerait un tableau « truthy » dont
    // chaque champ vaut `undefined` (leçon de la recette du 21/08).
    const pending = returnedRows<{ id: string; inputName: string }>(claimed)
    if (pending.length === 0) return { attempted: 0, resolved: 0 }

    const response = await this.ia.esnResolve({ names: pending.map(row => row.inputName) })
    const byName = new Map(response.entries.map(entry => [entry.inputName, entry]))
    let resolved = 0

    for (const row of pending) {
      const entry = byName.get(row.inputName)
      if (!entry || entry.status === 'pending') {
        // Panne de registre : le nom REDEVIENT disponible. Le laisser en
        // « en cours » le gèlerait une demi-heure pour rien.
        await this.repo.update(row.id, { resolutionStatus: 'pending' })
        continue
      }
      const patch: QueryDeepPartialEntity<EsnDirectoryEntity> = {
        resolutionStatus: entry.status,
        resolutionReason: entry.reason ?? null,
      }
      if (entry.status === 'resolved') {
        Object.assign(patch, {
          siren: entry.siren ?? null,
          legalName: entry.legalName ?? null,
          nafCode: entry.nafCode ?? null,
          sizeClass: entry.sizeClass ?? null,
          headcountTranche: entry.headcountTranche ?? null,
          headcountRange: entry.headcountRange ?? null,
          establishmentCount: entry.establishmentCount ?? null,
          createdOn: entry.creationDate ?? null,
          headquartersCity: entry.city ?? null,
          headquartersDepartment: entry.department ?? null,
          resolvedAt: new Date(),
        })
        resolved++
      }
      // Un SIREN déjà pris par une autre ligne : deux noms du fichier désignent
      // la même société. On garde la première et on le DIT, plutôt que de faire
      // tomber le lot sur une contrainte d'unicité.
      try {
        await this.repo.update(row.id, patch)
        // #3921.b — la tranche lue AUJOURD'HUI devient un RELEVÉ daté : sans
        // historique, « effectif en hausse » n'avait rien à comparer (la
        // colonne `headcount_tranche` est écrasée à chaque résolution).
        if (entry.status === 'resolved' && entry.siren && entry.headcountTranche) {
          await this.recordHeadcountReading(entry.siren, entry.headcountTranche)
        }
      } catch (error) {
        this.logger.warn(`ESN « ${row.inputName} » non enregistrée : ${(error as Error).message}`)
        await this.repo.update(row.id, {
          resolutionStatus: 'ambiguous',
          resolutionReason: `SIREN ${entry.siren ?? '?'} déjà porté par une autre entrée du référentiel.`,
        })
      }
    }
    return { attempted: pending.length, resolved }
  }

  /**
   * Étage 2 — rattache les entités dont le NOM trahit un parent présent dans le
   * référentiel. Toujours `inferred` : un pattern de nom ne prouve rien, et
   * « Accenture Song » n'est pas une agence d'Accenture.
   */
  async applyHierarchy(): Promise<number> {
    const all = await this.repo.find({ select: ['id', 'inputName', 'siren', 'parentName'] })
    const names = all.map(row => row.inputName)
    const bySiren = new Map(all.filter(row => row.siren).map(row => [row.inputName, row.siren as string]))
    let linked = 0
    for (const row of all) {
      const guess = hierarchyFromName(row.inputName, names)
      if (!guess || row.parentName === guess.parentName) continue
      await this.repo.update(row.id, {
        parentName: guess.parentName,
        parentSiren: bySiren.get(guess.parentName) ?? null,
        relationToParent: guess.relation,
        hierarchyConfidence: guess.confidence,
        hierarchyEvidence: guess.evidence,
      })
      linked++
    }
    return linked
  }

  /**
   * Les noms normalisés de TOUTES les entrées du référentiel, résolues ou non.
   *
   * Non résolues comprises, délibérément : une ESN dont on n'a pas trouvé le
   * SIREN reste une ESN, et l'écarter d'ici la ferait compter comme un client
   * final dans le retournement — c'est-à-dire au mauvais endroit exactement.
   */
  async knownNames(): Promise<string[]> {
    const rows = await this.repo.find({ select: ['normalizedName'] })
    return rows.map(row => row.normalizedName)
  }

  /** Ce que la couverture vaut RÉELLEMENT — le chiffre que l'écran affiche. */
  async coverage(): Promise<{ total: number; resolved: number; byStatus: Record<string, number> }> {
    const rows = await this.repo
      .createQueryBuilder('e')
      .select('e.resolution_status', 'status')
      .addSelect('count(*)::int', 'count')
      .groupBy('e.resolution_status')
      .getRawMany<{ status: string; count: number }>()
    const byStatus = Object.fromEntries(rows.map(row => [row.status, row.count]))
    const total = rows.reduce((sum, row) => sum + row.count, 0)
    return { total, resolved: byStatus.resolved ?? 0, byStatus }
  }

  /**
   * Ce que le référentiel sait des ESN nommées — indexé par nom normalisé.
   *
   * C'est ce qui permet au contrôleur de poser un score de débordement sur les
   * ESN que l'écran Territoire a repérées : leur drapeau de risque, leur
   * ouverture déclarée, et leur moyenne de recrutement quand elle existe.
   */
  /**
   * #3921.b — un relevé d'effectif daté (une ligne par SIREN et par jour, table
   * partagée `sirene_snapshots`). Un relevé déjà posé le même jour par la veille
   * des registres garde SA tranche : une mesure ne s'écrase pas par une autre.
   * Best-effort : la résolution est déjà écrite.
   */
  private async recordHeadcountReading(siren: string, headcountTranche: string): Promise<void> {
    try {
      await this.repo.query(
        `INSERT INTO sirene_snapshots (siren, observed_on, source, headcount_range)
         VALUES ($1, (now() AT TIME ZONE 'Europe/Paris')::date, 'esn_directory', $2)
         ON CONFLICT (siren, observed_on) DO UPDATE
           SET headcount_range = COALESCE(sirene_snapshots.headcount_range, EXCLUDED.headcount_range)`,
        [siren, headcountTranche],
      )
    } catch (error) {
      this.logger.warn(`Relevé d'effectif non enregistré pour ${siren} : ${(error as Error).message}`)
    }
  }

  /**
   * #3921.b — les relevés d'effectif MESURÉS de plusieurs SIREN, pour que
   * `headcountGrowing` repose sur deux points (`headcountGrowingFromReadings`).
   */
  async headcountHistoryBySiren(sirens: readonly string[]): Promise<Map<string, HeadcountReading[]>> {
    const clean = [...new Set(sirens.filter(s => /^\d{9}$/.test(s ?? '')))]
    const out = new Map<string, HeadcountReading[]>()
    if (clean.length === 0) return out
    const rows = await this.repo.query<{ siren: string; observed_on: string | Date; headcount_range: string | null }[]>(
      `SELECT siren, observed_on, headcount_range FROM sirene_snapshots
        WHERE siren = ANY($1::text[]) AND headcount_range IS NOT NULL
        ORDER BY observed_on ASC`,
      [clean],
    )
    for (const row of rows) {
      const observedOn =
        row.observed_on instanceof Date
          ? row.observed_on.toISOString().slice(0, 10)
          : String(row.observed_on).slice(0, 10)
      out.set(row.siren, [...(out.get(row.siren) ?? []), { observedOn, headcountRange: row.headcount_range }])
    }
    return out
  }

  /**
   * #3921.8 — pour chaque SIREN : les jours où un relevé d'établissements a été gardé, et les ouvertures datées par
   * le registre (`new_establishment`). Alimenté par la relecture nocturne ; `newEstablishmentFromReadings` en tire
   * le signal (deux relevés au moins, sinon non mesuré).
   */
  async establishmentSignalsBySiren(
    sirens: readonly string[],
  ): Promise<Map<string, { readingDays: string[]; openingDays: string[] }>> {
    const clean = [...new Set(sirens.filter(s => /^\d{9}$/.test(s ?? '')))]
    const out = new Map<string, { readingDays: string[]; openingDays: string[] }>()
    if (clean.length === 0) return out
    const day = (value: string | Date): string =>
      value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
    const readings = await this.repo.query<{ siren: string; observed_on: string | Date }[]>(
      `SELECT siren, observed_on FROM sirene_snapshots
        WHERE siren = ANY($1::text[]) AND establishments IS NOT NULL
        ORDER BY observed_on ASC`,
      [clean],
    )
    const openings = await this.repo.query<{ siren: string; published_on: string | Date }[]>(
      `SELECT siren, published_on FROM public_registry_announcements
        WHERE siren = ANY($1::text[]) AND source = 'sirene' AND kind = 'new_establishment'
        ORDER BY published_on ASC`,
      [clean],
    )
    const entry = (siren: string) => {
      const existing = out.get(siren)
      if (existing) return existing
      const created = { readingDays: [] as string[], openingDays: [] as string[] }
      out.set(siren, created)
      return created
    }
    for (const row of readings) entry(row.siren).readingDays.push(day(row.observed_on))
    for (const row of openings) entry(row.siren).openingDays.push(day(row.published_on))
    return out
  }

  async factsByName(names: string[]): Promise<Map<string, EsnDirectoryEntity>> {
    if (names.length === 0) return new Map()
    const rows = await this.repo.find({ where: { normalizedName: In(names) } })
    return new Map(rows.map(row => [row.normalizedName, row]))
  }

  /**
   * #1887 — CE QUE LE RÉFÉRENTIEL PROPOSE POUR UNE SAISIE PARTIELLE.
   *
   * « je mets cap… ça nous met Capgemini et tout ». Le référentiel a 477 noms ;
   * jusqu'ici il fallait connaître l'orthographe exacte pour déclarer une ESN
   * en place sur un compte, et une faute de frappe créait une seconde entrée
   * qui ne rejoignait jamais la première.
   *
   * ⚠️ La comparaison se fait sur `normalized_name`, de part et d'autre, avec
   * la MÊME fonction (`esnSuggestNeedle` → `EsnDirectoryService.normalize`).
   * `ILIKE` aurait plié la casse mais PAS les accents — « Sogéti » n'aurait
   * alors jamais trouvé « Sogeti », et la liste aurait été vide sans jamais
   * échouer. Comme la frappe normalisée ne contient que `[a-z0-9 ]`, le motif
   * `LIKE` n'a rien à échapper.
   *
   * ⚠️ Aucune borne SQL : on charge TOUTES les lignes qui contiennent la
   * frappe, puis on classe, puis on coupe. Couper avant de classer laisserait
   * l'ordre de la table décider ce qui arrive en tête — c'est le défaut
   * « N sources concaténées puis tronquées », et ici il ferait disparaître
   * « Capgemini » derrière quatre de ses filiales. Le référentiel est une liste
   * SEMÉE, bornée par construction : la lecture reste de l'ordre de la centaine
   * de lignes.
   */
  async suggest(query: string, limit = ESN_SUGGEST_DEFAULT_LIMIT): Promise<EsnDirectorySuggestion[]> {
    const needle = esnSuggestNeedle(query)
    if (needle.length === 0) return []
    await this.ensureSeeded()
    const rows = await this.repo.find({ where: { normalizedName: Like(`%${needle}%`) } })
    return rankEsnSuggestions(rows, needle, limit)
  }

  /** Les ESN d'un département — la lecture que l'écran Territoire fait. */
  async byDepartment(department: string, limit = 100): Promise<EsnDirectoryEntity[]> {
    return this.repo.find({
      where: { headquartersDepartment: department },
      order: { inputName: 'ASC' },
      take: Math.max(1, Math.min(limit, 500)),
    })
  }

  /**
   * CE QUE LE RÉFÉRENTIEL SAIT D'UN DÉPARTEMENT — répartition par taille et par
   * rang, plus les lignes elles-mêmes.
   *
   * ⚠️ Population DIFFÉRENTE de `competition.esnPresent` de l'écran Territoire,
   * et les deux ne s'additionnent ni ne se divisent :
   *  · `esnPresent` compte au registre PUBLIC les établissements d'au moins
   *    trois salariés en code NAF d'ESN dont le siège est dans le département ;
   *  · ceci compte les lignes de NOTRE référentiel (477 noms nationaux) dont le
   *    siège RÉSOLU tombe dans ce département. Il en manque forcément — d'où
   *    `resolved / total`, qui accompagne le chiffre partout où il s'affiche.
   *
   * ⚠️ Le CALCUL vit dans `territory-esn-breakdown.ts`, et pas ici : ce fichier
   * est l'un des deux ÉCRIVAINS de `esn_directory`, et GA — la garde
   * `unwritten-columns.spec.ts` — lit toute clé d'objet en position
   * d'affectation comme une écriture. Une simple RECOPIE de `riskFlag` vers une
   * réponse HTTP y ressemblait donc à un écrivain, et la garde annonçait qu'une
   * colonne déclarée « sans source » venait d'en trouver une. La garde a raison
   * de ne pas savoir distinguer les deux ; c'est au code de ne pas mélanger la
   * lecture et l'écriture dans le même fichier.
   */
  async departmentBreakdown(department: string, limit = 60): Promise<EsnDepartmentBreakdown> {
    const rows = await this.repo.find({
      where: { headquartersDepartment: department },
      order: { inputName: 'ASC' },
    })
    return esnDepartmentBreakdown(rows, limit)
  }

  /**
   * Un espace déclare si une ESN du référentiel accepte le rang 2 (N16, §16.8).
   *
   * La déclaration atterrit dans `esn_subcontracting_declarations` — table
   * SCOPÉE, jamais lue par un autre espace directement (D589). Toujours
   * possible, même sous le seuil de mutualisation : elle appartient à l'espace
   * qui la fait, indépendamment de ce qu'elle change pour les autres. C'est un
   * UPSERT — une correction humaine gagne toujours, elle ne s'accumule pas en
   * une seconde ligne qui ferait hésiter le décompte des espaces distincts.
   *
   * Après l'écriture, l'agrégat de CETTE ESN est recalculé et, s'il atteint le
   * seuil, promu dans `esn_directory` — la seule colonne que les autres
   * espaces lisent.
   */
  async declareSubcontracting(
    workspaceId: string,
    esnName: string,
    input: { value: EsnSubcontractingDeclarable; confidence: EsnSubcontractingConfidence; evidence: string | null },
  ): Promise<EsnSubcontractingDeclarationResult> {
    const normalized = EsnDirectoryService.normalize(esnName)
    const esn = await this.repo.findOne({ where: { normalizedName: normalized }, select: { id: true } })
    if (!esn) {
      throw new NotFoundException(`Aucune ESN ne correspond à « ${esnName} » dans le référentiel.`)
    }

    await this.repo.query(
      `INSERT INTO esn_subcontracting_declarations
         (workspace_id, esn_directory_id, value, confidence, evidence, declared_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now(), now())
       ON CONFLICT (workspace_id, esn_directory_id)
       DO UPDATE SET value = EXCLUDED.value, confidence = EXCLUDED.confidence, evidence = EXCLUDED.evidence,
                      declared_at = now(), updated_at = now()`,
      [workspaceId, esn.id, input.value, input.confidence, input.evidence],
    )

    const aggregate = await this.recomputeSubcontractingAggregate(esn.id)
    return { esnId: esn.id, recorded: true, aggregate }
  }

  /**
   * Recalcule l'agrégat d'UNE ESN et le promeut, ou le retire.
   *
   * D593 : seules les déclarations d'un espace qui a activé
   * `community_data_sharing` comptent dans le seuil — le même interrupteur que
   * le reste du mécanisme communautaire (`account-access.service.ts`), pas un
   * second qu'on aurait inventé pour ce chantier.
   *
   * Quand l'agrégat n'atteint plus le seuil — trop peu d'espaces, ou une
   * divergence apparue — `esn_directory` REDEVIENT `inconnu` : un consensus
   * qui se défait n'est pas un fait qui persiste par défaut.
   */
  private async recomputeSubcontractingAggregate(
    esnId: string,
  ): Promise<EsnSubcontractingDeclarationResult['aggregate']> {
    const declared = (await this.repo.query(
      `SELECT workspace_id AS "workspaceId", value, confidence
         FROM esn_subcontracting_declarations
        WHERE esn_directory_id = $1`,
      [esnId],
    )) as { workspaceId: string; value: EsnSubcontractingDeclarable; confidence: EsnSubcontractingConfidence }[]

    const workspaceIds = [...new Set(declared.map(row => row.workspaceId))]
    const sharing =
      workspaceIds.length === 0
        ? []
        : ((await this.repo.query(
            `SELECT id FROM workspaces WHERE community_data_sharing = true AND id = ANY($1::uuid[])`,
            [workspaceIds],
          )) as { id: string }[])
    const sharingIds = new Set(sharing.map(row => row.id))
    const counted = declared.filter(row => sharingIds.has(row.workspaceId))

    const aggregate = subcontractingAggregate(counted)

    if (!aggregate) {
      await this.repo.query(
        `UPDATE esn_directory
            SET open_to_subcontracting = 'inconnu',
                subcontracting_confidence = NULL,
                subcontracting_evidence = NULL,
                subcontracting_declared_at = NULL,
                subcontracting_sources_count = 0
          WHERE id = $1`,
        [esnId],
      )
      return null
    }

    // ⚠️ Jamais le texte LIBRE d'une déclaration individuelle : deux espaces
    // concurrents ne doivent pas pouvoir se relire à travers un fait de
    // marché. Seul un décompte anonyme traverse (D589 — l'anonymat).
    await this.repo.query(
      `UPDATE esn_directory
          SET open_to_subcontracting = $2,
              subcontracting_confidence = $3,
              subcontracting_evidence = $4,
              subcontracting_declared_at = current_date,
              subcontracting_sources_count = $5
        WHERE id = $1`,
      [
        esnId,
        aggregate.value,
        aggregate.confidence,
        `Confirmé par ${aggregate.sourcesCount} espaces indépendants.`,
        aggregate.sourcesCount,
      ],
    )
    return {
      openToSubcontracting: aggregate.value,
      subcontractingConfidence: aggregate.confidence,
      subcontractingSourcesCount: aggregate.sourcesCount,
    }
  }
}
