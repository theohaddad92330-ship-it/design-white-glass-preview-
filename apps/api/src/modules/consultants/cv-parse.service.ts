import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  CV_DETECTIONS,
  canAutoAccept,
  decideFieldWrite,
  fromStoredExperienceDate,
  parsedFieldSchema,
  planExperienceWrites,
  provenanceForDecision,
  readAvailabilityFromDetection,
  readEmailFromIdentity,
  readExperiencesFromDetection,
  readLanguagesFromDetection,
  readLocationFromIdentity,
  readPersonNameFromIdentity,
  readPhoneFromIdentity,
  readProfileUrlFromIdentity,
  toStoredExperienceDate,
  type AvailabilityEnumValue,
  type CvCommitInput,
  type CvDetection,
  type CvExperience,
  type FieldSource,
  type IdentityNameRefusal,
  type ParsedField,
  type ProvenanceDecisionReason,
} from '@bellum/contracts'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { ConsultantExperienceEntity } from '../../database/entities/consultant-experience.entity'
import { IaClient } from '../ia/ia.client'
import { scriptedDemoParse } from './cv-parse-demo'
import { seedTypedSkills, syncStackFromSkills } from './skill-seed'

/** Ce que l'écran de revue reçoit. */
type CvParseProposal = {
  fields: ParsedField[]
  sourceChars: number
  /** Le CV lu, pour surligner les extraits en face des champs. */
  cvText: string
  /** « Tout accepter » est-il permis ? Calculé par la fonction pure partagée. */
  canAcceptAll: boolean
  /**
   * #2542.3 — vrai quand le `cv_text` source vient d'une lecture PARTIELLE
   * (#1954.16/.30 : une page sans calque texte au milieu d'un dossier
   * autrement numérique, posé au dépôt par `CvIntakeService`). L'écran de
   * revue s'en sert pour dire qu'un champ « non trouvé » ici n'est pas
   * confirmé absent du CV — « non mesuré n'est jamais 0 » (GA-18/GA-19).
   */
  partial: boolean
}

/**
 * Pourquoi un champ VALIDÉ n'a finalement rien écrit.
 *
 * Deux familles, et elles ne disent pas la même chose : la valeur lue n'était
 * pas exploitable (`IdentityNameRefusal`), ou elle l'était mais quelqu'un avait
 * mieux en base (`ProvenanceDecisionReason`).
 */
type UnwrittenReason = IdentityNameRefusal | ProvenanceDecisionReason

/** Ce que la validation a réellement écrit. */
type CvCommitOutcome = {
  applied: { detection: CvDetection; provenance: 'human' | 'model' }[]
  rejected: CvDetection[]
  /**
   * Les champs validés qui n'ont RIEN écrit, avec leur raison.
   *
   * Concerne les SIX blocs qui ont une colonne AVEC un refus possible —
   * `identity` → `full_name`, `job_title` → `title`, `skills` → `stack`,
   * `sectors`, `mobility` → `zones`, `availability` (lot 19, #1789). Les
   * autres (`experiences`, `certifications`…) restent silencieux, et c'est
   * délibéré : personne n'attend qu'ils atterrissent quelque part. Ceux-là,
   * si — l'utilisateur vient de les valider et regarde la fiche. Un silence,
   * là, se lit « le produit est cassé ». ⚠️ L'e-mail, le téléphone et la ville
   * (`writeIdentityContact`, `writeIdentityLocation`, #2183.21) n'y figurent
   * PAS : leur absence dans le texte lu n'est jamais un refus de forme, à la
   * différence du nom.
   */
  unwritten: { detection: CvDetection; reason: UnwrittenReason }[]
  /**
   * Les colonnes RÉELLEMENT écrites, avec la provenance de la décision (D379).
   *
   * Sans cette liste, l'arbitrage ne tient qu'une revue : la revue n°1 écrit
   * `title` et personne n'enregistre d'où la valeur vient ; la revue n°2 lit une
   * provenance INCONNUE, que le contrat traite en `pipeline` (rang 2), et refuse
   * une acceptation (`model`, rang 1) — alors que deux propositions de modèle
   * devraient se départager par la plus récente. Un arbitre sans mémoire refuse
   * ses propres écritures.
   *
   * C'est le contrôleur qui la consigne : la garde GA-07 fige les imports
   * service → service, et il est la couche où un geste d'utilisateur traverse
   * légitimement deux domaines.
   */
  written: { column: string; previous: unknown; value: unknown; source: FieldSource }[]
  /** La fiche passe-t-elle en `qualified` ? Seulement après un geste humain. */
  qualified: boolean
}

/**
 * Le parsing d'un CV et sa validation (PDF 3 §4, ticket BEL-ATS-201).
 *
 * Deux gestes, délibérément séparés, et c'est toute la garde :
 *
 *  - **`propose` n'écrit RIEN.** Il lit le CV et rend des champs proposés. Une
 *    compétence écrite en base avant validation deviendrait une compétence du
 *    vivier — donc un profil poussé sur un besoin — sans que personne l'ait
 *    relue ;
 *  - **`commit` écrit ce qu'un humain a validé**, champ par champ, et c'est le
 *    seul chemin qui fait passer une fiche en `qualified`. C'est l'invariant du
 *    §3.3. ⚠️ On lit souvent que l'AI Act l'exigerait « depuis le 02/08/2026 » ;
 *    une autre source reporte l'échéance au 02/12/2027, et aucune des deux n'a
 *    été vérifiée contre le texte du règlement. La revue humaine ne dépend
 *    d'aucune date — c'est un invariant du produit, pas une mise en conformité.
 *
 * La provenance suit la décision : un champ CORRIGÉ est `human` et l'emporte
 * sur toute réécriture ultérieure ; un champ accepté tel quel reste `model` —
 * accepter n'est pas écrire.
 */
@Injectable()
export class CvParseService {
  private readonly logger = new Logger(CvParseService.name)

  constructor(
    @InjectRepository(ConsultantEntity)
    private readonly consultants: Repository<ConsultantEntity>,
    private readonly ia: IaClient,
    // #3935.2b — les expériences lues dans le CV s'écrivent dans LEUR table.
    // `@Optional()` : sans dépôt monté, la lecture reste byte-identique (no-op).
    @Optional()
    @InjectRepository(ConsultantExperienceEntity)
    private readonly experiences?: Repository<ConsultantExperienceEntity>,
  ) {}

