import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  buildExternalSourcingPartnerBriefMessage,
  rankExternalSourcingCandidates,
  resolveExternalSourcingVolume,
  type ExternalSourcingCandidate,
  type ExternalSourcingImportInput,
  type ExternalSourcingImportResult,
  type ExternalSourcingOrigin,
  type ExternalSourcingPartnerBrief,
  type ExternalSourcingPartnerBriefFeedbackInput,
  type ExternalSourcingPartnerBriefPrepareInput,
  type ExternalSourcingSearchResult,
  type RequiredSkill,
} from '@bellum/contracts'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ExternalSourcingPartnerBriefEntity } from '../../database/entities/external-sourcing-partner-brief.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import {
  CsvAtsImportSourcingProvider,
  InboundCandidacySourcingProvider,
  NetworkReferralSourcingProvider,
  ExternalDirectoryProvider,
  PartnerBenchSourcingProvider,
  type ExternalSourcingProvider,
} from './external-sourcing-provider'

type NeedReferenceRow = { skills: RequiredSkill[] | null; title: string; headcount: number }

function toPartnerBrief(row: ExternalSourcingPartnerBriefEntity): ExternalSourcingPartnerBrief {
  return {
    id: row.id,
    needId: row.need_id,
    partnerName: row.partner_name,
    message: row.message,
    conditions: row.conditions,
    delay: row.delay,
    feedback: row.feedback,
    nonSolicitation: true,
    preparedAt: row.prepared_at.toISOString(),
    feedbackRecordedAt: row.feedback_recorded_at?.toISOString() ?? null,
  }
}

/**
 * #2818 — le SYSTÈME de sourcing externe, côté service.
 *
 * Voir le docblock de `external-sourcing.ts` (`@bellum/contracts`) pour la
 * décision produit, et celui de `external-sourcing-provider.ts` pour le port.
 * Lecture seule sur `search`, aucun crédit — même discipline que
 * `OpenNeedsService.findReverseProspects`, dont cette méthode reprend le
 * patron (lire le besoin, dire pourquoi le croisement ne peut pas tourner
 * plutôt que rendre une liste au hasard).
 */
@Injectable()
export class ExternalSourcingService {
  private readonly logger = new Logger(ExternalSourcingService.name)
  private readonly providers: readonly ExternalSourcingProvider[]

  constructor(
    @InjectRepository(ConsultantEntity)
    private readonly consultants: Repository<ConsultantEntity>,
    @InjectRepository(ProjectNeedEntity)
    private readonly needs: Repository<ProjectNeedEntity>,
    @InjectRepository(ExternalSourcingPartnerBriefEntity)
    private readonly partnerBriefs: Repository<ExternalSourcingPartnerBriefEntity>,
  ) {
    this.providers = [
      new NetworkReferralSourcingProvider(this.consultants),
      new PartnerBenchSourcingProvider(this.consultants),
      new InboundCandidacySourcingProvider(this.consultants),
      new CsvAtsImportSourcingProvider(this.consultants),
      new ExternalDirectoryProvider(process.env['APOLLO_API_KEY'] ?? ''),
    ]
  }

  /** `null` = besoin introuvable dans cet espace — le contrôleur en fait un 404.
   *  `maxPerSource` : le volume choisi AVANT LANCEMENT (#2190.12) — `undefined`
   *  rend le réglage par défaut, {@link resolveExternalSourcingVolume} borne le
   *  reste (défense en profondeur, la query le borne déjà côté contrôleur). */
  async search(
    needId: string,
    workspaceId: string,
    maxPerSource?: number,
  ): Promise<ExternalSourcingSearchResult | null> {
    const reference = await this.findNeedReference(needId, workspaceId)
    if (!reference) return null

    const skillTerms = reference.skillTerms
    if (skillTerms.length === 0) {
      return {
        needId,
        skillTerms: [],
        unavailableReason: 'skills_missing',
        candidates: [],
        notConnected: [],
        unanswered: [],
      }
    }

    const resolvedMaxPerSource = resolveExternalSourcingVolume(maxPerSource)
    const configured = this.providers.filter(provider => provider.configured)
    const notConnected = this.providers.filter(provider => !provider.configured).map(provider => provider.key)
    // Une source qui ne répond pas (délai dépassé = « unknown », erreur de la
    // source) est NOMMÉE dans `unanswered` — jamais une liste vide muette, et
    // elle ne fait pas tomber les sources voisines.
    const unanswered: string[] = []
    const bySource = await Promise.all(
      configured.map(async provider => {
        try {
          return await provider.search({
            workspaceId,
            needId,
            needSkillTerms: skillTerms,
            maxPerSource: resolvedMaxPerSource,
          })
        } catch (error) {
          this.logger.warn(
            `Sourcing externe : la source ${provider.key} n'a pas répondu (${error instanceof Error ? error.message : 'erreur'})`,
          )
          unanswered.push(provider.key)
          return []
        }
      }),
    )

    return {
      needId,
      skillTerms,
      unavailableReason: null,
      candidates: rankExternalSourcingCandidates(bySource.flat()),
      notConnected,
      unanswered,
    }
  }

