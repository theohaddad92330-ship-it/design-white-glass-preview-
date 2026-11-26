import { formatPhoneForDisplay, readOrgFreshness, type Contact, type OrgGraph } from '@bellum/contracts'
import {
  Badge,
  Button,
  Card,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  HORIZONTAL_OVERSCROLL_CLASS,
  SelectField,
  Text,
} from '@bellum/ui'
import {
  Ban,
  ChevronRight,
  Ellipsis,
  Mail,
  Network,
  PencilLine,
  Phone,
  ShieldCheck,
  ShoppingCart,
  Tag,
  Target,
  Users,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'
import { useKnownPeople } from '@/features/account-facts/useKnownPeople'
import { useContactRanking } from '@/features/contacts/hooks/useContactRanking'
import { formatCalendarDate } from '@/lib/deadline'
import { OrgCoverageBanner } from './OrgCoverageBanner'
import { ContactCrmOriginBadge } from '@/features/crm/view/CrmProvenance'
import { OrgCrmMatchBadge } from './OrgCrmMatchBadge'
import { OrgKnownMarker } from './OrgKnownMarker'
import { buildKnownByPersonId } from './knownByPersonId'
import { OrgSourceChips } from './OrgSourceChips'
import { OrgUnplacedNotice } from './OrgUnplacedNotice'
import { OrgVerifyRelation } from './OrgVerifyRelation'
import { OrgCorrectionDrawer } from './corrections/OrgCorrectionDrawer'
import type { PersonCorrectionField } from './corrections/orgCorrectionDraft'
import {
  buildFocalOrgView,
  defaultFocalDirectionId,
  orgRootEntityIds,
  unplacedOrgSummary,
  type FocalOrgView as FocalOrgViewData,
  type FocalPersonCard,
  type GeneratorColouring,
  type OrgDecisionBadge,
} from './focalOrgData'
import { orgMarketMemoryLine } from './orgMarketMemoryLine'
import { getRoleDescription, getRoleLabel } from '@/lib/contactRoles'
import { RoleHint } from '@/components/contacts/RoleHint'
import { NamedAbsence } from '@/components/feedback/NamedAbsence'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'
import {
  buildContactSlugIndex,
  classifyCrmMatch,
  type CrmMatchStatus,
  orgPersonSlug,
  resolveGraphPersonContact,
  type ContactSlugIndex,
} from './organigrammeData'

/**
 * LA VUE FOCALE PAR DIRECTION — l'écran par défaut de l'onglet Organigramme
 * (OrgGraph FINAL du 27/08, décision 3, aligné sur la maquette SNCF RÉSEAU).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN CORRIGE
 * ─────────────────────────────────────────────────────────────────────────
 * L'onglet ouvrait sur une carte de GROUPE : toutes les entités côte à côte,
 * toutes les personnes visibles à la fois. C'est une vue de plan de compte —
 * elle répond à « comment ce groupe est-il fait ? ». Or la question qu'un
 * commercial se pose en ouvrant l'onglet est plus étroite et plus urgente :
 * « sur CETTE direction, par qui je commence ? ». Le FINAL tranche : la vue
 * focale est la page d'arrivée, la vue Groupe reste accessible en un clic.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA GÉOMÉTRIE, ET POURQUOI ELLE N'EST PAS NÉGOCIABLE
 * ─────────────────────────────────────────────────────────────────────────
 * **La hauteur d'une carte vient de son NIVEAU (L0-L4). Point.** Les rangées
 * de cet arbre s'appellent « Gouvernance », « Exécutif », « Direction »,
 * « Management », « Expert / opérationnel » — jamais « Sponsor »,
 * « Influenceur », « Opérationnel ». La spec v3 proposait l'inverse et le FINAL
 * le refuse nommément : « cela recréerait exactement le défaut dénoncé ».
 *
 * Un organigramme dont les rangées sont des rôles de vente répond à une
 * question qu'on ne lui a pas posée. Le commercial y lit « Claire dépend de
 * Julien » alors que l'écran ne dit que « Claire influence, Julien décide » —
 * et il appelle Julien en pensant remonter une ligne hiérarchique qui n'existe
 * pas.
 *
 * Les Achats ont leur propre bloc, à côté de l'arbre : c'est un canal
 * PARALLÈLE, pas un sixième étage. L5 reste dans l'énumération du contrat.
 */
export function FocalOrgView({
  accountId,
  graph,
  discovered,
  contacts,
  onSystemView,
  onViewAllContacts,
  onContactClick,
  directionId,
  onDirectionChange,
  selectedId,
  onSelectedChange,
}: {
  /**
   * #4061.c — la direction ouverte et la personne choisie, PORTÉES par l'URL quand l'appelant les fournit
   * (`od` / `os`, comme la Hiérarchie) : recharger ou partager le lien rouvre la même direction et remet la
   * même carte en évidence. Absents ⇒ état local, comme avant.
   */
  directionId?: string | null
  onDirectionChange?: (next: string | null) => void
  selectedId?: string | null
  onSelectedChange?: (id: string | null) => void
  /** Sans lui, aucun geste qui ÉCRIT n'est proposé — l'écran reste en lecture. */
  accountId?: string
  graph: OrgGraph
  /** Contacts découverts sur le DOSSIER. `undefined` = on ne sait pas ; jamais 0. */
  discovered?: number
  /**
   * #2121.15 / #2121.54 — le corpus VIVANT de contacts du dossier, pour
   * rapprocher le classement d'utilité (`useContactRanking`, identifiants de
   * CONTACTS) des personnes du graphe (identifiants dérivés du NOM). Absent
   * ⇒ le tableau du bas garde son tri d'avant ce point (niveau puis confiance).
   * #3019 — c'est aussi CE corpus qui fait qu'une carte devient cliquable
   * vers la fiche : jamais un identifiant inventé, seulement un contact réel
   * retrouvé par son nom (`orgPersonSlug`, même clé que la vue Influence).
   */
  contacts?: Contact[]
  /** Bascule vers la vue système (Groupe / entités / influence). */
  onSystemView?: () => void
  /** Ouvre tous les contacts du dossier — le top n'est jamais tout le compte. */
  onViewAllContacts?: () => void
  /**
   * #3019 (retour bêta) — « je devrais pouvoir cliquer sur les cartes pour
   * accéder au contact ». Absent ⇒ la carte reste en lecture, comme avant ce
   * point ; un contact non retrouvé ⇒ la carte reste non cliquable, jamais un
   * clic qui mènerait nulle part.
   */
  onContactClick?: (contact: Contact) => void
}) {
  const { t } = useTranslation('accountOrg')
  const { t: tAccounts } = useTranslation('accounts')
  const [localChosen, setLocalChosen] = useState<string | null>(null)
  // #4061.c — contrôlé par l'URL dès que l'appelant fournit `onDirectionChange`.
  const chosen = onDirectionChange ? (directionId ?? null) : localChosen
  const setChosen = onDirectionChange ?? setLocalChosen
  const selected = onSelectedChange ? (selectedId ?? null) : null
  /**
   * #2121.15 / #2121.54 — la MÊME vérité que l'onglet Contacts (GA-26) : même
   * hook, même clé de requête (`contactKeys.ranking`) donc le MÊME cache — un
   * contact prioritaire dans Contacts porte le même statut ici, littéralement
   * la même donnée, jamais une seconde lecture qui pourrait diverger.
   * `enabled: Boolean(accountId)` (dans le hook) : sans compte, pas d'appel.
   */
  const ranking = useContactRanking(accountId ?? '', {})
  const topContactIds = useMemo(() => {
    const ranked = ranking.data?.ranked
    if (!ranked || !contacts || contacts.length === 0) return null
    const contactById = new Map(contacts.map(contact => [contact.id, contact]))
    return ranked
      .map(entry => contactById.get(entry.contact_id))
      .filter((contact): contact is Contact => contact != null)
      .map(contact => orgPersonSlug(contact.full_name))
  }, [ranking.data, contacts])
  // #3019 — la clé PRINCIPALE reste le slug exact du nom (`p-{slug}`), déjà
  // utilisée par la vue Influence (`OrgInfluenceMap.tsx`) : même rapprochement,
  // pas un second calcul. `buildContactSlugIndex` y ajoute un repli tolérant à
  // l'ordre prénom/nom et aux accents (mesuré en recette du 25/09 : « Bernd
  // Wachter » — voir le docblock de `buildContactSlugIndex`).
  const contactIndex = useMemo(() => buildContactSlugIndex(contacts ?? []), [contacts])
  // #3423.7 — la fiche contact est la source du rôle décisionnel affiché sur la carte.
  const contactRoleByPersonId = useMemo(() => {
    return new Map(
      graph.people.map(person => [person.id, resolveGraphPersonContact(contactIndex, person)?.decision_role ?? null]),
    )
  }, [graph, contactIndex])
  // #4072.1 — les personnes que l'espace connaît déjà (CRM, missions passées) :
  // rapprochées au nom EXACT (forme neutralisée, jamais l'orthographe), marquées
  // et passées devant dans leur niveau.
  const knownPeople = useKnownPeople(accountId)
  const knownByPersonId = useMemo(() => buildKnownByPersonId(graph.people, knownPeople), [graph, knownPeople])
  const view = useMemo(
    () =>
      buildFocalOrgView(graph, chosen ?? defaultFocalDirectionId(graph), {
        discovered,
        topContactIds,
        contactRoleByPersonId,
        knownByPersonId,
      }),
    [graph, chosen, discovered, topContactIds, contactRoleByPersonId, knownByPersonId],
  )
  // #2837 — même ligne, même hook que la carte système (GA-26). La "direction"
  // affichée ici peut être une entité FILLE (l'utilisateur en choisit une dans
  // le sélecteur) : la ligne ne se pose donc que quand la direction ouverte EST
  // une racine (GA-391 — jamais sur une entité fille).
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

  if (!view) {
    // #4749 × #4805 — aucune direction ne se construit. Deux règles se rencontrent ici, et la
    // fusion du 30/10 n'en avait gardé qu'une (la ligne de main, avec les imports de #4749
    // restés orphelins) : #4749 NOMME les personnes connues qu'aucune entité ne rattache,
    // #4805 interdit qu'une vue disparaisse en silence. La plus informative passe d'abord ;
    // l'absence nommée reste le repli, jamais un `return null`.
    const unplaced = unplacedOrgSummary(graph, contacts)
    if (unplaced.unplaced > 0) return <OrgUnplacedNotice known={unplaced.known} unplaced={unplaced.unplaced} />
    return <NamedAbsence what={t('absence.view')} reason={t('absence.viewReason')} testId="org-view-absence" />
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* Un `<select>` NATIF, et c'est délibéré : il se tabule, s'ouvre au
              clavier, appelle le sélecteur du système sur un téléphone, et
              n'exige aucun script pour être utilisable. C'est aussi ce que fait
              déjà le sélecteur de période du pilotage — un même geste, une même
              mécanique. */}
          <label className="min-w-0">
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('focal.directionLabel')}
            </Text>
            <SelectField
              ariaLabel={t('focal.directionAria')}
              value={view.direction.id}
              onChange={next => setChosen(next)}
              options={view.directions.map(direction => ({
                value: direction.id,
                label: `${direction.name} · ${t('focal.peopleCount', { count: direction.peopleCount })}`,
              }))}
              className="mt-1 w-full min-w-[14rem]"
            />
          </label>
          {/* Le MÊME bandeau que les vues Groupe et Hiérarchie — un seul
              composant, donc un seul jeu de compteurs pour tout l'onglet. */}
          <OrgCoverageBanner coverage={view.coverage} />
          {onSystemView ? (
            <Button size="sm" variant="outline" className="ml-auto gap-2 self-end" onClick={onSystemView}>
              <Network className="size-4" aria-hidden />
              {t('focal.systemView')}
            </Button>
          ) : null}
        </div>
        <DirectionShortcuts view={view} chosenId={view.direction.id} onChoose={setChosen} />
        <GeneratorColouringNotice colouring={view.colouring} />
        {/* #2837 — la direction ouverte EST la racine (voir `isRootDirection`
            plus haut) : jamais affiché quand une entité fille est choisie. */}
        {marketMemoryLine ? (
          <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
            {marketMemoryLine}
          </Text>
        ) : null}
      </Card>

      {/* #3036 retour bêta — « mettre le chemin d'accès recommandé en dessous
          de la carte, pour laisser la carte en pleine largeur » : l'arbre de
          décision (la carte) occupe toute la largeur, le chemin d'accès suit
          en dessous — même empilement en mobile et en desktop, plus de
          colonne `xl:grid-cols-*` qui rétrécissait la carte. */}
      <div className="w-full min-w-0 space-y-4">
        <DecisionTree
          view={view}
          graph={graph}
          accountId={accountId}
          contactIndex={contactIndex}
          crmReady={contacts !== undefined}
          onContactClick={onContactClick}
          selectedId={selected}
          onSelectedChange={onSelectedChange}
        />
        <RecommendedPath view={view} />
      </div>

      <ProcurementColumn
        view={view}
        graph={graph}
        accountId={accountId}
        contactIndex={contactIndex}
        crmReady={contacts !== undefined}
        onContactClick={onContactClick}
        selectedId={selected}
        onSelectedChange={onSelectedChange}
      />
      <FocalContactsTable view={view} onViewAllContacts={onViewAllContacts} />
    </div>
  )
}