  /**
   * Lit le CV d'un talent et PROPOSE. N'écrit rien.
   *
   * `demo` bascule sur une lecture SCRIPTÉE, dérivée du CV réellement seedé :
   * en salle de démonstration, aucun appel de modèle ne part, et le geste se
   * montre quand même. Même arbitrage que la structuration d'un compte rendu.
   */
  async propose(
    id: string,
    workspaceId: string | null,
    userId: string,
    options: { demo?: boolean } = {},
  ): Promise<CvParseProposal> {
    const talent = await this.findScoped(id, workspaceId, userId)
    const cvText = talent.cv_text?.trim()
    if (!cvText) {
      // Pas de matière : on refuse au lieu de laisser un modèle composer une
      // fiche à partir de rien.
      throw new UnprocessableEntityException(
        'Aucun CV enregistré pour cette personne — dépose son CV avant de le faire relire.',
      )
    }

    // #2542.1 — mesuré pendant le call client de Ludovic Marx : le bouton
    // « Analyser » restait « en analyse » sans qu'aucune erreur ne remonte.
    // L'appel au service IA n'était pas protégé : un rejet (service
    // injoignable, timeout après les trois tentatives du client HTTP)
    // remontait tel quel, sans cause nommée. Un document jamais traité ne
    // reste jamais « en analyse » : il se termine, toujours, avec une raison
    // lisible et un geste à faire (réessayer).
    let envelope: unknown
    if (options.demo) {
      envelope = null
    } else {
      try {
        envelope = await this.ia.cvParse({ cvText })
      } catch (error) {
        this.logger.warn(`CV parse: le service de lecture n'a pas répondu pour ${id}`, { error })
        throw new ServiceUnavailableException(
          'Le service de lecture du CV est indisponible pour le moment. Réessaie dans un instant.',
        )
      }
    }
    const fields = options.demo ? scriptedDemoParse(cvText) : readFields(envelope)
    if (fields.length === 0) {
      throw new UnprocessableEntityException(
        'La lecture du CV n’a rien produit d’exploitable. Réessaie, ou saisis les champs à la main.',
      )
    }
    return {
      fields,
      sourceChars: cvText.length,
      cvText,
      canAcceptAll: canAutoAccept(fields),
      // #2542.3 — porté par la fiche, posé au dépôt (`CvIntakeService`) : la
      // relecture n'a pas sa propre notion de page manquante, elle hérite de
      // celle du texte qu'elle lit.
      partial: talent.cv_extraction_partial ?? false,
    }
  }

  /**
   * Écrit ce qui a été validé, et QUALIFIE la fiche.
   *
   * Un champ `reject` n'écrit rien — le refuser est une décision, pas un
   * oubli. Un champ dont la valeur ne se traduit pas en colonne est ignoré
   * silencieusement côté écriture mais compté dans `applied` : le §4.2 promet
   * une revue champ par champ, pas une écriture champ par champ, et prétendre
   * le contraire ferait chercher des données là où il n'y en a pas.
   */
  async commit(
    id: string,
    workspaceId: string | null,
    userId: string,
    input: CvCommitInput,
    /**
     * La provenance ACTUELLE de chaque colonne de la fiche, lue par le
     * contrôleur (qui est la seule couche autorisée à traverser deux domaines
     * — GA-07). Absente, l'arbitre traite la valeur en place comme `pipeline`.
     */
    currentSources: Partial<Record<string, FieldSource>> = {},
  ): Promise<CvCommitOutcome> {
    const talent = await this.findScoped(id, workspaceId, userId)
    const { applied, rejected, unwritten, written, patch, validatedSkills } = applyFields(
      talent,
      input.fields,
      currentSources,
    )

    // La qualification est le POINT du ticket : elle n'arrive qu'ici, après un
    // geste humain, jamais à la création.
    patch.review_status = 'qualified'
    patch.qualified_at = new Date()

    Object.assign(talent, patch)
    await this.consultants.save(talent)

    // Les compétences validées rejoignent le référentiel typé, source `cv`.
    // Sans ce semis, un CV relu champ par champ remplissait la liste libre et
    // laissait l'onglet « Compétences » de la fiche vide — le défaut trouvé en
    // recette sur la saisie manuelle, au deuxième chemin d'écriture.
    // Le niveau reste `inconnu` : un CV dit qu'une compétence est là, jamais à
    // quel niveau, et la garde anti-invention du parsing s'arrête au champ.
    if (validatedSkills) {
      try {
        await seedTypedSkills(this.consultants.manager, {
          consultantId: talent.id,
          workspaceId: talent.workspace_id,
          stack: validatedSkills,
          source: 'cv',
        })
        // #5016.1 — le référentiel fait foi : la liste libre le rejoint, sinon un
        // CV validé laissait la fiche et l'onglet « Compétences » en désaccord.
        await syncStackFromSkills(this.consultants.manager, {
          consultantId: talent.id,
          workspaceId: talent.workspace_id,
        })
      } catch (error) {
        this.logger.error(`Semis des compétences impossible pour ${id}`, { error })
      }
    }

    const experienceField = input.fields.find(field => field.detection === 'experiences')
    const experienceSource = experienceField ? provenanceForDecision(experienceField.decision) : null
    if (experienceField && experienceSource) {
      await this.writeExperiences(talent, experienceField.value ?? null, experienceSource, null)
    }

    this.logger.log(
      `CV review committed for ${id}: ${applied.length} accepted, ${rejected.length} rejected, ${unwritten.length} unwritten`,
    )

    return { applied, rejected, unwritten, written, qualified: true }
  }

