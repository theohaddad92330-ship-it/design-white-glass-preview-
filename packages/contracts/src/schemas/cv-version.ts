import { z } from 'zod'
import { anonymisationRuleSchema } from './cv-anonymisation.js'
import { type ConsentState } from './talent-consent.js'

/**
 * Une version de dossier de compétences (PDF 3 §9, ticket BEL-ATS-202).
 *
 * Le dépôt avait `consultant_cv_rewrites` : UNE ligne par couple
 * (consultant, besoin), écrasée à chaque régénération. Le §9.2 exige l'inverse,
 * et pour une raison très concrète : quand un client répond trois semaines plus
 * tard sur un dossier, il faut savoir ce qu'il a reçu. Une ligne écrasée ne le
 * dit plus, et personne ne peut alors expliquer un écart entre ce que le client
 * cite et ce que la fiche contient aujourd'hui.
 *
 * `consultant_cv_rewrites` n'est PAS supprimée : elle porte le CV courant du
 * panneau de matching, qui marche. Les versions s'ajoutent à côté.
 */

/** Les cinq versions du §9. Le « CV optimisé pour un besoin » n'en est PAS une
 *  sixième : c'est le CV client généré avec un besoin en contexte. */
export const CV_VERSION_KINDS = ['source', 'client', 'anonyme', 'enrichi', 'resume'] as const
export const cvVersionKindSchema = z.enum(CV_VERSION_KINDS)
export type CvVersionKind = (typeof CV_VERSION_KINDS)[number]

/**
 * Une compétence ÉCARTÉE du dossier, avec sa raison.
 *
 * Le §9.2 est explicite : « barrées, jamais supprimées en silence ». Une
 * compétence retirée sans un mot fait croire que le profil ne l'a pas ; une
 * compétence barrée avec « déclarée, aucune preuve » dit exactement ce qu'il
 * faut dire à un client — et prépare la question qu'il posera.
 */
export const excludedSkillSchema = z
  .object({
    term: z.string().min(1).max(120),
    reason: z.string().min(1).max(300),
  })
  .strict()
export type ExcludedSkill = z.infer<typeof excludedSkillSchema>

/**
 * UN changement du dossier vis-à-vis de la fiche source (#2333.5).
 *
 * Chaque compétence déclarée produit un changement — retenue ou barrée —
 * jamais un résumé global. `sourceProof` est la preuve dans le CV source
 * quand la compétence est retenue, `null` quand elle est barrée : on ne
 * fabrique pas la preuve d'une absence.
 */
export const cvVersionChangeSchema = z
  .object({
    before: z.string().min(1).max(300),
    after: z.string().min(1).max(300),
    reason: z.string().min(1).max(300),
    sourceProof: z.string().nullable(),
  })
  .strict()
export type CvVersionChange = z.infer<typeof cvVersionChangeSchema>

/**
 * Le cycle de vie d'une version (#2333.8/.9).
 *
 * `draft` n'existe pas encore côté génération (le studio compose et enregistre
 * en un seul geste), mais le champ reste à trois valeurs pour porter un futur
 * brouillon sans dérive de schéma. Deux valeurs suffisent au comportement
 * actuel — `pending_validation` en attente d'un geste humain, `validated`
 * quand il a eu lieu ou que la policy d'espace ne l'exige pas.
 */
export const CV_VERSION_STATUSES = ['draft', 'pending_validation', 'validated'] as const
export const cvVersionStatusSchema = z.enum(CV_VERSION_STATUSES)
export type CvVersionStatus = (typeof CV_VERSION_STATUSES)[number]

/**
 * QUI doit valider une version, par espace (#2333.8).
 *
 * `aucune` : la génération elle-même — un geste utilisateur — vaut validation.
 * `consultant` / `recruteur` : un second geste humain, distinct de la
 * génération, est requis avant d'affirmer le dossier prêt.
 */
export const CV_VALIDATION_POLICIES = ['aucune', 'consultant', 'recruteur'] as const
export const cvValidationPolicySchema = z.enum(CV_VALIDATION_POLICIES)
export type CvValidationPolicy = (typeof CV_VALIDATION_POLICIES)[number]

/**
 * Le statut de DÉPART d'une version tout juste générée.
 *
 * Le consentement PRIME sur la policy : un consentement expiré force la
 * validation quelle que soit la policy d'espace — on n'affirme jamais un
 * dossier prêt à partir d'une personne dont l'accord a expiré.
 */
