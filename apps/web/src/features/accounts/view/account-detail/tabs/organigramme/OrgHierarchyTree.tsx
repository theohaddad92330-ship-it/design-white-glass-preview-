import { HORIZONTAL_OVERSCROLL_CLASS, Text, cn } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Contact, OrgHierarchyLevel } from '@bellum/contracts'
import { OrgPersonNode } from './OrgPersonNode'
import { classifyCrmMatch, resolveGraphPersonContact, type ContactSlugIndex } from './organigrammeData'
import type { FocalOrgView as FocalOrgViewData, FocalPersonCard } from './focalOrgData'
import { OrgKnownContactCard } from './OrgKnownContactCard'
import type { KnownOrgContact } from './knownOrgContacts'

/**
 * L'ARBRE L0 → L4 — la colonne vertébrale des vues Hiérarchie et Édition.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Il ne calcule rien. Les rangées, l'ordre, les personnes hors niveau et les
 * Achats viennent de `buildFocalOrgView` — la MÊME dérivation que la vue focale.
 * Deux arbres calculés séparément finiraient par ne pas contenir les mêmes
 * personnes, et l'utilisateur devrait choisir lequel croire.
 *
 * ⚠️ **Les Achats ne sont pas ici.** L5 est un canal PARALLÈLE, pas un sixième
 * étage sous les opérationnels : les ranger dans l'arbre en ferait un « N-5
 * fictif ». Ils ont leur colonne, à côté — c'est exactement ce que la maquette
 * 02 dessine, et c'est aussi l'arbitrage A3 du FINAL.
 *
 * ⚠️ **Il défile dans SON conteneur.** Un arbre large ne fait jamais défiler le
 * corps de la page, et jamais deux conteneurs défilants imbriqués.
 */
/** Les étages de l'arbre, de haut en bas (L5, achats, est un canal parallèle : jamais ici). */
const ORG_TREE_LEVELS: readonly OrgHierarchyLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4']