  /**
   * LECTURE AUTOMATIQUE à l'import (04/10/2026, `c88_lecture_auto_cv_import`,
   * import ZIP de 688 CV) — la proposition du modèle est ÉCRITE d'office sur
   * les colonnes de {@link CV_AUTO_READ_DETECTIONS}, en provenance `model`,
   * SANS qualifier : la fiche reste `needs_review`, c'est toujours un humain
   * qui la valide.
   *
   * Trois garde-fous, tous déjà là et réutilisés tels quels :
   *  - l'arbitre `decideFieldWrite` : `model` (rang 1) n'écrase NI un champ
   *    corrigé à la main (`human`) NI une valeur en place sans provenance
   *    (`pipeline`) — « une correction humaine gagne toujours » ;
   *  - une fiche déjà `qualified` ou archivée n'est pas touchée du tout ;
   *  - décision Louis 12/10 (`c97_cv_lu_fiche_qualifiee`) : une lecture
   *    RÉUSSIE qualifie la fiche ; une lecture en échec la laisse `needs_review` ;
   *  - aucun champ sans preuve (`parsedFieldSchema`), aucune valeur inventée :
   *    un bloc vide n'écrit rien.
   *
   * `demo` : lecture SCRIPTÉE (`scriptedDemoParse`), zéro appel modèle.
   * Aucun crédit débité — la lecture est incluse dans l'import.
   *
   * Rend `null` quand la fiche n'a rien à lire (pas de CV, déjà qualifiée) —
   * jamais une erreur pour un cas attendu. Laisse REMONTER l'indisponibilité
   * du service IA (`ServiceUnavailableException`) : la file la réessaie.
   */
  async autoRead(
    id: string,
    workspaceId: string,
    userId: string,
    currentSources: Partial<Record<string, FieldSource>>,
    options: { demo?: boolean } = {},
  ): Promise<{ written: CvCommitOutcome['written']; qualified: boolean } | null> {
    const talent = await this.findScoped(id, workspaceId, userId)
    // Une fiche archivée ne se lit ni ne se qualifie (12/10).
    // c97 (12/10) — une fiche déjà `qualified` SE RELIT : `qualified` ne dit plus « un humain
    // a validé » (un CV lu qualifie). Ce qu'un humain a touché est protégé champ par champ
    // (`applyFields`, provenance `human`) ; les rattrapages excluent les fiches `human`.
    if (talent.archived_at || !talent.cv_text?.trim()) return null
    // `qualified` rendu = le PASSAGE `needs_review` → `qualified` fait par CETTE lecture
    // (ce que l'appelant journalise) ; une fiche déjà qualifiée le reste, sans passage.
    const wasQualified = talent.review_status === 'qualified'

    let fields: ParsedField[]
    try {
      ;({ fields } = await this.propose(id, workspaceId, userId, options))
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        // Rien d'exploitable : la fiche reste lisible, rien n'est inventé.
        // Décision Louis 12/10 — CV lu = fiche qualifiée (renverse c88 sur ce point) :
        // le modèle a répondu, la fiche est lue donc qualifiée, même vide.
        talent.cv_auto_read_at = new Date()
        if (!wasQualified) {
          talent.review_status = 'qualified'
          talent.qualified_at = new Date()
        }
        await this.consultants.save(talent)
        return { written: [], qualified: !wasQualified }
      }
      throw error
    }

    const accepted = fields
      .filter(field => CV_AUTO_READ_DETECTIONS.includes(field.detection) && field.value !== null)
      .map(field => ({
        detection: field.detection,
        // `accept` = provenance `model` (rang 1) : jamais au-dessus d'un humain.
        decision: 'accept' as const,
        value: field.value as CvCommitInput['fields'][number]['value'],
      }))
    const { written, patch } = applyFields(talent, accepted, currentSources)

    // Décision Louis 12/10 — CV lu = fiche qualifiée (renverse c88 sur ce point)
    const now = new Date()
    Object.assign(talent, patch, {
      cv_auto_read_at: now,
      review_status: 'qualified',
      qualified_at: wasQualified ? (talent.qualified_at ?? now) : now,
    })
    await this.consultants.save(talent)
    // #3935.2b — l'extrait cité par le modèle devient la PREUVE de l'expérience.
    const experienceField = fields.find(field => field.detection === 'experiences' && field.value !== null)
    if (experienceField) {
      await this.writeExperiences(talent, experienceField.value, 'model', experienceField.sourceExcerpt || null)
    }
    this.logger.log(`CV auto-read for ${id}: ${written.length} column(s) written (source model)`)
    return { written, qualified: !wasQualified }
  }

  /**
   * #3935.2b — le bloc `experiences` → `consultant_experiences`, ARBITRÉ champ
   * par champ (`planExperienceWrites`, `@bellum/contracts`) : une ligne inconnue
   * s'ajoute, une ligne déjà là ne se complète que là où l'arbitre l'autorise —
   * jamais au-dessus d'un humain ni d'une provenance inconnue. Rien n'est
   * retiré. Un échec ici ne défait pas la fiche déjà écrite : il se journalise.
   */
  private async writeExperiences(
    talent: ConsultantEntity,
    value: ParsedField['value'],
    source: FieldSource,
    excerpt: string | null,
  ): Promise<void> {
    if (!this.experiences) return
    const incoming = readExperiencesFromDetection(value)
    if (incoming.length === 0) return
    try {
      const existing = await this.experiences.find({
        where: { consultant_id: talent.id, ...(talent.workspace_id ? { workspace_id: talent.workspace_id } : {}) },
      })
      const plan = planExperienceWrites({
        incoming,
        existing: existing.map(row => ({
          id: row.id,
          values: {
            role: row.role,
            entreprise: row.entreprise,
            // #3935 (lot P03) — relues à LEUR précision (« 2019 », « 2019-03 ») :
            // l'arbitre, inchangé, compare des valeurs dans la forme de la lecture.
            date_debut: fromStoredExperienceDate(row.date_debut, row.date_debut_precision ?? null),
            date_fin: fromStoredExperienceDate(row.date_fin, row.date_fin_precision ?? null),
            realisations: row.realisations,
          },
          provenance: row.field_provenance ?? {},
        })),
        source,
      })
      for (const insert of plan.inserts) {
        await this.experiences.save(
          this.experiences.create({
            consultant_id: talent.id,
            workspace_id: talent.workspace_id,
            ...toStoredExperience(insert.values),
            preuve: excerpt,
            field_provenance: insert.provenance as ConsultantExperienceEntity['field_provenance'],
          }),
        )
      }
      for (const update of plan.updates) {
        const current = existing.find(row => row.id === update.id)
        await this.experiences.update(
          { id: update.id, consultant_id: talent.id },
          {
            ...toStoredExperience(update.patch),
            field_provenance: {
              ...(current?.field_provenance ?? {}),
              ...update.provenance,
            } as ConsultantExperienceEntity['field_provenance'],
          },
        )
      }
      this.logger.log(
        `CV experiences for ${talent.id}: ${plan.inserts.length} added, ${plan.updates.length} completed (source ${source})`,
      )
    } catch (error) {
      this.logger.error(`Écriture des expériences du CV impossible pour ${talent.id}`, { error })
    }
  }

  private async findScoped(id: string, workspaceId: string | null, userId: string): Promise<ConsultantEntity> {
    const qb = this.consultants.createQueryBuilder('c').where('c.id = :id', { id })
    if (workspaceId) {
      qb.andWhere('(c.workspace_id = :workspaceId OR (c.workspace_id IS NULL AND c.user_id = :userId))', {
        workspaceId,
        userId,
      })
    } else {
      qb.andWhere('c.user_id = :userId', { userId })
    }
    const found = await qb.getOne()
    if (!found) throw new NotFoundException('Consultant introuvable')
    return found
  }
}

