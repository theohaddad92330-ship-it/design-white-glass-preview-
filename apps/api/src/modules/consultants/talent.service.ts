import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ILike, In, IsNull, Repository } from 'typeorm'
import {
  ENRICHED_MIN_AXES,
  TALENT_DOCUMENT_FILE_URL_TTL_SECONDS,
  TALENT_DOCUMENT_TEXT_MAX,
  TALENT_RETENTION_MAX_MONTHS,
  computeSkillConfidence,
  fromStoredExperienceDate,
  deriveStaffing,
  isSkillSourceProven,
  isTalentPurgeDue,
  talentCompleteness,
  talentRetentionSchema,
  readExperienceKeys,
  type AddExperienceInput,
  type AssignmentWindow,
  type ConsultantExperience,
  type ConsultantSkill,
  type PrepareTalentMessageInput,
  type SkillLevel,
  type SkillSource,
  type TalentDocument,
  type TalentDocumentFileUrl,
  type TalentDocumentKind,
  type TalentDocumentText,
  type TalentPage,
  type TalentPreparedMessage,
  type TalentPreparedMessageChannel,
  type TalentRetention,
  type TalentRow,
  type TalentSearchQuery,
  type TalentStats,
  type UpsertSkillInput,
  type ValidateSkillInput,
} from '@bellum/contracts'
import { unconfirmedInterruptionMissionIds } from '../../common/mission-interruptions'
import { ConsultantDocumentEntity } from '../../database/entities/consultant-document.entity'
import { ConsultantExperienceEntity } from '../../database/entities/consultant-experience.entity'
import { TalentPreparedMessageEntity } from '../../database/entities/talent-prepared-message.entity'
import { ConsultantSkillEntity } from '../../database/entities/consultant-skill.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { returnedRows } from '../../database/returned-rows'
import { StorageClient } from '../storage/storage.client'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { effectiveDeclaredAvailability } from './declared-availability'
import { GeocodingService } from './geocoding.service'
import { canonicalSkill, extractSkills, normaliseSkillText, splitSkillEntries } from './skill-referential'
import { stackWithSkill, stackWithoutSkill } from './skill-seed'
import { lastMissionView } from './last-mission-view'

/**
 * #3889.3 — une expérience lue dans un CV autorisé : le projet qu'elle décrit
 * garde sa NATURE (une expérience déclarée, jamais une mission ni un Projet du
 * pipe) et sa SOURCE (l'extrait du CV qui la justifie).
 */
type ExperienceAtClient = {
  client: string | null
  role: string | null
  from: string | null
  to: string | null
  project: string | null
  nature: 'cv_experience'
  source: string | null
}

/**
 * Les TALENTS — compétences typées, documents, recherche paginée, rétention.
 *
 * Trois décisions structurent le service :
 *
 * 1. **Une compétence est CANONISÉE avant d'être écrite.** `k8s` et
 *    `Kubernetes` deviennent la même ligne, sinon le vivier contient deux
 *    compétences qui ne se rencontrent jamais et le matching produit des faux
 *    négatifs silencieux — le pire défaut possible, parce que personne ne peut
 *    les voir. Le libellé d'origine est conservé à côté : c'est ce que la
 *    personne a écrit, et l'effacer serait une correction non demandée.
 * 2. **La recherche est PAGINÉE et exige TOUTES les compétences demandées.** Un
 *    besoin « Java ET Kubernetes » satisfait par « Java seul » fait perdre le
 *    rendez-vous.
 * 3. **La purge ne touche que les CANDIDATS**, et jamais sans que la case ait
 *    été cochée. Un consultant est justifié par un contrat de travail ; le
 *    purger effacerait l'historique de missions d'un salarié en poste.
 */
@Injectable()
export class TalentService {
  private readonly logger = new Logger(TalentService.name)

  constructor(
    @InjectRepository(ConsultantEntity) private readonly consultants: Repository<ConsultantEntity>,
    @InjectRepository(ConsultantSkillEntity) private readonly skills: Repository<ConsultantSkillEntity>,
    @InjectRepository(ConsultantExperienceEntity)
    private readonly experiences: Repository<ConsultantExperienceEntity>,
    @InjectRepository(ConsultantDocumentEntity) private readonly documents: Repository<ConsultantDocumentEntity>,
    @InjectRepository(TalentPreparedMessageEntity)
    private readonly preparedMessages: Repository<TalentPreparedMessageEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly geocoding: GeocodingService,
    /** #4034 — le magasin de l'ORIGINAL d'un CV. Optionnel : absent, aucun aperçu fidèle. */
    @Optional() private readonly storage?: StorageClient,
  ) {}

  // ────────────────────────────── compétences ──────────────────────────────

  async listSkills(consultantId: string, workspaceId: string): Promise<ConsultantSkill[]> {
    await this.assertTalent(consultantId, workspaceId)
    const query = { where: { consultant_id: consultantId }, order: { skill: 'ASC' } } as const
    let rows = await this.skills.find(query)
    // Recette 21/10 C.1/C.2 — « java spring vue » stocké d'un trait AVANT la découpe à l'écriture (K.2) :
    // rattrapage ciblé de CETTE fiche, à sa lecture, idempotent (ON CONFLICT DO NOTHING).
    if (await this.splitGluedSkills(consultantId, workspaceId, rows)) rows = await this.skills.find(query)
    return rows.map(toSkillWire)
  }

  /** Vrai si au moins une ligne collée a été découpée. Les pièces héritent niveau/années/source ; la ligne
   *  collée disparaît quand c'est sa clé même qui l'était, sinon seul son libellé brut est vidé. */
  private async splitGluedSkills(
    consultantId: string,
    workspaceId: string,
    rows: readonly ConsultantSkillEntity[],
  ): Promise<boolean> {
    let changed = false
    for (const row of rows) {
      const keyParts = splitSkillEntries([row.skill])
      const rawParts = keyParts.length > 1 ? keyParts : splitSkillEntries(row.raw_label ? [row.raw_label] : [])
      if (rawParts.length < 2) continue
      for (const part of rawParts) {
        const canonical = canonicalSkill(part) ?? normaliseSkillText(part)
        if (!canonical || canonical === row.skill) continue
        const rawLabel = normaliseSkillText(part) === canonical ? null : part.trim()
        await this.skills.manager.query(
          `INSERT INTO consultant_skills (consultant_id, workspace_id, skill, raw_label, level, years, last_used_year, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (consultant_id, skill) DO NOTHING`,
          [consultantId, workspaceId, canonical, rawLabel, row.level, row.years, row.last_used_year, row.source],
        )
      }
      if (keyParts.length > 1) await this.skills.delete({ id: row.id, consultant_id: consultantId })
      else await this.skills.update({ id: row.id, consultant_id: consultantId }, { raw_label: null })
      changed = true
    }
    return changed
  }

  /**
   * Ajoute ou met à jour une compétence.
   *
   * Upsert sur `(consultant, compétence canonique)` : deux lignes « kubernetes »
   * sur la même fiche afficheraient deux niveaux contradictoires, et le matching
   * en compterait deux.
   */
  async upsertSkill(consultantId: string, workspaceId: string, input: UpsertSkillInput): Promise<ConsultantSkill> {
    // KEVIN-FIX K.2 — « java spring vue » saisi d'un trait = trois compétences ; la première est rendue.
    const parts = splitSkillEntries([input.skill])
    if (parts.length > 1) {
      const written: ConsultantSkill[] = []
      for (const part of parts)
        written.push(await this.upsertSkill(consultantId, workspaceId, { ...input, skill: part }))
      return written[0] as ConsultantSkill
    }
    const talent = await this.assertTalent(consultantId, workspaceId)
    const canonical = canonicalSkill(input.skill) ?? normaliseSkillText(input.skill)
    if (!canonical) throw new BadRequestException('Compétence vide')

    // Le libellé d'origine n'est gardé que s'il DIFFÈRE du canonique : recopier
    // « kubernetes » à côté de « kubernetes » affiche deux fois la même chose.
    const raw = normaliseSkillText(input.skill) === canonical ? null : input.skill.trim()

    await this.skills.manager.query(
      `INSERT INTO consultant_skills (consultant_id, workspace_id, skill, raw_label, level, years, last_used_year, source)
       VALUES ($1, $8, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (consultant_id, skill)
       DO UPDATE SET level = EXCLUDED.level,
                     years = EXCLUDED.years,
                     last_used_year = EXCLUDED.last_used_year,
                     source = EXCLUDED.source,
                     raw_label = COALESCE(EXCLUDED.raw_label, consultant_skills.raw_label)`,
      [consultantId, canonical, raw, input.level, input.years, input.lastUsedYear, input.source, workspaceId],
    )

    // #3812.1 — `consultant_skills` est la source canonique ; la liste libre
    // (`consultants.stack`, lue par la fiche, le matching et Laura) la suit.
    // Sans ce miroir, « Vue » ajoutée dans l'onglet restait absente de la fiche.
    const nextStack = stackWithSkill(talent.stack, input.skill)
    if (nextStack) {
      talent.stack = nextStack
      await this.consultants.save(talent)
    }

    const row = await this.skills.findOne({ where: { consultant_id: consultantId, skill: canonical } })
    if (!row) throw new NotFoundException('Compétence introuvable')
    return toSkillWire(row)
  }

