import type { OpenNeedRow, ProjectNeedStatus } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  HORIZONTAL_OVERSCROLL_CLASS,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  cn,
} from '@bellum/ui'
import { daysInStatus, needNextAction, needStatusTag, needTheoStatus, normaliseNeedStatus } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { NeedRowMenu } from './NeedRowMenu'
import { needMatcherCanLaunch, needMatcherLaunchTooltip } from '../model/need-matcher-gate-label'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { NeedSourceLink } from './NeedSourceLink'
import { NextAction } from '@/components/primitives/NextAction'
import { Link } from '@tanstack/react-router'
import { formatCents } from '@/lib/money'
import { formatDate } from '@/lib/locale'

const HEAD = 'text-xs font-medium text-[var(--bellum-text-muted)] whitespace-nowrap'
const CELL = 'py-2 align-middle'

/** Quatre chips au maximum : au-delà, la colonne mange l'écran et plus personne
 *  ne lit la première. Le reste se compte, il ne se tronque pas en silence. */
const MAX_SKILL_CHIPS = 4

/**
 * La teinte du badge de la colonne « Phase », par état du besoin.
 *
 * Elle empruntait `variant="outline"` pour les quatorze états : un besoin
 * GAGNÉ et un besoin bloqué en qualification depuis trois semaines rendaient
 * EXACTEMENT le même badge gris. La couleur est justement ce qui permet de
 * repérer d'un coup d'œil ce qui avance de ce qui attend, sans lire chaque
 * libellé — c'est même la question à laquelle répond la colonne voisine
 * (« Âge dans l'étape »).
 *
 * Le vocabulaire est celui de `STAGE_VARIANT` (`features/projects/model/
 * project-index.ts`), qui tranche déjà la même question pour les CINQ étapes
 * du pipe des PROJETS — une seule échelle de tons pour tout le produit, plutôt
 * qu'une deuxième qui finirait par diverger :
 *
 *  · `default` — pas encore engagé, ou clos SANS éclat.
 *  · `primary` — un travail actif, en cours.
 *  · `warning` — n'avance plus, ou revient sur une décision : appelle un geste.
 *  · `success` — gagné.
 *
 * TOTALE sur les quatorze états, comme `FOOT_FAMILY` (`need-card-foot.ts`) : un
 * état ajouté demain ne compile pas tant que personne n'a choisi sa teinte.
 *
 * `lost` et `cancelled` restent NEUTRES (`default`), comme `STAGE_VARIANT.lost` :
 * une perte assumée n'a pas à crier sur l'écran, et un besoin annulé par l'ESN
 * n'est pas un échec du recruteur. Les deux valeurs héritées (`open`, `staffed`)
 * reprennent la teinte de leur remplaçant (`to_qualify`, `won`).
 */
const THEO_STATUS_VARIANT: Record<ReturnType<typeof needTheoStatus>, 'default' | 'primary' | 'success'> = {
  to_qualify: 'default',
  open: 'primary',
  covered: 'success',
  closed: 'default',
}

const NEED_STATUS_VARIANT: Record<ProjectNeedStatus, 'default' | 'primary' | 'success' | 'warning'> = {
  to_qualify: 'default',
  open: 'default',
  qualified: 'primary',
  to_match: 'primary',
  matching: 'primary',
  shortlist_ready: 'primary',
  submitted: 'primary',
  client_review: 'warning',
  // #2942 — même teinte que `client_review` : le client n'a toujours ni signé
  // ni refusé, il reste en jeu.
  interview: 'warning',
  negotiation: 'warning',
  on_hold: 'warning',
  to_reactivate: 'warning',
  won: 'success',
  staffed: 'success',
  lost: 'default',
  cancelled: 'default',
  /** #2323.1 — pas encore engagé : un besoin suggéré, non confirmé par le
   *  client, encore moins avancé qu'« à qualifier ». */
  detected: 'default',
}

