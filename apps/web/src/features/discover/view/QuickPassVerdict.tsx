import { useTranslation } from 'react-i18next'
import type { DiscoverQuickPassAxis, DiscoverQuickPassEntry, DiscoverQuickPassVerdict } from '@bellum/contracts'

/**
 * #2630.1 → #3597.3 — LA PASSE RAPIDE, désormais un BADGE SUR LA LIGNE
 * (décision Louis 04/10/2026 : plus de panneau séparé, le même compte n'est
 * plus rendu deux fois).
 *
 * Le jugement ne vit PAS ici : il vient du contrat partagé
 * (`buildDiscoverQuickPassEntry`, via `discoverQuickPassEntry`), qui refuse un
 * verdict sans son axe décisif et refuse toute probabilité. Ce fichier
 * AFFICHE, et il tient les règles que seul l'affichage peut trahir :
 *
 *  1. le verdict est un MOT — Go / Prudence / Non — jamais un pourcentage, jamais
 *     une chance de signer (refusée six fois, `c26_probabilite`) ;
 *  2. un compte SANS verdict calculable n'a PAS de badge (« on n'affiche pas ce
 *     qu'on n'a pas », 20/09/2026) ;
 *  3. un verdict n'est jamais nu : ses axes pesés sont NOMMÉS, et ceux qu'on n'a
 *     pas pu peser le sont AUSSI (`QuickPassAxes`, dans le repliable de la ligne —
 *     exception « sous un SCORE, les axes non évaluables restent nommés ») ;
 *  4. un axe non évaluable ne vaut jamais ZÉRO (GA-18 / GA-19).
 *
 * ⚠️ Il ne DÉCIDE rien : suivre, écarter et analyser restent les gestes de
 * `CandidateActions`. Un verdict « Non » ne masque aucune ligne.
 */

/** La couleur d'un verdict — un jeton du thème, jamais une couleur écrite (GA-33). */
const VERDICT_COLOR: Readonly<Record<DiscoverQuickPassVerdict, string>> = {
  go: 'var(--bellum-success-text)',
  prudence: 'var(--bellum-warning-text)',
  non: 'var(--text-muted)',
}

/** Le badge de la ligne — `null` quand le verdict n'est pas calculable. */
export function QuickPassBadge({ entry }: { entry: DiscoverQuickPassEntry | null }) {
  const { t } = useTranslation('discover')
  // #3597.12 — recette 04/10 : sur une recherche registre, aucun verdict ne se
  // calcule (seul l'intérêt est pesé). Dans une LISTE, une absence ne fait
  // AUCUNE ligne (doctrine, Louis 20/09/2026) : pas de badge « Pas assez
  // d'éléments » répété sur 40 lignes. Les axes pesés et non pesés restent dans
  // le détail repliable.
  if (!entry || entry.verdict === null) return null
  return (
    <span
      data-testid="quick-pass-badge"
      title={t('quickPass.badgeHint')}
      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{
        color: VERDICT_COLOR[entry.verdict],
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-elevated)',
      }}
    >
      {t('quickPass.badge', { verdict: t(`quickPass.verdict.${entry.verdict}`) })}
    </span>
  )
}

/** Les axes du verdict — la raison, ce qui a été pesé, ce qui ne l'a pas pu. */
export function QuickPassAxes({ entry }: { entry: DiscoverQuickPassEntry }) {
  const { t } = useTranslation('discover')
  const axisName = (axis: DiscoverQuickPassAxis) => t(`quickPass.axis.${axis}`)

  // ⚠️ Les axes non évaluables NOMMENT aussi la raison de leur silence : « deux
  // axes non évaluables » n'apprend rien, « les sources datées n'ont pas été
  // interrogées » dit quoi compléter.
  const silences = entry.axes
    .filter(axis => axis.state === null && axis.unevaluable !== null)
    .map(axis => `${axisName(axis.axis)} — ${t(`quickPass.unevaluable.${axis.unevaluable}`)}`)

  return (
    <div
      data-testid="quick-pass-axes"
      className="mt-2 flex flex-col gap-1 rounded-md p-2"
      style={{ border: '1px solid var(--border-subtle)' }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {t('quickPass.title')}
        {entry.verdict && ` · ${t(`quickPass.verdict.${entry.verdict}`)}`}
      </p>
      <p className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
        {t(`quickPass.reason.${entry.reason}`)}
      </p>
      {entry.evaluatedAxes.length > 0 && (
        <p className="text-xs leading-snug" style={{ color: 'var(--text-muted)' }}>
          {t('quickPass.weighed', { axes: entry.evaluatedAxes.map(axisName).join(', ') })}
        </p>
      )}
      {silences.length > 0 && (
        <p className="text-xs leading-snug" style={{ color: 'var(--text-ghost)' }}>
          {t('quickPass.unevaluableAxes', { axes: silences.join(' · ') })}
        </p>
      )}
    </div>
  )
}
