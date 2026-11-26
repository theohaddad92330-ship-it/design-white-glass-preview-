import {
  CONTEXT_PACK_EXTENSIONS,
  contextPackExtension,
  type ContextPackClassification,
  type ContextPackDestination,
  type ContextPackImportOutcome,
} from '@bellum/contracts'
import { Button, SelectField, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Upload } from 'lucide-react'
import { useCallback, useId, useState, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CONTEXT_PACK_LINKS, classifyContextFile, importContextFile } from '../lib/context-pack'

/**
 * import-contexte Je.3 — « Dépose tes documents » (R21-JE, Julien Seigneur / exFabrica).
 *
 * UNE zone, plusieurs fichiers d'un coup, montée à l'onboarding (étape « Ton audit ») ET en tête de
 * /settings/import. Chaque fichier est CLASSÉ par le serveur (déterministe, aucun modèle), l'utilisateur VOIT la
 * destination et la raison (« reconnu comme grille go/no-go — colonnes Critère, Poids »), peut la changer, et rien
 * ne part sans son clic « Ajouter ces documents ». L'import appelle l'importeur existant ; un échec reste par fichier.
 */

/** L'ancre de la zone : les cartes de /settings/import qui ne lisent pas un format renvoient ICI. */
export const CONTEXT_PACK_ANCHOR = 'depose-tes-documents'

const isSupported = (fileName: string) =>
  (CONTEXT_PACK_EXTENSIONS as readonly string[]).includes(contextPackExtension(fileName))
const ACCEPT = CONTEXT_PACK_EXTENSIONS.map(ext => `.${ext}`).join(',')
// #4426.4 — l'onglet à lire pour la destination choisie : celui qui a décidé le classement, ou un autre onglet
// reconnu pour cette destination ; connaissances et fichier à un onglet = rien (le fichier part entier).
function sheetFor(row: { classification: ContextPackClassification | null; destination: ContextPackDestination }) {
  const c = row.classification
  if (!c || row.destination === 'knowledge') return null
  if (row.destination === c.destination) return c.sheet
  return c.otherSheets.find(other => other.destination === row.destination)?.sheet ?? null
}

const REPLACING: ReadonlySet<ContextPackDestination> = new Set(['target_personas', 'qualification_grid'])

type Row = {
  key: string
  file: File
  classification: ContextPackClassification | null
  /** Le classement a échoué (réseau…) : le fichier part en connaissances, la ligne le dit. */
  unavailable: boolean
  /** #4426.1 — un format que l'app ne lit pas : la ligne le dit, le fichier n'est ni classé ni importé. */
  unsupported: boolean
  destination: ContextPackDestination
  outcome: ContextPackImportOutcome | null
}

