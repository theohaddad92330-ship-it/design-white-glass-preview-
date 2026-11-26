import { Badge, Box, Card, CardContent, ModeTabs, Text } from '@bellum/ui'
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { GripVertical } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { AccessBarrierClass } from '@bellum/contracts'
import {
  FOCUS_MAX_ACCOUNTS,
  SPRINT_LANES,
  SPRINT_LANE_LEVELS,
  SPRINT_LEVELS,
  SPRINT_RULES,
  type SprintLane,
  type SprintLevel,
} from '@bellum/contracts'
import { AskLaura } from '@/components/primitives/AskLaura'
import { NextAction } from '@/components/primitives/NextAction'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { ScoreCircle } from '@/components/ui/ScoreCircle'
import { useAccessSummary } from '@/features/accounts/view/accounts-list/useAccessSummary'
import { formatTimeAgo } from '@/lib/relative-time'
import { SPRINT_BOARD_KEY, fetchSprintBoard, moveAccountToSprint, type SprintBoardAccount } from '../api/sprints-api'

/**
 * Le board d'EFFORT (tome 5 §28) — combien d'énergie sur quel compte.
 *
 * Trois colonnes et une sortie. Ce n'est ni le pipe (où en est l'affaire), ni
 * la porte de priorité (ai-je décidé de travailler ce compte) : c'est la
 * troisième question, celle que personne ne posait — et la seule qui ait un
 * PLAFOND, parce que l'effort maximum sur trente comptes n'existe pas.
 *
 * Deux métiers regardent ce board sans faire le même travail : décider où va
 * l'effort (Focus/Sortis — les deux niveaux GATÉS, cf. `SPRINT_LANE_LEVELS`
 * dans `@bellum/contracts`), et exécuter la cadence une fois la décision
 * prise (Extension/Volume). Le dépôt n'a pas de rôle qui porte cette
 * distinction (voir le docstring de `SPRINT_LANE_LEVELS`) : c'est donc une
 * VUE que chacun choisit ici, pas une permission imposée par le serveur —
 * `GET /sprints` continue de rendre le board complet, sans filtre.
 */
