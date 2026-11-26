import { Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Download, FileText, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { downloadBlob } from '@/lib/pdf-download'
import { sampleFileFor } from '@/features/universal-import/lib/sample-file'
import { vcardToCsv } from '../lib/vcard'
import type { ImportSourceKey } from '../model/sources'

const SOURCE_TABS: readonly ImportSourceKey[] = ['file', 'paste', 'address-book', 'crm', 'laura']
const TAB_LABEL: Record<ImportSourceKey, 'file' | 'paste' | 'addressBook' | 'crm' | 'laura'> = {
  file: 'file',
  paste: 'paste',
  'address-book': 'addressBook',
  crm: 'crm',
  laura: 'laura',
}
const ACCEPT_TABLE = '.csv,.tsv,.txt,.xlsx,.json,.ndjson,.jsonl,.vcf,text/csv,application/json,text/vcard'
const ACCEPT_BOOK = '.vcf,.json,text/vcard,application/json'

type Props = {
  source: ImportSourceKey
  onSource: (source: ImportSourceKey) => void
  /** Reçoit le fichier prêt à envoyer (un vCard ou un tableau collé est déjà converti en tableau). */
  onFile: (file: File) => void
  error: string | null
}

/** Un fichier vCard devient un tableau lu par l'import ; `null` quand il ne contient aucune carte. */
async function tableFileOf(file: File): Promise<File | null> {
  if (!/\.vcf$/i.test(file.name)) return file
  const csv = vcardToCsv(await file.text())
  return csv ? new File([csv], file.name.replace(/\.vcf$/i, '.csv')) : null
}

/**
 * Théo B c4-assistant-import — l'étape « Source » : UNE zone « Dépose tes documents » (#4426), six manières de
 * fournir le tableau. Rien n'est écrit avant la validation — la phrase le dit sous la zone.
 */
export function SourceStep({ source, onSource, onFile, error }: Props) {
  const { t } = useTranslation('importWizard')
  const inputRef = useRef<HTMLInputElement>(null)
  const [pasted, setPasted] = useState('')
  const [pasteEmpty, setPasteEmpty] = useState(false)
  const [bookEmpty, setBookEmpty] = useState(false)
  const sample = sampleFileFor('contact')

  const receive = async (file: File | undefined): Promise<void> => {
    if (!file) return
    const table = await tableFileOf(file)
    if (!table) {
      setBookEmpty(true)
      return
    }
    setBookEmpty(false)
    onFile(table)
  }

  const dropzone = (labelKey: 'drop.choose' | 'addressBook.choose', accept: string) => (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label={t(`contactsImport.assistant.${labelKey}`)}
        onChange={event => void receive(event.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
          event.preventDefault()
          void receive(event.dataTransfer.files[0])
        }}
        className="flex min-h-11 w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bellum-bg)] px-4 py-10 text-center hover:border-[var(--bellum-primary-500)] focus-visible:outline focus-visible:outline-2"
      >
        <Upload className="size-6 text-[var(--text-muted)]" aria-hidden />
        <Text size="base" weight="semibold" className="text-[var(--text-primary)]">
          {t('contactsImport.assistant.drop.title')}
        </Text>
        <Text size="sm" className="text-[var(--text-secondary)]">
          {t('contactsImport.assistant.drop.lead')}
        </Text>
        <Text size="xs" className="text-[var(--text-muted)]">
          {t('contactsImport.assistant.drop.formats')}
        </Text>
      </button>
    </>
  )

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={t('contactsImport.assistant.tabs.label')} className="flex flex-wrap gap-1">
        {SOURCE_TABS.map(key => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={source === key}
            onClick={() => onSource(key)}
            className={`min-h-11 rounded-md border px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 ${
              source === key
                ? 'border-[var(--bellum-primary-500)] text-[var(--text-primary)]'
                : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t(`contactsImport.assistant.tabs.${TAB_LABEL[key]}`)}
          </button>
        ))}
      </div>

      {error ? (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-4 py-3">
          <AlertTriangle className="size-4 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
          <Text size="sm" className="text-[var(--text-primary)]">
            {error}
          </Text>
        </div>
      ) : null}

      {source === 'file' || source === 'crm' ? (
        <>
          {source === 'crm' ? (
            <div className="space-y-1">
              <Text size="sm" className="text-[var(--text-secondary)]">
                {t('contactsImport.assistant.crm.lead')}
              </Text>
              <Link to="/integrations" className="text-sm underline underline-offset-2">
                {t('contactsImport.assistant.crm.connect')}
              </Link>
            </div>
          ) : null}
          {dropzone('drop.choose', ACCEPT_TABLE)}
          <div className="flex flex-wrap items-center gap-3">
            {sample ? (
              <>
                <Button variant="ghost" size="sm" icon={Download} onClick={() => downloadBlob(sample, sample.name)}>
                  {t('contactsImport.assistant.drop.template')}
                </Button>
                <Button variant="ghost" size="sm" icon={FileText} onClick={() => onFile(sample)}>
                  {t('contactsImport.assistant.drop.sample')}
                </Button>
              </>
            ) : null}
          </div>
        </>
      ) : null}

      {source === 'address-book' ? (
        <>
          <Text size="sm" className="text-[var(--text-secondary)]">
            {t('contactsImport.assistant.addressBook.lead')}
          </Text>
          {dropzone('addressBook.choose', ACCEPT_BOOK)}
          {bookEmpty ? (
            <Text size="sm" role="alert" className="text-[var(--warning-soft-text)]">
              {t('contactsImport.assistant.addressBook.notRead')}
            </Text>
          ) : null}
        </>
      ) : null}

      {source === 'paste' ? (
        <div className="space-y-2">
          <label htmlFor="import-paste" className="text-sm font-medium text-[var(--text-primary)]">
            {t('contactsImport.assistant.paste.label')}
          </label>
          <textarea
            id="import-paste"
            value={pasted}
            onChange={event => {
              setPasted(event.target.value)
              setPasteEmpty(false)
            }}
            placeholder={t('contactsImport.assistant.paste.placeholder')}
            rows={8}
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bellum-bg)] p-3 font-mono text-sm text-[var(--text-primary)]"
          />
          {pasteEmpty ? (
            <Text size="sm" role="alert" className="text-[var(--warning-soft-text)]">
              {t('contactsImport.assistant.paste.empty')}
            </Text>
          ) : null}
          <Button
            variant="black"
            size="sm"
            onClick={() => {
              if (!pasted.trim()) {
                setPasteEmpty(true)
                return
              }
              onFile(new File([pasted], 'tableau-colle.tsv'))
            }}
          >
            {t('contactsImport.assistant.paste.action')}
          </Button>
        </div>
      ) : null}

      {source === 'laura' ? (
        <div className="space-y-3">
          <Text size="sm" className="text-[var(--text-secondary)]">
            {t('contactsImport.assistant.laura.lead')}
          </Text>
          <AskLaura
            question={t('contactsImport.sources.laura.question')}
            label={t('contactsImport.assistant.laura.ask')}
            variant="prominent"
            alwaysVisible
          />
          {dropzone('drop.choose', ACCEPT_TABLE)}
        </div>
      ) : null}

      <Text size="sm" className="text-[var(--text-muted)]">
        {t('contactsImport.assistant.reassure')}
      </Text>
    </div>
  )
}
