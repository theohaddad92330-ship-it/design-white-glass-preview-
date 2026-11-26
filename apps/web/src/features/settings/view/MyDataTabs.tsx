import { hasPermission } from '@bellum/contracts'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ImportsPanel } from '@/features/import/view/ImportsPanel'
import { useTeam } from '@/features/team/hooks/useTeam'
import { SettingsTabs } from '../components/SettingsTabs'
import { MyDataView } from './MyDataView'
import { VivierExportCard } from './VivierExportCard'

/**
 * #4605.2/.4 — LA colonne de « Mes données », posée UNE fois pour les deux onglets : même largeur de contenu quel que
 * soit l'onglet (Imports 1232 px contre Exports 1024 px mesurés), et la carte du vivier tient dans la grille.
 */
function MyDataColumn({ children }: { children: ReactNode }) {
  return (
    <div data-testid="my-data-content" className="w-full max-w-5xl space-y-6">
      {children}
    </div>
  )
}

export type MyDataTab = 'exports' | 'imports'

/**
 * « MES DONNÉES » — deux onglets, Exports · Imports (#4533.1, Louis 24/10/2026). L'onglet vit dans l'adresse
 * (`?tab=`), l'appelant (la route) le tient.
 *
 * DROITS (#4533.4) : Imports n'est rendu qu'aux gestionnaires (`team:manage`) — la règle du `managerOnly` qu'avait
 * l'entrée de menu. Un membre n'a pas l'onglet, et `?tab=imports` atterrit sur Exports ; tant que le rôle n'est pas
 * connu, c'est Exports (jamais Imports sur un doute). Les gardes serveur des imports restent inchangées.
 */
export function MyDataTabs({ tab, onTabChange }: { tab: MyDataTab; onTabChange: (tab: MyDataTab) => void }) {
  const { t } = useTranslation('myData', { keyPrefix: 'tabs' })
  const { team } = useTeam()
  const canManage = team ? hasPermission(team.workspace.role, 'team:manage') : false
  const active: MyDataTab = canManage ? tab : 'exports'
  return (
    <SettingsTabs
      label={t('label')}
      value={active}
      onValueChange={onTabChange}
      tabs={[
        {
          key: 'exports',
          label: t('exports'),
          content: (
            <MyDataColumn>
              <MyDataView />
              <VivierExportCard />
            </MyDataColumn>
          ),
        },
        ...(canManage
          ? [
              {
                key: 'imports' as const,
                label: t('imports'),
                content: (
                  <MyDataColumn>
                    <ImportsPanel />
                  </MyDataColumn>
                ),
              },
            ]
          : []),
      ]}
    />
  )
}
