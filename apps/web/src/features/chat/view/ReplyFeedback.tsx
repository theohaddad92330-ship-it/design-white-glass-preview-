import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquareText } from 'lucide-react'
import {
  REPLY_FEEDBACK_CATEGORIES,
  REPLY_FEEDBACK_REASONS,
  REPLY_FEEDBACK_VERDICTS,
  replyDigest,
  type CreateReplyFeedback,
  type ReplyFeedbackAck,
  type ReplyFeedbackCategory,
  type ReplyFeedbackReason,
  type ReplyFeedbackVerdict,
} from '@bellum/contracts'
import { SelectField, Text, cn } from '@bellum/ui'
import { ApiError } from '@/lib/api'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { trackAssistantAnswerJudged } from '@/lib/product-tracker'
import { sendReplyFeedback, withdrawReplyFeedback } from '../api/replyFeedbackApi'
import {
  forgetGivenReplyFeedback,
  rememberGivenReplyFeedback,
  useGivenReplyFeedback,
} from '../lib/given-reply-feedback'
import type { ChatResponseContext } from './ContextDisclosure'
import { ShorterRepliesSuggestion } from './ShorterRepliesSuggestion'

/**
 * #1919 — DIRE À LAURA QU'UNE RÉPONSE NE VA PAS, ET VOIR QUE ÇA COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN GESTE DANS LA LIGNE, LES CHOIX EN DESSOUS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le pied de réponse est déjà dense (heure · fraîcheur · sources · épingler ·
 * copier). Six boutons de plus l'auraient noyé : la ligne ne gagne qu'UNE icône,
 * et les choix s'ouvrent sous elle — comme « Voir la source » ouvre son panneau.
 * `order-last basis-full` : le panneau passe sur sa propre ligne du flex, sans
 * que `ReplyFooter` ait à porter son état.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI PART, ET CE QUI NE PART JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'EMPREINTE de la réponse (`replyDigest`), le compte / contact / action qu'elle
 * portait quand elle les porte (#1919.14) — jamais son texte. En démonstration,
 * RIEN ne part : les réponses y sont préparées d'avance, un retour n'y changerait
 * aucune réponse suivante, et l'accusé le dit (voir `demo-coverage.ts`).
 */

// #2444.5 — « wrong-preview » : la correction canonique se relit (champ, valeur,
// portée) avant de partir. Rien ne s'envoie depuis « wrong », seulement depuis
// cette étape.
type Step = 'verdicts' | 'reasons' | 'other' | 'wrong' | 'wrong-preview'
type Ack =
  | {
      kind: 'saved'
      verdict: ReplyFeedbackVerdict
      accountCorrected: boolean
      suggestion: ReplyFeedbackAck['preferenceSuggestion']
    }
  | { kind: 'demo' }
  | { kind: 'withdrawn' }
type FeedbackChoice = Pick<CreateReplyFeedback, 'verdict' | 'reason' | 'note' | 'correction' | 'category'>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// #1946.9 / D10 — le seul écran d'où ce composant est monté (voir `ReplyFooter.tsx`).
const SCREEN = '/chat'

// #1919.16 — les retours dont l'accusé dit « porte sur cette réponse, pas de règle générale ».
const OBJECT_SCOPED_VERDICTS: readonly ReplyFeedbackVerdict[] = [
  'pas_pertinent',
  'deja_fait',
  'pas_maintenant',
  'mauvaise_priorite',
]

/** #1919.14 — ce que la réponse PORTE : le compte de la conversation, et l'action proposée quand elle est unique. */
function replyTargets(context: ChatResponseContext | undefined, accountId: string | null) {
  const actions = context?.pending_actions ?? []
  const single =
    actions.length === 1 ? (actions[0] as { action?: unknown; contact_id?: unknown; account_id?: unknown }) : null
  const uuid = (value: unknown) => (typeof value === 'string' && UUID.test(value) ? value : null)
  const action = single?.action
  return {
    accountId: uuid(accountId) ?? uuid(single?.account_id),
    contactId: uuid(single?.contact_id),
    actionKind: typeof action === 'string' && /^[a-z_]{1,60}$/.test(action) ? action : null,
  }
}

