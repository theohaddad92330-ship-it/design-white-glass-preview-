import { useOpenLauraInPlace } from '@/features/laura/bubble/use-open-laura-in-place'
import type { CommercialLifecycle, SignalFreshnessSummary } from '@bellum/contracts'
import {
  Badge,
  Box,
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TableCell,
  TableRow,
  Text,
} from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import type { ComponentPropsWithoutRef } from 'react'
import { forwardRef, useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/lib/hooks/use-session'
import { capitalize, formatShortDate } from '@bellum/utils'
import { AlertTriangle, MessageCircle, Star } from 'lucide-react'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { formatSignalDate } from '@/lib/signal-date'
import { signalKindIcon } from './signalKind'
import { AccountDecisionCell } from './AccountDecisionCell'
import { AccountInterestCell } from './AccountInterestCell'
import { AccountPeopleCell } from './AccountPeopleCell'
import { AccountNextActionLine, AccountOwnerCell, AccountRelationCell } from './AccountRowCells'
import { useAccountRelaunch } from '@/features/accounts/hooks/useAccountRelaunch'
import { AccountNextActionFlag } from '@/features/accounts/view/hygiene/AccountHygieneNotices'
import { AbsorbAccountDialog } from './AbsorbAccountDialog'
import { AccountMarketContextButton } from './AccountMarketContextButton'
import { AccountIntermediaryFlag } from './AccountIntermediaryFlag'
import { AccountRelaunchBriefFlag } from './AccountRelaunchBriefFlag'
import { AccountRowActionsMenu } from './AccountRowActionsMenu'
import { AccountRowFacts } from './AccountRowFacts'
import { AccountTierFlag } from './AccountTierFlag'
import { AccountShareDialog } from '../account-detail/components/AccountShareDialog'
import { CommercialStatusReasonDialog } from './CommercialStatusReasonDialog'
import { CommercialStatusSubmenu } from './CommercialStatusSubmenu'
import { ACCOUNT_STALE_AFTER_DAYS } from '@bellum/contracts'
import { AccountAssignSubmenu } from './AccountAssignSubmenu'
import { TaskComposer } from '@/features/tasks/view/TaskComposer'
import { useCreateTask } from '@/features/tasks/hooks/useTasks'
import { useSetCommercialStatus } from '@/features/accounts/hooks/useSetCommercialStatus'
import { accountFavoriteLabelKey, buildAccountRowActions, type AccountRowAction } from './accountRowActions'
import { useSetAccountFavorite } from '@/features/accounts/hooks/useSetAccountFavorite'
import { SignalFreshnessLine } from '../account-detail/components/SignalFreshnessLine'
import { SELECT_CELL, SELECT_SLOT } from './selection'
import { lastAnalyzedDate } from '../../model/lastAnalyzed'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import { getRecommendation, getStatusConfig, statusLabelKey, type AccountRow } from './types'
import { useAccessSummary } from './useAccessSummary'
import { useQualificationSummary } from './useQualificationSummary'
import { useAccountRelaunchBrief } from './useAccountRelaunchBrief'

/** Statuses where the row must NOT read as a finished, trustworthy dossier.
 *  `archived` / `deleted` are excluded: they are deliberate user states, not a
 *  failed analysis, and they already have their own affordances. */
const ANALYSIS_INCOMPLETE_STATUSES = new Set(['error', 'analyzing'])

/** Past this age the last analysis is stale enough that the row invites a refresh.
 *  Report V2 §4 « Données à rafraîchir si la dernière analyse est ancienne ». */
// #2150.13 — le seuil vit dans le contrat : le filtre serveur « À actualiser » lit le même.
const STALE_AFTER_DAYS = ACCOUNT_STALE_AFTER_DAYS

/**
 * Couleur de TEXTE de la classe d'accessibilité — jamais une nuance fixe de la
 * gamme primaire ni une classe Tailwind de palette (D79) : les couleurs
 * SÉMANTIQUES passent par leur `*-soft-text`, seule forme qui passe AA dans
 * les deux thèmes. A/B ouvrent (succès), C est intermédiaire (avertissement),
 * D verrouille (danger) — l'inverse d'un score : ici une classe HAUTE est une
 * MAUVAISE nouvelle.
 */
const ACCESS_CLASS_TEXT: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: 'text-[var(--success-soft-text)]',
  B: 'text-[var(--success-soft-text)]',
  C: 'text-[var(--warning-soft-text)]',
  D: 'text-[var(--danger-soft-text)]',
}

/**
 * #3749 — le verdict de la grille se lit VERBATIM (« GO » / « PRUDENT » /
 * « NO-GO »), jamais traduit vers les cinq catégories métier du verdict de
 * SCORE (`namedAccountVerdict`, « AGIR MAINTENANT »…) : ce sont deux jugements
 * différents (la grille de l'espace, pas le score /10), et la fiche compte
 * (`AccountQualificationCard.tsx`) rend déjà `result.verdict` tel quel — un
 * second libellé ici divergerait du premier (GA-26). La COULEUR reprend les
 * jetons déjà tenus par `ACCESS_CLASS_TEXT` juste au-dessus (AA dans les deux
 * thèmes, D79).
 */
const QUALIFICATION_VERDICT_TEXT: Record<'GO' | 'PRUDENT' | 'NO-GO', string> = {
  GO: 'text-[var(--success-soft-text)]',
  PRUDENT: 'text-[var(--warning-soft-text)]',
  'NO-GO': 'text-[var(--danger-soft-text)]',
}

/** Whole days elapsed since `isoDate`, or null when undatable. Pure — no `Date.now`
 *  captured at module load so it re-evaluates per render. */
function daysSince(isoDate: string | null): number | null {
  if (!isoDate) return null
  const then = new Date(isoDate).getTime()
  if (Number.isNaN(then)) return null
  return Math.floor((Date.now() - then) / 86_400_000)
}

type AccountTableRowProps = {
  row: AccountRow
  onDelete: (id: string) => void
  onArchive: (id: string) => void
  isArchiving?: boolean
  /** Le compte fait partie de la sélection en cours (comparaison à deux ou plus). */
  isSelected: boolean
  onSelectionChange: (selected: boolean) => void
}

