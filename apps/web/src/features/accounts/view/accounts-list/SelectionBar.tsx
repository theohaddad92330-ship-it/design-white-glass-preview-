import { motion } from 'framer-motion'
import { Button, DURATION, EASE, Text, useRegisterSelectionBarOpen } from '@bellum/ui'
import { GitCompare, RadioTower, ScanSearch, Sparkles, Target, Upload, Users, X } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'

interface SelectionBarProps {
  count: number
  onCompare: () => void
  /** #2157.4/.8 — ouvre le dialogue « Créer une cible » sur la sélection. */
  onCreateTarget: () => void
  /** #2293.2 — ouvre le devis « Actualiser les signaux » sur la sélection. */
  onRefreshSignals: () => void
  /** #2809 (#2293.2/.11, #2294.*) — ouvre le devis « Actualiser les contacts »
   *  sur la sélection — le même geste que `onRefreshSignals`, axe Contacts. */
  onRefreshContacts: () => void
  /** #2809 (#2293.11, #2294.*) — ouvre le devis « Découvrir des contacts » :
   *  une recherche FRAÎCHE (personnes jamais collectées), distincte de
   *  `onRefreshContacts` (rejeu d'un axe déjà analysé). */
  onDiscoverContacts: () => void
  /** #2809 (#2293.3) — ouvre le devis « Analyser en lot » sur la sélection. */
  onAnalyzeBatch: () => void
  /** #4188 — ouvre l'envoi en lot vers le CRM branché (prévisualisation, puis envoi). */
  onPushToCrm?: () => void
  onClear: () => void
}

/**
 * Floating bar shown at the bottom of `/accounts` while ≥ 2 rows are selected.
 *
 * #2157.10 (GA-386) — défaut mesuré en prod : ce bandeau bas partage son coin
 * avec le composer flottant de Laura (`z-widget`, 80 > notre `z-40`), qui
 * recouvrait « Créer une cible ». `useRegisterSelectionBarOpen` publie sa
 * présence tant qu'elle est montée (le parent ne la monte que sur ≥ 2
 * sélectionnés) ; `LauraDock` la lit et s'efface pendant ce temps — voir
 * `packages/ui/src/hooks/use-selection-bar-open.ts`.
 */
export function SelectionBar({
  count,
  onCompare,
  onCreateTarget,
  onRefreshSignals,
  onRefreshContacts,
  onDiscoverContacts,
  onAnalyzeBatch,
  onPushToCrm,
  onClear,
}: SelectionBarProps) {
  const { t } = useTranslation('accounts')
  useRegisterSelectionBarOpen()
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: DURATION.perceptible, ease: EASE.out }}
      // #4188.4 — la barre tient dans la fenêtre : elle passe à la ligne (jamais de largeur fixe), centrée,
      // au-dessus de la barre d'onglets mobile.
      className="fixed inset-x-0 bottom-[calc(1.5rem+var(--bellum-mobile-nav-height,0px))] mx-auto z-40 flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl px-4 py-2.5 shadow-2xl bg-[var(--bg-surface)] border border-violet-500/30"
      style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(124,58,237,0.15)' }}
    >
      <Text element="span" size="sm" className="text-[var(--text-muted)]">
        <Trans
          ns="accounts"
          i18nKey="selectionBar.selected"
          count={count}
          components={{ highlight: <span className="text-[var(--bellum-text-accent)] font-semibold" /> }}
        />
      </Text>
      <Button variant="violet" size="xs" className="min-h-11" icon={GitCompare} onClick={onCompare}>
        {t('selectionBar.compare')}
      </Button>
      <Button variant="outline" size="xs" className="min-h-11" icon={Target} onClick={onCreateTarget}>
        {t('selectionBar.createTarget')}
      </Button>
      <Button variant="outline" size="xs" className="min-h-11" icon={RadioTower} onClick={onRefreshSignals}>
        {t('selectionBar.refreshSignals')}
      </Button>
      <Button variant="outline" size="xs" className="min-h-11" icon={Users} onClick={onRefreshContacts}>
        {t('selectionBar.refreshContacts')}
      </Button>
      <Button variant="outline" size="xs" className="min-h-11" icon={Sparkles} onClick={onDiscoverContacts}>
        {t('selectionBar.discoverContacts')}
      </Button>
      <Button variant="outline" size="xs" className="min-h-11" icon={ScanSearch} onClick={onAnalyzeBatch}>
        {t('selectionBar.analyzeBatch')}
      </Button>
      {onPushToCrm ? (
        <Button variant="outline" size="xs" className="min-h-11" icon={Upload} onClick={onPushToCrm}>
          {t('selectionBar.pushToCrm')}
        </Button>
      ) : null}
      <button
        type="button"
        onClick={onClear}
        title={t('selectionBar.clear')}
        aria-label={t('selectionBar.clear')}
        className="flex items-center justify-center size-11 min-h-11 rounded-md text-[var(--text-ghost)] hover:bg-white/[0.06] transition-colors"
      >
        <X className="size-3.5" />
      </button>
    </motion.div>
  )
}
