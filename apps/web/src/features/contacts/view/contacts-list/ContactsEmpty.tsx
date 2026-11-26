import { Button, Logo } from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ContactsStateBox } from './ContactsStateBox'

/** Empty state for /contacts when the user hasn't run any analysis yet. */
export function ContactsEmpty() {
  const { t } = useTranslation('contacts')
  const navigate = useNavigate()
  // Théo B c1-repertoire — « Aucun contact pour l'instant. » : lancer une analyse, ou importer ceux qu'on connaît.
  return (
    <ContactsStateBox
      title={t('list.emptyTitle')}
      description={t('list.emptyDescription')}
      actions={
        <>
          <Button
            variant="default"
            size="sm"
            icon={<Logo className="rounded-lg text-white" />}
            onClick={() => navigate({ to: '/search' })}
          >
            {t('list.emptyCta')}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings/mes-donnees" search={{ tab: 'imports' }}>
              {t('page.importContacts')}
            </Link>
          </Button>
        </>
      }
    />
  )
}
