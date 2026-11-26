import { isCalendarDate, relativeDeadlineDays, resolveRelativeDeadline } from '@bellum/contracts'
import { i18n } from '@/i18n'

/**
 * L'affichage d'une échéance — et le seul endroit de l'application qui a le
 * droit de transformer une échéance en date.
 *
 * ⚠️ Trois formes circulent sous le même champ `deadline` :
 * - une date calendaire `YYYY-MM-DD` (posée à la main par le commercial) ;
 * - un jeton RELATIF produit par le pipeline (`J+1`, `S+5`, `M+3S+2`) ;
 * - de la prose (« Semaine 1 »), sur les dossiers d'avant le jeton.
 *
 * Les donner toutes à `new Date()` est ce qui affichait vingt-sept rappels
 * d'équipe en **2001** : le parseur de V8 complète l'année manquante par 2001 et
 * rend une date d'allure plausible. Ici, une valeur qu'on ne sait pas dater ne
 * DEVIENT jamais une date — elle se dit en clair, ce qui est vrai et utile.
 */

/** La locale d'affichage, alignée sur la langue de l'interface. */
function locale(): string {
  return i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
}

/**
 * Une date calendaire ISO rendue dans la langue de l'interface, ou `null`.
 *
 * Le filtre {@link isCalendarDate} précède le `new Date` : c'est lui qui ferme
 * la porte au parseur permissif (« Fri Aug 29 » → 2001) et aux dates qui
 * n'existent pas (`2026-02-29`).
 */
export function formatCalendarDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
): string | null {
  if (!isCalendarDate(value)) return null
  const [year, month, day] = (value as string).split('-').map(Number) as [number, number, number]
  // Construite en UTC et formatée en UTC : une date NUE prise à minuit local
  // recule d'un jour à l'ouest de Greenwich.
  return new Intl.DateTimeFormat(locale(), { ...options, timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  )
}

/**
 * L'échéance sous forme de date calendaire `YYYY-MM-DD`, ou `null`.
 *
 * `base` est la date qui a PRODUIT le plan (`accounts.last_analyzed_at`), et
 * jamais aujourd'hui : « J+1 » veut dire « le lendemain du plan ». Calé sur
 * l'horloge de lecture, le même « J+1 » resterait « demain » six mois plus
 * tard — c'est-à-dire l'inverse de ce qu'une échéance affirme.
 *
 * Sans base lisible, un jeton relatif ne produit AUCUNE date : on préfère ne
 * pas savoir que se tromper.
 */
export function deadlineCalendarValue(
  deadline: string | null | undefined,
  base: string | null | undefined,
): string | null {
  if (typeof deadline !== 'string') return null
  const raw = deadline.trim()
  if (raw.length === 0) return null
  if (isCalendarDate(raw)) return raw

  const at = typeof base === 'string' && base.length > 0 ? new Date(base) : null
  if (!at || Number.isNaN(at.getTime())) return null
  return resolveRelativeDeadline(raw, at)
}

/**
 * L'échéance telle qu'elle s'affiche :
 * 1. une date quand elle est CALCULABLE ;
 * 2. sinon l'horizon en clair (« sous 10 jours ») quand le jeton se lit mais
 *    qu'aucune base fiable n'existe ;
 * 3. sinon le libellé TEL QUEL — la prose du pipeline reste lisible ;
 * 4. `null` quand il n'y a rien : un marque-place se lirait comme une donnée.
 */
export function formatDeadline(deadline: string | null | undefined, base: string | null | undefined): string | null {
  if (typeof deadline !== 'string') return null
  const raw = deadline.trim()
  if (raw.length === 0) return null

  const calendar = deadlineCalendarValue(raw, base)
  if (calendar) return formatCalendarDate(calendar)

  const days = relativeDeadlineDays(raw)
  if (days !== null) return i18n.t('common:deadline.withinDays', { count: days })

  return raw
}

/** L'heure à laquelle un rendez-vous se pose quand l'échéance ne dit qu'un JOUR.
 *  Neuf heures : une heure de travail. Minuit ferait un événement « toute la
 *  nuit » que personne ne voit passer. */
const DEFAULT_HOUR = '09:00'

/**
 * La valeur `datetime-local` (`YYYY-MM-DDTHH:mm`) qui pré-remplit un événement
 * d'agenda depuis une échéance de plan — ou `undefined`.
 *
 * ⚠️ C'était le second chemin par lequel une échéance devenait 2001 : le bouton
 * « Ajouter à l'agenda » recevait le jeton BRUT (`J+10`) et le donnait à
 * `new Date()`. L'événement proposé partait donc au **1ᵉʳ octobre 2001**, et
 * l'utilisateur n'avait aucune raison de relire une date déjà remplie.
 *
 * `undefined` fait retomber le formulaire sur « la prochaine heure ronde », qui
 * est un défaut ASSUMÉ — jamais une date fabriquée.
 */
export function deadlineStartLocal(
  deadline: string | null | undefined,
  base: string | null | undefined,
): string | undefined {
  const calendar = deadlineCalendarValue(deadline, base)
  // Écrit en heure locale de bout en bout : passer par un `Date` UTC ferait
  // basculer l'événement au jour précédent à l'ouest de Greenwich.
  return calendar ? `${calendar}T${DEFAULT_HOUR}` : undefined
}
