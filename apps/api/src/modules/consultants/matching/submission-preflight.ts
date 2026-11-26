import type { MatchNeed, MatchResult } from '@bellum/contracts'
import { AVAILABILITY_REVALIDATION_DAYS } from './pushable'

/**
 * Ce que le modal de positionnement ANNONCE avant de faire quoi que ce soit
 * (PDF 4 §10.1, porte G4).
 *
 * Trois blocs, dans cet ordre, et l'ordre est le message :
 *
 *  - **ce que je crée** — inévitable, dit d'avance ;
 *  - **ce que je peux préparer** — proposé, jamais coché d'office pour ce qui
 *    part vers l'extérieur ;
 *  - **ce que je vérifie** — les points d'attention, qui n'empêchent PAS le
 *    positionnement mais qui sont affichés ET journalisés.
 *
 * Un seul cas refuse : le consentement expiré. Ce n'est pas un avertissement de
 * plus, c'est une interdiction — proposer quelqu'un dont on n'a plus le droit de
 * détenir les données n'est pas un arbitrage commercial.
 *
 * Fonction PURE : `now` est un paramètre. Une préflight qui lirait l'horloge ne
 * serait pas testable, et « depuis 74 jours » dériverait d'un jour à l'autre
 * sans que personne ne le voie.
 */

export const PREPARABLE_ACTIONS = ['skills_dossier', 'client_message', 'follow_up_j3', 'defence_brief'] as const
export type PreparableAction = (typeof PREPARABLE_ACTIONS)[number]

type PreflightCheck = {
  level: 'ok' | 'warning' | 'blocking'
  label: string
}

type SubmissionPreflight = {
  creates: string[]
  canPrepare: { action: PreparableAction; label: string; defaultChecked: boolean }[]
  checks: PreflightCheck[]
  /** `true` quand le positionnement est REFUSÉ, pas seulement risqué. */
  blocked: boolean
  /**
   * #2329.55 (épopée #2948) — le même verdict que `blocked`, nommé
   * explicitement : un consultant est présenté ou classé disponible sans
   * preuve récente ni consentement → `no_go`. Dérivé, jamais recalculé
   * séparément — deux écritures du même réglage divergeraient un jour (GA-26).
   */
  status: 'ready' | 'no_go'
  /** Ce qui manque, nommé — c'est ce que le journal de la porte conserve. */
  missing: string[]
}

