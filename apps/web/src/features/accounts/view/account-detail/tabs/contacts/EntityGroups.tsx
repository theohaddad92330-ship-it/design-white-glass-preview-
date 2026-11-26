import { CrmProvenanceSummary } from '@/features/crm/view/CrmProvenance'
import type { Contact } from '@bellum/contracts'
import { Button, Card, Text, cn } from '@bellum/ui'
import { AnimatePresence, motion } from 'framer-motion'
import { Building2, ChevronDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cardFade } from '../../motion'
import { CompactContactRow } from './CompactContactRow'
import { layoutTransition, rowTransition } from './motionConfig'
import type { ContactGroup, GroupMode } from './types'

/**
 * #1121 — « j'ai 4-5 contacts proposés […] j'ai pas une liste exhaustive des 57
 * contacts trouvés, ou tout du moins, je ne sais pas où elle est ».
 *
 * Elle était là : sous le chemin prioritaire, groupée par entité — et TOUS les
 * groupes s'ouvrent repliés. On voyait donc quelques en-têtes fermés, et rien
 * ne disait que 131 personnes étaient derrière. Deux ajouts, aucun nouvel
 * écran : le TOTAL dans l'en-tête, et « Tout déplier » en un clic.
 */
type EntityGroupsProps = {
  groups: ContactGroup[]
  groupMode: GroupMode
  expandedEntities: ReadonlySet<string>
  onToggleEntity: (entity: string) => void
  /** Ouvre ou referme TOUS les groupes (#1121). */
  onToggleAll?: (expand: boolean) => void
  onContactClick?: (contact: Contact) => void
  /** #2120.71-75 — la sélection multiple. Absente = aucune case à cocher. */
  selectedIds?: ReadonlySet<string>
  onToggleSelected?: (contactId: string) => void
  /** #4465.2 — le nom du compte, pour marquer les départs lus du parcours. */
  accountName?: string | null
}

export function EntityGroups({
  groups,
  groupMode,
  expandedEntities,
  onToggleEntity,
  onToggleAll,
  onContactClick,
  selectedIds,
  onToggleSelected,
  accountName,
}: EntityGroupsProps) {
  const { t } = useTranslation('accountOrg')
  // i18n keys: groups.entity.title|description, groups.persona.title|description
  const copy = {
    title: t(`groups.${groupMode}.title`),
    description: t(`groups.${groupMode}.description`),
  }
  // Le total, à l'endroit où l'on cherche « la liste exhaustive » (#1121).
  // #4324.1 — un contact ÉCARTÉ (homonyme archivé) n'est pas un contact « au total » : il est nommé à part.
  const all = groups.flatMap(group => group.contacts)
  const excluded = all.filter(contact => Boolean(contact.excluded_at)).length
  const total = all.length - excluded
  const allExpanded = groups.length > 0 && groups.every(group => expandedEntities.has(group.entity))

  return (
    <motion.div variants={cardFade} layout transition={{ layout: layoutTransition }}>
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--bellum-border)] px-5 py-4">
          <div className="min-w-0">
            <Text size="base" weight="semibold">
              {copy.title}
            </Text>
            <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
              {/* Le nombre AVANT la description : c'est lui qu'on cherche. */}
              {t('groups.totalHere', { count: total })}
              {excluded > 0 ? `, ${t('groups.excludedHere', { count: excluded })}` : ''} · {copy.description}
            </Text>
            {/* #4459.4 — le compteur « N dans ton CRM · M trouvés par l'analyse » vit AUSSI ici : c'est dans Personnes
                que se lisent les badges, et c'est là que la recette cherchait leur somme (rien hors d'un compte du CRM). */}
            <CrmProvenanceSummary />
          </div>
          {onToggleAll && groups.length > 0 ? (
            <Button
              size="xs"
              variant="outline"
              icon={allExpanded ? ChevronsDownUp : ChevronsUpDown}
              onClick={() => onToggleAll(!allExpanded)}
            >
              {t(allExpanded ? 'groups.collapseAll' : 'groups.expandAll')}
            </Button>
          ) : null}
        </div>

        <motion.div layout transition={{ layout: layoutTransition }}>
          <AnimatePresence initial={false} mode="popLayout">
            {groups.map(group => (
              <EntityGroupRow
                key={group.entity}
                group={group}
                expanded={expandedEntities.has(group.entity)}
                onToggle={() => onToggleEntity(group.entity)}
                onContactClick={onContactClick}
                selectedIds={selectedIds}
                onToggleSelected={onToggleSelected}
                accountName={accountName}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      </Card>
    </motion.div>
  )
}

type EntityGroupRowProps = {
  group: ContactGroup
  expanded: boolean
  onToggle: () => void
  onContactClick?: (contact: Contact) => void
  selectedIds?: ReadonlySet<string>
  onToggleSelected?: (contactId: string) => void
  accountName?: string | null
}

/**
 * #2120.14 — la liste « tous les contacts » se PAGINE. Un groupe ouvert rendait
 * toutes ses lignes d'un coup : 2 027 contacts sur THALES, chacun avec son menu
 * d'actions. On en montre cinquante, puis cinquante de plus au clic, et le
 * compte « N sur M » dit ce qui reste derrière — rien n'est caché sans le dire.
 */
export const GROUP_PAGE_SIZE = 50

function EntityGroupRow({
  group,
  expanded,
  onToggle,
  onContactClick,
  selectedIds,
  onToggleSelected,
  accountName,
}: EntityGroupRowProps) {
  const { t } = useTranslation('accountOrg')
  const [visibleCount, setVisibleCount] = useState(GROUP_PAGE_SIZE)
  const visibleContacts = group.contacts.slice(0, visibleCount)
  const remaining = group.contacts.length - visibleContacts.length
  return (
    <motion.section
      layout
      initial={{ opacity: 0, transform: 'translate3d(0, 6px, 0)' }}
      animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
      exit={{ opacity: 0, transform: 'translate3d(0, -4px, 0)' }}
      transition={{ ...rowTransition, layout: layoutTransition }}
      className="border-b border-[var(--bellum-border)] last:border-b-0"
    >
      <GroupHeader
        group={group}
        expanded={expanded}
        onToggle={onToggle}
        shownCount={expanded ? visibleContacts.length : null}
      />

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: rowTransition, layout: layoutTransition }}
            className="space-y-1 border-t border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)]/50 p-2"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {visibleContacts.map(contact => (
                <CompactContactRow
                  key={contact.id}
                  contact={contact}
                  accountName={accountName}
                  onContactClick={onContactClick}
                  selection={
                    onToggleSelected
                      ? {
                          selected: selectedIds?.has(contact.id) ?? false,
                          onToggle: () => onToggleSelected(contact.id),
                        }
                      : undefined
                  }
                />
              ))}
            </AnimatePresence>
            {/* R15-9 — le COMPTE est remonté dans l'en-tête, là où l'œil le
                rencontre ; il reste ici le GESTE, et lui seul (loi 4 du tome 7 :
                rien n'apparaît deux fois sous la même forme). */}
            {remaining > 0 ? (
              <div className="flex flex-wrap items-center justify-end gap-2 px-3 py-2">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setVisibleCount(count => count + GROUP_PAGE_SIZE)}
                >
                  {t('groups.showMore', { count: Math.min(GROUP_PAGE_SIZE, remaining) })}
                </Button>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  )
}