  async removeSkill(consultantId: string, workspaceId: string, skillId: string): Promise<void> {
    const talent = await this.assertTalent(consultantId, workspaceId)
    const row = await this.skills.findOne({ where: { id: skillId, consultant_id: consultantId } })
    const result = await this.skills.delete({ id: skillId, consultant_id: consultantId })
    if (!result.affected) throw new NotFoundException('Compétence introuvable')
    // #3812.1 — le retrait se lit aussi dans la liste libre (miroir de upsertSkill).
    const nextStack = row ? stackWithoutSkill(talent.stack, row.skill) : null
    if (nextStack) {
      talent.stack = nextStack
      await this.consultants.save(talent)
    }
  }

  /**
   * Une VALIDATION humaine, consultant ou recruteur, indépendante de la
   * déclaration initiale (#2328.6/.11/.12/.13/.14).
   *
   * N'écrit JAMAIS `level`, `source` ni `raw_label` : une validation ENRICHIT
   * le graphe, elle ne supprime pas la source initiale (#2328.26) — seules les
   * colonnes de preuve ajoutées à cet effet sont posées.
   */
  async validateSkill(
    consultantId: string,
    workspaceId: string,
    skillId: string,
    input: ValidateSkillInput,
  ): Promise<ConsultantSkill> {
    await this.assertTalent(consultantId, workspaceId)
    const patch: Partial<ConsultantSkillEntity> = {}
    if (input.validatedLevel !== undefined) patch.validated_level = input.validatedLevel
    if (input.certification !== undefined) patch.certification = input.certification
    if (input.clientFeedback !== undefined) patch.client_feedback = input.clientFeedback
    if (input.validatedBy === 'consultant') patch.validated_by_consultant_at = new Date()
    if (input.validatedBy === 'recruiter') patch.validated_by_recruiter_at = new Date()
    if (input.sourceExperienceId !== undefined) {
      // #2328.9 — citer une expérience d'un AUTRE talent inventerait une
      // preuve : la ligne doit appartenir au même consultant que la compétence.
      if (input.sourceExperienceId !== null) {
        const experience = await this.experiences.findOne({
          where: { id: input.sourceExperienceId, consultant_id: consultantId },
        })
        if (!experience) throw new NotFoundException('Expérience introuvable')
      }
      patch.source_experience_id = input.sourceExperienceId
    }
    if (input.sourceProject !== undefined) patch.source_project = input.sourceProject

    const result = await this.skills.update({ id: skillId, consultant_id: consultantId }, patch)
    if (!result.affected) throw new NotFoundException('Compétence introuvable')
    const row = await this.skills.findOne({ where: { id: skillId, consultant_id: consultantId } })
    if (!row) throw new NotFoundException('Compétence introuvable')
    return toSkillWire(row)
  }

  // ────────────────────────────── expériences ──────────────────────────────

  /**
   * #3889.1 (lot I02) — « qui a travaillé chez <compte> ? » : les consultants dont
   * un CV AUTORISÉ déclare une expérience chez ce client, SANS exiger qu'une
   * affectation de mission Bellum existe (la mission est un autre fait).
   *
   * Garde-fous (doctrine) : un consentement absent ou expiré exclut la fiche ;
   * un client MASQUÉ ne se retrouve jamais par son nom (`client_masked`) ; une
   * fiche archivée est hors du résultat. Un nom vide ne cherche rien. Les noms
   * sont en clair : une identité de consultant est nominative PAR NATURE.
   *
   * #3889.3 (lot M13, 09/10) — « un projet documentaire conserve sa nature et sa
   * source » : le projet DÉCRIT dans l'expérience (`contexte`) est rendu tel
   * quel, avec sa période et l'extrait du CV qui le justifie (`preuve`), sous la
   * nature `cv_experience` — une expérience déclarée, jamais une mission de
   * l'ESN ni un objet Projet du pipe (rien n'est créé ici : LECTURE seule).
   * Sans texte écrit, `null` : on n'affiche pas ce qu'on n'a pas.
   */
  async findByExperienceClient(
    workspaceId: string,
    client: string,
    limit = 20,
  ): Promise<{
    items: {
      consultantId: string
      fullName: string | null
      title: string | null
      experiences: ExperienceAtClient[]
    }[]
    total: number
    /** #4287.8 — fiches (non archivées) qui déclarent cette expérience mais dont le CV n'est PAS autorisé : comptées, jamais nommées. */
    withheldForConsent: number
  }> {
    const needle = client.trim()
    if (!needle) return { items: [], total: 0, withheldForConsent: 0 }
    const pattern = `%${needle.replace(/[\\%_]/g, '\\$&')}%`
    const rows = await this.experiences.find({
      where: [
        { workspace_id: workspaceId, client_masked: false, client_final: ILike(pattern) },
        { workspace_id: workspaceId, client_masked: false, entreprise: ILike(pattern) },
      ],
      order: { created_at: 'DESC' },
    })
    if (rows.length === 0) return { items: [], total: 0, withheldForConsent: 0 }
    const ids = [...new Set(rows.map(row => row.consultant_id))]
    const people = await this.consultants.find({
      where: { id: In(ids), workspace_id: workspaceId, archived_at: IsNull() },
    })
    const now = Date.now()
    const authorised = new Map(
      people
        .filter(
          person =>
            person.consent_given_at !== null &&
            (person.consent_expires_at === null || person.consent_expires_at.getTime() > now),
        )
        .map(person => [person.id, person] as const),
    )
    const grouped = new Map<string, ExperienceAtClient[]>()
    for (const row of rows) {
      if (!authorised.has(row.consultant_id)) continue
      const list = grouped.get(row.consultant_id) ?? []
      list.push({
        client: row.client_final ?? row.entreprise,
        role: row.role,
        // #3935 (lot P03) — à LEUR précision : « 2019 », jamais un 1er janvier inventé.
        from: fromStoredExperienceDate(row.date_debut, row.date_debut_precision ?? null),
        to: fromStoredExperienceDate(row.date_fin, row.date_fin_precision ?? null),
        project: row.contexte?.trim() || null,
        nature: 'cv_experience',
        source: row.preuve?.trim() || null,
      })
      grouped.set(row.consultant_id, list)
    }
    const items = [...grouped.entries()].map(([consultantId, experiences]) => ({
      consultantId,
      fullName: authorised.get(consultantId)?.full_name ?? null,
      title: authorised.get(consultantId)?.title ?? null,
      experiences,
    }))
    // #4287.8 — l'écart entre « personne » et « personne d'autorisé » se DIT : un compte, pas un nom.
    const withheldForConsent = people.filter(person => !authorised.has(person.id)).length
    return { items: items.slice(0, limit), total: items.length, withheldForConsent }
  }

  /** #2328.22 — les expériences structurées du talent, la plus récente d'abord. */
  async listExperiences(consultantId: string, workspaceId: string): Promise<ConsultantExperience[]> {
    await this.assertTalent(consultantId, workspaceId)
    const rows = await this.experiences.find({ where: { consultant_id: consultantId }, order: { created_at: 'DESC' } })
    return rows.map(toExperienceWire)
  }

  /**
   * Ajoute une expérience structurée (#2328.22) — la base des preuves
   * qu'une compétence pourra citer ensuite (`validateSkill`).
   *
   * `clientMasked` sans `clientMaskedReason` est déjà refusé par le contrat
   * (`addExperienceSchema.refine`) ; revérifié ici pour ne jamais dépendre
   * du seul appelant HTTP (#2328.23).
   */
  async addExperience(
    consultantId: string,
    workspaceId: string,
    input: AddExperienceInput,
  ): Promise<ConsultantExperience> {
    await this.assertTalent(consultantId, workspaceId)
    if (input.clientMasked && !input.clientMaskedReason?.trim()) {
      throw new BadRequestException('Un client masqué doit porter sa raison')
    }
    const row = this.experiences.create({
      consultant_id: consultantId,
      workspace_id: workspaceId,
      entreprise: input.entreprise,
      client_final: input.clientFinal,
      client_masked: input.clientMasked,
      client_masked_reason: input.clientMaskedReason,
      secteur: input.secteur,
      role: input.role,
      date_debut: input.dateDebut,
      date_fin: input.dateFin,
      // #3935 (lot P03) — une saisie à la main est lue telle quelle, sans précision portée.
      date_debut_precision: null,
      date_fin_precision: null,
      contexte: input.contexte,
      realisations: input.realisations,
      technologies: input.technologies,
      responsabilites: input.responsabilites,
      preuve: input.preuve,
      // #3935.2b — une saisie à la main est `human` sur chaque champ renseigné :
      // aucune relecture de CV ne la réécrira (`planExperienceWrites`).
      field_provenance: humanExperienceProvenance(input),
    })
    const saved = await this.experiences.save(row)
    return toExperienceWire(saved)
  }

