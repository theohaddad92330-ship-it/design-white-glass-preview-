import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { AiAssistantView } from '@/features/settings/view/AiAssistantView'

export const Route = createFileRoute('/settings/mcp')({
  component: AiAssistantPage,
})

function AiAssistantPage() {
  return (
    <SettingsPage>
      <AiAssistantView />
    </SettingsPage>
  )
}
