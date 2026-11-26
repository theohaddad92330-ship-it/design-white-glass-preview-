import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import type { LauncherRun } from '@bellum/contracts'
import { Text, cn } from '@bellum/ui'
import { useLauncherArm } from './LauncherProvider'

/**
 * Ce que le composer dit d'un run ARMÉ — et rien tant que rien ne l'est.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE COMPOSANT A CESSÉ D'ÊTRE (Louis, 29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * Il portait, EN PERMANENCE, une rangée « ⚡ Lancer : Compte · Contact ·
 * Besoin · Talent · Territoire » sous la zone de saisie. L'écran avait donc
 * deux barres de pastilles pour un même geste — les exemples au-dessus du
 * champ, les actions en dessous — dont une seule se lisait comme une
 * invitation. « Faudrait enlever les "Lancer : …" mais juste mettre ça en
 * exemple comme d'autres trucs. »
 *
 * Les quatre entrées ont donc rejoint la rangée d'exemples
 * ({@link LauncherExamples}), sous le libellé de leur travail dominant.
 * Ce qui reste ici est ce qui n'existe qu'APRÈS un clic : la portée, le
 * « ça ne se tape pas », la réassurance, les runs alternatifs avec leur prix,
 * et « Annuler ».
 *
 * ⚠️ **Rien n'est rendu tant qu'aucun type n'est armé**, et c'est la moitié de
 * la correction : une rangée permanente d'actions serait exactement la seconde
 * mécanique qu'on vient de retirer. Le composer non armé se rend donc
 * exactement comme un composer sans lanceur.
 *
 * Ce qui n'a PAS bougé : le champ reste unique (le défaut mesuré le
 * 27/08/2026, deux zones de saisie à 550 px l'une de l'autre), et ce qui change
 * quand un run est armé reste ce que le champ DIT de lui-même — son
 * marque-place, son bouton, ce que fait Entrée (voir `launcher-arm.ts`).
 */
export function ComposerLauncher({ disabled = false }: { disabled?: boolean }) {
  const { t } = useTranslation('launcher')
  const launcher = useLauncherArm()

  // Pas de fournisseur = pas de lanceur sur cette surface. Le composer se rend
  // exactement comme avant plutôt que d'afficher une rangée qui ne fait rien.
  if (!launcher) return null

  const { types, typeKey, runs, armedRun, pickRun, disarm } = launcher
  const activeType = typeKey ? types.find(type => type.key === typeKey) : undefined
  // Rien d'armé, rien à dire. C'est LA différence avec la version d'avant.
  if (!activeType) return null

  return (
    <div className="mt-2 space-y-1.5 border-t border-[var(--bellum-border)] pt-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          {/* #1112 — « Je n'avais pas compris que ça cherchait que dans les
              contacts en base. » `acceptsUnknown` portait la réponse depuis le
              premier jour et AUCUN écran ne la lisait. Le compte, lui, accepte
              un nom inconnu : c'est le geste fondateur du produit, et il n'a
              rien à annoncer. */}
          {!activeType.acceptsUnknown && armedRun?.queryParam !== null ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t(`scope.${activeType.key}`)}
            </Text>
          ) : null}

          {armedRun?.queryParam === null ? (
            /* Ce run ne se cherche pas au clavier — un territoire se CHOISIT
               dans une liste de départements. Le dire ici évite d'attendre une
               frappe qu'on jetterait sans prévenir. */
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('noTyping')}
            </Text>
          ) : null}

          {/* La réassurance qui vivait sous l'ancienne bande. Elle DOIT suivre :
              c'est la phrase qui rend un exemple cliquable sans crainte, et sans
              elle un utilisateur qui voit « 8 crédits » à côté du bouton croit
              que le clic prélève. */}
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('footer.run')}
          </Text>
        </div>

        {/* « Annuler » reste ici, à côté de ce qu'il annule. Recliquer
            l'exemple désarme aussi, mais cette convention-là est invisible à
            qui ne la connaît pas — et le seul autre moyen de revenir à Laura
            serait de deviner. */}
        <button
          type="button"
          onClick={disarm}
          aria-label={t('disarm')}
          className="inline-flex shrink-0 items-center gap-1 rounded-control px-2 text-xs text-[var(--bellum-text-muted)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] min-h-11"
        >
          <X className="size-3.5" aria-hidden />
          {t('disarm')}
        </button>
      </div>

      {runs.length > 1 ? (
        <div className="space-y-1">
          {runs.map(run => (
            <button
              key={run.key}
              type="button"
              disabled={disabled}
              onClick={() => pickRun(run.key)}
              aria-pressed={armedRun?.key === run.key}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-control border px-3 text-left min-h-11',
                'disabled:cursor-not-allowed disabled:opacity-50',
                armedRun?.key === run.key
                  ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]'
                  : 'border-[var(--bellum-border)] hover:bg-[var(--bellum-surface-2)]',
              )}
            >
              <Text size="xs">{t(run.labelKey)}</Text>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * #2428.14 — la durée ESTIMÉE, collée au coût avant le clic (nom, périmètre,
 * coût s'affichaient déjà ; la durée, jamais).
 *
 * `run.durationKey` porte une estimation établie (voir le catalogue) ; son
 * absence n'est jamais comblée par un chiffre deviné — `duration.unknown`
 * ("non mesurée") le dit, même discipline que `enrichment-duration-text.ts`
 * qui refuse déjà un zéro ou une estimation inventée.
 */
export function RunDuration({ run }: { run: LauncherRun }) {
  const { t } = useTranslation('launcher')
  return (
    <Text size="xs" color="text-[var(--bellum-text-muted)]">
      {run.durationKey ? t(run.durationKey) : t('duration.unknown')}
    </Text>
  )
}
