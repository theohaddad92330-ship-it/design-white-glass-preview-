import type { ChangelogLanguage, SavedViewAlertFrequency } from '@bellum/contracts'

/**
 * CE QUE DIT UNE ALERTE DE DÉCOUVRIR — en français et en anglais, au même
 * endroit, parce que deux fichiers de textes divergent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ALERTE DIT, ET CE QU'ELLE NE DIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle dit qu'un périmètre que son propriétaire a enregistré arrive à la
 * cadence qu'il a lui-même choisie, et elle renvoie à l'écran pour le rejouer.
 *
 * Elle ne porte AUCUN résultat. Rejouer une recherche de Découvrir appelle le
 * moteur et débite un crédit : le faire sans geste de l'utilisateur serait une
 * décision de facturation, qui n'appartient pas à ce lot. L'alerte est donc un
 * rappel d'un engagement pris, jamais une invitation creuse à revenir — c'est
 * la finalité écrite au registre des types de notification.
 *
 * Elle ne nomme aucun fournisseur : ni celui qui porte l'e-mail, ni celui qui
 * porte le SMS. Nos fournisseurs ne se nomment jamais, nulle part.
 */

/** La cadence, dans la langue du lecteur. */
const CADENCE: Readonly<Record<ChangelogLanguage, Readonly<Record<SavedViewAlertFrequency, string>>>> = {
  fr: { manual: 'manuelle', daily: 'quotidienne', weekly: 'hebdomadaire' },
  en: { manual: 'manual', daily: 'daily', weekly: 'weekly' },
}

type DiscoverAlertSubject = {
  /** Le nom que son propriétaire a donné au périmètre. */
  name: string
  /** L'objectif qu'il a écrit, quand il l'a écrit. Jamais deviné. */
  objective: string | null
  frequency: SavedViewAlertFrequency
  /** L'adresse de l'écran où le rejouer, quand l'API sait la composer. */
  url: string | null
}

type DiscoverAlertEmailContent = {
  subject: string
  heading: string
  bodyLines: string[]
  ctaUrl?: string
  ctaLabel?: string
}

/** Un seul segment SMS — même borne que le canal d'alertes urgentes. */
const SMS_MAX_LENGTH = 160

export function buildDiscoverAlertEmail(
  language: ChangelogLanguage,
  subject: DiscoverAlertSubject,
): DiscoverAlertEmailContent {
  const cadence = CADENCE[language][subject.frequency]
  if (language === 'en') {
    return {
      subject: `Your saved search “${subject.name}” is due`,
      heading: `“${subject.name}” is due`,
      bodyLines: [
        `You asked to be reminded on a ${cadence} basis when this perimeter is due to be replayed.`,
        ...(subject.objective ? [`Your objective: ${subject.objective}`] : []),
        'Nothing has been replayed for you: open Discover to run it when it suits you.',
      ],
      ...(subject.url ? { ctaUrl: subject.url, ctaLabel: 'Open Discover' } : {}),
    }
  }
  return {
    subject: `Ta recherche « ${subject.name} » est à rejouer`,
    heading: `« ${subject.name} » est à rejouer`,
    bodyLines: [
      `Tu as demandé à être prévenu à cadence ${cadence} quand ce périmètre est à rejouer.`,
      ...(subject.objective ? [`Ton objectif : ${subject.objective}`] : []),
      'Rien n’a été rejoué à ta place : ouvre Découvrir pour le lancer quand ça t’arrange.',
    ],
    ...(subject.url ? { ctaUrl: subject.url, ctaLabel: 'Ouvrir Découvrir' } : {}),
  }
}

/** Le titre de la notification dans l'application — le même dans les deux canaux. */
export function buildDiscoverAlertTitle(language: ChangelogLanguage, name: string): string {
  return language === 'en' ? `Saved search “${name}” is due` : `Recherche « ${name} » à rejouer`
}

/**
 * Le texte d'un SMS, sur un seul segment. Le NOM du périmètre voyage : c'est
 * son propriétaire qui l'a écrit, et sans lui l'alerte ne désigne rien. Rien
 * d'autre ne voyage — ni objectif, ni critère, ni résultat.
 */
export function buildDiscoverAlertSms(language: ChangelogLanguage, name: string): string {
  const raw = buildDiscoverAlertTitle(language, name).replace(/\s+/g, ' ').trim()
  return raw.length > SMS_MAX_LENGTH ? `${raw.slice(0, SMS_MAX_LENGTH - 1).trimEnd()}…` : raw
}
