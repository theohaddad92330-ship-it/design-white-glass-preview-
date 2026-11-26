import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { AskLaura } from '@/components/primitives/AskLaura'
import { ImportsSourcesContent } from '@/features/contacts-import/view/ImportsSourcesContent'
import { CreateContactDialog } from '@/features/crm-core/view/CreateContactDialog'
import { DuplicatesSection } from '@/features/governance/view/DuplicatesSection'
import { PlaceholderEmailCatchupSection } from '@/features/governance/view/PlaceholderEmailCatchupSection'
import { ContactsIntro } from './contacts-list/ContactsIntro'
import { ContactsTabs } from './contacts-list/ContactsTabs'

/**
 * `/contacts/imports` — Théo B c3-imports-sources sous l'en-tête COMMUN de Contacts (#4503.1) : le même titre, les
 * mêmes gestes (« Ajouter un contact », « Importer des contacts ») et les trois onglets, puis le contenu des imports.
 *
 * #4503.7 (contrat Louis 24/10) — « Relire les doublons » vit ICI, avec son nombre (`DuplicatesSection` : « N
 * doublons à relire », fusion PROPOSÉE, jamais automatique sous 0,99). Il a quitté la liste du répertoire ; un lien
 * `/contacts#hygiene-doublons` (contrôle de /pilotage) est redirigé ici par `ContactsPage`.
 *
 * #4599.4 — « Adresses gabarit » vit ici aussi, sous les doublons : le même écran de qualité de la base, et le geste
 * n'existe que pour le propriétaire/admin (`PlaceholderEmailCatchupSection`).
 *
 * #4503.b — la sous-navigation à deux liens (`ContactsImportsNav`) est RETIRÉE du contenu des imports : les trois
 * onglets sont la seule navigation de Contacts (une navigation, un endroit — GA-26).
 */
export function ContactsImportsSourcesPage() {
  const { t } = useTranslation('contacts')
  const [createOpen, setCreateOpen] = useState(false)
  return (
    <CustomerPage anchorId="contacts-imports" titleInScreen pageTitle={t('tabs.imports')} contentClassName="px-0 py-4">
      <div className={`${PAGE_GUTTER_X} space-y-4`}>
        <div data-testid="contacts-intro-area">
          <ContactsIntro
            onAddContact={() => setCreateOpen(true)}
            askLaura={<AskLaura variant="prominent" question={t('list.copilotPrompt')} label={t('list.askCopilot')} />}
          />
          <ContactsTabs current="imports" />
        </div>
        <DuplicatesSection />
        <PlaceholderEmailCatchupSection />
        <ImportsSourcesContent />
      </div>
      <CreateContactDialog open={createOpen} onOpenChange={setCreateOpen} />
    </CustomerPage>
  )
}