/**
 * LES QUATRE DIRECTIONS — `T5.md:1051` (cas limite « groupe à 1 000 filiales »).
 *
 *   > « 4 entités maximum affichées, les mieux scorées, avec "+ 996 autres". »
 *
 * Trois exigences tenues ensemble, et c'est leur conjonction qui fait la règle :
 *
 *  · **quatre**, parce qu'une rangée de mille repères n'est plus un repère ;
 *  · **« + N autres » est un COMPTE, donc exact** — le nombre de directions que
 *    CE GRAPHE porte et que la rangée ne montre pas. Le libellé dit
 *    « cartographiées » : on n'annonce pas le nombre de filiales du groupe, que
 *    personne n'a collecté. Un total supposé serait le même mensonge que « non
 *    mesuré = 0 » ;
 *  · **un chemin vers les autres** : le sélecteur juste au-dessus reste
 *    exhaustif. Une troncature muette laisserait croire que le compte n'a que
 *    quatre directions.
 */
function DirectionShortcuts({
  view,
  chosenId,
  onChoose,
}: {
  view: FocalOrgViewData
  chosenId: string
  onChoose: (id: string) => void
}) {
  const { t } = useTranslation('accountOrg')
  // La rangée n'existe QUE quand le compte en porte plus qu'elle n'en montre —
  // le cas que la source nomme. En dessous, le sélecteur les porte déjà toutes
  // et une rangée qui répéterait les mêmes noms serait la même chose deux fois.
  if (view.hiddenDirections === 0) return null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {view.topDirections.map(direction => (
        <Button
          key={direction.id}
          type="button"
          size="sm"
          variant={direction.id === chosenId ? 'secondary' : 'outline'}
          aria-pressed={direction.id === chosenId}
          onClick={() => onChoose(direction.id)}
        >
          {direction.name}
        </Button>
      ))}
      {view.hiddenDirections > 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('focal.moreDirections', { count: view.hiddenDirections })}
        </Text>
      ) : null}
    </div>
  )
}