// Refonte Théo — `.data-table` : une ligne est séparée de la suivante par un filet, pas posée en pastille.
const ROW_CELL =
  'border-b border-[var(--bellum-border)] align-middle transition-colors duration-immediate ease-bellum-out group-hover:bg-[color-mix(in_srgb,var(--bellum-text-accent)_3%,transparent)] group-data-[state=selected]:bg-[color-mix(in_srgb,var(--bellum-text-accent)_7%,transparent)]'
const HOVER_OPEN_DELAY = 500
const HOVER_CLOSE_DELAY = 140

export function AccountTableRow({
  row,
  onDelete,
  onArchive,
  isArchiving = false,
  isSelected,
  onSelectionChange,
}: AccountTableRowProps) {
  const { t } = useTranslation('accounts')
  const navigate = useNavigate()
  // #3749 — même motif que `accessSummaryFailed` ci-dessous : une panne de
  // LECTURE ne doit jamais se lire comme « aucune grille évaluée ».
  const { isError: qualificationSummaryFailed } = useQualificationSummary()
  const { relaunch } = useAccountRelaunch(row)
  const [shareOpen, setShareOpen] = useState(false)
  const [absorbOpen, setAbsorbOpen] = useState(false)
  // #2150.22 — la saisie de la prochaine action, montée à l'ouverture seulement.
  const [nextActionOpen, setNextActionOpen] = useState(false)
  const createTask = useCreateTask()
  const setCommercialStatus = useSetCommercialStatus()
  // #2117.23 — le dialogue de motif vit ICI, HORS des deux menus (clic droit
  // ET « … »), qui se démontent tous deux en se fermant : son état partirait
  // avec eux. Les deux menus remontent leur cible par le MÊME callback.
  const [statusReasonTarget, setStatusReasonTarget] = useState<CommercialLifecycle | null>(null)
  // #2150.14/.18 — l'étoile de ligne : optimiste, retour arrière si l'API échoue.
  const setFavorite = useSetAccountFavorite()
  const statusConfig = getStatusConfig(row.status)
  const StatusIcon = statusConfig.icon
  const analyzedOn = lastAnalyzedDate(row)
  const analyzedAgeDays = daysSince(analyzedOn)
  const isStale = analyzedAgeDays != null && analyzedAgeDays > STALE_AFTER_DAYS
  // « Déjà exploré par un collègue » (restitution V2 §4, doublons §10). On ne
  // badge QUE le compte porté par quelqu'un d'AUTRE : voir son propre nom sur
  // chaque ligne de son portefeuille serait du bruit.
  const { user } = useSession()
  // #3818 — sans objectif renseigné, la pastille ne dit pas « ÉCARTER POUR CET OBJECTIF » (même lecture que la fiche compte).
  const hasObjective = useHasOfferObjective()
  const recommendation = getRecommendation(row.priority_score, { hasObjective })
  // N21 du 30/08 (GA-179) — `row.accessClass` (fusionné par `AccountContent.tsx`)
  // ne distingue PAS « lu, aucune barrière » de « la lecture a échoué » : sur
  // un échec, `AccountContent` renvoie les comptes tels quels et le champ
  // reste juste absent — exactement la même forme qu'un résumé pas encore
  // arrivé. Seul `useAccessSummary().isError` porte cette distinction. Motif
  // repris de la lentille de facturation (`AccountBillingLens.failed`), jamais
  // réinventé : 25 lignes, une requête, la clé de cache est celle de l'espace.
  const { isError: accessSummaryFailed } = useAccessSummary()
  // Manque B du 30/08 — « relancer la prise de brief » : deux opportunités
  // ouvertes, aucune mission signée. Voir `accountRelaunchBrief.ts` pour la
  // condition et pour la dette nommée (calculé côté écran, hors du périmètre
  // strict de ce lot pour devenir un prédicat serveur GA-53).
  const relaunchBrief = useAccountRelaunchBrief()
  // F1-FIX #4345 — sur place (bulle) d'abord ; /chat reste le repli mobile / surcouche.
  const openLauraInPlace = useOpenLauraInPlace()
  const askCopilot = useCallback(() => {
    if (openLauraInPlace) {
      openLauraInPlace('')
      return
    }
    navigate({ to: '/chat', search: { accountId: row.id } })
  }, [navigate, row.id, openLauraInPlace])

  /* LES SEPT GESTES, ÉCRITS UNE FOIS, RENDUS DEUX FOIS.
     Le clic droit ci-dessous et le « … » de fin de ligne lisent la MÊME liste
     (`accountRowActions.ts`) : une huitième action ne peut plus n'atteindre
     qu'une des deux portes. */
  const actions = buildAccountRowActions(
    { status: row.status, isArchiving, commercialStatus: row.commercial_status },
    {
      // #2150.21 — le même aller que le clic de ligne, nommé.
      onOpen: () => navigate({ to: '/accounts/$id', params: { id: row.id } }),
      onShare: () => setShareOpen(true),
      onRelaunch: relaunch,
      onAskCopilot: askCopilot,
      onSetNextAction: () => setNextActionOpen(true),
      // #2150.26 — « En veille » est le statut `watching` qui existe déjà : le
      // compte sort des vues actives, rien n'est supprimé.
      onSleep: () => setCommercialStatus.mutate({ id: row.id, status: 'watching' }),
      onAbsorb: () => setAbsorbOpen(true),
      onArchive: () => onArchive(row.id),
      onDelete: () => onDelete(row.id),
    },
  )

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <TableRow
            onClick={() => navigate({ to: '/accounts/$id', params: { id: row.id } })}
            /* Le fond « ligne retenue » est déjà écrit dans `ROW_CELL`
               (`group-data-[state=selected]`) : sans cet attribut, une ligne
               cochée se lisait exactement comme les autres. */
            data-state={isSelected ? 'selected' : undefined}
            /* `h-16` pins the row: the cell content is now two single-line rows
               whatever the data, so every row is exactly 64px tall. */
            className="group h-16 cursor-pointer border-transparent"
          >
            {/* #1417.2 — `md:w-72` (18rem), la MÊME largeur que l'entête. Elle
                déclarait `md:w-[260px]` quand l'entête disait `md:w-60`
                (240 px) : sans effet sous `table-fixed`, qui prend la largeur
                de la première rangée, mais deux nombres pour une colonne
                finissent toujours par se lire l'un pour l'autre. */}
            <TableCell className={`${ROW_CELL} w-auto py-3 pl-4 md:w-64 md:pl-5`}>
              <div className="flex min-w-0 items-center gap-3">
                {/* La case de sélection — le PRODUCTEUR qui manquait.
                    `SelectionBar` et `CompareDialog` étaient écrits, testés, et
                    injoignables : `selectedIds` ne pouvait jamais grossir.

                    ⚠️ `stopPropagation` : la ligne entière ouvre le dossier.
                    Sans lui, cocher cocherait ET quitterait l'écran — la
                    sélection serait perdue à l'instant même où elle est faite.

                    Elle est TOUJOURS visible, et non révélée au survol comme
                    sur `/contacts` : un survol n'existe pas au doigt, et une
                    commande qu'on ne voit pas est une commande qui n'existe
                    pas — c'est le défaut même que ce rail corrige. */}
                <Box data-slot={SELECT_SLOT} className={SELECT_CELL} onClick={e => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    aria-label={t('table.selectAria', {
                      name: capitalize(row.company_name) || t('table.thisAccount'),
                    })}
                    onCheckedChange={checked => onSelectionChange(checked === true)}
                  />
                </Box>
                {/* #2150.14/.18 — L'ÉTOILE DE LIGNE, RÉTABLIE (revirement assumé de
                    #1800). TOUJOURS visible, `shrink-0` : elle ne dispute jamais la
                    place au nom qui tronque déjà (#1417.2/.4). `stopPropagation` —
                    même raison que la case de sélection juste au-dessus : la ligne
                    entière ouvre le dossier, le clic sur l'étoile ne doit pas le
                    faire aussi.

                    Le nom accessible CHANGE avec l'état (GA-32,
                    `accountFavoriteLabelKey`) : « Ajouter aux favoris » sur une
                    étoile creuse, « Retirer des favoris » sur une étoile pleine —
                    jamais le même libellé dans les deux états. */}
                <button
                  type="button"
                  aria-pressed={row.is_favorite === true}
                  aria-label={t(accountFavoriteLabelKey(row.is_favorite === true))}
                  disabled={setFavorite.isPending}
                  onClick={e => {
                    e.stopPropagation()
                    setFavorite.mutate({ id: row.id, next: !row.is_favorite })
                  }}
                  className="flex shrink-0 items-center justify-center pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                >
                  <Star
                    className={`size-4 ${row.is_favorite ? 'fill-[var(--bellum-text-accent)] text-[var(--bellum-text-accent)]' : 'text-[var(--bellum-text-muted)]'}`}
                    aria-hidden
                  />
                </button>
                {/* #1417.4 — le diagnostic du 09/09 s'était trompé de mesure (il annonçait
                    28px) : la vraie chaîne était `size="md"` → `CompanyAvatar` → `sm`
                    → `entity-avatar` `size-9` = 36px. La cible est 30-32px, donc il
                    fallait RÉDUIRE, pas grossir. `size="sm"` retombe sur le cran `xs`
                    (28px) de `CompanyAvatar` — déjà utilisé tel quel par une dizaine
                    d'autres écrans (SprintBoard, PipelineBoard, OpenNeedsTable…) — sans
                    toucher `entity-avatar.tsx`, dont changer un cran affecterait TOUS
                    ses consommateurs, pas seulement cette ligne. */}
                <CompanyAvatar name={row.company_name} size="sm" logoUrl={row.logo_url} website={row.website} />
                <div className="min-w-0 flex-1">
                  {/* Line 1 — identity. The name yields (truncates) and the status
                      badge does not: `shrink-0` + `whitespace-nowrap`. The badge was
                      previously an unconstrained flex child sharing a ~180px line with
                      the sector chip, so "En cours" broke into "En" / "cours" and the
                      taller pill overflowed the row box. */}
                  <div className="flex min-w-0 items-center gap-2">
                    {/* #2719.2 — LA LIGNE NAVIGUAIT PAR `onClick` + `navigate()`
                        SUR LE `TableRow` : ni clic droit, ni ctrl/cmd-clic, ni
                        clic molette ne fonctionnaient (même défaut que
                        `ContactTableRow.tsx` avant #2719). Le nom porte
                        désormais un vrai `<Link>` — le seul geste natif du
                        navigateur qui rend ces trois clics possibles sans rien
                        coder pour eux. `stopPropagation` : le `onClick` du
                        `TableRow` reste (clic simple ailleurs sur la ligne),
                        et ne doit pas naviguer une seconde fois quand c'est ce
                        lien qui vient de le faire. */}
                    {/* #3666.b (recette prod 09/10) — « DECATHLON » (9 caractères) tronqué
                        en « DECAT… » : `min-w-0 flex-1` laissait le nom descendre à la
                        largeur que lui laissaient ses voisins `shrink-0` (statut, badge
                        intermédiaire, icône marché) — jusqu'à quelques caractères sur une
                        ligne chargée. Une largeur PLANCHER (`min-w-[7rem]`, ~10-11
                        caractères à cette taille) fait céder ces voisins avant le nom. */}
                    <Link
                      to="/accounts/$id"
                      params={{ id: row.id }}
                      onClick={e => e.stopPropagation()}
                      className="min-w-[7rem] flex-1"
                    >
                      {/* #3666.c — « THALES COMMUNICATION & SECURITE… » coupé à 174 px sur
                          381 px disponibles : le nom prend la largeur dont il dispose, sur
                          2 lignes au plus, et l'infobulle porte le nom COMPLET. */}
                      <Text
                        element="span"
                        size="sm"
                        weight="semibold"
                        title={capitalize(row.company_name)}
                        className="line-clamp-2 break-words text-[var(--bellum-text-primary)] hover:underline underline-offset-2"
                      >
                        {capitalize(row.company_name)}
                      </Text>
                    </Link>
                    {/* An account whose analysis failed (or is still running) used to
                        render EXACTLY like a finished one — same score, same signal,
                        same "open dossier" — so the user read a stale or partial
                        dossier believing it was a completed analysis. The status is
                        already modelled (STATUS_CONFIG / status.* i18n); the list
                        simply never showed it. The score stays visible on purpose:
                        it can come from an earlier successful run, and hiding real
                        data would trade one lie for another — the badge says the
                        latest analysis did not complete. */}
                    {ANALYSIS_INCOMPLETE_STATUSES.has(row.status) && (
                      <Badge
                        data-testid="account-status-badge"
                        className={`shrink-0 gap-1 whitespace-nowrap border-0 px-1.5 py-0 text-xs leading-4 ${statusConfig.bg} ${statusConfig.text}`}
                      >
                        <StatusIcon className="size-2.5 shrink-0" aria-hidden />
                        {t(statusLabelKey(row.status))}
                      </Badge>
                    )}
                    {/* #2265.14 (épopée #2851) — « jamais un intermédiaire présenté
                        comme client final sans badge ». Même jugement que /discover
                        (`classify_actor_type`), persisté sur `accounts.is_intermediary`
                        à la recherche Phase 1. `null`/absent (compte jamais rejoué) ⇒
                        rien — pas un badge deviné. */}
                    {row.is_intermediary === true && (
                      <Badge
                        data-testid="account-intermediary-badge"
                        className="shrink-0 gap-1 whitespace-nowrap border-0 px-1.5 py-0 text-xs leading-4"
                        style={{ background: 'var(--warning-soft-bg)', color: 'var(--warning-soft-text)' }}
                      >
                        <AlertTriangle className="size-2.5 shrink-0" aria-hidden />
                        {t('table.intermediaryBadge')}
                      </Badge>
                    )}
                    {/* #1582 — LE CONTEXTE MARCHÉ, DERRIÈRE UNE ICÔNE, SUR LA
                        LIGNE 1.

                        C'est le geste qui débloque #1417, #1577 ET #1582 : la
                        ligne 2 est saturée à 4,3× (159 px rendus pour 679
                        requis, mesuré en production le 06/09/2026), et un
                        popover ne consomme AUCUNE largeur. Des trois formes
                        proposées, c'est la seule qui n'aggrave pas la
                        saturation — et c'est celle que #1582 demande.

                        Ici et pas sur la ligne 2, où le fragment de #1577
                        s'affichait dans 7 px : `shrink-0` sur la ligne 1 fait
                        céder le NOM, qui tronque déjà proprement, au lieu
                        d'écraser un secteur qui manque déjà de place.

                        Il ne se rend que sur un compte COUVERT — l'absence de
                        `market_paths_observed` suffit, aucune condition n'est
                        recopiée ici. */}
                    <AccountMarketContextButton
                      accountId={row.id}
                      companyName={row.company_name}
                      pathsObserved={row.market_paths_observed}
                    />
                  </div>
                  {/* Line 2 — sector. Was a grey Badge that wrapped to as many lines
                      as the NAF label needed (EDF: 3), tripling the row height. It is
                      now a single truncated caption; the full label stays reachable
                      through the native `title` tooltip. Dropping the chip also leaves
                      the status badge as the only pill in the cell, so it reads as a
                      state rather than as one more tag. */}
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    {/* « Compte suivi sans prochaine action », descendu SUR LA
                        LIGNE. Le cockpit sait qu'ils sont sept ; il ne dit pas
                        lesquels, et c'est devant cette ligne-là que le geste se
                        fait. La pastille ne parle que si le serveur désigne CE
                        compte — rien n'est recalculé ici (GA-53), et elle se
                        tait aussi bien sur un compte tenu que sur une lecture
                        qui n'a pas abouti : cinquante « non mesuré » alignés ne
                        se lisent plus. Ce que la lecture ratée doit dire se dit
                        UNE fois, au-dessus de la liste.

                        Sur la LIGNE 2 et non dans la colonne « Prochaine
                        action » : cette colonne est masquée sous 768 px, et le
                        mobile est le produit, pas un repli. */}
                    <AccountNextActionFlag accountId={row.id} />
                    {/* Manque B du 30/08 — « relancer la prise de brief » :
                        deux opportunités ouvertes, aucune mission signée.
                        Même raison de LIGNE que la pastille juste au-dessus :
                        la colonne « Prochaine action » est masquée sous
                        768 px, ET une phrase de cette longueur y déborderait
                        (160 px déclarés contre ~200 px de texte + icône). */}
                    <AccountRelaunchBriefFlag
                      accountId={row.id}
                      companyName={row.company_name}
                      shouldRelaunch={relaunchBrief.shouldRelaunch(row.id)}
                    />
                    {/* #2265.14 (épopée #2851) — le badge « intermédiaire »,
                        étendu hors /discover : même dérivation
                        (`isIntermediaryActor`, GA-26), même ligne que les
                        autres pastilles de compte, rien sur la majorité des
                        lignes (NAF absent ou non concerné). */}
                    <AccountTierFlag tags={row.tags} />
                    <AccountIntermediaryFlag
                      nafCode={row.naf_code}
                      companyName={row.company_name}
                      isDeclaredPartner={row.is_declared_partner}
                    />
                    {/* La lentille delivery : QUI reçoit la facture, sous le
                        nom du compte — là où la maquette la met, parce que la
                        raison sociale QUALIFIE le compte, elle ne se compare
                        pas d'une ligne à l'autre. */}
                    {/* #1417.1 / #1417.7 — LE SECTEUR RESTE, L'ADMINISTRATIF SE
                        REPLIE DERRIÈRE LUI.

                        Trois textes se partageaient cette ligne — le secteur,
                        l'effectif, et (jusqu'à #1577) les parcours. Mesuré en
                        production le 06/09/2026 : 159 px rendus pour 561 px de
                        besoin AVANT même le troisième. Deux `flex-auto` qui se
                        partagent une largeur qui manque déjà à un seul sont
                        DEUX textes tronqués, pas un compromis.

                        Il n'en reste qu'UN : le secteur lisible. Le libellé NAF
                        entier — qui vivait dans un `title=`, donc nulle part au
                        clavier ni au doigt —, la tranche d'effectif et l'étape
                        du pipe se lisent d'un clic, au clavier comme à la
                        souris (`AccountRowFacts`).

                        ⚠️ Ce qui QUALIFIE un chiffre ne se replie pas : la date
                        de dernière analyse et « À rafraîchir » restent dans le
                        flux, plus bas — c'est ce qui dit si le score et le
                        signal peuvent être périmés. Garde :
                        `accountRowFoldsOnlyAdministrativeFacts.test.ts`. */}
                    <AccountRowFacts
                      companyName={row.company_name}
                      sector={row.sector}
                      headquarters={row.headquarters}
                      employees={row.employees}
                      commercialStatus={row.commercial_status}
                      sprint={row.sprint}
                      sprintReason={row.sprint_reason}
                      sprintReviewAt={row.sprint_review_at}
                      lastActionAt={row.last_action_at}
                    />
                    {/* #1417 — L'EFFECTIF A QUITTÉ SA COLONNE LE 06/09, PUIS LE
                        FLUX DE CETTE LIGNE LE 11/09. Il se lit dans
                        `AccountRowFacts`, juste au-dessus.

                        Le 06/09 il était descendu ICI, avec le secteur : une
                        tranche INSEE ne se compare pas d'une ligne à l'autre,
                        elle QUALIFIE le compte. La mesure du même jour a montré
                        que la place n'existait pas — 29 px rendus pour 138
                        requis, à côté d'un secteur lui-même à 89 pour 423. Deux
                        textes tronqués valent moins qu'un texte lisible et une
                        porte : « les informations secondaires passent en
                        tooltip/drawer » est exactement ce que le retour demande.

                        ⚠️ Absent ⇒ RIEN, jamais « 0 » : un effectif inconnu
                        n'est pas une entreprise sans salarié. La règle vit
                        maintenant dans `AccountRowFacts`, et un test la tient.

                        ⚠️ #1623 — `shrink-0 truncate` NE TRONQUE RIEN.
                        `truncate` borne un élément à la largeur qu'on lui
                        donne ; `shrink-0` lui interdit précisément d'en
                        recevoir une plus petite que son contenu. Les deux
                        ensemble disent « ne dépasse pas de la place que tu
                        prends », ce qui est toujours vrai et ne borne rien.
                        Et un `<td>` de `table-fixed` ne clippe pas : ce qui
                        dépasse se PEINT par-dessus la colonne voisine.

                        Mesuré en production le 06/09/2026, sur les 25 lignes
                        de la première page : **20 débordaient**, la pire
                        (TOTAL, dont l'effectif est une PHRASE — « 0 salarié
                        déclaré pour TOTAL (année 2026). L'effectif… ») de
                        547 px, c'est-à-dire par-dessus le score, la classe
                        d'accès, le statut ET la date. C'est le « score, texte
                        se superpose, illisible » du retour.

                        Un défaut de POPULATION : chaque ligne est juste prise
                        seule, et rien dans le rendu d'UNE ligne ne pouvait le
                        montrer. */}
                    {/* #1577 — LE FRAGMENT « N parcours observés » N'EST PAS SUR CETTE
                        LIGNE, ET C'EST UNE MESURE QUI L'A DÉCIDÉ.

                        Il y a été posé, livré, puis retiré après recette en
                        production le 06/09/2026. Ce que la mesure a montré sur
                        `/accounts`, à 1 456 px, les 15 comptes couverts :

                          largeur de cette ligne .................. 159 px
                          besoin cumulé de ses enfants ........... 679 px  (4,3×)
                            · secteur ......... 89 px rendus / 423 px requis
                            · effectif ........ 29 px rendus / 138 px requis
                            · parcours ........ 25 px rendus / 118 px requis

                        « 64 parcours observés » s'affichait dans 7 px. Le
                        fragment était donc RENDU et ILLISIBLE — il occupait de
                        la largeur sans rien dire, et volait le tiers d'une
                        ligne déjà saturée.

                        ⚠️ LA SATURATION EST ANTÉRIEURE : sans le fragment, le
                        secteur et l'effectif demandaient déjà 561 px pour 159.
                        Le retour #1577 dit « le fragment saute si la largeur
                        manque — le secteur prime » : ici la largeur manque
                        TOUJOURS, donc il saute toujours, et le rendre était une
                        façon compliquée de ne rien afficher.

                        `hidden lg:inline` ne suffisait pas : il commande la
                        VISIBILITÉ, pas le rétrécissement. Un enfant `flex-auto`
                        visible se fait écraser par ses voisins quelle que soit
                        la borne à laquelle on l'affiche.

                        ⚠️ #1582 — LE FRAGMENT A TROUVÉ SA PLACE, ET CE N'EST
                        PAS UNE LIGNE. Il vit dans le popover « Contexte
                        marché », déclenché par l'icône de la LIGNE 1 : un
                        popover ne consomme aucune largeur, donc il ne
                        redemande rien à une ligne qui n'a rien à donner. Un
                        geste a réglé #1417, #1577 et #1582 ensemble.

                        (Il vivait aussi sur `AccountCard.tsx`. Cette carte
                        n'avait AUCUN importeur — `AccountContent` ne rend que
                        le tableau ou la liste de facturation — donc elle
                        n'était visible nulle part ; elle a été retirée avec ce
                        lot plutôt que de continuer à absorber du travail.)

                        La donnée, elle, voyage : `market_paths_observed` est
                        sur la ligne, mesuré en production (15 comptes couverts
                        sur 25), et c'est lui qui décide si l'icône se rend. */}
                    {/* #3407 — le niveau d'effort n'est PLUS un badge ici : second
                        enfant `shrink-0` de cette ligne, il écrasait le secteur à
                        0 px (recette du 30/09, SNCF/BlaBlaCar/Société Générale).
                        Il se lit en préfixe du secteur et dans le repli
                        `AccountRowFacts`, avec la raison, la revue, la dernière et
                        la prochaine action. */}
                  </div>
                </div>
              </div>
            </TableCell>

            {/* Refonte Théo — « Sujet & prochaine action » : le signal dominant (son déclencheur et sa
                fraîcheur, inchangés) puis la prochaine action écrite, en lien vers le dossier. Ex-colonnes
                « Signal dominant » et « Prochaine action » de notre maquette, réunies comme chez Théo. */}
            <TableCell className={`${ROW_CELL} hidden w-64 max-w-64 overflow-hidden py-3 md:table-cell`}>
              {row.primary_signal ? <SignalPreview row={row} /> : null}
              <AccountNextActionLine
                accountId={row.id}
                label={row.next_action_label}
                horizon={row.next_action_horizon}
              />
            </TableCell>

            {/* Refonte Théo — « Relation » : À ouvrir · En ouverture · Client (+ état secondaire), un clic
                ouvre « Déplacer vers ». Dessous, hors maquette et GARDÉE : la classe d'accessibilité (A-D),
                FUSIONNÉE côté client (`AccountContent.tsx` via `useAccessSummary`) — la cellule ne fait que
                LIRE `row.accessClass`. N21 du 30/08 (GA-179) : TROIS états, la panne de lecture
                (`accessSummaryFailed`) passe en premier et se nomme, jamais « aucune accessibilité ». */}
            <TableCell className={`${ROW_CELL} hidden w-32 overflow-hidden py-3 md:table-cell`}>
              <AccountRelationCell
                accountId={row.id}
                companyName={capitalize(row.company_name)}
                commercialStatus={row.commercial_status}
                onRequestStatusReason={setStatusReasonTarget}
              />
              <div className="mt-1">
                {accessSummaryFailed ? (
                  <Text
                    element="span"
                    size="xs"
                    className="text-[var(--bellum-text-muted)]"
                    title={t('list.accessClassFailed')}
                    aria-label={t('list.accessClassFailed')}
                  >
                    {t('list.accessClassFailedShort')}
                  </Text>
                ) : row.accessClass ? (
                  <Badge
                    variant="secondary"
                    title={t('table.accessClass')}
                    className={`gap-1 border-0 px-1.5 py-0 text-xs leading-4 ${ACCESS_CLASS_TEXT[row.accessClass]}`}
                  >
                    {/* #4659 — le Badge est `inline-flex` : un `{' '}` entre la lettre et le libellé y est un nœud
                        texte supprimé (« AOuvert » en prod). Deux éléments, l'écart est le `gap-1`. */}
                    <span data-testid="access-class-letter" className="font-semibold">
                      {row.accessClass}
                    </span>
                    <span>{t(`list.accessClass.${row.accessClass}`, row.accessClass)}</span>
                  </Badge>
                ) : (
                  <Text
                    element="span"
                    size="sm"
                    className="text-[var(--bellum-text-muted)]"
                    title={t('list.accessClassUnknown')}
                    aria-label={t('list.accessClassUnknown')}
                  >
                    -
                  </Text>
                )}
              </div>
            </TableCell>

            {/* Refonte Théo — « Personnes » : les visages du compte et le badge Décideur. */}
            <TableCell className={`${ROW_CELL} hidden w-28 py-3 md:table-cell`}>
              <AccountPeopleCell accountId={row.id} people={row.people} />
            </TableCell>

            {/* Refonte Théo — « Responsable » : qui porte le compte, un clic ouvre « Attribuer ». */}
            <TableCell className={`${ROW_CELL} hidden w-28 py-3 md:table-cell`}>
              <AccountOwnerCell
                accountId={row.id}
                companyName={capitalize(row.company_name)}
                owner={row.owner}
                isMine={row.owner != null && row.owner.user_id === user?.id}
              />
            </TableCell>

            {/* Refonte Théo — la colonne « Intérêt » de Théo devient la DÉCISION D'ÉQUIPE et le VERDICT,
                EN MOTS (Louis : aucun nombre). Dessous, ce qui QUALIFIE ce verdict reste dans le flux de la
                ligne : le verdict de la grille de qualification (#3749, mêmes trois états que l'accessibilité,
                `qualificationSummaryFailed`) et la date de dernière analyse avec « À rafraîchir » (> 90 j). */}
            <TableCell className={`${ROW_CELL} w-40 min-w-40 overflow-hidden py-3`}>
              {/* #4497 (V22) — l'« Intérêt » : le score et son échelle, ses axes au clic ; dessous, GARDÉS, la
                  décision de l'équipe et le verdict en mots (ex-colonne « Décision »). */}
              <div className="flex flex-col items-start gap-1">
                <AccountInterestCell row={row} />
                <AccountDecisionCell row={row} recommendation={recommendation} className="items-start text-left" />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                {qualificationSummaryFailed ? (
                  <Text
                    element="span"
                    size="xs"
                    className="text-[var(--bellum-text-muted)]"
                    title={t('list.qualificationVerdictFailed')}
                    aria-label={t('list.qualificationVerdictFailed')}
                  >
                    {t('list.qualificationVerdictFailedShort')}
                  </Text>
                ) : row.qualificationVerdict ? (
                  <Text
                    element="span"
                    size="xs"
                    weight="semibold"
                    title={t('table.qualificationVerdict')}
                    className={`tracking-wide ${QUALIFICATION_VERDICT_TEXT[row.qualificationVerdict]}`}
                  >
                    {row.qualificationVerdict}
                  </Text>
                ) : (
                  <Text
                    element="span"
                    size="xs"
                    className="text-[var(--bellum-text-muted)]"
                    title={t('list.qualificationVerdictUnknown')}
                    aria-label={t('list.qualificationVerdictUnknown')}
                  >
                    {t('list.qualificationVerdictUnknown')}
                  </Text>
                )}
                <Text
                  element="span"
                  size="xs"
                  className="truncate text-[var(--bellum-text-muted)] tabular-nums"
                  title={t('table.lastAnalysis')}
                >
                  {analyzedOn ? formatShortDate(new Date(analyzedOn)) : null}
                </Text>
                {isStale && (
                  <Badge
                    data-testid="account-stale-badge"
                    title={t('list.staleTooltip', { days: STALE_AFTER_DAYS })}
                    className="w-fit shrink-0 gap-1 whitespace-nowrap border-0 bg-[color-mix(in_srgb,var(--bellum-warning-text)_14%,transparent)] px-1.5 py-0 text-xs leading-4 text-[var(--warning-soft-text)]"
                  >
                    {t('list.staleBadge')}
                  </Badge>
                )}
              </div>
            </TableCell>

            {/* §1.2 colonne 16 — LE KEBAB, seule cellule visible sous 768 px avec le compte et la décision.
                « Demander au Copilote » (restitution V2 §4) reste à côté, icône seule : un commercial ne
                fait pas de clic droit, et l'action n'existait qu'au menu contextuel. « Ouvrir le dossier »
                est le clic de la ligne et du nom, et l'entrée « Ouvrir » du menu. */}
            <TableCell className={`${ROW_CELL} w-20 py-0 pl-0 pr-4 text-right`}>
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  title={t('list.askCopilot')}
                  aria-label={t('list.askCopilot')}
                  onClick={e => {
                    e.stopPropagation()
                    askCopilot()
                  }}
                  className="hidden size-8 shrink-0 items-center justify-center rounded-control text-[var(--bellum-text-muted)] transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-accent)] md:flex"
                >
                  <MessageCircle className="size-4" aria-hidden />
                </button>
                <AccountRowActionsMenu
                  actions={actions}
                  accountId={row.id}
                  commercialStatus={row.commercial_status}
                  ownerId={row.owner?.user_id}
                  onRequestStatusReason={setStatusReasonTarget}
                />
              </div>
            </TableCell>
          </TableRow>
        </ContextMenuTrigger>

        {/* Le clic droit est CONSERVÉ : on ajoute une porte, on n'en ferme pas.
            Il rend désormais la même liste que le « … » de fin de ligne. */}
        <ContextMenuContent className="w-64 rounded-lg border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-1.5 text-[var(--bellum-text-primary)] shadow-md">
          {actions.map(action => (
            <ContextRowAction
              key={action.key}
              action={action}
              row={row}
              onRequestStatusReason={setStatusReasonTarget}
            />
          ))}
        </ContextMenuContent>
      </ContextMenu>

      <AbsorbAccountDialog
        accountId={row.id}
        companyName={row.company_name}
        open={absorbOpen}
        onOpenChange={setAbsorbOpen}
      />

      {/* #2150.22 — la prochaine action EST une tâche datée du compte : le même
          compositeur que l'onglet Tâches du dossier, jamais un champ de plus. */}
      {nextActionOpen ? (
        <TaskComposer
          open
          onOpenChange={setNextActionOpen}
          isPending={createTask.isPending}
          onSubmit={draft =>
            createTask.mutate({ ...draft, accountId: row.id }, { onSuccess: () => setNextActionOpen(false) })
          }
        />
      ) : null}

      <AccountShareDialog
        accountId={row.id}
        companyName={row.company_name}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />

      <CommercialStatusReasonDialog
        accountId={row.id}
        target={statusReasonTarget}
        onClose={() => setStatusReasonTarget(null)}
      />
    </>
  )
}

