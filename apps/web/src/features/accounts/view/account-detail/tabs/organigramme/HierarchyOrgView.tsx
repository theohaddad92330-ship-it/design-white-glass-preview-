import type { Contact, OrgGraph } from '@bellum/contracts'
import { Badge, Card, SelectField, Text } from '@bellum/ui'
import { ShoppingCart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'
import { OrgCoverageBanner } from './OrgCoverageBanner'
import { OrgHierarchyTree } from './OrgHierarchyTree'
import { OrgKnownContactCard } from './OrgKnownContactCard'
import { knownOrgContacts, type KnownOrgContact } from './knownOrgContacts'
import { OrgLinkMarker } from './OrgLinkMarker'
import { OrgPersonNode } from './OrgPersonNode'
import { OrgUnplacedNotice } from './OrgUnplacedNotice'
import { classifyCrmMatch, resolveGraphPersonContact, type ContactSlugIndex } from './organigrammeData'
import { OrgPersonPanel } from './OrgPersonPanel'
import {
  buildFocalOrgView,
  defaultFocalDirectionId,
  normaliseOrgPersonName,
  orgRootEntityIds,
  unenrichedOrgContacts,
  unplacedOrgSummary,
  type FocalPersonCard,
} from './focalOrgData'
import { orgMarketMemoryLine } from './orgMarketMemoryLine'

/** #2512 — au-delà de ce nombre, « +N de plus » plutôt qu'un mur de cartes
 *  muettes (même doctrine que `MAX_VISIBLE_DIRECTIONS` / `TOP_CONTACTS`). */
const UNENRICHED_VISIBLE_CAP = 12

/**
 * LA VUE HIÉRARCHIE — l'entité, son arbre L0-L4 en pleine largeur, et les
 * Achats EN DESSOUS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UNE MAQUETTE REFUSÉE, PUIS RÉTABLIE EN VUE — ET POURQUOI CE N'EST PAS LA MÊME
 * ─────────────────────────────────────────────────────────────────────────
 * Cette maquette (alternative 02 du 27/08) avait été écartée le 30/08 :
 * `agent_docs/orggraph-contradictions-2026-08-30.md` §5 la range parmi « les
 * trois alternatives GPT écartées », avec « le rail Achats sur l'écran principal
 * avec les 8 rôles bruts ». La raison tenait en une phrase : elle prend la place
 * de l'écran d'arrivée, et l'écran d'arrivée doit répondre à « par qui je
 * commence ? », pas à « comment cette direction est-elle faite ? ».
 *
 * **Louis a levé ce refus le 31/08/2026, dans une forme précise** : les trois
 * alternatives deviennent des VUES COMMUTABLES, pas des remplacements. La vue
 * focale reste le défaut. Ce qui était refusé — « en premier écran » — l'est
 * toujours ; ce qui est livré est un second regard, à un clic, sur les mêmes
 * données.
 *
 * ⚠️ **Revirement du 17/09/2026 (#2513, #2514)** : la géométrie posée le 31/08
 * plaçait la colonne Achats À CÔTÉ de l'arbre, dans une grille deux colonnes,
 * et l'arbre restait donc borné à `minmax(0,1fr)` face à une colonne fixe de
 * 20rem. Retour de Louis en recette : l'arbre doit prendre TOUTE la largeur,
 * et Achats + légende descendent EN DESSOUS. Ce n'est pas un retour sur
 * l'arbitrage A3 (Achats hors de l'arbre, toujours vrai) — seule la PLACE à
 * l'écran change.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE VUE APPORTE, ET QUE LA FOCALE NE MONTRE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * · **Les huit rôles BRUTS**, sur les cartes. La focale n'affiche que la lecture
 *   commerciale à quatre valeurs (Sponsor / Influenceur / Opérationnel /
 *   Bloqueur) ; ici on voit ce que le graphe DIT (`economic_buyer`,
 *   `technical_buyer`, `procurement`…). Même vocabulaire, deux granularités —
 *   surtout pas deux vocabulaires.
 * · **La colonne Achats / contrôle**, sous l'arbre, jamais à côté.
 * · **La légende du trait**, en toutes lettres : un lien vérifié et un lien
 *   supposé ne se distinguent pas seulement par un motif de bordure.
 *
 * ⚠️ La géométrie reste celle de la focale : la HAUTEUR vient du niveau, jamais
 * du rôle (GA-100). Cette vue affiche PLUS de rôles, elle n'en fait pas des
 * rangées.
 */
export function HierarchyOrgView({
  graph,
  discovered,
  directionId,
  onDirectionChange,
  contacts,
  accountId,
  contactIndex,
  onContactClick,
  onOpenContactById,
  selectedId,
  onSelectedChange,
}: {
  graph: OrgGraph
  /** Contacts découverts sur le DOSSIER. `undefined` = on ne sait pas ; jamais 0. */
  discovered?: number
  /** L'entité regardée — commandée par l'onglet, pour qu'un clic depuis la vue
   *  Groupe arrive ICI sur la bonne direction. */
  directionId: string | null
  onDirectionChange: (id: string) => void
  /** #2512 — le corpus COMPLET des contacts découverts sur ce dossier, pas
   *  seulement ceux que la vague d'enrichissement a touchés. `undefined` =
   *  appelant qui ne les porte pas encore (aucune section n'apparaît alors —
   *  jamais un « 0 non enrichi » qui affirmerait une mesure absente). */
  contacts?: readonly {
    id: string
    full_name: string
    title?: string | null
    entity?: string | null
    family?: string | null
    source?: string | null
  }[]
  /** #2837 — absent = pas de ligne mémoire marché (comme les autres gestes qui
   *  dépendent d'`accountId` ailleurs dans l'onglet, `useAccountMarketContext`
   *  reste désactivé). */
  accountId?: string
  /** #4049.1 — le rapprochement carte → contact réel et l'ouverture de sa fiche (comme la vue focale). */
  contactIndex?: ContactSlugIndex
  onContactClick?: (contact: Contact) => void
  /** #4679 — ouvre la fiche d'un contact CONNU par son id (il n'a pas de nœud dans le graphe). */
  onOpenContactById?: (contactId: string) => void
  /** #4061.b — le nœud choisi, porté par l'URL du dossier (le retour d'une fiche le retrouve). Absent = état local. */
  selectedId?: string | null
  onSelectedChange?: (id: string | null) => void
}) {
  const { t } = useTranslation('accountOrg')
  const { t: tAccounts } = useTranslation('accounts')
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null)
  const selected = selectedId !== undefined ? selectedId : localSelectedId
  const select = onSelectedChange ?? setLocalSelectedId
  const view = useMemo(
    () => buildFocalOrgView(graph, directionId ?? defaultFocalDirectionId(graph), { discovered }),
    [graph, directionId, discovered],
  )
  // #4061 — le panneau personne s'ouvre pour un nœud SANS fiche ; #4061.b — il se déduit de la sélection,
  // donc un nœud avec fiche (sélectionné avant de quitter l'onglet) ne rouvre jamais un panneau au retour.
  const openedPerson = useMemo(() => {
    if (!view || !selected) return null
    const card = [...view.levelRows.flatMap(row => row.people), ...view.unleveled, ...view.procurement].find(
      person => person.id === selected,
    )
    if (!card) return null
    const hasRecord = contactIndex && onContactClick ? resolveGraphPersonContact(contactIndex, card) : undefined
    return hasRecord ? null : card
  }, [view, selected, contactIndex, onContactClick])
  const requestedName = view?.requestedWithoutPeople?.name ?? null
  const unenriched = useMemo(
    () => (contacts ? unenrichedOrgContacts(graph, contacts, requestedName) : null),
    [graph, contacts, requestedName],
  )
  // #4679 — les contacts CONNUS (import / CRM) : rangés à leur étage quand leur titre le permet, sinon épinglés en haut.
  const known = useMemo(() => {
    if (!contacts || !view) return null
    const scope = new Set(
      [view.direction.name, ...view.contacts.map(card => card.entityName ?? '')].map(normaliseOrgPersonName),
    )
    return knownOrgContacts(graph, contacts, scope)
  }, [graph, contacts, view])
  const openKnown = (card: KnownOrgContact) => onOpenContactById?.(card.id)
  // #2837 — même ligne, même hook que les autres vues (GA-26). Comme la vue
  // Focale, la "direction" affichée ici peut être une entité fille : la ligne
  // ne se pose que quand la direction ouverte EST une racine (GA-391).
  const {
    data: marketContext,
    isPending: marketContextPending,
    isError: marketContextError,
  } = useAccountMarketContext(accountId, Boolean(accountId))
  const isRootDirection = useMemo(() => (view ? orgRootEntityIds(graph).has(view.direction.id) : false), [graph, view])
  const marketMemoryLine = isRootDirection
    ? orgMarketMemoryLine(tAccounts, {
        accountId,
        isPending: marketContextPending,
        isError: marketContextError,
        data: marketContext,
      })
    : null

  const unplaced = useMemo(() => unplacedOrgSummary(graph, contacts), [graph, contacts])
  // #4749 — la notice se pose quand rien n'a pu être placé, ou quand des personnes du graphe n'ont aucune entité.
  const showUnplaced = unplaced.unplaced > 0 && (!view || unplaced.unplacedInGraph > 0)
  const unplacedNotice = showUnplaced ? <OrgUnplacedNotice known={unplaced.known} unplaced={unplaced.unplaced} /> : null

  // #4749 — aucune direction focale ne se construit : on NOMME l'absence et « Non enrichis » reste atteignable
  // (ils étaient derrière un `return null` silencieux).
  if (!view) {
    if (!unplacedNotice && !(unenriched && unenriched.length > 0)) return null
    return (
      <div className="space-y-4">
        {unplacedNotice}
        {unenriched && unenriched.length > 0 ? <UnenrichedSection contacts={unenriched} /> : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <label className="min-w-0">
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('focal.directionLabel')}
            </Text>
            {/* Un `<select>` NATIF : il se tabule, s'ouvre au clavier et appelle
                le sélecteur du système sur un téléphone. Même mécanique que la
                vue focale — un seul geste pour choisir un périmètre. */}
            <SelectField
              ariaLabel={t('focal.directionAria')}
              value={view.direction.id}
              onChange={next => onDirectionChange(next)}
              // #4177.1 — le groupe (périmètre sans personne en propre) n'est pas dans
              // `directions` : il s'ajoute en tête quand il est la direction ouverte.
              options={(view.directions.some(direction => direction.id === view.direction.id)
                ? view.directions
                : [view.direction, ...view.directions]
              ).map(direction => ({
                value: direction.id,
                label: `${direction.name} · ${t('focal.peopleCount', { count: direction.peopleCount })}`,
              }))}
              className="mt-1 w-full min-w-[14rem]"
            />
          </label>
          <OrgCoverageBanner coverage={view.coverage} />
        </div>
        {/* #2837 — la direction ouverte EST la racine (voir `isRootDirection`
            plus haut) : jamais affiché quand une entité fille est choisie. */}
        {marketMemoryLine ? (
          <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
            {marketMemoryLine}
          </Text>
        ) : null}
      </Card>

      {/* #4177.2 — l'entité demandée n'a aucun organigramme : on le DIT, on ne lit pas
          une autre entité à sa place sans prévenir. */}
      {view.requestedWithoutPeople ? (
        <Text role="note" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('hierarchy.scopeWithoutOrg', { name: view.requestedWithoutPeople.name, shown: view.direction.name })}
        </Text>
      ) : null}

      {/* #4679 — « Connus de l'équipe » : épinglé EN HAUT. Aucun contact connu non rangé ⇒ aucun bloc. */}
      {known && known.pinned.length > 0 ? (
        <Card className="p-4" role="group" aria-label={t('hierarchy.knownTeamAria')}>
          <Text element="h3" size="base" weight="semibold">
            {t('hierarchy.knownTeamTitle')}
          </Text>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('hierarchy.knownTeamSubtitle')}
          </Text>
          <div className="mt-3 flex flex-wrap gap-2">
            {known.pinned.map(card => (
              <OrgKnownContactCard
                key={card.id}
                contact={card}
                onOpen={onOpenContactById ? () => openKnown(card) : undefined}
              />
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="min-w-0 p-4">
        <Text element="h3" size="base" weight="semibold">
          {t('hierarchy.treeTitle', { direction: view.direction.name })}
        </Text>
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('hierarchy.treeSubtitle')}
        </Text>
        {/* #4049.1 — cartes cliquables, même fiche que la vue focale */}
        <OrgHierarchyTree
          view={view}
          ariaLabel={t('focal.treeAria')}
          contactIndex={contactIndex}
          onContactClick={onContactClick}
          onOpenPerson={person => select(person.id)}
          selectedId={selected}
          onSelectPerson={person => select(person.id)}
          knownPlaced={known?.placed}
          onOpenKnown={onOpenContactById ? openKnown : undefined}
        />
      </Card>

      {/* #2513, #2514 — Achats + légende SOUS l'arbre, jamais à côté ; l'arbre
          ci-dessus prend alors toute la largeur du conteneur. */}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <ProcurementRail
          view={view}
          onOpenPerson={person => select(person.id)}
          selectedId={selected}
          contactIndex={contactIndex}
          onContactClick={onContactClick}
        />
        <LinkLegend />
      </div>

      <OrgPersonPanel person={openedPerson} graph={graph} accountId={accountId} onClose={() => select(null)} />

      {unplacedNotice}

      {/* #2512 — les non-enrichis, PAR DÉFAUT : `unenriched` est `null`
          seulement quand l'appelant ne porte pas encore le corpus complet
          (`contacts` absent) — jamais masqué par un réglage. */}
      {unenriched && unenriched.length > 0 ? <UnenrichedSection contacts={unenriched} /> : null}
    </div>
  )
}

/**
 * LES NON-ENRICHIS — #2512.
 *
 * « Aujourd'hui certains [organigrammes] paraissent vides et avec peu de
 * profondeur » : la cause mesurée est que `graph.people` ne porte QUE la
 * vague d'enrichissement IA (bornée), jamais le reste du corpus découvert —
 * voir `unenrichedOrgContacts`. Cette section les montre, DISTINGUÉS d'un mot
 * ET d'un style (badge « Non enrichi », bordure en pointillés — la même
 * grammaire que `OrgLinkMarker` pour une hypothèse) : ce ne sont pas des
 * nœuds de l'organigramme, ce sont des contacts qui n'ont pas encore été
 * analysés. Rien n'est deviné pour eux : pas de niveau, pas de rôle, pas de
 * rattachement d'entité — classer leur PROFONDEUR resterait un chantier IA
 * (classification des niveaux), hors de portée d'un écran qui ne lit que ce
 * que le graphe lui donne.
 */
function UnenrichedSection({
  contacts,
}: {
  contacts: readonly { id: string; fullName: string; title: string | null }[]
}) {
  const { t } = useTranslation('accountOrg')
  const shown = contacts.slice(0, UNENRICHED_VISIBLE_CAP)
  const hidden = contacts.length - shown.length
  return (
    <Card className="p-4" role="group" aria-label={t('hierarchy.unenrichedAria')}>
      <Text element="h3" size="base" weight="semibold">
        {t('hierarchy.unenrichedTitle')}
      </Text>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('hierarchy.unenrichedSubtitle')}
      </Text>
      <div className="mt-3 flex flex-wrap gap-2">
        {shown.map(contact => (
          <div
            key={contact.id}
            className="min-w-[13rem] max-w-[18rem] rounded-lg border border-dashed border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3 opacity-80"
          >
            <Badge variant="outline">{t('hierarchy.unenrichedBadge')}</Badge>
            <Text size="sm" weight="semibold" className="mt-1.5 text-[var(--bellum-text-primary)]">
              {contact.fullName}
            </Text>
            {contact.title ? (
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {contact.title}
              </Text>
            ) : null}
          </div>
        ))}
      </div>
      {/* « +N de plus » est un COMPTE, donc exact (même règle que les 4
          directions du groupe) — jamais une estimation. */}
      {hidden > 0 ? (
        <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
          {t('hierarchy.unenrichedMore', { count: hidden })}
        </Text>
      ) : null}
    </Card>
  )
}

/**
 * ACHATS / CONTRÔLE — l'axe parallèle de la maquette 02.
 *
 * « Axe parallèle, pas un niveau hiérarchique » : la maquette l'écrit sous son
 * titre, et c'est exactement l'arbitrage A3. Un acheteur ne dépend pas du
 * responsable technique — il intervient à côté, sur le processus.
 *
 * Vide, la colonne DIT qu'elle est vide plutôt que de disparaître : « aucun
 * acheteur identifié » est une information pour un commercial qui prépare un
 * dossier, l'absence de bloc n'en est pas une.
 */
function ProcurementRail({
  view,
  onOpenPerson,
  selectedId,
  contactIndex,
  onContactClick,
}: {
  view: ReturnType<typeof buildFocalOrgView>
  onOpenPerson: (person: FocalPersonCard) => void
  /** #4061.b — le nœud choisi ; la sélection est posée AVANT d'ouvrir la fiche (`onOpenPerson`). */
  selectedId?: string | null
  contactIndex?: ContactSlugIndex
  onContactClick?: (contact: Contact) => void
}) {
  const { t } = useTranslation('accountOrg')
  if (!view) return null
  const contactOf = (person: FocalPersonCard) =>
    contactIndex && onContactClick ? resolveGraphPersonContact(contactIndex, person) : undefined
  const openOf = (person: FocalPersonCard) => {
    const contact = contactOf(person)
    return contact && onContactClick
      ? () => {
          onOpenPerson(person)
          onContactClick(contact)
        }
      : () => onOpenPerson(person)
  }
  return (
    <Card className="p-4" role="group" aria-label={t('focal.procurementAria')}>
      <div className="flex items-center gap-2">
        <ShoppingCart className="size-4 text-[var(--bellum-text-secondary)]" aria-hidden />
        <Text element="h3" size="base" weight="semibold">
          {t('focal.procurementTitle')}
        </Text>
      </div>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('hierarchy.procurementSubtitle')}
      </Text>
      {view.procurement.length === 0 ? (
        <Text size="sm" className="mt-3 text-[var(--bellum-text-muted)]">
          {t('hierarchy.procurementEmpty')}
        </Text>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {view.procurement.map(person => (
            // #4061 — un acheteur sans fiche s'ouvre aussi : le panneau personne.
            <OrgPersonNode
              key={person.id}
              person={person}
              contact={contactOf(person)}
              crmMatch={contactIndex ? classifyCrmMatch(contactIndex, person) : null}
              onOpen={openOf(person)}
              opens={contactOf(person) ? 'contact' : 'person'}
              selected={selectedId === person.id}
            />
          ))}
        </div>
      )}
    </Card>
  )
}

/**
 * LA LÉGENDE — le point que les trois maquettes alternatives avaient perdu.
 *
 * Aucune des trois ne portait la distinction vérifié / hypothèse, alors qu'elle
 * est le cœur de l'organigramme du produit. Elle est ici EXPLICITE, et elle
 * réutilise le même composant que les traits eux-mêmes : une légende recopiée à
 * la main finit par décrire un rendu qui a changé.
 */
function LinkLegend() {
  const { t } = useTranslation('accountOrg')
  return (
    <Card className="p-4" role="group" aria-label={t('hierarchy.legendAria')}>
      <Text element="h3" size="base" weight="semibold">
        {t('hierarchy.legendTitle')}
      </Text>
      <div className="mt-2 space-y-1">
        <OrgLinkMarker origin="sourced" />
        <OrgLinkMarker origin="assumed" />
        <OrgLinkMarker origin="structure" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline">L2</Badge>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('hierarchy.legendLevel')}
        </Text>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline">{t('correction.roles.champion')}</Badge>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('hierarchy.legendRole')}
        </Text>
      </div>
    </Card>
  )
}
