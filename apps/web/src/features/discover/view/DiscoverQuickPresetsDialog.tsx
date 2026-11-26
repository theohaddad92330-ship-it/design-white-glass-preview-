import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@bellum/ui'
import { discoverPresets, type DiscoverPreset } from '../lib/discover-presets'

/**
 * #2504 — LES PISTES RAPIDES DANS UNE MODALE, PAS UNE RANGÉE DE PUCES.
 *
 * Mesuré en production le 17/09/2026 : la rangée de cinq pastilles pesait
 * autant que la saisie libre elle-même, et son explication (le `title` HTML)
 * n'apparaissait qu'au survol — invisible au clavier comme au doigt. Le
 * retour : « supprimer les pistes rapides ou les rendre déployables dans une
 * modale, et caler le bouton en haut sur la même ligne que le champ de
 * recherche pour gagner de la place ».
 *
 * Un bouton, sur la même ligne que la saisie (`Discover.tsx`), ouvre cette
 * modale : chaque piste y est nommée ET expliquée en texte VISIBLE (ce que le
 * `title` ne permettait pas). Un clic applique la piste comme avant et ferme
 * — `Dialog` de `@bellum/ui` rend le focus au déclencheur à la fermeture.
 */
export function DiscoverQuickPresetsDialog({
  open,
  onOpenChange,
  onApply,
  presets = discoverPresets(),
  radarTechnology = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (preset: DiscoverPreset) => void
  /** #2165.12 / #2165.13 — les pistes sourcées (portefeuille d'offre, meilleures
   *  références), calculées par `Discover` ; une piste sans source est
   *  désactivée et DIT pourquoi, en texte visible. */
  presets?: DiscoverPreset[]
  /** #4285.3 — la technologie suivie déjà tapée dans Découvrir (`radarTechnologyFromFilters`) :
   *  l'entrée ouvre le radar PRÉ-REMPLI. `null` : le radar s'ouvre vide, comme avant. */
  radarTechnology?: string | null
}) {
  const { t } = useTranslation(['discover', 'common', 'technologyRadar'])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} aria-label={t('commands.presetsLabel')}>
        <DialogHeader>
          <DialogTitle>{t('commands.presetsLabel')}</DialogTitle>
          <DialogDescription>{t('commands.presetsDialogHint')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {/* #3119 (beta, 26/09/2026) — « à mettre en premier dans pistes
              rapides, enlever d'ici » : l'entrée du lot multi-comptes (#2293)
              quitte l'en-tête de /discover et devient la PREMIÈRE piste, une
              navigation (pas un filtre) donc `Link`, pas `onApply`. */}
          <Link
            to="/discover/lots"
            onClick={() => onOpenChange(false)}
            className="flex flex-col gap-1 rounded-lg border border-[var(--bellum-border)] px-3.5 py-3 text-left transition-colors pointer-coarse:min-h-11 hover:border-[var(--bellum-primary-500)] hover:bg-[color:var(--bg-surface-hover)]"
          >
            <span className="text-sm font-medium text-[var(--bellum-text-primary)]">{t('batches.entry')}</span>
            <span className="text-xs text-[var(--bellum-text-muted)]">{t('batches.intro')}</span>
          </Link>
          {/* #4282.10 — l'entrée par technologie : une navigation, comme le lot ci-dessus. */}
          <Link
            to="/discover/radar"
            search={radarTechnology ? { technology: radarTechnology } : {}}
            onClick={() => onOpenChange(false)}
            className="flex flex-col gap-1 rounded-lg border border-[var(--bellum-border)] px-3.5 py-3 text-left transition-colors pointer-coarse:min-h-11 hover:border-[var(--bellum-primary-500)] hover:bg-[color:var(--bg-surface-hover)]"
          >
            <span className="text-sm font-medium text-[var(--bellum-text-primary)]">
              {radarTechnology
                ? t('technologyRadar:entryPrefilled', { technology: radarTechnology })
                : t('technologyRadar:entry')}
            </span>
            <span className="text-xs text-[var(--bellum-text-muted)]">{t('technologyRadar:entryHint')}</span>
          </Link>
          {presets.map(preset => (
            <button
              key={preset.id}
              type="button"
              disabled={Boolean(preset.disabledReason)}
              onClick={() => {
                onApply(preset)
                onOpenChange(false)
              }}
              className="flex flex-col gap-1 rounded-lg border border-[var(--bellum-border)] px-3.5 py-3 text-left transition-colors pointer-coarse:min-h-11 hover:border-[var(--bellum-primary-500)] hover:bg-[color:var(--bg-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--bellum-border)] disabled:hover:bg-transparent"
            >
              <span className="text-sm font-medium text-[var(--bellum-text-primary)]">
                {t(`presets.${preset.id}.label`)}
              </span>
              <span className="text-xs text-[var(--bellum-text-muted)]">
                {preset.disabledReason
                  ? t(`presets.disabledReason.${preset.disabledReason}`)
                  : t(`presets.${preset.id}.hint`)}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
