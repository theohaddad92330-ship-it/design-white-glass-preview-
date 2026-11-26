import {
  OUTREACH_PLAYBOOKS,
  OUTREACH_SEQUENCE_TEMPLATES,
  type ApplySequenceTemplateResult,
  type ImportSequenceLibraryResult,
  type OutreachPlaybookKey,
  type OutreachStepKind,
  type OutreachTemplateKey,
  type SequenceTemplate,
} from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Text,
} from '@bellum/ui'
import {
  ArrowLeft,
  Briefcase,
  CalendarCheck,
  ChevronDown,
  Compass,
  FileCheck,
  FileUp,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  UserRound,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  useDeleteSequenceTemplate,
  useSequenceTemplates,
  useSetSequenceTemplateVisibility,
} from '../hooks/useSequenceLibrary'
import { PLAYBOOK_FAMILY_ORDER, type PlaybookFamily } from '../playbook-families'
import { cadenceLabel } from '../sequence-library'
import { distinctChannels, filterCatalog, foldText, sequenceCatalog, type CatalogEntry } from '../sequence-catalog'
import { AppliedSummary, ContactPicker } from './SequenceLibraryBlock'
import { SharedContentMeta } from './SharedContentMeta'
import {
  CreateModelDialog,
  ImportCampaignsDialog,
  LauraModelDialog,
  WebPageModelDialog,
  starterSteps,
  type ModelCopy,
} from './SequenceModelDialogs'
import { SequenceMultiSelect } from './SequenceMultiSelect'
import { SequencesPageHead } from './SequencesPageHead'

/**
 * Théo C sequences-bibliotheque — « TA BIBLIOTHÈQUE DE MODÈLES ».
 *
 * Une seule vue pour tout ce qui sert de point de départ : les situations ESN, les gabarits d'avant et les
 * campagnes importées de ton fichier. Recherche, filtres multi-sélection (usage · auteur), une carte par
 * modèle, « Voir les messages » (une fenêtre qui montre les étapes) et « Utiliser ». Elle vit sur la route
 * des séquences (aucune route de plus) et rien n'est retiré : les gestes de l'ancienne bibliothèque —
 * partager, reprendre en personnel, appliquer à un contact, retirer — restent sur la carte importée.
 */

type AuthorTag = 'starter' | 'team' | 'personal' | 'imported'
const AUTHOR_TAGS = ['starter', 'team', 'personal', 'imported'] as const satisfies readonly AuthorTag[]

type Preview = { kind: 'catalog'; entry: CatalogEntry } | { kind: 'imported'; template: SequenceTemplate }

const KIND_KEY = {
  email: 'kind.email',
  reminder: 'kind.reminder',
  task: 'kind.task',
  linkedin_invite: 'kind.linkedin_invite',
  linkedin_message: 'kind.linkedin_message',
  call: 'kind.call',
} as const satisfies Record<OutreachStepKind, string>

const FAMILY_TONE = {
  prospecting: 'primary',
  development: 'info',
  meeting: 'success',
  staffing: 'warning',
  mission_follow_up: 'info',
  admin: 'default',
} as const satisfies Record<PlaybookFamily, 'primary' | 'info' | 'success' | 'warning' | 'default'>

function entryName(entry: CatalogEntry, t: TFunction<'outreach'>): string {
  return entry.kind === 'playbook'
    ? t(`playbooks.trigger.${entry.key as OutreachPlaybookKey}.name`)
    : t(`templates.name.${entry.key as OutreachTemplateKey}`)
}

function entryHint(entry: CatalogEntry, t: TFunction<'outreach'>): string {
  return entry.kind === 'playbook'
    ? t(`playbooks.trigger.${entry.key as OutreachPlaybookKey}.when`)
    : t(`libraryView.templateHint.${entry.key as OutreachTemplateKey}`)
}