const CHIP =
  'rounded-full border border-[var(--bellum-border)] px-2.5 py-1 text-xs text-[var(--bellum-text-secondary)] transition-colors hover:bg-[var(--bellum-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11'
const LINK =
  'rounded px-1 text-xs text-[var(--bellum-text-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11'
const FIELD =
  'w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2 py-1.5 text-sm text-[var(--bellum-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]'

export function ReplyFeedback({
  text,
  accountId,
  context,
  onRetryWithCorrection,
  retryDisabled = false,
  open: controlledOpen,
  showTrigger = true,
}: {
  /**
   * #5032.15 — « Signaler un problème » vit dans le menu ⋯ du pied : le parent PILOTE
   * l'ouverture du panneau (`open`) et masque l'icône (`showTrigger={false}`). Sans `open`,
   * le composant garde son icône et son état, comme avant.
   */
  open?: boolean
  showTrigger?: boolean
  text: string
  accountId: string | null
  context: ChatResponseContext | undefined
  /**
   * #2444.6 — RÉESSAYER APRÈS CORRECTION : le même geste que le menu
   * « Réessayer » (`ReplyRetryMenu`/`onRetry` de `Chat.tsx`), proposé ICI juste
   * après une « Donnée fausse » — il repose la MÊME question, par le chemin
   * normal du fil, donc réutilise le scope et conserve le contexte ; le
   * correctif qu'on vient d'enregistrer exclut déjà le faux du prompt suivant
   * (`reply-feedback-memory.ts`). `undefined` quand rien ne précède cette
   * réponse — pas de bouton qui ne ferait rien.
   */
  onRetryWithCorrection?: () => void
  retryDisabled?: boolean
}) {
  const { t } = useTranslation('chat')
  const isDemo = useIsDemo()
  const panelId = useId()
  const digest = useMemo(() => replyDigest(text), [text])
  const targets = useMemo(() => replyTargets(context, accountId), [context, accountId])
  // #1919.17 — le retour déjà donné se revoit sous sa réponse, y compris relue.
  // En démonstration, aucune lecture : rien n'y est gardé.
  const given = useGivenReplyFeedback(digest, !isDemo)

  const [ownOpen, setOpen] = useState(false)
  const open = controlledOpen ?? ownOpen
  const [step, setStep] = useState<Step>('verdicts')
  const [changing, setChanging] = useState(false)
  const [ack, setAck] = useState<Ack | null>(null)
  const [error, setError] = useState<'generic' | 'forbidden' | null>(null)
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState('')
  const [field, setField] = useState('')
  const [value, setValue] = useState('')
  const [scope, setScope] = useState<'reply' | 'account'>('reply')
  // #2444.1 — précision optionnelle, indépendante du verdict/motif.
  const [category, setCategory] = useState<ReplyFeedbackCategory | ''>('')

  const verdictLabel = (verdict: ReplyFeedbackVerdict) => t(`feedback.verdict.${verdict}`)

  async function submit(choice: FeedbackChoice) {
    setError(null)
    // D10 — décision Louis 14/09/2026 : le verdict est DONNÉ ici, quel que soit
    // ce qui suit (démonstration, panne réseau, 403) — le clic a eu lieu. Seuls
    // l'écran et le verdict partent : `useTrackAction` (nominatif, activité CRM)
    // n'a rien à faire ici, la mesure reste anonyme et agrégée (#1946.22 doctrine).
    trackAssistantAnswerJudged(SCREEN, choice.verdict)
    if (isDemo) {
      setAck({ kind: 'demo' })
      setChanging(false)
      setStep('verdicts')
      return
    }
    setSending(true)
    try {
      const result = await sendReplyFeedback({
        replyDigest: digest,
        ...(targets.accountId ? { accountId: targets.accountId } : {}),
        ...(targets.contactId ? { contactId: targets.contactId } : {}),
        ...(targets.actionKind ? { actionKind: targets.actionKind } : {}),
        ...choice,
      })
      rememberGivenReplyFeedback(result.item)
      setAck({
        kind: 'saved',
        verdict: result.item.verdict,
        accountCorrected: result.item.accountCorrected,
        suggestion: result.preferenceSuggestion,
      })
      setChanging(false)
      setStep('verdicts')
      setNote('')
      setField('')
      setValue('')
      setScope('reply')
      setCategory('')
    } catch (err) {
      // #1919.7 — un 403 est un refus de corriger le DOSSIER, pas une panne.
      setError(err instanceof ApiError && err.status === 403 ? 'forbidden' : 'generic')
    } finally {
      setSending(false)
    }
  }

  async function withdraw() {
    if (!given) return
    setError(null)
    setSending(true)
    try {
      await withdrawReplyFeedback(given.id)
      forgetGivenReplyFeedback(digest)
      setAck({ kind: 'withdrawn' })
      setChanging(false)
      setStep('verdicts')
    } catch {
      setError('generic')
    } finally {
      setSending(false)
    }
  }

  function choose(verdict: ReplyFeedbackVerdict) {
    // #1919.8 → .13 — « Pas pertinent » propose ses motifs.
    if (verdict === 'pas_pertinent') return setStep('reasons')
    // #1919.7 — « Donnée fausse » demande la correction exacte et son périmètre.
    if (verdict === 'donnee_fausse') return setStep('wrong')
    void submit({ verdict })
  }

  function chooseReason(reason: ReplyFeedbackReason) {
    if (reason === 'autre') return setStep('other')
    void submit({ verdict: 'pas_pertinent', reason })
  }

  // #2444.5 — « Vérifier » ouvre la prévisualisation, n'envoie rien.
  const reviewWrong = () => setStep('wrong-preview')
  const editWrong = () => setStep('wrong')

  const change = () => {
    setAck(null)
    setChanging(true)
    setStep('verdicts')
  }

  const shown = isDemo ? null : given
  const chooser = (
    <ChooserStep
      step={step}
      sending={sending}
      canCorrectAccount={Boolean(targets.accountId)}
      panelId={panelId}
      note={note}
      field={field}
      value={value}
      scope={scope}
      category={category}
      onNote={setNote}
      onField={setField}
      onValue={setValue}
      onScope={setScope}
      onCategory={setCategory}
      onChoose={choose}
      onReason={chooseReason}
      onBack={() => setStep('verdicts')}
      onReviewWrong={reviewWrong}
      onEditWrong={editWrong}
      onSubmit={submit}
    />
  )

  let body: React.ReactNode
  if (ack?.kind === 'demo') {
    body = <Status>{t('feedback.ack.demo')}</Status>
  } else if (ack?.kind === 'saved' && !changing) {
    body = (
      <>
        <Status>
          <span className="block">{t('feedback.ack.saved')}</span>
          {ack.accountCorrected ? <span className="block">{t('feedback.ack.accountCorrected')}</span> : null}
          {/* #1928.7 — répété sur trois réponses distinctes : Laura PROPOSE une préférence. */}
          {ack.suggestion ? (
            // « Garder » pose la préférence ; rien n'est proposé si la longueur est déjà réglée.
            <ShorterRepliesSuggestion count={ack.suggestion.count} />
          ) : OBJECT_SCOPED_VERDICTS.includes(ack.verdict) ? (
            // #1919.16 — un refus unique ne se généralise pas, et on le dit.
            <span className="block">{t('feedback.ack.scoped')}</span>
          ) : null}
          <span className="block text-[var(--bellum-text-muted)]">{t('feedback.ack.where')}</span>
        </Status>
        {/* #2444.6 — après une correction, réessayer tout de suite : même
            question, même scope, le faux exclu du prochain prompt. */}
        {ack.verdict === 'donnee_fausse' && onRetryWithCorrection ? (
          <div className="flex flex-col gap-1">
            <button type="button" className={CHIP} disabled={sending || retryDisabled} onClick={onRetryWithCorrection}>
              {t('feedback.ack.retryNow')}
            </button>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('feedback.ack.retryCostUnknown')}
            </Text>
          </div>
        ) : null}
        <GivenActions sending={sending} onChange={change} onWithdraw={() => void withdraw()} />
      </>
    )
  } else if (ack?.kind === 'withdrawn') {
    body = (
      <>
        <Status>{t('feedback.withdrawn')}</Status>
        {chooser}
      </>
    )
  } else if (shown && !changing) {
    body = (
      <>
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('feedback.given', { verdict: verdictLabel(shown.verdict) })}
        </Text>
        <GivenActions sending={sending} onChange={change} onWithdraw={() => void withdraw()} />
      </>
    )
  } else {
    body = chooser
  }

  return (
    <>
      {showTrigger ? (
        <button
          type="button"
          onClick={() => setOpen(previous => !previous)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={
            shown ? t('feedback.givenAria', { verdict: verdictLabel(shown.verdict) }) : t('feedback.openAria')
          }
          className="flex items-center gap-1 rounded p-1 text-[var(--bellum-text-muted)] transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11 hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
        >
          <MessageSquareText className={cn('size-3.5', shown && 'text-[var(--bellum-text-accent)]')} aria-hidden />
          {shown ? (
            <Text size="xs" color="text-[var(--bellum-text-accent)]">
              {verdictLabel(shown.verdict)}
            </Text>
          ) : null}
        </button>
      ) : null}

      {open ? (
        <div
          id={panelId}
          className="order-last flex basis-full flex-col gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-2"
        >
          {error ? (
            <div role="alert">
              <Text size="xs" color="text-[var(--danger-soft-text)]">
                {error === 'forbidden' ? t('feedback.forbidden') : t('feedback.error')}
              </Text>
            </div>
          ) : null}
          {body}
        </div>
      ) : null}
    </>
  )
}

