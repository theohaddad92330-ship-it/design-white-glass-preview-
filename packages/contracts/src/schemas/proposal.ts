import { z } from 'zod'
import { cvVersionChangeSchema, cvVersionStatusSchema } from './cv-version.js'
import { consentStateSchema } from './talent-consent.js'

/**
 * Proposal Studio (addendum final p69).
 *
 * La phrase qui décide de tout le module : « Le Proposal Studio doit réutiliser
 * les objets du compte, du projet, du Talent Graph et du CRM. Il ne doit jamais
 * demander une ressaisie complète. »
 *
 * D'où un ASSEMBLEUR, pas un générateur. Le studio ne rédige pas une proposition
 * — il constate ce que le produit sait déjà, le range dans les neuf sections
 * attendues, et NOMME ce qui manque. Un générateur, lui, comblerait les trous, et
 * une proposition commerciale est le pire endroit du produit pour inventer : elle
 * porte un prix, un planning et des noms de consultants.
 *
 * Deux conséquences, visibles dans les types :
 *
 *   - une section peut être `missing`, et c'est une réponse utile — « équipe : pas
 *     de profil disponible confirmé » vaut mieux qu'un paragraphe sur l'excellence
 *     de nos équipes ;
 *   - rien n'est jamais `partial` en silence : une section incomplète dit ce qui
 *     lui manque, en clair, dans `gaps`.
 */

/**
 * Les sections de la p69, dans l'ordre où elles se lisent.
 *
 * `objections` (BEL-SC-239) s'ajoute APRÈS `risks` : les risques sont ce que le
 * dossier sait déjà de contrariant, les objections sont la même matière relue
 * pour la soutenance — « ce que le client va probablement dire » plutôt que
 * « ce qui peut mal tourner ». Deux lectures d'une même vérité, jamais une
 * deuxième mesure : la section ne fait qu'assembler ce que les autres sections
 * ont déjà calculé.
 */
export const proposalSectionKeySchema = z.enum([
  'context',
  'scope',
  'approach',
  'team',
  'schedule',
  'pricing',
  'references',
  'risks',
  'objections',
  'validation',
])
export type ProposalSectionKey = z.infer<typeof proposalSectionKeySchema>

export const PROPOSAL_SECTION_ORDER: readonly ProposalSectionKey[] = [
  'context',
  'scope',
  'approach',
  'team',
  'schedule',
  'pricing',
  'references',
  'risks',
  'objections',
  'validation',
] as const

/**
 * L'état d'une section.
 *
 * `missing` n'est pas un échec de l'outil : c'est un constat sur le dossier. Une
 * proposition dont la section « équipe » est vide n'est pas prête à partir, et le
 * savoir avant de l'envoyer est tout l'intérêt.
 */
export const proposalSectionStateSchema = z.enum(['ready', 'partial', 'missing'])
export type ProposalSectionState = z.infer<typeof proposalSectionStateSchema>

export const proposalSectionSchema = z.object({
  key: proposalSectionKeySchema,
  state: proposalSectionStateSchema,
  /** Ce que le produit sait déjà, prêt à être repris. `[]` quand rien. */
  content: z.array(z.string().max(2000)),
  /** Ce qui manque, en clair. Jamais vide quand l'état n'est pas `ready`. */
  gaps: z.array(z.string().max(500)),
  /** D'où vient le contenu — compte, besoin, vivier, appel d'offres, profil. */
  sources: z.array(z.string().max(200)),
})
export type ProposalSection = z.infer<typeof proposalSectionSchema>

export const proposalOutlineSchema = z.object({
  sections: z.array(proposalSectionSchema),
  /** Nombre de sections prêtes — le seul chiffre qui dit si on peut envoyer. */
  readyCount: z.number().int().min(0),
  /** `true` quand aucune section n'est `missing`. Ce n'est pas « la proposition
   *  est bonne », c'est « rien n'y est vide ». */
  complete: z.boolean(),
})
export type ProposalOutline = z.infer<typeof proposalOutlineSchema>