export function OrgHierarchyTree({
  view,
  cardFooter,
  cardState,
  ariaLabel,
  contactIndex,
  onContactClick,
  onOpenPerson,
  selectedId,
  onSelectPerson,
  knownPlaced,
  onOpenKnown,
}: {
  view: FocalOrgViewData
  /** Les gestes du mode Édition, posés en pied de chaque carte. */
  cardFooter?: (person: FocalPersonCard) => ReactNode
  /** L'état d'édition d'une carte (saisie / cible). Absent = lecture pure. */
  cardState?: (person: FocalPersonCard) => {
    selected?: boolean
    draggable?: boolean
    onDragStart?: () => void
    onDragOver?: (event: { preventDefault: () => void }) => void
    onDrop?: () => void
  }
  ariaLabel: string
  /** #4049.1 — le contact réel derrière une carte (même rapprochement que la vue focale) ; `undefined` = carte inerte. */
  contactIndex?: ContactSlugIndex
  onContactClick?: (contact: Contact) => void
  /** #4061 — un nœud SANS fiche s'ouvre quand même : le panneau personne. Absent (mode Édition) = comme avant. */
  onOpenPerson?: (person: FocalPersonCard) => void
  /** #4061.b — le nœud choisi (id du graphe) : surligné ; le retour d'une fiche le retrouve. */
  selectedId?: string | null
  /** #4061.b — appelé AVANT l'ouverture (fiche ou panneau) : la sélection est posée dans l'URL avant de quitter l'onglet. */
  onSelectPerson?: (person: FocalPersonCard) => void
  /** #4679 — les contacts CONNUS (import / CRM) rangés à leur étage, pastille « Connu ». Absent = comme avant. */
  knownPlaced?: readonly KnownOrgContact[]
  onOpenKnown?: (contact: KnownOrgContact) => void
}) {
  const { t } = useTranslation('accountOrg')
  const node = (person: FocalPersonCard) => {
    // #4049.1 — une fiche réelle retrouvée s'ouvre. #4061 — sinon le panneau personne : TOUT nœud est un bouton.
    const contact = contactIndex && onContactClick ? resolveGraphPersonContact(contactIndex, person) : undefined
    const opener =
      contact && onContactClick ? () => onContactClick(contact) : onOpenPerson ? () => onOpenPerson(person) : undefined
    const open = opener
      ? () => {
          onSelectPerson?.(person)
          opener()
        }
      : undefined
    return (
      <OrgPersonNode
        key={person.id}
        person={person}
        contact={contact}
        crmMatch={contactIndex ? classifyCrmMatch(contactIndex, person) : null}
        footer={cardFooter?.(person)}
        onOpen={open}
        opens={contact ? 'contact' : 'person'}
        selected={selectedId === person.id}
        {...(cardState?.(person) ?? {})}
      />
    )
  }
  // #4679 — un étage que seuls des contacts connus portent existe quand même : ils y sont rangés.
  const knownAt = (level: OrgHierarchyLevel) => (knownPlaced ?? []).filter(known => known.level === level)
  const rows = [
    ...view.levelRows.map(row => ({ level: row.level, people: row.people })),
    ...ORG_TREE_LEVELS.filter(
      level => !view.levelRows.some(row => row.level === level) && knownAt(level).length > 0,
    ).map(level => ({ level, people: [] as FocalPersonCard[] })),
  ].sort((a, b) => ORG_TREE_LEVELS.indexOf(a.level) - ORG_TREE_LEVELS.indexOf(b.level))
  return (
    // #2588 — un tableau large ne renvoie pas le navigateur en arrière.
    <div
      className={cn('mt-4 min-w-0 overflow-x-auto', HORIZONTAL_OVERSCROLL_CLASS)}
      role="group"
      aria-label={ariaLabel}
    >
      {/* Théo comptes-fiche — l'organigramme est un ARBRE, plein écran : un rail vertical relie les étages
          (un point par étage, un trait entre deux), et le cadre occupe la hauteur de la fenêtre (`dvh`, jamais
          `vh`). Le rail ne dit qu'une chose : ce niveau est au-dessus du suivant — jamais une ligne de reporting
          que le graphe n'a pas déclarée. */}
      <div className="min-h-[60dvh] min-w-[36rem] space-y-3" data-testid="org-tree">
        {rows.map((row, index) => (
          <div key={row.level} className="relative flex items-start gap-3" data-testid="org-tree-row">
            <div className="relative w-32 shrink-0 pt-2 pl-5">
              <span
                aria-hidden="true"
                className="absolute left-0 top-3.5 size-2.5 rounded-full border-2 border-[var(--bellum-primary-500)] bg-[var(--bellum-surface-1)]"
              />
              {index < rows.length - 1 || view.unleveled.length > 0 ? (
                <span
                  aria-hidden="true"
                  data-testid="org-tree-connector"
                  className="absolute bottom-[-0.75rem] left-[0.28rem] top-6 w-px bg-[var(--bellum-border)]"
                />
              ) : null}
              <Text size="xs" weight="semibold" className="text-[var(--bellum-text-accent)]">
                {row.level}
              </Text>
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t(`orgMap.levels.${row.level}`)}
              </Text>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              {row.people.map(node)}
              {knownAt(row.level).map(known => (
                <OrgKnownContactCard
                  key={known.id}
                  contact={known}
                  onOpen={onOpenKnown ? () => onOpenKnown(known) : undefined}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Une personne sans niveau n'est rangée à AUCUN étage inventé : elle
            sort de l'arbre, et l'écran DIT pourquoi. La poser en bas la ferait
            lire « opérationnelle », ce que le graphe n'affirme pas. */}
        {view.unleveled.length > 0 ? (
          <div className="flex items-start gap-3 border-t border-dashed border-[var(--bellum-border)] pt-3">
            <div className="w-32 shrink-0 pt-2">
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('orgMap.levelUnknown')}
              </Text>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">{view.unleveled.map(node)}</div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
