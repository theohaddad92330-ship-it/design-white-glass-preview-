import { Injectable, Logger, Optional } from '@nestjs/common'
import {
  esnRisk,
  isSignalArchived,
  INSEE_HEADCOUNT_TRANCHE_LABELS,
  publicExposureFromAwards,
  REGISTRY_ANNOUNCEMENT_KINDS,
} from '@bellum/contracts'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  PublicRegistryAnnouncementEntity,
  PublicRegistryWatchStateEntity,
  SireneSnapshotEntity,
} from '../../database/entities/public-registry.entity'
import { EsnDirectoryEntity } from '../../database/entities/esn-directory.entity'
import { IaClient } from '../ia/ia.client'
import { bodaccWindow, parisDay, publicAwardsRefreshDays, type RegistrySignalRow } from './watchlist-refresh.queue'
import { latestEstablishmentsReading, latestHeadcountReading, writeDailyReading } from './sirene-snapshots'

/** Ce qu'un passage de collecte a fait — et surtout s'il a PU le faire. */
type CollectOutcome = {
  /** Aucun passage antérieur : l'historique lu ne doit rien faire sonner. */
  firstPass: boolean
  /** La source n'a pas répondu : le curseur n'a PAS bougé. */
  failed: boolean
  /** Annonces envoyées à l'écriture (les déjà connues sont ignorées en base). */
  written: number
}

/** Au-delà, la fiche n'a plus rien à gagner — et la requête resterait bornée. */
const MAX_ROWS_PER_SIREN = 500

/**
 * #3916.a — la lecture CONTINUE des registres publics pour un SIREN suivi.
 *
 * Avant ce lot, BODACC n'était lu qu'à l'analyse (les 8 dernières annonces,
 * figées jusqu'au rejeu suivant). Le job `registry` de la veille appelle
 * {@link collectBodacc} chaque jour pour chaque SIREN d'un compte suivi — et
 * jamais pour le reste du parc (le scheduler ne choisit que les comptes suivis).
 *
 * Rien ici ne décide de ce qui est NEUF ni de qui prévenir : c'est le worker
 * qui compare l'avant et l'après sur toutes les sources (#3920.a).
 */
@Injectable()
export class PublicRegistryWatch {
  private readonly logger = new Logger(PublicRegistryWatch.name)

  constructor(
    @InjectRepository(PublicRegistryAnnouncementEntity)
    private readonly announcements: Repository<PublicRegistryAnnouncementEntity>,
    @InjectRepository(PublicRegistryWatchStateEntity)
    private readonly state: Repository<PublicRegistryWatchStateEntity>,
    private readonly ia: IaClient,
    // #3916.b — le référentiel ESN, pour que la procédure collective y arme
    // enfin le refus PAR-04/S12. En dernier, optionnel : absent = rien écrit.
    @Optional()
    @InjectRepository(EsnDirectoryEntity)
    private readonly esnDirectory?: Repository<EsnDirectoryEntity>,
    // #3921.a — le relevé Sirene du jour. Même règle : en dernier, optionnel.
    @Optional()
    @InjectRepository(SireneSnapshotEntity)
    private readonly snapshots?: Repository<SireneSnapshotEntity>,
  ) {}

  /** Les annonces connues d'un SIREN, les plus récentes d'abord. */
  async rowsFor(siren: string): Promise<RegistrySignalRow[]> {
    return this.announcements.find({
      where: { siren },
      order: { published_on: 'DESC' },
      take: MAX_ROWS_PER_SIREN,
    })
  }

