/**
 * #2189.1/.4/.5/.6/.7/.9 (épopée #2940) — ce que le positionnement CONTRÔLE
 * avant de présenter un profil déjà retenu (`submissions.stage = 'shortlisted'`)
 * : accord du consultant, version de CV, compte, besoin, destinataire,
 * restrictions.
 *
 * Distincte de `submissionPreflight` (`./submission-preflight.ts`) : celle-là
 * annonce ce que le POSITIONNEMENT va créer, avant même qu'il existe (porte
 * G4, au moment du matching) ; celle-ci contrôle ce qu'une présentation
 * s'apprête à ENVOYER, une fois le positionnement déjà créé. Même vocabulaire
 * de niveaux (`ok`/`warning`/`blocking`), pour la même raison : ce que je
 * vérifie n'empêche PAS de présenter, sauf le seul cas qui refuse.
 *
 * Un seul cas bloque : le consultant a EXPLICITEMENT refusé d'être proposé.
 * Le reste est affiché ET journalisé (appelant : `SubmissionsService.
 * advanceSubstatus`), jamais silencieux.
 */

type PresentationCheck = { level: 'ok' | 'warning' | 'blocking'; label: string }

type PresentationReadiness = {
  blocked: boolean
  checks: PresentationCheck[]
}

export function presentationReadiness(input: {
  /** #2189.1 — `null` = jamais déclaré, `false` = refus explicite. */
  consultantAgreement: boolean | null
  /** #2189.4 — le statut de la DERNIÈRE version de CV générée pour ce besoin,
   *  `null` si aucune n'a été retrouvée. */
  cvVersionStatus: string | null
  /** #2189.5 */
  accountName: string | null
  /** #2189.6 */
  needStatus: string | null
  needRole: string | null
  /** #2189.7 */
  recipientContactId: string | null
  /** #2189.9 — ce que le consultant a EXCLU d'usage, `null` = aucune connue. */
  consultantRestrictions: string | null
}): PresentationReadiness {
  const checks: PresentationCheck[] = []

  if (input.consultantAgreement === false) {
    checks.push({ level: 'blocking', label: 'le consultant a refusé d’être proposé sur ce positionnement' })
  } else if (input.consultantAgreement === true) {
    checks.push({ level: 'ok', label: 'le consultant a donné son accord' })
  } else {
    checks.push({ level: 'warning', label: 'l’accord du consultant n’a pas encore été déclaré' })
  }

  if (!input.cvVersionStatus) {
    checks.push({ level: 'warning', label: 'aucune version de CV retrouvée pour ce besoin' })
  } else if (input.cvVersionStatus !== 'validated') {
    checks.push({
      level: 'warning',
      label: `la dernière version du CV n’est pas encore validée (${input.cvVersionStatus})`,
    })
  } else {
    checks.push({ level: 'ok', label: 'la dernière version du CV est validée' })
  }

  if (!input.accountName) {
    checks.push({ level: 'warning', label: 'aucun compte identifié pour ce positionnement' })
  }

  if (NEED_CLOSED_STATUSES.has(input.needStatus ?? '')) {
    checks.push({ level: 'warning', label: `le besoin est clôturé (${input.needStatus})` })
  } else {
    checks.push({ level: 'ok', label: input.needRole ? `besoin ouvert : ${input.needRole}` : 'besoin ouvert' })
  }

  if (!input.recipientContactId) {
    checks.push({ level: 'warning', label: 'aucun destinataire choisi chez le client' })
  }

  if (input.consultantRestrictions) {
    checks.push({
      level: 'warning',
      label: `restriction déclarée par le consultant : ${input.consultantRestrictions}`,
    })
  }

  return { blocked: checks.some(check => check.level === 'blocking'), checks }
}

/** `lost`/`cancelled` — mêmes valeurs de clôture que `project_needs.status`
 *  (`packages/contracts/src/schemas/project.ts`, `PROJECT_NEED_STATUSES`). */
const NEED_CLOSED_STATUSES = new Set(['lost', 'cancelled'])