type Props = {
  rows: readonly OpenNeedRow[]
  /**
   * Ouvre la FICHE du besoin — l'écran qui n'existait pas.
   *
   * ⚠️ Il s'appelait `onOpenProject(projectId)` et l'écran jetait son argument
   * pour naviguer vers `/projects` : cliquer une ligne emmenait sur la liste
   * des projets, sans dire lequel. Un clic qui perd son sujet n'est pas une
   * navigation, c'est une sortie.
   */
  onOpenNeed: (needId: string) => void
  /** Lance le matching sur ce besoin — le point d'entrée n°1 du PDF 4. */
  onMatch: (needId: string) => void
  /**
   * LA TROISIÈME PORTE (§3.1) — « enregistrer un consultant depuis le besoin,
   * SANS passer par le vivier ».
   *
   * ⚠️ Un rappel plutôt qu'un lien : c'était `<Link to="/consultants">`,
   * c'est-à-dire précisément le geste que la source refuse. L'écran ouvre
   * maintenant le formulaire EN PLACE, et le besoin reste sous les yeux.
   */
  onAddConsultant: (need: OpenNeedRow) => void
  /** `true` quand le vivier ne contient personne : le bouton est désactivé et
   *  l'infobulle dit quoi faire, plutôt que de rendre une liste vide. */
  poolIsEmpty: boolean
  /** Les besoins cochés. Portés par l'écran et non par le tableau : la barre
   *  d'actions vit au-dessus, et deux états de sélection divergeraient. */
  selectedIds: readonly string[]
  onToggle: (needId: string) => void
  /** Coche/décoche la PAGE affichée — jamais les cinq cents besoins du filtre :
   *  « tout sélectionner » sur ce qu'on ne voit pas est le geste qu'on regrette. */
  onToggleAll: () => void
}

/**
 * Le tableau de l'écran « Besoins ouverts » (PDF 2 §7.5).
 *
 * Deux règles d'affichage portent l'honnêteté de cet écran, et les deux
 * viennent du document : un TJM absent affiche « – », jamais 0 (qui se lirait
 * « gratuit »), et une deadline dépassée est ROUGE — c'est la seule information
 * de la ligne qui coûte une affaire si on ne la voit pas.
 */