export function SequenceLibraryView({
  onBack,
  onUsePlaybook,
  onUseTemplate,
  onGuide,
}: {
  onBack: () => void
  onUsePlaybook: (key: OutreachPlaybookKey) => void
  onUseTemplate: (key: OutreachTemplateKey) => void
  onGuide: () => void
}) {
  const { t } = useTranslation('outreach')
  const templates = useSequenceTemplates()
  const catalog = useMemo(() => sequenceCatalog(), [])
  const [query, setQuery] = useState('')
  const [families, setFamilies] = useState<ReadonlySet<PlaybookFamily>>(new Set())
  const [authors, setAuthors] = useState<ReadonlySet<AuthorTag>>(new Set())
  const [preview, setPreview] = useState<Preview | null>(null)
  const [copy, setCopy] = useState<ModelCopy | null>(null)
  const [dialog, setDialog] = useState<'create' | 'laura' | 'web' | 'import' | null>(null)
  const [lastImport, setLastImport] = useState<ImportSequenceLibraryResult | null>(null)
  const [pickingFor, setPickingFor] = useState<string | null>(null)
  const [applied, setApplied] = useState<{ name: string; result: ApplySequenceTemplateResult } | null>(null)

  const folded = foldText(query)
  const shownCatalog =
    authors.size > 0 && !authors.has('starter')
      ? []
      : filterCatalog(
          catalog,
          { query: folded, families },
          entry => `${entryName(entry, t)} ${entryHint(entry, t)} ${t(`playbooks.family.${entry.family}`)}`,
        )
  const imported = (templates.data ?? []).filter(template => {
    if (authors.size > 0) {
      const tags: AuthorTag[] = ['imported', template.visibility === 'team' ? 'team' : 'personal']
      if (!tags.some(tag => authors.has(tag))) return false
    }
    // Un modèle importé n'a pas de famille : choisir un usage ne l'écarte pas silencieusement, il reste
    // trouvable par le texte seul quand aucune famille n'est cochée.
    if (families.size > 0) return false
    return folded === '' || foldText(template.name).includes(folded)
  })
  const importedAll = templates.data ?? []

  const familyOptions = PLAYBOOK_FAMILY_ORDER.map(value => ({ value, label: t(`playbooks.family.${value}`) }))
  const authorOptions = AUTHOR_TAGS.map(value => ({ value, label: t(`libraryView.author.${value}`) }))

  return (
    <Box className="flex w-full flex-col gap-6" data-testid="sequence-library-view">
      {/* Hors maquette, gardé : la bibliothèque vit sur la route des séquences (aucune route de plus) — l'onglet
          « Séquences » y est déjà actif, ce lien est le seul chemin de retour vers la liste. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-mb-4 -ml-2 w-fit pointer-coarse:min-h-11"
        onClick={onBack}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('libraryView.back')}
      </Button>
      {/* `.a14-head` — sur-titre, h1, phrase ; [Importer] [Créer mon modèle ▾] [Préparer avec Laura]. */}
      <SequencesPageHead
        eyebrow={t('libraryView.eyebrow')}
        title={t('libraryView.title')}
        subtitle={t('libraryView.lead')}
        actions={
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="pointer-coarse:min-h-11"
              onClick={() => setDialog('import')}
            >
              <FileUp className="size-4" aria-hidden="true" />
              {t('libraryView.import.cta')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline" className="pointer-coarse:min-h-11">
                  <Plus className="size-4" aria-hidden="true" />
                  {t('starter.createModel')}
                  <ChevronDown className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDialog('create')}>
                  {t('libraryView.menu.scratch')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog('web')}>{t('libraryView.menu.web')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={onGuide}>{t('libraryView.menu.guided')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" size="sm" className="pointer-coarse:min-h-11" onClick={() => setDialog('laura')}>
              <Sparkles className="size-4" aria-hidden="true" />
              {t('libraryView.prepareWithLaura')}
            </Button>
          </>
        }
      />

      {/* `.a14-filterbar` — UNE ligne : recherche, Usage, Provenance (à choix multiple, décision Louis), le décompte
          à droite. Les deux filtres de la maquette sont là, aucun n'est caché. */}
      <Box className="flex flex-wrap items-center gap-2.5" data-testid="library-filters">
        <label className="flex h-10 min-w-0 flex-1 basis-full items-center gap-2 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 sm:basis-60 sm:max-w-md pointer-coarse:min-h-11">
          <Search className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('libraryView.searchPlaceholder')}
            aria-label={t('libraryView.searchLabel')}
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--bellum-text-primary)] outline-none placeholder:text-[var(--bellum-text-muted)]"
          />
        </label>
        <SequenceMultiSelect
          label={t('libraryView.usageLegend')}
          allLabel={t('libraryView.usageAll')}
          pickedLabel={count => t('libraryView.picked', { count })}
          options={familyOptions}
          values={families}
          onChange={setFamilies}
          testId="library-usage-filter"
        />
        <SequenceMultiSelect
          label={t('libraryView.authorLegend')}
          allLabel={t('libraryView.authorAll')}
          pickedLabel={count => t('libraryView.picked', { count })}
          options={authorOptions}
          values={authors}
          onChange={setAuthors}
          testId="library-author-filter"
        />
        <Text size="xs" className="text-[var(--bellum-text-muted)] sm:ml-auto" role="status">
          {t('libraryView.count', { count: shownCatalog.length + imported.length })}
          {importedAll.length > 0 ? ` · ${t('libraryView.importedCount', { count: importedAll.length })}` : ''}
        </Text>
      </Box>

      {shownCatalog.length === 0 && imported.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]" data-testid="library-no-result">
          {t('libraryView.noResult')}
        </Text>
      ) : null}

      {shownCatalog.length > 0 ? (
        <ul
          className="grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 xl:grid-cols-3"
          data-testid="library-catalog"
        >
          {shownCatalog.map(entry => (
            <li
              key={entry.id}
              data-testid={`catalog-${entry.id}`}
              className="flex min-w-0 flex-col rounded-overlay border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5 transition-colors duration-immediate hover:border-[var(--accent-soft-border)]"
            >
              {/* `.a14-rule-top` — le symbole de l'usage, et sa pastille teintée. */}
              <Box className="flex items-start justify-between gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-card border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]"
                >
                  <FamilyIcon family={entry.family} />
                </span>
                <Badge variant={FAMILY_TONE[entry.family]}>{t(`playbooks.family.${entry.family}`)}</Badge>
              </Box>
              <Text element="h3" size="base" weight="semibold" className="mb-2 mt-3.5 leading-snug">
                {entryName(entry, t)}
              </Text>
              <Text size="xs" className="mb-4 flex-1 leading-relaxed text-[var(--bellum-text-secondary)]">
                {entryHint(entry, t)}
              </Text>
              <Box className="flex flex-wrap gap-2">
                <Badge variant="outline">{t('playbooks.steps', { count: entry.stepKinds.length })}</Badge>
                <Badge variant="outline">
                  {distinctChannels(entry.stepKinds)
                    .map(kind => t(KIND_KEY[kind]))
                    .join(' · ')}{' '}
                  · {t('libraryView.toReview')}
                </Badge>
              </Box>
              <Box className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="pointer-coarse:min-h-11"
                  aria-label={t('libraryView.seeMessagesNamed', { name: entryName(entry, t) })}
                  onClick={() => setPreview({ kind: 'catalog', entry })}
                >
                  {t('libraryView.seeMessages')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="soft"
                  className="pointer-coarse:min-h-11"
                  aria-label={t('starter.useModelNamed', { name: entryName(entry, t) })}
                  onClick={() => openEntry(entry, onUsePlaybook, onUseTemplate)}
                >
                  {t('libraryView.use')}
                </Button>
              </Box>
            </li>
          ))}
        </ul>
      ) : null}

      {imported.length > 0 ? (
        <Box className="mt-2 flex flex-col gap-4" data-testid="library-imported">
          <Box className="flex flex-wrap items-end justify-between gap-2">
            <Box className="flex flex-col gap-1">
              <Text element="h2" size="xl" weight="semibold">
                {t('libraryView.importedTitle')}
              </Text>
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('libraryView.importedLead', { count: imported.length })}
              </Text>
            </Box>
            {lastImport && lastImport.skipped.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="pointer-coarse:min-h-11"
                onClick={() => setDialog('import')}
              >
                {t('libraryView.seeSkipped')}
              </Button>
            ) : null}
          </Box>
          <ul className="grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
            {imported.map(template => (
              <ImportedCard
                key={template.id}
                template={template}
                picking={pickingFor === template.id}
                onPreview={() => setPreview({ kind: 'imported', template })}
                onTogglePick={() => setPickingFor(pickingFor === template.id ? null : template.id)}
                onApplied={result => {
                  setApplied({ name: template.name, result })
                  setPickingFor(null)
                }}
              />
            ))}
          </ul>
          {applied ? <AppliedSummary name={applied.name} result={applied.result} /> : null}
        </Box>
      ) : null}

      <PreviewDialog
        preview={preview}
        onClose={() => setPreview(null)}
        onCopy={copy => {
          setPreview(null)
          setCopy(copy)
        }}
        onUse={entry => {
          setPreview(null)
          openEntry(entry, onUsePlaybook, onUseTemplate)
        }}
        onUseImported={template => {
          setPreview(null)
          setPickingFor(template.id)
        }}
      />
      <CreateModelDialog
        key={dialog === 'create' ? 'open' : 'closed'}
        open={dialog === 'create'}
        onOpenChange={open => setDialog(open ? 'create' : null)}
      />
      {/* « Personnaliser une copie » — la même fenêtre, ouverte sur le modèle lu (une seule définition, GA-26). */}
      {copy ? (
        <CreateModelDialog
          key={`copy-${copy.name}`}
          open
          initial={copy}
          onOpenChange={open => (open ? undefined : setCopy(null))}
        />
      ) : null}
      <LauraModelDialog open={dialog === 'laura'} onOpenChange={open => setDialog(open ? 'laura' : null)} />
      <WebPageModelDialog open={dialog === 'web'} onOpenChange={open => setDialog(open ? 'web' : null)} />
      <ImportCampaignsDialog
        open={dialog === 'import'}
        onOpenChange={open => setDialog(open ? 'import' : null)}
        last={lastImport}
        onImported={setLastImport}
      />
    </Box>
  )
}