export function SprintBoard() {
  const { t } = useTranslation('sprints')
  const queryClient = useQueryClient()
  const board = useQuery({ queryKey: SPRINT_BOARD_KEY, queryFn: fetchSprintBoard })
  /**
   * BEL-SC-228 (#3257) — deux niveaux, pas un, exigent une phrase AVANT le
   * déplacement : `no_go` son motif de sortie, `watch` sa condition de réveil
   * (`sprintDecisionProblems`, côté serveur). Un seul panneau générique, pas
   * deux dédiés (doctrine c75) — `target` dit lequel des deux réclame la
   * phrase, et l'intitulé/le champ patché suivent.
   */
  const [pendingDecision, setPendingDecision] = useState<{
    id: string
    name: string
    target: 'no_go' | 'watch'
  } | null>(null)
  const [reason, setReason] = useState('')
  // Défaut arbitraire mais assumé : sans donnée pour savoir qui, de celui qui
  // regarde l'écran, arbitre ou exécute, on ouvre sur la file de décision.
  const [activeLane, setActiveLane] = useState<SprintLane>('arbitrage')
  // #3257.9 — seuil de 6 pixels, même valeur que le Kanban du pipe
  // (`PipelineBoard`) : sans lui, un simple clic sur la carte est interprété
  // comme un glissement.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const move = useMutation({
    mutationFn: ({ id, sprint, why }: { id: string; sprint: SprintLevel; why: string | null }) =>
      moveAccountToSprint(
        id,
        sprint,
        // Le motif de SORTIE n'appartient qu'à `no_go` (`sprint_exit_reason`) —
        // vers `watch`, la même phrase est la condition de réveil, portée par
        // le champ générique `promotionCondition`, pas par `reason`.
        sprint === 'no_go' ? why : null,
        sprint === 'watch' && why ? { promotionCondition: why } : {},
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SPRINT_BOARD_KEY })
      setPendingDecision(null)
      setReason('')
    },
    // Le refus du plafond est un MESSAGE, pas une erreur muette : c'est lui qui
    // porte la règle (« sors-en un d'abord »).
    onError: (error: Error) => toast.error(error.message),
  })

  const focusCount = board.data?.focus.length ?? 0
  // #3407 — le plafond de l'ESPACE (l'API le module par nombre de commerciaux) ;
  // tant qu'il n'est pas lu, la valeur par commercial — jamais un zéro.
  const focusCap = board.data?.focus_capacity ?? FOCUS_MAX_ACCOUNTS

  /**
   * #1318.3 — l'accessibilité du portefeuille, lue par le MÊME endpoint que la
   * liste des comptes (`GET /accounts/access-summary`).
   *
   * Une seconde dérivation de la barrière d'accès divergerait de celle de
   * `/accounts` : la même carte dirait « Accès B » ici et « Accès C » là. On
   * réutilise le hook, on ne recalcule rien.
   *
   * ⚠️ `isError` voyage avec : sur un échec de lecture, les classes sont
   * simplement absentes — exactement la même forme qu'un portefeuille sans
   * barrière calculée. Sans ce drapeau, une panne s'afficherait comme un vide.
   */
  const accessSummary = useAccessSummary()
  const accessFailed = accessSummary.isError
  const accessByAccount = useMemo(
    () => new Map((accessSummary.data ?? []).map(row => [row.accountId, row.accessClass])),
    [accessSummary.data],
  )
  const accessOf = (accountId: string) => accessByAccount.get(accountId) ?? null

  /**
   * #3257.9 — LE GLISSER-DÉPOSER RÉEL, par-dessus les boutons « déplacer
   * vers » (jamais à leur place tant qu'un geste clavier n'existe pas pour le
   * remplacer — les boutons restent la voie accessible). Même règle qu'au
   * clic : `no_go` ouvre le dialogue de motif, les autres niveaux bougent le
   * compte directement, et un dépôt sur le niveau déjà porté ne fait rien.
   */
  function onDragEnd(event: DragEndEvent) {
    const target = event.over?.id
    if (typeof target !== 'string' || !(SPRINT_LEVELS as readonly string[]).includes(target)) return
    const accountId = String(event.active.id)
    const moved = SPRINT_LEVELS.flatMap(level => board.data?.[level] ?? []).find(a => a.id === accountId)
    if (!moved || moved.sprint === target) return
    // Même règle qu'au clic : `no_go` et `watch` réclament leur phrase AVANT le
    // déplacement — le panneau générique de décision (doctrine c75) les porte.
    if (target === 'no_go' || target === 'watch') {
      setPendingDecision({ id: moved.id, name: moved.company_name, target })
    } else {
      move.mutate({ id: moved.id, sprint: target as SprintLevel, why: null })
    }
  }

  // Total de comptes d'une file — somme des niveaux qu'elle couvre
  // (`SPRINT_LANE_LEVELS` est la seule source de vérité sur ce découpage).
  //
  // ⚠️ `null` tant que le tableau n'est pas ARRIVÉ, et surtout pas `0` : « File
  // d'arbitrage (0) » pendant le chargement se lit comme une file vide, ce qui
  // est un fait — et un fait faux. L'onglet porte alors son seul nom, et le
  // compte apparaît quand il est mesuré.
  const laneAccountCount = (lane: SprintLane): number | null => {
    const data = board.data
    if (!data) return null
    return SPRINT_LANE_LEVELS[lane].reduce((total, level) => total + data[level].length, 0)
  }

  const unplaced = board.data?.unplaced ?? []

  return (
    <Box display="flex" className="flex-col gap-4">
      <Text size="sm" color="text-[var(--bellum-text-muted)]">
        {t('intro')}
      </Text>

      <Box display="flex" className="flex-col gap-2">
        <ModeTabs
          /* #1318.2 — « Arbitrage » et « Exécution » étaient les DEUX derniers
           mots de doctrine interne restés à l'écran : le retour les nommait
           tous les deux. Les quatre niveaux avaient été traduits, pas les
           onglets qui les regroupent. La CLÉ ne bouge pas — c'est le contrat
           (`SPRINT_LANES`) — seul le libellé change. */
          items={SPRINT_LANES.map(lane => ({
            key: lane,
            label: (() => {
              const total = laneAccountCount(lane)
              const name = t(`lanes.${lane}`)
              return total === null ? name : t('lanes.tabLabel', { name, total })
            })(),
          }))}
          value={activeLane}
          onChange={setActiveLane}
        />
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('lanes.hint')}
        </Text>
        {/* #1318.5 — « ajouter un CTA du type "Demander à Laura d'arbitrer mes
            priorités" ». Un LIEN qui pré-remplit la question, jamais un envoi :
            « Laura peut proposer des changements, mais ne doit jamais réduire
            l'effort ou sortir un compte sans validation utilisateur » — ta
            contrainte, et déjà la doctrine (le copilote n'a aucun chemin
            d'écriture). Une seule surface pour les six écrans (D44). */}
        <AskLaura label={t('page.askLauraLabel')} question={t('page.askLauraQuestion')} />
      </Box>

      {/* #3296 — les comptes SANS niveau. Un espace dont aucun compte n'a encore
          été classé affichait deux onglets à zéro et aucun geste ; ils sont là,
          et se placent avec les mêmes boutons que les cartes du board. */}
      {activeLane === 'arbitrage' && unplaced.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <Text element="h2" size="sm" weight="semibold">
              {`${t('unplaced.title')} (${unplaced.length})`}
            </Text>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('unplaced.hint')}
            </Text>
            <ul className="flex flex-col gap-2">
              {unplaced.map(account => (
                <li
                  key={account.id}
                  className="flex flex-col gap-2 rounded-md border border-[var(--bellum-border)] p-3 md:flex-row md:items-center md:justify-between"
                >
                  <Box className="flex min-w-0 items-center gap-2">
                    <CompanyAvatar name={account.company_name} logoUrl={account.logo_url} website={account.website} />
                    <Link
                      to="/accounts/$id"
                      params={{ id: account.id }}
                      className="min-w-0 flex-1 truncate text-sm underline"
                    >
                      {account.company_name}
                    </Link>
                    <ScoreCircle score={account.priority_score} size="sm" />
                  </Box>
                  <Box display="flex" className="flex-wrap gap-1">
                    {(['focus', 'extension', 'volume'] as const).map(target => (
                      <button
                        key={target}
                        type="button"
                        disabled={move.isPending}
                        onClick={() => move.mutate({ id: account.id, sprint: target, why: null })}
                        className="rounded-full px-2 py-0.5 text-xs pointer-coarse:min-h-11"
                        style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
                      >
                        {t(`moveTo.${target}`)}
                      </button>
                    ))}
                  </Box>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <Box display="flex" className="flex-col gap-4 xl:flex-row xl:items-start">
          {SPRINT_LANE_LEVELS[activeLane].map(level => (
            <SprintColumn key={level} level={level}>
              <Box display="flex" className="items-center justify-between gap-2">
                <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
                  {t(`levels.${level}`)}
                </Text>
                {/* Le compteur AVEC son plafond : « Focus 7/8 » est ce qui
                    permet d'anticiper le refus au lieu de le subir. */}
                <Badge variant={level === 'focus' && focusCount >= focusCap ? 'destructive' : 'outline'}>
                  {level === 'focus' ? `${focusCount}/${focusCap}` : String(board.data?.[level].length ?? 0)}
                </Badge>
              </Box>
              {/* #1318.2 — « chaque catégorie doit expliquer en une phrase ce
                  qu'elle implique réellement ». Le nom traduit ne suffit pas :
                  « Priorité forte » ne dit pas qu'on y met huit comptes au
                  maximum, ni pourquoi. */}
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {t(`levelMeans.${level}`)}
              </Text>

              {/* #1318 — la règle INTERDITE du niveau, CADRÉE. Vue en production
                  le 02/09, « Aucun message générique. » s'affichait nue juste
                  au-dessus de l'état vide et se lisait comme un décompte. */}
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('forbiddenHere', { rule: SPRINT_RULES[level].forbidden[0] })}
              </Text>

              {(board.data?.[level] ?? []).map(account => (
                <SprintAccountCard key={account.id} account={account} dragLabel={t('card.dragLabel')}>
                  {/* #1318 — « les cartes ne montrent quasiment que le nom du
                      compte ». Le logo ne manquait pas à l'affichage : il ne
                      voyageait pas (la requête ne le sélectionnait pas). Le
                      composant, lui, existait et servait déjà sur /accounts. */}
                  <Box className="flex min-w-0 items-center gap-2">
                    <CompanyAvatar name={account.company_name} logoUrl={account.logo_url} website={account.website} />
                    <Link
                      to="/accounts/$id"
                      params={{ id: account.id }}
                      className="min-w-0 flex-1 truncate text-sm underline"
                    >
                      {account.company_name}
                    </Link>
                    {/* #1318.3 — le score, celui de la liste des comptes. Jamais
                        recalculé, et `null` ne devient pas `0` : un compte
                        jamais analysé montre un tiret, pas un zéro rouge. */}
                    <ScoreCircle score={account.priority_score} size="sm" />
                  </Box>
                  <AccountFacts account={account} accessClass={accessOf(account.id)} accessFailed={accessFailed} />
                  {account.sprint_exit_reason && (
                    <Text size="xs" color="text-[var(--bellum-text-muted)]">
                      {account.sprint_exit_reason}
                    </Text>
                  )}
                  <SprintDecisionFacts account={account} />
                  {/* #3257.9 — le glisser-déposer (poignée ci-dessus) s'ajoute à
                      CES boutons, il ne les remplace pas : ce sont eux qui
                      restent la voie accessible au clavier. */}
                  <Box display="flex" className="flex-wrap gap-1 pt-1">
                    {SPRINT_LEVELS.filter(other => other !== level).map(other => (
                      <button
                        key={other}
                        type="button"
                        disabled={move.isPending}
                        onClick={() =>
                          // `no_go` et `watch` réclament chacun leur phrase AVANT le
                          // déplacement (motif de sortie / condition de réveil) — le
                          // panneau générique ci-dessous porte les deux.
                          other === 'no_go' || other === 'watch'
                            ? setPendingDecision({ id: account.id, name: account.company_name, target: other })
                            : move.mutate({ id: account.id, sprint: other, why: null })
                        }
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
                      >
                        {t(`moveTo.${other}`)}
                      </button>
                    ))}
                  </Box>
                </SprintAccountCard>
              ))}

              {/* #1328.5 — « toujours expliquer ce qui manque ET proposer le
                  geste suivant ». Les quatre files disaient « Aucun compte
                  ici. », quatre fois, sans un chemin : l'information était
                  juste et l'utilisateur restait bloqué devant. Chaque file dit
                  maintenant ce qu'un compte y FAIT, et mène là où l'on en met.

                  Le geste est un `<Link>` : ça se tabule, ça s'ouvre dans un
                  onglet, ça s'annonce (GA-35). */}
              {(board.data?.[level] ?? []).length === 0 && (
                <Box className="flex flex-col items-start gap-2">
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t(`empty.${level}`)}
                  </Text>
                  <Link
                    to="/accounts"
                    className="text-xs text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
                  >
                    {t('empty.action')}
                  </Link>
                </Box>
              )}
            </SprintColumn>
          ))}
        </Box>
      </DndContext>

      {/* Un panneau GÉNÉRIQUE (doctrine c75), pas deux dédiés : sortir un compte
          demande son motif, le mettre en veille demande sa condition de
          réveil — sans l'un ou l'autre, on ne saura plus pourquoi dans six mois. */}
      {pendingDecision && (
        <Card>
          <CardContent className="flex flex-col gap-2 p-4">
            <Text size="sm">
              {t(pendingDecision.target === 'no_go' ? 'exit.title' : 'watchEntry.title', {
                name: pendingDecision.name,
              })}
            </Text>
            <input
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder={t(pendingDecision.target === 'no_go' ? 'exit.placeholder' : 'watchEntry.placeholder')}
              aria-label={t(pendingDecision.target === 'no_go' ? 'exit.label' : 'watchEntry.label')}
              className="rounded-md border border-[var(--bellum-border)] bg-transparent px-2 py-1 text-sm"
            />
            <Box display="flex" className="gap-2">
              <button
                type="button"
                disabled={reason.trim().length < 3 || move.isPending}
                onClick={() =>
                  move.mutate({ id: pendingDecision.id, sprint: pendingDecision.target, why: reason.trim() })
                }
                className="rounded-md px-3 py-1.5 text-sm"
                style={{ border: '1px solid var(--border-subtle)' }}
              >
                {t(pendingDecision.target === 'no_go' ? 'exit.confirm' : 'watchEntry.confirm')}
              </button>
              <button type="button" onClick={() => setPendingDecision(null)} className="text-sm underline">
                {t(pendingDecision.target === 'no_go' ? 'exit.cancel' : 'watchEntry.cancel')}
              </button>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}

/**
 * #3257.9 — une COLONNE du board, déposable.
 *
 * Même patron que `StageColumn` du Kanban du pipe (`PipelineBoard.tsx`) : le
 * fond et la bordure changent pendant le survol (`isOver`), pour qu'un geste
 * en cours se VOIE avant d'être relâché.
 */
function SprintColumn({ level, children }: { level: SprintLevel; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: level })
  return (
    <Card
      ref={setNodeRef}
      className={`min-w-0 flex-1 transition-colors ${isOver ? 'border-[var(--bellum-primary-400)]' : ''}`}
    >
      <CardContent className="flex flex-col gap-2 p-4">{children}</CardContent>
    </Card>
  )
}

/**
 * #3257.9 — une CARTE de compte, avec une poignée de glissement.
 *
 * Même patron que `ProjectCard` du Kanban du pipe : la poignée est séparée du
 * corps de la carte, jamais la carte entière — sans quoi le capteur de
 * pointeur annule le `click` sur le lien vers le dossier et les boutons
 * « déplacer vers », qui restent la voie accessible au clavier.
 */
function SprintAccountCard({
  account,
  dragLabel,
  children,
}: {
  account: SprintBoardAccount
  dragLabel: string
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: account.id })
  return (
    <Box
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`flex items-start gap-1 rounded-md border border-[var(--bellum-border)] ${isDragging ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        aria-label={dragLabel}
        title={dragLabel}
        className="mt-2 cursor-grab touch-none px-1 text-[var(--bellum-text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="size-3.5" />
      </button>
      <Box className="min-w-0 flex-1 p-2 pl-0">{children}</Box>
    </Box>
  )
}

/**
 * Ce que Bellum sait DÉJÀ de ce compte — #1318.3.
 *
 * Le retour demande « surtout la raison du classement », avec l'exemple
 * *« Pourquoi ici : signal récent + compte accessible + aucune prochaine action
 * planifiée »*. ⚠️ **Ce n'est pas ce qui est écrit ici, et c'est délibéré** :
 * le niveau d'effort d'un compte est une décision HUMAINE — quelqu'un l'a
 * déplacé — et non un calcul. Écrire « pourquoi ici » ferait passer un choix
 * pour une déduction du moteur, c'est-à-dire inventer une raison.
 *
 * Ce qui est rendu, ce sont les FAITS sur lesquels on arbitre, et rien d'autre :
 * le score, l'accessibilité, l'absence de prochaine action, la dernière
 * activité, et la DATE à laquelle quelqu'un a placé le compte ici. Un `no_go`,
 * lui, porte un motif écrit à la main — celui-là est une vraie raison, et il
 * s'affiche juste en dessous.
 *
 * ⚠️ Trois états pour l'accessibilité, pas deux : la lecture a pu ÉCHOUER. Un
 * échec et une absence se ressemblent à l'écran, et c'est un défaut que ce
 * dépôt a déjà payé — la ligne accuse la LECTURE, jamais la donnée.
 */
function AccountFacts({
  account,
  accessClass,
  accessFailed,
}: {
  account: SprintBoardAccount
  accessClass: AccessBarrierClass | null
  accessFailed: boolean
}) {
  const { t } = useTranslation('sprints')
  // `formatTimeAgo` et non une mise en forme locale : elle existe, elle est
  // bilingue (`Intl.RelativeTimeFormat`), et une seconde dérivation du même
  // « il y a N jours » divergerait au premier ajustement.
  const placedOn = account.sprint_entered_at ? formatTimeAgo(account.sprint_entered_at) : null
  // #3509 — la dernière ACTIVITÉ tracée, jamais `updated_at` (l'horodatage du semis
  // ou de la dernière édition de la fiche : « il y a 2 min » partout en démo).
  const lastActivity = account.last_activity_at ? formatTimeAgo(account.last_activity_at) : null

  return (
    <Box className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      {/* #3257.7a — LE PORTEUR, quand il y en a un. Compte libre : aucune ligne
          (« on n'affiche pas ce qu'on n'a pas »), jamais « non attribué ». */}
      {account.owner && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('card.owner', { name: account.owner.name })}
        </Text>
      )}
      {/* Le fait qui pèse le plus dans l'arbitrage : un compte en priorité forte
          sur lequel rien n'est prévu est exactement ce qu'on cherche à voir. */}
      {account.without_next_action && (
        <Badge variant="outline" className="rounded-full px-2 py-0 text-xs font-medium">
          {t('card.withoutNextAction')}
        </Badge>
      )}
      {/* #3257.7b — LA VRAIE prochaine action, en lien vers le dossier du compte
          (dérivation unique `nextActionLink`, domaine `account_sprint`). Le titre
          et l'échéance sont ceux de la tâche réelle ; sans tâche à venir, le lien
          propose d'en programmer une — jamais un texte inventé. */}
      <NextAction
        size="xs"
        action={{
          domain: 'account_sprint',
          action: account.next_task_title ? 'do_next_task' : 'schedule_next_action',
          accountId: account.id,
          origin: '/accounts', // #4359 — le board d'effort est une lentille de /accounts
        }}
      />
      {account.next_task_title && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {account.next_task_title}
          {account.next_task_due_on && ` · ${t('card.nextTaskDue', { when: account.next_task_due_on })}`}
        </Text>
      )}
      {/* #3257.4 — la route partenaire nomme son partenaire (lu dans
          `account_partners`), ou dit qu'il reste à désigner : jamais un vide. */}
      {account.sprint === 'partner_route' && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {account.partner_name ? t('card.partner', { name: account.partner_name }) : t('card.partnerToAssign')}
        </Text>
      )}
      {/* #3296 (#3269.6) — la PROPOSITION `partner_access_found`, lue depuis
          `partner_name` au moment du board (jamais écrite au journal des
          bascules) : « on propose, on n'écrit jamais tout seul ». */}
      {account.suggested_switch && (
        <Text
          size="xs"
          color="text-[var(--bellum-text-secondary)]"
          data-testid="sprint-suggested-switch"
          className="min-w-0 max-w-full break-words"
        >
          {t('card.suggestedSwitch', {
            level: t(`levels.${account.suggested_switch.to}`),
            reason: account.suggested_switch.reason,
          })}
        </Text>
      )}
      {accessFailed ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('card.accessFailed')}
        </Text>
      ) : accessClass ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('card.accessLabel', { grade: accessClass })}
        </Text>
      ) : (
        // « Non mesuré » se DIT. Ne rien afficher se lirait « accessible ».
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('card.accessUnknown')}
        </Text>
      )}
      {lastActivity && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('card.lastActivity', { when: lastActivity })}
        </Text>
      )}
      {placedOn && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('card.placedOn', { when: placedOn })}
        </Text>
      )}
    </Box>
  )
}

/**
 * BEL-SC-228 (#3257) — « chaque compte affiche : raison, effort estimé, date
 * de revue, condition de promotion, condition de déclassement. »
 *
 * Une valeur absente ne s'affiche JAMAIS (gardes GA-18/GA-19) : chaque ligne
 * n'apparaît que si le commercial l'a écrite. `sprint_promotion_condition`
 * porte AUSSI la condition de réveil de `watch` — même champ, pas un second
 * (`sprintDecisionProblems`, `packages/contracts/src/schemas/sprint.ts`).
 */
function SprintDecisionFacts({ account }: { account: SprintBoardAccount }) {
  const { t, i18n } = useTranslation('sprints')
  const reviewAt = account.sprint_review_at
    ? new Date(account.sprint_review_at).toLocaleDateString(i18n.language)
    : null

  if (
    !account.sprint_reason &&
    !account.sprint_effort_estimate &&
    !reviewAt &&
    !account.sprint_promotion_condition &&
    !account.sprint_demotion_condition
  ) {
    return null
  }

  return (
    <Box className="mt-1 flex flex-col gap-0.5">
      {account.sprint_reason && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('decision.reason')} · {account.sprint_reason}
        </Text>
      )}
      {account.sprint_effort_estimate && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('decision.effortEstimate')} · {account.sprint_effort_estimate}
        </Text>
      )}
      {reviewAt && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('decision.reviewAt', { date: reviewAt })}
        </Text>
      )}
      {account.sprint_promotion_condition && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('decision.promotionCondition')} · {account.sprint_promotion_condition}
        </Text>
      )}
      {account.sprint_demotion_condition && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('decision.demotionCondition')} · {account.sprint_demotion_condition}
        </Text>
      )}
    </Box>
  )
}