export function OpenNeedsTable({
  rows,
  onOpenNeed,
  onMatch,
  onAddConsultant,
  poolIsEmpty,
  selectedIds,
  onToggle,
  onToggleAll,
}: Props) {
  const { t } = useTranslation('projects')
  const { t: tMatching } = useTranslation('matching')
  const now = Date.now()
  const selected = new Set(selectedIds)
  const allOnPage = rows.length > 0 && rows.every(row => selected.has(row.id))
  // #2173.31 — Colonne « Owner ». `owner_id` voyage depuis longtemps sur la
  // ligne (déjà lu par l'action de lot « Attribuer ») ; le nom vient de la
  // MÊME source que ce panneau (`OwnerChoices` dans `NeedActionsMenu.tsx`) —
  // un second annuaire divergerait du premier au premier membre ajouté. Le
  // hook est appelé UNE fois pour tout le tableau, jamais par ligne.
  const members = useWorkspaceMembers()
  const ownerNames = new Map((members.data ?? []).map(member => [member.userId, member.fullName ?? member.email]))

  // Théo C projects-besoins.R2 — le tableau tient en cinq colonnes (Besoin / compte ·
  // Compétences · Démarrage · TJM vente cible · Profils suivis) ; rien ne disparaît :
  // chaque donnée de l'ancien tableau vit dans l'une des cellules composées ci-dessous.
  return (
    // Le tableau garde sa largeur de lecture et DÉFILE dans son conteneur sous
    // 768 px (« tableau défile < 768 px », Théo C projects-besoins) — rien n'est caché.
    // #2588 — un tableau large ne renvoie pas le navigateur en arrière.
    <Box className={cn('overflow-x-auto', HORIZONTAL_OVERSCROLL_CLASS)}>
      <Table className="min-w-[960px]">
        <TableHeader>
          <TableRow>
            {/* La case de tête coche la PAGE, pas le filtre entier — voir
                `onToggleAll`. Elle porte son nom : une case sans libellé
                visible n'est annoncée par rien (GA-32). */}
            <TableHead className={cn(HEAD, 'w-8')}>
              <Checkbox
                checked={allOnPage}
                onCheckedChange={onToggleAll}
                aria-label={t('openNeeds.selection.toggleAll')}
              />
            </TableHead>
            <TableHead className={HEAD}>{t('openNeeds.columns.needAccount')}</TableHead>
            <TableHead className={HEAD}>{t('openNeeds.columns.skills')}</TableHead>
            <TableHead className={HEAD}>{t('openNeeds.columns.start')}</TableHead>
            <TableHead className={HEAD}>{t('openNeeds.columns.tjmTarget')}</TableHead>
            <TableHead className={HEAD}>{t('openNeeds.columns.phase')}</TableHead>
            <TableHead className={HEAD}>{t('openNeeds.columns.followedProfiles')}</TableHead>
            {/* La colonne des gestes : « Rapprocher » + le menu de la ligne. Son
                entête est vide à dessein, ce n'est pas une donnée, c'est une commande. */}
            <TableHead className={cn(HEAD, 'w-40')} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => {
            const overdue = row.deadline_at != null && new Date(row.deadline_at).getTime() < now
            const extraSkills = Math.max(0, row.skills.length - MAX_SKILL_CHIPS)
            const tag = needStatusTag(row.status)
            const sourceUnknown = row.source == null
            const changedAt = row.status_changed_at
            const stageDays = changedAt === null ? null : daysInStatus(changedAt, new Date(now))
            const action = needNextAction(row, new Date(now))
            const placeParts = [row.location, row.remote ? t(`openNeeds.remote.${row.remote}`) : null].filter(
              (part): part is string => part != null && part !== '',
            )
            return (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => onOpenNeed(row.id)}
                data-testid="open-need-row"
              >
                {/* La case de la ligne. Le clic est arrêté : la ligne navigue
                    au clic, et cocher ne doit pas quitter l'écran. */}
                <TableCell className={CELL} onClick={event => event.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(row.id)}
                    onCheckedChange={() => onToggle(row.id)}
                    aria-label={t('openNeeds.selection.toggleOne', { role: row.title })}
                  />
                </TableCell>
                {/* BESOIN / COMPTE. Le rôle ouvre la FICHE par un vrai lien (un `<tr>`
                    n'est ni bouton ni lien, GA-35) ; le clic de ligne n'en est que
                    le raccourci à la souris, d'où l'arrêt de propagation. Sous le
                    titre : « compte · N poste(s) », l'entité, le projet (ou « Sans
                    projet », #2558.1 — jamais un tiret qui se lirait comme un nom
                    inconnu), l'origine (« origine inconnue » plutôt qu'une
                    provenance inventée) et la pastille « Périmé — à revérifier ». */}
                <TableCell className={cn(CELL, 'min-w-[240px]')}>
                  <Box className="flex min-w-0 items-start gap-2">
                    {/* #1333 — le VRAI logo quand il existe, l'initiale sinon. */}
                    <CompanyAvatar name={row.account_name ?? ''} logoUrl={row.account_logo_url ?? null} />
                    <Box className="min-w-0">
                      <Box className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <Link
                          to="/projects/needs/$needId"
                          params={{ needId: row.id }}
                          onClick={event => event.stopPropagation()}
                          className="min-w-0 rounded-sm underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                          <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
                            {row.title}
                          </Text>
                        </Link>
                        {/* Le badge d'urgence ne s'affiche QUE si quelqu'un l'a dite. */}
                        {row.urgency && (
                          <Badge variant="outline" className="shrink-0 px-1 py-0 text-xs">
                            {t(`openNeeds.urgency.${row.urgency}`)}
                          </Badge>
                        )}
                        {/* Théo C projects-besoins.A8 — périmé : une pastille sur la ligne. */}
                        {row.stale ? (
                          <Badge variant="warning" className="shrink-0 px-1 py-0 text-xs" data-testid="need-stale">
                            {t('openNeeds.stale.badge')}
                          </Badge>
                        ) : null}
                      </Box>
                      <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="block truncate">
                        {[
                          row.account_name ?? t('needsKanban.noAccount'),
                          row.entity_name,
                          t('openNeeds.seats', { count: row.headcount }),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                      <Text
                        size="xs"
                        color={
                          row.project_label ? 'text-[var(--bellum-text-secondary)]' : 'text-[var(--bellum-text-muted)]'
                        }
                        className="block max-w-[280px] truncate"
                        title={row.project_label ?? t('openNeeds.columns.withoutProject')}
                      >
                        {row.project_label ?? t('openNeeds.columns.withoutProject')}
                      </Text>
                      <Text
                        size="xs"
                        color="text-[var(--bellum-text-muted)]"
                        className="block truncate"
                        data-testid="need-source"
                        title={sourceUnknown ? t('openNeeds.sourceUnknownHint') : undefined}
                      >
                        {row.source == null ? t('openNeeds.sourceUnknown') : t(`openNeeds.source.${row.source}`)}
                      </Text>
                      <NeedSourceLink url={row.source_url} />
                    </Box>
                  </Box>
                </TableCell>
                {/* COMPÉTENCES, puis « lieu · présence » (le télétravail : `null` =
                    non renseigné, jamais « sur site » par défaut, GA-18/19), la
                    séniorité et le contrat. */}
                <TableCell className={cn(CELL, 'min-w-[200px]')}>
                  <Box className="flex flex-wrap items-center gap-1">
                    {row.skills.slice(0, MAX_SKILL_CHIPS).map(skill => (
                      <Badge
                        key={skill.term}
                        variant={skill.required ? 'default' : 'outline'}
                        title={skill.level ?? undefined}
                        className="px-1 py-0 text-xs"
                      >
                        {skill.term}
                      </Badge>
                    ))}
                    {extraSkills > 0 && (
                      <Text size="xs" color="text-[var(--bellum-text-muted)]">
                        {t('openNeeds.moreSkills', { count: extraSkills })}
                      </Text>
                    )}
                    {row.skills.length === 0 && <Dash />}
                  </Box>
                  <Text
                    size="xs"
                    color="text-[var(--bellum-text-secondary)]"
                    className="mt-0.5 block"
                    data-testid="need-place"
                  >
                    {placeParts.length > 0 ? placeParts.join(' · ') : <Dash />}
                  </Text>
                  <Text size="xs" color="text-[var(--bellum-text-muted)]" className="block">
                    {[row.seniority, t(`openNeeds.contract.${row.contract_kind}`)].filter(Boolean).join(' · ')}
                  </Text>
                </TableCell>
                {/* DÉMARRAGE, durée, et deadline (ROUGE si dépassée — la seule
                    information de la ligne qui coûte une affaire si on ne la voit pas). */}
                <TableCell className={cn(CELL, 'whitespace-nowrap')}>
                  <Text size="sm" color="text-[var(--bellum-text-primary)]" className="block">
                    {formatDate(row.start_on) ?? <Dash />}
                  </Text>
                  {row.duration_months != null ? (
                    <Text size="xs" color="text-[var(--bellum-text-muted)]" className="block">
                      {t('openNeeds.months', { count: row.duration_months })}
                    </Text>
                  ) : null}
                  {row.deadline_at != null ? (
                    <Text
                      size="xs"
                      className="block"
                      color={overdue ? 'text-[var(--danger-soft-text)]' : 'text-[var(--bellum-text-secondary)]'}
                    >
                      {t('openNeeds.deadlineOn', { date: formatDate(row.deadline_at) })}
                    </Text>
                  ) : null}
                </TableCell>
                {/* TJM VENTE CIBLE. Un TJM absent affiche « – », jamais 0 (« gratuit »).
                    La phrase dit ce que c'est : une estimation, pas un tarif signé.
                    Le PORTEUR vit dessous, en petit (#2173.31 : le nom, jamais l'id
                    brut ; un besoin sans porteur affiche un tiret). */}
                <TableCell className={cn(CELL, 'whitespace-nowrap')}>
                  <Text size="sm" color="text-[var(--bellum-text-primary)]" className="block">
                    {row.target_tjm_cents == null ? <Dash /> : formatCents(row.target_tjm_cents)}
                  </Text>
                  <Text size="xs" color="text-[var(--bellum-text-muted)]" className="block">
                    {t('openNeeds.tjmEstimate')}
                  </Text>
                  <Text
                    size="xs"
                    color="text-[var(--bellum-text-secondary)]"
                    className="block"
                    data-testid="need-owner"
                  >
                    {row.owner_id == null || !ownerNames.get(row.owner_id) ? (
                      <Dash />
                    ) : (
                      t('openNeeds.ownedBy', { name: ownerNames.get(row.owner_id) })
                    )}
                  </Text>
                </TableCell>
                {/* STATUT : la pastille du statut affiché + l'état précis en
                    étiquette (Théo C projects-besoins.R3), puis l'ÂGE dans l'étape,
                    NU — la « durée type » de la source n'est chiffrée nulle part,
                    donc aucune couleur d'alerte (voir `daysInStatus`). */}
                <TableCell className={CELL} data-testid="need-status">
                  <Badge
                    variant={THEO_STATUS_VARIANT[needTheoStatus(row.status)]}
                    className="whitespace-nowrap px-1 py-0 text-xs"
                  >
                    {needTheoStatus(row.status) === 'closed'
                      ? t(`needStatus.${normaliseNeedStatus(row.status)}`)
                      : t(`needTheoStatus.${needTheoStatus(row.status)}`)}
                  </Badge>
                  {tag ? (
                    <Badge
                      variant={NEED_STATUS_VARIANT[tag]}
                      className="mt-0.5 block w-fit whitespace-nowrap px-1 py-0 text-xs"
                      data-testid="need-tag"
                    >
                      {t(`needStatus.${tag}`)}
                    </Badge>
                  ) : null}
                  <Box data-testid="need-stage-age" className="mt-0.5">
                    {stageDays === null || changedAt === null ? (
                      <UnknownValue reason={t('openNeeds.stageAge.unknown')} />
                    ) : (
                      <Text
                        size="xs"
                        noWrap
                        color="text-[var(--bellum-text-secondary)]"
                        title={t('openNeeds.stageAge.since', { date: formatDate(new Date(changedAt)) })}
                      >
                        {t('openNeeds.stageAge.days', { count: stageDays })}
                      </Text>
                    )}
                  </Box>
                </TableCell>
                {/* PROFILS SUIVIS. Aucun profil = « aucun » en orange (jamais « 0 » :
                    une absence n'est pas un zéro), le seuil de cette couleur est
                    DÉCIDÉ (`counters.withoutShortlist`). Le « /5 » de la source est
                    refusé : `shortlist_count` n'a aucun plafond. Dessous : le verdict
                    « peut être pourvu » (la porte G3 se décide dans la fiche) et la
                    PROCHAINE ACTION, avec son lien — `null` quand le besoin ne
                    circule plus. */}
                <TableCell className={CELL}>
                  {row.shortlist_count === 0 ? (
                    <Text
                      size="sm"
                      noWrap
                      color="text-[var(--warning-soft-text)]"
                      title={t('openNeeds.shortlist.noneHint')}
                      data-testid="need-shortlist"
                    >
                      {t('openNeeds.shortlist.none')}
                    </Text>
                  ) : (
                    <Text size="sm" noWrap color="text-[var(--bellum-text-secondary)]" data-testid="need-shortlist">
                      {row.shortlist_count}
                    </Text>
                  )}
                  {row.staffable === 'yes' || row.staffable === 'no' ? (
                    <Badge
                      variant="outline"
                      title={row.staffable_reason ?? undefined}
                      className="mt-0.5 block w-fit whitespace-nowrap px-1 py-0 text-xs"
                    >
                      {t(`staffable.state.${row.staffable}`)}
                    </Badge>
                  ) : null}
                  {action ? (
                    <Box className="mt-0.5">
                      <NextAction
                        action={{ domain: 'need', action, needId: row.id }}
                        size="xs"
                        // La ligne ouvre déjà le besoin : sans arrêt de la
                        // propagation, le clic sur le lien déclencherait les
                        // deux navigations.
                        onClick={event => event.stopPropagation()}
                      />
                    </Box>
                  ) : null}
                </TableCell>
                {/* « RAPPROCHER » (les cinq états du bouton, §5.1) + le menu de la
                    ligne (les sept gestes, les mêmes que la barre de sélection).
                    Un vivier vide n'est pas un empêchement à expliquer, c'est un
                    geste à proposer (BEL-BO-003) ; sur un besoin sans shortlist, la
                    porte « j'ai quelqu'un en tête » s'AJOUTE, elle ne remplace
                    pas le rapprochement. Boutons, jamais liens vers le vivier :
                    le commercial garde son écran (28/08/2026). */}
                <TableCell className={CELL} onClick={event => event.stopPropagation()}>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {poolIsEmpty ? (
                      <Button
                        size="sm"
                        variant="outline"
                        title={tMatching('launch.emptyPool')}
                        onClick={() => onAddConsultant(row)}
                      >
                        {tMatching('launch.fillPool')}
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!needMatcherCanLaunch(row)}
                          title={needMatcherLaunchTooltip(row, tMatching)}
                          onClick={() => onMatch(row.id)}
                        >
                          {tMatching('launch.action')}
                        </Button>
                        {row.shortlist_count === 0 ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            title={tMatching('launch.knowSomeone')}
                            onClick={() => onAddConsultant(row)}
                          >
                            {tMatching('launch.fillPool')}
                          </Button>
                        ) : null}
                      </>
                    )}
                    <NeedRowMenu need={row} title={row.title} />
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Box>
  )
}

/** La cellule vide du §3.1 : un tiret gris, jamais un zéro. */
function Dash() {
  return (
    <Text element="span" size="sm" color="text-[var(--bellum-text-muted)]">
      –
    </Text>
  )
}