/**
 * Les blocs que la lecture automatique écrit (04/10/2026,
 * `c88_lecture_auto_cv_import`) : le nom/contacts/ville (`identity`),
 * l'intitulé, les compétences, la mobilité, la disponibilité. La séniorité
 * y est depuis le 15/10 en ANNÉES (`years_experience`) ; la colonne `seniority`
 * (un palier `junior`…`expert`) n'est JAMAIS écrite d'ici — convertir des
 * années en palier serait inventer un barème.
 */
const CV_AUTO_READ_DETECTIONS: readonly CvDetection[] = [
  'identity',
  'job_title',
  'skills',
  'mobility',
  'availability',
  // #3935.2 (08/10/2026) — même garde-fou que les autres : `decideFieldWrite`
  // gèle la liste entière dès qu'un humain l'a tenue, jamais de fusion
  // silencieuse.
  'languages',
  // #3935.2a — « lire tous les CV tout le temps automatiquement » : ce que la
  // fiche porte désormais, la lecture automatique l'écrit aussi (en `model`).
  'environments',
  'tools',
  'certifications',
  // #3935.2b — écrites dans `consultant_experiences` (hors `applyFields`), voir
  // `writeExperiences` : arbitrées par champ, jamais au-dessus d'un humain.
  'experiences',
  // #3935 (décision Louis 15/10/2026, renverse celle du 31/08) — les ANNÉES d'expérience et le TJM
  // sont LUS quand le CV les écrit. Arbitrés comme le reste : une saisie humaine gagne.
  'seniority',
  'daily_rate',
]

/**
 * Le cœur commun de la revue (`commit`) et de la lecture automatique
 * (`autoRead`) : chaque champ décidé passe par SON écrivain arbitré. Ne
 * sauvegarde rien, ne qualifie rien — c'est l'appelant qui décide.
 */
function applyFields(
  talent: ConsultantEntity,
  fields: CvCommitInput['fields'],
  currentSources: Partial<Record<string, FieldSource>>,
): {
  applied: CvCommitOutcome['applied']
  rejected: CvDetection[]
  unwritten: CvCommitOutcome['unwritten']
  written: CvCommitOutcome['written']
  patch: Partial<ConsultantEntity>
  validatedSkills: string[] | null
} {
  const applied: CvCommitOutcome['applied'] = []
  const rejected: CvDetection[] = []
  const unwritten: CvCommitOutcome['unwritten'] = []
  const written: CvCommitOutcome['written'] = []
  const patch: Partial<ConsultantEntity> = {}
  /**
   * La liste de compétences que le recruteur a VALIDÉE — indépendamment du
   * sort réservé à la colonne `stack`. Le référentiel typé (`consultant_skills`)
   * a sa propre règle, additive, et le module de semis la dit : « retirer un
   * mot de la liste libre ne doit jamais supprimer une compétence prouvée ».
   * Faire dépendre le semis de l'écriture de la liste libre reviendrait à
   * désactiver le référentiel typé au premier arbitrage — une capacité perdue
   * en silence, et personne n'a demandé de la retirer.
   */
  let validatedSkills: string[] | null = null

  for (const field of fields) {
    const provenance = provenanceForDecision(field.decision)
    if (!provenance) {
      rejected.push(field.detection)
      continue
    }
    if (field.detection === 'skills') validatedSkills = readListValue(field.value ?? null)
    // `identity` et `availability` gardent leur chemin à eux : leur valeur
    // doit d'abord être LUE (l'une empaquette quatre informations dans une
    // seule chaîne, l'autre packe un texte libre dans un vocabulaire fermé)
    // avant d'être arbitrée. Les autres colonnes n'ont que l'arbitrage.
    if (field.detection === 'identity') {
      const refusal = writeFullName(patch, talent, field.value ?? null, provenance, currentSources, written)
      if (refusal) unwritten.push({ detection: 'identity', reason: refusal })
      // Lot 19 (#1789) — l'e-mail et le téléphone sont dans CETTE MÊME
      // valeur, lus, affichés, jamais écrits : aucun code n'existait pour
      // les en sortir. Ils s'arbitrent chacun INDÉPENDAMMENT du nom : un
      // agrégat qui refuse le nom (`joins_several_items`, `carries_contact`)
      // peut très bien porter une adresse parfaitement identifiable — c'est
      // exactement le CV mesuré en production le 10/09.
      writeIdentityContact(patch, talent, field.value ?? null, provenance, currentSources, written)
      // #2183.21 — même agrégat, même règle : la ville s'arbitre
      // indépendamment du sort du nom, jamais en cascade.
      writeIdentityLocation(patch, talent, field.value ?? null, provenance, currentSources, written)
      // #3935.2 — même agrégat, même règle : l'URL de profil (LinkedIn, Malt…)
      // s'arbitre indépendamment du sort du nom, jamais en cascade.
      writeIdentityProfileUrl(patch, talent, field.value ?? null, provenance, currentSources, written)
    } else if (field.detection === 'languages') {
      // #3935.2 — forme `{code, level}[]` dédiée, comme `availability` : ni la
      // forme de la valeur ni l'arbitrage générique de `writeColumn` (texte ou
      // liste de chaînes) ne conviennent à cette colonne.
      writeLanguages(patch, talent, field.value ?? null, provenance, currentSources, written)
    } else if (field.detection === 'seniority') {
      writeNumberColumn(
        patch,
        talent,
        'years_experience',
        readYearsValue(field.value ?? null),
        provenance,
        currentSources,
        written,
      )
    } else if (field.detection === 'daily_rate') {
      writeNumberColumn(
        patch,
        talent,
        'tjm',
        readDailyRateValue(field.value ?? null),
        provenance,
        currentSources,
        written,
      )
    } else if (field.detection === 'availability') {
      const refusal = writeAvailability(patch, talent, field.value ?? null, provenance, currentSources, written)
      if (refusal) unwritten.push({ detection: 'availability', reason: refusal })
    } else {
      const refusal = writeColumn(
        patch,
        talent,
        field.detection,
        field.value ?? null,
        provenance,
        currentSources,
        written,
      )
      if (refusal) unwritten.push({ detection: field.detection, reason: refusal })
    }
    applied.push({ detection: field.detection, provenance })
  }

  return { applied, rejected, unwritten, written, patch, validatedSkills }
}

