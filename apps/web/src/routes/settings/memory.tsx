import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { MemoryLedgerView } from '@/features/memory/view/MemoryLedgerView'

/** Réglages › Mémoire de Laura — la règle de transparence du tome 6 §12.1 :
 *  l'écran DÉDIÉ où tout ce que Laura garde se lit en clair, et où n'importe
 *  quelle ligne s'oublie. */
export const Route = createFileRoute('/settings/memory')({
  component: MemorySettingsPage,
})

function MemorySettingsPage() {
  return (
    <SettingsPage>
      <MemoryLedgerView />
    </SettingsPage>
  )
}