/** « Utiliser » : une situation ouvre l'assistant sur son modèle, un gabarit la fenêtre de création présélectionnée. */
function openEntry(
  entry: CatalogEntry,
  onUsePlaybook: (key: OutreachPlaybookKey) => void,
  onUseTemplate: (key: OutreachTemplateKey) => void,
): void {
  if (entry.kind === 'playbook') onUsePlaybook(entry.key as OutreachPlaybookKey)
  else onUseTemplate(entry.key as OutreachTemplateKey)
}

function ImportedCard({
  template,
  picking,
  onPreview,
  onTogglePick,
  onApplied,
}: {
  template: SequenceTemplate
  picking: boolean
  onPreview: () => void
  onTogglePick: () => void
  onApplied: (result: ApplySequenceTemplateResult) => void
}) {
  const { t } = useTranslation('outreach')
  const remove = useDeleteSequenceTemplate()
  const setVisibility = useSetSequenceTemplateVisibility()
  const callScripts = template.call_scripts ?? []
  return (
    <li
      data-testid={`imported-${template.id}`}
      className="flex min-w-0 flex-col gap-3 rounded-overlay border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5 transition-colors duration-immediate hover:border-[var(--accent-soft-border)]"
    >
      <Box className="flex flex-wrap gap-2">
        {template.tier_label ? (
          <Badge variant="primary">{t('library.tier', { tier: template.tier_label })}</Badge>
        ) : null}
        {template.sector ? <Badge>{template.sector}</Badge> : null}
      </Box>
      <Box className="flex flex-col gap-1">
        <Text element="h3" size="base" weight="semibold" className="leading-snug">
          {template.name}
        </Text>
        <Text size="xs" className="leading-relaxed text-[var(--bellum-text-secondary)]">
          {t('libraryView.importedHint')}
        </Text>
      </Box>
      <Box className="flex flex-wrap gap-2">
        <Badge>
          {t('library.steps', { count: template.steps.length })} · {cadenceLabel(template)}
        </Badge>
        {callScripts.length > 0 ? <Badge>{t('library.callScripts', { count: callScripts.length })}</Badge> : null}
      </Box>
      <SharedContentMeta
        visibility={template.visibility}
        createdBy={template.created_by}
        updatedAt={template.updated_at}
        createdAt={template.created_at}
        pending={setVisibility.isPending}
        onSetVisibility={visibility => setVisibility.mutate({ id: template.id, visibility })}
      />
      <Box className="mt-auto flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="pointer-coarse:min-h-11"
          aria-label={t('libraryView.seeMessagesNamed', { name: template.name })}
          onClick={onPreview}
        >
          {t('libraryView.seeMessages')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="soft"
          className="pointer-coarse:min-h-11"
          aria-expanded={picking}
          aria-label={t('starter.useModelNamed', { name: template.name })}
          onClick={onTogglePick}
        >
          {t('libraryView.use')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="pointer-coarse:min-h-11"
          disabled={remove.isPending}
          onClick={() => remove.mutate(template.id)}
        >
          {t('library.remove')}
        </Button>
      </Box>
      {picking ? <ContactPicker templateId={template.id} onApplied={onApplied} /> : null}
    </li>
  )
}

/**
 * « Personnaliser une copie » : le nom suivi de « (copie) », l'usage du modèle, et ses étapes — les textes d'un modèle
 * importé tels qu'écrits, sinon (un modèle de départ n'a pas de texte figé) la trame de départ de son usage, aux
 * jours du modèle. Jamais un champ vide.
 */
function copyOf(preview: Preview, title: string, t: TFunction<'outreach'>): ModelCopy {
  const name = t('libraryView.copyName', { name: title })
  if (preview.kind === 'imported') {
    return {
      name,
      family: 'prospecting',
      steps: preview.template.steps.map(step => ({
        day: step.delay_days,
        subject: step.subject ?? '',
        body: step.body,
      })),
    }
  }
  const starter = starterSteps(preview.entry.family, t)
  const days =
    preview.entry.kind === 'playbook'
      ? OUTREACH_PLAYBOOKS[preview.entry.key as OutreachPlaybookKey].steps.map(step => step.offset_days)
      : OUTREACH_SEQUENCE_TEMPLATES[preview.entry.key as OutreachTemplateKey].steps.map(step => step.offset_days)
  return {
    name,
    family: preview.entry.family,
    steps: starter.map((step, index) => ({ ...step, day: days[index] ?? step.day })),
  }
}

const FAMILY_ICON = {
  prospecting: Compass,
  development: TrendingUp,
  meeting: CalendarCheck,
  staffing: UserRound,
  mission_follow_up: Briefcase,
  admin: FileCheck,
} as const satisfies Record<PlaybookFamily, typeof Compass>

function FamilyIcon({ family }: { family: PlaybookFamily }) {
  const Icon = FAMILY_ICON[family]
  return <Icon className="size-4" />
}

function PreviewDialog({
  preview,
  onClose,
  onCopy,
  onUse,
  onUseImported,
}: {
  preview: Preview | null
  onClose: () => void
  onCopy: (copy: ModelCopy) => void
  onUse: (entry: CatalogEntry) => void
  onUseImported: (template: SequenceTemplate) => void
}) {
  const { t } = useTranslation('outreach')
  const { t: tc } = useTranslation('common')
  const remove = useDeleteSequenceTemplate()
  if (!preview) return null
  const title = preview.kind === 'catalog' ? entryName(preview.entry, t) : preview.template.name
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent closeLabel={tc('actions.close')} className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {preview.kind === 'catalog' ? entryHint(preview.entry, t) : t('libraryView.importedHint')}
          </DialogDescription>
        </DialogHeader>
        <Box className="flex flex-wrap gap-2">
          {preview.kind === 'catalog' ? (
            <>
              <Badge variant={FAMILY_TONE[preview.entry.family]}>{t(`playbooks.family.${preview.entry.family}`)}</Badge>
              <Badge>{t('playbooks.steps', { count: preview.entry.stepKinds.length })}</Badge>
              <Badge>{t('playbooks.span', { count: preview.entry.spanDays })}</Badge>
            </>
          ) : (
            <>
              {preview.template.tier_label ? (
                <Badge variant="primary">{t('library.tier', { tier: preview.template.tier_label })}</Badge>
              ) : null}
              <Badge>{t('library.steps', { count: preview.template.steps.length })}</Badge>
              <Badge>{t(`library.shared.${preview.template.visibility === 'team' ? 'team' : 'personal'}`)}</Badge>
            </>
          )}
        </Box>
        <ol className="flex list-none flex-col gap-3 p-0" data-testid="preview-steps">
          {preview.kind === 'catalog' ? (
            <CatalogSteps entry={preview.entry} t={t} />
          ) : (
            <ImportedSteps template={preview.template} t={t} />
          )}
        </ol>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('libraryView.previewNote')}
        </Text>
        {/* Théo C sequences-bibliotheque — [Fermer] [Retirer] [Personnaliser une copie] [Utiliser ce modèle]. « Retirer »
            (le geste existant, sur les modèles importés seulement) reste nommé ainsi : il SUPPRIME — l'appeler
            « Archiver » comme la maquette mentirait (à trancher par Louis : un vrai archivage demande l'API). */}
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Box className="flex flex-wrap gap-2">
            <Button variant="outline" className="pointer-coarse:min-h-11" onClick={onClose}>
              {tc('actions.close')}
            </Button>
            {preview.kind === 'imported' ? (
              <Button
                variant="ghost"
                className="pointer-coarse:min-h-11"
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate(preview.template.id)
                  onClose()
                }}
              >
                {t('library.remove')}
              </Button>
            ) : null}
          </Box>
          <Box className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="pointer-coarse:min-h-11"
              onClick={() => onCopy(copyOf(preview, title, t))}
            >
              {t('libraryView.copy')}
            </Button>
            <Button
              className="pointer-coarse:min-h-11"
              onClick={() => (preview.kind === 'catalog' ? onUse(preview.entry) : onUseImported(preview.template))}
            >
              {t('libraryView.useThisModel')}
            </Button>
          </Box>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StepShell({ day, children }: { day: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-1 rounded-lg bg-[var(--bellum-surface-2)] p-3">
      <Text size="xs" weight="medium" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
        {day}
      </Text>
      {children}
    </li>
  )
}