export function ContextPackDropzone({
  className,
  moreChoices,
}: {
  className?: string
  /** #4426.1 — les autres façons d'importer vivent DANS la zone, comme des choix (jamais une entrée de plus sur la page). */
  moreChoices?: ReactNode
}) {
  const { t } = useTranslation('importWizard')
  const inputId = useId()
  const [rows, setRows] = useState<Row[]>([])
  const [importing, setImporting] = useState(false)

  const patch = useCallback(
    (key: string, changes: Partial<Row>) =>
      setRows(current => current.map(row => (row.key === key ? { ...row, ...changes } : row))),
    [],
  )

  const addFiles = useCallback(
    (list: FileList | File[] | null) => {
      const files = Array.from(list ?? [])
      const added = files.map<Row>((file, index) => ({
        key: `${Date.now()}-${index}-${file.name}`,
        file,
        classification: null,
        unavailable: false,
        unsupported: !isSupported(file.name),
        destination: 'knowledge',
        outcome: null,
      }))
      setRows(current => [...current, ...added])
      for (const row of added.filter(added => !added.unsupported)) {
        classifyContextFile(row.file)
          .then(classification => patch(row.key, { classification, destination: classification.destination }))
          .catch(() => patch(row.key, { unavailable: true }))
      }
    },
    [patch],
  )

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    addFiles(event.dataTransfer.files)
  }

  const pending = rows.filter(row => row.outcome === null && !row.unsupported)
  const classifying = pending.some(row => row.classification === null && !row.unavailable)

  const runImport = async () => {
    setImporting(true)
    // Un fichier après l'autre : deux imports qui REMPLACENT (postes, grille) ne se croisent jamais.
    for (const row of pending) {
      patch(row.key, { outcome: await importContextFile(row.file, row.destination, sheetFor(row)) })
    }
    setImporting(false)
  }

  const reasonOf = (row: Row): string => {
    if (row.unsupported) {
      const ext = contextPackExtension(row.file.name)
      return t(ext ? 'contextPack.reason.unsupported' : 'contextPack.reason.noExtension', {
        ext,
        formats: CONTEXT_PACK_EXTENSIONS.join(', '),
      })
    }
    const c = row.classification
    if (!c) return row.unavailable ? t('contextPack.reason.unavailable') : t('contextPack.classifying')
    if (c.rule === 'headers' && c.destination !== 'knowledge' && c.sheet) {
      // #4426.4 — l'onglet retenu est NOMMÉ, et les autres onglets reconnus aussi.
      const named = t('contextPack.reason.sheet', {
        sheet: c.sheet,
        what: t(`contextPack.recognized.${c.destination}`),
        columns: c.matchedHeaders.join(', '),
      })
      if (c.otherSheets.length === 0) return named
      const others = c.otherSheets
        .map(other =>
          t('contextPack.reason.otherSheet', {
            sheet: other.sheet,
            what: t(`contextPack.recognized.${other.destination}`),
          }),
        )
        .join(' ; ')
      return `${named} — ${t('contextPack.reason.otherSheets', { others })}`
    }
    if (c.rule === 'headers' && c.destination !== 'knowledge') {
      return t('contextPack.reason.headers', {
        what: t(`contextPack.recognized.${c.destination}`),
        columns: c.matchedHeaders.join(', '),
      })
    }
    return t(`contextPack.reason.${c.rule}`, { count: c.sheetCount ?? undefined })
  }

  const failureOf = (message: string): string => {
    if (message.startsWith('missing_columns:')) {
      const columns = message
        .slice('missing_columns:'.length)
        .split(',')
        .map(column => t(`contextPack.missingColumn.${column}`, { defaultValue: column }))
      return t('contextPack.missingColumns', { columns: columns.join(', ') })
    }
    return message === 'unknown' ? t('contextPack.unknownError') : message
  }

  return (
    <section
      id={CONTEXT_PACK_ANCHOR}
      aria-labelledby={`${inputId}-title`}
      className={`rounded-card border border-[var(--bellum-border)] bg-card p-4 md:p-6 ${className ?? ''}`}
      data-testid="context-pack-dropzone"
    >
      <Text element="h2" size="base" weight="semibold" className="text-[var(--text-primary)]" id={`${inputId}-title`}>
        {t('contextPack.title')}
      </Text>
      <Text size="sm" className="mt-1 text-[var(--text-muted)]">
        {t('contextPack.description')}
      </Text>
      <Text size="xs" className="mt-1 text-[var(--text-muted)]">
        {t('contextPack.formats', { formats: CONTEXT_PACK_EXTENSIONS.join(', ') })}
      </Text>

      <label
        htmlFor={inputId}
        onDragOver={event => event.preventDefault()}
        onDrop={onDrop}
        className="mt-4 flex min-h-11 cursor-pointer flex-wrap items-center gap-3 rounded-lg border border-dashed border-[var(--border-default)] p-4 focus-within:ring-2 focus-within:ring-[var(--bellum-focus-ring)]"
      >
        <Upload aria-hidden className="size-5 text-[var(--text-muted)]" />
        <Text size="sm" weight="medium" className="text-[var(--text-primary)]">
          {t('contextPack.choose')}
        </Text>
        <Text size="sm" className="text-[var(--text-muted)]">
          {t('contextPack.dropHint')}
        </Text>
        <input
          id={inputId}
          type="file"
          multiple
          accept={ACCEPT}
          aria-label={t('contextPack.inputLabel')}
          className="sr-only"
          onChange={event => {
            addFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </label>

      {rows.length > 0 ? (
        <ul aria-label={t('contextPack.listLabel')} className="mt-4 space-y-3">
          {rows.map(row => (
            <li key={row.key} className="rounded-lg border border-[var(--border-subtle)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Text size="sm" weight="medium" className="break-words text-[var(--text-primary)]">
                    {row.file.name}
                  </Text>
                  <Text size="xs" className="text-[var(--text-muted)]">
                    {reasonOf(row)}
                  </Text>
                </div>
                {row.outcome === null && !row.unsupported ? (
                  <SelectField
                    ariaLabel={t('contextPack.selectLabel', { file: row.file.name })}
                    value={row.destination}
                    disabled={importing}
                    onChange={next => patch(row.key, { destination: next as ContextPackDestination })}
                    options={(row.classification?.allowedDestinations ?? ['knowledge']).map(destination => ({
                      value: destination,
                      label: t(`contextPack.destination.${destination}`),
                    }))}
                    className="h-11 w-full sm:w-64"
                  />
                ) : null}
              </div>
              {row.outcome === null && REPLACING.has(row.destination) ? (
                <Text size="xs" className="mt-1 text-[var(--text-muted)]">
                  {t('contextPack.replaces')}
                </Text>
              ) : null}
              {row.outcome ? <OutcomeLine outcome={row.outcome} failureOf={failureOf} /> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {pending.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="black"
            size="sm"
            className="min-h-11"
            disabled={importing || classifying}
            onClick={() => void runImport()}
          >
            {importing ? t('contextPack.importing') : t('contextPack.import')}
          </Button>
          <Text size="xs" className="text-[var(--text-muted)]">
            {t('contextPack.nothingYet')}
          </Text>
        </div>
      ) : null}
      {moreChoices}
    </section>
  )
}

/** #4893.2 — nomme la valeur lue quand on l'a ; sans elle, aucune parenthèse vide « (—) ». */
function skippedLineText(
  t: (key: string, options?: Record<string, unknown>) => string,
  row: { line: number; reason: string; label: string | null },
): string {
  const reason = t(`contextPack.skipReason.${row.reason}`, { defaultValue: row.reason })
  if (!row.label) return t('contextPack.skippedLineBare', { line: row.line, reason })
  const named = t(`contextPack.skipReasonValue.${row.reason}`, { label: row.label, defaultValue: '' })
  if (named) return t('contextPack.skippedLineBare', { line: row.line, reason: named })
  return t('contextPack.skippedLine', { line: row.line, reason, label: row.label })
}

function OutcomeLine({
  outcome,
  failureOf,
}: {
  outcome: ContextPackImportOutcome
  failureOf: (message: string) => string
}) {
  const { t } = useTranslation('importWizard')
  if (outcome.status === 'failed') {
    return (
      <Text size="sm" role="alert" className="mt-2 text-[var(--danger-soft-text)]">
        {t('contextPack.failed', { message: failureOf(outcome.message) })}
      </Text>
    )
  }
  const { destination, count, skipped, skippedDetails, scripts, mails } = outcome
  // `count: null` (comptes, écrits en tâche de fond) : une phrase, jamais « 0 compte ».
  const taken =
    count === null || destination === 'accounts' || destination === 'knowledge'
      ? t(`contextPack.taken.${destination === 'knowledge' ? 'knowledge' : 'accounts'}`)
      : t(`contextPack.taken.${destination}`, { count })
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <Text size="sm" className="text-[var(--success-soft-text)]">
        {taken}
      </Text>
      {mails ? (
        <Text size="xs" className="text-[var(--text-muted)]">
          {t('contextPack.mails', { count: mails })}
        </Text>
      ) : null}
      {scripts ? (
        <Text size="xs" className="text-[var(--text-muted)]">
          {t('contextPack.scripts', { count: scripts })}
        </Text>
      ) : null}
      {skipped > 0 ? (
        // #4426.7 — le MOTIF de chaque ligne écartée se déplie : « 54 lignes écartées » sans raison ne se corrige pas.
        <details className="min-w-0 text-xs text-[var(--text-muted)]">
          <summary className="inline-flex min-h-11 cursor-pointer items-center">
            {t('contextPack.skipped', { count: skipped })}
          </summary>
          <ul className="list-disc pl-5">
            {(skippedDetails ?? []).map(row => (
              <li key={`${row.line}-${row.reason}`}>{skippedLineText(t, row)}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <Link
        to={CONTEXT_PACK_LINKS[destination]}
        className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
      >
        {t(`contextPack.link.${destination}`)}
      </Link>
    </div>
  )
}
