import { isFutureSignalDate, parseSignalDate, type SignalDateValue } from '@bellum/contracts'
import { i18n } from '@/i18n'

/**
 * Render a free-text signal date at the precision the SOURCE actually carried.
 *
 * The IA emits `recent_signals[].date` as prose ("2021", "juillet 2026",
 * "3 days ago", "Non daté précisément"). The previous implementation piped it
 * through `new Date()`, which turned a bare year into 1 January — six Veille
 * rows all claiming "1 janv. 2026" — and echoed unparseable values verbatim,
 * leaking English relative dates into the French UI.
 *
 * Rules: never widen precision, never echo raw LLM prose.
 */
export function formatSignalDate(raw: string | null | undefined): string {
  return withFutureMark(raw, renderSignalDate(parseSignalDate(raw)))
}

/**
 * #3928.2 — une date de publication ne peut pas être dans le futur : c'est un
 * horizon (échéance, programme) ou une erreur de lecture. L'afficher comme un
 * fait passé (« déc. 2026 » le 09/10/2026) trompe ; on la garde, on la NOMME.
 * Jamais une date inventée, jamais écartée en silence.
 */
function withFutureMark(raw: string | null | undefined, rendered: string): string {
  return isFutureSignalDate(raw) ? `${rendered} · ${i18n.t('common:signalDate.toVerify')}` : rendered
}

/**
 * #5 (recette 23/10) — « Immatriculation 1 janv. 1900 » : les registres écrivent 1900-01-01 pour une date INCONNUE.
 * Une date de création/immatriculation dont l'année est ≤ 1901 (ou illisible) n'est pas affichée : on n'affiche pas
 * ce qu'on n'a pas. Retourne la valeur d'origine quand elle est plausible, sinon `null`.
 */
export function plausibleRegistryDate(raw: string | null | undefined): string | null {
  const year = /^\s*(?:(\d{4})-\d{2}|\d{2}\/\d{2}\/(\d{4})|(\d{4})\s*$)/.exec(raw ?? '')
  const value = Number(year?.[1] ?? year?.[2] ?? year?.[3])
  return year && value > 1901 ? (raw ?? null) : null
}

/** La date de création d'un registre à l'écran : `null` quand la source n'en sait rien (jamais « 1 janv. 1900 »). */
export function formatRegistryDateIfKnown(raw: string | null | undefined): string | null {
  const plausible = plausibleRegistryDate(raw)
  return plausible ? formatSignalDateIfKnown(plausible) : null
}

/**
 * #3499 — comme `formatSignalDate`, mais `null` quand la valeur n'est pas une
 * date lisible : un champ de méta s'OMET plutôt que d'afficher « non daté » ou
 * la chaîne brute (ISO `2026-09-25T14:32:52.000+0000` d'une offre d'emploi).
 */
export function formatSignalDateIfKnown(raw: string | null | undefined): string | null {
  const value = parseSignalDate(raw)
  return value.kind === 'unknown' ? null : withFutureMark(raw, renderSignalDate(value))
}

function renderSignalDate(value: SignalDateValue): string {
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  switch (value.kind) {
    case 'day':
      return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(Date.UTC(value.year, value.month - 1, value.day)),
      )
    case 'month':
      return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(Date.UTC(value.year, value.month - 1, 1)),
      )
    case 'year':
      return String(value.year)
    case 'range':
      return i18n.t('common:signalDate.range', { from: value.from, to: value.to })
    case 'relative':
      return i18n.t(`common:signalDate.relative.${value.unit}`, { count: value.amount })
    case 'unknown':
      return i18n.t('common:signalDate.undated')
  }
}
