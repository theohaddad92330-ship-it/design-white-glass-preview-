import type { SubmissionStage, SubmissionSubstatus } from './submission.js'

/**
 * #2323.23 / #2323.25 — l'AGRÉGATION need-level de ce qui existe déjà au
 * niveau du POSITIONNEMENT (`Submission`), LAU-FINAL-064 « gate PRÉSENTER » /
 * « gate DÉMARRER ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux gates cherchaient un champ sur `ProjectNeed` qui n'existe pas — la
 * capacité EXISTE déjà, mais au niveau du POSITIONNEMENT, pas du besoin :
 *  · « accord consultant » = `consultant_agreement_pending` → `ready_to_present`
 *    (`SUBMISSION_SUBSTATUSES`, `SUBSTATUS_TRANSITIONS`, submission.ts) ;
 *  · « consultant engagé » = `SUBMISSION_STAGES.accepted`, que ce soit via le
 *    sous-statut `selected` ou `converted_to_mission` (`SUBSTATUS_TO_STAGE`,
 *    submission.ts).
 * Ce qui manquait n'était donc PAS une donnée, mais sa LECTURE au niveau du
 * besoin : « au moins un des positionnements de ce besoin a franchi cette
 * étape ». Une fonction pure, sans migration ni nouveau champ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `withdrawn` ET `archived` NE PROUVENT RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * `SUBSTATUS_TRANSITIONS` (submission.ts) autorise un retrait depuis
 * QUASIMENT n'importe quelle étape — `to_qualify: [..., 'withdrawn']` aussi
 * bien que `presented: [..., 'withdrawn']`. Un positionnement `withdrawn` (ou
 * `archived`, qui peut en descendre) n'indique donc PAS s'il avait franchi
 * l'accord avant de s'arrêter. Répondre `true` sur cette preuve fabriquerait
 * un accord qu'on n'a pas — doctrine « jamais de donnée fictive » — la
 * fonction répond `false`, le repli honnête, jamais une victoire par défaut.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE `stage` SUFFIT SUR UNE LIGNE ANTÉRIEURE À #2335
 * ─────────────────────────────────────────────────────────────────────────────
 * `substatus` est `.nullable()` sur les lignes créées avant #2335 (jamais
 * deviné). Mais la machine à SIX étapes (`ALLOWED_TRANSITIONS`) n'envoie
 * jamais un CV (`submitted`) sans accord préalable — le sous-statut détaillé
 * est un raffinement, pas une seconde porte. Une ligne dont le `stage` a déjà
 * quitté `shortlisted` a donc, par construction, franchi l'accord — qu'elle
 * porte ou non le détail.
 */

/** Les sous-statuts qui PROUVENT, sans ambiguïté possible, que l'accord
 *  consultant a été franchi — tous inatteignables sans être passés par
 *  `ready_to_present` (`SUBSTATUS_TRANSITIONS`, submission.ts). */
const SUBSTATUSES_PAST_CONSULTANT_AGREEMENT: ReadonlySet<SubmissionSubstatus> = new Set([
  'ready_to_present',
  'to_validate',
  'presented',
  'acknowledged',
  'interview_to_schedule',
  'interview_scheduled',
  'interview_done',
  'second_interview',
  'selected',
  'declined',
  'no_response',
  'converted_to_mission',
])

/** Ce qu'un positionnement doit porter pour qu'on sache où il en est —
 *  jamais la ligne `Submission` entière : ces deux gates ne lisent rien
 *  d'autre.
 *
 *  Non exporté : rien d'autre dans ce paquet n'en a besoin (structurellement
 *  typé pour l'appelant) — un type qui ne sert qu'à son propre fichier ne
 *  s'exporte pas (`pnpm lint:exports:types`). */
interface NeedSubmissionGateInput {
  stage: SubmissionStage
  /** `null` sur une ligne créée avant #2335 — jamais deviné. */
  substatus: SubmissionSubstatus | null
}

/**
 * #2323.23 — Gate PRÉSENTER : au moins un positionnement de ce besoin a-t-il
 * dépassé « accord consultant en attente » ?
 */
export function needHasConsultantAgreement(submissions: readonly NeedSubmissionGateInput[]): boolean {
  return submissions.some(submission => {
    if (submission.substatus) return SUBSTATUSES_PAST_CONSULTANT_AGREEMENT.has(submission.substatus)
    // Ligne antérieure à #2335 : le CV n'est jamais parti sans accord
    // préalable, donc sortir de `shortlisted` suffit.
    return submission.stage !== 'shortlisted'
  })
}

/**
 * #2323.25 — Gate DÉMARRER : au moins un positionnement de ce besoin a-t-il un
 * consultant ENGAGÉ (le client a pris le profil) ?
 *
 * `selected` et `converted_to_mission` retombent tous deux sur le stage
 * `accepted` (`SUBSTATUS_TO_STAGE`, submission.ts) : le `stage` seul suffit,
 * sans le détail — et donc sans l'ambiguïté substatus/`null` de la fonction
 * ci-dessus.
 */
export function needHasEngagedConsultant(submissions: readonly NeedSubmissionGateInput[]): boolean {
  return submissions.some(submission => submission.stage === 'accepted')
}
