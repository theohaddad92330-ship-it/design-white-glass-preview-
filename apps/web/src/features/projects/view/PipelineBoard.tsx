import type {
  PipelineColumn,
  PipelineStage,
  PipelineSummary,
  ProjectReadRow,
  ProjectStage,
  LossReasonCode,
} from '@bellum/contracts'
import { isPipelineStage, OPEN_PIPELINE_STAGES } from '@bellum/contracts'
import { Box, Button, EntityAvatar, Text } from '@bellum/ui'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { Link } from '@tanstack/react-router'
import { ChevronRight, GripVertical } from 'lucide-react'
import type { DragEndEvent } from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { pipelineKeyboardCoordinates } from '../model/pipeline-keyboard'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { columnAmountCents, pipelineTotal } from '../model/pipeline-total'
import { activeAndWonCounts } from '../model/pipeline-total'
import { PipelineSummaryLine } from './PipelineSummaryLine'
import { StageMovePanel } from './StageMovePanel'

/**
 * Le pipe, en colonnes.
 *
 * Trois refus assumés, tous pour la même raison — un chiffre faux se croit :
 *
 *  - **aucune pondération, aucune probabilité** : un pipe pondéré que personne
 *    ne tient à jour produit un montant que la direction finit par prendre pour
 *    une prévision ;
 *  - **un projet sans montant n'est pas un projet à 0 €** : il est compté à
 *    part, sous la colonne, et le total de tête dit ce qu'il vaut — un montant
 *    EXACT quand tout est chiffré, un PLANCHER quand une partie l'est, et
 *    « non mesuré » quand rien ne l'est. Le troisième cas manquait, et c'est
 *    celui que la recette du 27/08 a trouvé en production ;
 *  - **les cinq colonnes s'affichent même vides** : une colonne absente se lit
 *    « il manque une étape », pas « personne n'y est ».
 *
 * Et un ajout, parce qu'un chiffre juste qui ne mène nulle part est une impasse :
 * « N projets sans montant saisi » FILTRE désormais le pipe sur ces projets-là.
 * Le geste est LOCAL et non une route, mais la raison a CHANGÉ le 28/08/2026 :
 * `/projects` déclare maintenant un `validateSearch` (`?stage=`, pour les barres
 * du cockpit), donc un paramètre n'y serait plus jeté. Ce filtre-ci reste local
 * parce qu'il n'a pas d'appelant DISTANT — personne ne construit un lien vers
 * « les projets non chiffrés » : le rendre partageable serait une clé de plus
 * dans l'URL que rien n'écrit. Le jour où un tel lien existe, il passera par le
 * schéma de la route, comme `stage`.
 */
