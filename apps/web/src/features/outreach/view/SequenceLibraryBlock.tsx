import type { ApplySequenceTemplateResult, ImportSequenceLibraryResult, SequenceTemplate } from '@bellum/contracts'
import { Badge, Box, Button, FilterChips, Input, Text } from '@bellum/ui'
import { FileUp, Library } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useContacts } from '@/features/contacts/hooks/useContacts'
import { useDebounce } from '@/hooks/useDebounce'
import {
  useApplySequenceTemplate,
  useDeleteSequenceTemplate,
  useImportSequenceLibrary,
  useSequenceTemplates,
  useSetSequenceTemplateVisibility,
} from '../hooks/useSequenceLibrary'
import { SharedContentMeta } from './SharedContentMeta'
import { SEQUENCE_LIBRARY_MAX_FILE_BYTES, cadenceLabel, fileToBase64 } from '../sequence-library'

/**
 * #3756 — LA BIBLIOTHÈQUE DE CAMPAGNES de l'espace.
 *
 * L'ESN a déjà écrit ses campagnes (secteur × tier, étapes J+n, variables).
 * Elle les importe une fois (xlsx/csv), puis applique « Campagne 1 » à UN
 * contact : une séquence MONO-contact étiquetée du nom de la campagne — jamais
 * une audience multi-contacts (c74). Une variable sans valeur BLOQUE l'étape
 * et se nomme ; rien n'est envoyé d'ici, le commercial envoie.
 *
 * L'onglet de stats d'un fichier n'est pas importé : ce sont les chiffres de
 * l'outil d'envoi du client, pas des mesures de Bellum.
 */
export function SequenceLibraryBlock() {
  const { t } = useTranslation('outreach')
  const templates = useSequenceTemplates()
  const importMutation = useImportSequenceLibrary()
  const [imported, setImported] = useState<ImportSequenceLibraryResult | null>(null)
  const [applied, setApplied] = useState<{ name: string; result: ApplySequenceTemplateResult } | null>(null)
  const [pickingFor, setPickingFor] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > SEQUENCE_LIBRARY_MAX_FILE_BYTES) {
      toast.error(t('library.import.tooLarge'))
      return
    }
    try {
      const result = await importMutation.mutateAsync({ filename: file.name, content_base64: await fileToBase64(file) })
      setImported(result)
    } catch {
      toast.error(t('library.import.failed'))
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  // #4158.30 — filtre « De l'équipe » : ne garde que les modèles partagés avec l'équipe.
  const [teamOnly, setTeamOnly] = useState(false)
  const rows = (templates.data ?? []).filter(template => !teamOnly || template.visibility === 'team')

  return (
    <Box className="flex w-full flex-col gap-3" data-testid="sequence-library">
      <Box className="flex flex-wrap items-start justify-between gap-3">
        <Box className="flex flex-col gap-1">
          <Text element="h2" size="lg" weight="semibold">
            <Library className="mr-2 inline size-4" aria-hidden="true" />
            {t('library.title')}
          </Text>
          <Text size="sm" className="max-w-prose text-[var(--bellum-text-secondary)]">
            {t('library.subtitle')}
          </Text>
        </Box>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv"
          className="sr-only"
          tabIndex={-1}
          aria-label={t('library.import.input')}
          data-testid="sequence-library-file"
          onChange={event => void onFile(event.target.files?.[0])}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={importMutation.isPending}
          onClick={() => fileRef.current?.click()}
        >
          <FileUp className="size-4" aria-hidden="true" />
          {t('library.import.cta')}
        </Button>
      </Box>

      {imported ? <ImportSummary result={imported} /> : null}

      <FilterChips
        ariaLabel={t('library.title')}
        options={[
          { value: 'all', label: t('library.shared.filterAll') },
          { value: 'team', label: t('library.shared.filterTeam') },
        ]}
        value={teamOnly ? 'team' : 'all'}
        onChange={value => setTeamOnly(value === 'team')}
      />

      {templates.isLoading ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('library.loading')}
        </Text>
      ) : rows.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('library.empty')}
        </Text>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(template => (
            <TemplateRow
              key={template.id}
              template={template}
              picking={pickingFor === template.id}
              onTogglePick={() => setPickingFor(pickingFor === template.id ? null : template.id)}
              onApplied={result => {
                setApplied({ name: template.name, result })
                setPickingFor(null)
              }}
            />
          ))}
        </ul>
      )}

      {applied ? <AppliedSummary name={applied.name} result={applied.result} /> : null}
    </Box>
  )
}

