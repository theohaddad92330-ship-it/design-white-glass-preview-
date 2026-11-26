import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  anonymiseText,
  anonymisationSettingsSchema,
  consentState,
  cvValidationPolicySchema,
  diffCvVersions,
  effectiveAnonymisationRule,
  highlightedSkillsFor,
  initialCvVersionStatus,
  leaksFullName,
  type AnonymisationRule,
  type AnonymisationSettings,
  type CvValidationPolicy,
  type CvVersion,
  type CvVersionChange,
  type CvVersionDiff,
  type CvVersionStatus,
  type ExcludedSkill,
  type GenerateCvVersionInput,
  type TalentConsent,
} from '@bellum/contracts'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { CvVersionEntity } from '../../database/entities/cv-version.entity'
import { applyConsultantScope } from './consultant-scope'
import { excludedSkillsFor } from './cv-rewrite-guard'

/**
 * Le studio de dossier de compétences (PDF 3 §9, ticket BEL-ATS-202).
 *
 * Quatre garde-fous, un par accident réel :
 *
 * 1. **Aucune compétence ajoutée sans preuve**, et surtout : les compétences
 *    écartées sont RENDUES, avec leur raison. Le garde-fou existant retirait en
 *    silence ; une compétence retirée sans un mot fait croire que le profil ne
 *    l'a pas, alors qu'une compétence barrée avec « déclarée, aucune preuve »
 *    dit exactement ce qu'il faut dire à un client.
 * 2. **L'anonymisation est une fonction PURE appliquée APRÈS génération.**
 *    Jamais confiée au modèle : un modèle qui oublie une occurrence sur douze
 *    produit un document qui a l'air anonyme et ne l'est pas — pire que rien,
 *    parce que personne ne relit.
 * 3. **Versionnement** : chaque génération ajoute une ligne. Quand un client
 *    répond trois semaines plus tard, il faut savoir ce qu'il a reçu.
 * 4. **Vérification indépendante** : après anonymisation, on cherche le nom
 *    complet dans le document produit. Une fonction qui se vérifie elle-même ne
 *    vérifie rien.
 */
@Injectable()
export class CvStudioService {
  private readonly logger = new Logger(CvStudioService.name)

  constructor(
    @InjectRepository(ConsultantEntity)
    private readonly consultants: Repository<ConsultantEntity>,
    @InjectRepository(CvVersionEntity)
    private readonly versions: Repository<CvVersionEntity>,
  ) {}

  /** Le réglage d'anonymisation de l'espace. Repli sur « nom complet » — le
   *  comportement historique, qui ne surprend personne. */
  async settingsFor(workspaceId: string | null): Promise<AnonymisationSettings> {
    if (!workspaceId) return { rule: 'nom_complet', hide: [] }
    try {
      const rows = await this.consultants.manager.query<{ anonymisation_rule: string; anonymisation_hide: unknown }[]>(
        `SELECT anonymisation_rule, anonymisation_hide FROM workspaces WHERE id = $1`,
        [workspaceId],
      )
      const parsed = anonymisationSettingsSchema.safeParse({
        rule: rows[0]?.anonymisation_rule,
        hide: Array.isArray(rows[0]?.anonymisation_hide) ? rows[0]?.anonymisation_hide : [],
      })
      return parsed.success ? parsed.data : { rule: 'nom_complet', hide: [] }
    } catch {
      return { rule: 'nom_complet', hide: [] }
    }
  }

  /**
   * Écrit la règle de l'espace.
   *
   * Réservé à l'administration : la règle d'anonymisation décide de ce qui
   * sort de l'entreprise, et laisser chacun la changer reviendrait à ne pas en
   * avoir.
   */
  async writeSettings(workspaceId: string | null, input: AnonymisationSettings): Promise<AnonymisationSettings> {
    const parsed = anonymisationSettingsSchema.parse(input)
    if (!workspaceId) return parsed
    await this.consultants.manager.query(
      `UPDATE workspaces SET anonymisation_rule = $2, anonymisation_hide = $3::jsonb WHERE id = $1`,
      [workspaceId, parsed.rule, JSON.stringify(parsed.hide)],
    )
    return parsed
  }