export function PipelineBoard({
  summary,
  projects,
  onSelect,
  selectedId,
  narrowed = false,
  onMove,
  projectsWithMission,
  ownerName,
  onAdd,
  summaryExtra,
}: {
  summary: PipelineSummary
  projects: ProjectReadRow[]
  /** Refonte Théo — « Ajouter une affaire » au pied de la première colonne (le formulaire `?create=1`). */
  onAdd?: () => void
  /** Ce que l'écran ajoute en bout de ligne de synthèse (« Les signaux restent dans Signaux », pistes). */
  summaryExtra?: React.ReactNode
  onSelect: (project: ProjectReadRow) => void
  selectedId?: string
  /**
   * La liste reçue est-elle DÉJÀ resserrée par un filtre de la lentille
   * (#1328 : recherche, « Mes projets », « Sans prochaine action ») ?
   *
   * ⚠️ Ce n'est pas une préférence d'affichage, c'est ce qui empêche un chiffre
   * de mentir. La pastille d'une colonne rend `column.count`, qui vient du
   * SERVEUR et compte l'étape entière : au-dessus de deux cartes filtrées, elle
   * afficherait « 12 » et ferait lire un désaccord là où il n'y a qu'un filtre
   * posé. Le tableau tient déjà exactement ce raisonnement pour son propre
   * filtre « sans montant » (`focused`) — celui-ci est le même, venu du dessus.
   *
   * `?stage=` en est exclu : il a sa propre mention, juste au-dessus du tableau.
   */
  narrowed?: boolean
  /** Déplacer un projet. Le panneau d'effet s'ouvre AVANT l'appel : c'est lui
   *  qui recueille le motif d'une perte et les gestes acceptés. */
  onMove?: (
    project: ProjectReadRow,
    target: ProjectStage,
    input: { accepted: readonly string[]; reason: string | null; lossReasonCode?: LossReasonCode },
  ) => void
  /** Les projets qui portent déjà une mission. Un retour arrière depuis
   *  « gagné » y est BLOQUÉ (§15) : rouvrir laisserait une mission orpheline. */
  projectsWithMission?: ReadonlySet<string>
  /**
   * #2170.15 (lot W20) — résout un `owner_id` en nom affichable. La MÊME
   * fonction que `ProjectsTable`/`TabProjects` (`useProjectOwners().ownerName`) :
   * un nom d'owner recalculé deux fois divergerait à la première retouche.
   * Optionnel pour la même raison que `onMove` : un appelant qui ne câble rien
   * garde une carte sans ligne owner plutôt qu'une carte cassée.
   */
  ownerName?: (ownerId: string | null) => string | null
}) {
  const { t, i18n } = useTranslation('projects')
  const [pendingMove, setPendingMove] = useState<{ project: ProjectReadRow; target: ProjectStage } | null>(null)
  /**
   * Le filtre « sans montant » : éteint, posé sur TOUT le pipe (`all`), ou
   * restreint à UNE étape. Un seul foyer à la fois — deux filtres simultanés
   * demanderaient de lire deux états pour savoir ce qu'on regarde.
   *
   * ⚠️ Il vit dans un `useState` et non dans l'URL. La raison n'est PLUS celle
   * écrite ici jusqu'au 28/08 (« la route ne déclare aucun `validateSearch` ») :
   * elle en déclare un depuis que les barres du cockpit portent `?stage=`. Elle
   * est qu'aucun lien distant ne désigne « les projets non chiffrés » — une clé
   * d'URL que personne n'écrit ne se déclare pas d'avance.
   */
  const [withoutAmountFocus, setWithoutAmountFocus] = useState<'all' | ProjectStage | null>(null)
  const toggleWithoutAmount = (next: 'all' | ProjectStage) =>
    setWithoutAmountFocus(current => (current === next ? null : next))
  // Un seuil de 6 pixels : sans lui, un simple clic sur une carte est interprété
  // comme un glissement, et le drawer ne s'ouvre plus jamais.
  // #4339.1 — le CLAVIER est un capteur à part entière (GA-32/35) : Tab jusqu'à la poignée, Espace pour saisir,
  // ← → pour sauter à la colonne voisine, Espace pour déposer (le panneau d'effet s'ouvre), Échap pour annuler.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: pipelineKeyboardCoordinates }),
  )

  const byStage = useMemo(() => {
    const map = new Map<ProjectStage, ProjectReadRow[]>()
    for (const project of projects) {
      if (!isPipelineStage(project.stage)) continue
      const bucket = map.get(project.stage) ?? []
      bucket.push(project)
      map.set(project.stage, bucket)
    }
    return map
  }, [projects])

  const money = (cents: number): string =>
    new Intl.NumberFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(cents / 100)

  // Trois états, et un seul chiffre les distingue : combien de projets portent
  // RÉELLEMENT un montant. Aucun ⇒ le total n'est pas nul, il est inconnu.
  //
  // ⚠️ La dérivation vit dans `model/pipeline-total.ts` et non plus ici. Elle
  // était juste, et elle était SEULE : le cockpit de `/briefing` retranchait la
  // même question chez lui et répondait « 0 € » sur la même donnée (recette du
  // 28/08). Deux chemins qui refont la même dérivation divergent.
  const total = pipelineTotal(summary)
  // ⚠️ Le SIGNÉ n'est pas lu ici : la colonne « Gagnée » dit ses « X € estimés », toujours à CÔTÉ du total et
  // jamais dedans (#4499 — la carte qui le portait a quitté la page).
  // Le filtre de tête n'a de sens que s'il CACHE quelque chose. Quand tout le
  // pipe est non chiffré, il rendrait le même écran : un bouton qui ne fait rien
  // est pire qu'un chiffre nu.
  const canFilterAll = summary.total_without_amount > 0 && summary.total_without_amount < summary.total_count

  // #4291.8 — le GAGNÉ quitte le Kanban : un projet signé se suit dans `WonMissionTracking` (sous le tableau), il n'est
  // plus une carte. Le Kanban ne montre que les étapes encore en jeu (`OPEN_PIPELINE_STAGES`).
  const counts = activeAndWonCounts(projects)
  const boardColumns = summary.columns.filter(column =>
    (OPEN_PIPELINE_STAGES as readonly string[]).includes(column.stage),
  )

  return (
    <Box className="space-y-4">
      {/* #4499 — UNE ligne de synthèse à la place des quatre cartes et de « Par commercial » (maquette V22). */}
      <PipelineSummaryLine
        summary={summary}
        count={counts.active}
        wonCount={counts.won}
        extra={summaryExtra}
        withoutAmountSlot={
          total.kind === 'measured' && total.withoutAmount > 0 ? (
            <WithoutAmountFilter
              label={t('pipeline.withoutAmountSummary', { count: summary.total_without_amount })}
              hint={t('pipeline.withoutAmountFilterHint')}
              pressed={withoutAmountFocus === 'all'}
              onFilter={canFilterAll ? () => toggleWithoutAmount('all') : undefined}
            />
          ) : null
        }
      />

      <DndContext
        sensors={sensors}
        accessibility={{ screenReaderInstructions: { draggable: t('pipeline.dragInstructions') } }}
        onDragEnd={(event: DragEndEvent) => {
          const target = event.over?.id
          const moved = projects.find(item => item.id === event.active.id)
          if (!moved || typeof target !== 'string' || moved.stage === target) return
          setPendingMove({ project: moved, target: target as ProjectStage })
        }}
      >
        {/* Théo `.bo11-board` : cinq colonnes de 210 px au moins, qui défilent à l'horizontale plutôt que de
            s'écraser ; sous 768 px, une colonne sous l'autre. `min-w-0` sur chaque colonne (voir
            `StageColumn`) : sans lui, un élément de grille prend la largeur de son contenu le plus long. */}
        <Box
          data-testid="pipeline-board"
          className="grid grid-cols-1 gap-3 pb-2 md:auto-cols-[minmax(13rem,1fr)] md:grid-flow-col md:grid-cols-none md:overflow-x-auto"
        >
          {boardColumns.map((column, index) => {
            const all = byStage.get(column.stage) ?? []
            // `narrowed` NE FILTRE PAS les cartes ici : `all` vient déjà de `visibleProjects`, que la
            // lentille a resserré en amont. Seul le focus « sans montant » retire des cartes.
            const amountFocused = withoutAmountFocus === 'all' || withoutAmountFocus === column.stage
            const cards = amountFocused ? all.filter(item => !hasAmount(item)) : all
            // Sous un filtre, la pastille compte ce qui est À L'ÉCRAN, pas le total du serveur.
            const focused = narrowed || amountFocused
            const canFilter = column.without_amount > 0 && column.without_amount < column.count
            const columnCents = columnAmountCents(column)
            return (
              <StageColumn key={column.stage} stage={column.stage}>
                <Box className="flex min-w-0 flex-col items-start gap-1 px-0.5">
                  <Box display="flex" className="w-full items-center justify-between gap-2">
                    {/* #1394 — l'entête de colonne pose `?stage=` : le filtre d'étape reste atteignable. */}
                    <Link
                      to="/projects"
                      search={stageSearch(column.stage)}
                      className="inline-flex min-w-0 items-center gap-2 rounded-md underline-offset-2 hover:underline pointer-coarse:min-h-11"
                    >
                      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--bellum-primary-500)]" />
                      <Text element="span" size="xs" weight="semibold" className="truncate">
                        {column.label}
                      </Text>
                    </Link>
                    <span className="rounded-badge bg-card px-1.5 py-0.5 text-xs tabular-nums text-[var(--bellum-text-secondary)]">
                      {focused ? cards.length : column.count}
                    </span>
                  </Box>
                  {/* ⚠️ `columnAmountCents` et non `amount_cents > 0` : une colonne VIDE ne dit pas « aucun
                      montant saisi » (recette du 28/08). Un montant partiel se NOMME à côté du chiffre. */}
                  <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                    {columnCents === null
                      ? t('pipeline.noAmountYet')
                      : t('pipeTheo.column.total', { amount: money(columnCents) })}
                  </Text>
                  {column.without_amount > 0 ? (
                    <WithoutAmountFilter
                      label={t('pipeline.withoutAmountShort', { count: column.without_amount })}
                      hint={t('pipeline.withoutAmountShortFilterHint')}
                      pressed={withoutAmountFocus === column.stage}
                      onFilter={canFilter ? () => toggleWithoutAmount(column.stage) : undefined}
                    />
                  ) : null}
                  {/* #1325 (3/9.1) — le nombre sans prochaine action, à partir de 1 seulement. */}
                  {column.without_next_action > 0 ? (
                    <Text element="span" size="xs" color="text-[var(--warning-soft-text)]">
                      {t('pipeline.columnWithoutNextAction', { count: column.without_next_action })}
                    </Text>
                  ) : null}
                </Box>

                {cards.length === 0 ? (
                  <Text element="p" size="xs" color="text-muted-foreground" className="px-1 py-4 text-center">
                    {/* Trois vides, trois phrases : filtré d'en haut, filtré par le montant, réellement vide. */}
                    {narrowed
                      ? t('pipeline.narrowedEmptyColumn')
                      : focused && all.length > 0
                        ? t('pipeline.filteredEmptyColumn')
                        : t('pipeline.emptyColumn')}
                  </Text>
                ) : (
                  cards.map(project => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      selected={project.id === selectedId}
                      onSelect={onSelect}
                      subtitle={project.company_name ?? t('pipeline.unknownAccount')}
                      amount={hasAmount(project) ? money(project.amount_cents as number) : null}
                      dragLabel={t('pipeline.dragHandle')}
                      ownerName={ownerName}
                    />
                  ))
                )}
                {/* Théo — « Ajouter une affaire » au pied de la première colonne : le même formulaire que
                    « Nouvelle affaire » (`?create=1`), jamais un second (GA-26). */}
                {index === 0 && onAdd ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full pointer-coarse:min-h-11"
                    onClick={onAdd}
                  >
                    {t('pipeTheo.column.add')}
                  </Button>
                ) : null}
              </StageColumn>
            )
          })}
        </Box>
      </DndContext>

      {pendingMove && (
        <StageMovePanel
          project={pendingMove.project}
          target={pendingMove.target}
          hasMission={projectsWithMission?.has(pendingMove.project.id) ?? false}
          onCancel={() => setPendingMove(null)}
          onConfirm={({ reason, accepted, lossReasonCode }) => {
            onMove?.(pendingMove.project, pendingMove.target, { reason, accepted, lossReasonCode })
            setPendingMove(null)
          }}
        />
      )}
    </Box>
  )
}