export function initialCvVersionStatus(policy: CvValidationPolicy, consent: ConsentState): CvVersionStatus {
  if (consent === 'expired') return 'pending_validation'
  return policy === 'aucune' ? 'validated' : 'pending_validation'
}

export const cvVersionSchema = z
  .object({
    id: z.string().guid(),
    consultantId: z.string().guid(),
    /** Le besoin visé, quand il y en a un. `null` pour un CV interne. */
    needId: z.string().guid().nullable(),
    /** L'opportunité visée (#2187.25, épopée #2943) — un besoin commercial
     *  pas encore matérialisé en rôle staffé (`project_needs`). */
    opportunityId: z.string().guid().nullable(),
    /** L'appel d'offres visé (#2187.26, épopée #2943), quand la version part
     *  de là plutôt que d'un besoin. */
    rfpId: z.string().guid().nullable(),
    /** La mission comparable prise pour référence (#2187.27, épopée #2943) —
     *  une mission DÉJÀ faite par CE consultant, jamais une mission d'un
     *  autre profil. */
    comparableMissionId: z.string().guid().nullable(),
    versionKind: cvVersionKindSchema,
    templateKey: z.string(),
    language: z.string(),
    anonymisationRule: anonymisationRuleSchema,
    /** Le corps du dossier, section par section. */
    sections: z.array(z.object({ title: z.string(), body: z.string() })),
    /** Ce qui n'a PAS pu être dit, et pourquoi. */
    excludedSkills: z.array(excludedSkillSchema),
    /** Le diff complet, retenu ET barré — avant/après/raison/preuve (#2333.5). */
    changes: z.array(cvVersionChangeSchema),
    /** Les compétences RETENUES qui recoupent le besoin ciblé — mises en avant
     *  (#2187.38, épopée #2943). Toujours un sous-ensemble des compétences
     *  retenues : jamais une compétence que le CV source ne prouve pas. */
    highlightedSkills: z.array(z.string()),
    /** #2187.31 — QUI a composé cette version. Stocké depuis le premier jour
     *  (`generated_by`), exposé ici pour que la version porte vraiment ses
     *  7 attributs (besoin, gabarit/version, AUTEUR, date, modifications,
     *  statut, export). */
    generatedBy: z.string().guid().nullable(),
    generatedAt: z.string(),
    /** À qui il a été envoyé, quand il l'a été. `null` = jamais envoyé. */
    sentToContactId: z.string().guid().nullable(),
    status: cvVersionStatusSchema,
    /** `userId` de qui a validé, ou `null` tant que ce n'est pas fait. */
    validatedBy: z.string().guid().nullable(),
    validatedAt: z.string().nullable(),
  })
  .strict()
export type CvVersion = z.infer<typeof cvVersionSchema>

/**
 * L'action « Comparer » entre deux versions (#2187.42, épopée #2943).
 *
 * Doctrine « on n'affiche pas ce qu'on n'a pas » appliquée au diff : une
 * section IDENTIQUE dans les deux versions ne fait aucune ligne, seule une
 * différence en produit une.
 */
export type CvVersionSectionDiff = { title: string; before: string | null; after: string | null }
export type CvVersionDiff = {
  sections: CvVersionSectionDiff[]
  excludedSkillsAdded: string[]
  excludedSkillsRemoved: string[]
  highlightedSkillsAdded: string[]
  highlightedSkillsRemoved: string[]
}

/**
 * Compare DEUX versions du même dossier — pure, testée sans monter un
 * service : c'est ce qui rend la comparaison vérifiable indépendamment de la
 * base.
 */
export function diffCvVersions(before: CvVersion, after: CvVersion): CvVersionDiff {
  const beforeSections = new Map(before.sections.map(section => [section.title, section.body]))
  const afterSections = new Map(after.sections.map(section => [section.title, section.body]))
  const titles = new Set([...beforeSections.keys(), ...afterSections.keys()])
  const sections: CvVersionSectionDiff[] = []
  for (const title of titles) {
    const beforeBody = beforeSections.get(title) ?? null
    const afterBody = afterSections.get(title) ?? null
    if (beforeBody !== afterBody) sections.push({ title, before: beforeBody, after: afterBody })
  }

  const diffTerms = (from: readonly string[], to: readonly string[]): { added: string[]; removed: string[] } => {
    const fromSet = new Set(from.map(term => term.toLowerCase()))
    const toSet = new Set(to.map(term => term.toLowerCase()))
    return {
      added: to.filter(term => !fromSet.has(term.toLowerCase())),
      removed: from.filter(term => !toSet.has(term.toLowerCase())),
    }
  }
  const excludedTerms = diffTerms(
    before.excludedSkills.map(entry => entry.term),
    after.excludedSkills.map(entry => entry.term),
  )
  const highlighted = diffTerms(before.highlightedSkills, after.highlightedSkills)

  return {
    sections,
    excludedSkillsAdded: excludedTerms.added,
    excludedSkillsRemoved: excludedTerms.removed,
    highlightedSkillsAdded: highlighted.added,
    highlightedSkillsRemoved: highlighted.removed,
  }
}