  /**
   * QUI doit valider une version, sur cet espace (#2333.8).
   *
   * Même patron que {@link settingsFor} : une lecture en échec ou un espace
   * inconnu retombe sur `aucune` — le comportement historique, où la
   * génération elle-même vaut validation.
   */
  async validationPolicyFor(workspaceId: string | null): Promise<CvValidationPolicy> {
    if (!workspaceId) return 'aucune'
    try {
      const rows = await this.consultants.manager.query<{ cv_validation_policy: string }[]>(
        `SELECT cv_validation_policy FROM workspaces WHERE id = $1`,
        [workspaceId],
      )
      const parsed = cvValidationPolicySchema.safeParse(rows[0]?.cv_validation_policy)
      return parsed.success ? parsed.data : 'aucune'
    } catch {
      return 'aucune'
    }
  }

  /**
   * Les compétences demandées par un besoin (#2187.38).
   *
   * Même patron que {@link settingsFor} : une lecture en échec ou un besoin
   * d'un AUTRE espace retombe sur une liste vide — on ne met rien en avant
   * plutôt que de risquer une fuite entre espaces.
   */
  private async needSkills(needId: string, workspaceId: string | null): Promise<{ term: string }[]> {
    // #4559 — fail-closed : pas d'espace résolu ⇒ on ne lit rien. Une requête
    // sans filtre d'espace rendrait les compétences d'un besoin de n'importe qui.
    if (!workspaceId) return []
    try {
      const rows = await this.consultants.manager.query<{ skills: unknown }[]>(
        `SELECT skills FROM project_needs WHERE id = $1 AND workspace_id = $2`,
        [needId, workspaceId],
      )
      const skills = rows[0]?.skills
      if (!Array.isArray(skills)) return []
      return skills
        .filter((entry): entry is { term: unknown } => typeof entry === 'object' && entry !== null && 'term' in entry)
        .map(entry => ({ term: String(entry.term) }))
    } catch {
      return []
    }
  }

  /** #2187.25 — l'opportunité existe et appartient à CET espace. */
  private async assertOpportunityReachable(opportunityId: string, workspaceId: string | null): Promise<void> {
    // #4559 — fail-closed : sans espace résolu on refuse, on ne lit pas « tout »
    // (sinon l'existence d'une opportunité d'un autre espace serait observable).
    if (!workspaceId) throw new UnprocessableEntityException('Cette opportunité est introuvable dans ton espace.')
    const rows = await this.consultants.manager.query<{ id: string }[]>(
      `SELECT id FROM opportunities WHERE id = $1 AND workspace_id = $2`,
      [opportunityId, workspaceId],
    )
    if (rows.length === 0) throw new UnprocessableEntityException('Cette opportunité est introuvable dans ton espace.')
  }

  /** #2187.26 — l'appel d'offres existe et appartient à CET espace. */
  private async assertRfpReachable(rfpId: string, workspaceId: string | null): Promise<void> {
    // #4559 — même fail-closed que l'opportunité : sans espace résolu, on refuse
    // sans lire (l'existence d'un appel d'offres d'un autre espace resterait observable).
    if (!workspaceId) throw new UnprocessableEntityException('Cet appel d’offres est introuvable dans ton espace.')
    const rows = await this.consultants.manager.query<{ id: string }[]>(
      `SELECT id FROM rfps WHERE id = $1 AND workspace_id = $2`,
      [rfpId, workspaceId],
    )
    if (rows.length === 0) throw new UnprocessableEntityException('Cet appel d’offres est introuvable dans ton espace.')
  }