/**
 * Une entrée du menu au CLIC DROIT.
 *
 * Le jumeau exact de `AccountRowActionsMenu` — mêmes entrées, même ordre, mêmes
 * libellés — sur les primitives `ContextMenu*`, que Radix n'interchange pas avec
 * `DropdownMenu*`. Ce qui ne se dédouble pas est la LISTE : les deux lisent
 * `buildAccountRowActions`.
 */
function ContextRowAction({
  action,
  row,
  onRequestStatusReason,
}: {
  action: AccountRowAction
  row: AccountRow
  onRequestStatusReason: (status: CommercialLifecycle) => void
}) {
  const { t } = useTranslation('accounts')
  const Icon = action.icon
  return (
    <>
      {action.separatorBefore && <ContextMenuSeparator className="my-1 bg-[var(--bellum-border)]" />}
      {action.kind === 'submenu' && action.key === 'assign' ? (
        <AccountAssignSubmenu accountId={row.id} currentOwnerId={row.owner?.user_id} />
      ) : action.kind === 'submenu' ? (
        <CommercialStatusSubmenu
          accountId={row.id}
          current={row.commercial_status}
          onRequestReason={onRequestStatusReason}
        />
      ) : (
        <ContextMenuItem
          disabled={action.disabled}
          variant={action.destructive ? 'destructive' : 'default'}
          onSelect={action.run}
          className={
            action.destructive
              ? 'rounded-lg px-2.5 py-2 text-sm focus:bg-[color-mix(in_srgb,var(--bellum-danger)_10%,transparent)]'
              : 'rounded-lg px-2.5 py-2 text-sm focus:bg-[var(--bellum-surface-2)] focus:text-[var(--bellum-text-primary)]'
          }
        >
          <Icon className={action.destructive ? 'size-4' : 'size-4 text-[var(--bellum-text-primary)]'} aria-hidden />
          {/* i18n keys: common:actions.share | list.relaunch | list.askCopilot |
              absorb.menuItem | list.archiveAccount | list.archiving | list.deleteAccount |
              list.openDossier | list.setNextAction | list.sleep */}
          {t(action.labelKey)}
        </ContextMenuItem>
      )}
    </>
  )
}

