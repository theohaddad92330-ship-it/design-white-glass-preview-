import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@bellum/ui'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TalentSearchQuery } from '@bellum/contracts'
import { useSavedViews } from '@/features/governance/api'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import { savedRecordToTalentFilters } from '../lib/talent-saved-view-filters'
import { SavedTalentViews } from './SavedTalentViews'

/**
 * Théo C talents-vivier.R5 — « MES VUES » : le second sélecteur de la barre du vivier, celui des vues ENREGISTRÉES
 * (les miennes et celles que l'équipe partage), et le geste « Enregistrer la vue courante… ».
 *
 * Louis 23/10 — l'écran Théo reste : ce sélecteur, venu de la barre d'outils de PR11, est monté dans la barre de Théo
 * (`TalentFilters`), juste après « Tous les profils ». Le reste de la barre PR11 (sélecteur, décompte, Liste/Cartes,
 * règle de disponibilité) existait déjà dans l'écran Théo : il n'est pas monté une seconde fois (GA-26).
 *
 * Les lectures ne partent qu'à l'OUVERTURE du menu (le contenu Radix n'est monté qu'ouvert) : un écran qui n'ouvre
 * jamais « Mes vues » ne paie aucune requête de plus.
 */
export function VivierMyViews({
  query,
  onApply,
}: {
  /** Les filtres posés : ce que « Enregistrer la vue courante… » enregistre. */
  query: Partial<TalentSearchQuery>
  onApply: (filters: Partial<TalentSearchQuery>) => void
}) {
  const { t } = useTranslation('consultants')
  const [saving, setSaving] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-1.5">
            {t('vivier.myViews.label')}
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <MyViewsItems onApply={onApply} onSave={() => setSaving(true)} />
        </DropdownMenuContent>
      </DropdownMenu>

      {saving ? (
        <Dialog open onOpenChange={open => !open && setSaving(false)}>
          <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('vivier.view.saveTitle')}</DialogTitle>
              <DialogDescription>{t('vivier.view.saveDescription')}</DialogDescription>
            </DialogHeader>
            <SavedTalentViews
              draft={query}
              onApply={filters => {
                onApply(filters)
                setSaving(false)
              }}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}

function MyViewsItems({
  onApply,
  onSave,
}: {
  onApply: (filters: Partial<TalentSearchQuery>) => void
  onSave: () => void
}) {
  const { t } = useTranslation('consultants')
  const { known, allowed } = usePlanFeature('crm_native')
  const locked = known && !allowed
  const views = useSavedViews('talents', { enabled: !locked })
  // Sans l'offre, aucune vue n'est lue : rien à lister, et le geste d'enregistrer dit pourquoi il est fermé.
  const items = locked ? [] : (views.data ?? [])
  return (
    <>
      {items.map(view => (
        <DropdownMenuItem key={view.id} onSelect={() => onApply(savedRecordToTalentFilters(view.filters))}>
          {view.name}
        </DropdownMenuItem>
      ))}
      {items.length > 0 ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem onSelect={onSave} disabled={locked}>
        {locked ? t('savedViews.locked') : t('vivier.myViews.save')}
      </DropdownMenuItem>
    </>
  )
}
