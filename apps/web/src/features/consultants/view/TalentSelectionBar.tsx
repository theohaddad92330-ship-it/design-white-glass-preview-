import { TALENT_BULK_MAX } from '@bellum/contracts'
import { Button, Card, Text } from '@bellum/ui'
import { Archive, Download, GitCompare, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * #2662.1 à .3 — LA BARRE DE SÉLECTION du vivier (« sélectionner et tout
 * supprimer pour clean mon vivier, en faire un export », Louis 20/09/2026).
 *
 * ⚠️ ARCHIVER EST LE GESTE PAR DÉFAUT, SUPPRIMER N'EST QUE L'EXCEPTION ÉCRITE.
 * La décision produit (QCM Louis, 21/09/2026) est sélection + ARCHIVAGE +
 * export : la doctrine du dépôt (« on archive, on ne supprime pas ») tient.
 * #3781 (06/10/2026) y ajoute le SEUL geste que cette doctrine autorise — la
 * suppression définitive d'une PERSONNE par l'effacement RGPD (c67) — sous un
 * libellé qui le dit (« Supprimer définitivement ») et derrière une
 * confirmation qui annonce la conséquence (`TalentEraseDialog`). Le bouton
 * n'existe que si l'appelant fournit `onErase` : il est absent en
 * démonstration, où la salle partagée ne s'efface pas.
 *
 * Volontairement PLUS PETITE que `ContactSelectionPanel.tsx` : ce lot ne
 * demande que trois gestes (compter, archiver, exporter), pas le panneau
 * complet des actions de contact (canaux, séquences, listes cibles…).
 *
 * #2081.14 — l'export est une SORTIE de données (décision Louis 19/09/2026) :
 * `exportAllowed` vient de `useDataExit()`, lu par l'APPELANT (`ConsultantsPage.tsx`,
 * qui seul détient le `DataExitGrant` que `downloadCSV` exige) — même patron
 * que `ContactsSelectionBar.tsx`. Le bouton est MASQUÉ, pas seulement désactivé,
 * quand la règle d'espace réserve l'export aux administrateurs.
 */
export function TalentSelectionBar({
  count,
  onClear,
  onArchive,
  archivePending,
  onExport,
  exportAllowed,
  onErase,
  onCompare,
  total,
  onSelectAll,
}: {
  count: number
  onClear: () => void
  onArchive: () => void
  archivePending: boolean
  onExport: () => void
  exportAllowed: boolean
  onErase?: () => void
  /** Théo C talents-vivier.A7 — « Comparer sur un besoin » : le panneau de rapprochement, sur la sélection. */
  onCompare?: () => void
  /** #3781 — le total du résultat (tous filtres appliqués) et le geste « tout sélectionner » :
   *  la case d'en-tête ne couvre que la PAGE, et sans cela rien ne dit ce qu'elle laisse dehors. */
  total?: number
  onSelectAll?: () => void
}) {
  const { t } = useTranslation('consultants')
  if (count === 0) return null
  // #3781 — un lot est borné (`TALENT_BULK_MAX`) : au-delà, le bouton le DIT au lieu de promettre le total.
  const reachable = total === undefined ? 0 : Math.min(total, TALENT_BULK_MAX)
  const leftOut = onSelectAll !== undefined && total !== undefined && reachable > count

  return (
    <Card className="mb-3 flex flex-wrap items-center justify-between gap-2 p-3">
      <Text size="sm" weight="medium">
        {t('selection.count', { count })}
      </Text>
      <div className="flex flex-wrap items-center gap-2">
        {leftOut ? (
          <Button variant="ghost" size="sm" onClick={onSelectAll}>
            {reachable < (total ?? 0)
              ? t('selection.selectCapped', { count: reachable, total })
              : t('selection.selectAll', { count: reachable })}
          </Button>
        ) : null}
        {onCompare ? (
          <Button variant="outline" size="sm" icon={GitCompare} onClick={onCompare}>
            {t('selection.compare')}
          </Button>
        ) : null}
        {exportAllowed ? (
          <Button variant="outline" size="sm" icon={Download} onClick={onExport}>
            {t('selection.export')}
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          icon={Archive}
          onClick={onArchive}
          isLoading={archivePending}
          loadingText={t('selection.archiving')}
        >
          {t('selection.archive')}
        </Button>
        {onErase ? (
          <Button variant="outline" size="sm" icon={Trash2} onClick={onErase}>
            {t('selection.erase')}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" icon={X} onClick={onClear}>
          {t('selection.clear')}
        </Button>
      </div>
    </Card>
  )
}
