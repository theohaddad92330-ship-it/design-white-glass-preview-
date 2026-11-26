import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { CreateContactDialog } from '@/features/crm-core/view/CreateContactDialog'
import { useReadingPosition } from '@/features/contacts/view/contact-detail/useReadingPosition'
import { DUPLICATES_ANCHOR_ID } from '@/features/governance/model/duplicates-anchor'
import { ContactsIntro } from './contacts-list/ContactsIntro'
import { ContactsTabs } from './contacts-list/ContactsTabs'

import { ContactsPageContent } from './ContactsPageContent'

export function ContactsPage({ from = '/contacts/' }: { from?: '/contacts/' } = {}) {
  const { t } = useTranslation('contacts')
  // #3687.16 — « retour : origine, filtres, position ». Les filtres voyagent
  // déjà dans l'URL (bookmarkables) ; la POSITION de lecture, elle, réutilise
  // le mécanisme déjà posé pour la fiche contact (#3688.10, GA-26 : un
  // réglage vit à un seul endroit) — même clé fixe, une seule liste à la fois.
  useReadingPosition('contacts-list')
  // #1098 — « ne serait-il pas judicieux d'ajouter des contacts que l'on
  // connaît ? Ou c'est dans une autre feature ? ». C'était dans une autre
  // feature : l'onglet Contacts d'un dossier. Le même dialogue est monté ici,
  // avec son sélecteur de compte — pas un second formulaire, qui aurait
  // divergé du premier au premier champ ajouté.
  const [createOpen, setCreateOpen] = useState(false)
  // #3376 — retour bêta 30/09 : la section « Filtres » (`ContactContent`)
  // n'a plus son propre bouton ; son déclencheur vit désormais dans
  // `ContactsIntro`, à gauche du CTA « Traiter ». Les deux composants sont
  // des FRÈRES (jamais l'un dans l'autre), donc l'état d'ouverture vit ICI,
  // un cran au-dessus des deux — jamais dans `localStorage` ni l'URL (même
  // invariant que `CollapsedSection` : replié à CHAQUE montage).
  const [filtersOpen, setFiltersOpen] = useState(false)
  // #4503.7 — les doublons ont quitté la liste pour l'onglet « Imports & sources » : le lien du contrôle
  // « Doublons non tranchés » de /pilotage (`/contacts#hygiene-doublons`) suit le panneau là où il vit.
  const navigate = useNavigate()
  useEffect(() => {
    if (window.location.hash === `#${DUPLICATES_ANCHOR_ID}`) {
      void navigate({ to: '/contacts/imports', hash: DUPLICATES_ANCHOR_ID, replace: true })
    }
  }, [navigate])
  return (
    <CustomerPage anchorId="contacts" titleInScreen pageTitle={t('page.title')} contentClassName="px-0 py-4">
      {/* Théo B c1-repertoire — l'écran se lit de haut en bas dans `ContactContent` : en-tête (avec « Demander
          à Laura », qui y porte le contexte filtré) et ses onglets, liste ouverte, synthèse, barre d'outils,
          puces, tableau paginé, barre de sélection. #2476 — « Ajouter un contact » partage la ligne du h1.
          #4503.7 — le bandeau « N doublons à relire » a quitté la liste (onglet Imports & sources). */}
      <ContactsPageContent
        from={from}
        filtersOpen={filtersOpen}
        onFiltersOpenChange={setFiltersOpen}
        renderIntro={askLaura => (
          <div data-testid="contacts-intro-area">
            <ContactsIntro onAddContact={() => setCreateOpen(true)} askLaura={askLaura} />
            <ContactsTabs current="directory" />
          </div>
        )}
      />
      <CreateContactDialog open={createOpen} onOpenChange={setCreateOpen} />
    </CustomerPage>
  )
}
