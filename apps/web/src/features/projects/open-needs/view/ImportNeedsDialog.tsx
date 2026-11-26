import { emptyNeedFilters, needFiltersToQuery } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SelectField,
  Text,
} from '@bellum/ui'
import { useQueryClient } from '@tanstack/react-query'
import { FileUp, Loader2, TriangleAlert, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { openNeedsApi } from '../api'
import {
  MAX_NEED_IMPORT_FILE_MB,
  MAX_NEED_IMPORT_FILES,
  markNeedImportDuplicates,
  needImportRowsToCreate,
  type NeedImportRow,
} from '../model/need-import'
import {
  createNeedImportRow,
  runNeedImportCreation,
  runNeedImportExtraction,
  type NeedImportCreateOutcome,
} from '../lib/needImportBatch'

type Phase = 'pick' | 'extracting' | 'preview'

/**
 * L'IMPORT EN MASSE DE FICHES DE POSTE (#2173.56) — décision de Louis
 * (18/09/2026 au soir, QCM). Voir `model/need-import.ts` pour la doctrine
 * complète : le MÊME moteur d'extraction que `NeedWizard.tsx`, un titre pris
 * sur le NOM du fichier (jamais deviné dans le document), et la borne à dix
 * fichiers justifiée contre `cvBatch.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX PHASES, JAMAIS UNE CRÉATION SANS RELECTURE (règle 2)
 * ─────────────────────────────────────────────────────────────────────────
 * `extract()` n'appelle QUE `rfpApi.create` (via `runNeedImportExtraction`) —
 * aucun besoin n'est écrit à cette étape. La création (`POST /projects/needs`)
 * ne part qu'au clic sur le bouton de validation, et seulement pour les lignes
 * COCHÉES — jamais celles décochées, jamais un doublon signalé qui reste
 * décoché par défaut (règle 4).
 */
export function ImportNeedsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('projects')
  const qc = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)

  const [accountId, setAccountId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [pickError, setPickError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('pick')
  const [rows, setRows] = useState<NeedImportRow[]>([])
  const [selection, setSelection] = useState<Set<number>>(new Set())
  const [outcomes, setOutcomes] = useState<Map<number, NeedImportCreateOutcome>>(new Map())
  const [creating, setCreating] = useState(false)

  const { data: accountPages } = useAccounts({ limit: 100 })
  const accountOptions = useMemo(
    () =>
      (accountPages?.pages ?? [])
        .flatMap(page => page?.data ?? [])
        .map(row => ({ value: row.id, label: row.company_name ?? t('kinds.manual') })),
    [accountPages, t],
  )

  function reset() {
    setAccountId('')
    setFiles([])
    setPickError(null)
    setPhase('pick')
    setRows([])
    setSelection(new Set())
    setOutcomes(new Map())
    setCreating(false)
  }

  function close() {
    reset()
    onOpenChange(false)
  }

  function addFiles(list: FileList) {
    setPickError(null)
    const incoming = Array.from(list)
    if (incoming.length > MAX_NEED_IMPORT_FILES) {
      setPickError(t('openNeeds.importNeeds.pick.tooMany', { max: MAX_NEED_IMPORT_FILES }))
      return
    }
    setFiles(incoming)
  }

  function removeFile(index: number) {
    setFiles(current => current.filter((_file, position) => position !== index))
  }

  async function extract() {
    setPhase('extracting')
    const extracted = await runNeedImportExtraction(files)
    // La détection de doublon est un CONFORT de relecture, pas un blocage :
    // une panne de lecture des besoins existants n'empêche pas l'import, elle
    // laisse simplement passer sans le signal « déjà importé ».
    let existingTitles: string[] = []
    try {
      const query = needFiltersToQuery(
        { ...emptyNeedFilters(), account_id: accountId, include_closed: true },
        { offset: 0, limit: 200 },
      )
      const existing = await openNeedsApi.list(query)
      existingTitles = existing.data.map(row => row.title)
    } catch {
      existingTitles = []
    }
    const marked = markNeedImportDuplicates(extracted, existingTitles)
    setRows(marked)
    // Tout est coché par défaut SAUF un doublon signalé (règle 4) — « tout
    // valider en un geste » reste permis, mais un doublon ne se crée pas en
    // silence.
    setSelection(
      new Set(marked.flatMap((row, index) => (row.status === 'extracted' && row.duplicateOf === null ? [index] : []))),
    )
    setPhase('preview')
  }

  function toggleSelected(index: number) {
    setSelection(current => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function updateTitle(index: number, title: string) {
    setRows(current => current.map((row, position) => (position === index ? { ...row, title } : row)))
  }

  async function submit() {
    const toCreate = needImportRowsToCreate(rows, selection)
    if (toCreate.length === 0) return
    setCreating(true)
    const indexByFile = new Map(rows.map((row, index) => [row, index] as const))
    const results = await runNeedImportCreation(toCreate, row => createNeedImportRow(row, accountId))
    const next = new Map(outcomes)
    results.forEach((outcome, position) => {
      const row = toCreate[position]
      const index = row !== undefined ? indexByFile.get(row) : undefined
      if (index !== undefined) next.set(index, outcome)
    })
    setOutcomes(next)
    setCreating(false)
    if (results.some(outcome => outcome.status === 'created')) void qc.invalidateQueries({ queryKey: ['open-needs'] })
  }

  const selectedCount = selection.size
  const canExtract = accountId.length > 0 && files.length > 0 && phase === 'pick'
  const allDone = outcomes.size > 0 && outcomes.size === needImportRowsToCreate(rows, selection).length

  return (
    <Dialog open={open} onOpenChange={value => (value ? undefined : close())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('openNeeds.importNeeds.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('openNeeds.importNeeds.dialogDescription')}</DialogDescription>
        </DialogHeader>

        {phase === 'pick' || phase === 'extracting' ? (
          <Box className="space-y-3">
            <Box className="space-y-1.5">
              <Label htmlFor="need-import-account">{t('openNeeds.importNeeds.pick.accountLabel')}</Label>
              <SelectField
                id="need-import-account"
                value={accountId}
                onChange={setAccountId}
                options={accountOptions}
                emptyOption={{ label: t('openNeeds.importNeeds.pick.accountPlaceholder') }}
                ariaLabel={t('openNeeds.importNeeds.pick.accountLabel')}
                disabled={phase === 'extracting'}
              />
            </Box>

            <Box className="space-y-1.5">
              <Label>{t('openNeeds.importNeeds.pick.filesLabel')}</Label>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={phase === 'extracting'}
                className="flex w-full flex-col items-center gap-1 rounded-md border border-dashed border-[var(--bellum-border)] p-4 text-center disabled:opacity-60"
              >
                <FileUp className="size-5 text-[var(--bellum-text-accent)]" aria-hidden />
                <Text size="sm">{t('openNeeds.importNeeds.pick.dropLabel')}</Text>
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('openNeeds.importNeeds.pick.hint', {
                    maxMb: MAX_NEED_IMPORT_FILE_MB,
                    maxFiles: MAX_NEED_IMPORT_FILES,
                  })}
                </Text>
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt"
                aria-label={t('openNeeds.importNeeds.pick.fileInputLabel')}
                className="hidden"
                onChange={event => {
                  if (event.target.files) addFiles(event.target.files)
                  event.target.value = ''
                }}
              />
              {pickError ? (
                <Text size="xs" role="alert" className="text-[var(--danger-soft-text)]">
                  {pickError}
                </Text>
              ) : null}
              {files.length > 0 ? (
                <Box className="space-y-1">
                  {files.map((file, index) => (
                    <Box
                      key={`${file.name}-${index}`}
                      display="flex"
                      className="items-center justify-between gap-2 rounded border border-[var(--bellum-border)] p-1.5"
                    >
                      <Text size="xs" className="truncate">
                        {file.name}
                      </Text>
                      <button
                        type="button"
                        aria-label={t('openNeeds.importNeeds.pick.remove', { file: file.name })}
                        onClick={() => removeFile(index)}
                        disabled={phase === 'extracting'}
                      >
                        <X className="size-3.5 text-[var(--bellum-text-muted)]" aria-hidden />
                      </button>
                    </Box>
                  ))}
                </Box>
              ) : null}
            </Box>

            {phase === 'extracting' ? (
              <Box display="flex" className="items-center gap-1.5">
                <Loader2 className="size-4 animate-spin text-[var(--bellum-text-muted)]" aria-hidden />
                <Text size="sm" color="text-[var(--bellum-text-muted)]">
                  {t('openNeeds.importNeeds.pick.extracting', { count: files.length })}
                </Text>
              </Box>
            ) : (
              <Box display="flex" className="justify-end gap-2">
                <Button variant="outline" onClick={close}>
                  {t('openNeeds.importNeeds.pick.cancel')}
                </Button>
                <Button onClick={() => void extract()} disabled={!canExtract}>
                  {t('openNeeds.importNeeds.pick.extract')}
                </Button>
              </Box>
            )}
          </Box>
        ) : (
          <Box className="space-y-3">
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('openNeeds.importNeeds.preview.hint')}
            </Text>

            <Box className="space-y-2">
              {rows.map((row, index) => {
                const outcome = outcomes.get(index)
                if (row.status === 'too_large') {
                  return (
                    <NamedFailure
                      key={row.file}
                      file={row.file}
                      reason={t('openNeeds.importNeeds.preview.tooLarge', { max: MAX_NEED_IMPORT_FILE_MB })}
                    />
                  )
                }
                if (row.status === 'failed') {
                  return <NamedFailure key={row.file} file={row.file} reason={row.reason} />
                }
                return (
                  <Box key={row.file} className="space-y-1.5 rounded-md border border-[var(--bellum-border)] p-2.5">
                    <Box display="flex" className="items-start gap-2">
                      <Checkbox
                        aria-label={row.title || row.file}
                        checked={selection.has(index)}
                        onCheckedChange={() => toggleSelected(index)}
                        disabled={creating || outcome !== undefined}
                      />
                      <Box className="min-w-0 flex-1 space-y-1">
                        <Input
                          aria-label={t('openNeeds.importNeeds.preview.titleLabel')}
                          value={row.title}
                          onChange={event => updateTitle(index, event.target.value)}
                          disabled={creating || outcome !== undefined}
                        />
                        <Text size="xs" color="text-[var(--bellum-text-muted)]">
                          {row.file}
                          {' — '}
                          {row.skills.length > 0
                            ? t('openNeeds.importNeeds.preview.skillsFound', { count: row.skills.length })
                            : t('openNeeds.importNeeds.preview.noSkills')}
                        </Text>
                        {row.duplicateOf ? (
                          <Badge variant="warning">
                            {t('openNeeds.importNeeds.preview.duplicate', { title: row.duplicateOf })}
                          </Badge>
                        ) : null}
                        {outcome ? (
                          outcome.status === 'created' ? (
                            <Badge variant="success">{t('openNeeds.importNeeds.preview.created')}</Badge>
                          ) : (
                            <Badge variant="danger">
                              {t('openNeeds.importNeeds.preview.createFailed', { reason: outcome.reason })}
                            </Badge>
                          )
                        ) : null}
                      </Box>
                    </Box>
                  </Box>
                )
              })}
            </Box>

            <Box display="flex" className="justify-end gap-2">
              <Button variant="outline" onClick={close}>
                {allDone ? t('openNeeds.importNeeds.preview.close') : t('openNeeds.importNeeds.pick.cancel')}
              </Button>
              {!allDone ? (
                <Button onClick={() => void submit()} disabled={selectedCount === 0 || creating}>
                  {creating
                    ? t('openNeeds.importNeeds.preview.creating')
                    : t('openNeeds.importNeeds.preview.submit', { count: selectedCount })}
                </Button>
              ) : null}
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  )
}

function NamedFailure({ file, reason }: { file: string; reason: string }) {
  return (
    <Box display="flex" className="items-start gap-2 rounded-md border border-[var(--bellum-border)] p-2.5">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--danger-soft-text)]" aria-hidden />
      <Box className="min-w-0">
        <Text size="sm" weight="medium" className="block truncate">
          {file}
        </Text>
        <Text size="xs" role="alert" className="text-[var(--danger-soft-text)]">
          {reason}
        </Text>
      </Box>
    </Box>
  )
}
