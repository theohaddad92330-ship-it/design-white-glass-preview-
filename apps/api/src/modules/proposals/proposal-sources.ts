import {
  type ConsentState,
  type CvVersionChange,
  type CvVersionStatus,
  type ProposalInput,
  proposalInputSchema,
} from '@bellum/contracts'

/**
 * La traduction des lignes du produit vers l'entrée de l'assembleur.
 *
 * Le contrat (`packages/contracts/src/schemas/proposal.ts`) sait ranger ce que
 * le produit connaît dans les neuf sections d'une proposition, et NOMMER ce qui
 * manque. Il lui manquait sa moitié : rien ne lui donnait jamais de données, et
 * aucun écran ne l'atteignait. C'est ce fichier, plus le module autour.
 *
 * Il est PUR — aucun accès base, aucun appel réseau — pour une raison précise :
 * chaque règle ci-dessous décide de ce qu'on ose écrire dans un document qui
 * part chez un client, et une règle de ce genre doit pouvoir se lire et se
 * tester sans monter une base.
 */

/** Le compte, tel que `accounts` le porte. */
type ProposalAccountRow = {
  company_name: string
  sector: string | null
  it_challenges: { title?: string | null; description?: string | null }[]
}

/** Le besoin, tel que `opportunities` le porte. */
type ProposalProjectRow = {
  label: string
  detail: string | null
  /** L'offre de l'ESN RATTACHÉE à ce besoin. `null` = personne ne l'a reliée. */
  offer: string | null
  /** `numeric` : le driver pg le rend en CHAÎNE, jamais en nombre. */
  estimated_amount: string | null
  btmmp: {
    budget?: string | null
    timing?: string | null
    mission?: string | null
    management?: string | null
    process?: string | null
    nextStep?: string | null
  } | null
}

/**
 * Un expert positionné : son identité et sa disponibilité LUES AUJOURD'HUI, son
 * tarif tel qu'il a été PROPOSÉ.
 *
 * La disponibilité vient de la fiche vivier et non d'une copie figée : une
 * proposition qu'on s'apprête à envoyer annonce une disponibilité, et celle-là
 * doit être celle du jour.
 */
type ProposalTeamRow = {
  /** `consultants.full_name`. `null` = la fiche n'a pas de nom (D366), jamais
   *  un nom de remplacement : une proposition qui nomme mal une personne est
   *  pire qu'une proposition qui dit ne pas savoir. */
  fullName: string | null
  /** `consultants.availability` — l'enum `consultantAvailabilitySchema`. */
  availability: string
  /** `consultant_skills` : le libellé et d'OÙ vient la preuve. */
  skills: { label: string; source: string | null }[]
  /** `submissions.proposed_rate_cents`. `null` = non chiffré, jamais 0. */
  proposedRateCents: number | null
  /** Le consentement du talent (BEL-SC-239), déjà réduit à un état par
   *  `consentState()` — cette date n'a rien à faire dans un module pur. `null`
   *  = pas de talent identifiable, jamais confondu avec `expired`. */
  consentState: ConsentState | null
  /** Le statut de la version de dossier COURANTE pour CE besoin (`cv_versions`,
   *  la plus récente sur `(consultant_id, opportunity_id)`). `null` = aucune
   *  version générée — la proposition partira sur le CV source tel quel. */
  cvVersionStatus: CvVersionStatus | null
  /** Le diff de cette version — `[]` sans version. */
  cvChanges: CvVersionChange[]
  /** `true` si `consultants.cv_text` porte un CV — sans lui, aucune version
   *  adaptée n'est possible (l'API le refuse déjà en 400). */
  hasSourceCv: boolean
  /** Combien de fois ce profil a déjà été présenté à un AUTRE besoin —
   *  positionnements dont le stade dit qu'il a été montré à un client. */
  priorPresentationsCount: number
}

export type ProposalSources = {
  account: ProposalAccountRow | null
  project: ProposalProjectRow
  team: ProposalTeamRow[]
  /** Les affirmations de `proofs` dont le `scope` vaut `client_safe`. */
  clientSafeProofs: { claim: string; detail: string | null }[]
  risks: string[]
  openRequirements: string[]
}

/**
 * Les disponibilités qui portent une FENÊTRE DATÉE, donc annonçables.
 *
 * `indisponible` et `inconnu` en sont absents, et pas pour la même raison :
 * l'un est un fait contraire, l'autre une absence de fait. Les deux donnent
 * `false`, ce qui fait dire au contrat « disponibilité à confirmer » — la
 * phrase qu'on veut voir AVANT la soutenance plutôt que pendant.
 * Valeurs : `packages/contracts/src/schemas/consultant.ts` (`consultantAvailabilitySchema`).
 */
const DATED_AVAILABILITIES: ReadonlySet<string> = new Set(['immediate', 'sous_1_mois', 'sous_3_mois'])