  // ─────────────────────────────── documents ───────────────────────────────

  async listDocuments(consultantId: string, workspaceId: string): Promise<TalentDocument[]> {
    await this.assertTalent(consultantId, workspaceId)
    const rows = await this.documents.manager.query<
      {
        id: string
        kind: string
        filename: string
        mime_type: string | null
        size_bytes: number | null
        extracted_len: number | string | null
        created_at: Date | string
        first_name: string | null
        last_name: string | null
        email: string | null
        has_original?: boolean | null
      }[]
    >(
      `SELECT d.id, d.kind, d.filename, d.mime_type, d.size_bytes,
              length(coalesce(d.extracted_text, '')) AS extracted_len,
              (d.storage_path IS NOT NULL) AS has_original,
              d.created_at, p.first_name, p.last_name, p.email
         FROM consultant_documents d
         LEFT JOIN profiles p ON p.user_id = d.uploaded_by
        WHERE d.consultant_id = $1
          -- #2327.22 — un document retiré est ARCHIVÉ, pas supprimé.
          AND d.archived_at IS NULL
        ORDER BY d.created_at DESC`,
      [consultantId],
    )
    return rows.map(row => {
      const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
      return {
        id: row.id,
        kind: row.kind as TalentDocumentKind,
        filename: row.filename,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        extractedChars: Number(row.extracted_len ?? 0),
        uploadedAt: new Date(row.created_at).toISOString(),
        uploadedByName: full || row.email || null,
        // #4034.5 — l'original n'existe que pour un CV déposé APRÈS #4034.
        hasOriginal: row.has_original === true,
      }
    })
  }

  /**
   * Dépose un document et en garde le TEXTE.
   *
   * Deux effets de bord assumés, tous deux annoncés à l'écran :
   *
   *  - un CV devient le `cv_text` du talent quand il n'en a pas encore, parce
   *    que c'est la matière de la réécriture pour une mission et que la saisir
   *    deux fois n'a aucun sens ;
   *  - les compétences reconnues dans le texte sont AJOUTÉES avec la source
   *    `cv` — jamais en écrasant un niveau déjà saisi à la main. Une extraction
   *    automatique qui remplacerait « expert, confirmé en entretien » par
   *    « autonome, lu dans un CV » ferait perdre le travail de quelqu'un.
   *  - #2328.24 : une compétence reconnue ici n'est qu'un MOT trouvé dans le
   *    texte (`extractSkills`, présence/absence) — jamais une expérience
   *    détaillée. Elle arrive donc `inferred: true` et de niveau `inconnu`,
   *    « à vérifier ». Le NO-GO de l'épopée est précisément ceci : « le moteur
   *    déclare une compétence maîtrisée uniquement parce que son mot apparaît
   *    quelque part dans le CV » — avant ce correctif, cette méthode posait
   *    `level: 'autonome'` en dur, exactement ce que le niveau `inconnu`
   *    (ajouté le 20/08/2026 pour ce cas précis) existait déjà pour éviter.
   */
  async addDocument(
    consultantId: string,
    workspaceId: string,
    userId: string,
    input: {
      kind: TalentDocumentKind
      filename: string
      mimeType: string | null
      text: string
      sizeBytes: number | null
    },
  ): Promise<{ document: TalentDocument; skillsAdded: number; truncated: boolean }> {
    const talent = await this.assertTalent(consultantId, workspaceId)
    const truncated = input.text.length > TALENT_DOCUMENT_TEXT_MAX
    const text = truncated ? input.text.slice(0, TALENT_DOCUMENT_TEXT_MAX) : input.text

    await this.documents.save(
      this.documents.create({
        consultant_id: consultantId,
        workspace_id: workspaceId,
        kind: input.kind,
        filename: input.filename,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        extracted_text: text,
        uploaded_by: userId,
        // #2327.7 — un texte collé porte aussi ses expériences : c'est la
        // matière de la comparaison d'identité. Pas d'empreinte : pas de fichier.
        experience_keys: readExperienceKeys(text),
      }),
    )

    let skillsAdded = 0
    if (input.kind === 'cv' && text.trim().length > 0) {
      if (!talent.cv_text) {
        talent.cv_text = text
        await this.consultants.save(talent)
      }
      skillsAdded = await this.addExtractedSkills(consultantId, workspaceId, text)
    }

    const [document] = await this.listDocuments(consultantId, workspaceId)
    if (!document) throw new NotFoundException('Document introuvable')
    return { document, skillsAdded, truncated }
  }

  /**
   * Ajoute les compétences reconnues dans un texte, SANS jamais écraser une
   * ligne existante (`DO NOTHING`). Ce qui a été saisi à la main a plus de
   * valeur qu'une extraction, et le perdre découragerait la saisie.
   */
  private async addExtractedSkills(consultantId: string, workspaceId: string, text: string): Promise<number> {
    const found = extractSkills(text)
    if (found.length === 0) return 0
    let added = 0
    for (const skill of found) {
      const rows = await this.skills.manager.query<{ id: string }[]>(
        `INSERT INTO consultant_skills (consultant_id, workspace_id, skill, level, source, inferred)
         VALUES ($1, $3, $2, 'inconnu', 'cv', true)
         ON CONFLICT (consultant_id, skill) DO NOTHING
         RETURNING id`,
        [consultantId, skill, workspaceId],
      )
      if (rows.length > 0) added += 1
    }
    return added
  }

  /**
   * #2327.22 — « aucun document source n'est supprimé » : retirer un document
   * l'ARCHIVE. Il disparaît de la fiche, il reste une preuve d'identité (le
   * même fichier redéposé sous un autre nom se reconnaît encore). L'effacement
   * RGPD, lui, passe par la purge du talent (`ON DELETE CASCADE`).
   */
  async removeDocument(consultantId: string, workspaceId: string, documentId: string): Promise<void> {
    await this.assertTalent(consultantId, workspaceId)
    // #4034.6 — l'ORIGINAL, lui, ne s'archive pas : retirer le document efface
    // le fichier du stockage. La ligne reste (empreinte d'identité, #2327.22).
    const storagePath = (await this.findDocumentRow(consultantId, workspaceId, documentId))?.storage_path ?? null
    const removed = storagePath ? await this.storage?.remove([storagePath]) : true
    // Un effacement refusé garde le chemin : l'effacement RGPD le retrouvera.
    const clearPath = removed === true ? ', storage_path = NULL' : ''
    const result = await this.documents.manager.query<unknown>(
      `UPDATE consultant_documents d SET archived_at = now()${clearPath}
         FROM consultants c
        WHERE d.id = $1 AND d.consultant_id = $2 AND c.id = d.consultant_id AND c.workspace_id = $3
          AND d.archived_at IS NULL
        RETURNING d.id`,
      [documentId, consultantId, workspaceId],
    )
    // #vague-23 — `returnedRows` et non une relecture à la main : un UPDATE …
    // RETURNING rend `[lignes, nombre]`, indexer autrement rend un tableau
    // « truthy » et le 404 ci-dessous ne partirait jamais.
    const archived = returnedRows<{ id: string }>(result).length
    if (archived === 0) throw new NotFoundException('Document introuvable')
  }

  /**
   * #4034.3 — l'ORIGINAL d'un document, par une URL signée de cinq minutes au
   * plus. Le droit se tranche ICI, sur le document parent (talent de l'espace,
   * document de ce talent, non archivé) ; `StorageClient` n'en vérifie aucun.
   * 404 quand l'original n'a pas été conservé — l'écran dit pourquoi.
   */
  async documentFileUrl(consultantId: string, workspaceId: string, documentId: string): Promise<TalentDocumentFileUrl> {
    await this.assertTalent(consultantId, workspaceId)
    const row = await this.findDocumentRow(consultantId, workspaceId, documentId)
    if (!row) throw new NotFoundException('Document introuvable')
    if (!row.storage_path) throw new NotFoundException('Original non conservé pour ce document')
    if (!this.storage) throw new ServiceUnavailableException('Le stockage des fichiers n’est pas branché.')
    const url = await this.storage.signedUrl(row.storage_path, TALENT_DOCUMENT_FILE_URL_TTL_SECONDS)
    return {
      url,
      expiresAt: new Date(Date.now() + TALENT_DOCUMENT_FILE_URL_TTL_SECONDS * 1000).toISOString(),
      mimeType: row.mime_type,
      filename: row.filename,
    }
  }

