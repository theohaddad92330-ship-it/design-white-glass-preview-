import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import type { AvailabilityImportReport } from '@bellum/contracts'
import { CalendarClock } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAvailabilityImport } from '../hooks'

/**
 * #2326.7/.9 (épopée #2794) — importer un tableau de DISPONIBILITÉS
 * (nom/e-mail + date + taux), CSV ou XLSX. Même forme que `CvCsvImportDialog`
 * (#2183.5) : un choix de fichier, un rapport — sauf que ce dialogue ne CRÉE
 * jamais de fiche, il en MET À JOUR : les lignes non rapprochées sont
 * listées, jamais devinées en création.
 */
export function AvailabilityImportDialog() {
  const { t } = useTranslation('consultants')
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState<AvailabilityImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const xlsxInputRef = useRef<HTMLInputElement>(null)
  const availabilityImport = useAvailabilityImport()

  const submit = async (format: 'csv' | 'xlsx', file: File) => {
    setReport(null)
    setError(null)
    try {
      const content = format === 'xlsx' ? await readAsBase64(file) : await readAsText(file)
      const result = await availabilityImport.mutateAsync({ format, content })
      setReport(result)
    } catch (caught) {
      // Le message du serveur porte la RAISON — jamais remplacé par un texte
      // générique, sinon on redéposerait le même fichier à l'identique.
      setError((caught as Error).message || t('batchImport.availability.failed'))
    }
  }

  const toName = report?.outcomes.filter(outcome => outcome.status !== 'updated')

  return (
    <>
      <Button
        id="vivier-import-availability-trigger"
        variant="outline"
        size="sm"
        icon={CalendarClock}
        onClick={() => setOpen(true)}
      >
        {t('batchImport.availability.cta')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (!next) {
            setReport(null)
            setError(null)
          }
        }}
      >
        <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('batchImport.availability.title')}</DialogTitle>
            <DialogDescription>{t('batchImport.availability.description')}</DialogDescription>
          </DialogHeader>

          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            aria-label={t('batchImport.availability.chooseCsv')}
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) void submit('csv', file)
              event.target.value = ''
            }}
          />
          <input
            ref={xlsxInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            aria-label={t('batchImport.availability.chooseXlsx')}
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) void submit('xlsx', file)
              event.target.value = ''
            }}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={availabilityImport.isPending}
              onClick={() => csvInputRef.current?.click()}
            >
              {availabilityImport.isPending
                ? t('batchImport.availability.working')
                : t('batchImport.availability.chooseCsv')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={availabilityImport.isPending}
              onClick={() => xlsxInputRef.current?.click()}
            >
              {t('batchImport.availability.chooseXlsx')}
            </Button>
          </div>

          {error ? (
            <Text size="sm" className="text-[var(--danger-soft-text)]">
              {error}
            </Text>
          ) : null}

          {report ? (
            <div className="flex flex-col gap-2">
              <Text size="sm" weight="medium">
                {t('batchImport.availability.summary', {
                  updated: report.summary.updated,
                  unmatched: report.summary.unmatched,
                  skipped: report.summary.skipped,
                })}
              </Text>
              {report.ignoredColumns.length > 0 ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('batchImport.availability.ignoredColumns', { columns: report.ignoredColumns.join(', ') })}
                </Text>
              ) : null}
              {toName && toName.length > 0 ? (
                <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                  {toName.map((outcome, index) => (
                    <li key={`${outcome.line}-${index}`}>
                      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                        {outcome.status === 'unmatched'
                          ? t(`batchImport.availability.outcome.unmatched.${outcome.reason}`, {
                              line: outcome.line,
                              identity: outcome.identity,
                            })
                          : t(`batchImport.availability.outcome.skipped.${outcome.reason}`, { line: outcome.line })}
                      </Text>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t('batchImport.availability.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_failed'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsText(file)
  })
}

/** Le fichier → base64, sans le préfixe `data:` que le lecteur ajoute — même
 *  patron que `CvDropZone.tsx` (`readAsBase64`), copié plutôt que partagé :
 *  chaque dialogue d'import porte son propre lecteur, comme ses voisins. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_failed'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}