function CatalogSteps({ entry, t }: { entry: CatalogEntry; t: TFunction<'outreach'> }) {
  if (entry.kind === 'playbook') {
    const key = entry.key as OutreachPlaybookKey
    return (
      <>
        {OUTREACH_PLAYBOOKS[key].steps.map((step, index) => {
          const [, tipIndex] = step.tipKey.split('.')
          return (
            <StepShell key={step.tipKey} day={t('libraryView.stepDay', { n: index + 1, day: step.offset_days })}>
              <Box className="flex flex-wrap items-center gap-2">
                <Badge>{t(KIND_KEY[step.kind])}</Badge>
                <Text size="sm" weight="medium">
                  {t(`playbooks.intent.${step.intent}`)}
                </Text>
              </Box>
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t(`playbooks.tip.${key}.${tipIndex}`)}
              </Text>
            </StepShell>
          )
        })}
      </>
    )
  }
  const key = entry.key as OutreachTemplateKey
  return (
    <>
      {OUTREACH_SEQUENCE_TEMPLATES[key].steps.map((step, index) => (
        <StepShell key={step.purposeKey} day={t('libraryView.stepDay', { n: index + 1, day: step.offset_days })}>
          <Box className="flex flex-wrap items-center gap-2">
            <Badge>{t(KIND_KEY[step.kind])}</Badge>
          </Box>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t(`templates.purpose.${step.purposeKey}`)}
          </Text>
        </StepShell>
      ))}
    </>
  )
}

function ImportedSteps({ template, t }: { template: SequenceTemplate; t: TFunction<'outreach'> }) {
  return (
    <>
      {template.steps.map((step, index) => (
        <StepShell key={step.position} day={t('libraryView.stepDay', { n: index + 1, day: step.delay_days })}>
          {step.subject ? (
            <Text size="sm" weight="medium">
              {step.subject}
            </Text>
          ) : null}
          <Text size="sm" className="whitespace-pre-wrap text-[var(--bellum-text-secondary)]">
            {step.body}
          </Text>
        </StepShell>
      ))}
      {(template.call_scripts ?? []).map(script => (
        <StepShell key={`script-${script.position}`} day={t('libraryView.script')}>
          <Text size="sm" weight="medium">
            {script.title}
          </Text>
          <Text size="sm" className="whitespace-pre-wrap text-[var(--bellum-text-secondary)]">
            {script.body}
          </Text>
        </StepShell>
      ))}
    </>
  )
}