export function submissionPreflight(
  need: MatchNeed,
  result: MatchResult,
  input: {
    consentState: string
    consentExpiresAt: string | null
    availabilityCheckedAt: string | null
    now: Date
    /**
     * #2329.35-.41 (épopée #2948) — le consentement à représenter, PAR
     * COMPTE : distinct de `consentState`, qui porte le consentement GLOBAL
     * (droit de détenir la fiche). `null`/`undefined` = jamais demandé POUR
     * CE COMPTE, ce qui n'est ni un oui ni un non (GA-18/GA-19) — seul
     * `canRepresent === false` (un refus EXPLICITE du talent) bloque.
     */
    accountConsent?: { canRepresent: boolean | null; restrictions: string | null } | null
    /**
     * #2948 (#2329.45-.51) — trois axes de plus de l'accord à 7 conditions.
     * Même doctrine que le reste de cette porte : `null`/`false` AVERTIT sans
     * bloquer — seul un refus EXPLICITE (`accountConsent.canRepresent ===
     * false`) ou un consentement expiré bloquent. « Mission comprise » et
     * « intérêt réel » (#2329.46/.48) n'entrent PAS ici : ce sont des faits PAR
     * OPPORTUNITÉ, pas des faits globaux sur le talent — voir la migration
     * `20260927181300-ConsultantPositioningAgreement`.
     */
    positioningAgreement?: {
      tjmValidatedAt: string | null
      cvValidatedAt: string | null
      otherProcessesKnown: boolean
    } | null
  },
): SubmissionPreflight {
  const checks: PreflightCheck[] = []
  const missing: string[] = []

  const accountConsent = input.accountConsent ?? null
  if (accountConsent?.canRepresent === false) {
    checks.push({
      level: 'blocking',
      label: accountConsent.restrictions
        ? `le talent n'autorise pas à le représenter pour ce compte — ${accountConsent.restrictions}`
        : "le talent n'autorise pas à le représenter pour ce compte",
    })
    missing.push('compte non autorisé par le talent')
  } else if (accountConsent === null || accountConsent.canRepresent == null) {
    checks.push({
      level: 'warning',
      label: 'le consentement à représenter ce talent pour ce compte n’a jamais été demandé',
    })
    missing.push('consentement par compte non recueilli')
  } else {
    checks.push({ level: 'ok', label: 'le talent autorise à le représenter pour ce compte' })
  }
  // Une restriction connue se NOMME, même quand le compte est autorisé
  // (#2329.39) — elle ne bloque pas la porte, mais disparaître serait pire :
  // "on n'affiche pas ce qu'on n'a pas" ne veut pas dire "ce qu'on sait".
  if (accountConsent?.canRepresent === true && accountConsent.restrictions) {
    checks.push({ level: 'warning', label: `restriction déclarée par le talent — ${accountConsent.restrictions}` })
  }

  if (input.consentState === 'expired') {
    checks.push({ level: 'blocking', label: 'son consentement a expiré — le renouveler avant de le proposer' })
    missing.push('consentement expiré')
  } else if (input.consentState === 'none') {
    checks.push({ level: 'warning', label: "aucun consentement n'a été recueilli pour ce talent" })
    missing.push('consentement jamais recueilli')
  } else if (input.consentExpiresAt) {
    checks.push({ level: 'ok', label: `son consentement est valide jusqu'au ${input.consentExpiresAt.slice(0, 10)}` })
  } else {
    checks.push({ level: 'ok', label: 'son consentement est valide' })
  }

  const rejected = result.flags.find(flag => flag.kind === 'previously_rejected_by_client')
  if (rejected) {
    checks.push({ level: 'warning', label: `${rejected.detail} — le positionner sera journalisé` })
    missing.push('refus antérieur chez ce client')
  } else {
    checks.push({ level: 'ok', label: `jamais refusé chez ${need.accountName ?? 'ce client'}` })
  }

  const onMission = result.flags.find(flag => flag.kind === 'already_on_mission_at_client')
  if (onMission) {
    checks.push({ level: 'warning', label: 'déjà en mission chez ce client — débauchage interne' })
    missing.push('déjà en mission chez ce client')
  }

  const staleDays = daysSince(input.availabilityCheckedAt, input.now)
  // Le seuil vient de `pushable.ts`, où il est déjà le poids de la pénalité de
  // fraîcheur. Il était recopié « 60 » ici : deux écritures du même réglage, et
  // le jour où l'une bouge, le modal dit « confirmée » pendant que le score
  // pénalise (ou l'inverse).
  if (staleDays !== null && staleDays > AVAILABILITY_REVALIDATION_DAYS) {
    checks.push({
      level: 'warning',
      label: `sa disponibilité est déclarée, pas confirmée depuis ${staleDays} jours`,
    })
    missing.push('disponibilité non revalidée')
  }

  // #2948 (#2329.45-.51) — trois axes de plus de l'accord à 7 conditions.
  // Même doctrine que le reste de cette porte : AVERTIT sans bloquer.
  const agreement = input.positioningAgreement ?? null
  if (!agreement?.tjmValidatedAt) {
    checks.push({ level: 'warning', label: 'le TJM ou les conditions ne sont pas validés avec le talent' })
    missing.push('TJM non validé')
  } else {
    checks.push({ level: 'ok', label: 'le TJM est validé avec le talent' })
  }
  if (!agreement?.cvValidatedAt) {
    checks.push({ level: 'warning', label: "le CV n'est pas validé (ou les règles d'usage pas acceptées)" })
    missing.push('CV non validé')
  } else {
    checks.push({ level: 'ok', label: 'le CV est validé' })
  }
  if (!agreement?.otherProcessesKnown) {
    checks.push({ level: 'warning', label: 'les autres processus du talent ne sont pas connus' })
    missing.push('autres processus non demandés')
  } else {
    checks.push({ level: 'ok', label: 'les autres processus du talent sont connus' })
  }

  const elsewhere = result.flags.find(flag => flag.kind === 'active_submission_elsewhere')
  if (elsewhere) checks.push({ level: 'warning', label: elsewhere.detail })

  return {
    creates: ['un positionnement au statut « préparé »', 'le lien besoin ↔ consultant ↔ contact client'],
    canPrepare: [
      // Rien qui parte vers l'EXTÉRIEUR n'est coché d'avance. Le dossier de
      // compétences et le message se préparent volontiers ; la relance et le
      // brief engagent une suite qu'on ne décide pas à la place de quelqu'un.
      { action: 'skills_dossier', label: 'le dossier de compétences ciblé (anonymisé)', defaultChecked: true },
      { action: 'client_message', label: 'le message au client', defaultChecked: true },
      { action: 'follow_up_j3', label: 'la relance J+3', defaultChecked: false },
      { action: 'defence_brief', label: 'le brief de soutenance', defaultChecked: false },
    ],
    checks,
    blocked: checks.some(check => check.level === 'blocking'),
    status: checks.some(check => check.level === 'blocking') ? 'no_go' : 'ready',
    missing,
  }
}

/** Depuis combien de jours. `null` quand la question n'a jamais été posée —
 *  ce qui n'est pas « il y a très longtemps ». */
function daysSince(at: string | null, now: Date): number | null {
  if (!at) return null
  const parsed = Date.parse(at)
  if (Number.isNaN(parsed)) return null
  return Math.max(0, Math.floor((now.getTime() - parsed) / (24 * 60 * 60 * 1000)))
}
