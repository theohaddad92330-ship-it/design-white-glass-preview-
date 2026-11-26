import { Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useProjectContacts } from '@/features/projects/hooks/useProjectContacts'

/**
 * #3624 (F25) — « le contact vers les personnes concernées par les projets ».
 *
 * L'arbitrage Z10 × B avait perdu le geste « Contacter <personne> » par
 * demande. Il revient ici, sans rien inventer : les interlocuteurs sont ceux
 * RELIÉS à la demande (`GET /projects/:id/contacts`, rôle sur ce projet), leur
 * nom est en clair, et le geste ouvre leur fiche (le copilote prépare, le
 * commercial envoie). Aucun contact relié = AUCUNE ligne, pas de « aucun
 * contact » : « Contacts client » reste la porte vers l'annuaire.
 */
export function NeedContactActions({ projectId, label }: { projectId: string; label: string }) {
  const { t } = useTranslation('projects')
  const { data } = useProjectContacts(projectId)
  const contacts = data ?? []
  if (contacts.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`need-contacts-${projectId}`}>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('accountTab.needContacts.label', { project: label })}
      </Text>
      {contacts.map(contact => (
        <Button key={contact.contact_id} asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
          <Link to="/contacts/$id" params={{ id: contact.contact_id }}>
            {t('accountTab.needContacts.contact', { name: contact.full_name })}
          </Link>
        </Button>
      ))}
    </div>
  )
}