  /**
   * #2187.27 — la mission comparable doit être une mission DÉJÀ FAITE par CE
   * consultant : une mission comparable prise sur un autre profil inventerait
   * une expérience que la personne n'a pas eue.
   */
  private async assertMissionComparable(
    missionId: string,
    consultantId: string,
    workspaceId: string | null,
  ): Promise<void> {
    const refus = new UnprocessableEntityException(
      'Cette mission n’est pas une mission déjà faite par ce consultant — impossible de la prendre pour référence.',
    )
    // #4559.6 — même fail-closed que l'opportunité et l'appel d'offres : une mission porte TOUJOURS son espace
    // (`missions.workspace_id` non nul), donc sans espace résolu aucune n'est « la nôtre » — on refuse sans lire.
    if (!workspaceId) throw refus
    const rows = await this.consultants.manager.query<{ id: string }[]>(
      `SELECT m.id FROM missions m
         JOIN mission_assignments ma ON ma.mission_id = m.id
        WHERE m.id = $1 AND ma.consultant_id = $2 AND m.workspace_id = $3`,
      [missionId, consultantId, workspaceId],
    )
    if (rows.length === 0) throw refus
  }

  async listVersions(consultantId: string, workspaceId: string | null): Promise<CvVersion[]> {
    // #4559 (jumeau de .6) — sans espace, le filtre tombait et les versions de N'IMPORTE QUEL consultant
    // dont on connaît l'identifiant se lisaient. Fail-closed : rien.
    if (!workspaceId) return []
    const rows = await this.versions.find({
      where: { consultant_id: consultantId, workspace_id: workspaceId },
      order: { generated_at: 'DESC' },
      take: 50,
    })
    return rows.map(row => toWire(row))
  }

