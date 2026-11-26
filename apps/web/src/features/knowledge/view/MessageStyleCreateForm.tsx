import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { SelectField } from '@bellum/ui'
import {
  OUTREACH_MESSAGE_CHANNELS,
  type MemoryItemScope,
  type MemoryScopeOffer,
  type OutreachMessageChannel,
} from '@bellum/contracts'
import { useMemoryScopeOptions } from '@/features/memory/hooks/useMemoryScopeOptions'
import { useCreateMessageStyleTemplate } from '@/features/message-style/hooks/useMessageStyle'

const MAX_FORBIDDEN = 20
/**
 * #2204.65 — les portées offertes viennent de `useMemoryScopeOptions` (la règle de ce qu'un écran peut proposer vit
 * à UN endroit, GA-26) : l'espace et la personne toujours, une option « équipe » PAR périmètre que la personne
 * porte, « ce fil » seulement quand le formulaire est monté dans un fil. L'identifiant voyage avec le choix.
 */
const WORKSPACE_FIRST: Record<MemoryItemScope, number> = { workspace: 0, user: 1, business_unit: 2, conversation: 3 }
function offerKey(offer: MemoryScopeOffer): string {
  return offer.scope === 'business_unit' ? `business_unit:${offer.businessUnitId}` : offer.scope
}
/** #2947 (#2204.60/.61/.63) — les bornes du contrat (`createMessageStyleTemplateSchema`). */
const OPTIONAL_FIELDS = [
  { key: 'pitch', max: 500 },
  { key: 'tone', max: 200 },
  { key: 'signature', max: 500 },
] as const
type OptionalFieldKey = (typeof OPTIONAL_FIELDS)[number]['key']
const EMPTY_OPTIONAL: Record<OptionalFieldKey, string> = { pitch: '', tone: '', signature: '' }
const FIELD_LABEL_STYLE = { color: 'var(--text-ghost)' } as const
const INPUT_STYLE = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
} as const

/**
 * #2204.59-.65 — créer un style SANS import : le formulaire pose l'objet
 * Template (objectif / canal / persona / interdits ; pitch / ton / signature
 * optionnels depuis #2204.60/.61/.63) par `POST
 * /message-style/templates`, le même appel que l'import alimente. Le style
 * naît `draft` (le serveur pose statut et version) : il ne sert à écrire
 * qu'une fois activé depuis la liste, jamais d'emblée.
 *
 * Fermé par défaut — un seul bouton dans l'en-tête de la section « Styles
 * appris », pas un bloc de plus sous la liste.
 */