/** Ce que l'assembleur reçoit — tout vient d'objets DÉJÀ dans le produit. */
export const proposalInputSchema = z.object({
  /** Le compte : nom, secteur, ce qu'on sait de son contexte. */
  accountName: z.string().nullish(),
  accountSector: z.string().nullish(),
  /** Les enjeux du dossier, tels que l'analyse les a produits. */
  accountChallenges: z.array(z.string()).default([]),
  /** Le besoin/projet qualifié — son libellé et son périmètre. */
  opportunityLabel: z.string().nullish(),
  opportunityDetail: z.string().nullish(),
  /** Ce que le BTMMP a appris : budget, timing, mission, process… */
  btmmp: z.record(z.string(), z.string().nullish()).default({}),
  /** Les offres de l'ESN qui répondent — depuis son profil. */
  offers: z.array(z.string()).default([]),
  /** Les experts retenus : nom, disponibilité confirmée, preuves, dossier de
   *  compétences (BEL-SC-239 étend l'équipe déjà là — jamais une seconde liste). */
  team: z
    .array(
      z.object({
        /** `null` sur une fiche sans nom (D366). Une proposition qui désigne
         *  « quelqu'un » sans le nommer se VOIT — mieux qu'un nom de fichier
         *  imprimé chez le client, ce que faisait l'état antérieur. */
        fullName: z.string().nullable(),
        availabilityConfirmed: z.boolean(),
        demonstratedSkills: z.array(z.string()).default([]),
        /** Le consentement du profil (`talentConsentSchema` → `consentState`).
         *  `null` = pas de talent lié — jamais confondu avec `expired`. */
        consentState: consentStateSchema.nullable().default(null),
        /** Le statut de la version de dossier COURANTE pour ce besoin. `null` =
         *  aucun dossier adapté généré : la proposition part sur le CV source
         *  tel quel, et le dit. */
        cvVersionStatus: cvVersionStatusSchema.nullable().default(null),
        /** Le diff retenu/barré de cette version — `avant/après/raison/preuve`
         *  (#2333.5). `[]` sans dossier adapté généré pour ce besoin. */
        cvChanges: z.array(cvVersionChangeSchema).default([]),
        /** `true` si un CV source existe pour cette personne. Sans lui, aucun
         *  dossier adapté n'est possible — l'API le refuse déjà en 400. */
        hasSourceCv: z.boolean().default(false),
        /** Combien de fois ce profil a déjà été présenté à un autre besoin —
         *  la transparence qu'un client peut demander, jamais une donnée tue. */
        priorPresentationsCount: z.number().int().min(0).default(0),
      }),
    )
    .default([]),
  /** Le prix, uniquement s'il a été SAISI. Jamais estimé. */
  estimatedAmount: z.number().nullish(),
  dailyRate: z.number().nullish(),
  /** Références clients réutilisables (contenu validé). */
  references: z.array(z.string()).default([]),
  /** Risques déjà identifiés — sur le compte, le projet ou les profils. */
  risks: z.array(z.string()).default([]),
  /** Exigences d'appel d'offres non couvertes, quand la proposition en découle. */
  openRequirements: z.array(z.string()).default([]),
})
export type ProposalInput = z.infer<typeof proposalInputSchema>

/**
 * Assemble le plan de la proposition. Fonction PURE — aucun appel, aucun modèle.
 *
 * Chaque section suit la même discipline : on prend ce qui EXISTE, on cite sa
 * source, et on nomme ce qui manque. Aucune section n'est jamais remplie par une
 * phrase générique : « notre approche éprouvée » n'informe personne et fait
 * perdre la crédibilité que le reste du dossier a construite.
 */
export function buildProposalOutline(input: ProposalInput): ProposalOutline {
  const sections: ProposalSection[] = [
    contextSection(input),
    scopeSection(input),
    approachSection(input),
    teamSection(input),
    scheduleSection(input),
    pricingSection(input),
    referencesSection(input),
    risksSection(input),
    objectionsSection(input),
    validationSection(input),
  ]
  return {
    sections,
    readyCount: sections.filter(section => section.state === 'ready').length,
    complete: sections.every(section => section.state !== 'missing'),
  }
}

/** Construit une section en dérivant son état de ce qu'elle contient. */
function section(
  key: ProposalSectionKey,
  content: (string | null | undefined)[],
  gaps: string[],
  sources: string[],
): ProposalSection {
  const kept = content.filter((line): line is string => Boolean(line && line.trim())).map(line => line.trim())
  // L'état DÉCOULE du contenu : il n'est jamais posé à la main, donc il ne peut
  // pas mentir sur ce qu'il y a réellement dans la section.
  const state: ProposalSectionState = kept.length === 0 ? 'missing' : gaps.length > 0 ? 'partial' : 'ready'
  return {
    key,
    state,
    content: kept,
    // Une section vide DOIT dire pourquoi : sans quoi l'écran affiche un trou
    // sans mode d'emploi.
    gaps: state === 'missing' && gaps.length === 0 ? ['Aucune donnée disponible pour cette section.'] : gaps,
    sources,
  }
}

