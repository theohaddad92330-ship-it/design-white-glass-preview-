import { Tabs, TabsContent, TabsList, TabsTrigger } from '@bellum/ui'
import type { ReactNode } from 'react'
import { SettingsEmbeddedContext } from './SettingsViewHeader'

type SettingsTab<Key extends string> = { key: Key; label: string; content: ReactNode }

/**
 * Les onglets d'une page de Réglages — la forme `underline` de Théo (DS §2.8). Un onglet = une SECTION de la page.
 * Contrôlé : l'onglet actif vit dans l'adresse (`?onglet=`), pour qu'un lien, un rechargement et le bouton retour
 * retrouvent l'endroit. Cible ≥ 44 px à la souris comme au doigt (#4605.6, GA-35) ; la barre défile dans son conteneur, jamais la page.
 */
export function SettingsTabs<Key extends string>({
  tabs,
  value,
  onValueChange,
  label,
}: {
  tabs: readonly SettingsTab<Key>[]
  value: Key
  onValueChange: (key: Key) => void
  label: string
}) {
  return (
    <SettingsEmbeddedContext.Provider value>
      <Tabs
        value={value}
        onValueChange={next => {
          const found = tabs.find(tab => tab.key === next)
          if (found) onValueChange(found.key)
        }}
        className="gap-5"
      >
        <TabsList variant="underline" aria-label={label} className="max-w-full overflow-x-auto">
          {tabs.map(tab => (
            <TabsTrigger key={tab.key} value={tab.key} className="min-h-11">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map(tab => (
          <TabsContent key={tab.key} value={tab.key}>
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </SettingsEmbeddedContext.Provider>
  )
}
