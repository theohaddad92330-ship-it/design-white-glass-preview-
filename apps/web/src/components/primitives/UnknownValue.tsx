import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * Une valeur qui n'a pas été mesurée — l'écrire, plutôt que d'écrire zéro.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE PRIMITIVE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * La règle est dans le dépôt depuis des mois — « non mesuré n'est pas mesuré à
 * zéro » — et elle est appliquée **au calcul** : les scores rendent `null`, les
 * agrégats sortent les axes non évaluables de leur dénominateur, les taux sans
 * dénominateur valent `null`.
 *
 * Puis l'écran écrit `{value ?? 0}` et tout le travail est perdu. Un « 0 %
 * d'exécution vérifiée » sur un espace créé hier envoie chercher une panne ; un
 * « 0 jour de retard » se lit « elle vient d'échoir » ; un « 0 offre » se lit
 * « ce département est mort ». Chaque fois, la valeur calculée disait `null`.
 *
 * Cette primitive rend la règle VISIBLE à la lecture du JSX, et c'est ce qui
 * permet à GA-19 de la vérifier mécaniquement.
 *
 * `reason` est optionnel mais fortement recommandé : « non mesuré » répond à la
 * question « combien ? », pas à « pourquoi je ne sais pas ? », et c'est la
 * seconde qui dit à l'utilisateur s'il peut y faire quelque chose.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `staleSince` — « on a su, c'était il y a huit mois »
 * ─────────────────────────────────────────────────────────────────────────
 * C'est la forme d'absence qui manquait, et elle appelle un geste DIFFÉRENT :
 * « jamais su » demande d'aller chercher, « périmé » demande de revérifier.
 * Rendues de la même phrase et du même gris, les deux se confondent — et
 * l'utilisateur cesse de faire la différence.
 *
 * La notion existait déjà, pour les faits d'accès seuls : ils portent leurs
 * demi-vies et un fait périmé « redevient à vérifier » plutôt que de
 * disparaître. Elle vivait là et nulle part ailleurs, si bien que tout écran
 * qui voulait la même chose devait recomposer la phrase à la main.
 *
 * Une date illisible retombe sur « non mesuré » : afficher « Invalid Date »
 * ferait passer une donnée absente pour un défaut d'affichage, et quelqu'un
 * irait chercher un bug qui n'existe pas.
 */
export function UnknownValue({
  reason,
  staleSince,
  className,
  discreet = false,
  bare = false,
  compact = false,
}: {
  reason?: string | null
  staleSince?: Date | string | null
  className?: string
  /**
   * #2737 — la forme d'une CELLULE de tableau dense : un tiret atténué à
   * l'œil, « non mesuré » (et la raison) pour le lecteur d'écran et au
   * survol. Même vérité, sans noyer la ligne sous dix « non mesuré ». Le
   * tiret n'est jamais seul : le nom accessible dit toujours l'absence.
   */
  discreet?: boolean
  /**
   * #3483 — « non mesuré » ×38 : la forme d'une cellule dont le BLOC dit déjà
   * l'absence UNE fois (légende sous le tableau). Un tiret, nommé pour le
   * lecteur d'écran par `aria-label` — rien de plus dans le texte.
   * L'écran qui l'emploie DOIT porter cette légende.
   */
  bare?: boolean
  /**
   * #3563.1 — la forme d'une cellule ÉTROITE : le libellé court (« non mesuré »)
   * se lit, la raison vit en infobulle et dans le nom accessible. Dans une
   * colonne de 72 px la phrase entière faisait ~10 lignes et une ligne de 256 px.
   */
  compact?: boolean
}) {
  const { t, i18n } = useTranslation('common')
  const stale = toValidDate(staleSince)
  // La raison explicite l'emporte : l'écran qui la passe en sait plus que nous.
  const label =
    !reason && stale ? t('staleValue', { date: stale.toLocaleDateString(i18n.language) }) : t('unknownValue')
  if (bare) {
    return (
      <Text size="sm" color="text-[var(--bellum-text-muted)]" className={className}>
        <span role="img" aria-label={label}>
          —
        </span>
      </Text>
    )
  }
  if (compact) {
    return (
      <Text size="sm" color="text-[var(--bellum-text-muted)]" className={className} title={reason ?? label}>
        <span role="img" aria-label={reason ? `${label} — ${reason}` : label}>
          {label}
        </span>
      </Text>
    )
  }
  if (discreet) {
    return (
      <Text size="sm" color="text-[var(--bellum-text-muted)]" className={className} title={reason ?? label}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">
          {label}
          {reason ? ` — ${reason}` : ''}
        </span>
      </Text>
    )
  }
  return (
    <Text size="sm" color="text-[var(--bellum-text-muted)]" className={className} title={reason ?? label}>
      {label}
      {reason ? ` — ${reason}` : ''}
    </Text>
  )
}

function toValidDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Le rendu d'une mesure qui peut manquer, en une ligne.
 *
 * Préférer ceci à `{value ?? 0}` partout où `null` veut dire « je n'ai pas
 * regardé ». Là où `0` est une VRAIE valeur — zéro contact, zéro mission —
 * écrire le nombre directement : cette primitive n'a rien à y faire.
 */
export function MeasuredValue({
  value,
  reason,
  staleSince,
  format,
}: {
  value: number | string | null | undefined
  reason?: string | null
  staleSince?: Date | string | null
  format?: (value: number | string) => string
}) {
  if (value === null || value === undefined || value === '')
    return <UnknownValue reason={reason} staleSince={staleSince} />
  return <>{format ? format(value) : value}</>
}
