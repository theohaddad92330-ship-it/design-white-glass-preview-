import { Button } from '@bellum/ui'
import { useMutation } from '@tanstack/react-query'
import { Check, Table2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { googleApi, type ExportSheetInput } from '@/features/google/api'
import { useGoogleStatus } from '@/features/google/hooks/useGoogleStatus'
import { useDataExit, workspaceRuleRefusalText } from '@/lib/data-exit'

/** Minimal contact shape needed for the export (mirrors the CSV export columns). */
type SheetExportContact = {
  full_name?: string | null
  title?: string | null
  company_name?: string | null
  entity?: string | null
  decision_role?: string | null
  priority?: number | string | null
  email?: string | null
  phone?: string | null
  linkedin_url?: string | null
  user_status?: string | null
  source?: string | null
}

type ExportSheetButtonProps = {
  contacts?: SheetExportContact[]
  /** #4073.5 — un tableau DÉJÀ composé (colonnes + lignes) : il remplace le mapping des contacts. */
  table?: { columns: string[]; rows: string[][] }
  /** Spreadsheet title (e.g. "Contacts — ACME"). */
  title: string
  variant?: 'black' | 'outline' | 'light' | 'default' | 'ghost'
  size?: 'sm' | 'lg' | 'default'
  label?: string
}

const cell = (value: unknown): string => (value === null || value === undefined ? '' : String(value))

/**
 * Export the given contacts into a brand-new Google Sheet in the user's Drive.
 * Columns mirror the CSV export (identity + scores + provenance). Values are sent
 * as literal `stringValue` cells (never formulas) so there is no injection surface.
 * Not connected / missing the spreadsheets scope → the click routes to consent.
 */
export function ExportSheetButton({
  contacts = [],
  table,
  title,
  variant = 'outline',
  size = 'sm',
  label,
}: ExportSheetButtonProps) {
  const { t } = useTranslation('google')
  // #2081.14 — une feuille Google est une SORTIE de données vers un outil
  // externe : masquée sous la règle d'espace « administrateurs seulement ».
  const dataExit = useDataExit()
  const { data: status } = useGoogleStatus()
  const canExport = (status?.connected ?? false) && (status?.capabilities?.sheets ?? false)

  const connect = useMutation({
    // #2078.23 — exporter vers une feuille est une ÉCRITURE : ce geste-là, et lui
    // seul, demande le niveau lecture + écriture.
    mutationFn: () => googleApi.connectUrl('read_write'),
    onSuccess: ({ url }) => {
      window.location.href = url
    },
    onError: () => toast.error(t('connect.error')),
  })

  // G.5 — la feuille créée pour CETTE liste. Tant que la liste exportée ne change
  // pas, le bouton dit « créée » et ouvre la feuille au lieu d'en recréer une.
  const payloadKey = table ? JSON.stringify(table) : JSON.stringify(contacts)
  const [created, setCreated] = useState<{ key: string; url: string | null } | null>(null)
  const createdHere = created?.key === payloadKey ? created : null

  const exportSheet = useMutation({
    mutationFn: (input: ExportSheetInput) => googleApi.exportSheet(input),
    onSuccess: result => {
      setCreated({ key: payloadKey, url: result.spreadsheetUrl ?? null })
      if (result.spreadsheetUrl) {
        toast.success(t('sheets.created'), {
          action: { label: t('sheets.open'), onClick: () => window.open(result.spreadsheetUrl ?? '', '_blank') },
        })
      } else {
        toast.success(t('sheets.created'))
      }
    },
    onError: (err: unknown) =>
      toast.error(workspaceRuleRefusalText(err) ?? (err instanceof Error ? err.message : t('sheets.error'))),
  })

  const columns = [
    t('sheets.columns.name'),
    t('sheets.columns.title'),
    t('sheets.columns.company'),
    t('sheets.columns.entity'),
    t('sheets.columns.role'),
    t('sheets.columns.priority'),
    t('sheets.columns.email'),
    t('sheets.columns.phone'),
    'LinkedIn',
    t('sheets.columns.status'),
    t('sheets.columns.source'),
  ]

  const handleClick = () => {
    if (exportSheet.isPending) return
    if (createdHere) {
      if (createdHere.url) window.open(createdHere.url, '_blank')
      return
    }
    if (!canExport) {
      toast.info(t('sheets.connectFirst'))
      connect.mutate()
      return
    }
    if (table) {
      if (table.rows.length === 0) {
        toast.info(t('sheets.empty'))
        return
      }
      exportSheet.mutate({ title, columns: table.columns, rows: table.rows })
      return
    }
    if (contacts.length === 0) {
      toast.info(t('sheets.empty'))
      return
    }
    const rows = contacts.map(c => [
      cell(c.full_name),
      cell(c.title),
      cell(c.company_name),
      cell(c.entity),
      cell(c.decision_role),
      cell(c.priority),
      cell(c.email),
      cell(c.phone),
      cell(c.linkedin_url),
      cell(c.user_status),
      cell(c.source),
    ])
    exportSheet.mutate({ title, columns, rows })
  }

  if (!dataExit.allowed) return null

  return (
    <Button
      variant={variant}
      size={size}
      icon={createdHere ? Check : Table2}
      isLoading={exportSheet.isPending || connect.isPending}
      onClick={handleClick}
    >
      {createdHere ? t('sheets.created') : (label ?? t('sheets.button'))}
    </Button>
  )
}
