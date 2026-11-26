import type { Contact, OrgPathOrigin } from '@bellum/contracts'
import { RecommendedPathCard } from './RecommendedPathCard'
import { RoleLegendCard } from './RoleLegendCard'

type OrganigrammeSidebarProps = {
  contactsCount: number
  classifiedContactsCount: number
  recommendedPath: Contact[]
  /** D'où part le chemin — absent sur un dossier antérieur au chantier. */
  pathOrigin?: OrgPathOrigin
  onContactClick?: (contact: Contact) => void
  onViewPlan?: () => void
}

export function OrganigrammeSidebar({
  contactsCount,
  classifiedContactsCount,
  recommendedPath,
  pathOrigin,
  onContactClick,
  onViewPlan,
}: OrganigrammeSidebarProps) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-80">
      <RoleLegendCard contactsCount={contactsCount} classifiedContactsCount={classifiedContactsCount} />
      <RecommendedPathCard
        contacts={recommendedPath}
        pathOrigin={pathOrigin}
        onContactClick={onContactClick}
        onViewPlan={onViewPlan}
      />
    </aside>
  )
}