  /**
   * Lit BODACC depuis le dernier jour lu (24 mois au premier passage) et écrit
   * chaque annonce une seule fois. #3921.2 — une annonce déjà rangée `modification`
   * qu'on reconnaît désormais comme changement de dirigeant est requalifiée (rattrapage) ;
   * #3916 (15/10) — une annonce rangée SANS lien reçoit le lien de la relecture
   * (`COALESCE` : un lien déjà posé n'est jamais remplacé) ; rien d'autre n'est jamais réécrit. Une panne laisse le curseur où il était :
   * le passage de demain relira la même fenêtre, rien n'est perdu.
   */
  async collectBodacc(siren: string, now: Date = new Date()): Promise<CollectOutcome> {
    const previous = await this.state.findOne({ where: { siren } })
    const firstPass = !previous?.bodacc_through
    const window = bodaccWindow(previous?.bodacc_through ?? null, parisDay(now))

    let reading: Awaited<ReturnType<IaClient['publicRegistryBodacc']>> | null = null
    try {
      reading = await this.ia.publicRegistryBodacc({ siren, ...window })
    } catch (err) {
      this.logger.warn('Lecture BODACC en échec — curseur inchangé', {
        siren,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    if (!reading || reading.failed) return { firstPass, failed: true, written: 0 }

    const rows = (reading.announcements ?? []).filter(a => a?.ref?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(a?.date ?? ''))
    if (rows.length > 0) {
      const params: unknown[] = []
      const tuples = rows.map(a => {
        const at = params.length
        params.push(
          siren,
          'bodacc',
          a.ref.trim(),
          a.kind || 'other',
          a.type ?? null,
          a.label ?? null,
          a.date,
          a.url ?? null,
          a.tribunal ?? null,
        )
        return `($${at + 1}, $${at + 2}, $${at + 3}, $${at + 4}, $${at + 5}, $${at + 6}, $${at + 7}::date, $${at + 8}, $${at + 9})`
      })
      await this.announcements.query(
        `INSERT INTO public_registry_announcements
           (siren, source, ref, kind, family_label, label, published_on, url, tribunal)
         VALUES ${tuples.join(', ')}
         ON CONFLICT (source, siren, ref) DO UPDATE
           SET kind = CASE
                 WHEN public_registry_announcements.kind = 'modification' AND EXCLUDED.kind = 'executive_change'
                 THEN EXCLUDED.kind ELSE public_registry_announcements.kind END,
               family_label = CASE
                 WHEN public_registry_announcements.kind = 'modification' AND EXCLUDED.kind = 'executive_change'
                 THEN EXCLUDED.family_label ELSE public_registry_announcements.family_label END,
               url = COALESCE(public_registry_announcements.url, EXCLUDED.url)
         WHERE (public_registry_announcements.kind = 'modification' AND EXCLUDED.kind = 'executive_change')
            OR (public_registry_announcements.url IS NULL AND EXCLUDED.url IS NOT NULL)`,
        params,
      )
    }

    await this.state.upsert(
      {
        siren,
        bodacc_through: window.until,
        bodacc_checked_at: now,
        // Le plafond d'offset de la source a mordu : la fiche le DIT plutôt
        // que de laisser croire qu'elle a tout.
        bodacc_truncated: reading.truncated === true,
      },
      ['siren'],
    )
    return { firstPass, failed: false, written: rows.length }
  }

  /**
   * #3920.8 — les marchés publics ATTRIBUÉS du compte, lus chaque jour (jusqu'ici
   * Découvrir seul les lisait : le diff de la veille ne voyait un marché que déjà
   * figé à l'analyse). Écrit une fois par marché (`DO NOTHING`), daté par la
   * notification du marché ; jamais un lien ni un titulaire devinés.
   *
   * Une panne n'écrit rien ET ne fixe pas le curseur : le premier passage (qui
   * ne sonne pas, c'est de l'historique) reste à faire plutôt que d'être consommé
   * par un vide qui cache une erreur.
   */
  async collectAwards(
    siren: string,
    name: string,
    now: Date = new Date(),
    // LUD.1 — les packs NON-IT des espaces qui suivent ce SIREN : chacun relit les marchés de SON domaine
    // (en plus de la lecture IT d'avant, inchangée). Vide = un seul appel, corps identique à avant.
    packs: readonly string[] = [],
  ): Promise<CollectOutcome> {
    const previous = await this.state.findOne({ where: { siren } })
    const firstPass = !previous?.awards_checked_at
    // #3915.decp — cache 30 j PAR SIREN, partagé entre espaces : un SIREN relu il y a
    // moins de `PUBLIC_AWARDS_REFRESH_DAYS` jours (pour n'importe quel espace) ne
    // rappelle pas la source. Rien de neuf, rien d'écrit — pas une panne.
    const checkedAt = previous?.awards_checked_at ? new Date(previous.awards_checked_at).getTime() : null
    if (checkedAt !== null && now.getTime() - checkedAt < publicAwardsRefreshDays() * 86_400_000) {
      return { firstPass: false, failed: false, written: 0 }
    }
    let reading: Awaited<ReturnType<IaClient['publicRegistryAwards']>> | null = null
    try {
      reading = await this.ia.publicRegistryAwards({ siren, name })
      // LUD.1 — une lecture de plus par pack non-IT ; les marchés se réunissent (même `ref` = une ligne).
      for (const pack of packs) {
        if (!reading || reading.failed || reading.deferred) break
        const extra = await this.ia.publicRegistryAwards({ siren, name, pack })
        if (extra.failed || extra.deferred) {
          reading = extra
          break
        }
        reading = { ...reading, awards: [...(reading.awards ?? []), ...(extra.awards ?? [])] }
      }
    } catch (err) {
      this.logger.warn('Lecture des marchés attribués en échec — curseur inchangé', {
        siren,
        error: err instanceof Error ? err.message || err.name : String(err),
      })
    }
    // #3915.decp — l'attente de NOTRE limiteur n'est pas une panne : rien d'écrit,
    // curseur inchangé (le passage suivant relit), et jamais compté comme `failed`.
    if (reading?.deferred) return { firstPass, failed: false, written: 0 }
    if (!reading || reading.failed) {
      if (reading?.failed) {
        this.logger.warn('Marchés attribués : la source n’a pas répondu — curseur inchangé', {
          siren,
          reason: reading.reason || 'raison non transmise',
        })
      }
      return { firstPass, failed: true, written: 0 }
    }

    const rows = (reading.awards ?? []).filter(a => a?.ref?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(a?.date ?? ''))
    for (const a of rows) {
      // #3915.decp — le compte ACHETEUR (`award`) : la partie d'en face est le titulaire ;
      // le compte TITULAIRE (`award_won`) : c'est l'acheteur. Jamais un nom deviné.
      const won = a.role === 'titulaire'
      await this.announcements.query(
        `INSERT INTO public_registry_announcements
           (siren, source, ref, kind, family_label, label, published_on, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8)
         ON CONFLICT (source, siren, ref) DO NOTHING`,
        [
          siren,
          'decp',
          a.ref.trim(),
          won ? 'award_won' : 'award',
          a.label || null,
          (won ? a.buyer : a.winner) ?? null,
          a.date,
          a.url ?? null,
        ],
      )
    }
    await this.state.upsert({ siren, awards_checked_at: now }, ['siren'])
    return { firstPass, failed: false, written: rows.length }
  }

  /**
   * #3921.9 — les événements du registre national des entreprises (RNE) : changement de
   * dirigeant, ouverture et fermeture d'établissement, datés PAR le registre. Même forme
   * (fait daté et typé), même dédoublonnage `(source, siren, ref)` que BODACC / Sirene / DECP.
   * Un site déjà lu par Sirene (même SIRET) n'est pas écrit une seconde fois.
   *
   * Sans identifiants : no-op strict, rien n'est écrit ni curseur fixé. Une panne n'écrit
   * rien ET ne fixe pas le curseur (le premier passage ne sonne pas : un vide qui cache une
   * erreur ne doit pas le consommer). Minimisation : l'IA ne rend du dirigeant que nom,
   * prénoms, rôle et date d'effet — rien d'autre n'existe ici à stocker.
   */
  async collectRne(
    siren: string,
    now: Date = new Date(),
  ): Promise<{ configured: boolean; firstPass: boolean; failed: boolean; written: number }> {
    const previous = await this.state.findOne({ where: { siren } })
    const firstPass = !previous?.rne_checked_at
    let reading: Awaited<ReturnType<IaClient['publicRegistryRne']>> | null = null
    try {
      reading = await this.ia.publicRegistryRne({ siren })
    } catch (err) {
      this.logger.warn('Lecture des événements du registre national en échec — curseur inchangé', {
        siren,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    if (!reading) return { configured: true, firstPass, failed: true, written: 0 }
    if (!reading.configured) return { configured: false, firstPass, failed: false, written: 0 }
    if (reading.failed) return { configured: true, firstPass, failed: true, written: 0 }

    const kinds = new Set<string>(REGISTRY_ANNOUNCEMENT_KINDS)
    const rows = (reading.events ?? []).filter(
      e => e?.ref?.trim() && kinds.has(e.kind) && /^\d{4}-\d{2}-\d{2}$/.test(e?.date ?? ''),
    )
    for (const e of rows) {
      await this.announcements.query(
        `INSERT INTO public_registry_announcements
           (siren, source, ref, kind, family_label, published_on, url)
         SELECT $1, $2, $3, $4, $5, $6::date, $7
          WHERE NOT EXISTS (
            SELECT 1 FROM public_registry_announcements
             WHERE siren = $1 AND source = 'sirene' AND kind = $4 AND ref = $3)
         ON CONFLICT (source, siren, ref) DO NOTHING`,
        [siren, 'rne', e.ref.trim(), e.kind, e.label || null, e.date, e.url || null],
      )
    }
    await this.state.upsert({ siren, rne_checked_at: now }, ['siren'])
    return { configured: true, firstPass, failed: false, written: rows.length }
  }

  /**
   * #3916.b — `esn_directory` : une procédure collective publiée au BODACC pour
   * le SIREN d'une ESN du référentiel pose `alerte` (S12, PAR-04 — « une ESN en
   * procédure ne se propose pas comme partenaire »), via `esnRisk`, LE producteur.
   *
   * Seule une PREUVE écrit. L'absence de procédure n'écrit rien : poser
   * `aucun` + une date de vérification affirmerait « vérifié, aucun risque »
   * alors que l'effectif et la direction ne sont pas lus (`esnRisk`, docblock).
   * Réversible : une alerte posée par BODACC dont la procédure est périmée
   * (`isSignalArchived`, 24 mois) est levée — le drapeau se recalcule.
   */
  async syncEsnRisk(siren: string, now: Date = new Date()): Promise<'alerte' | 'aucun' | null> {
    if (!this.esnDirectory) return null
    const esn = await this.esnDirectory.findOne({ where: { siren } })
    if (!esn) return null
    const proceeding = await this.announcements.findOne({
      where: { siren, kind: 'collective_proceeding' },
      order: { published_on: 'DESC' },
    })
    const current = proceeding && !isSignalArchived({ freshness: null, date: proceeding.published_on }, now.getTime())
    if (proceeding && current) {
      const risk = esnRisk({
        collectiveProceeding: {
          date: proceeding.published_on,
          label: proceeding.family_label || 'Procédure collective',
        },
      })
      await this.esnDirectory.update(esn.id, { riskFlag: risk.flag, riskEvidence: risk.evidence, riskCheckedAt: now })
      return 'alerte'
    }
    if (esn.riskFlag === 'alerte' && (esn.riskEvidence ?? '').includes('BODACC')) {
      await this.esnDirectory.update(esn.id, { riskFlag: 'aucun', riskEvidence: null, riskCheckedAt: now })
      return 'aucun'
    }
    return null
  }

  /**
   * #3921.10 (décision Louis 16/10/2026) — `esn_directory.public_awards` compte les marchés publics
   * GAGNÉS par l'ESN (rôle TITULAIRE, source DECP) ; l'acheteur reste un signal côté fiche compte,
   * hors de cette colonne. Écrit la liste ET la date de lecture (`awards_refreshed_at`).
   *
   * Une panne n'écrit RIEN : « non mesuré » n'est jamais « 0 ». Une lecture réussie sans marché
   * écrit une liste vide DATÉE — mesuré à zéro. Un SIREN absent du référentiel : aucun appel.
   * Rend le nombre de marchés écrits, ou `null` quand rien n'a été écrit.
   */
  async syncEsnAwards(siren: string, now: Date = new Date()): Promise<number | null> {
    if (!this.esnDirectory) return null
    const esn = await this.esnDirectory.findOne({ where: { siren } })
    if (!esn) return null
    let reading: Awaited<ReturnType<IaClient['publicRegistryAwardsWon']>> | null = null
    try {
      reading = await this.ia.publicRegistryAwardsWon({ siren })
    } catch (err) {
      this.logger.warn('Lecture des marchés gagnés en échec — rien écrit', {
        siren,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    if (!reading || reading.failed) return null
    const awards = (reading.awards ?? []).filter(a => a?.ref?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(a?.date ?? ''))
    // #3921.12 — l'exposition à la commande publique (24 mois) est dérivée des mêmes marchés.
    const publicExposure = publicExposureFromAwards(awards, now, now)
    await this.esnDirectory.update(esn.id, { publicAwards: awards, publicExposure, awardsRefreshedAt: now })
    return awards.length
  }

  /**
   * #3921.a — le relevé Sirene du jour pour un SIREN suivi, comparé à celui
   * d'hier par `new_establishments()` (IA). Chaque ouverture devient une annonce
   * `sirene` / `new_establishment`, datée par le registre (jamais par nous) et
   * liée à sa page officielle ; le relevé (établissements + tranche d'effectif,
   * #3921.b) est stocké pour demain.
   *
   * Sans clé INSEE : no-op strict, rien n'est écrit. Une panne n'écrit JAMAIS
   * un relevé vide : demain comparerait à « aucun site » et raterait l'ouverture.
   *
   * #3921 (décision Louis 13/10/2026) — entre deux tranches d'effectif MESURÉES
   * (jamais sur un seul point), une tranche différente devient un signal
   * `headcount_change`, daté par NOTRE jour d'observation (la source ne porte
   * aucune date de fait) : le libellé le DIT (« observé », jamais « changé »).
   */
  async collectSirene(
    siren: string,
    now: Date = new Date(),
  ): Promise<{ configured: boolean; failed: boolean; openings: number }> {
    if (!this.snapshots) return { configured: false, failed: false, openings: 0 }
    const previous = await latestEstablishmentsReading(this.snapshots, siren)
    const previousHeadcount = await latestHeadcountReading(this.snapshots, siren)

    let reading: Awaited<ReturnType<IaClient['publicRegistrySirene']>> | null = null
    try {
      reading = await this.ia.publicRegistrySirene({ siren, previous })
    } catch (err) {
      this.logger.warn('Relevé Sirene en échec — rien écrit', {
        siren,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    if (!reading) return { configured: true, failed: true, openings: 0 }
    if (!reading.configured) return { configured: false, failed: false, openings: 0 }
    if (reading.failed) return { configured: true, failed: true, openings: 0 }

    const day = parisDay(now)
    await writeDailyReading(this.snapshots, {
      siren,
      day,
      headcountRange: reading.headcountRange ?? null,
      list: reading.establishments ?? [],
    })

    const openings = (reading.openings ?? []).filter(o => o?.siret && /^\d{4}-\d{2}-\d{2}$/.test(o?.date ?? ''))
    for (const opening of openings) {
      await this.announcements.query(
        `INSERT INTO public_registry_announcements
           (siren, source, ref, kind, family_label, published_on, url)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7)
         ON CONFLICT (source, siren, ref) DO NOTHING`,
        [siren, 'sirene', opening.siret, 'new_establishment', opening.label || null, opening.date, opening.url || null],
      )
    }

    const headcountRange = reading.headcountRange ?? null
    const headcountLabel = headcountRange ? INSEE_HEADCOUNT_TRANCHE_LABELS[headcountRange] : undefined
    if (headcountLabel && previousHeadcount && previousHeadcount.headcountRange !== headcountRange) {
      await this.announcements.query(
        `INSERT INTO public_registry_announcements
           (siren, source, ref, kind, family_label, published_on, url)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7)
         ON CONFLICT (source, siren, ref) DO NOTHING`,
        [
          siren,
          'sirene',
          `headcount:${day}`,
          'headcount_change',
          `Effectif observé — ${headcountLabel}`,
          day,
          // R17 15/10 (#3921) — l'URL porte le JOUR d'observation : la veille déduplique ses signaux par URL,
          // et une page d'entreprise identique pour chaque changement aurait fait taire tous ceux d'après le premier.
          `https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}#effectif-${day}`,
        ],
      )
    }

    await this.state.upsert({ siren, sirene_checked_at: now }, ['siren'])
    return { configured: true, failed: false, openings: openings.length }
  }
}
