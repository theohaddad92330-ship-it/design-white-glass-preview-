import { Box, Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useNeedsExport } from '../hooks/useNeedsExport'
import type { ActionableNeed } from '../model/need-actions'
import { NeedActionsMenu } from './NeedActionsMenu'

/**
 * La barre qui apparaît dès qu'un besoin est coché.
 *
 * Elle porte EXACTEMENT le même menu que le kebab d'une ligne
 * (`NeedActionsMenu`) : deux listes d'actions recopiées divergent, et
 * l'utilisateur découvre alors qu'un geste existe « en haut » mais pas « sur la
 * ligne ».
 *
 * ⚠️ Elle reçoit les LIGNES cochées, pas leurs identifiants : le menu compte ce
 * que chaque geste peut réellement toucher avant de partir, et « 7 sur 12 » se
 * lit — douze appels dont cinq reviennent en 400 se lisent comme une panne.
 *
 * #4016 L11 — DÉCISION LOUIS 11/10/2026, renversement daté de c43 : la
 * sélection s'EXPORTE (CSV ou JSON) pour être reprise dans un outil tiers.
 * L'export n'est PAS un geste du menu — il n'écrit rien, besoin par besoin —
 * c'est une SORTIE, tenue par la règle d'espace : les boutons n'apparaissent
 * que si `useDataExit()` l'autorise, et l'API la relit (`@DataExit()`).
 */
export function NeedsSelectionBar({ needs, onClear }: { needs: readonly ActionableNeed[]; onClear: () => void }) {
  const { t } = useTranslation('projects')
  const { allowed, exporting, exportAs } = useNeedsExport(needs.map(need => need.id))
  if (needs.length === 0) return null

  return (
    <Box
      display="flex"
      className="flex-wrap items-center gap-2 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2"
    >
      <Text size="sm" weight="medium">
        {t('openNeeds.selection.count', { count: needs.length })}
      </Text>
      <NeedActionsMenu
        needs={needs}
        onDone={onClear}
        trigger={
          <Button size="sm" variant="default">
            {t('openNeeds.selection.actions')}
          </Button>
        }
      />
      {allowed ? (
        <>
          <Button size="sm" variant="outline" disabled={exporting} onClick={() => void exportAs('csv')}>
            {t('openNeeds.selection.exportCsv')}
          </Button>
          <Button size="sm" variant="outline" disabled={exporting} onClick={() => void exportAs('json')}>
            {t('openNeeds.selection.exportJson')}
          </Button>
        </>
      ) : null}
      <Button size="sm" variant="ghost" onClick={onClear}>
        {t('openNeeds.selection.clear')}
      </Button>
    </Box>
  )
}
