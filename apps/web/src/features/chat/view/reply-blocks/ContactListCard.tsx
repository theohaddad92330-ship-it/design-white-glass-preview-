import { useTranslation } from 'react-i18next'
import { Users } from 'lucide-react'
import { EntityAvatar, Text } from '@bellum/ui'
import { renderInlineMarkdown } from '../markdown'
import { personInitials } from './person-initials'
import { orgViewHref } from './orgViewHref'
import {
  CardLink,
  ItemName,
  LabeledLines,
  ReplyCard,
  SourceBadge,
  TopThenRest,
  formatAsOf,
  type BlockOf,
} from './ReplyCard'

type ListedContact = BlockOf<'contact_list'>['items'][number]

/**
 * #1914.4 — une liste de contacts.
 *
 * Une personne n'a JAMAIS d'image ici, seulement ses initiales : la carte ne
 * porte aucune photo (le contrat n'en déclare pas), et une photo n'a de toute
 * façon rien à faire dans une liste qui ORDONNE des gens (`c58_criteres_proteges`).
 * #3229 (Y3 02/10) — quand la liste se replie sur trois, le NOMBRE total est dit au-dessus :
 * le nombre que Laura annonce est celui de la carte, pas celui des seules lignes visibles.
 * r3a (recette prod 07/10) : e-mail et téléphone s'écrivent EN CLAIR sur la ligne quand l'outil les a rendus
 * (coordonnées toujours en clair) ; absents, rien n'est affiché.
 */
export function ContactListCard({ block }: { block: BlockOf<'contact_list'> }) {
  const { t } = useTranslation('chat')
  return (
    <ReplyCard type={block.type} title={block.title ?? t('blocks.kind.contact_list')} icon={Users}>
      {block.items.length > 3 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('blocks.contactCount', { count: block.items.length })}
        </Text>
      ) : null}
      <TopThenRest items={block.items} renderItem={item => <ContactRow item={item} />} />
      <LabeledLines label={t('blocks.missing')} lines={block.missing} />
      {/* #AM.32 — le périmètre rendu s'ouvre dans la vue Focale existante, déjà filtré : pas de page parallèle. */}
      {block.org_view ? (
        <Text size="sm" weight="medium">
          <CardLink href={orgViewHref(block.org_view)}>{t('blocks.seeInOrgChart')}</CardLink>
        </Text>
      ) : null}
    </ReplyCard>
  )
}

/**
 * #4610 PARTIAL (prod 27/10, EXOTEC) — un prénom seul (« Arnaud — nom à confirmer ») n'a souvent pas de fiche
 * qu'on puisse désigner sans ambiguïté : la ligne n'est alors pas cliquable, et l'écran le DIT au lieu de laisser
 * un nom qui a l'air d'un lien. Un nom complet sans fiche ne porte pas de raison : on n'explique que ce qu'on sait.
 */
function isFirstNameOnly(name: string): boolean {
  const base = name.replace(/\s*(?:[—–-]|\()\s*(?:prénom seul|nom à confirmer)[^)]*\)?\s*$/i, '').trim()
  return base !== name.trim() || base.split(/\s+/).length === 1
}

function ContactRow({ item }: { item: ListedContact }) {
  const { t } = useTranslation('chat')
  return (
    <div className="flex min-w-0 items-start gap-2">
      <EntityAvatar name={item.name} fallback={personInitials(item.name)} size="xs" aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        <ItemName name={item.name} href={item.href} touchTarget />
        {!item.href && isFirstNameOnly(item.name) ? (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('blocks.contactNoRecord')}
          </Text>
        ) : null}
        {item.role || item.company ? (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {item.role}
            {item.role && item.company ? ' · ' : null}
            {/* #4610.7 — le compte cité mène à sa fiche quand le serveur en a posé le chemin ; sinon il reste du texte. */}
            {item.company && item.company_href ? (
              <CardLink href={item.company_href} touchTarget>
                {item.company}
              </CardLink>
            ) : (
              item.company
            )}
          </Text>
        ) : null}
        {item.email || item.phone ? (
          <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
            {item.email ? (
              <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="break-all">
                {item.email}
              </Text>
            ) : null}
            {item.phone ? (
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {item.phone}
              </Text>
            ) : null}
          </div>
        ) : null}
        <FollowUpLine followUp={item.follow_up} />
        {item.reason ? (
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {renderInlineMarkdown(item.reason)}
          </Text>
        ) : null}
        <SourceBadge source={item.source} />
      </div>
    </div>
  )
}

/**
 * #3894 — relance dans contact_list (Louis 16/10) : le dernier envoi ou la relance préparée de cette personne, avec
 * sa date. Absent = AUCUNE ligne : on n'affiche pas ce qu'on n'a pas, et une absence ne se lit jamais « jamais
 * relancé ». « Préparée » n'est jamais écrit « envoyée » (le copilote prépare, le commercial envoie).
 */
function FollowUpLine({ followUp }: { followUp: ListedContact['follow_up'] }) {
  const { t } = useTranslation('chat')
  if (!followUp) return null
  return (
    <Text size="xs" color="text-[var(--bellum-text-secondary)]">
      {t(`blocks.followUp.${followUp.kind}`, { date: formatAsOf(followUp.as_of) })}
    </Text>
  )
}