/**
 * « Ce projet porte-t-il un montant ? » — UNE dérivation, pas deux.
 *
 * Elle recopie mot pour mot la règle du serveur (`pipelineSummary()` dans
 * `packages/contracts`) : un montant qui n'est pas un nombre FINI n'est pas un
 * montant. La carte se contentait de `typeof === 'number'`, ce qui aurait laissé
 * passer un `NaN` — et surtout, le filtre et l'affichage doivent trancher
 * pareil : deux chemins qui refont la même dérivation divergent.
 */
function hasAmount(project: ProjectReadRow): boolean {
  return typeof project.amount_cents === 'number' && Number.isFinite(project.amount_cents)
}

/**
 * Un compteur « sans montant » qui MÈNE aux projets qu'il compte.
 *
 * `<button>` quand il filtre, `<span>` sinon — et le « sinon » est une règle,
 * pas un oubli : quand tous les projets concernés sont déjà à l'écran (colonne
 * entièrement non chiffrée), le filtre rendrait l'écran identique. Un bouton qui
 * ne fait rien est pire qu'un chiffre nu. C'est le même partage que les
 * compteurs de tête des besoins ouverts.
 */
function WithoutAmountFilter({
  label,
  hint,
  pressed,
  onFilter,
}: {
  label: string
  hint: string
  pressed: boolean
  onFilter?: () => void
}) {
  const body = (
    <Text element="span" size="xs" color="text-muted-foreground">
      {label}
    </Text>
  )
  if (!onFilter) return body
  return (
    <button
      type="button"
      onClick={onFilter}
      aria-pressed={pressed}
      title={hint}
      className={`rounded-full border px-2 py-0.5 pointer-coarse:min-h-11 ${
        pressed ? 'border-[var(--bellum-text-accent)]' : 'border-[var(--bellum-border)]'
      }`}
    >
      {body}
    </button>
  )
}