/**
 * Le plancher de gris — la vraie règle des 60 % (`T5.md:798-802`).
 *
 * Elle ne parle pas des traits, elle parle des NŒUDS : sur un compte non
 * enrichi, au moins 60 % des personnes doivent rester de rôle inconnu. La mesure
 * est faite par le GÉNÉRATEUR et voyage avec le graphe — l'écran la LIT, et le
 * seuil affiché est celui que le graphe porte, jamais une copie locale.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ DEUX DÉFAUTS DE CETTE PHRASE, MESURÉS SUR ROCHE LE 30/08/2026 (D267)
 * ─────────────────────────────────────────────────────────────────────────
 *   > « sur les 35 personnes que l'analyse n'a pas enrichies, seules 0 %
 *   >   ne portent aucun rôle de décision, alors que le plancher est de 60 % »
 *
 * 1. **Elle se lisait à l'envers.** Elle énonçait une ABSENCE (« ne portent
 *    aucun rôle ») et la comparait à un plancher : « 0 % sans rôle » se lit
 *    spontanément « 100 % en ont un », ce qui SEMBLE être le bon cas. Un
 *    avertissement dont le chiffre a l'air rassurant n'avertit personne. Elle
 *    énonce désormais la part COLORIÉE et le maximum qu'elle dépasse — la même
 *    mesure, dans le sens où elle alarme.
 * 2. **Le « 0 % » n'était pas mesuré** — voir `measureGeneratorColouring`. La
 *    condition ci-dessous est donc `=== false` et non « pas vrai » : une mesure
 *    impossible (`null`) ne conclut RIEN, et l'écran se tait.
 */