/**
 * Les sources de preuve qu'on ose CITER à un client.
 *
 * La hiérarchie n'est pas inventée ici : elle est écrite une fois pour toutes
 * dans le moteur de matching, `apps/api/src/modules/consultants/matching/axes.ts`
 * (`SOURCE_COVERAGE`, §3.1) — « une compétence démontrée se cite, une compétence
 * déclarée se fait valider en entretien ». Restent donc dehors `cv`
 * (auto-déclaratif), `declared` (une saisie) et `derived` (une déduction) : dans
 * un document commercial, une compétence citée engage.
 * Valeurs : `packages/contracts/src/schemas/talent.ts` (`SKILL_SOURCES`).
 */
const CITABLE_EVIDENCE_SOURCES: ReadonlySet<string> = new Set(['mission', 'interview'])

/** Rend la chaîne nettoyée, ou `null` — jamais une chaîne vide, qui s'afficherait
 *  comme une ligne blanche au milieu du document. */
function trimmed(value: string | null | undefined): string | null {
  const cleaned = value?.trim()
  return cleaned ? cleaned : null
}

/**
 * `numeric` arrive en chaîne. Une chaîne illisible vaut `null`, JAMAIS 0 :
 * « montant non saisi » et « affaire à zéro euro » ne sont pas la même phrase.
 */
function toAmount(value: string | null): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Le TJM de la proposition — et seulement s'il n'y en a qu'UN.
 *
 * `submissions.proposed_rate_cents` porte le tarif PROPOSÉ par positionnement,
 * décidé par un humain ; c'est bien un prix de vente, contrairement au TJM cible
 * d'une fiche vivier, qui est un coût. Mais un projet peut porter plusieurs
 * positionnements à des tarifs différents, et le contrat n'a qu'un champ. Deux
 * tarifs distincts rendent donc `null` : en choisir un (le premier, le plus
 * élevé, une moyenne) écrirait sur la proposition un prix que personne n'a
 * décidé. La section « tarification » dira « TJM non renseigné », et le
 * commercial tranchera.
 */
function singleDailyRate(team: ProposalTeamRow[]): number | null {
  const distinct = new Set(
    team.map(member => member.proposedRateCents).filter((cents): cents is number => cents != null && cents > 0),
  )
  if (distinct.size !== 1) return null
  const [cents] = [...distinct]
  return cents === undefined ? null : cents / 100
}

export function toProposalInput(sources: ProposalSources): ProposalInput {
  const { account, project } = sources

  return proposalInputSchema.parse({
    accountName: trimmed(account?.company_name),
    accountSector: trimmed(account?.sector),
    accountChallenges: (account?.it_challenges ?? [])
      // Le titre d'abord, la description en repli : un enjeu sans ni l'un ni
      // l'autre DISPARAÎT plutôt que de devenir une puce vide.
      .map(challenge => trimmed(challenge?.title) ?? trimmed(challenge?.description))
      .filter((line): line is string => line !== null),

    opportunityLabel: trimmed(project.label),
    opportunityDetail: trimmed(project.detail),

    btmmp: {
      budget: trimmed(project.btmmp?.budget),
      timing: trimmed(project.btmmp?.timing),
      mission: trimmed(project.btmmp?.mission),
      management: trimmed(project.btmmp?.management),
      process: trimmed(project.btmmp?.process),
      nextStep: trimmed(project.btmmp?.nextStep),
    },

    // UNIQUEMENT l'offre rattachée à ce besoin. Les domaines d'expertise du
    // profil de l'ESN ne sont pas « les offres qui répondent » tant que personne
    // ne les y a reliés : les déverser ici remplirait la section « approche » de
    // généralités, exactement ce que l'assembleur refuse de faire.
    offers: [trimmed(project.offer)].filter((offer): offer is string => offer !== null),

    team: sources.team.map(member => ({
      fullName: member.fullName,
      availabilityConfirmed: DATED_AVAILABILITIES.has(member.availability),
      demonstratedSkills: member.skills
        .filter(skill => skill.source != null && CITABLE_EVIDENCE_SOURCES.has(skill.source))
        .map(skill => skill.label),
      consentState: member.consentState,
      cvVersionStatus: member.cvVersionStatus,
      cvChanges: member.cvChanges,
      hasSourceCv: member.hasSourceCv,
      priorPresentationsCount: member.priorPresentationsCount,
    })),

    estimatedAmount: toAmount(project.estimated_amount),
    dailyRate: singleDailyRate(sources.team),

    references: sources.clientSafeProofs.map(proof => {
      const detail = trimmed(proof.detail)
      return detail ? `${proof.claim} — ${detail}` : proof.claim
    }),

    risks: sources.risks,
    openRequirements: sources.openRequirements,
  })
}