/** Une colonne qui accepte un dépôt. L'identifiant de la zone EST l'étape :
 *  c'est ce qui évite une table de correspondance qui se désynchronise. */
/**
 * Ce que l'entête de colonne emporte vers la liste : SON étape, et rien d'autre.
 *
 * ⚠️ Le filtre est OMIS plutôt que faux quand l'étape n'a pas de colonne au
 * tableau. `PipelineColumn.stage` est typé sur les HUIT étapes du cycle alors
 * que le pipe n'en rend que cinq : `detected`, `potential`, `lost` et `dormant`
 * n'ont aucune colonne, et un lien qui les porterait ouvrirait un pipe vide sans
 * rien pour dire pourquoi. Sans filtre, le lien ouvre le pipe entier — et il ne
 * PRÉTEND alors rien filtrer.
 *
 * La question est tranchée par `isPipelineStage` (contrat) et non par une liste
 * recopiée ici : une sixième colonne un jour ne doit pas devenir un lien muet.
 */
function stageSearch(stage: PipelineColumn['stage']): { stage?: PipelineStage } {
  return isPipelineStage(stage) ? { stage } : {}
}

function StageColumn({ stage, children }: { stage: ProjectStage; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: stage })
  return (
    <Box
      ref={setNodeRef}
      className={`flex min-h-40 min-w-0 flex-col gap-2 rounded-lg border p-2 transition-colors ${
        isOver ? 'border-[var(--bellum-primary-400)] bg-card' : 'border-border bg-[var(--bellum-surface-2)]'
      }`}
    >
      {children}
    </Box>
  )
}