/**
 * Le bloc `identity` → `consultants.full_name`, ou rien AVEC sa raison (D367).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUI DÉCIDE — et la réponse était déjà écrite
 * ─────────────────────────────────────────────────────────────────────────────
 * Un nom lu dans un CV est une hypothèse de machine sur l'identité d'une
 * personne : le produit ne l'écrit pas tout seul. Mais il n'a pas fallu
 * inventer une porte — elle existait, et elle était déjà branchée : l'écran de
 * revue rend les DOUZE blocs avec accepter / corriger / refuser, `identity`
 * compris, et `POST /parse/commit` reçoit la décision. Elle était simplement
 * JETÉE À L'ARRIVÉE, faute de colonne déclarée pour elle (la carte
 * `DETECTION_COLUMNS` d'aujourd'hui, un `switch` à l'époque).
 *
 * Ce lot ne rebranche donc aucune détection et n'ajoute aucun appel de modèle :
 * il arrête de jeter une décision d'utilisateur. `identity` passe par la même
 * porte que `job_title`, `skills`, `sectors` et `mobility` — celle du §4.2.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX FILTRES, ET ILS NE PROTÈGENT PAS LA MÊME CHOSE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **La forme** — `readPersonNameFromIdentity`. Le bloc empaquette quatre
 *    informations (nom, e-mail, téléphone, ville) dans une valeur qui n'a
 *    aucune structure. Mesuré le 30/08 : les six formes que le prompt autorise
 *    passent le validateur serveur 8 fois sur 8. Écrire la valeur telle quelle
 *    remplacerait le nom du fichier par un agrégat — un remplissage par un
 *    autre.
 * 2. **L'autorité** — `decideFieldWrite`. « Une correction humaine gagne
 *    toujours, quelle que soit sa date. » Sans arbitre, relire le même CV et
 *    ACCEPTER la proposition du modèle écraserait le nom que quelqu'un avait
 *    corrigé à la main : sans erreur, sans log, et la personne cesse de
 *    corriger.
 *
 * Un refus n'est jamais silencieux : il remonte dans `unwritten` avec son
 * motif. « On n'a rien écrit » sans raison enverrait relancer la même lecture
 * sur le même CV.
 */
function writeFullName(
  patch: Partial<ConsultantEntity>,
  talent: ConsultantEntity,
  value: unknown,
  provenance: FieldSource,
  currentSources: Partial<Record<string, FieldSource>>,
  written: CvCommitOutcome['written'],
): UnwrittenReason | null {
  const read = readPersonNameFromIdentity(value as ParsedField['value'])
  if (read.name === null) return read.refusal

  const decision = decideFieldWrite({
    incomingValue: read.name,
    incomingSource: provenance,
    currentValue: talent.full_name,
    currentSource: currentSources['full_name'] ?? null,
  })
  // `unchanged` n'est pas un refus : la fiche porte déjà ce nom, et le dire
  // « non écrit » ferait chercher un problème là où il n'y en a pas.
  if (!decision.write) return decision.reason === 'unchanged' ? null : decision.reason

  patch.full_name = read.name
  // Le nom LU, pas la valeur brute du bloc : celui-ci empaquette jusqu'à quatre
  // informations, et journaliser l'agrégat ferait croire que c'est ce qui a été
  // écrit dans la colonne.
  written.push({ column: 'full_name', previous: talent.full_name ?? null, value: read.name, source: provenance })
  return null
}

/**
 * L'e-mail et le téléphone packés dans le bloc `identity` — la moitié de D367
 * qui manquait (lot 19, #1789).
 *
 * Mesuré en production le 10/09 : un CV dont l'identité s'écrit « Nom —
 * e-mail — téléphone — ville » voyait son NOM refusé À JUSTE TITRE
 * (`writeFullName`, `carries_contact`) — mais l'e-mail et le téléphone du
 * MÊME bloc, eux, n'avaient aucun chemin d'écriture : `consultants.email` et
 * `consultants.phone` existent, rien ne les avait jamais alimentés depuis un
 * CV. Contrairement au nom, une adresse a une forme reconnaissable sans
 * ambiguïté (`readEmailFromIdentity`/`readPhoneFromIdentity`, `@bellum/contracts`)
 * : l'extraire d'un agrégat est une CITATION, pas une devinette — c'est pour
 * ça qu'elle s'arbitre indépendamment du sort du nom, jamais en cascade.
 *
 * Ne renvoie rien : contrairement au nom, l'absence d'adresse dans le texte
 * n'est jamais un refus de FORME à signaler dans `unwritten` — un bloc
 * `identity` qui ne porte qu'un nom est un CV normal.
 */
function writeIdentityContact(
  patch: Partial<ConsultantEntity>,
  talent: ConsultantEntity,
  value: unknown,
  provenance: FieldSource,
  currentSources: Partial<Record<string, FieldSource>>,
  written: CvCommitOutcome['written'],
): void {
  const typed = value as ParsedField['value']

  const email = readEmailFromIdentity(typed)
  if (email) {
    const decision = decideFieldWrite({
      incomingValue: email,
      incomingSource: provenance,
      currentValue: talent.email,
      currentSource: currentSources['email'] ?? null,
    })
    if (decision.write) {
      patch.email = email
      written.push({ column: 'email', previous: talent.email ?? null, value: email, source: provenance })
    }
  }

  const phone = readPhoneFromIdentity(typed)
  if (phone) {
    const decision = decideFieldWrite({
      incomingValue: phone,
      incomingSource: provenance,
      currentValue: talent.phone,
      currentSource: currentSources['phone'] ?? null,
    })
    if (decision.write) {
      patch.phone = phone
      written.push({ column: 'phone', previous: talent.phone ?? null, value: phone, source: provenance })
    }
  }
}

