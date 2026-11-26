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
import type { ConsultantCsvImportReport } from '@bellum/contracts'
import { FileSpreadsheet } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCvCsvImport } from '../hooks'
import { CvImportNextSteps } from './CvImportNextSteps'

/**
 * #2183.5 — importer un fichier CSV de consultants, depuis le vivier.
 *
 * Même forme que `CvZipImportDialog` (#2569.1) : un choix de fichier, un
 * rapport, aucune étape de prévisualisation séparée — les garde-fous sont
 * déjà dans la lecture (`parseConsultantCsv`, colonne reconnue ou ignorée,
 * jamais devinée) et dans l'écriture (`CvIntakeService.importCsv`, une
 * ressemblance quelconque ARRÊTE la ligne plutôt que de l'écrire).
 *
 * Le XLSX n'est pas couvert — voir la ligne de registre 2183.5.
 */
export function CvCsvImportDialog() {
  const { t } = useTranslation('consultants')
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState<ConsultantCsvImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const csvImport = useCvCsvImport()

  const submit = async (file: File) => {
    setReport(null)
    setError(null)
    try {
      const content = await readAsText(file)
      const result = await csvImport.mutateAsync(content)
      setReport(result)
    } catch (caught) {
      // Le message du serveur porte la RAISON — le remplacer par un texte
      // générique ferait redéposer le même fichier.
      setError((caught as Error).message || t('batchImport.csv.failed'))
    }
  }

  const outcomesToName = report?.outcomes.filter(outcome => outcome.status !== 'created')

  return (
    <>
      {/* #2182.12 — cible du CTA principal de l'entête (`VivierIntro.tsx`,
          « Importer ma base de consultants ») : MÊME dialogue, MÊME état,
          deux points d'entrée plutôt qu'un second mécanisme d'import qui
          divergerait du premier au premier correctif. */}
      <Button
        id="vivier-import-csv-trigger"
        variant="outline"
        size="sm"
        icon={FileSpreadsheet}
        onClick={() => setOpen(true)}
      >
        {t('batchImport.csv.cta')}
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
            <DialogTitle>{t('batchImport.csv.title')}</DialogTitle>
            <DialogDescription>{t('batchImport.csv.description')}</DialogDescription>
          </DialogHeader>

          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            aria-label={t('batchImport.csv.choose')}
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) void submit(file)
              // Remis à zéro : redéposer le MÊME fichier redéclenche un
              // événement, sinon corriger puis réessayer ne fait rien.
              event.target.value = ''
            }}
          />
          <Button variant="outline" size="sm" disabled={csvImport.isPending} onClick={() => inputRef.current?.click()}>
            {csvImport.isPending ? t('batchImport.csv.working') : t('batchImport.csv.choose')}
          </Button>

          {error ? (
            <Text size="sm" className="text-[var(--danger-soft-text)]">
              {error}
            </Text>
          ) : null}

          {report ? (
            <div className="flex flex-col gap-2">
              <Text size="sm" weight="medium">
                {t('batchImport.csv.summary', {
                  created: report.summary.created,
                  duplicate: report.summary.duplicate,
                  skipped: report.summary.skipped,
                })}
              </Text>
              {report.ignoredColumns.length > 0 ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('batchImport.csv.ignoredColumns', { columns: report.ignoredColumns.join(', ') })}
                </Text>
              ) : null}
              {outcomesToName && outcomesToName.length > 0 ? (
                <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                  {outcomesToName.map((outcome, index) => (
                    <li key={`${outcome.line}-${index}`}>
                      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                        {outcome.status === 'duplicate'
                          ? t('batchImport.csv.outcome.duplicate', {
                              line: outcome.line,
                              names: outcome.matched.join(', '),
                            })
                          : // #3781.1 — une personne effacée (RGPD art. 17) n'a
                            // aucune fiche à nommer, contrairement à un doublon.
                            outcome.status === 'erased'
                            ? t('batchImport.csv.outcome.erased', { line: outcome.line })
                            : t(`batchImport.csv.outcome.skipped.${outcome.reason}`, { line: outcome.line })}
                      </Text>
                    </li>
                  ))}
                </ul>
              ) : null}
              {/* #2183.52-.55 — les quatre gestes qui suivent un import.
                  `created` seul : chaque fiche créée rejoint `needs_review`
                  (même règle que le dépôt de CV) — `duplicate`/`skipped` ne
                  créent RIEN, il n'y a donc rien de plus à voir ailleurs que
                  dans cette liste. */}
              <CvImportNextSteps reviewCount={report.summary.created} onNavigate={() => setOpen(false)} />
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t('batchImport.csv.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Le fichier → son texte. `FileReader`, pas `File.prototype.text()` — cette
 *  dernière n'est pas implémentée par le jsdom utilisé en test. */
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_failed'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsText(file)
  })
}