  /**
   * Génère une version et l'ENREGISTRE.
   *
   * Le corps vient du CV source, réordonné en sections — aucun appel de modèle
   * ici : le studio compose, il n'écrit pas. La réécriture par modèle reste le
   * geste séparé et payant qu'elle est (`cv-rewrite`), et les mélanger ferait
   * payer un crédit à chaque export.
   */
  /**
   * @param fromMatch Les compétences que LE BESOIN demandait et que le profil
   * ne prouve pas, telles que le matching les a nommées. Elles s'ajoutent à ce
   * que le studio barre déjà de son côté (des compétences déclarées absentes du
   * CV) : les deux listes répondent à deux questions différentes — « qu'est-ce
   * que cette personne revendique sans preuve ? » et « qu'est-ce que ce client
   * demandait qu'elle n'a pas ? ». Reprises MOT POUR MOT, parce qu'une
   * reformulation entre l'écran de matching et le dossier envoyé ferait diverger
   * ce qu'on dit en interne et ce qu'on écrit au client.
   */
  async generate(
    consultantId: string,
    workspaceId: string | null,
    userId: string,
    input: GenerateCvVersionInput,
    fromMatch: readonly ExcludedSkill[] = [],
  ): Promise<CvVersion> {
    // Cloisonnement via le prédicat partagé (finding pentest #2) : une fiche
    // sans espace d'une AUTRE ESN ne remonte pas. L'ancienne garde en ligne
    // s'effondrait sur `workspace_id IS NULL` et laissait fuir le `cv_text`.
    const talent = await applyConsultantScope(
      this.consultants.createQueryBuilder('c').where('c.id = :id', { id: consultantId }),
      'c',
      workspaceId,
      userId,
    ).getOne()
    if (!talent) {
      throw new NotFoundException('Consultant introuvable')
    }
    const cvText = talent.cv_text?.trim()
    if (!cvText) {
      // Sans CV source, il n'y a rien à composer. Un dossier fabriqué depuis
      // une fiche déclarative serait un document inventé sur une personne
      // réelle.
      throw new UnprocessableEntityException(
        'Aucun CV enregistré pour cette personne — dépose son CV avant de composer un dossier.',
      )
    }

    // #2187.25/.26/.27 — la source ciblée doit exister et être ATTEIGNABLE :
    // une opportunité ou un appel d'offres de l'espace, une mission déjà
    // faite par CE consultant. Jamais devinée sur un identifiant qui ne se
    // vérifie pas.
    if (input.opportunityId) await this.assertOpportunityReachable(input.opportunityId, workspaceId)
    if (input.rfpId) await this.assertRfpReachable(input.rfpId, workspaceId)
    if (input.comparableMissionId)
      await this.assertMissionComparable(input.comparableMissionId, consultantId, workspaceId)

    const workspaceSettings = await this.settingsFor(workspaceId)
    const rule: AnonymisationRule = effectiveAnonymisationRule(
      input.versionKind,
      input.anonymisationRule,
      workspaceSettings.rule,
    )
    const settings: AnonymisationSettings = { rule, hide: workspaceSettings.hide }

    const own = excludedSkillsFor(toContractShape(talent))
    const seen = new Set(own.map(entry => entry.term.toLowerCase()))
    const excluded: ExcludedSkill[] = [...own, ...fromMatch.filter(entry => !seen.has(entry.term.toLowerCase()))]
    const sections = buildSections(talent, cvText, excluded, settings)
    const changes = buildCvChanges(talent.stack ?? [], cvText, excluded)

    // #2187.38 — les compétences RETENUES qui recoupent le besoin ciblé, mises
    // en avant. Une simple intersection : jamais une compétence que le CV
    // source ne prouve pas.
    const excludedTerms = new Set(excluded.map(entry => entry.term.toLowerCase()))
    const retained = (talent.stack ?? []).filter(skill => !excludedTerms.has(skill.toLowerCase()))
    const neededSkills = input.needId ? await this.needSkills(input.needId, workspaceId) : []
    const highlightedSkills = highlightedSkillsFor(retained, neededSkills)

    // Le consentement PRIME sur la policy d'espace (#2333.8/.11) : un accord
    // expiré force la validation, on n'affirme jamais un dossier prêt sur une
    // personne dont le consentement n'est plus valide.
    const consent: TalentConsent = {
      givenAt: talent.consent_given_at ? talent.consent_given_at.toISOString() : null,
      expiresAt: talent.consent_expires_at ? talent.consent_expires_at.toISOString() : null,
      basis: talent.consent_basis ?? null,
      restrictions: talent.consent_restrictions ?? null,
    }
    const policy = await this.validationPolicyFor(workspaceId)
    const status: CvVersionStatus = initialCvVersionStatus(policy, consentState(consent, new Date()))
    // La génération est elle-même un geste utilisateur : quand aucune
    // validation supplémentaire n'est requise, CE geste vaut validation —
    // on n'invente pas un second validateur qui n'a pas eu lieu.
    const validatedBy = status === 'validated' ? userId : null
    const validatedAt = status === 'validated' ? new Date() : null

    // Vérification INDÉPENDANTE de l'anonymisation : on relit le document
    // produit et on y cherche le nom complet. Une fonction qui se vérifie
    // elle-même ne vérifie rien.
    if (rule !== 'nom_complet') {
      const leaked = sections.some(section => leaksFullName(section.body, talent.full_name))
      if (leaked) {
        this.logger.error('Anonymisation leak detected in a generated CV', {
          tags: { 'cv.rule': rule, 'cv.consultant': consultantId },
        })
        throw new UnprocessableEntityException(
          'Le nom complet subsiste dans le dossier généré — génération interrompue pour ne pas envoyer un document qui se prétend anonyme.',
        )
      }
    }

    const saved = await this.versions.save(
      this.versions.create({
        workspace_id: workspaceId,
        consultant_id: consultantId,
        need_id: input.needId ?? null,
        opportunity_id: input.opportunityId ?? null,
        rfp_id: input.rfpId ?? null,
        comparable_mission_id: input.comparableMissionId ?? null,
        version_kind: input.versionKind,
        template_key: input.templateKey,
        language: input.language,
        anonymisation_rule: rule,
        sections,
        excluded_skills: excluded,
        changes,
        highlighted_skills: highlightedSkills,
        generated_by: userId,
        sent_to_contact_id: null,
        status,
        validated_by: validatedBy,
        validated_at: validatedAt,
      }),
    )
    return toWire(saved)
  }