/**
 * La ville packée dans le bloc `identity`, vers `consultants.location`
 * (#2183.21).
 *
 * Même agrégat que {@link writeIdentityContact}, même principe : une ville
 * accolée à un code (« Paris (75) ») est une CITATION, pas une devinette
 * (`readLocationFromIdentity`, `@bellum/contracts`) — elle s'arbitre donc
 * indépendamment du sort du nom, jamais en cascade avec son refus. Une ville
 * nue, sans forme reconnaissable, reste `null` : ce n'est jamais un refus de
 * FORME à signaler dans `unwritten`, un bloc `identity` sans code postal ni
 * département est un CV parfaitement normal.
 */
function writeIdentityLocation(
  patch: Partial<ConsultantEntity>,
  talent: ConsultantEntity,
  value: unknown,
  provenance: FieldSource,
  currentSources: Partial<Record<string, FieldSource>>,
  written: CvCommitOutcome['written'],
): void {
  const location = readLocationFromIdentity(value as ParsedField['value'])
  if (!location) return

  const decision = decideFieldWrite({
    incomingValue: location,
    incomingSource: provenance,
    currentValue: talent.location,
    currentSource: currentSources['location'] ?? null,
  })
  if (decision.write) {
    patch.location = location
    written.push({ column: 'location', previous: talent.location ?? null, value: location, source: provenance })
  }
}

/**
 * L'URL de profil professionnel (LinkedIn, Malt…) packée dans le bloc
 * `identity`, vers `consultants.public_profile_url` (#3935.2, 08/10/2026).
 *
 * Même agrégat que {@link writeIdentityContact}/{@link writeIdentityLocation},
 * même principe : une URL a une FORME reconnaissable sans deviner
 * (`readProfileUrlFromIdentity`, `@bellum/contracts`), donc elle s'arbitre
 * indépendamment du sort du nom, jamais en cascade avec son refus. La colonne
 * a DÉJÀ deux autres chemins d'écriture (saisie manuelle, enrichissement
 * `talent-enrichment.ts`) : celui-ci passe par le même arbitre de provenance
 * que tous les autres, donc une URL saisie ou confirmée à la main n'est jamais
 * écrasée par une relecture de CV.
 */
function writeIdentityProfileUrl(
  patch: Partial<ConsultantEntity>,
  talent: ConsultantEntity,
  value: unknown,
  provenance: FieldSource,
  currentSources: Partial<Record<string, FieldSource>>,
  written: CvCommitOutcome['written'],
): void {
  const url = readProfileUrlFromIdentity(value as ParsedField['value'])
  if (!url) return

  const decision = decideFieldWrite({
    incomingValue: url,
    incomingSource: provenance,
    currentValue: talent.public_profile_url,
    currentSource: currentSources['public_profile_url'] ?? null,
  })
  if (decision.write) {
    patch.public_profile_url = url
    written.push({
      column: 'public_profile_url',
      previous: talent.public_profile_url ?? null,
      value: url,
      source: provenance,
    })
  }
}

/**
 * Le bloc `languages` → `consultants.languages` (`{code, level}[]`, jsonb),
 * ARBITRÉ (#3935.2, 08/10/2026).
 *
 * Signalé « chantier à part » au lot 19 (#1789) : la colonne existait, la
 * détection aussi, rien ne les reliait — le format `{code, level}` demandait
 * sa propre lecture (`readLanguagesFromDetection`), ni du texte simple
 * (`title`) ni une liste de chaînes (`stack`/`sectors`/`zones`).
 *
 * Même politique de GEL que {@link writeColumn} pour les listes : une liste de
 * langues tenue par un humain n'est jamais réécrite par une acceptation de
 * modèle, elle est remplacée EN BLOC seulement par une autre correction
 * humaine. Le coût est le même qu'ailleurs et nommé pour la même raison : rien
 * ne mémorise qu'un humain a retiré une langue, donc fusionner la
 * ressusciterait à la prochaine relecture.
 */
function writeLanguages(
  patch: Partial<ConsultantEntity>,
  talent: ConsultantEntity,
  value: unknown,
  provenance: FieldSource,
  currentSources: Partial<Record<string, FieldSource>>,
  written: CvCommitOutcome['written'],
): void {
  const incoming = readLanguagesFromDetection(value as ParsedField['value'])
  if (incoming === null) return

  const previous = talent.languages ?? []
  const decision = decideFieldWrite({
    incomingValue: incoming,
    incomingSource: provenance,
    currentValue: previous.length > 0 ? previous : null,
    currentSource: currentSources['languages'] ?? null,
  })
  if (!decision.write) return

  patch.languages = incoming
  written.push({ column: 'languages', previous, value: incoming, source: provenance })
}

/** `'inconnu'` est le DÉFAUT SQL de `consultants.availability`, pas une valeur
 *  qu'un humain ou un fournisseur a un jour AFFIRMÉE. `decideFieldWrite` ne le
 *  sait pas — `isBlank('inconnu')` est faux, une chaîne non vide — et sans
 *  cet aplatissement, la toute première lecture d'un CV neuf serait déjà
 *  refusée (`lower_authority`, `model` contre le `pipeline` par défaut d'une
 *  provenance jamais enregistrée) : la colonne resterait `inconnu` à VIE,
 *  silencieusement, exactement le symptôme mesuré en production le 10/09. */
function blankIfDefaultAvailability(value: string): string | null {
  return value === 'inconnu' ? null : value
}

/**
 * Le bloc `availability` → `consultants.availability`, ARBITRÉ (D381, lot 19,
 * #1789).
 *
 * `availability` figure parmi les treize détections et la colonne SQL existe
 * (`CHECK (availability IN (...))`, `1788013450112-Consultants`) — rien ne les
 * reliait : `DETECTION_COLUMNS` ne la portait pas, et l'écran l'affichait avec
 * sa confiance sans que « Valider » n'écrive jamais rien. `readAvailabilityFromDetection`
 * (`@bellum/contracts`) fait le pont entre le texte libre lu et le vocabulaire
 * fermé de la colonne, sans jamais deviner une catégorie sur un délai
 * approximatif.
 */