function GeneratorColouringNotice({ colouring }: { colouring: GeneratorColouring | null }) {
  const { t } = useTranslation('accountOrg')
  // `=== false` STRICTEMENT : `null` veut dire « je n'ai pas pu mesurer », et un
  // verdict tiré d'un silence est exactement ce que ce bloc a cessé de faire.
  if (!colouring || colouring.meetsFloor !== false || colouring.share === null) return null
  return (
    <Text
      role="note"
      aria-label={t('focal.overColouredAria')}
      size="xs"
      className="mt-3 text-[var(--warning-soft-text)]"
    >
      {t('focal.overColoured', {
        // La part COLORIÉE, pas la part grise : c'est elle qui est trop haute.
        coloured: Math.round((1 - colouring.share) * 100),
        // Et le maximum qu'elle ne devrait pas dépasser — le complément du
        // plancher que le graphe transporte, jamais une constante locale.
        maxColoured: Math.round((1 - colouring.floor) * 100),
        count: colouring.unenriched,
      })}
    </Text>
  )
}

/* ------------------------------------------------------------------ */
/*  Chemin d'accès recommandé                                          */
/* ------------------------------------------------------------------ */

function RecommendedPath({ view }: { view: FocalOrgViewData }) {
  const { t } = useTranslation('accountOrg')
  return (
    <Card className="p-4" role="group" aria-label={t('focal.pathAria')}>
      <div className="flex items-center gap-2">
        <Target className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text element="h3" size="base" weight="semibold">
          {t('focal.pathTitle')}
        </Text>
      </div>

      {view.path.length === 0 ? (
        <Text size="sm" className="mt-3 text-[var(--bellum-text-muted)]">
          {t('orgGraph.emptyPath')}
        </Text>
      ) : (
        <ol className="mt-3 space-y-3">
          {view.path.map(step => (
            <li key={step.person.id} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--bellum-surface-2)] text-xs font-semibold text-[var(--bellum-text-secondary)]">
                {step.step}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                    {step.person.fullName}
                  </Text>
                  <DecisionBadge badge={step.person.badge} decisionRole={step.person.decisionRole} />
                </div>
                {step.person.title ? (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {step.person.title}
                  </Text>
                ) : null}
                <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
                  {step.objective}
                </Text>
                {step.unlocks ? (
                  <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
                    {t('orgGraph.unlocks')} {step.unlocks}
                  </Text>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Le verdict de la maquette : une phrase, entièrement composée de champs
          du graphe. Rien n'y est rédigé par l'écran. */}
      {view.verdict ? (
        <div className="mt-4 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3">
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('focal.verdict', { name: view.verdict.name, objective: view.verdict.objective })}
            {view.verdict.unlocks ? ` ${t('focal.verdictUnlocks', { unlocks: view.verdict.unlocks })}` : null}
          </Text>
        </div>
      ) : null}

      {/* Décision 5 : ce qui a été retiré du chemin est NOMMÉ. Un bloqueur muet
          laisse le commercial se demander pourquoi son dossier n'avance pas. */}
      {view.excludedBlockers.length > 0 ? (
        <div className="mt-3 flex items-start gap-1.5">
          <Ban className="mt-0.5 size-3.5 shrink-0 text-[var(--danger-soft-text)]" aria-hidden />
          <Text size="xs" className="text-[var(--danger-soft-text)]">
            {t('focal.blockersExcluded', {
              names: view.excludedBlockers.map(person => person.fullName).join(', '),
              count: view.excludedBlockers.length,
            })}
          </Text>
        </div>
      ) : null}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  L'arbre de décision — L0 à L4                                      */
/* ------------------------------------------------------------------ */

function DecisionTree({
  view,
  graph,
  accountId,
  contactIndex,
  crmReady,
  onContactClick,
  selectedId,
  onSelectedChange,
}: {
  view: FocalOrgViewData
  graph: OrgGraph
  accountId?: string
  contactIndex: ContactSlugIndex
  /** #4056.1 — les contacts sont chargés : sans cela, « non retrouvée » serait un faux négatif. */
  crmReady: boolean
  onContactClick?: (contact: Contact) => void
  selectedId?: string | null
  onSelectedChange?: (id: string | null) => void
}) {
  const { t } = useTranslation('accountOrg')
  // #2121.1 — « organigramme » est une promesse de PREUVE. Tant qu'aucun
  // rattachement de ce périmètre n'est vérifié, l'arbre ne range que des
  // intitulés de poste : il se titre « carte d'influence commerciale ».
  const proven = [...view.levelRows.flatMap(row => row.people), ...view.unleveled].some(
    person => person.reporting?.verified === true,
  )
  return (
    <Card className="min-w-0 p-4">
      <Text element="h3" size="base" weight="semibold">
        {t(proven ? 'focal.treeTitle' : 'focal.treeTitleUnproven', { direction: view.direction.name })}
      </Text>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('focal.treeSubtitle')}
      </Text>

      {/* Le graphe défile dans SON conteneur, jamais le corps de la page.
          #2588 — un tableau large ne renvoie pas le navigateur en arrière. */}
      <div
        className={cn('mt-4 min-w-0 overflow-x-auto', HORIZONTAL_OVERSCROLL_CLASS)}
        role="group"
        aria-label={t('focal.treeAria')}
      >
        <div className="min-w-[36rem] space-y-3">
          {view.levelRows.map(row => (
            <div key={row.level} className="flex items-start gap-3">
              <div data-focal-level-label className="w-32 shrink-0 pt-2">
                <Badge variant="outline">{row.level}</Badge>
                <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                  {t(`orgMap.levels.${row.level}`)}
                </Text>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
                {row.people.map(person => (
                  <PersonCard
                    key={person.id}
                    person={person}
                    graph={graph}
                    accountId={accountId}
                    contact={resolveGraphPersonContact(contactIndex, person)}
                    crmMatch={crmReady ? classifyCrmMatch(contactIndex, person) : null}
                    onContactClick={onContactClick}
                    selected={selectedId === person.id}
                    onSelect={onSelectedChange}
                  />
                ))}
              </div>
            </div>
          ))}
          {view.unleveled.length > 0 ? (
            <div className="flex items-start gap-3 border-t border-dashed border-[var(--bellum-border)] pt-3">
              <div data-focal-level-label className="w-32 shrink-0 pt-2">
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('orgMap.levelUnknown')}
                </Text>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
                {view.unleveled.map(person => (
                  <PersonCard
                    key={person.id}
                    person={person}
                    graph={graph}
                    accountId={accountId}
                    contact={resolveGraphPersonContact(contactIndex, person)}
                    crmMatch={crmReady ? classifyCrmMatch(contactIndex, person) : null}
                    onContactClick={onContactClick}
                    selected={selectedId === person.id}
                    onSelect={onSelectedChange}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('focal.legendLevels')}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('focal.legendBadges')}
        </Text>
      </div>
    </Card>
  )
}

/**
 * Une carte de personne.
 *
 * Elle porte, dans cet ordre : son entité (pour qu'on ne confonde jamais deux
 * BU), son badge de décision, son nom, sa fonction, et ce que le graphe SAIT de
 * son rattachement. Un bloqueur est ATTÉNUÉ — visible, identifié, en retrait
 * (décision 5 : « on l'exclut du chemin, pas de la structure »).
 */
/** #2121.43-45 — les gestes de correction d'une carte, et le champ qu'ouvre chacun. */
export const PERSON_GESTURES = [
  { key: 'addWhatIKnow', field: 'title' },
  { key: 'correctRelation', field: 'reportsTo' },
  { key: 'declareRole', field: 'decisionRoles' },
] as const satisfies readonly { key: string; field: PersonCorrectionField }[]

/** #3019 — l'icône NOMME le geste dans le menu, sans qu'il faille l'ouvrir pour savoir ce qu'il fait. */
const PERSON_GESTURE_ICONS: Record<(typeof PERSON_GESTURES)[number]['key'], typeof PencilLine> = {
  addWhatIKnow: PencilLine,
  correctRelation: Users,
  declareRole: Tag,
}

function PersonCard({
  person,
  graph,
  accountId,
  contact,
  crmMatch,
  onContactClick,
  selected = false,
  onSelect,
}: {
  /** #4061.c — la carte choisie (portée par l'URL) : mise en évidence, `aria-current`. */
  selected?: boolean
  onSelect?: (id: string | null) => void
  person: FocalPersonCard
  graph: OrgGraph
  accountId?: string
  /** #4056.1 — superposition CRM (libellé), `null`/absent tant que les contacts ne sont pas chargés. */
  crmMatch?: CrmMatchStatus | null
  /** #3019 — le contact RÉEL derrière cette carte, retrouvé par le nom. `undefined` = pas de fiche à ouvrir. */
  contact?: Contact
  onContactClick?: (contact: Contact) => void
}) {
  const { t } = useTranslation('accountOrg')
  // #2553.3 — un fait périmé redevient inconnu AVEC SA DATE. `stale`
  // seulement : `never_verified` est l'état par défaut de tout contact non
  // déclaré, l'afficher partout noierait le signal qu'un import daté ajoute.
  const freshness = readOrgFreshness(person.lastVerifiedAt, new Date())
  // #2121.43-45 / #3019 — lequel des trois tiroirs de correction est ouvert,
  // maintenant qu'un seul menu (plutôt que trois boutons) les déclenche.
  const [openGesture, setOpenGesture] = useState<(typeof PERSON_GESTURES)[number]['key'] | null>(null)
  // #3019 — retour bêta : « je devrais pouvoir cliquer sur les cartes pour
  // accéder au contact ». La carte n'est cliquable QUE si un contact réel a
  // été retrouvé pour cette personne — jamais un clic qui mènerait nulle part.
  // #4061.c — la sélection est écrite D'ABORD, puis la fiche s'ouvre : le retour retrouve la carte.
  const openContact =
    contact && onContactClick
      ? () => {
          onSelect?.(person.id)
          onContactClick(contact)
        }
      : null
  return (
    <div
      data-testid="focal-person-card"
      aria-current={selected ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      role={openContact ? 'button' : undefined}
      tabIndex={openContact ? 0 : undefined}
      aria-label={openContact ? t('focal.openContactAria', { name: person.fullName }) : undefined}
      onClick={openContact ?? undefined}
      onKeyDown={
        openContact
          ? event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openContact()
              }
            }
          : undefined
      }
      className={cn(
        'min-w-[13rem] max-w-[18rem] rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3',
        person.attenuated && 'opacity-60',
        selected && 'border-[var(--bellum-primary-500)] ring-2 ring-[var(--bellum-primary-500)]',
        openContact &&
          'cursor-pointer outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--bellum-text-primary)_4%,transparent)] focus-visible:border-[var(--bellum-primary-500)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bellum-bg)]',
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {/* #2515 — la pilule (`w-fit whitespace-nowrap`, `badge.tsx`) est
            mono-ligne par construction : sans borne, un nom d'entité long
            sortait de la carte (`max-w-[18rem]`) au lieu d'y tenir — « carte
            moche, textes qui dépassent ». `max-w-full truncate` la borne à la
            largeur de la carte ; le nom entier reste lisible au survol. */}
        {person.entityName ? (
          <Badge variant="outline" title={person.entityName} className="max-w-full truncate">
            {person.entityName}
          </Badge>
        ) : null}
        <DecisionBadge badge={person.badge} decisionRole={person.decisionRole} />
        {/* `T5.md:804-813` : « badge déduit — ✓ si inféré ». Sans lui, « Sponsor »
            se lit comme une observation, alors qu'aucune source n'a vu ce rôle :
            il est lu sur le titre par une règle. Le commercial doit savoir qu'il
            va parler budget à quelqu'un dont on SUPPOSE qu'il en a un. */}
        {person.roleInferred ? (
          <Badge variant="outline" title={t('focal.roleInferredHelp')}>
            {t('focal.roleInferred')}
          </Badge>
        ) : null}
        {/* #3019 retour bêta — « plus d'infos pertinentes ». Le statut d'identité
            (machine à états p15) est déjà porté par CETTE carte et n'était
            affiché nulle part ici : un contact ACTIONABLE n'a pas le même prix
            commercial qu'un ex-employé gardé pour mémoire. */}
        <Badge
          variant={
            person.identityStatus === 'actionable'
              ? 'success'
              : person.identityStatus === 'historical'
                ? 'warning'
                : 'outline'
          }
        >
          {t(`orgMap.identityStatus.${person.identityStatus}`, person.identityStatus)}
        </Badge>
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-2">
        <Text size="sm" weight="semibold" className="min-w-0 text-[var(--bellum-text-primary)]">
          {person.fullName}
        </Text>
        {/* Le geste s'ouvre depuis le menu ci-dessous — cette pastille se
            contente de MONTRER que la carte s'ouvre, y compris sur tactile où
            il n'y a pas de survol (même rôle que `CompactContactRow`). */}
        {openContact ? (
          <ChevronRight aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
        ) : null}
        {/* 13/10/2026 (recette « carré ») — le menu « … » vit sur la ligne du nom : sa propre rangée
            laissait ~45 px de vide sous le contenu de chaque carte. `-my-1` : la cible ne grandit pas la ligne. */}
        {accountId ? (
          <div role="none" className="-my-1 shrink-0" onClick={event => event.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  aria-label={t('row.actionsAria', { name: person.fullName })}
                >
                  <Ellipsis className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {PERSON_GESTURES.map(gesture => {
                  const Icon = PERSON_GESTURE_ICONS[gesture.key]
                  return (
                    <DropdownMenuItem key={gesture.key} onClick={() => setOpenGesture(gesture.key)}>
                      <Icon className="mr-2 size-4" aria-hidden />
                      {t(`correction.gestures.${gesture.key}`)}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>
      {person.title ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {person.title}
        </Text>
      ) : null}
      {/* #4072.1 — déjà connu de l'espace : marqué et daté. */}
      <OrgKnownMarker known={person.known} />
      {/* « Aucun trait : relation non prouvée. Le silence est un état correct. »
          On n'écrit donc RIEN quand le graphe ne porte pas de rattachement. */}
      {person.reporting ? (
        <Text
          size="xs"
          className={cn(
            'mt-1.5',
            person.reporting.verified ? 'text-[var(--success-soft-text)]' : 'text-[var(--bellum-text-muted)]',
          )}
        >
          {person.reporting.verified ? (
            <>
              <ShieldCheck className="mr-1 inline size-3" aria-hidden />
              {t('focal.reportsToVerified', { name: person.reporting.managerName })}
            </>
          ) : person.reporting.origin === 'inferred' ? (
            /* #4016 L4.2 — le N+1 PROBABLE déduit des intitulés : badgé, jamais
               un fait (provenance `inferred`, aucune source). */
            <>
              {t('focal.reportsToInferred', { name: person.reporting.managerName })}{' '}
              <EstimatedBadge kind="probable" className="ml-1 align-middle" />
            </>
          ) : person.reporting.origin === 'hypothesis' ? (
            /* Une HYPOTHÈSE, et elle le dit — sans chiffre. Le graphe porte bien
               une confiance sur l'influence (15 le plus souvent, 0 quand aucun
               facteur ne joue), mais c'est un score NU : pas d'axes, donc pas de
               score ; et posé à côté d'un nom de N+1 il se lirait comme une
               chance que le rattachement soit vrai. Ce qui est vrai et suffisant
               à dire, c'est que personne ne l'a observé. */
            t('focal.reportsToAssumed', { name: person.reporting.managerName })
          ) : (
            t('focal.reportsToProbable', {
              name: person.reporting.managerName,
              confidence: person.reporting.confidence,
            })
          )}
        </Text>
      ) : null}
      {/* Le RAISONNEMENT de l'analyse, en toutes lettres. Il est écrit par le
          générateur (« N+1 supposé par le modèle à partir du poste … aucune
          source n'a observé ce rattachement ») : le lire évite d'avoir à
          deviner ce qu'un score de 15 voulait dire. */}
      {person.reporting?.origin === 'hypothesis' && person.reporting.reasoning ? (
        <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          {person.reporting.reasoning}
        </Text>
      ) : null}
      {person.attenuated ? (
        <Text size="xs" className="mt-1 text-[var(--danger-soft-text)]">
          {t('focal.blockerKeptInStructure')}
        </Text>
      ) : null}
      {/* #3019 retour bêta — les coordonnées quand l'enrichissement les a
          résolues : la fiche les a déjà, la carte ne les montrait pas. Même
          lecture que `OrgInfluenceMap` — jamais devinées, jamais les deux
          lignes si l'une manque. */}
      {contact?.email || contact?.phone ? (
        <div className="mt-1 space-y-0.5">
          {contact.email ? (
            <div className="flex items-center gap-1.5">
              <Mail className="size-3 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
              <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
                {contact.email}
              </Text>
              {/* #4016 L4.1 — une adresse ESTIMÉE se badge, partout où elle s'affiche. */}
              {contact.email_estimated_at ? <EstimatedBadge verifiedAt={contact.email_estimated_at} /> : null}
            </div>
          ) : null}
          {contact.phone ? (
            <div className="flex items-center gap-1.5">
              <Phone className="size-3 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
              <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
                {/* #3850.4 — international lisible, jamais le compact brut. */}
                {formatPhoneForDisplay(contact.phone)}
              </Text>
            </div>
          ) : null}
        </div>
      ) : null}
      {/* #4056.1 — connue / incertaine / non retrouvée, en toutes lettres. */}
      <OrgCrmMatchBadge status={crmMatch} />
      {/* #4459.2 — la provenance du contact derrière la carte : y était-il dans ton CRM, ou l'analyse l'a-t-elle apporté ? */}
      {contact ? <ContactCrmOriginBadge contact={contact} /> : null}
      {/* « Source de l'inférence ✓ TOUJOURS » (`T5.md:804-813`). Un nœud sans
          aucune preuve ne l'affichait pas — un silence que rien ne distinguait
          d'une carte simplement plus courte. Il le DIT maintenant. */}
      {person.sources.length > 0 ? (
        <OrgSourceChips sources={person.sources} max={2} />
      ) : (
        <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]" title={t('focal.noSourceReason')}>
          {t('focal.noSource')}
        </Text>
      )}
      {/* #2553.3 — un organigramme importé daté (Kovéa, Agirc-Arrco, Clésia…)
          redevient « à vérifier » une fois périmé, avec SA date : on archive,
          on ne supprime pas. */}
      {freshness.state === 'stale' ? (
        <Text size="xs" className="mt-1 text-[var(--bellum-warning-text)]">
          {t('focal.staleInfo', {
            // #3434 (recette prod 26755bbac3, lot C1, 30/09) — jamais la date
            // ISO brute : la même mise en forme que partout ailleurs dans le
            // produit, jamais devinée à la main ici.
            date: formatCalendarDate(freshness.lastVerifiedAt!.slice(0, 10)) ?? freshness.lastVerifiedAt!.slice(0, 10),
          })}
        </Text>
      ) : null}
      {/* Promouvoir une supposition en lien prouvé, DEPUIS l'endroit où on la
          lit. Le geste existait, mais uniquement sur une ligne des « 4 vues » —
          à deux écrans de la carte que le commercial regarde vraiment.
          `stopPropagation` : la carte elle-même peut être cliquable (#3019),
          ce bouton ne doit jamais déclencher SON clic à elle. */}
      {accountId && person.reporting && !person.reporting.verified ? (
        <div role="none" onClick={event => event.stopPropagation()}>
          <OrgVerifyRelation accountId={accountId} fromId={person.id} toId={person.reporting.managerId} />
        </div>
      ) : null}
      {/* CORRIGER — le geste humain, accroché à la CARTE et non à un lien.
          ⚠️ Le bouton juste au-dessus se rend sur `person.reporting`, donc sur
          une arête `reports_to` : depuis le correctif P0, le pipeline n'en
          produit plus aucune et il ne s'affiche jamais ici (mesuré le 30/08 :
          `cartes: 2 | avec reporting: 0`). Accrocher la correction au même
          endroit l'aurait tuée de la même façon. La carte, elle, existe dès
          qu'une personne existe — et corriger « responsable direct » est
          précisément ce qui CRÉE l'arête que le pipeline n'invente plus. */}
      {/* #2121.43-45 — « Ajouter ce que je sais », « Corriger cette relation »,
          « Déclarer un rôle » : trois GESTES nommés, chacun ouvrant le même
          tiroir sur SON champ. Un bouton « Corriger » unique noyait le rôle et
          la relation dans un sélecteur que personne n'ouvrait. Le tiroir garde
          son sélecteur : le geste choisit le point d'entrée, pas la limite.
          #3019 retour bêta — « les 3 boutons d'action prennent trop de place
          sur la carte » : les trois gestes tiennent maintenant dans UN seul
          menu (cible ≥ 44 px, ce qui se clique se tabule), chacun ouvrant
          toujours SON tiroir, sur SON champ — rien ne change dans ce qu'ils
          FONT, seulement la place qu'ils prennent. */}
      {accountId ? (
        <div role="none" className="contents" onClick={event => event.stopPropagation()}>
          {PERSON_GESTURES.map(gesture => (
            <OrgCorrectionDrawer
              key={gesture.key}
              accountId={accountId}
              graph={graph}
              objectType="person"
              objectId={person.id}
              objectName={person.fullName}
              field={gesture.field}
              triggerLabel={t(`correction.gestures.${gesture.key}`)}
              withTrigger={false}
              open={openGesture === gesture.key}
              onOpenChange={next => setOpenGesture(next ? gesture.key : null)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Le rôle commercial, en BADGE. Jamais une rangée, jamais une position. */
function DecisionBadge({ badge, decisionRole }: { badge: OrgDecisionBadge | null; decisionRole: string | null }) {
  const { t } = useTranslation('accountOrg')
  const roleLabel = decisionRole ? getRoleLabel(decisionRole) : null
  // #4016.L9d (18/10) — l'écran garde 4 badges ; le rôle exact (parmi les 8 du contrat) se lit AU SURVOL, avec sa phrase.
  const roleDescription = decisionRole ? getRoleDescription(decisionRole) : ''
  const roleHover = roleLabel ? (roleDescription ? `${roleLabel} — ${roleDescription}` : roleLabel) : undefined
  const salesLabel = badge ? t(`focal.badges.${badge}`) : null
  // #3423.7 — le rôle de la FICHE sous son libellé ; le rôle commercial calculé,
  // s'il en diffère, est NOMMÉ comme tel — jamais sous le même mot.
  const showSales = salesLabel !== null && salesLabel !== roleLabel
  const variant =
    badge === 'blocker' ? 'danger' : badge === 'sponsor' ? 'success' : badge === 'influencer' ? 'primary' : 'outline'
  return (
    <>
      {roleLabel ? (
        <RoleHint role={decisionRole}>
          <Badge variant={badge === 'blocker' ? 'danger' : 'outline'} title={roleHover} className="max-w-full truncate">
            {roleLabel}
          </Badge>
        </RoleHint>
      ) : null}
      {showSales ? (
        <RoleHint role={badge}>
          <Badge variant={roleLabel ? 'outline' : variant} title={roleHover} className="max-w-full truncate">
            {t('focal.salesRole', { role: salesLabel })}
          </Badge>
        </RoleHint>
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Achats — le canal parallèle                                        */
/* ------------------------------------------------------------------ */

/**
 * Les Achats, HORS de la colonne hiérarchique (arbitrage A3).
 *
 * Les ranger sous les opérationnels en ferait un « N-5 fictif » — ce que le
 * FINAL §10 refuse explicitement. Un acheteur ne dépend pas du responsable
 * technique : il intervient à côté, sur le processus. Sa place à l'écran doit
 * dire cela, sinon le commercial le traite comme un relais terrain.
 */
function ProcurementColumn({
  view,
  graph,
  accountId,
  contactIndex,
  crmReady,
  onContactClick,
  selectedId,
  onSelectedChange,
}: {
  view: FocalOrgViewData
  graph: OrgGraph
  accountId?: string
  contactIndex: ContactSlugIndex
  /** #4056.1 — les contacts sont chargés : sans cela, « non retrouvée » serait un faux négatif. */
  crmReady: boolean
  onContactClick?: (contact: Contact) => void
  selectedId?: string | null
  onSelectedChange?: (id: string | null) => void
}) {
  const { t } = useTranslation('accountOrg')
  if (view.procurement.length === 0) return null
  return (
    <Card className="p-4" role="group" aria-label={t('focal.procurementAria')}>
      <div className="flex items-center gap-2">
        <ShoppingCart className="size-4 text-[var(--bellum-text-secondary)]" aria-hidden />
        <Text element="h3" size="base" weight="semibold">
          {t('focal.procurementTitle')}
        </Text>
      </div>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('focal.procurementSubtitle')}
      </Text>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        {view.procurement.map(person => (
          <PersonCard
            key={person.id}
            person={person}
            graph={graph}
            accountId={accountId}
            contact={resolveGraphPersonContact(contactIndex, person)}
            crmMatch={crmReady ? classifyCrmMatch(contactIndex, person) : null}
            onContactClick={onContactClick}
            selected={selectedId === person.id}
            onSelect={onSelectedChange}
          />
        ))}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/*  Le tableau du bas                                                  */
/* ------------------------------------------------------------------ */

/** Combien de contacts le tableau montre avant de renvoyer vers la base entière. */
const TOP_CONTACTS = 10

/**
 * « Top 10 pour agir, tous les contacts pour chercher » (FINAL §8).
 *
 * Le tableau ne doit JAMAIS laisser croire qu'il représente le compte : il
 * annonce donc explicitement combien de contacts il ne montre pas, et le lien
 * vers l'ensemble est à côté du titre, pas caché en bas.
 */
function FocalContactsTable({ view, onViewAllContacts }: { view: FocalOrgViewData; onViewAllContacts?: () => void }) {
  const { t } = useTranslation('accountOrg')
  const shown = view.contacts.slice(0, TOP_CONTACTS)
  if (shown.length === 0) return null
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Text element="h3" size="base" weight="semibold">
          {t('focal.contactsTitle', { count: shown.length })}
        </Text>
        {onViewAllContacts ? (
          <Button size="sm" variant="link" className="ml-auto h-auto p-0" onClick={onViewAllContacts}>
            {view.coverage.discovered === null
              ? t('focal.viewAllContactsUnknownTotal')
              : t('focal.viewAllContacts', { count: view.coverage.discovered })}
          </Button>
        ) : null}
      </div>
      {/* #2588 — un tableau large ne renvoie pas le navigateur en arrière. */}
      <div className={cn('mt-3 w-full overflow-x-auto', HORIZONTAL_OVERSCROLL_CLASS)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--bellum-border)] text-left">
              <Th label={t('import.table.name')} />
              <Th label={t('import.table.role')} />
              <Th label={t('orgMap.filters.entity')} />
              <Th label={t('orgMap.filters.level')} />
              <Th label={t('focal.columnBadge')} />
            </tr>
          </thead>
          <tbody>
            {shown.map(person => (
              <tr
                key={person.id}
                className={cn('border-b border-[var(--bellum-border)]', person.attenuated && 'opacity-60')}
              >
                <td className="py-2 pr-3">
                  <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                    {person.fullName}
                  </Text>
                </td>
                <td className="py-2 pr-3 text-[var(--bellum-text-secondary)]">{person.title ?? '—'}</td>
                <td className="py-2 pr-3 text-[var(--bellum-text-secondary)]">{person.entityName ?? '—'}</td>
                <td className="py-2 pr-3 text-[var(--bellum-text-secondary)]">{person.level ?? '—'}</td>
                <td className="py-2">
                  <DecisionBadge badge={person.badge} decisionRole={person.decisionRole} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Th({ label }: { label: string }) {
  return (
    <th scope="col" className="py-2 pr-3 text-xs font-medium text-[var(--bellum-text-muted)]">
      {label}
    </th>
  )
}