function Status({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="text-xs text-[var(--bellum-text-secondary)]">
      {children}
    </div>
  )
}

function GivenActions({
  sending,
  onChange,
  onWithdraw,
}: {
  sending: boolean
  onChange: () => void
  onWithdraw: () => void
}) {
  const { t } = useTranslation('chat')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={LINK} onClick={onChange} disabled={sending}>
        {t('feedback.change')}
      </button>
      <button type="button" className={LINK} onClick={onWithdraw} disabled={sending}>
        {t('feedback.withdraw')}
      </button>
    </div>
  )
}

function ChooserStep({
  step,
  sending,
  canCorrectAccount,
  panelId,
  note,
  field,
  value,
  scope,
  category,
  onNote,
  onField,
  onValue,
  onScope,
  onCategory,
  onChoose,
  onReason,
  onBack,
  onReviewWrong,
  onEditWrong,
  onSubmit,
}: {
  step: Step
  sending: boolean
  canCorrectAccount: boolean
  panelId: string
  note: string
  field: string
  value: string
  scope: 'reply' | 'account'
  category: ReplyFeedbackCategory | ''
  onNote: (value: string) => void
  onField: (value: string) => void
  onValue: (value: string) => void
  onScope: (value: 'reply' | 'account') => void
  onCategory: (value: ReplyFeedbackCategory | '') => void
  onChoose: (verdict: ReplyFeedbackVerdict) => void
  onReason: (reason: ReplyFeedbackReason) => void
  onBack: () => void
  onReviewWrong: () => void
  onEditWrong: () => void
  onSubmit: (choice: FeedbackChoice) => Promise<void>
}) {
  const { t } = useTranslation('chat')

  if (step === 'reasons') {
    return (
      <div className="flex flex-col gap-2">
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('feedback.reasonQuestion')}
        </Text>
        <div className="flex flex-wrap gap-1.5">
          {REPLY_FEEDBACK_REASONS.map(reason => (
            <button key={reason} type="button" className={CHIP} disabled={sending} onClick={() => onReason(reason)}>
              {t(`feedback.reason.${reason}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={LINK}
            disabled={sending}
            onClick={() => void onSubmit({ verdict: 'pas_pertinent' })}
          >
            {t('feedback.noReason')}
          </button>
          <button type="button" className={LINK} onClick={onBack}>
            {t('feedback.back')}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'other') {
    return (
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('feedback.otherLabel')}
          </Text>
          <textarea
            className={FIELD}
            rows={2}
            maxLength={500}
            value={note}
            onChange={event => onNote(event.target.value)}
          />
        </label>
        {/* #2444.1 — précision optionnelle, indépendante du motif « Autre ».
            GA-251 : `SelectField` (@bellum/ui), jamais un menu déroulant natif. */}
        <div className="flex flex-col gap-1">
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('feedback.categoryLabel')}
          </Text>
          <SelectField
            ariaLabel={t('feedback.categoryLabel')}
            value={category}
            onChange={next => onCategory(next as ReplyFeedbackCategory | '')}
            emptyOption={{ label: t('feedback.categoryNone') }}
            options={REPLY_FEEDBACK_CATEGORIES.map(item => ({ value: item, label: t(`feedback.category.${item}`) }))}
            size="sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={CHIP}
            disabled={sending}
            onClick={() =>
              void onSubmit({
                verdict: 'pas_pertinent',
                reason: 'autre',
                ...(note.trim() ? { note: note.trim() } : {}),
                ...(category ? { category } : {}),
              })
            }
          >
            {t('feedback.send')}
          </button>
          <button type="button" className={LINK} onClick={onBack}>
            {t('feedback.back')}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'wrong') {
    return (
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('feedback.wrongField')}
          </Text>
          <input className={FIELD} maxLength={300} value={field} onChange={event => onField(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('feedback.wrongValue')}
          </Text>
          <input className={FIELD} maxLength={1000} value={value} onChange={event => onValue(event.target.value)} />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-xs text-[var(--bellum-text-secondary)]">{t('feedback.scopeLabel')}</legend>
          <label className="flex items-center gap-2 text-xs text-[var(--bellum-text-secondary)] pointer-coarse:min-h-11">
            <input
              type="radio"
              name={`${panelId}-scope`}
              checked={scope === 'reply'}
              onChange={() => onScope('reply')}
            />
            {t('feedback.scope.reply')}
          </label>
          {/* Corriger le DOSSIER suppose un compte : sans compte, l'option n'existe pas. */}
          {canCorrectAccount ? (
            <label className="flex items-center gap-2 text-xs text-[var(--bellum-text-secondary)] pointer-coarse:min-h-11">
              <input
                type="radio"
                name={`${panelId}-scope`}
                checked={scope === 'account'}
                onChange={() => onScope('account')}
              />
              {t('feedback.scope.account')}
            </label>
          ) : null}
        </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={CHIP} disabled={sending || !field.trim()} onClick={onReviewWrong}>
            {t('feedback.review')}
          </button>
          <button type="button" className={LINK} onClick={onBack}>
            {t('feedback.back')}
          </button>
        </div>
      </div>
    )
  }

  // #2444.5 — prévisualisation : champ, valeur et portée se relisent avant
  // l'envoi. Rien ne part avant « Confirmer ».
  if (step === 'wrong-preview') {
    const previewScope = canCorrectAccount ? scope : 'reply'
    return (
      <div className="flex flex-col gap-2">
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('feedback.wrongPreview.title')}
        </Text>
        <dl className="flex flex-col gap-1 text-xs text-[var(--bellum-text-secondary)]">
          <div className="flex flex-col">
            <dt className="text-[var(--bellum-text-muted)]">{t('feedback.wrongField')}</dt>
            <dd>{field.trim()}</dd>
          </div>
          {value.trim() ? (
            <div className="flex flex-col">
              <dt className="text-[var(--bellum-text-muted)]">{t('feedback.wrongValue')}</dt>
              <dd>{value.trim()}</dd>
            </div>
          ) : null}
          <div className="flex flex-col">
            <dt className="text-[var(--bellum-text-muted)]">{t('feedback.scopeLabel')}</dt>
            <dd>{t(`feedback.scope.${previewScope}`)}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={CHIP}
            disabled={sending}
            onClick={() =>
              void onSubmit({
                verdict: 'donnee_fausse',
                correction: {
                  field: field.trim(),
                  ...(value.trim() ? { value: value.trim() } : {}),
                  scope: previewScope,
                },
              })
            }
          >
            {t('feedback.confirm')}
          </button>
          <button type="button" className={LINK} onClick={onEditWrong}>
            {t('feedback.edit')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('feedback.question')}
      </Text>
      <div className="flex flex-wrap gap-1.5">
        {REPLY_FEEDBACK_VERDICTS.map(verdict => (
          <button key={verdict} type="button" className={CHIP} disabled={sending} onClick={() => onChoose(verdict)}>
            {t(`feedback.verdict.${verdict}`)}
          </button>
        ))}
      </div>
    </div>
  )
}
