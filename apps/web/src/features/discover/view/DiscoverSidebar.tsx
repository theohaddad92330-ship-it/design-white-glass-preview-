import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SAVED_VIEW_ALERT_FREQUENCIES, type SavedViewAlertFrequency } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectField,
} from '@bellum/ui'
import { useSavedSearchesStatus } from '@/features/discover/hooks/useSavedSearches'
import type { SavedSearchDraft } from '@/features/discover/lib/discover-saved-searches'

/**
 * #4530.5 (Louis 24/10) — le panneau « Ta cible » (`StartingPoint`) et son bloc « Ce que Bellum a compris » (LC.6)
 * ont quitté Découvrir : « Ma cible » est un bouton (`MyTargetToggle`), le détail du profil vit dans Paramètres › Profil.
 * Ne reste ici que la fenêtre « Enregistrer la recherche ».
 */

/**
 * Périmètres enregistrés, rejouables en un clic.
 *
 * Refonte Théo (23/10) — le formulaire quitte la colonne « Ta cible » : il s'ouvre en fenêtre depuis
 * « Enregistrer », dans l'en-tête de la liste (« Ton marché »). Les mêmes champs, au même rôle (nom,
 * objectif, cadence, partage) ; le nom arrive PROPOSÉ (les critères de la recherche), modifiable.
 * La liste des recherches enregistrées vit dans « Mes recherches ».
 */
export function SaveSearchDialog({
  open,
  onOpenChange,
  onSave,
  proposedLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (draft: SavedSearchDraft) => void
  /** Le nom proposé à l'ouverture : la phrase des critères posés, jamais inventée. */
  proposedLabel: string
}) {
  const { t } = useTranslation('discover')
  const { status } = useSavedSearchesStatus()
  const [label, setLabel] = useState(proposedLabel)
  const [objective, setObjective] = useState('')
  const [frequency, setFrequency] = useState<SavedViewAlertFrequency>('manual')
  const [shared, setShared] = useState(false)

  useEffect(() => {
    if (open) setLabel(proposedLabel)
  }, [open, proposedLabel])

  const confirm = () => {
    onSave({
      label,
      objective: objective.trim() || null,
      alertFrequency: frequency,
      // #2151.12 — une cadence sans canal ne préviendrait personne ; « dans
      // l'application » est le seul canal qui ne demande rien à l'utilisateur.
      alertChannel: frequency === 'manual' ? null : 'in_app',
      shared,
    })
    setObjective('')
    setFrequency('manual')
    setShared(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('sidebar.saveCancel')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('sidebar.saveCta')}</DialogTitle>
          <DialogDescription>{t('sidebar.savedEmpty')}</DialogDescription>
        </DialogHeader>
        {status === 'locked' ? (
          <p className="text-sm text-[var(--bellum-text-secondary)]">{t('sidebar.savedLocked')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--bellum-text-secondary)]">
              {t('sidebar.savePlaceholder')}
              <input
                type="text"
                value={label}
                autoFocus
                aria-label={t('sidebar.savePlaceholder')}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && label.trim() !== '') confirm()
                }}
                className="h-11 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-3 text-sm text-[var(--bellum-text-primary)] focus:outline-none"
              />
            </label>

            {/* #2151.3 — l'objectif, en toutes lettres et facultatif. Un champ
                obligatoire ici ferait écrire « à suivre » à tout le monde. */}
            <label className="flex flex-col gap-1 text-xs font-medium text-[var(--bellum-text-secondary)]">
              {t('sidebar.saveObjectiveLabel')}
              <input
                type="text"
                value={objective}
                maxLength={240}
                aria-label={t('sidebar.saveObjectiveLabel')}
                placeholder={t('sidebar.saveObjectivePlaceholder')}
                onChange={e => setObjective(e.target.value)}
                className="h-11 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-3 text-sm text-[var(--bellum-text-primary)] focus:outline-none"
              />
            </label>

            {/* #2151.6 — la cadence. `manual` en tête : une alerte ne s'allume
                pas parce qu'on a enregistré un filtre. ⚠️ `SelectField`, jamais
                le menu déroulant natif (GA-251) : il ne suit pas le thème. */}
            <div className="flex flex-col gap-1 text-xs font-medium text-[var(--bellum-text-secondary)]">
              <span>{t('sidebar.saveFrequencyLabel')}</span>
              <SelectField
                value={frequency}
                ariaLabel={t('sidebar.saveFrequencyLabel')}
                onChange={next => setFrequency(next as SavedViewAlertFrequency)}
                options={SAVED_VIEW_ALERT_FREQUENCIES.map(value => ({
                  value,
                  label: t(`sidebar.frequency.${value}`),
                }))}
              />
            </div>

            {/* #2151.11 — personnelle par défaut : partager la sienne sans que
                personne l'ait demandé encombre l'écran de tout le monde. */}
            <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--bellum-text-secondary)]">
              <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} />
              {t('sidebar.saveSharedLabel')}
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('sidebar.saveCancel')}
          </Button>
          <Button onClick={confirm} disabled={status === 'locked' || label.trim() === ''}>
            {t('sidebar.saveConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