function SignalPreview({ row }: { row: AccountRow }) {
  const { t } = useTranslation('accounts')
  const preview = row.signal_preview
  const primarySignal = row.primary_signal
  const [open, setOpen] = useState(false)
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelOpen = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
  }, [])

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    cancelOpen()
    cancelClose()
    closeTimerRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY)
  }, [cancelClose, cancelOpen])

  const handleOpen = useCallback(() => {
    cancelOpen()
    cancelClose()
    openTimerRef.current = setTimeout(() => setOpen(true), HOVER_OPEN_DELAY)
  }, [cancelClose, cancelOpen])

  if (!primarySignal) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* #1416 — LE DÉCLENCHEUR EST LE BOUTON, plus un `<div>` qui l'enveloppe.
          Avant : `PopoverTrigger asChild` posait ses gestes sur le `<div>`, et
          le bouton qu'il contenait appelait `event.stopPropagation()` — donc le
          clic n'atteignait jamais le geste de Radix. Il coupait la navigation
          de la ligne SANS rien ouvrir : seul un survol de 500 ms montrait
          l'aperçu, et au clavier il n'y avait aucun moyen de l'ouvrir.
          `stopPropagation` reste (la ligne ne doit pas naviguer) mais ne
          `preventDefault` pas : Radix compose et ouvre. */}
      <PopoverTrigger asChild>
        <SignalPreviewTrigger
          signal={primarySignal}
          signalType={preview?.type}
          signalDate={preview?.date}
          signalFreshness={preview?.freshness}
          label={t('table.primarySignalOpen', { company: row.company_name })}
          onMouseEnter={handleOpen}
          onMouseLeave={scheduleClose}
          onFocus={handleOpen}
          onBlur={scheduleClose}
          onClick={event => event.stopPropagation()}
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={10}
        onClick={event => event.stopPropagation()}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        onOpenAutoFocus={event => event.preventDefault()}
        className="w-[320px] rounded-xl border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-0 shadow-[var(--shadow-elevated)]"
      >
        <SignalPreviewCard
          companyName={row.company_name}
          label={preview?.label ?? primarySignal}
          type={preview?.type}
          source={preview?.source}
          date={preview?.date}
          freshness={row.signal_freshness}
          cadence={row.watch_cadence}
        />
      </PopoverContent>
    </Popover>
  )
}