  /**
   * L'action « Comparer » (#2187.42, épopée #2943) : le diff entre DEUX
   * versions déjà générées, jamais un résumé — {@link diffCvVersions} nomme
   * chaque section changée et chaque compétence ajoutée/retirée.
   */
  async compare(
    consultantId: string,
    versionAId: string,
    versionBId: string,
    workspaceId: string | null,
  ): Promise<CvVersionDiff> {
    const versions = await this.listVersions(consultantId, workspaceId)
    const a = versions.find(entry => entry.id === versionAId)
    const b = versions.find(entry => entry.id === versionBId)
    if (!a || !b) throw new NotFoundException('Version introuvable')
    return diffCvVersions(a, b)
  }

  /**
   * L'action « Modifier » (#2187.42, épopée #2943).
   *
   * Réservée à une version PAS ENCORE validée : une fois validée, elle porte
   * ce qu'un client a pu recevoir et cesse de bouger — même principe que « CV
   * source immuable », appliqué à ce que le studio a déjà produit.
   */
  async updateSections(
    consultantId: string,
    versionId: string,
    workspaceId: string | null,
    sections: { title: string; body: string }[],
  ): Promise<CvVersion> {
    const row = await this.versions.findOne({
      where: workspaceId
        ? { id: versionId, consultant_id: consultantId, workspace_id: workspaceId }
        : { id: versionId, consultant_id: consultantId },
    })
    if (!row) throw new NotFoundException('Version introuvable')
    if (row.status === 'validated') {
      throw new UnprocessableEntityException(
        'Cette version est déjà validée — un client a pu la recevoir, elle ne se modifie plus.',
      )
    }
    row.sections = sections
    const saved = await this.versions.save(row)
    return toWire(saved)
  }

  /**
   * Le geste humain de validation (#2333.8/.9).
   *
   * Réservé aux versions déjà scopées : une version d'un autre espace n'existe
   * simplement pas pour cette requête, elle ne se refuse pas en 403.
   */
  async validate(
    consultantId: string,
    versionId: string,
    workspaceId: string | null,
    userId: string,
  ): Promise<CvVersion> {
    const row = await this.versions.findOne({
      where: workspaceId
        ? { id: versionId, consultant_id: consultantId, workspace_id: workspaceId }
        : { id: versionId, consultant_id: consultantId },
    })
    if (!row) throw new NotFoundException('Version introuvable')
    row.status = 'validated'
    row.validated_by = userId
    row.validated_at = new Date()
    const saved = await this.versions.save(row)
    return toWire(saved)
  }
}

/**
 * Le diff COMPLET d'une génération : chaque compétence déclarée, retenue ou
 * barrée — jamais un résumé global (#2333.5).
 *
 * `sourceProof` cite un extrait RÉEL du CV source quand la compétence y est
 * repérée ; `null` sinon — y compris quand elle est retenue via une preuve de
 * mission passée par `fromMatch` (§ ci-dessus) : on ne fabrique jamais une
 * citation qui n'existe pas dans ce texte.
 */
export function buildCvChanges(
  stack: readonly string[],
  cvText: string,
  excluded: readonly ExcludedSkill[],
): CvVersionChange[] {
  const reasonFor = new Map(excluded.map(entry => [entry.term, entry.reason]))
  return stack.filter(Boolean).map(skill => {
    const reason = reasonFor.get(skill)
    if (reason) {
      return {
        before: `compétence déclarée : ${skill}`,
        after: 'retirée du dossier',
        reason,
        sourceProof: null,
      }
    }
    const proof = sourceSnippet(cvText, skill)
    return {
      before: `compétence déclarée : ${skill}`,
      after: 'retenue dans le dossier',
      reason: proof ? 'présente dans le CV source' : 'retenue — correspondance avec le besoin ciblé',
      sourceProof: proof,
    }
  })
}

/** Un extrait du CV source autour de la première occurrence du terme, ou
 *  `null` s'il n'y apparaît pas littéralement. */