/**
 * Une carte d'affaire — refonte Théo C (`.bo11-deal`) : le compte en tête, le sujet, le montant en grand
 * (« Montant à saisir », jamais 0 €), la ligne d'estimation, puis le PIED séparé d'un filet : la prochaine
 * action, sa date et le porteur, les profils suivis avec « Voir ».
 * Arbitrage Louis 24/10 (#4499) : le badge de preuve, l'objectif, le besoin principal en lien, l'origine et l'alerte
 * de stagnation ont quitté la carte — ils se lisent dans le détail de l'affaire (`ProjectPropertiesContent`).
 *
 * ⚠️ La poignée est séparée du corps (recette) : rendre la carte entière glissable supprimait le clic qui
 * ouvre le panneau de l'affaire — le capteur de pointeur annule le `click`. Le corps reste un vrai bouton.
 *
 * Aucune probabilité sur la carte (doctrine, #4016 L1 : Pilotage seulement ; notre AFFAIRES-E39).
 */
function ProjectCard({
  project,
  selected,
  onSelect,
  subtitle,
  amount,
  dragLabel,
  ownerName,
}: {
  project: ProjectReadRow
  selected: boolean
  onSelect: (project: ProjectReadRow) => void
  subtitle: string
  /** Le montant SAISI, formaté ; `null` = aucun montant (jamais « 0 € »). */
  amount: string | null
  dragLabel: string
  /** cf. le prop de même nom sur `PipelineBoard` — résout `owner_id` en nom. */
  ownerName?: (ownerId: string | null) => string | null
}) {
  const { t, i18n } = useTranslation('projects')
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: project.id })
  // #2170.15 — un owner absent n'affiche AUCUN nom : « non attribué » inventerait un porteur.
  const owner = ownerName?.(project.owner_id) ?? null
  // Le prénom seul, comme la maquette (« Théo », « Maëva ») : le nom entier reste à l'infobulle.
  const ownerShort = owner ? (owner.split(/\s+/)[0] ?? owner) : null
  // Théo C projects-pipeline.N3 — « Estimation HT · N postes » ; sans montant, les postes se disent seuls (jamais
  // une « estimation » qui n'existe pas) ; sans poste rattaché, aucune mention (jamais « 0 poste »).
  const postes = project.needs_headcount ? t('pipeTheo.card.headcount', { count: project.needs_headcount }) : null
  const estimateLine = amount
    ? [t('pipeTheo.card.estimate'), postes].filter(Boolean).join(' · ')
    : (postes ?? t('pipeTheo.card.noEstimate'))
  return (
    <Box
      ref={setNodeRef}
      data-testid="pipeline-card"
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`relative rounded-card border bg-card p-4 transition-colors duration-immediate ease-bellum-out ${isDragging ? 'opacity-60' : ''} ${
        selected
          ? 'border-[var(--bellum-accent-line)]'
          : 'border-[var(--bellum-border)] hover:border-[var(--bellum-accent-line)]'
      }`}
    >
      <Box display="flex" className="mb-3 min-w-0 items-center gap-2 pr-8">
        {/* #1325 (4/9) — le logo réel du compte ; `aria-hidden`, le nom est juste à côté. */}
        <CompanyAvatar name={subtitle} logoUrl={project.logo_url} website={project.website} />
        <Text element="span" size="xs" className="min-w-0 truncate text-[var(--bellum-text-secondary)]">
          {subtitle}
        </Text>
        {/* #4499 (arbitrage Louis 24/10) — le niveau de preuve a quitté la carte (maquette V22) : il se lit dans le
            détail de l'affaire. */}
      </Box>
      <button
        type="button"
        aria-label={dragLabel}
        title={dragLabel}
        className="absolute right-2 top-2 flex min-h-11 min-w-8 cursor-grab touch-none items-start justify-center pt-1.5 text-[var(--bellum-text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onSelect(project)}
        aria-current={selected ? 'true' : undefined}
        className="block w-full text-left"
      >
        <Text element="p" size="sm" weight="semibold" className="line-clamp-2 min-h-10 leading-snug">
          {project.label}
        </Text>
        {/* #1325 (4/9) — le montant SAISI, ou « Montant à saisir » : un projet sans montant n'est pas à 0 €. */}
        <Text
          element="p"
          size={amount ? 'lg' : 'sm'}
          weight="semibold"
          className={`mt-3 tabular-nums tracking-tight ${amount ? '' : 'text-[var(--bellum-text-muted)]'}`}
        >
          {amount ?? t('pipeTheo.card.amountToEnter')}
        </Text>
        {/* #2170.13 — le besoin principal (le PREMIER non archivé), à la place du « 1 poste » de la maquette. */}
        <Text element="p" size="xs" className="min-w-0 truncate text-[var(--bellum-text-muted)]">
          {estimateLine}
        </Text>
        {/* La PORTE ouverte par une relation (I-45) : une porte, pas une affaire. */}
        {project.access_mode === 'introduction_relation' ? (
          <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-accent)]">
            {t('pipeline.doorViaRelation')}
          </Text>
        ) : null}
      </button>
      <Box className="mt-3.5 border-t border-[var(--bellum-border)] pt-3">
        {/* #1325 (4/9) — LA PROCHAINE ACTION, en toutes lettres. `undefined` (API muette) : rien ;
            `null` : aucune tâche ouverte, une dette dite en ton d'attention ; sinon le titre. */}
        {project.next_action === undefined ? null : project.next_action === null ? (
          <Text element="p" size="xs" className="min-h-8 text-[var(--bellum-text-muted)]">
            {t('pipeline.cardNoNextAction')}
          </Text>
        ) : (
          <Text element="p" size="xs" className="line-clamp-2 min-h-8 leading-snug text-[var(--bellum-text-secondary)]">
            {project.next_action.title}
          </Text>
        )}
        <Box
          display="flex"
          className="mt-2.5 items-center justify-between gap-2 text-xs text-[var(--bellum-text-muted)]"
        >
          {/* L'échéance de la prochaine action ; à défaut, la dernière activité (#2170.17, `updated_at`). */}
          <span>
            {project.next_action
              ? formatShortDate(project.next_action.due_on, i18n.language)
              : t('pipeline.cardLastActivity', { date: formatShortDate(project.updated_at, i18n.language) })}
          </span>
          {owner ? (
            <span className="inline-flex min-w-0 items-center gap-1.5" title={t('pipeline.cardOwner', { name: owner })}>
              <EntityAvatar name={owner} size="xs" shape="circle" aria-hidden />
              <span className="truncate">{ownerShort}</span>
            </span>
          ) : null}
        </Box>
        {/* #2170.19 — les profils positionnés ; « Voir » ouvre l'onglet Profils de la fiche. `0` n'a pas de ligne. */}
        {project.positioned_count ? (
          <Box
            display="flex"
            className="mt-2 items-center justify-between gap-2 text-xs text-[var(--bellum-text-muted)]"
          >
            <span>{t('pipeTheo.card.followed', { count: project.positioned_count })}</span>
            <Link
              to="/projects/$id"
              params={{ id: project.id }}
              search={{ onglet: 'profils' }}
              aria-label={t('pipeTheo.card.seeNamed', { label: project.label })}
              className="inline-flex items-center gap-0.5 font-medium text-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
            >
              {t('pipeTheo.card.see')}
              <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}

/** Une date courte, dans la langue de l'utilisateur. Une chaîne illisible est
 *  rendue TELLE QUELLE plutôt que « Invalid Date » : la phrase reste lisible et
 *  personne ne part chercher un bug d'affichage. */
function formatShortDate(iso: string, language: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  return at.toLocaleDateString(language, { day: 'numeric', month: 'short' })
}