  /** #4034.4/.5 — le texte extrait d'un document, mis en page dans l'aperçu. */
  async documentText(consultantId: string, workspaceId: string, documentId: string): Promise<TalentDocumentText> {
    await this.assertTalent(consultantId, workspaceId)
    const row = await this.findDocumentRow(consultantId, workspaceId, documentId)
    if (!row) throw new NotFoundException('Document introuvable')
    return { text: row.extracted_text ?? '', partial: row.extraction_partial === true }
  }

  /** #4034 — un document de CE talent, de CET espace, non archivé ; jamais `where id` seul. */
  private async findDocumentRow(
    consultantId: string,
    workspaceId: string,
    documentId: string,
  ): Promise<{
    filename: string
    mime_type: string | null
    storage_path: string | null
    extracted_text: string | null
    extraction_partial: boolean | null
  } | null> {
    const rows = await this.documents.manager.query<
      {
        filename: string
        mime_type: string | null
        storage_path: string | null
        extracted_text: string | null
        extraction_partial: boolean | null
      }[]
    >(
      `SELECT d.filename, d.mime_type, d.storage_path, d.extracted_text, d.extraction_partial
         FROM consultant_documents d
         JOIN consultants c ON c.id = d.consultant_id
        WHERE d.id = $1 AND d.consultant_id = $2 AND c.workspace_id = $3
          AND d.archived_at IS NULL`,
      [documentId, consultantId, workspaceId],
    )
    return rows?.[0] ?? null
  }

  // ───────────────────────── messages préparés (#2185.51) ──────────────────

  /**
   * Les brouillons préparés pour ce talent, le plus récent d'abord. Jamais
   * envoyés : aucune colonne ni aucun geste d'envoi n'existe sur cette table.
   */
  async listPreparedMessages(consultantId: string, workspaceId: string): Promise<TalentPreparedMessage[]> {
    await this.assertTalent(consultantId, workspaceId)
    const rows = await this.preparedMessages.manager.query<
      {
        id: string
        channel: TalentPreparedMessageChannel
        subject: string | null
        body: string
        created_at: Date | string
        first_name: string | null
        last_name: string | null
        email: string | null
      }[]
    >(
      `SELECT m.id, m.channel, m.subject, m.body, m.created_at, p.first_name, p.last_name, p.email
         FROM talent_prepared_messages m
         LEFT JOIN profiles p ON p.user_id = m.prepared_by
        WHERE m.consultant_id = $1
        ORDER BY m.created_at DESC`,
      [consultantId],
    )
    return rows.map(row => {
      const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
      return {
        id: row.id,
        talentId: consultantId,
        channel: row.channel,
        subject: row.subject,
        body: row.body,
        preparedByName: full || row.email || null,
        createdAt: new Date(row.created_at).toISOString(),
      }
    })
  }

  /**
   * Prépare un message — ne l'envoie jamais (le copilote prépare, le
   * commercial envoie). Tranche minimale volontaire, distincte du moteur
   * outreach (#2185.51) : ni séquence, ni version, ni preuve d'approbation.
   */
  async prepareMessage(
    consultantId: string,
    workspaceId: string,
    userId: string,
    input: PrepareTalentMessageInput,
  ): Promise<TalentPreparedMessage> {
    await this.assertTalent(consultantId, workspaceId)
    await this.preparedMessages.save(
      this.preparedMessages.create({
        consultant_id: consultantId,
        workspace_id: workspaceId,
        channel: input.channel,
        subject: input.subject ?? null,
        body: input.body,
        prepared_by: userId,
      }),
    )
    const [message] = await this.listPreparedMessages(consultantId, workspaceId)
    if (!message) throw new NotFoundException('Message préparé introuvable')
    return message
  }

  // ──────────────────────────────── recherche ──────────────────────────────