function sourceSnippet(cvText: string, term: string): string | null {
  const idx = cvText.toLowerCase().indexOf(term.toLowerCase())
  if (idx === -1) return null
  const start = Math.max(0, idx - 20)
  const end = Math.min(cvText.length, idx + term.length + 40)
  return cvText.slice(start, end).replace(/\s+/g, ' ').trim()
}

/**
 * Le dossier → les sections que les constructeurs de documents attendent.
 *
 * Pur : la mise en page est ce qui casse dans un export, et ça ne se voit qu'à
 * l'ouverture chez le client. Le rendre testable sans monter un service est la
 * seule façon de s'en apercevoir avant.
 */
export function cvVersionToDocSections(version: CvVersion): { heading: string; paragraphs: string[] }[] {
  return version.sections.map(section => ({
    heading: section.title,
    // Les lignes vides d'un CV structurent la lecture ; les garder produirait
    // des paragraphes vides dans le document. On coupe, on ne reformate pas.
    paragraphs: section.body
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean),
  }))
}

/**
 * Le corps du dossier, section par section.
 *
 * Rien n'est ajouté : les sections REPRENNENT le CV source et la fiche. Le
 * §9.1 veut une synthèse, les compétences retenues, les missions et « ce que je
 * n'ai pas pu dire » — cette dernière section est la plus utile, parce qu'elle
 * anticipe la question du client au lieu de la subir.
 */
function buildSections(
  talent: ConsultantEntity,
  cvText: string,
  excluded: readonly ExcludedSkill[],
  settings: AnonymisationSettings,
): { title: string; body: string }[] {
  const anonymise = (text: string): string =>
    anonymiseText(text, { fullName: talent.full_name, email: talent.email, phone: talent.phone }, settings)

  const excludedTerms = new Set(excluded.map(entry => entry.term))
  const retained = (talent.stack ?? []).filter(skill => !excludedTerms.has(skill))

  const sections: { title: string; body: string }[] = [
    {
      title: 'Profil',
      body: anonymise(
        [talent.title, `${(talent.stack ?? []).length} compétences déclarées`].filter(Boolean).join(' — '),
      ),
    },
    { title: 'Compétences retenues', body: retained.join(' · ') || 'Aucune compétence prouvée par le CV.' },
    { title: 'Parcours', body: anonymise(cvText) },
  ]

  if (excluded.length > 0) {
    // « Ce que je n'ai pas pu dire » — la section qui prépare la question du
    // client plutôt que de la subir en soutenance.
    sections.push({
      title: 'Ce que ce dossier ne prouve pas',
      body: excluded.map(entry => `${entry.term} : ${entry.reason}`).join('\n'),
    })
  }
  return sections
}

/** L'entité → la forme que le garde-fou attend. */
function toContractShape(talent: ConsultantEntity): Parameters<typeof excludedSkillsFor>[0] {
  return {
    ...(talent as unknown as Parameters<typeof excludedSkillsFor>[0]),
    stack: talent.stack ?? [],
    cv_text: talent.cv_text,
    full_name: talent.full_name,
  }
}

function toWire(row: CvVersionEntity): CvVersion {
  return {
    id: row.id,
    consultantId: row.consultant_id,
    needId: row.need_id,
    opportunityId: row.opportunity_id,
    rfpId: row.rfp_id,
    comparableMissionId: row.comparable_mission_id,
    versionKind: row.version_kind as CvVersion['versionKind'],
    templateKey: row.template_key,
    language: row.language,
    anonymisationRule: row.anonymisation_rule as AnonymisationRule,
    sections: row.sections ?? [],
    excludedSkills: row.excluded_skills ?? [],
    changes: row.changes ?? [],
    highlightedSkills: row.highlighted_skills ?? [],
    generatedBy: row.generated_by,
    generatedAt: row.generated_at instanceof Date ? row.generated_at.toISOString() : String(row.generated_at),
    sentToContactId: row.sent_to_contact_id,
    status: (row.status as CvVersion['status']) ?? 'validated',
    validatedBy: row.validated_by,
    validatedAt: row.validated_at instanceof Date ? row.validated_at.toISOString() : row.validated_at,
  }
}
