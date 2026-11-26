import { Box, Button, SelectField, Text } from '@bellum/ui'
import { PenLine, UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import type { Contact, ProjectContactRole } from '@bellum/contracts'
import { PROJECT_CONTACT_ROLES } from '@bellum/contracts'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { useContactsByAccount } from '@/features/contacts/hooks/useContactsByAccount'
import { useContactEngagement } from '../../accounts/view/account-detail/components/contact-engagement/ContactEngagementContext'
import { useLinkProjectContact, useProjectContacts } from '../hooks/useProjectContacts'

/**
 * #2171.5 (lot W20, registre 16/09) — LA FICHE OPPORTUNITÉ RELIE LES CONTACTS.
 *
 * `GET /projects/:id/contacts` existait déjà (`ProjectPipelineService
 * .listContacts`, table `project_contacts`, migration `1789344812907`) : le
 * rattachement, le rôle SUR CE PROJET (sponsor/décideur/prescripteur/
 * acheteur/utilisateur/bloqueur) et le détachement fonctionnaient tous, et
 * AUCUN écran ne les lisait — le défaut n°1 du dépôt, du mauvais côté.
 *
 * #2171.31 — L'AJOUT. `PUT /projects/:id/contacts/:contactId` existait déjà
 * lui aussi (même défaut, même côté) : le contact vient du COMPTE de
 * l'opportunité (`useContactsByAccount`, la même liste que l'onglet Contacts
 * du compte), jamais saisi à la main — inventer un second formulaire de
 * contact ici en créerait un troisième après celui du compte et celui de
 * l'import CSV. Retrait toujours hors périmètre : point distinct du registre.
 *
 * #2171.19 — « CONTACTS ET CIRCUIT DE DÉCISION ». Le rôle par contact
 * (sponsor/décideur/prescripteur/acheteur/utilisateur/bloqueur) EST le
 * circuit de décision — il était déjà affiché (#2171.5), seul le titre du
 * bloc ne le nommait pas. Renommer plutôt que construire un second bloc :
 * un rôle recalculé ailleurs divergerait à la première retouche.
 */
export function ProjectContactsPanel({ projectId, accountId }: { projectId: string; accountId: string }) {
  const { t } = useTranslation('projects')
  const { data: contacts, isLoading, isError } = useProjectContacts(projectId)
  // #2171.34 — PRÉPARER UN MESSAGE a besoin de la fiche CONTACT complète
  // (`email_message`, `email_sent_at`) : `ProjectContact` (la ligne de
  // `project_contacts`) ne les porte pas — même liste que `AddProjectContact`
  // juste en dessous, jamais une seconde requête qui pourrait diverger.
  const { data: accountContacts } = useContactsByAccount(accountId)
  const accountContactsById = useMemo(
    () => new Map((accountContacts ?? []).map(contact => [contact.id, contact])),
    [accountContacts],
  )
  const { openEngagement } = useContactEngagement()

  return (
    <Box className="space-y-3">
      <Box display="flex" className="items-center justify-between gap-2">
        <Box display="flex" className="items-center gap-2">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          <Text element="h4" size="sm" weight="medium">
            {t('detailContacts.title')}
          </Text>
        </Box>
        <AddProjectContact projectId={projectId} accountId={accountId} attached={contacts ?? []} />
      </Box>

      {isLoading ? (
        <Text size="sm" color="text-muted-foreground">
          {t('common:states.loading')}
        </Text>
      ) : isError ? (
        // Un échec de lecture ne se lit jamais « aucun contact » : le comité
        // existe peut-être, c'est la lecture qui a échoué.
        <Box className="rounded-md border border-dashed border-destructive/40 p-3">
          <Text size="sm" color="text-muted-foreground">
            {t('detailContacts.loadError')}
          </Text>
        </Box>
      ) : (contacts?.length ?? 0) === 0 ? (
        <Box className="rounded-md border border-dashed border-border p-3">
          <Text size="sm" color="text-muted-foreground">
            {t('detailContacts.empty')}
          </Text>
        </Box>
      ) : (
        <Box className="space-y-2">
          {contacts?.map(contact => {
            // #2171.34 — même garde que `ContactRowActions` côté compte
            // (`CompactContactRow.tsx`) : un brouillon existe déjà (déjà
            // envoyé, ou un corps déjà rédigé) — jamais un bouton qui
            // ouvrirait un message inventé.
            const fullContact = accountContactsById.get(contact.contact_id)
            const canPrepareMessage = Boolean(
              fullContact?.email && (fullContact.email_sent_at || fullContact.email_message?.body),
            )
            return (
              <Box key={contact.contact_id} display="flex" className="items-center gap-1">
                {/* #2171.42 — TOUS LES OBJETS LIÉS SONT CLIQUABLES. Un `Link`,
                  pas un `onClick` sur la `Box` : ce qui se clique se tabule
                  (GA-32), et la cible reste ≥ 44 px sur pointeur grossier
                  (`pointer-coarse:min-h-11`). */}
                <Link
                  to="/contacts/$id"
                  params={{ id: contact.contact_id }}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-card p-2 pointer-coarse:min-h-11 hover:bg-[var(--bellum-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
                >
                  <ContactAvatar name={contact.full_name} size="xs" />
                  <Box className="min-w-0 flex-1">
                    <Text size="sm" weight="medium" className="truncate">
                      {contact.full_name}
                    </Text>
                    {contact.title ? (
                      <Text size="xs" color="text-muted-foreground" className="truncate">
                        {contact.title}
                      </Text>
                    ) : null}
                  </Box>
                  <Text size="xs" color="text-muted-foreground" className="shrink-0">
                    {t(`detailContacts.roles.${contact.role}`, { defaultValue: contact.role })}
                  </Text>
                </Link>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="shrink-0 pointer-coarse:min-h-11"
                  disabled={!canPrepareMessage}
                  aria-label={t('detailContacts.prepareMessage')}
                  title={t('detailContacts.prepareMessage')}
                  onClick={() => fullContact && openEngagement([fullContact], 'email')}
                >
                  <PenLine className="size-4" aria-hidden />
                </Button>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}

/**
 * #2171.31 — LE FORMULAIRE D'AJOUT, REPLIÉ PAR DÉFAUT.
 *
 * Le contact vient de `useContactsByAccount` — LA MÊME liste que l'onglet
 * Contacts du compte — jamais une saisie libre : un contact SUR ce projet
 * est d'abord un contact du compte, et lui en inventer un ici créerait deux
 * fiches pour la même personne. Déjà rattachés retirés de la liste : les
 * proposer de nouveau ferait « ajouter » écrire par-dessus un rôle déjà
 * choisi, en silence.
 */
function AddProjectContact({
  projectId,
  accountId,
  attached,
}: {
  projectId: string
  accountId: string
  attached: readonly { contact_id: string }[]
}) {
  const { t } = useTranslation('projects')
  const [open, setOpen] = useState(false)
  const [contactId, setContactId] = useState('')
  const [role, setRole] = useState<ProjectContactRole>(PROJECT_CONTACT_ROLES[0])
  const { data: accountContacts } = useContactsByAccount(accountId)
  const link = useLinkProjectContact(projectId)

  const attachedIds = useMemo(() => new Set(attached.map(item => item.contact_id)), [attached])
  const available = useMemo(
    () => (accountContacts ?? []).filter(contact => !attachedIds.has(contact.id)),
    [accountContacts, attachedIds],
  )

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1.5 pointer-coarse:min-h-11"
        onClick={() => setOpen(true)}
      >
        <UserPlus className="size-4" aria-hidden />
        {t('detailContacts.add')}
      </Button>
    )
  }

  if (available.length === 0) {
    return (
      <Text size="xs" color="text-muted-foreground">
        {t('detailContacts.addNoneAvailable')}
      </Text>
    )
  }

  return (
    <Box display="flex" className="flex-wrap items-center gap-2">
      <SelectField
        ariaLabel={t('detailContacts.addContactPlaceholder')}
        value={contactId}
        onChange={setContactId}
        placeholder={t('detailContacts.addContactPlaceholder')}
        options={available.map(contact => ({ value: contact.id, label: contact.full_name }))}
        size="sm"
        className="min-w-40"
      />
      <SelectField
        ariaLabel={t('detailContacts.addRolePlaceholder')}
        value={role}
        onChange={next => setRole(next as ProjectContactRole)}
        placeholder={t('detailContacts.addRolePlaceholder')}
        options={PROJECT_CONTACT_ROLES.map(key => ({ value: key, label: t(`detailContacts.roles.${key}`) }))}
        size="sm"
        className="min-w-32"
      />
      <Button
        type="button"
        size="sm"
        variant="black"
        disabled={!contactId || link.isPending}
        isLoading={link.isPending}
        onClick={() =>
          link.mutate(
            { contactId, role },
            {
              onSuccess: () => {
                setContactId('')
                setOpen(false)
              },
              onError: () => toast.error(t('detailContacts.addFailed')),
            },
          )
        }
      >
        {t('detailContacts.addSubmit')}
      </Button>
    </Box>
  )
}
