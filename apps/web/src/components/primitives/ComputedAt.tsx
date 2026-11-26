import { deriveComputedAt } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { AggregateNote } from './AggregateNote'

/**
 * « Recalculé à 06:12 » — un agrégat dit QUAND il a été calculé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE PRIMITIVE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Tome 7, partie A, loi 2 « partout, sans exception », élément n°10 : « à
 * créer, absent de tous les KPI et agrégats ».
 *
 * C'est le JUMEAU de `Completeness`, et il répond à l'autre moitié de la même
 * question : « calculé sur 12 dossiers notés sur 43 » dit _sur quoi_, celui-ci
 * dit _quand_. Les deux qualifient le même chiffre, se posent au même endroit —
 * le `footer` d'une `KpiCard` — et partagent leur voix (`AggregateNote`).
 *
 * Un chiffre sans sa date de calcul se lit comme un chiffre du jour. Sur un
 * agrégat rafraîchi une fois par nuit, c'est faux la moitié de la journée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA PRIMITIVE REFUSE D'AFFICHER
 * ─────────────────────────────────────────────────────────────────────────
 *  - **L'heure de la REQUÊTE.** C'est le piège central du sujet : quand un
 *    agrégat est calculé à la volée, sa « date de calcul » est l'instant du
 *    chargement, et l'afficher produit « il y a une seconde » à chaque
 *    rafraîchissement — un chiffre inventé déguisé en traçabilité. Le refus
 *    n'est pas ici mais dans `deriveComputedAt` (`@bellum/contracts`), pour que
 *    l'API qui produit un agrégat le lise avec les MÊMES règles que l'écran.
 *  - **Une date de calcul absente maquillée en « aujourd'hui ».** Elle se DIT
 *    inconnue — « non mesuré n'est jamais 0 », transposé au temps.
 *  - **Une heure seule sur un calcul d'un autre jour.** « Recalculé à 06:12 »
 *    sur un chiffre de la semaine dernière ment par omission.
 *
 * ⚠️ La date passe par `formatDate` (`@/lib/locale`) et jamais par un
 * `toLocaleDateString()` nu : la langue d'affichage est celle de l'APPLICATION,
 * pas celle du navigateur. Trois surfaces rendaient déjà cette même idée, avec
 * trois formateurs différents — dont un verrouillé en français quelle que soit
 * la langue de l'utilisateur.
 *
 * #2110.44 (16/09/2026) — application confirmée : le panneau de restitution
 * de première synchro (#2110) affiche la SOURCE d'un résultat (#2110.42), pas
 * sa date. Ce panneau calcule à la volée, sans job de synchro persisté — donc
 * pas d'instant de calcul qui veuille dire quelque chose à afficher. Le brief
 * demandait « la source ET la date » ; la réponse est que la date n'existe
 * pas, pas qu'on l'a oubliée. Persister un instant de calcul réel reste
 * possible plus tard (un lot, pas une retouche) ; ce jour-là, il repasse par
 * CETTE primitive, pas par un formateur maison. Registre :
 * `.claude/notes/registre-2026-09-16-briefing.md` (point 2110.44).
 */
export function ComputedAt({
  at,
  className,
  persisted = false,
}: {
  /** L'instant du CALCUL, servi par le serveur. `null` = on ne le connaît pas. */
  at: string | Date | null | undefined
  className?: string
  /**
   * #4289.8 — l'instant est un fait ÉCRIT en base (le plan, à l'enregistrement), jamais l'heure de la requête :
   * le refus « indiscernable de la requête » ne s'applique pas, un calcul d'il y a dix secondes dit son heure.
   */
  persisted?: boolean
}) {
  const { t } = useTranslation('common')
  const verdict = deriveComputedAt(at, new Date())

  // Indiscernable de la requête : il n'y a rien à apprendre, donc rien à dire.
  if (verdict.kind === 'live') {
    // #4289.8 — un instant persisté, lisible, se dit : « Calculé à 14:00 », pas un silence.
    const stored = persisted && at ? formatDate(at, { timeStyle: 'short' }) : null
    return stored ? (
      <AggregateNote className={className}>{t('computedAt.today', { time: stored })}</AggregateNote>
    ) : null
  }

  if (verdict.kind === 'unknown') {
    return <AggregateNote className={className}>{t('computedAt.unknown')}</AggregateNote>
  }

  // Le jour même, c'est l'HEURE qui informe ; un autre jour, c'est la DATE.
  const label =
    verdict.kind === 'sameDay'
      ? formatDate(verdict.at, { timeStyle: 'short' })
      : formatDate(verdict.at, { dateStyle: 'short' })

  // `formatDate` rend `null` sur une valeur qu'il ne sait pas lire. Le verdict
  // garantit ici une date valide, mais un repli silencieux sur une chaîne vide
  // écrirait « Calculé le  » — une phrase amputée se lit comme un bug, et une
  // absence se DIT.
  if (!label) return <AggregateNote className={className}>{t('computedAt.unknown')}</AggregateNote>

  return (
    <AggregateNote className={className}>
      {verdict.kind === 'sameDay' ? t('computedAt.today', { time: label }) : t('computedAt.on', { date: label })}
    </AggregateNote>
  )
}
