import { RoleBadge } from '@/components/contacts/RoleBadge'
import type { Contact, OrgPathOrigin } from '@bellum/contracts'
import { Badge, Button, Card, EntityAvatar, Text } from '@bellum/ui'
import { ArrowRight, ListPlus, Route, TriangleAlert, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ContactAvatar } from '@/components/ui/ContactAvatar'

type RecommendedPathCardProps = {
  contacts: Contact[]
  /** D'OÙ part le chemin, et ce que vaut ce départ. Absent = un dossier
   *  antérieur au chantier : la carte se TAIT, elle ne conclut pas au froid. */
  pathOrigin?: OrgPathOrigin
  onContactClick?: (contact: Contact) => void
  onViewPlan?: () => void
}

export function RecommendedPathCard({ contacts, pathOrigin, onContactClick, onViewPlan }: RecommendedPathCardProps) {
  const { t } = useTranslation('accountOrg')
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <Route className="size-4 text-[var(--bellum-text-accent)]" />
        <Text size="base" weight="semibold">
          {t('recommendedPath.title')}
        </Text>
      </div>
      <PathOrigin origin={pathOrigin} />
      {contacts.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('recommendedPath.empty')}
        </Text>
      ) : (
        <ol className="space-y-2">
          {contacts.map((contact, index) => (
            <RecommendedContactItem key={contact.id} contact={contact} index={index} onContactClick={onContactClick} />
          ))}
        </ol>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={contacts.length === 0}
        icon={ListPlus}
        onClick={onViewPlan}
        className="mt-5 w-full gap-2"
        title={t('recommendedPath.addToPlanTitle')}
      >
        {t('recommendedPath.addToPlan')}
      </Button>
    </Card>
  )
}

/**
 * Le nœud « TOI », la forme du chemin, et l'avertissement de péremption.
 *
 * Trois choses que la source demande ensemble (`T5.md:815-831`), et qui n'ont de
 * sens qu'ensemble :
 *
 *  1. **le départ** — un chemin qui commence à la troisième personne d'un
 *     organigramme ne dit pas au commercial ce qu'il a à faire, LUI ;
 *  2. **la forme** — relation directe, à un saut, entrée froide. La froide se
 *     dit « sans détour » : la travestir en tiédeur ferait jouer un scénario
 *     de relance à quelqu'un qui n'a jamais parlé à ce compte ;
 *  3. **la péremption** — « passe par Untel » ne vaut que ce que vaut la
 *     fraîcheur du lien. Une relation de cinq mois est un fait à revérifier,
 *     pas un atout.
 *
 * ⚠️ Rien ne s'affiche quand `origin` est absent. Un dossier antérieur à ce
 * chantier n'en porte pas, et « je n'ai pas calculé » n'est pas « il n'y a pas
 * de relation » — les rendre identiques à l'écran serait le zéro qui ment.
 */
function PathOrigin({ origin }: { origin?: OrgPathOrigin }) {
  const { t } = useTranslation('accountOrg')
  if (!origin) return null

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] p-3">
      <div className="flex items-center gap-2">
        <span
          data-testid="path-origin-you"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--bellum-bg)] text-[var(--bellum-text-secondary)]"
        >
          <UserRound className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <Text size="xs" weight="semibold">
            {t('recommendedPath.origin.you')}
          </Text>
          <Text size="xs" data-testid="path-form" className="text-[var(--bellum-text-secondary)]">
            {t(`recommendedPath.origin.form.${origin.form}`)}
          </Text>
        </div>
      </div>

      {/* Ce sur quoi le saut s'appuie — un lien du graphe, nommé. Sans lui,
          « passe par Untel » serait une introduction promise sans pièce. */}
      {origin.hop ? (
        <Text size="xs" data-testid="path-hop-basis" className="text-[var(--bellum-text-secondary)]">
          {t(`recommendedPath.origin.hopBasis.${origin.hop.basis}`)}
        </Text>
      ) : null}

      {origin.relation ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {origin.relation}
        </Text>
      ) : null}

      {/* L'avertissement. `frais` ne dit rien : un badge permanent ne se lit plus
          au bout de trois jours — même raison que `PlanFreshnessBadge`. */}
      {origin.relationFreshness !== 'frais' ? (
        <div data-testid="path-relation-freshness" className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--warning-soft-text)]" aria-hidden="true" />
          <Text size="xs" className="text-[var(--warning-soft-text)]">
            {origin.relationDate
              ? t(`recommendedPath.origin.freshness.${origin.relationFreshness}Dated`, { date: origin.relationDate })
              : t(`recommendedPath.origin.freshness.${origin.relationFreshness}`)}
          </Text>
        </div>
      ) : null}
    </div>
  )
}

function RecommendedContactItem({
  contact,
  index,
  onContactClick,
}: {
  contact: Contact
  index: number
  onContactClick?: (contact: Contact) => void
}) {
  return (
    <li className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
      {index < 2 ? (
        <span className="absolute left-4 top-9 h-[calc(100%+0.5rem)] w-px bg-[var(--bellum-border)]" />
      ) : null}
      <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--bellum-bg-lighter)] text-xs font-semibold text-[var(--bellum-text-secondary)]">
        {index + 1}
      </span>
      <div className="min-w-0 pb-1">
        <button
          type="button"
          onClick={() => onContactClick?.(contact)}
          className="group flex w-full items-center gap-2 rounded-lg p-2 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-[color-mix(in_srgb,var(--bellum-text-primary)_4%,transparent)] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bellum-bg)]"
        >
          <ContactAvatar name={contact.full_name} photoUrl={contact.photo_url} size="sm" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <Text size="xs" weight="semibold" noWrap className="truncate">
                {contact.full_name}
              </Text>
            </div>
            <div className="flex-col w-fit flex gap-2">
              <Text size="xs" className="line-clamp-2 text-[var(--bellum-text-secondary)]">
                {contact.title}
              </Text>
            </div>
          </div>
          <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--bellum-text-muted)] opacity-0 transition-[opacity,color,transform] duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-[var(--bellum-text-primary)] group-hover:opacity-100">
            <ArrowRight className="size-3.5" />
          </span>
        </button>
      </div>
    </li>
  )
}