export function MessageStyleCreateForm({
  conversationId,
  defaultOpen = false,
  onDone,
}: {
  /** Le fil dans lequel le formulaire est monté (le composer d'un contact) : offre la portée « ce fil ». */
  conversationId?: string
  defaultOpen?: boolean
  /** Appelé après une création réussie — l'appelant ferme son dialogue. */
  onDone?: () => void
} = {}) {
  const { t } = useTranslation('knowledge')
  const create = useCreateMessageStyleTemplate()
  const offers = [...useMemoryScopeOptions(conversationId)].sort(
    (a, b) => WORKSPACE_FIRST[a.scope] - WORKSPACE_FIRST[b.scope],
  )
  const [open, setOpen] = useState(defaultOpen)
  const [objective, setObjective] = useState('')
  const [channel, setChannel] = useState<OutreachMessageChannel>('email')
  const [persona, setPersona] = useState('')
  const [scopeKey, setScopeKey] = useState('workspace')
  const [forbiddenText, setForbiddenText] = useState('')
  const [optional, setOptional] = useState<Record<OptionalFieldKey, string>>(EMPTY_OPTIONAL)

  const forbidden = forbiddenText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
  const tooMany = forbidden.length > MAX_FORBIDDEN
  const canSubmit = objective.trim().length > 0 && persona.trim().length > 0 && !tooMany && !create.isPending

  const reset = () => {
    setObjective('')
    setChannel('email')
    setPersona('')
    setScopeKey('workspace')
    setForbiddenText('')
    setOptional(EMPTY_OPTIONAL)
    setOpen(false)
    onDone?.()
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    const chosen = offers.find(offer => offerKey(offer) === scopeKey)
    const scopeFields =
      chosen?.scope === 'user'
        ? { scope: 'user' as const }
        : chosen?.scope === 'business_unit'
          ? { scope: 'business_unit' as const, businessUnitId: chosen.businessUnitId }
          : chosen?.scope === 'conversation'
            ? { scope: 'conversation' as const, conversationId: chosen.conversationId }
            : {}
    try {
      // #2947 (#2204.60/.61/.63) — un champ laissé vide ne part pas : non déclaré, jamais « ».
      const declared = Object.fromEntries(
        OPTIONAL_FIELDS.map(({ key }) => [key, optional[key].trim()]).filter(([, value]) => value.length > 0),
      ) as Partial<Record<OptionalFieldKey, string>>
      await create.mutateAsync({
        objective: objective.trim(),
        channel,
        persona: persona.trim(),
        forbidden,
        // #2204.65 — « espace » est le défaut serveur : on ne l'envoie pas. Équipe et fil portent leur identifiant.
        ...scopeFields,
        ...declared,
      })
      toast.success(t('style.create.toast.created'))
      reset()
    } catch (err) {
      console.error('[MessageStyleCreateForm]', err)
      toast.error(t('style.create.toast.failed'))
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center gap-1.5 px-3 rounded-md text-xs font-medium"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-secondary)',
        }}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        {t('style.create.open')}
      </button>
    )
  }

  return (
    <div
      className="max-w-2xl space-y-4 rounded-xl p-4"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="space-y-1">
        <label htmlFor="message-style-create-objective" className="text-xs" style={FIELD_LABEL_STYLE}>
          {t('style.create.objective')}
        </label>
        <input
          id="message-style-create-objective"
          value={objective}
          maxLength={200}
          onChange={e => setObjective(e.target.value)}
          className="h-11 w-full rounded-lg px-3 text-sm focus:outline-none"
          style={INPUT_STYLE}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs" style={FIELD_LABEL_STYLE}>
          {t('style.create.channel')}
        </label>
        <SelectField
          value={channel}
          onChange={next => setChannel(next as OutreachMessageChannel)}
          options={OUTREACH_MESSAGE_CHANNELS.map(value => ({ value, label: t(`style.create.channels.${value}`) }))}
          ariaLabel={t('style.create.channel')}
          className="min-w-0 max-w-full"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs" style={FIELD_LABEL_STYLE}>
          {t('style.create.scope')}
        </label>
        <SelectField
          value={scopeKey}
          onChange={setScopeKey}
          options={offers.map(offer => ({
            value: offerKey(offer),
            label:
              offer.scope === 'business_unit'
                ? t('style.create.scopes.business_unit', { name: offer.businessUnitName })
                : t(`style.create.scopes.${offer.scope}`),
          }))}
          ariaLabel={t('style.create.scope')}
          className="min-w-0 max-w-full"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="message-style-create-persona" className="text-xs" style={FIELD_LABEL_STYLE}>
          {t('style.create.persona')}
        </label>
        <input
          id="message-style-create-persona"
          value={persona}
          maxLength={200}
          onChange={e => setPersona(e.target.value)}
          className="h-11 w-full rounded-lg px-3 text-sm focus:outline-none"
          style={INPUT_STYLE}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="message-style-create-forbidden" className="text-xs" style={FIELD_LABEL_STYLE}>
          {t('style.create.forbidden')}
        </label>
        <textarea
          id="message-style-create-forbidden"
          value={forbiddenText}
          rows={4}
          onChange={e => setForbiddenText(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm leading-relaxed focus:outline-none"
          style={INPUT_STYLE}
        />
        {tooMany && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('style.create.tooMany', { max: MAX_FORBIDDEN })}
          </p>
        )}
      </div>
      {OPTIONAL_FIELDS.map(({ key, max }) => (
        <div key={key} className="space-y-1">
          <label htmlFor={`message-style-create-${key}`} className="text-xs" style={FIELD_LABEL_STYLE}>
            {t(`style.create.${key}`)}
          </label>
          <input
            id={`message-style-create-${key}`}
            value={optional[key]}
            maxLength={max}
            onChange={e => setOptional(prev => ({ ...prev, [key]: e.target.value }))}
            className="h-11 w-full rounded-lg px-3 text-sm focus:outline-none"
            style={INPUT_STYLE}
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex h-11 items-center gap-2 px-4 rounded-md text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{ background: 'var(--violet-gradient)' }}
        >
          {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {t('style.create.submit')}
        </button>
        <button
          type="button"
          onClick={reset}
          className="flex h-11 items-center px-3 rounded-md text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          {t('style.create.cancel')}
        </button>
      </div>
    </div>
  )
}