export const generateCvVersionSchema = z
  .object({
    versionKind: cvVersionKindSchema.default('client'),
    /** Quatre sources possibles (#2187.25-27, épopée #2943) : un besoin, une
     *  opportunité, un appel d'offres, ou une mission comparable — AU PLUS une
     *  à la fois, la version cible une seule chose. */
    needId: z.string().guid().nullish(),
    opportunityId: z.string().guid().nullish(),
    rfpId: z.string().guid().nullish(),
    comparableMissionId: z.string().guid().nullish(),
    templateKey: z.string().trim().max(80).default('default'),
    language: z.enum(['fr', 'en']).default('fr'),
    /**
     * La règle d'anonymisation. Absente ⇒ celle de l'espace.
     *
     * Un CV `anonyme` force `initiales` quoi qu'il arrive : c'est ce que le mot
     * veut dire, et laisser passer « nom complet » sur un dossier appelé
     * « anonyme » serait la pire promesse non tenue de l'écran.
     */
    anonymisationRule: anonymisationRuleSchema.optional(),
  })
  .strict()
  .refine(
    input => [input.needId, input.opportunityId, input.rfpId, input.comparableMissionId].filter(Boolean).length <= 1,
    {
      message:
        'Une version cible AU PLUS une source : un besoin, une opportunité, un appel d’offres, ou une mission comparable.',
    },
  )
export type GenerateCvVersionInput = z.infer<typeof generateCvVersionSchema>

/**
 * L'action « Modifier » (#2187.42, épopée #2943) : le corps du dossier,
 * section par section — RIEN d'autre. Réservée à une version qui n'est pas
 * encore `validated` : une fois validée, elle porte ce qu'un client a pu
 * recevoir, et cesse de bouger (même principe que « CV source immuable »,
 * appliqué à ce que le studio a déjà produit).
 */
export const updateCvVersionSectionsSchema = z
  .object({
    sections: z.array(z.object({ title: z.string().min(1).max(120), body: z.string().max(20_000) })).min(1),
  })
  .strict()
export type UpdateCvVersionSectionsInput = z.infer<typeof updateCvVersionSectionsSchema>

/**
 * Les compétences RETENUES que le besoin ciblé demandait explicitement
 * (#2187.38, épopée #2943) — une simple INTERSECTION, jamais une invention :
 * une compétence que le besoin demande et que le profil ne prouve pas reste
 * dans `excludedSkills`, jamais ici.
 *
 * Comparaison insensible à la casse : un besoin qui demande « kubernetes » et
 * un profil qui déclare « Kubernetes » désignent la même compétence.
 */
export function highlightedSkillsFor(retained: readonly string[], neededSkills: readonly { term: string }[]): string[] {
  const needed = new Set(neededSkills.map(entry => entry.term.toLowerCase()))
  return retained.filter(skill => needed.has(skill.toLowerCase()))
}

/**
 * La règle réellement appliquée, une fois le type de version connu.
 *
 * Pure et testée parce que c'est la seule chose qui empêche un dossier
 * « anonyme » de porter un nom complet.
 */
export function effectiveAnonymisationRule(
  versionKind: CvVersionKind,
  requested: z.infer<typeof anonymisationRuleSchema> | undefined,
  workspaceDefault: z.infer<typeof anonymisationRuleSchema>,
): z.infer<typeof anonymisationRuleSchema> {
  if (versionKind === 'anonyme') return 'initiales'
  // Les versions INTERNES ne s'anonymisent pas : masquer le nom de quelqu'un
  // dans un document que seule l'ESN lit ne protège personne et fait perdre du
  // temps à celui qui le relit.
  if (versionKind === 'source' || versionKind === 'enrichi' || versionKind === 'resume') return 'nom_complet'
  return requested ?? workspaceDefault
}
