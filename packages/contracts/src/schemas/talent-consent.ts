import { z } from 'zod'

/**
 * Le consentement d'un talent (PDF 3 §7.3).
 *
 * Distinct de la RÉTENTION, et c'est tout le point. La rétention est une
 * politique d'espace qui se calcule sur une inactivité ; le consentement est ce
 * que la PERSONNE a accepté, quand, et sur quelle base. Un candidat qui écrit
 * « qu'est-ce que vous avez de moi ? » attend la seconde réponse, pas la
 * première.
 */
export const talentConsentSchema = z
  .object({
    /** Quand l'accord a été recueilli. `null` = jamais — une information. */
    givenAt: z.string().nullable(),
    /** Jusqu'à quand il vaut. `null` = pas d'échéance connue. */
    expiresAt: z.string().nullable(),
    /** La base légale, en clair. Texte libre : la formulation engage l'ESN. */
    basis: z.string().nullable(),
    /**
     * #2185.57 — ce que la personne a EXCLU de son accord (« pas de mission
     * chez tel concurrent », « ne pas partager mon CV avant le 1er »).
     * Distinct de `basis` (la base légale) et de la fenêtre de validité
     * (`givenAt`/`expiresAt`) : une restriction borne l'USAGE, pas la durée.
     * `null` = aucune restriction connue — jamais une chaîne vide, qui se
     * lirait « la personne a confirmé n'en avoir aucune ».
     */
    restrictions: z.string().nullable(),
  })
  .strict()
export type TalentConsent = z.infer<typeof talentConsentSchema>

/** Le bandeau du §7.3 se déclenche à 30 jours. */
export const CONSENT_WARNING_DAYS = 30

export const CONSENT_STATES = ['none', 'valid', 'expiring', 'expired'] as const
export const consentStateSchema = z.enum(CONSENT_STATES)
export type ConsentState = (typeof CONSENT_STATES)[number]

/**
 * L'état d'un consentement à une date donnée.
 *
 * `now` est un paramètre et non une lecture d'horloge : sinon la fonction n'est
 * pas testable, et « expire dans 30 jours » dérive d'un jour à l'autre sans
 * que personne ne s'en aperçoive.
 *
 * `none` n'est PAS `expired`. Un dossier sans consentement recueilli n'est pas
 * un dossier dont l'accord a expiré : l'un demande de poser la question, l'autre
 * de la reposer, et les confondre ferait écrire au mauvais moment.
 */
export function consentState(consent: TalentConsent, now: Date): ConsentState {
  if (!consent.givenAt) return 'none'
  if (!consent.expiresAt) return 'valid'
  const expiry = Date.parse(consent.expiresAt)
  if (Number.isNaN(expiry)) return 'valid'
  if (expiry <= now.getTime()) return 'expired'
  const days = (expiry - now.getTime()) / (24 * 60 * 60 * 1000)
  return days <= CONSENT_WARNING_DAYS ? 'expiring' : 'valid'
}

/**
 * Combien de jours restent. `null` quand la question ne se pose pas, jamais un
 * nombre négatif — qui se lirait comme une donnée corrompue sur une fiche.
 */
export function daysBeforeConsentExpiry(consent: TalentConsent, now: Date): number | null {
  if (!consent.expiresAt) return null
  const expiry = Date.parse(consent.expiresAt)
  if (Number.isNaN(expiry)) return null
  return Math.max(0, Math.ceil((expiry - now.getTime()) / (24 * 60 * 60 * 1000)))
}