export function ImportSummary({ result }: { result: ImportSequenceLibraryResult }) {
  const { t } = useTranslation('outreach')
  return (
    <Box className="flex flex-col gap-1" role="status">
      <Text size="sm">{t('library.import.summary', { templates: result.templates, steps: result.steps })}</Text>
      {result.scripts > 0 ? (
        <Text size="sm">{t('library.import.summaryScripts', { count: result.scripts })}</Text>
      ) : null}
      {result.unknown_variables.length > 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('library.import.unknownVariables', {
            count: result.unknown_variables.length,
            variables: result.unknown_variables.map(name => `{{${name}}}`).join(', '),
          })}
        </Text>
      ) : null}
      {result.skipped.length > 0 ? (
        <>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('library.import.skipped', { count: result.skipped.length })}
          </Text>
          <ul className="list-disc pl-5 text-xs text-[var(--bellum-text-secondary)]">
            {result.skipped.map(row => (
              <li key={`${row.line}-${row.reason}`}>
                {t('library.import.skippedLine', {
                  line: row.line,
                  reason: t(`library.import.reasons.${row.reason}`),
                  campaign: row.campaign ?? '—',
                })}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Box>
  )
}

export function AppliedSummary({ name, result }: { name: string; result: ApplySequenceTemplateResult }) {
  const { t } = useTranslation('outreach')
  const blocked = result.blocked_steps
  return (
    <Box className="flex flex-col gap-1" role="status">
      <Text size="sm">{t('library.apply.done', { name, contact: result.sequence.contact_name ?? '' })}</Text>
      {blocked.length > 0 ? (
        <ul className="list-disc pl-5 text-sm text-[var(--bellum-text-primary)]">
          {blocked.map(step => (
            <li key={step.position}>
              {t('library.apply.blockedStep', {
                step: step.position + 1,
                variables: step.blocked.map(b => b.message).join(' · '),
              })}
            </li>
          ))}
        </ul>
      ) : null}
    </Box>
  )
}

function TemplateRow({
  template,
  picking,
  onTogglePick,
  onApplied,
}: {
  template: SequenceTemplate
  picking: boolean
  onTogglePick: () => void
  onApplied: (result: ApplySequenceTemplateResult) => void
}) {
  const { t } = useTranslation('outreach')
  const remove = useDeleteSequenceTemplate()
  const setVisibility = useSetSequenceTemplateVisibility()
  // Une API pas encore redéployée ne rend pas le champ : aucun script, jamais une page cassée.
  const callScripts = template.call_scripts ?? []
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[var(--bellum-border)] p-3">
      <Box className="flex flex-wrap items-center justify-between gap-2">
        <Box className="flex min-w-0 flex-col gap-1">
          <Text size="sm" weight="medium">
            {template.name}
          </Text>
          <Box className="flex flex-wrap items-center gap-2">
            {template.sector ? <Badge>{template.sector}</Badge> : null}
            {template.tier_label ? <Badge>{t('library.tier', { tier: template.tier_label })}</Badge> : null}
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('library.steps', { count: template.steps.length })} · {cadenceLabel(template)}
            </Text>
          </Box>
          <SharedContentMeta
            visibility={template.visibility}
            createdBy={template.created_by}
            updatedAt={template.updated_at}
            createdAt={template.created_at}
            pending={setVisibility.isPending}
            onSetVisibility={visibility => setVisibility.mutate({ id: template.id, visibility })}
          />
        </Box>
        <Box className="flex items-center gap-2">
          <Button size="sm" onClick={onTogglePick} aria-expanded={picking}>
            {t('library.apply.cta')}
          </Button>
          <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(template.id)}>
            {t('library.remove')}
          </Button>
        </Box>
      </Box>
      {callScripts.length > 0 ? (
        // #4426.7 — les scripts d'appel importés avec la campagne, lisibles ici (jamais envoyés).
        <details className="text-sm">
          <summary className="cursor-pointer pointer-coarse:min-h-11 pointer-coarse:py-3">
            {t('library.callScripts', { count: callScripts.length })}
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {callScripts.map(script => (
              <li key={script.position}>
                <Text size="sm" weight="medium">
                  {script.title}
                </Text>
                <Text size="sm" className="whitespace-pre-wrap text-[var(--bellum-text-secondary)]">
                  {script.body}
                </Text>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {picking ? <ContactPicker templateId={template.id} onApplied={onApplied} /> : null}
    </li>
  )
}

export function ContactPicker({
  templateId,
  onApplied,
}: {
  templateId: string
  onApplied: (result: ApplySequenceTemplateResult) => void
}) {
  const { t } = useTranslation('outreach')
  const [search, setSearch] = useState('')
  const [debounced] = useDebounce(search, 300)
  const contacts = useContacts(debounced ? { q: debounced } : {})
  const rows = useMemo(() => (contacts.data?.pages ?? []).flatMap(page => page.data).slice(0, 6), [contacts.data])
  const apply = useApplySequenceTemplate()

  const pick = async (contactId: string) => {
    try {
      onApplied(await apply.mutateAsync({ templateId, contactId }))
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t('library.apply.failed'))
    }
  }

  return (
    <Box className="flex flex-col gap-2">
      <Input
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder={t('library.apply.search')}
        aria-label={t('library.apply.search')}
      />
      <ul className="flex flex-col gap-1">
        {rows.map(contact => (
          <li key={contact.id}>
            <Button
              size="sm"
              variant="ghost"
              disabled={apply.isPending}
              onClick={() => void pick(contact.id)}
              aria-label={t('library.apply.pick', { name: contact.full_name })}
            >
              {contact.full_name}
            </Button>
          </li>
        ))}
      </ul>
    </Box>
  )
}