type SignalPreviewTriggerProps = ComponentPropsWithoutRef<'button'> & {
  signal: string
  /** #1416 — le TYPE tel que l'analyse l'a écrit (texte libre du modèle). Il ne
   *  s'affiche pas : il choisit l'icône, via `signalKindIcon`. */
  signalType?: string | null
  /** #1416 — la fraîcheur, dans la précision que la SOURCE portait. */
  signalDate?: string | null
  /** #3682.2 — `archive` : le fait est ancien, la ligne le dit (« Contexte
   *  historique ») au lieu de le laisser passer pour une actualité. */
  signalFreshness?: 'current' | 'archive' | 'undated' | null
  /** Le nom accessible : il dit le GESTE (GA-32), le signal reste visible. */
  label: string
}

/**
 * #1416 — le déclencheur de l'aperçu du signal.
 *
 * ⚠️ Il transfère sa `ref` : `PopoverTrigger asChild` la pose sur son enfant
 * pour ancrer le panneau et lui rendre le focus à la fermeture. Sans ce
 * transfert, Radix ne trouve pas d'élément et le panneau s'ouvre au coin de
 * l'écran.
 */
const SignalPreviewTrigger = forwardRef<HTMLButtonElement, SignalPreviewTriggerProps>(function SignalPreviewTrigger(
  { signal, signalType, signalDate, signalFreshness, label, ...props },
  ref,
) {
  /* #1416 — « icône / type du signal » : l'éclair était le même pour un
     recrutement, une levée et une nomination. `signalKindIcon` reconnaît les
     neuf types que le prompt demande au modèle et RETOMBE sur l'éclair pour
     tout le reste — un type inconnu ne se range pas dans le type le plus
     proche, ce serait lui donner une urgence que personne n'a mesurée. */
  const Icon = signalKindIcon(signalType)
  /* #1416 — « fraîcheur ». Le « il y a 2 j » n'existait QUE dans l'aperçu au
     survol : sur la ligne, rien ne disait si le signal datait d'hier ou de
     mars. `formatSignalDate` rend la date à la précision que la SOURCE portait
     (« 2021 » reste « 2021 », jamais « 1 janv. 2021 »), et « non daté » quand
     elle n'en portait aucune — jamais une date devinée. */
  const freshness = signalDate ? formatSignalDate(signalDate) : null
  const { t } = useTranslation('accounts')
  const historical = signalFreshness === 'archive'
  return (
    <button
      {...props}
      ref={ref}
      type="button"
      aria-label={label}
      title={signal}
      /* `-mx-2` cancels the button's own `px-2` so the label starts at the cell's
         padding edge — under the "Signal dominant" header — while the hover
         background keeps its breathing room. Same trick `SortableTableHead`
         already uses on the header side. */
      className="-mx-2 flex h-auto w-full min-w-0 max-w-[192px] items-center justify-start gap-1.5 overflow-hidden rounded-sm px-2 py-1 text-left hover:bg-[var(--bellum-surface-2)]"
    >
      <Icon className="size-3 shrink-0 text-[var(--warning-soft-text)] mr-1" aria-hidden />
      {/* Deux lignes courtes, dans une cellule BORNÉE (`w-48 max-w-48
          overflow-hidden`, #1412) : la ligne du tableau garde ses 64 px, la
          pile ne la fait pas grandir. */}
      <span className="min-w-0 flex-1 overflow-hidden text-left">
        <span className="block truncate font-medium text-xs text-[var(--bellum-text-secondary)]">{signal}</span>
        {freshness || historical ? (
          <span className="block truncate text-xs text-[var(--bellum-text-muted)] tabular-nums">
            {historical ? <span>{t('table.historicalContext')}</span> : null}
            {historical && freshness ? ' · ' : null}
            {freshness}
          </span>
        ) : null}
      </span>
    </button>
  )
})