  /**
   * La recherche du vivier, paginée.
   *
   * Le filtre par compétences exige TOUTES celles demandées (`HAVING count = n`)
   * et non « au moins une » : un besoin « Java ET Kubernetes » satisfait par
   * « Java seul » fait perdre le rendez-vous, et un vivier qui remonte tout le
   * monde ne sert à rien.
   */
  async search(
    workspaceId: string,
    query: TalentSearchQuery,
    visibility: { finance: boolean } = { finance: false },
    /** Les alias validés par l'espace (§5.3). Vide = référentiel seul. */
    workspaceAliases: ReadonlyMap<string, string> = new Map(),
    /** Théo C talents-vivier.A12 — l'appelant : ses favoris seuls, jamais ceux d'un collègue. */
    userId?: string,
  ): Promise<TalentPage> {
    const where: string[] = ['c.workspace_id = $1']
    const params: unknown[] = [workspaceId]

    if (query.favorite === 'mine') {
      // Sans appelant identifié, « mes favoris » ne rend RIEN : ce n'est pas « tout le vivier ».
      if (!userId) return { items: [], total: 0, page: query.page, limit: query.limit }
      params.push(userId)
      where.push(
        `EXISTS (SELECT 1 FROM user_favorites f
                  WHERE f.entity_type = 'talent' AND f.entity_id = c.id AND f.user_id = $${params.length})`,
      )
    }

    // Les archivés sortent du vivier ACTIF par défaut, sans disparaître : ils
    // restent trouvables à la demande, parce que leurs missions passées sont la
    // preuve de compétence qui sert à vendre les suivants.
    if (!query.includeArchived) where.push('c.archived_at IS NULL')

    if (query.kind) {
      params.push(query.kind)
      where.push(`c.kind = $${params.length}`)
    }
    if (query.availability) {
      params.push(query.availability)
      where.push(`c.availability = $${params.length}`)
    }
    if (query.seniority) {
      params.push(query.seniority)
      where.push(`c.seniority = $${params.length}`)
    }
    if (query.reviewStatus) {
      // #2183.52 — retrouver les exceptions d'un import (`needs_review`) sans
      // devoir ouvrir chaque fiche une par une.
      params.push(query.reviewStatus)
      where.push(`c.review_status = $${params.length}`)
    }
    if (query.maxTjm !== undefined) {
      params.push(query.maxTjm)
      // Un talent sans TJM n'est PAS écarté : « pas de prix » n'est pas « trop
      // cher », et l'écarter cacherait le profil le plus souvent négociable.
      where.push(`(c.tjm IS NULL OR c.tjm <= $${params.length})`)
    }
    if (query.minTjm !== undefined) {
      params.push(query.minTjm)
      // Même garde que `maxTjm`, dans l'autre sens : « pas de prix » n'est pas
      // « trop bon marché » non plus.
      where.push(`(c.tjm IS NULL OR c.tjm >= $${params.length})`)
    }
    if (query.minYearsExperience !== undefined) {
      params.push(query.minYearsExperience)
      // Même garde que le TJM : « pas renseigné » n'est écarté ni comme
      // « trop junior » ni comme « trop senior ».
      where.push(`(c.years_experience IS NULL OR c.years_experience >= $${params.length})`)
    }
    // Le RAYON (tiroir « Ville et rayon », décision du 31/08) REMPLACE la
    // correspondance exacte sur `zones[]` — un rayon de 50 km autour de
    // « Paris » ne doit pas EN PLUS exiger que la fiche porte le mot exact
    // « Paris ». Sans `zone`, un rayon n'a pas de centre : ignoré.
    if (query.zone && query.radiusKm !== undefined) {
      const origin = await this.geocoding.geocode(query.zone)
      if (origin) {
        params.push(origin.latitude, origin.longitude, query.radiusKm)
        const latIdx = params.length - 2
        const lonIdx = params.length - 1
        const radiusIdx = params.length
        // Haversine, en km. `least`/`greatest` bornent l'argument d'`acos` à
        // [-1, 1] : l'arrondi flottant peut le faire dépasser 1 de quelques
        // ulps sur deux points quasi identiques, ce qui ferait `acos` rendre
        // `NaN` — et un `NaN` comparé à `$radiusIdx` vaudrait toujours faux,
        // excluant à tort le talent le plus proche du centre de recherche.
        where.push(`
          c.latitude IS NOT NULL AND c.longitude IS NOT NULL AND
          (6371 * acos(least(1, greatest(-1,
             cos(radians($${latIdx})) * cos(radians(c.latitude)) * cos(radians(c.longitude) - radians($${lonIdx}))
             + sin(radians($${latIdx})) * sin(radians(c.latitude))
          )))) <= $${radiusIdx}
        `)
      }
      // Le géocodage de la VILLE CHERCHÉE a échoué (réseau, ville inconnue) :
      // le rayon est ignoré plutôt que de faire échouer toute la recherche —
      // c'est un critère de confort, pas une donnée qu'on invente pour le
      // faire fonctionner malgré tout.
    } else if (query.zone) {
      params.push(query.zone)
      where.push(`$${params.length} = ANY(c.zones)`)
    }
    if (query.sector) {
      params.push(query.sector)
      where.push(`$${params.length} = ANY(c.sectors)`)
    }
    if (query.remotePreference) {
      params.push(query.remotePreference)
      where.push(`c.remote_preference = $${params.length}`)
    }
    if (query.cvAvailable) {
      // Une bascule, pas un tri-état : `false`/absent ne filtre rien, un
      // profil sans CV n'est pas pour autant écarté d'un vivier non filtré.
      where.push(`c.cv_text IS NOT NULL AND length(trim(c.cv_text)) > 0`)
    }
    if (query.language) {
      params.push(query.language)
      where.push(
        `EXISTS (SELECT 1 FROM jsonb_array_elements(c.languages) AS lang WHERE lang->>'code' = $${params.length})`,
      )
    }
    if (query.q) {
      params.push(`%${query.q}%`)
      where.push(`(c.full_name ILIKE $${params.length} OR c.title ILIKE $${params.length})`)
    }
    if (query.engagementKind) {
      params.push(query.engagementKind)
      where.push(`c.engagement_kind = $${params.length}`)
    }
    if (query.neverSubmitted) {
      // « Jamais positionné » : le vivier qu'on a constitué et jamais utilisé.
      // C'est la question la plus rentable d'un recruteur, et elle n'avait
      // aucune réponse.
      where.push(`NOT EXISTS (SELECT 1 FROM submissions s WHERE s.consultant_id = c.id)`)
    }
    if (query.dormantMonths !== undefined) {
      params.push(query.dormantMonths)
      // `created_at` en repli quand aucun contact n'a jamais été enregistré :
      // ne rien faire garderait indéfiniment hors du filtre exactement les
      // fiches les plus anciennes, celles que la question vise.
      where.push(`COALESCE(c.last_contact_at, c.created_at) < now() - ($${params.length} || ' months')::interval`)
    }
    if (query.noMissionMonths !== undefined) {
      params.push(query.noMissionMonths)
      // #2182.23 / #2182.53 — la MÊME définition de « dernière mission » que
      // `decorate()` (la plus récente par DATE DE DÉBUT, `DISTINCT ON` +
      // `ORDER BY starts_on DESC`) : deux calculs qui divergeraient serait
      // exactement le défaut que « loi 1 du tome 7 » (un réglage vit à un
      // seul endroit) corrige. Une mission SANS fin connue (`ends_on IS
      // NULL`, en cours) compte comme « récente » — elle n'est pas terminée,
      // donc jamais « sans mission depuis N mois ». Une fiche sans AUCUNE
      // mission entre aussi dans ce filtre : ne pas l'y inclure laisserait
      // indéfiniment hors du filtre exactement les fiches que la question
      // vise.
      where.push(`
        NOT EXISTS (
          SELECT 1 FROM (
            SELECT DISTINCT ON (ma.consultant_id) m.ends_on
              FROM mission_assignments ma
              JOIN missions m ON m.id = ma.mission_id
             WHERE ma.consultant_id = c.id
             ORDER BY ma.consultant_id, ma.starts_on DESC
          ) last_mission
          WHERE last_mission.ends_on IS NULL
             OR last_mission.ends_on >= now() - ($${params.length} || ' months')::interval
        )
      `)
    }
    if (query.consentState) {
      params.push(query.consentState)
      // #2182.51 — même vocabulaire, même seuil (30 jours) que `consentState()`
      // (`packages/contracts/src/schemas/talent-consent.ts`, `CONSENT_WARNING_DAYS`) :
      // un second seuil ici divergerait au premier correctif (GA-26).
      where.push(`
        (CASE
           WHEN c.consent_given_at IS NULL THEN 'none'
           WHEN c.consent_expires_at IS NULL THEN 'valid'
           WHEN c.consent_expires_at <= now() THEN 'expired'
           WHEN c.consent_expires_at <= now() + interval '30 days' THEN 'expiring'
           ELSE 'valid'
         END) = $${params.length}
      `)
    }
    if (query.excludeSeenByAccount) {
      params.push(query.excludeSeenByAccount)
      // On retire les talents DÉJÀ présentés à ce compte — « la façon la plus
      // rapide de perdre un compte est de repousser un profil refusé ». Le
      // rattachement passe par le projet, seul porteur du compte.
      where.push(
        `NOT EXISTS (
           SELECT 1 FROM submissions s
             JOIN opportunities o ON o.id = s.project_id
            WHERE s.consultant_id = c.id AND o.account_id = $${params.length}
         )`,
      )
    }

    // Les alias APPROUVÉS de l'espace s'appliquent en plus du référentiel :
    // chercher « React » doit trouver les profils qui ont écrit « ReactJS » dès
    // qu'un administrateur l'a validé. Seuls les approuvés comptent — un
    // rapprochement non validé remonterait des profils sur un mot qu'ils n'ont
    // jamais écrit.
    //
    // #3830.4 (recette prod 08/10, 8c42a4032c) — « Analyse de risque » et « risque »
    // rendaient 0 alors que la fiche d'Alexandre Avakian affiche ce chip : hors
    // référentiel (`canonicalSkill` ne connaît pas « risque »), le filtre retombait sur
    // une égalité EXACTE contre la colonne canonique — jamais ce que la fiche AFFICHE
    // (`raw_label`, le libellé libre saisi) quand ce n'est pas un alias reconnu. Chaque
    // compétence demandée doit désormais AUSSI se chercher en SOUS-CHAÎNE de ce qui est
    // affiché, insensible à la casse et aux accents — un `EXISTS` par compétence, joints
    // par AND (exige TOUTES les compétences demandées, jamais au moins une).
    const skillClauses = query.skills
      .map(skill => normaliseSkillText(skill))
      .filter((normalised): normalised is string => Boolean(normalised))
      .map(normalised => {
        const canonical = workspaceAliases.get(normalised) ?? canonicalSkill(normalised) ?? normalised
        params.push(canonical)
        const canonicalParam = params.length
        params.push(`%${normalised.replace(/[%_\\]/g, '\\$&')}%`)
        const likeParam = params.length
        return `EXISTS (
          SELECT 1 FROM consultant_skills cs
           WHERE cs.consultant_id = c.id
             AND (
               cs.skill = $${canonicalParam}
               OR translate(
                    lower(coalesce(cs.raw_label, cs.skill)),
                    'àáâãäåāăąçćĉċčèéêëēĕėęěìíîïĩīĭįıñńņňòóôõöōŏőùúûüũūŭůűųýÿŷ',
                    'aaaaaaaaacccccceeeeeeeeeiiiiiiiiinnnnooooooooouuuuuuuuuyyy'
                  ) LIKE $${likeParam}
             )
        )`
      })
    if (skillClauses.length > 0) where.push(skillClauses.join(' AND '))

    const clause = where.join(' AND ')
    const [{ count }] = await this.consultants.manager.query<{ count: string }[]>(
      `SELECT count(*)::text AS count FROM consultants c WHERE ${clause}`,
      params,
    )

    const offset = (query.page - 1) * query.limit
    params.push(query.limit, offset)
    const rows = await this.consultants.manager.query<ConsultantEntity[]>(
      `SELECT c.* FROM consultants c
        WHERE ${clause}
        ORDER BY c.updated_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )

    const decorated = await this.decorate(rows, new Date(), visibility, userId)

    // Les filtres qui portent sur la disponibilité DÉRIVÉE s'appliquent APRÈS
    // la dérivation : elle se calcule à partir des affectations, pas d'une
    // colonne. Filtrer en SQL sur `c.availability` reproduirait exactement le
    // défaut que le §6.2 corrige — on retrouverait « disponibles » des gens en
    // mission. Le compte total est recalculé sur le résultat filtré pour que la
    // pagination ne promette pas des pages vides.
    const needsDerivedFilter =
      query.derived !== undefined ||
      query.freeBefore !== undefined ||
      query.onMission !== undefined ||
      query.completeness !== undefined ||
      query.provenSkillsOnly !== undefined
    if (!needsDerivedFilter) {
      return { items: decorated, total: Number(count), page: query.page, limit: query.limit }
    }
    const filtered = decorated.filter(row => {
      if (query.derived && row.staffing.availability !== query.derived) return false
      if (query.onMission) {
        // Même source que `derived` : la disponibilité DÉCLARÉE reproduirait
        // exactement le défaut que le §6.2 corrige.
        const onMission = row.staffing.availability === 'busy' || row.staffing.availability === 'busy_open_ended'
        if (query.onMission === 'yes' && !onMission) return false
        if (query.onMission === 'no' && onMission) return false
      }
      if (query.completeness) {
        // #2182.21 — même calcul, même seuil que `talentCompleteness`/
        // `ENRICHED_MIN_AXES` (le bandeau de stats, `talentPipelineStatus`).
        const filledAxes = talentCompleteness(row).axes.filter(axis => axis.score > 0).length
        const enriched = filledAxes >= ENRICHED_MIN_AXES
        if (query.completeness === 'incomplete' && enriched) return false
        if (query.completeness === 'enriched' && !enriched) return false
      }
      if (query.provenSkillsOnly && !row.topSkills.some(skill => isSkillSourceProven(skill.source))) return false
      if (query.freeBefore) {
        // Quelqu'un de libre AUJOURD'HUI passe : c'est le premier à placer, et
        // l'exclure est l'erreur classique de ce filtre.
        if (row.staffing.availability === 'available') return true
        // Sans date de fin, on ne PROMET pas une libération : `busy_open_ended`
        // et `unknown` sortent plutôt que d'apparaître comme bientôt libres.
        if (!row.staffing.freeFrom) return false
        return row.staffing.freeFrom <= query.freeBefore
      }
      return true
    })
    return { items: filtered, total: filtered.length, page: query.page, limit: query.limit }
  }

  /**
   * LA LIGNE DE VIVIER D'UN SEUL TALENT — ce que l'entête de sa fiche affiche.
   *
   * `GET /consultants/:id` rend un `Consultant` : la ligne SQL projetée. Elle
   * porte `availability`, le champ SAISI, et ni la disponibilité DÉRIVÉE des
   * affectations, ni le nombre de compétences typées, ni la présence d'un CV.
   * Or c'est exactement la matière de l'entête d'une fiche — le badge du §6.2
   * et les cinq axes de `talentCompleteness` n'existent pas sans elle.
   *
   * Refaire la dérivation côté fiche aurait donné DEUX calculs de
   * disponibilité, et deux chemins qui refont une dérivation divergent (loi 1
   * du tome 7). D'où cette lecture-ci : le MÊME `decorate()`, pour une ligne.
   *
   * ⚠️ Sans filtre `archived_at` : une fiche archivée se consulte, c'est le
   * vivier ACTIF qui l'écarte. Le workspace, lui, borne la lecture.
   */
  async summary(
    workspaceId: string,
    id: string,
    visibility: { finance: boolean } = { finance: false },
  ): Promise<TalentRow | null> {
    const rows = await this.consultants.manager.query<ConsultantEntity[]>(
      `SELECT c.* FROM consultants c WHERE c.workspace_id = $1 AND c.id = $2 LIMIT 1`,
      [workspaceId, id],
    )
    if (rows.length === 0) return null
    const [decorated] = await this.decorate(rows, new Date(), visibility)
    return decorated ?? null
  }

  /**
   * Les lignes brutes deviennent des lignes de VIVIER : disponibilité dérivée
   * des affectations, compétences typées avec leur source.
   *
   * Deux lectures groupées et non une par ligne — vingt-cinq talents ne doivent
   * pas produire cinquante requêtes. Un talent sans affectation ni compétence
   * n'est pas écarté : il rend `unknown` et une liste vide, ce qui est la
   * réponse honnête et ce que l'écran affichera.
   */
  private async decorate(
    rows: readonly ConsultantEntity[],
    now: Date,
    visibility: { finance: boolean } = { finance: false },
    userId?: string,
  ): Promise<TalentRow[]> {
    if (rows.length === 0) return []
    const ids = rows.map(row => row.id)

    // Théo C talents-vivier.A12 — MES favoris parmi ces lignes (jamais ceux d'un collègue).
    const favoriteIds = new Set<string>()
    if (userId) {
      const favorites = await this.consultants.manager.query<{ entity_id: string }[]>(
        `SELECT entity_id FROM user_favorites
          WHERE user_id = $1 AND entity_type = 'talent' AND entity_id = ANY($2)`,
        [userId, ids],
      )
      for (const favorite of favorites) favoriteIds.add(favorite.entity_id)
    }

    const assignments = await this.consultants.manager.query<
      { consultant_id: string; load_percent: number; starts_on: string; ends_on: string | null; mission_id: string }[]
    >(
      `SELECT consultant_id, load_percent, starts_on::text AS starts_on, ends_on::text AS ends_on, mission_id
         FROM mission_assignments WHERE consultant_id = ANY($1)`,
      [ids],
    )
    // #3068 — la MÊME interruption non confirmée que l'écran de fin de mission
    // (`mission_interruptions.availability_confirmed`) doit empêcher
    // `deriveStaffing` d'annoncer « disponible » ICI AUSSI (vivier, stats,
    // filtres) : c'était la fonction UNIQUE qui l'ignorait.
    const unconfirmed = await unconfirmedInterruptionMissionIds(
      this.consultants.manager,
      assignments.map(row => row.mission_id),
    )
    const windows = new Map<string, AssignmentWindow[]>()
    for (const row of assignments) {
      const list = windows.get(row.consultant_id) ?? []
      list.push({
        loadPercent: Number(row.load_percent),
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        interruptionUnconfirmed: unconfirmed.has(row.mission_id),
      })
      windows.set(row.consultant_id, list)
    }

    // Les cinq compétences les plus fortes par talent : la SOURCE d'abord (une
    // compétence prouvée en mission vaut mieux qu'une déclarée), le niveau
    // ensuite. Trier par ordre alphabétique montrerait « Ansible » et cacherait
    // « Kubernetes, expert, mission ».
    const skills = await this.consultants.manager.query<
      { consultant_id: string; skill: string; raw_label: string | null; level: string; source: string }[]
    >(
      `SELECT consultant_id, skill, raw_label, level, source FROM consultant_skills
        WHERE consultant_id = ANY($1)
        ORDER BY
          CASE source WHEN 'mission' THEN 0 WHEN 'interview' THEN 1 WHEN 'cv' THEN 2 ELSE 3 END,
          CASE level WHEN 'expert' THEN 0 WHEN 'confirme' THEN 1 WHEN 'autonome' THEN 2 WHEN 'notions' THEN 3 ELSE 4 END,
          skill`,
      [ids],
    )
    const byTalent = new Map<string, { skill: string; label: string; level: SkillLevel; source: SkillSource }[]>()
    for (const row of skills) {
      const list = byTalent.get(row.consultant_id) ?? []
      list.push({
        skill: row.skill,
        // Ce que la personne a écrit prime à l'affichage ; le canonique reste
        // la clé du rapprochement.
        label: row.raw_label ?? row.skill,
        level: row.level as SkillLevel,
        source: row.source as SkillSource,
      })
      byTalent.set(row.consultant_id, list)
    }

    // La dernière mission connue et le décompte des positionnements — deux
    // colonnes du §6.1 dont les données existaient sans qu'aucune lecture ne
    // les relie au vivier.
    const missions = await this.consultants.manager.query<
      {
        consultant_id: string
        label: string | null
        account_name: string | null
        ends_on: string | null
        starts_on: string | null
        daily_rate: number | string | null
      }[]
    >(
      `SELECT DISTINCT ON (ma.consultant_id)
              ma.consultant_id, m.label, a.company_name AS account_name, m.ends_on::text AS ends_on,
              ma.starts_on::text AS starts_on, m.daily_rate
         FROM mission_assignments ma
         JOIN missions m ON m.id = ma.mission_id
         LEFT JOIN accounts a ON a.id = m.account_id
        WHERE ma.consultant_id = ANY($1)
        ORDER BY ma.consultant_id, ma.starts_on DESC`,
      [ids],
    )
    const lastMission = new Map(missions.map(row => [row.consultant_id, row]))

    const submissions = await this.consultants.manager.query<{ consultant_id: string; open: string; total: string }[]>(
      `SELECT consultant_id,
              count(*) FILTER (WHERE closed_at IS NULL)::text AS open,
              count(*)::text AS total
         FROM submissions WHERE consultant_id = ANY($1)
        GROUP BY consultant_id`,
      [ids],
    )
    const bySubmission = new Map(submissions.map(row => [row.consultant_id, row]))

    // Théo C talents-vivier.R3 — les compétences PROUVÉES (mission, entretien : `isSkillSourceProven`),
    // l'axe « Compétences prouvées » du score. Comptées sur TOUTES les lignes typées, pas sur les cinq affichées.
    const provenCount = new Map<string, number>()
    for (const row of skills) {
      if (isSkillSourceProven(row.source as SkillSource)) {
        provenCount.set(row.consultant_id, (provenCount.get(row.consultant_id) ?? 0) + 1)
      }
    }
    // Théo C talents-vivier.N4 — le référent de la fiche, nommé pour la colonne « Suivi ».
    const ownerNames = await this.ownerNames(rows)

    return rows.map(row => {
      const owned = byTalent.get(row.id) ?? []
      const mission = lastMission.get(row.id)
      const counts = bySubmission.get(row.id)
      return {
        id: row.id,
        kind: row.kind === 'candidate' ? 'candidate' : 'consultant',
        fullName: row.full_name,
        title: row.title,
        seniority: row.seniority ?? 'inconnu',
        // #4016 L4.3 — les années voyagent ; la séniorité estimée se calcule à l'écran, jamais stockée.
        yearsExperience: row.years_experience ?? null,
        // #2186.14 — une disponibilité déclarée mais PÉRIMÉE (plus de
        // `AVAILABILITY_REVALIDATION_DAYS` jours sans revalidation) bascule
        // SEULE en `a_confirmer`, jamais en silence sur « disponible ».
        declaredAvailability: effectiveDeclaredAvailability(
          row.availability ?? 'inconnu',
          row.availability_checked_at,
          now,
        ),
        staffing: deriveStaffing(windows.get(row.id) ?? [], now),
        tjm: row.tjm,
        // Retirés — pas mis à zéro — quand l'appelant n'a pas `finance:read`.
        ...(visibility.finance
          ? {
              minTjmCents: row.min_tjm_cents === null ? null : Number(row.min_tjm_cents),
              // Le coût d'un salarié et le prix d'achat d'un freelance ne
              // s'appliquent jamais à la même personne : la colonne montre
              // celui qui vaut pour SA nature, jamais les deux.
              costCents:
                row.engagement_kind === 'salarie'
                  ? row.cost_rate_cents === null
                    ? null
                    : Number(row.cost_rate_cents)
                  : row.purchase_tjm_cents === null
                    ? null
                    : Number(row.purchase_tjm_cents),
            }
          : {}),
        financeVisible: visibility.finance,
        contractType: row.contract_type ?? 'inconnu',
        engagementKind: row.engagement_kind ?? 'inconnu',
        zones: row.zones ?? [],
        // #4016.8e — avec le dernier TJM vendu (celui de la mission, propagé en lecture seule).
        lastMission: lastMissionView(mission),
        submissions: { open: Number(counts?.open ?? 0), total: Number(counts?.total ?? 0) },
        source: row.source ?? null,
        archivedAt: row.archived_at instanceof Date ? row.archived_at.toISOString() : (row.archived_at ?? null),
        reviewStatus: row.review_status === 'needs_review' ? 'needs_review' : 'qualified',
        lastContactAt:
          row.last_contact_at instanceof Date ? row.last_contact_at.toISOString() : (row.last_contact_at ?? null),
        topSkills: owned.slice(0, 5),
        skillCount: owned.length,
        // Présence, jamais le contenu : la ligne du vivier ne réaffiche pas le
        // CV, seulement s'il en existe un — sert le filtre « CV disponible »
        // et l'axe « CV » de `talentCompleteness`.
        hasCv: Boolean(row.cv_text && row.cv_text.trim().length > 0),
        // `remote_preference` existait déjà sur la fiche (formulaire complet)
        // sans jamais atteindre la ligne du vivier.
        workMode: (row.remote_preference as TalentRow['workMode']) ?? null,
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
        // Théo C talents-vivier.N1/N2 — la déclaration DATÉE (jamais devinée : `null` reste `null`).
        declaredAvailableFrom: row.available_from ? String(row.available_from).slice(0, 10) : null,
        availabilityCheckedAt:
          row.availability_checked_at instanceof Date
            ? row.availability_checked_at.toISOString()
            : (row.availability_checked_at ?? null),
        ownerUserId: row.owner_user_id ?? null,
        ownerName: row.owner_user_id ? (ownerNames.get(row.owner_user_id) ?? null) : null,
        provenSkillCount: provenCount.get(row.id) ?? 0,
        isFavorite: favoriteIds.has(row.id),
      }
    })
  }

  /**
   * Théo C talents-vivier.A12 — poser ou retirer MON favori sur une fiche de l'espace.
   *
   * Un favori est personnel (`user_favorites`) : il ne change rien à la fiche et n'est visible d'aucun
   * collègue. La fiche doit être de l'espace de l'appelant — un favori sur un identifiant étranger
   * serait une écriture sur un objet que sa liste lui cache. Idempotent dans les deux sens.
   */
  async setFavorite(workspaceId: string, userId: string, talentId: string, isFavorite: boolean): Promise<boolean> {
    const talent = await this.consultants.findOne({ where: { id: talentId, workspace_id: workspaceId } })
    if (!talent) throw new NotFoundException('Talent introuvable')
    if (isFavorite) {
      await this.consultants.manager.query(
        `INSERT INTO user_favorites (user_id, entity_type, entity_id)
         VALUES ($1, 'talent', $2)
         ON CONFLICT (user_id, entity_type, entity_id) DO NOTHING`,
        [userId, talentId],
      )
      return true
    }
    await this.consultants.manager.query(
      `DELETE FROM user_favorites WHERE user_id = $1 AND entity_type = 'talent' AND entity_id = $2`,
      [userId, talentId],
    )
    return false
  }

  /**
   * Théo C talents-vivier.N4 — le nom du référent de chaque fiche, en UNE lecture.
   *
   * Même requête que `ConsultantsService.ownerNamesOf` (le référent est toujours un membre de
   * l'espace : `profiles`). Un confort d'affichage : une lecture qui échoue rend une table vide,
   * la ligne se lit alors « non attribuée » au lieu de faire tomber le vivier.
   */
  private async ownerNames(rows: readonly ConsultantEntity[]): Promise<ReadonlyMap<string, string>> {
    const ids = [...new Set(rows.map(row => row.owner_user_id).filter((id): id is string => Boolean(id)))]
    if (ids.length === 0) return new Map()
    try {
      const owners = await this.consultants.manager.query<
        { userId: string; firstName: string | null; lastName: string | null; email: string | null }[]
      >(
        `SELECT user_id AS "userId", first_name AS "firstName", last_name AS "lastName", email AS "email"
           FROM profiles WHERE user_id = ANY($1)`,
        [ids],
      )
      const entries: [string, string][] = []
      for (const owner of owners) {
        const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim() || (owner.email ?? '')
        if (name) entries.push([owner.userId, name])
      }
      return new Map(entries)
    } catch {
      return new Map()
    }
  }

  // ────────────────────────────────── stats ─────────────────────────────────

  /**
   * Le bandeau de statistiques du vivier (PDF-22, écran Vivier).
   *
   * Compte sur TOUT l'espace, jamais sur une page ni un filtre — même garde
   * que `HygieneBadge` (« deux chiffres qui divergent font douter des
   * deux »). Réutilise `decorate()` : la disponibilité DÉRIVÉE et la
   * complétude ne se recalculent nulle part ailleurs, pour ne pas finir par
   * dire autre chose que la recherche paginée sur les mêmes fiches.
   */
  async stats(workspaceId: string): Promise<TalentStats> {
    const rows = await this.consultants.manager.query<ConsultantEntity[]>(
      `SELECT c.* FROM consultants c WHERE c.workspace_id = $1 AND c.archived_at IS NULL`,
      [workspaceId],
    )
    const total = rows.length
    if (total === 0) {
      return {
        total: 0,
        availableNow: 0,
        // #1839 — 0 sur 0 est un zéro VRAI : la population entière est vide,
        // rien ne se tait.
        availabilityUnknownCount: 0,
        enrichedPercent: null,
        // #2182.10 — 0 sur 0 est un zéro VRAI, comme `availabilityUnknownCount`
        // ci-dessus : la population entière est vide, rien ne se tait.
        incompleteCount: 0,
        refreshedThisWeekPercent: null,
        lastUpdatedAt: null,
      }
    }

    const decorated = await this.decorate(rows, new Date(), { finance: false })
    const availableNow = decorated.filter(row => row.staffing.availability === 'available').length
    // #1839 — le COMPAGNON obligatoire d'`availableNow`, sur la MÊME
    // population `decorated` : les fiches sans aucune affectation enregistrée,
    // dont la disponibilité dérivée ne peut être ni « disponible » ni
    // « occupée » (voir le docblock de `availabilityUnknownCount`, talent.ts).
    const availabilityUnknownCount = decorated.filter(row => row.staffing.availability === 'unknown').length

    // « Enrichi » : au moins trois des cinq axes de complétude sont remplis —
    // la même définition, le même seuil, que « sous trois axes il n'y a pas de
    // score » (doctrine), appliquée ici à la complétude plutôt qu'au matching.
    // `ENRICHED_MIN_AXES` est exporté par `@bellum/contracts` (#2185.18) — un
    // seul endroit (GA-26) — et `talentPipelineStatus` (#2185.4) le réutilise
    // pour que l'action principale de la fiche talent lise le MÊME seuil.
    const enrichedCount = decorated.filter(
      row => talentCompleteness(row).axes.filter(axis => axis.score > 0).length >= ENRICHED_MIN_AXES,
    ).length
    const enrichedPercent = Math.round((enrichedCount / total) * 100)
    // #2182.10 — « Fiches incomplètes » : le COMPTE, pas un pourcentage — le
    // complément d'`enrichedCount` sur la MÊME population `decorated`, le
    // MÊME calcul et le MÊME seuil. Un second seuil ici divergerait du
    // premier au premier correctif (GA-26).
    const incompleteCount = total - enrichedCount

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const refreshedCount = rows.filter(row => new Date(row.updated_at).getTime() >= weekAgo).length
    const refreshedThisWeekPercent = Math.round((refreshedCount / total) * 100)

    const lastUpdatedAt = rows
      .map(row => new Date(row.updated_at).getTime())
      .reduce((latest, value) => Math.max(latest, value), 0)

    return {
      total,
      availableNow,
      availabilityUnknownCount,
      enrichedPercent,
      incompleteCount,
      refreshedThisWeekPercent,
      lastUpdatedAt: lastUpdatedAt > 0 ? new Date(lastUpdatedAt).toISOString() : null,
    }
  }

  // ──────────────────────────────── rétention ──────────────────────────────

  async readRetention(workspaceId: string): Promise<TalentRetention> {
    const rows = await this.consultants.manager.query<
      { talent_retention_months: number; talent_retention_enabled: boolean }[]
    >(`SELECT talent_retention_months, talent_retention_enabled FROM workspaces WHERE id = $1`, [workspaceId])
    const row = rows[0]
    return talentRetentionSchema.parse({
      months: row?.talent_retention_months ?? TALENT_RETENTION_MAX_MONTHS,
      enabled: row?.talent_retention_enabled ?? false,
    })
  }

  async writeRetention(workspaceId: string, input: TalentRetention): Promise<TalentRetention> {
    const parsed = talentRetentionSchema.parse(input)
    await this.consultants.manager.query(
      `UPDATE workspaces SET talent_retention_months = $2, talent_retention_enabled = $3 WHERE id = $1`,
      [workspaceId, parsed.months, parsed.enabled],
    )
    return parsed
  }

  /**
   * Combien de dossiers PARTIRAIENT si la purge tournait maintenant.
   *
   * Le chiffre est montré AVANT que la case se coche : armer un effacement
   * irréversible sans savoir ce qu'il emporte est le genre de réglage qu'on
   * regrette une fois.
   */
  async previewPurge(workspaceId: string, now: Date = new Date()): Promise<{ due: number; months: number }> {
    const retention = await this.readRetention(workspaceId)
    const candidates = await this.consultants.find({
      where: { workspace_id: workspaceId, kind: 'candidate' },
      select: ['id', 'kind', 'last_contact_at', 'created_at'],
    })
    const due = candidates.filter(row =>
      isTalentPurgeDue(
        {
          kind: 'candidate',
          lastContactAt: row.last_contact_at ? new Date(row.last_contact_at).toISOString() : null,
          createdAt: new Date(row.created_at).toISOString(),
        },
        retention.months,
        now,
      ),
    ).length
    return { due, months: retention.months }
  }

  /**
   * Efface les dossiers de candidature échus.
   *
   * Ne tourne QUE si l'espace a armé la purge, et ne touche QUE les candidats.
   * L'effacement est un vrai DELETE : une ligne anonymisée dit encore que
   * quelqu'un est passé, et ce n'est pas ce que la personne a demandé.
   */
  async purgeExpiredCandidates(workspaceId: string, now: Date = new Date()): Promise<number> {
    const retention = await this.readRetention(workspaceId)
    if (!retention.enabled) return 0

    const candidates = await this.consultants.find({
      where: { workspace_id: workspaceId, kind: 'candidate' },
      select: ['id', 'kind', 'last_contact_at', 'created_at'],
    })
    const expired = candidates
      .filter(row =>
        isTalentPurgeDue(
          {
            kind: 'candidate',
            lastContactAt: row.last_contact_at ? new Date(row.last_contact_at).toISOString() : null,
            createdAt: new Date(row.created_at).toISOString(),
          },
          retention.months,
          now,
        ),
      )
      .map(row => row.id)

    if (expired.length === 0) return 0
    // #4034.6 — les ORIGINAUX de CV ne partent pas par cascade : lus AVANT.
    const originals = await this.documents.manager.query<{ storage_path: string | null }[]>(
      `SELECT storage_path FROM consultant_documents
        WHERE consultant_id = ANY($1::uuid[]) AND storage_path IS NOT NULL`,
      [expired],
    )
    // Compétences et documents partent par cascade (`ON DELETE CASCADE`).
    await this.consultants.delete({ id: In(expired) })
    const paths = (originals ?? []).map(row => row.storage_path).filter((path): path is string => !!path)
    if (paths.length > 0) await this.storage?.remove(paths)
    this.logger.log(`Talent retention: ${expired.length} dossier(s) de candidature effacé(s)`, {
      tags: { 'talent.retention.months': String(retention.months) },
    })
    return expired.length
  }

  /** Le talent, ou 404. Un id d'un autre espace ne doit jamais répondre. */
  private async assertTalent(consultantId: string, workspaceId: string): Promise<ConsultantEntity> {
    const talent = await this.consultants.findOne({ where: { id: consultantId, workspace_id: workspaceId } })
    if (!talent) throw new NotFoundException('Talent introuvable')
    return talent
  }

  /** L'espace actif de l'appelant — sucre pour les contrôleurs. */
  async workspaceOf(userId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return workspaceId
  }
}

function toSkillWire(row: ConsultantSkillEntity): ConsultantSkill {
  const source = row.source as ConsultantSkill['source']
  const inferred = row.inferred ?? false
  const validatedByConsultantAt = row.validated_by_consultant_at
    ? new Date(row.validated_by_consultant_at).toISOString()
    : null
  const validatedByRecruiterAt = row.validated_by_recruiter_at
    ? new Date(row.validated_by_recruiter_at).toISOString()
    : null
  return {
    id: row.id,
    skill: row.skill,
    rawLabel: row.raw_label,
    level: row.level as ConsultantSkill['level'],
    years: row.years,
    lastUsedYear: row.last_used_year,
    source,
    createdAt: new Date(row.created_at).toISOString(),
    family: row.family ?? null,
    validatedLevel: (row.validated_level as ConsultantSkill['level'] | null) ?? null,
    certification: row.certification ?? false,
    clientFeedback: row.client_feedback ?? null,
    inferred,
    validatedByConsultantAt,
    validatedByRecruiterAt,
    confidence: computeSkillConfidence({ inferred, source, validatedByConsultantAt, validatedByRecruiterAt }),
    sourceExperienceId: row.source_experience_id ?? null,
    sourceProject: row.source_project ?? null,
  }
}

/** #3935.2b — la provenance d'une saisie manuelle : `human` sur chaque champ non vide. */
function humanExperienceProvenance(input: AddExperienceInput): ConsultantExperienceEntity['field_provenance'] {
  const written: Record<string, unknown> = {
    entreprise: input.entreprise,
    client_final: input.clientFinal,
    secteur: input.secteur,
    role: input.role,
    date_debut: input.dateDebut,
    date_fin: input.dateFin,
    contexte: input.contexte,
    realisations: input.realisations,
    responsabilites: input.responsabilites,
    preuve: input.preuve,
  }
  const provenance: ConsultantExperienceEntity['field_provenance'] = {}
  for (const [field, value] of Object.entries(written)) {
    if (typeof value === 'string' && value.trim() !== '') provenance[field] = 'human'
  }
  return provenance
}

function toExperienceWire(row: ConsultantExperienceEntity): ConsultantExperience {
  return {
    id: row.id,
    entreprise: row.entreprise,
    clientFinal: row.client_final,
    clientMasked: row.client_masked ?? false,
    clientMaskedReason: row.client_masked_reason,
    secteur: row.secteur,
    role: row.role,
    dateDebut: row.date_debut,
    dateFin: row.date_fin,
    dateDebutPrecision: row.date_debut_precision ?? null,
    dateFinPrecision: row.date_fin_precision ?? null,
    contexte: row.contexte,
    realisations: row.realisations,
    technologies: row.technologies ?? [],
    responsabilites: row.responsabilites,
    preuve: row.preuve,
    createdAt: new Date(row.created_at).toISOString(),
  }
}
