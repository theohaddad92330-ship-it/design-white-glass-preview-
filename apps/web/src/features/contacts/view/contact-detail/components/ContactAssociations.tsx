import type { ContactAssociationItem } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Briefcase, Building2, FileText, Link2, Target } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useContactAssociations } from '@/features/contacts/hooks/useContactAssociations'
import { useContactProjectLink } from '@/features/contacts/hooks/useContactProjectLink'
import { toast } from 'sonner'
import { ContactAssociateProject } from './ContactAssociateProject'
import { SectionCard } from './SectionCard'

/** Nombre de dossiers montrés d'emblée ; le reste est un clic, pas une colonne de plus. */
const VISIBLE_ITEMS = 4

const KIND_ICON = { project: Briefcase, need: Target, mission: FileText } as const

const LINK_CLASS = 'text-sm font-medium text-[var(--bellum-text-accent)] hover:underline pointer-coarse:min-h-11'

/** #3712.4 — un titre de dossier tient sur 2 lignes au plus (ellipse) ; le titre complet reste en infobulle. */
const ITEM_LINK_CLASS = `${LINK_CLASS} line-clamp-2 break-words`

function ItemLink({ item }: { item: ContactAssociationItem }) {
  switch (item.kind) {
    case 'project':
      return (
        <Link to="/projects/$id" params={{ id: item.id }} className={ITEM_LINK_CLASS} title={item.name}>
          {item.name}
        </Link>
      )
    case 'need':
      return (
        <Link to="/projects/needs/$needId" params={{ needId: item.id }} className={ITEM_LINK_CLASS} title={item.name}>
          {item.name}
        </Link>
      )
    case 'mission':
      return (
        <Link to="/missions/$id" params={{ id: item.id }} className={ITEM_LINK_CLASS} title={item.name}>
          {item.name}
        </Link>
      )
  }
}

function ItemRow({ item, onUnlink }: { item: ContactAssociationItem; onUnlink?: () => void }) {
  const { t } = useTranslation('contacts')
  const { t: tProjects } = useTranslation('projects')
  const { t: tMissions } = useTranslation('missions')
  const Icon = KIND_ICON[item.kind]
  const state =
    item.kind === 'project'
      ? // #3712 — `stages.<key>.label` sert les onglets de veille
        // (signal/plausible/qualified/confirmed), pas les neuf valeurs réelles
        // de `ProjectStage` : « detected » n'y a jamais eu d'entrée et
        // s'affichait brut. `stage.states.*` couvre les neuf.
        tProjects(`stage.states.${item.state}`, { defaultValue: item.state })
      : item.kind === 'need'
        ? tProjects(`needStatus.${item.state}`, { defaultValue: item.state })
        : tMissions(`status.${item.state}`, { defaultValue: item.state })
  const roleKeys = item.roles && item.roles.length > 0 ? item.roles : item.role ? [item.role] : []
  const role =
    roleKeys.length > 0
      ? roleKeys
          .map(key =>
            item.kind === 'project'
              ? tProjects(`detailContacts.roles.${key}`, { defaultValue: key })
              : t(`associations.role.${key}`, { defaultValue: key }),
          )
          .join(', ')
      : null
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <Icon className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <Box className="min-w-0 flex-1">
        <ItemLink item={item} />
        <Text element="p" size="xs" color="text-muted-foreground">
          {[
            t(`associations.kind.${item.kind}`),
            state,
            role,
            item.basis === 'declared' ? t('associations.declared') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Box>
      {onUnlink ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-[var(--bellum-text-secondary)] pointer-coarse:min-h-11"
          onClick={onUnlink}
        >
          {t('associations.associate.unlink')}
        </Button>
      ) : null}
    </li>
  )
}

/**
 * #3712 — à quelle entreprise, entité et quels dossiers la personne est
 * reliée, et l'ouverture EXACTE de ces objets. Lignes proportionnées, jamais
 * de carte « Transactions (0) » : une absence ne fait aucune ligne.
 *
 * Les liens reposent sur l'identité des objets (`GET /contacts/:id/associations`),
 * jamais sur un nom ; un contact historique ou à vérifier ne se présente pas
 * comme en poste ; sans compte identifié, la fiche le DIT sans bloquer les notes
 * ni la préparation.
 */
export function ContactAssociations({ contactId }: { contactId: string }) {
  const { t } = useTranslation('contacts')
  const { data, isLoading, isError } = useContactAssociations(contactId)
  const { unlink } = useContactProjectLink(contactId)
  const [showAll, setShowAll] = useState(false)
  if (isLoading) return null
  if (isError || !data) {
    return (
      <SectionCard icon={Link2} title={t('associations.title')}>
        <Text element="p" size="sm" color="text-muted-foreground">
          {t('associations.readError')}
        </Text>
      </SectionCard>
    )
  }

  const items = showAll ? data.items : data.items.slice(0, VISIBLE_ITEMS)
  const hidden = data.items.length - items.length

  return (
    <SectionCard icon={Link2} title={t('associations.title')}>
      <Box className="space-y-3">
        <Box className="flex items-start gap-2.5">
          <Building2 className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Box className="min-w-0 flex-1">
            {data.account ? (
              <Link to="/accounts/$id" params={{ id: data.account.id }} className={LINK_CLASS}>
                {data.account.name}
              </Link>
            ) : (
              <Text element="p" size="sm" color="text-muted-foreground">
                {t('associations.noAccount')}
              </Text>
            )}
            <Text element="p" size="xs" color="text-muted-foreground">
              {/* #3712 (R20) — l'entité rattachée par clé validée est un LIEN (les contacts de cette entité
                  sur le compte) ; un libellé seulement déclaré, sans clé, reste du texte. */}
              {data.entity && data.account ? (
                <Link
                  to="/accounts/$id"
                  params={{ id: data.account.id }}
                  search={{ tab: 'contacts', entity: data.entity.name }}
                  className="text-[var(--bellum-text-accent)] hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
                >
                  {t('associations.entity', { name: data.entity.name })}
                </Link>
              ) : data.entity ? (
                t('associations.entity', { name: data.entity.name })
              ) : null}
              {data.entity ? ' · ' : null}
              {[
                !data.entity && data.entity_label
                  ? t('associations.entityDeclared', { name: data.entity_label })
                  : null,
                t(`associations.employment.${data.employment}`),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Box>
        </Box>
        {items.length > 0 ? (
          <ul className="divide-y divide-border/60 border-t border-border/60 pt-1">
            {items.map(item => (
              <ItemRow
                key={`${item.kind}-${item.id}`}
                item={item}
                onUnlink={
                  item.kind === 'project' && item.basis === 'documented'
                    ? () =>
                        unlink.mutate(
                          { projectId: item.id },
                          {
                            onSuccess: () => toast.success(t('associations.associate.unlinked')),
                            onError: () => toast.error(t('associations.associate.failed')),
                          },
                        )
                    : undefined
                }
              />
            ))}
          </ul>
        ) : null}
        {data.account && data.employment !== 'historical' ? (
          <ContactAssociateProject
            contactId={contactId}
            accountId={data.account.id}
            linkedProjectIds={data.items.filter(item => item.kind === 'project').map(item => item.id)}
          />
        ) : null}
        {hidden > 0 ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-[var(--bellum-text-secondary)] pointer-coarse:min-h-11"
            onClick={() => setShowAll(true)}
          >
            {t('associations.showAll', { count: hidden })}
          </Button>
        ) : null}
      </Box>
    </SectionCard>
  )
}