  /** #1952.7 (épopée #2844, lot SRC5 28/09 soir) — les clés des sources
   *  CONFIGURÉES (jamais les non-branchées) : c'est l'ORDRE dans lequel le lot
   *  asynchrone les interroge, une par une. */
  configuredProviderKeys(): string[] {
    return this.providers.filter(provider => provider.configured).map(provider => provider.key)
  }

  /**
   * #1952.7 — interroge UNE source, pour le lot asynchrone
   * (`MultiSourceSearchWorker`). Même chemin que {@link search} mais SOURCE
   * PAR SOURCE plutôt qu'en un seul `Promise.all` — c'est ce qui rend chaque
   * avancée observable. `null` = besoin introuvable dans cet espace.
   */
  async searchOneSource(
    needId: string,
    workspaceId: string,
    sourceKey: string,
    maxPerSource?: number,
  ): Promise<ExternalSourcingCandidate[] | null> {
    const reference = await this.findNeedReference(needId, workspaceId)
    if (!reference) return null
    if (reference.skillTerms.length === 0) return []
    const provider = this.providers.find(candidate => candidate.key === sourceKey && candidate.configured)
    if (!provider) return []
    return provider.search({
      workspaceId,
      needId,
      needSkillTerms: reference.skillTerms,
      maxPerSource: resolveExternalSourcingVolume(maxPerSource),
    })
  }

  /**
   * L'import d'un profil externe vers le vivier (doctrine : « n'entre jamais
   * automatiquement »). `input.consent` est un littéral `true` porté par le
   * schéma (`externalSourcingImportSchema`) : NestJS refuse déjà la requête
   * avant d'atteindre ce code si le geste n'a pas été fait.
   *
   * Idempotent : une fiche déjà importée (`external_sourcing_origin` posé)
   * rend `imported: false` sans rien réécrire — la PREMIÈRE origine est celle
   * qui compte (même discipline que `consent_given_at`), et un second clic ne
   * doit pas laisser croire à un second import.
   */
  async importCandidate(
    workspaceId: string,
    needId: string,
    input: ExternalSourcingImportInput,
    userId: string,
  ): Promise<ExternalSourcingImportResult> {
    if ('externalProfile' in input) return this.importDirectoryProfile(workspaceId, needId, input, userId)
    const consultant = await this.consultants.findOne({
      where: { id: input.consultantId, workspace_id: workspaceId },
    })
    if (!consultant) throw new NotFoundException('Profil introuvable dans cet espace')

    if (consultant.external_sourcing_origin) {
      return { consultantId: consultant.id, imported: false }
    }

    const origin: ExternalSourcingOrigin = {
      sourceKind: input.sourceKind,
      needId,
      importedAt: new Date().toISOString(),
    }
    await this.consultants.update(
      { id: consultant.id },
      {
        external_sourcing_origin: origin,
        // Le consentement à RECUEILLIR — posé une seule fois, jamais écrasé
        // (même règle que `origin` ci-dessus).
        consent_given_at: consultant.consent_given_at ?? new Date(),
        // « L'import vers le vivier » : la fiche rejoint le pool QUALIFIÉ,
        // qu'elle était candidature, import brut ou banc partenaire.
        review_status: 'qualified',
        qualified_at: consultant.qualified_at ?? new Date(),
      },
    )
    return { consultantId: consultant.id, imported: true }
  }

