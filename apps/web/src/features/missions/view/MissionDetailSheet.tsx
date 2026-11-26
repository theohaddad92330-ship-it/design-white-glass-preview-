import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { CreateMissionActionButton } from './CreateMissionActionButton'
import { MissionDetailTabs } from './MissionDetailTabs'
import type { MissionView } from '../api'
import { MissionLifecycleActions } from './MissionLifecycleActions'

/**
 * #4194 (lot L3) — LE CONTENU du panneau d'une mission (`RecordPanel`).
 *
 * Il portait le tiroir ; il n'en porte plus le chrome. Le titre, la porte
 * « Ouvrir la fiche complète » et l'UNIQUE bouton Laura vivent désormais dans
 * `RecordPanel` : deux boutons Laura par mission (« Planifier un point » et
 * « Demander à Laura ») sont devenus un seul, au même endroit pour les cinq
 * types. Les cinq onglets vivent toujours dans `MissionDetailTabs`, rendus à
 * l'identique par le DOSSIER (`/missions/$id`) — loi 4 du tome 7.
 */
export function MissionPanelContent({ mission }: { mission: MissionView }) {
  const { t } = useTranslation('missions')
  const accountLabel = mission.accountName ?? t('unknownAccount')

  return (
    <Box className="flex flex-col">
      {/* ⚠️ `accountName` n'était JAMAIS envoyé par le service : cette ligne
          affichait « Compte inconnu » sur toutes les missions, alors que
          `account_id` est obligatoire en base. */}
      <Text element="p" size="sm" color="text-muted-foreground" className="px-5 pt-3">
        {accountLabel}
      </Text>
      <MissionDetailTabs mission={mission} />
      {/* #2192.35 — « Créer une action » : seul geste du pied qui reste ici.
          `pointer-coarse:min-h-11` est sur le bouton — 44 px sous un doigt (GA-30). */}
      <Box display="flex" className="flex-wrap items-center gap-2 border-t border-border px-5 py-3">
        <CreateMissionActionButton mission={mission} />
        {/* #4196 (L5) — Prolonger / Terminer : le cycle de vie, dans la zone propriétés. */}
        <MissionLifecycleActions mission={mission} />
      </Box>
    </Box>
  )
}
