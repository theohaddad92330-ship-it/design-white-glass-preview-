import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SelectField } from '@bellum/ui'
import { Loader2, Sparkles } from 'lucide-react'
import {
  MESSAGE_STYLE_IMPORT_KINDS,
  MESSAGE_STYLE_SOURCE_TYPES,
  type MessageStyleImportKind,
  type MessageStyleImportResult,
  type MessageStyleSourceType,
} from '@bellum/contracts'
import { useMessageStyleImport } from '@/features/message-style/hooks/useMessageStyleImport'
import { toast } from 'sonner'

// i18n keys: style.importKind.linkedin_message | style.importKind.email | style.importKind.phone_pitch |
//            style.importKind.follow_up | style.importKind.introduction | style.importKind.partner_message |
//            style.importKind.profile_push
const IMPORT_KIND_LABEL_KEY: Record<MessageStyleImportKind, string> = {
  linkedin_message: 'style.importKind.linkedin_message',
  email: 'style.importKind.email',
  phone_pitch: 'style.importKind.phone_pitch',
  follow_up: 'style.importKind.follow_up',
  introduction: 'style.importKind.introduction',
  partner_message: 'style.importKind.partner_message',
  profile_push: 'style.importKind.profile_push',
}

// i18n keys: style.sourceType.validated_example | style.sourceType.imported_template |
//            style.sourceType.sent_message | style.sourceType.accepted_edit | style.sourceType.brand_guide |
//            style.sourceType.signature | style.sourceType.user_preference | style.sourceType.formality |
//            style.sourceType.language | style.sourceType.forbidden_words | style.sourceType.allowed_cta |
//            style.sourceType.length | style.sourceType.punctuation | style.sourceType.opening_formula |
//            style.sourceType.closing_formula
const SOURCE_TYPE_LABEL_KEY: Record<MessageStyleSourceType, string> = {
  validated_example: 'style.sourceType.validated_example',
  imported_template: 'style.sourceType.imported_template',
  sent_message: 'style.sourceType.sent_message',
  accepted_edit: 'style.sourceType.accepted_edit',
  brand_guide: 'style.sourceType.brand_guide',
  signature: 'style.sourceType.signature',
  user_preference: 'style.sourceType.user_preference',
  formality: 'style.sourceType.formality',
  language: 'style.sourceType.language',
  forbidden_words: 'style.sourceType.forbidden_words',
  allowed_cta: 'style.sourceType.allowed_cta',
  length: 'style.sourceType.length',
  punctuation: 'style.sourceType.punctuation',
  opening_formula: 'style.sourceType.opening_formula',
  closing_formula: 'style.sourceType.closing_formula',
}

const FIELD_LABEL_STYLE = { color: 'var(--text-ghost)' } as const
const TEXTAREA_STYLE = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
} as const

/**
 * #2369.2/.3/.4/.5 (épopée #2768, LOT SOIR 26/09) — LA MÉMOIRE DE STYLE,
 * premier écran : importer un message (sept natures #2369.3, quinze sources
 * admises #2369.2), l'analyser (déterministe, jamais un appel au modèle —
 * doctrine), et restituer « je conserve / je ne reproduis pas / je propose »
 * (#2369.5). Chaque ligne de « je propose » EST une vraie proposition
 * `pending` (#2369.7/.8) — sa décision (adopter/refuser) reste un geste
 * séparé, hors de cet écran (aucun écran ne l'exerce encore, voir
 * `demo-coverage.ts`).
 *
 * #2369.1/.14 (LOT NUIT 27/09) — la bibliothèque de style (lister les
 * templates, décider une proposition `pending`) est désormais un écran
 * SIBLING (`MessageStyleLibrary.tsx`, même onglet Connaissances › Mémoire de
 * style, rendu au-dessus de celui-ci) — jamais fusionnée ici (une
 * responsabilité par fichier).
 *
 * Restent HORS de tout écran de cette épopée : la comparaison de versions
 * générées (#2369.11) et les métriques d'usage (#2369.12) — l'une et l'autre
 * dépendent d'une capacité de génération de messages multi-styles (apps/ia)
 * qui n'existe pas encore.
 */
export function MessageStyleImportTab() {
  const { t } = useTranslation('knowledge')
  const [importKind, setImportKind] = useState<MessageStyleImportKind>('email')
  const [sourceType, setSourceType] = useState<MessageStyleSourceType>('sent_message')
  const [rawText, setRawText] = useState('')
  const [result, setResult] = useState<MessageStyleImportResult | null>(null)
  const mutation = useMessageStyleImport()

  const canSubmit = rawText.trim().length > 0 && !mutation.isPending

  const handleSubmit = async () => {
    if (!canSubmit) return
    try {
      const analysis = await mutation.mutateAsync({ importKind, sourceType, rawText: rawText.trim() })
      setResult(analysis)
      toast.success(t('style.toast.analyzed'))
    } catch (err) {
      console.error('[MessageStyleImportTab]', err)
      toast.error(t('style.toast.analyzeFailed'))
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {t('style.description')}
      </p>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-xs" style={FIELD_LABEL_STYLE}>
            {t('style.importKindLabel')}
          </label>
          <SelectField
            value={importKind}
            onChange={next => setImportKind(next as MessageStyleImportKind)}
            options={MESSAGE_STYLE_IMPORT_KINDS.map(kind => ({ value: kind, label: t(IMPORT_KIND_LABEL_KEY[kind]) }))}
            ariaLabel={t('style.importKindLabel')}
            className="min-w-0 max-w-full"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs" style={FIELD_LABEL_STYLE}>
            {t('style.sourceTypeLabel')}
          </label>
          <SelectField
            value={sourceType}
            onChange={next => setSourceType(next as MessageStyleSourceType)}
            options={MESSAGE_STYLE_SOURCE_TYPES.map(source => ({
              value: source,
              label: t(SOURCE_TYPE_LABEL_KEY[source]),
            }))}
            ariaLabel={t('style.sourceTypeLabel')}
            className="min-w-0 max-w-full"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="message-style-import-text" className="text-xs" style={FIELD_LABEL_STYLE}>
          {t('style.textLabel')}
        </label>
        <textarea
          id="message-style-import-text"
          value={rawText}
          onChange={e => setRawText(e.target.value)}
          rows={8}
          placeholder={t('style.textPlaceholder')}
          className="w-full rounded-lg px-3 py-2 text-sm leading-relaxed focus:outline-none"
          style={TEXTAREA_STYLE}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="flex items-center gap-2 h-9 px-4 rounded-md text-sm font-medium text-white transition-opacity disabled:opacity-50"
        style={{ background: 'var(--violet-gradient)' }}
      >
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {t('style.analyzeButton')}
      </button>

      {result && (
        <div
          className="space-y-4 rounded-xl p-4"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        >
          <RestitutionSection title={t('style.result.conserve')} lines={result.conserve} />
          <RestitutionSection title={t('style.result.neReproduitPas')} lines={result.neReproduitPas} />
          <RestitutionSection title={t('style.result.propose')} lines={result.propose.map(p => p.observation)} />
        </div>
      )}
    </div>
  )
}

/** #2369.5 — un volet vide n'affiche AUCUNE ligne (« on n'affiche pas ce qu'on n'a pas »). */
function RestitutionSection({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
        {title}
      </p>
      <ul className="space-y-1">
        {lines.map((line, index) => (
          <li key={`${index}-${line}`} className="text-sm" style={{ color: 'var(--text-primary)' }}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}