function writeAvailability(
  patch: Partial<ConsultantEntity>,
  talent: ConsultantEntity,
  value: unknown,
  provenance: FieldSource,
  currentSources: Partial<Record<string, FieldSource>>,
  written: CvCommitOutcome['written'],
): ProvenanceDecisionReason | null {
  const incoming: AvailabilityEnumValue | null = readAvailabilityFromDetection(value as ParsedField['value'])
  if (incoming === null) return null

  const previous = talent.availability
  const decision = decideFieldWrite({
    incomingValue: incoming,
    incomingSource: provenance,
    currentValue: blankIfDefaultAvailability(previous),
    currentSource: currentSources['availability'] ?? null,
  })
  // `unchanged` n'est pas un refus : la fiche porte déjà cette valeur, et le
  // dire « non écrit » ferait chercher un problème là où il n'y en a pas.
  if (!decision.write) return decision.reason === 'unchanged' ? null : decision.reason

  patch.availability = incoming
  written.push({ column: 'availability', previous, value: incoming, source: provenance })
  return null
}

/**
 * Un bloc validé → la colonne de fiche qu'il alimente, quand il en a une.
 *
 * Tous les blocs n'en ont pas, et c'est assumé :
 *  - `environments`, `tools` et `certifications` ont leur colonne depuis le
 *    09/10/2026 (#3935.2a) ; `experiences` n'est pas une colonne de fiche —
 *    sa table (`consultant_experiences`) s'écrit hors de cette carte, par
 *    `writeExperiences` (#3935.2b) ;
 *  - `education`, lui, EN A UNE depuis #2784 (`consultants.education`,
 *    `20260927195301-ConsultantEducation`) — même mécanique que `sectors`,
 *    une liste gelée entière par correction humaine (voir plus bas) ;
 *  - la séniorité reste SAISIE : la déduire d'un parsing la rendrait fausse
 *    sur tous les CV sans dates (décision de Louis du 31/08/2026) — ⚠️ l'issue
 *    #3935 (08/10/2026) redemande explicitement cette lecture ; ce lot ne la
 *    rebranche PAS, le conflit avec la décision du 31/08 est nommé au
 *    commentaire de l'issue plutôt que tranché ici ;
 *  - `languages` A une colonne (`consultants.languages`, jsonb) et un chemin
 *    d'écriture depuis le 08/10/2026 (#3935.2, `writeLanguages` plus bas) —
 *    signalé « chantier à part » au lot 19 (#1789), c'est cette découpe.
 *
 * ⚠️ `identity` et `availability` ne sont pas dans cette carte : leur valeur
 * doit d'abord être LUE (`readPersonNameFromIdentity`/`readEmailFromIdentity`/
 * `readPhoneFromIdentity`/`readAvailabilityFromDetection`) avant d'être
 * arbitrée, ce qu'aucun autre bloc ne demande. Leur absence ici n'est pas un
 * oubli — ce sont `writeFullName`/`writeIdentityContact`/`writeAvailability`.
 */
const DETECTION_COLUMNS: Readonly<
  Partial<
    Record<
      CvDetection,
      'title' | 'stack' | 'sectors' | 'zones' | 'education' | 'environments' | 'tools' | 'certifications'
    >
  >
> = {
  job_title: 'title',
  skills: 'stack',
  sectors: 'sectors',
  mobility: 'zones',
  education: 'education',
  // #3935.2a — lus depuis l'origine, écrits depuis le 09/10/2026 : même liste
  // gelée par une correction humaine que `education`, provenance par champ via
  // `written` → `field_provenance`. Un bloc vide n'écrit rien (`readListValue`
  // rend `null`) : la colonne reste NON LUE, jamais une liste vide inventée.
  environments: 'environments',
  tools: 'tools',
  certifications: 'certifications',
}

/** Le premier nombre d'un texte lu (« 8 ans », « TJM : 550 €/jour », « 1 200 € »), ou `null`. */
function firstNumberIn(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const match = value.replace(/[\u00a0\u202f ](?=\d{3}\b)/g, '').match(/\d+(?:[.,]\d+)?/)
  if (!match) return null
  const parsed = Number(match[0].replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

/** Années d'expérience LUES : un entier plausible (0 est une vraie réponse), sinon rien. */
function readYearsValue(value: unknown): number | null {
  const years = firstNumberIn(value)
  return years !== null && years >= 0 && years <= 60 ? Math.floor(years) : null
}

/** TJM LU, en euros par jour : un entier plausible, sinon rien — jamais 0, jamais estimé. */
function readDailyRateValue(value: unknown): number | null {
  const rate = firstNumberIn(value)
  return rate !== null && rate >= 100 && rate <= 5000 ? Math.round(rate) : null
}

/** Une colonne numérique lue, ARBITRÉE comme les autres (humain > modèle, un blanc n'écrase rien). */
function writeNumberColumn(
  patch: Partial<ConsultantEntity>,
  talent: ConsultantEntity,
  column: 'years_experience' | 'tjm',
  incoming: number | null,
  provenance: FieldSource,
  currentSources: Partial<Record<string, FieldSource>>,
  written: CvCommitOutcome['written'],
): void {
  if (incoming === null) return
  const previous = talent[column] ?? null
  const decision = decideFieldWrite({
    incomingValue: incoming,
    incomingSource: provenance,
    currentValue: previous,
    currentSource: currentSources[column] ?? null,
  })
  if (!decision.write) return
  patch[column] = incoming
  written.push({ column, previous, value: incoming, source: provenance })
}

/** Une valeur de bloc → du texte, ou `null`. Jamais une valeur de remplissage. */
function readTextValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number') return String(value)
  return null
}

/** Une valeur de bloc → une liste non vide, ou `null`. L'ORDRE lu est conservé :
 *  ces listes décrivent des compétences et des zones, jamais un rang de personne. */
function readListValue(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const items = value.map(item => String(item).trim()).filter(Boolean)
    return items.length > 0 ? items : null
  }
  const single = readTextValue(value)
  return single ? [single] : null
}