function contextSection(input: ProposalInput): ProposalSection {
  const gaps: string[] = []
  if (!input.accountSector) gaps.push('Secteur du client inconnu.')
  if (input.accountChallenges.length === 0) gaps.push('Aucun enjeu client identifié par l’analyse.')
  return section(
    'context',
    [
      input.accountName ? `Client : ${input.accountName}` : null,
      input.accountSector ? `Secteur : ${input.accountSector}` : null,
      ...input.accountChallenges.slice(0, 5),
    ],
    gaps,
    ['dossier de compte'],
  )
}

function scopeSection(input: ProposalInput): ProposalSection {
  const gaps: string[] = []
  const mission = input.btmmp['mission']
  if (!mission) gaps.push('Périmètre de mission non qualifié (axe « mission » du BTMMP vide).')
  if (!input.opportunityDetail) gaps.push('Détail du besoin absent.')
  return section('scope', [input.opportunityLabel, input.opportunityDetail, mission], gaps, [
    'besoin qualifié',
    'qualification BTMMP',
  ])
}

function approachSection(input: ProposalInput): ProposalSection {
  const gaps: string[] = []
  if (input.offers.length === 0) gaps.push('Aucune offre de l’ESN rattachée à ce besoin.')
  const process = input.btmmp['process']
  if (!process) gaps.push('Processus de décision du client inconnu — l’approche ne peut pas s’y aligner.')
  return section('approach', [...input.offers.slice(0, 5), process], gaps, ['profil ESN', 'qualification BTMMP'])
}

function teamSection(input: ProposalInput): ProposalSection {
  const gaps: string[] = []
  const unconfirmed = input.team.filter(member => !member.availabilityConfirmed)
  if (input.team.length === 0) gaps.push('Aucun expert retenu pour ce besoin.')
  // Une disponibilité non confirmée est le risque le plus coûteux d'une
  // proposition : on l'annonce ici plutôt qu'en soutenance.
  if (unconfirmed.length > 0) {
    gaps.push(`Disponibilité à confirmer : ${unconfirmed.map(member => member.fullName).join(', ')}.`)
  }
  const withoutProof = input.team.filter(member => member.demonstratedSkills.length === 0)
  if (withoutProof.length > 0) {
    gaps.push(`Sans compétence démontrée citable : ${withoutProof.map(member => member.fullName).join(', ')}.`)
  }
  // Consentement : un refus dur (expiré) se nomme, un consentement jamais
  // recueilli avertit et n'empêche rien (c45_consentement_positionnement).
  const expiredConsent = input.team.filter(member => member.consentState === 'expired')
  if (expiredConsent.length > 0) {
    gaps.push(`Consentement expiré, à régulariser avant envoi : ${expiredConsent.map(nameOf).join(', ')}.`)
  }
  const noConsent = input.team.filter(member => member.consentState === 'none')
  if (noConsent.length > 0) {
    gaps.push(`Consentement non recueilli : ${noConsent.map(nameOf).join(', ')}.`)
  }
  const pendingCv = input.team.filter(member => member.cvVersionStatus === 'pending_validation')
  if (pendingCv.length > 0) {
    gaps.push(`CV adapté en attente de validation : ${pendingCv.map(nameOf).join(', ')}.`)
  }
  const noAdaptedCv = input.team.filter(member => member.hasSourceCv && member.cvVersionStatus == null)
  if (noAdaptedCv.length > 0) {
    gaps.push(`CV non adapté pour ce besoin, CV source utilisé tel quel : ${noAdaptedCv.map(nameOf).join(', ')}.`)
  }
  return section(
    'team',
    input.team.map(member => {
      // BEL-SC-239 — « trois preuves maximum » : au-delà, une liste de preuves
      // ne se lit plus comme une preuve, elle se lit comme un CV recopié.
      const skills =
        member.demonstratedSkills.length > 0 ? ` — ${member.demonstratedSkills.slice(0, 3).join(', ')}` : ''
      const cv =
        member.cvVersionStatus != null
          ? ` · CV adapté (${member.cvVersionStatus === 'validated' ? 'validé' : 'en attente'}, ${member.cvChanges.length} modification(s) tracée(s))`
          : ''
      const history =
        member.priorPresentationsCount > 0 ? ` · déjà présenté ailleurs (${member.priorPresentationsCount})` : ''
      return `${member.fullName ?? 'Profil sans nom'}${skills}${cv}${history}`
    }),
    gaps,
    ['vivier', 'preuves de compétence', 'dossier de compétences'],
  )
}