  /**
   * #2190.5 — un profil de l'annuaire externe n'existe pas dans l'espace : le
   * geste (consentement littéral déjà exigé par le schéma) CRÉE la fiche, avec
   * ce que le candidat affichait — nom, poste, compétences partagées — et rien
   * d'autre (aucun e-mail, aucun téléphone, aucune donnée devinée). L'origine
   * porte la référence à la source : un second clic ne crée pas de doublon.
   */
  private async importDirectoryProfile(
    workspaceId: string,
    needId: string,
    input: Extract<ExternalSourcingImportInput, { externalProfile: unknown }>,
    userId: string,
  ): Promise<ExternalSourcingImportResult> {
    const { ref, fullName, title, skills } = input.externalProfile
    const existing = await this.consultants.manager.query<{ id: string }[]>(
      `SELECT id FROM consultants WHERE workspace_id = $1 AND external_sourcing_origin ->> 'externalRef' = $2 LIMIT 1`,
      [workspaceId, ref],
    )
    const already = existing[0]
    if (already) return { consultantId: already.id, imported: false }

    const origin: ExternalSourcingOrigin = {
      sourceKind: 'external_directory',
      needId,
      importedAt: new Date().toISOString(),
      externalRef: ref,
    }
    const now = new Date()
    const saved = await this.consultants.save(
      this.consultants.create({
        workspace_id: workspaceId,
        user_id: userId,
        kind: 'consultant',
        full_name: fullName,
        title,
        source: 'annuaire_externe',
        external_sourcing_origin: origin,
        consent_given_at: now,
        review_status: 'qualified',
        qualified_at: now,
      }),
    )
    for (const skill of new Set(skills.map(entry => entry.trim().toLowerCase()).filter(entry => entry.length > 0))) {
      await this.consultants.manager.query(
        `INSERT INTO consultant_skills (consultant_id, workspace_id, skill, source) VALUES ($1, $2, $3, 'declared')`,
        [saved.id, workspaceId, skill],
      )
    }
    return { consultantId: saved.id, imported: true }
  }

  /** `null` = besoin introuvable dans cet espace — le contrôleur en fait un 404.
   *  Même requête que `search`, réutilisée pour composer le brief partenaire. */
  private async findNeedReference(
    needId: string,
    workspaceId: string,
  ): Promise<{ title: string; headcount: number; skillTerms: string[] } | null> {
    const rows = await this.needs.manager.query<NeedReferenceRow[]>(
      `SELECT skills, title, headcount FROM project_needs WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [needId, workspaceId],
    )
    const reference = rows[0]
    if (!reference) return null
    return {
      title: reference.title,
      headcount: reference.headcount,
      skillTerms: Array.isArray(reference.skills) ? reference.skills.map(skill => skill.term) : [],
    }
  }

  /** Les briefs déjà préparés pour ce besoin, du plus récent au plus ancien. */
  async listPartnerBriefs(needId: string, workspaceId: string): Promise<ExternalSourcingPartnerBrief[]> {
    const rows = await this.partnerBriefs.find({
      where: { need_id: needId, workspace_id: workspaceId },
      order: { prepared_at: 'DESC' },
    })
    return rows.map(toPartnerBrief)
  }

  /**
   * PARTENAIRES (#2818) — le brief se PRÉPARE, il ne s'envoie JAMAIS (doctrine :
   * « le copilote n'envoie jamais d'e-mail : il prépare, le commercial
   * envoie »). Le texte est composé depuis le besoin RÉEL — voir
   * {@link buildExternalSourcingPartnerBriefMessage} — jamais une donnée
   * inventée pour remplir le brief.
   */
  async preparePartnerBrief(
    workspaceId: string,
    needId: string,
    userId: string,
    input: ExternalSourcingPartnerBriefPrepareInput,
  ): Promise<ExternalSourcingPartnerBrief> {
    const need = await this.findNeedReference(needId, workspaceId)
    if (!need) throw new NotFoundException('Besoin introuvable')

    const message = buildExternalSourcingPartnerBriefMessage({
      needTitle: need.title,
      skillTerms: need.skillTerms,
      headcount: need.headcount,
    })
    const created = this.partnerBriefs.create({
      workspace_id: workspaceId,
      need_id: needId,
      partner_name: input.partnerName,
      message,
      conditions: input.conditions ?? null,
      delay: input.delay ?? null,
      feedback: null,
      prepared_by: userId,
      feedback_recorded_at: null,
    })
    const saved = await this.partnerBriefs.save(created)
    return toPartnerBrief(saved)
  }

  /** Le retour du partenaire — saisi par un humain, jamais déduit. Posé UNE
   *  fois : un second appel écrase le texte (une correction humaine gagne
   *  toujours, quelle que soit sa date — doctrine), jamais la date. */
  async recordPartnerBriefFeedback(
    workspaceId: string,
    needId: string,
    briefId: string,
    input: ExternalSourcingPartnerBriefFeedbackInput,
  ): Promise<ExternalSourcingPartnerBrief> {
    const brief = await this.partnerBriefs.findOne({
      where: { id: briefId, need_id: needId, workspace_id: workspaceId },
    })
    if (!brief) throw new NotFoundException('Brief introuvable dans cet espace')

    await this.partnerBriefs.update({ id: brief.id }, { feedback: input.feedback, feedback_recorded_at: new Date() })
    return toPartnerBrief({ ...brief, feedback: input.feedback, feedback_recorded_at: new Date() })
  }
}
