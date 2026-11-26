import { chipClassName, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { ContactViewFilterValue } from './ContactsViewChips'
import type { NetworkChannel } from './ContactsNetworkOverview'

/**
 * Théo B c1-repertoire `.v13-chip-row` — UNE rangée de puces, toujours visible, au-dessus du tableau :
 * « Tous · À contacter · Avec e-mail · Avec téléphone · À rattacher », un filet, puis les quatre vues
 * gardées (C1.A3) « À enrichir · À vérifier · Déjà connus · Masqués ».
 *
 * Aucune puce n'a son propre état : chacune écrit un réglage qui existe déjà (GA-26) — la vue
 * (`view`), le canal (`channel`, le même que les tuiles de la synthèse) ou la portée « à rattacher »
 * (`unassigned`). « Tous » les retire tous les trois.
 *
 * #4503.4 (contrat Louis 24/10) — « Ne pas solliciter » rejoint la rangée, après « À rattacher » : elle garde
 * les contacts que la liste « ne pas contacter » de l'espace vise (le contact, ou le domaine de son adresse —
 * le MÊME calcul que le badge de la ligne, `listedDoNotContact`). Comme les quatre vues gardées, elle lit les
 * lignes chargées ; distincte de « Masqués » (écartés par moi, hors de portée en SQL).
 * La bascule « Tous · Recommandés » ferme la rangée, à côté (`ContactContent`), sous sa forme sobre.
 */
type Props = {
  view: ContactViewFilterValue
  channel: NetworkChannel | null
  unattached: boolean
  doNotContact: boolean
  /**
   * #4526.4 — la puce « Mon CRM ». ⚠️ #4597.2 : la source `crm` SEULE (renversement de « crm + import »). Absente si
   * le compteur est nul/inconnu, sauf active.
   */
  monCrm?: { count: number | undefined; active: boolean; crmName?: string; onToggle: () => void }
  /**
   * #4597.1 — la puce « Importés » : les fiches venues d'un fichier (`source = 'import'`), jamais sous le nom d'un CRM.
   * Absente si le compteur est nul/inconnu, sauf active (il faut pouvoir la relâcher).
   */
  imported?: { count: number | undefined; active: boolean; onToggle: () => void }
  /** #4597.3 — la liste est ouverte sur UN import précis (lien « voir les N contacts ») : la puce se relâche. */
  importJob?: { onClear: () => void }
  onViewChange: (next: ContactViewFilterValue) => void
  onChannelChange: (next: NetworkChannel | null) => void
  onUnattachedChange: (next: boolean) => void
  onDoNotContactChange: (next: boolean) => void
  className?: string
}

type Chip = { key: string; label: string; active: boolean; onClick: () => void }

export function ContactsQuickChips({
  view,
  channel,
  unattached,
  doNotContact,
  monCrm,
  imported,
  importJob,
  onViewChange,
  onChannelChange,
  onUnattachedChange,
  onDoNotContactChange,
  className,
}: Props) {
  const { t } = useTranslation('contacts')
  const viewChip = (key: Exclude<ContactViewFilterValue, 'all'>): Chip => ({
    key,
    label: t(`views.${key}`),
    active: view === key,
    onClick: () => onViewChange(view === key ? 'all' : key),
  })
  const primary: Chip[] = [
    {
      key: 'all',
      label: t('quickChips.all'),
      active:
        view === 'all' &&
        channel === null &&
        !unattached &&
        !doNotContact &&
        !monCrm?.active &&
        !imported?.active &&
        !importJob,
      onClick: () => {
        if (view !== 'all') onViewChange('all')
        if (channel !== null) onChannelChange(null)
        if (unattached) onUnattachedChange(false)
        if (doNotContact) onDoNotContactChange(false)
        if (monCrm?.active) monCrm.onToggle()
        if (imported?.active) imported.onToggle()
        importJob?.onClear()
      },
    },
    viewChip('to_contact'),
    {
      key: 'with_email',
      label: t('overview.withEmail'),
      active: channel === 'with_email',
      onClick: () => onChannelChange(channel === 'with_email' ? null : 'with_email'),
    },
    {
      key: 'with_phone',
      label: t('overview.withPhone'),
      active: channel === 'with_phone',
      onClick: () => onChannelChange(channel === 'with_phone' ? null : 'with_phone'),
    },
    {
      key: 'unattached',
      label: t('overview.unattached'),
      active: unattached,
      onClick: () => onUnattachedChange(!unattached),
    },
    ...(monCrm && (monCrm.active || monCrm.count)
      ? [
          {
            key: 'mon_crm',
            label: `${monCrm.crmName ?? t('quickChips.monCrm')}${monCrm.count ? ` ${monCrm.count}` : ''}`,
            active: monCrm.active,
            onClick: monCrm.onToggle,
          },
        ]
      : []),
    ...(imported && (imported.active || imported.count)
      ? [
          {
            key: 'imported',
            label: `${t('quickChips.imported')}${imported.count ? ` ${imported.count}` : ''}`,
            active: imported.active,
            onClick: imported.onToggle,
          },
        ]
      : []),
    ...(importJob
      ? [{ key: 'import_job', label: t('quickChips.importJob'), active: true, onClick: importJob.onClear }]
      : []),
    {
      key: 'do_not_contact',
      label: t('quickChips.doNotContact'),
      active: doNotContact,
      onClick: () => onDoNotContactChange(!doNotContact),
    },
  ]
  const kept: Chip[] = [viewChip('to_enrich'), viewChip('to_verify'), viewChip('known'), viewChip('hidden')]
  const renderChip = (chip: Chip) => (
    <button
      key={chip.key}
      type="button"
      aria-pressed={chip.active}
      onClick={chip.onClick}
      className={chipClassName({ active: chip.active, size: 'sm' })}
    >
      {chip.label}
    </button>
  )
  return (
    <div
      role="group"
      aria-label={t('quickChips.aria')}
      data-testid="contacts-quick-chips"
      className={cn(
        'flex flex-wrap items-center gap-2 max-md:flex-nowrap max-md:overflow-x-auto max-md:overscroll-x-contain max-md:[&>*]:shrink-0',
        className,
      )}
    >
      {primary.map(renderChip)}
      <span aria-hidden className="mx-1 w-px self-stretch bg-[var(--bellum-border)]" />
      {kept.map(renderChip)}
    </div>
  )
}