/** `fullName` sans jamais imprimer `null` dans une phrase — D366. */
function nameOf(member: ProposalInput['team'][number]): string {
  return member.fullName ?? 'profil sans nom'
}

/**
 * Objections anticipées (BEL-SC-239) — la même matière que « équipe », « prix »
 * et « risques », relue pour la soutenance : ce que le client va probablement
 * dire, avant qu'il ne le dise. AUCUN champ n'est ajouté pour l'occasion :
 * inventer une deuxième source d'objections serait le « deuxième objet
 * concurrent » que la doctrine interdit — celle-ci ASSEMBLE ce que les autres
 * sections savent déjà.
 *
 * Doctrine explicite du ticket : jamais de pression artificielle, jamais
 * d'urgence inventée — chaque ligne cite un fait déjà présent dans le dossier.
 */
function objectionsSection(input: ProposalInput): ProposalSection {
  const lines: string[] = []

  for (const member of input.team) {
    if (!member.availabilityConfirmed) {
      lines.push(`Disponibilité de ${nameOf(member)} pas encore confirmée.`)
    }
    if (member.demonstratedSkills.length === 0) {
      lines.push(`Aucune compétence démontrée citable pour ${nameOf(member)}.`)
    }
    if (member.consentState === 'expired') {
      lines.push(`Consentement de ${nameOf(member)} expiré — à régulariser avant envoi.`)
    } else if (member.consentState === 'none') {
      lines.push(`Consentement non recueilli pour ${nameOf(member)}.`)
    }
    if (member.hasSourceCv && member.cvVersionStatus === 'pending_validation') {
      lines.push(`CV adapté de ${nameOf(member)} en attente de validation.`)
    }
  }

  lines.push(...input.risks)
  lines.push(...input.openRequirements.map(requirement => `Exigence non couverte : ${requirement}`))

  return section(
    'objections',
    lines,
    // Une section vide n'est pas une bonne nouvelle, comme pour « risques » —
    // c'est presque toujours le signe qu'on ne les a pas cherchées.
    lines.length === 0 ? ['Aucune objection anticipée — vérifier que la question a été posée.'] : [],
    ['équipe positionnée', 'risques identifiés', 'appel d’offres'],
  )
}

function scheduleSection(input: ProposalInput): ProposalSection {
  const timing = input.btmmp['timing']
  return section('schedule', [timing], timing ? [] : ['Échéance du client inconnue (axe « timing » du BTMMP vide).'], [
    'qualification BTMMP',
  ])
}

function pricingSection(input: ProposalInput): ProposalSection {
  const gaps: string[] = []
  const budget = input.btmmp['budget']
  if (input.estimatedAmount == null) gaps.push('Montant d’affaire non saisi — aucun prix ne sera inventé.')
  if (input.dailyRate == null) gaps.push('TJM non renseigné.')
  if (!budget) gaps.push('Budget côté client non qualifié.')
  return section(
    'pricing',
    [
      input.estimatedAmount != null ? `Montant estimé : ${input.estimatedAmount} €` : null,
      input.dailyRate != null ? `TJM : ${input.dailyRate} €` : null,
      budget,
    ],
    gaps,
    ['besoin qualifié', 'vivier'],
  )
}

function referencesSection(input: ProposalInput): ProposalSection {
  return section(
    'references',
    input.references.slice(0, 5),
    input.references.length === 0 ? ['Aucune référence client validée rattachée à cette offre.'] : [],
    ['références validées'],
  )
}

function risksSection(input: ProposalInput): ProposalSection {
  const lines = [...input.risks, ...input.openRequirements.map(requirement => `Exigence non couverte : ${requirement}`)]
  return section(
    'risks',
    lines,
    // Une section « risques » vide n'est PAS une bonne nouvelle : c'est presque
    // toujours le signe qu'on ne les a pas cherchés.
    lines.length === 0 ? ['Aucun risque identifié — vérifier que la question a été posée.'] : [],
    ['matching vivier', 'appel d’offres'],
  )
}

function validationSection(input: ProposalInput): ProposalSection {
  const nextStep = input.btmmp['nextStep']
  const management = input.btmmp['management']
  const gaps: string[] = []
  if (!nextStep) gaps.push('Prochaine étape non définie.')
  if (!management) gaps.push('Circuit de validation côté client inconnu.')
  return section('validation', [nextStep, management], gaps, ['qualification BTMMP'])
}