/**
 * Le bloc validé → sa colonne, ARBITRÉE, ou rien AVEC sa raison (D378).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * `full_name` était arbitré depuis D368, les quatre autres colonnes ne l'étaient
 * pas : elles étaient posées sur le patch sans rien demander. Un commercial
 * corrige l'intitulé de poste d'un consultant, quelqu'un relit le même CV et
 * clique « Accepter » sur le bloc — la correction disparaissait, sans erreur et
 * sans log. « Une correction humaine gagne toujours, quelle que soit sa date. »
 *
 * L'arbitre ne gêne que là : `accept` vaut `model` (rang 1) et `correct` vaut
 * `human` (rang 4). Une fiche sans provenance enregistrée est traitée en
 * `pipeline` (rang 2) — donc une acceptation ne pouvait déjà rien écraser d'un
 * humain, et n'écrase toujours rien d'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS LISTES — GEL TOTAL, ET POURQUOI PAS « GEL DES RETRAITS »
 * ─────────────────────────────────────────────────────────────────────────────
 * `stack`, `sectors` et `zones` sont des LISTES, et « une correction humaine
 * gagne » n'y a pas une seule lecture possible. Deux étaient défendables :
 *
 *  - **geler la liste entière** — ce qui est fait ici. Une liste écrite par un
 *    humain n'est pas réécrite par une acceptation, point ;
 *  - **ne geler que les retraits** — fusionner la proposition du modèle dans la
 *    liste tenue à la main, en n'y remettant pas ce que l'humain en avait ôté.
 *
 * La seconde est plus séduisante et elle est INTENABLE aujourd'hui : rien, dans
 * le dépôt, ne se souvient qu'un recruteur a retiré « PHP » de ce profil. Sans
 * cette mémoire, « fusionner sauf les retraits » dégénère en « fusionner », et
 * chaque relecture du CV ressusciterait la compétence supprimée — exactement ce
 * qu'un utilisateur ne s'attend pas à voir. La mémoire existe ailleurs dans le
 * produit sous forme de PIERRE TOMBALE (`dismissed_at`), pas d'arbitre ; la
 * poser pour les compétences d'un talent est un chantier à part, avec sa table
 * et son écran, pas une ligne à glisser ici. Et l'inventer sur place ferait
 * vivre une deuxième règle d'arbitrage à côté de `decideFieldWrite`.
 *
 * Le coût du gel est nommé, et il est petit : le recruteur qui veut ajouter la
 * compétence nouvelle clique « corriger » au lieu d'« accepter », dans le même
 * écran et le même geste. Le refus lui est DIT (`unwritten`), il n'a rien à
 * deviner. Le gel ne contredit jamais une intention ; la fusion, si.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS ARBITRÉ, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Une valeur ILLISIBLE (bloc vide, liste sans terme exploitable) n'écrit rien et
 * ne se reproche à personne — c'est le comportement d'avant l'arbitre, et le
 * garder évite qu'un `correct` sur un bloc laissé vide à l'écran VIDE la
 * colonne. Vider un champ reste possible, mais par la fiche, où le geste est
 * explicite : `decideFieldWrite` n'accepte un blanc que d'un humain, et ici le
 * blanc ne vient pas de lui, il vient d'une lecture qui n'a rien trouvé.
 */
function writeColumn(
  patch: Partial<ConsultantEntity>,
  talent: ConsultantEntity,
  detection: CvDetection,
  value: unknown,
  provenance: FieldSource,
  currentSources: Partial<Record<string, FieldSource>>,
  written: CvCommitOutcome['written'],
): ProvenanceDecisionReason | null {
  const column = DETECTION_COLUMNS[detection]
  if (!column) return null

  const incoming = column === 'title' ? readTextValue(value) : readListValue(value)
  if (incoming === null) return null

  const previous = talent[column] ?? null
  const decision = decideFieldWrite({
    incomingValue: incoming,
    incomingSource: provenance,
    currentValue: previous,
    currentSource: currentSources[column] ?? null,
  })
  // `unchanged` n'est pas un refus : la fiche porte déjà cette valeur, et le
  // dire « non écrit » ferait chercher un problème là où il n'y en a pas.
  if (!decision.write) return decision.reason === 'unchanged' ? null : decision.reason

  // La colonne vient de `DETECTION_COLUMNS`, une carte littérale et fermée : le
  // nom écrit ne peut pas venir d'une valeur d'entrée.
  ;(patch as Record<string, unknown>)[column] = incoming
  written.push({ column, previous, value: incoming, source: provenance })
  return null
}

/** L'enveloppe IA → des champs VALIDÉS par le contrat partagé. */
function readFields(envelope: unknown): ParsedField[] {
  if (!envelope || typeof envelope !== 'object') return []
  const data = (envelope as { data?: unknown }).data
  if (!data || typeof data !== 'object') return []
  const raw = (data as { fields?: unknown }).fields
  if (!Array.isArray(raw)) return []

  const byDetection = new Map<string, ParsedField>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    // Deuxième validation, après celle du service IA. La règle « pas de champ
    // sans preuve » est trop importante pour ne vivre qu'à un seul endroit :
    // une régression côté IA passerait sinon jusqu'à l'écran.
    const parsed = parsedFieldSchema.safeParse({
      detection: row['detection'],
      value: row['value'] ?? null,
      confidence: typeof row['confidence'] === 'number' ? row['confidence'] : 0,
      sourceExcerpt: typeof row['source_excerpt'] === 'string' ? row['source_excerpt'] : '',
      excerptOffset: typeof row['excerpt_offset'] === 'number' ? row['excerpt_offset'] : null,
    })
    if (parsed.success) byDetection.set(parsed.data.detection, parsed.data)
  }

  // Les treize blocs sortent TOUJOURS, dans l'ordre du §4 : un bloc absent de
  // la liste se lirait comme un oubli d'affichage plutôt que comme « ce CV ne
  // le dit pas ».
  return CV_DETECTIONS.map(
    detection =>
      byDetection.get(detection) ?? {
        detection,
        value: null,
        confidence: 0,
        sourceExcerpt: '',
        excerptOffset: null,
      },
  )
}

/**
 * #3935 (lot P03, décision Louis 09/10) — une expérience lue (dates dans la forme
 * de la lecture : « 2019 », « 2019-03 ») → les colonnes de `consultant_experiences`.
 * Une date et sa précision voyagent ENSEMBLE : un champ de date que l'arbitre n'a
 * pas retenu n'est pas dans `values`, sa précision n'est donc jamais écrite seule
 * au-dessus d'une date humaine.
 */
function toStoredExperience(values: Partial<CvExperience>): Partial<ConsultantExperienceEntity> {
  const { date_debut, date_fin, ...rest } = values
  const stored: Partial<ConsultantExperienceEntity> = { ...rest }
  if (date_debut !== undefined) {
    const { date, precision } = toStoredExperienceDate(date_debut)
    stored.date_debut = date
    stored.date_debut_precision = precision
  }
  if (date_fin !== undefined) {
    const { date, precision } = toStoredExperienceDate(date_fin)
    stored.date_fin = date
    stored.date_fin_precision = precision
  }
  return stored
}