/**
 * R15-9 (recette du 15/09/2026, prod `5ca597d5a`, dossier THALES) — L'EN-TÊTE
 * D'UN GROUPE DIT CE QU'IL MONTRE.
 *
 * Mesuré à l'écran : « Entité non renseignée — 1961 contacts » au-dessus d'un
 * groupe ouvert qui en rendait une fraction, et rien à cet endroit ne disait
 * que la liste était plafonnée. Le « N affichés sur M » existait déjà — mais
 * tout en bas, DERRIÈRE les cinquante lignes qu'il commente : il fallait
 * traverser ce qu'on ne savait pas incomplet pour apprendre qu'il l'était.
 *
 * Le compte d'un groupe REPLIÉ reste son total (rien n'est montré, il n'y a
 * donc rien à promettre) ; ouvert et plafonné, il dit les deux nombres.
 */
function GroupHeader({
  group,
  expanded,
  onToggle,
  shownCount,
}: {
  group: ContactGroup
  expanded: boolean
  onToggle: () => void
  /** Lignes réellement rendues, ou `null` quand le groupe est replié. */
  shownCount: number | null
}) {
  const { t } = useTranslation('accountOrg')
  const capped = shownCount !== null && shownCount < group.contacts.length
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors duration-150 ease-out hover:bg-[var(--bellum-bg-lighter)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bellum-bg)]"
    >
      <Building2 className="size-4 text-[var(--bellum-text-accent)]" />
      <Text size="sm" weight="semibold" className="min-w-0 flex-1 truncate">
        {group.entity}
      </Text>
      <Text size="sm" weight="medium" className="shrink-0 text-[var(--bellum-text-secondary)]">
        {capped
          ? t('groups.shownOf', { shown: shownCount, count: group.contacts.length })
          : t('groups.contactCount', { count: group.contacts.length })}
      </Text>
      <ChevronDown
        className={cn(
          'size-4 text-[var(--bellum-text-muted)] transition-transform duration-150 ease-out',
          expanded && 'rotate-180',
        )}
      />
    </button>
  )
}