type SignalPreviewCardProps = {
  companyName: string
  label: string
  type?: string | null
  source?: string | null
  date?: string | null
  /** #3682.3 — dernière vérification et dernier événement utile, séparés. */
  freshness?: SignalFreshnessSummary
  cadence?: 'daily' | null
}

function SignalPreviewCard({ companyName, label, type, source, date, freshness, cadence }: SignalPreviewCardProps) {
  return (
    <div className="space-y-4 p-4">
      {/* #1416 — la MÊME icône que la ligne. Deux glyphes différents pour un
          seul signal se lisent comme deux signaux. */}
      <SignalPreviewHeader companyName={companyName} type={type} />
      <Text element="p" size="sm" className="text-[var(--bellum-text-primary)]">
        {label}
      </Text>
      <SignalPreviewMeta type={type} source={source} date={date} />
      {freshness ? <SignalFreshnessLine summary={freshness} cadence={cadence} /> : null}
    </div>
  )
}

function SignalPreviewHeader({ companyName, type }: { companyName: string; type?: string | null }) {
  const { t } = useTranslation('accounts')
  const Icon = signalKindIcon(type)
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-8 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--bellum-warning-text)_14%,transparent)]">
        <Icon className="size-4 text-[var(--warning-soft-text)]" aria-hidden />
      </div>
      <div className="min-w-0">
        <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('list.signalDetected')}
        </Text>
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {capitalize(companyName)}
        </Text>
      </div>
    </div>
  )
}

function SignalPreviewMeta({
  type,
  source,
  date,
}: {
  type?: string | null
  source?: string | null
  date?: string | null
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SignalPreviewBadge value={type} />
      <SignalPreviewBadge value={source} />
      <SignalPreviewBadge value={date ? formatSignalDate(date) : null} />
    </div>
  )
}

function SignalPreviewBadge({ value }: { value?: string | null }) {
  if (!value) return null
  return (
    <Badge className="border-0 bg-[var(--bellum-surface-2)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]">
      {value}
    </Badge>
  )
}
