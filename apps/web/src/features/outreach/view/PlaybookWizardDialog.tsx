import {
  OUTREACH_PLAYBOOK_KEYS,
  OUTREACH_PLAYBOOKS,
  OUTREACH_WIZARD_GOALS,
  OUTREACH_WIZARD_OFFERS,
  playbookSequenceName,
  recommendPlaybook,
  type OutreachPlaybookKey,
  type OutreachStepKind,
  type OutreachWizardGoal,
  type OutreachWizardOffer,
} from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
  Textarea,
} from '@bellum/ui'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useContacts } from '@/features/contacts/hooks/useContacts'
import { useDebounce } from '@/hooks/useDebounce'
import { i18n } from '@/i18n'
import { isHardBlocked, excludedRows } from '../enrollment-exclusions'
import { useCreateOutreachSequence } from '../hooks/useOutreachMutations'
import { useEnrollmentEligibility } from '../hooks/useOutreachSequences'
import { prepareStepMessage } from '../playbook-messages'
import {
  buildPlaybookContext,
  buildPlaybookRequest,
  personalizationTerms,
  type PlaybookDrafts,
  type StepDraft,
} from '../playbooks'
import { EnrollmentExclusions } from './EnrollmentExclusions'
import { MessageQuality } from './MessageQuality'

/**
 * Lot L-C (#4166, épopée #4163) — L'ASSISTANT EN 4 QUESTIONS.
 *
 * Qui (un contact), pourquoi maintenant (le signal — pré-rempli quand on vient
 * d'un compte ou d'un signal), ce que j'offre, ce que je veux obtenir. L'assistant
 * PROPOSE le modèle (`recommendPlaybook`, pur) — l'utilisateur en change
 * librement — puis Laura prépare le message de chaque étape qui s'écrit, avec le
 * moteur de rédaction existant (`POST /ia/message`). Tout reste éditable avant
 * d'inscrire ; les exclusions du lot L-B s'appliquent (RGPD jamais forçable).
 *
 * ⚠️ Laura PRÉPARE, la personne envoie : l'e-mail reste un brouillon, LinkedIn
 * et l'appel des gestes manuels. Un message que Laura n'a pas pu préparer reste
 * VIDE — jamais un texte de repli inventé.
 */

type PickedContact = { id: string; full_name: string; company_name?: string | null }

const GENERATED_KINDS: readonly OutreachStepKind[] = ['email', 'linkedin_message', 'call']
const KIND_KEY = {
  email: 'kind.email',
  reminder: 'kind.reminder',
  task: 'kind.task',
  linkedin_invite: 'kind.linkedin_invite',
  linkedin_message: 'kind.linkedin_message',
  call: 'kind.call',
} as const

const QUESTION_COUNT = 4

export function PlaybookWizardDialog({
  open,
  onOpenChange,
  initialPlaybook,
  initialContact,
  initialTrigger,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Le modèle choisi dans la bibliothèque : proposé tel quel, changeable. */
  initialPlaybook?: OutreachPlaybookKey
  /** Le contact d'où l'on vient (compte, fiche) — la question 1 est déjà répondue. */
  initialContact?: PickedContact
  /** Le signal d'où l'on vient — la question 2 est déjà répondue. */
  initialTrigger?: OutreachPlaybookKey | null
}) {
  const { t } = useTranslation('outreach')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('playbooks.wizard.title')}</DialogTitle>
          <DialogDescription>{t('playbooks.wizard.description')}</DialogDescription>
        </DialogHeader>
        <WizardBody
          onClose={() => onOpenChange(false)}
          {...(initialPlaybook ? { initialPlaybook } : {})}
          {...(initialContact ? { initialContact } : {})}
          {...(initialTrigger !== undefined ? { initialTrigger } : {})}
        />
      </DialogContent>
    </Dialog>
  )
}

function WizardBody({
  onClose,
  initialPlaybook,
  initialContact,
  initialTrigger,
}: {
  onClose: () => void
  initialPlaybook?: OutreachPlaybookKey
  initialContact?: PickedContact
  initialTrigger?: OutreachPlaybookKey | null
}) {
  const { t } = useTranslation('outreach')
  const create = useCreateOutreachSequence()

  const [stage, setStage] = useState(0)
  const [contact, setContact] = useState<PickedContact | null>(initialContact ?? null)
  const [trigger, setTrigger] = useState<OutreachPlaybookKey | null>(initialTrigger ?? initialPlaybook ?? null)
  const [offer, setOffer] = useState<OutreachWizardOffer>('regie')
  const [goal, setGoal] = useState<OutreachWizardGoal>('reply')
  // Le modèle que l'utilisateur a imposé (bibliothèque ou « Changer de modèle »).
  const [forced, setForced] = useState<OutreachPlaybookKey | null>(initialPlaybook ?? null)
  const [changing, setChanging] = useState(false)

  const [drafts, setDrafts] = useState<PlaybookDrafts>({})
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set())
  const [preparing, setPreparing] = useState(false)
  const [prepared, setPrepared] = useState(false)
  const [override, setOverride] = useState(false)

  const playbook = forced ?? recommendPlaybook({ trigger, offer, goal })
  const eligibility = useEnrollmentEligibility(contact ? [contact.id] : [])
  const exclusionRows = excludedRows(eligibility.data)
  const hardBlocked = exclusionRows.some(isHardBlocked)
  const excluded = exclusionRows.length > 0

  const playbookName = (key: OutreachPlaybookKey): string => t(`playbooks.trigger.${key}.name`)

  const chooseModel = (key: OutreachPlaybookKey) => {
    setForced(key)
    setChanging(false)
    // Un autre modèle, d'autres étapes : les textes d'avant ne leur correspondent plus.
    setDrafts({})
    setFailed(new Set())
    setPrepared(false)
  }

  const editDraft = (index: number, patch: Partial<StepDraft>) =>
    setDrafts(current => ({ ...current, [index]: { subject: '', body: '', ...current[index], ...patch } }))

  const prepare = async () => {
    if (!contact) return
    setPreparing(true)
    const steps = OUTREACH_PLAYBOOKS[playbook].steps
    const results = await Promise.all(
      steps.map(async (step, index) => {
        if (!GENERATED_KINDS.includes(step.kind)) return { index, draft: null, skipped: true }
        const draft = await prepareStepMessage({
          contactId: contact.id,
          kind: step.kind,
          context: buildPlaybookContext({
            trigger: trigger ? playbookName(trigger) : null,
            stepLabel: step.label,
            intent: t(`playbooks.intent.${step.intent}`),
            offer: t(`playbooks.wizard.offer.${offer}`),
            goal: t(`playbooks.wizard.goal.${goal}`),
          }),
        })
        return { index, draft, skipped: false }
      }),
    )
    const nextDrafts: Record<number, StepDraft> = {}
    const nextFailed = new Set<number>()
    for (const result of results) {
      if (result.skipped) continue
      if (result.draft) nextDrafts[result.index] = result.draft
      else nextFailed.add(result.index)
    }
    setDrafts(nextDrafts)
    setFailed(nextFailed)
    setPrepared(true)
    setPreparing(false)
  }

  const enroll = async () => {
    if (!contact) return
    const request = buildPlaybookRequest({
      contactId: contact.id,
      playbook,
      name: playbookSequenceName(playbook, contact.full_name),
      drafts,
      ...(excluded && override
        ? { overrideExclusions: { justification: i18n.t('outreach:multichannel.exclusions.forceJustification') } }
        : {}),
    })
    try {
      await create.mutateAsync(request)
      toast.success(
        t('playbooks.wizard.enrolled', { name: contact.full_name, count: OUTREACH_PLAYBOOKS[playbook].steps.length }),
      )
      onClose()
    } catch {
      // Le hook a déjà dit ce qui n'allait pas.
      toast.error(t('playbooks.wizard.failed'))
    }
  }

  return (
    <Box className="flex flex-col gap-4" data-testid="playbook-wizard">
      {stage < QUESTION_COUNT ? (
        <Box className="flex flex-col gap-3">
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('playbooks.wizard.stepCounter', { current: stage + 1, total: QUESTION_COUNT })}
          </Text>
          {stage === 0 ? <QuestionWho contact={contact} onPick={setContact} /> : null}
          {stage === 1 ? (
            <QuestionWhy trigger={trigger} onChange={setTrigger} prefilled={initialTrigger ?? null} />
          ) : null}
          {stage === 2 ? (
            <QuestionChoice kind="offer" options={OUTREACH_WIZARD_OFFERS} value={offer} onChange={setOffer} />
          ) : null}
          {stage === 3 ? (
            <QuestionChoice kind="goal" options={OUTREACH_WIZARD_GOALS} value={goal} onChange={setGoal} />
          ) : null}
          <DialogFooter className="gap-2">
            {stage > 0 ? (
              <Button variant="outline" className="pointer-coarse:min-h-11" onClick={() => setStage(stage - 1)}>
                {t('playbooks.wizard.back')}
              </Button>
            ) : null}
            <Button
              className="pointer-coarse:min-h-11"
              disabled={stage === 0 && !contact}
              onClick={() => setStage(stage + 1)}
            >
              {t('playbooks.wizard.next')}
            </Button>
          </DialogFooter>
        </Box>
      ) : (
        <Review
          playbook={playbook}
          contact={contact}
          drafts={drafts}
          failed={failed}
          preparing={preparing}
          prepared={prepared}
          changing={changing}
          onToggleChange={() => setChanging(!changing)}
          onChooseModel={chooseModel}
          onEdit={editDraft}
          onPrepare={() => void prepare()}
          onBack={() => setStage(QUESTION_COUNT - 1)}
          footer={
            <>
              <EnrollmentExclusions
                eligibility={eligibility.data}
                overridden={override}
                onOverrideChange={setOverride}
                t={t}
              />
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('playbooks.wizard.draftOnly')}
              </Text>
              {hardBlocked ? (
                <Text size="xs" className="text-[var(--warning-soft-text)]">
                  {t('playbooks.wizard.blocked', { reason: t('multichannel.exclusions.reason.rgpd_opposition') })}
                </Text>
              ) : null}
              <Button
                className="self-end pointer-coarse:min-h-11"
                disabled={hardBlocked || (excluded && !override) || create.isPending || !contact}
                onClick={() => void enroll()}
              >
                {create.isPending ? t('playbooks.wizard.enrolling') : t('playbooks.wizard.enroll')}
              </Button>
            </>
          }
        />
      )}
    </Box>
  )
}

/* --------------------------------- questions -------------------------------- */

function QuestionWho({ contact, onPick }: { contact: PickedContact | null; onPick: (contact: PickedContact) => void }) {
  const { t } = useTranslation('outreach')
  const [search, setSearch] = useState('')
  const [debounced] = useDebounce(search, 300)
  const contacts = useContacts(debounced ? { q: debounced } : {})
  const rows = useMemo(() => (contacts.data?.pages ?? []).flatMap(page => page.data).slice(0, 6), [contacts.data])
  return (
    <Box className="flex flex-col gap-2">
      <Text element="h3" size="base" weight="semibold">
        {t('playbooks.wizard.q1')}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('playbooks.wizard.q1Hint')}
      </Text>
      {contact ? (
        <Text size="sm" weight="medium" role="status">
          {t('playbooks.wizard.q1Chosen', { name: contact.full_name })}
        </Text>
      ) : null}
      <Input
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder={t('playbooks.wizard.q1Search')}
        aria-label={t('playbooks.wizard.q1Search')}
      />
      {rows.length === 0 && debounced ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('playbooks.wizard.q1None')}
        </Text>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map(row => (
            <li key={row.id}>
              <Button
                size="sm"
                variant={contact?.id === row.id ? 'default' : 'ghost'}
                className="pointer-coarse:min-h-11"
                aria-pressed={contact?.id === row.id}
                onClick={() => onPick({ id: row.id, full_name: row.full_name, company_name: row.company_name ?? null })}
              >
                {row.full_name}
                {row.company_name ? (
                  <span className="ml-2 text-[var(--bellum-text-muted)]">{row.company_name}</span>
                ) : null}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Box>
  )
}

function QuestionWhy({
  trigger,
  onChange,
  prefilled,
}: {
  trigger: OutreachPlaybookKey | null
  onChange: (next: OutreachPlaybookKey | null) => void
  prefilled: OutreachPlaybookKey | null
}) {
  const { t } = useTranslation('outreach')
  return (
    <Box className="flex flex-col gap-2">
      <Text element="h3" size="base" weight="semibold">
        {t('playbooks.wizard.q2')}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('playbooks.wizard.q2Hint')}
      </Text>
      {prefilled ? (
        <Text size="sm" weight="medium">
          {t('playbooks.wizard.q2Prefilled', { name: t(`playbooks.trigger.${prefilled}.name`) })}
        </Text>
      ) : null}
      <Box role="radiogroup" aria-label={t('playbooks.wizard.q2')} className="flex flex-col gap-1">
        {OUTREACH_PLAYBOOK_KEYS.map(key => (
          <Choice key={key} checked={trigger === key} onSelect={() => onChange(key)}>
            {t(`playbooks.trigger.${key}.name`)}
          </Choice>
        ))}
        <Choice checked={trigger === null} onSelect={() => onChange(null)}>
          {t('playbooks.wizard.q2None')}
        </Choice>
      </Box>
    </Box>
  )
}

function QuestionChoice<V extends string>({
  kind,
  options,
  value,
  onChange,
}: {
  kind: 'offer' | 'goal'
  options: readonly V[]
  value: V
  onChange: (next: V) => void
}) {
  const { t } = useTranslation('outreach')
  const question = kind === 'offer' ? 'q3' : 'q4'
  return (
    <Box className="flex flex-col gap-2">
      <Text element="h3" size="base" weight="semibold">
        {t(`playbooks.wizard.${question}`)}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t(`playbooks.wizard.${question}Hint`)}
      </Text>
      <Box role="radiogroup" aria-label={t(`playbooks.wizard.${question}`)} className="flex flex-col gap-1">
        {options.map(option => (
          <Choice key={option} checked={value === option} onSelect={() => onChange(option)}>
            {t(`playbooks.wizard.${kind}.${option}`)}
          </Choice>
        ))}
      </Box>
    </Box>
  )
}

/** Un choix de liste fermée : un vrai bouton, tabulable, 44 px sur écran tactile. */
function Choice({
  checked,
  onSelect,
  children,
}: {
  checked: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={
        'min-h-11 rounded-lg border px-3 py-2 text-left text-sm ' +
        (checked
          ? 'border-[var(--bellum-primary-500)] bg-[var(--bellum-surface-2)]'
          : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]')
      }
    >
      {children}
    </button>
  )
}

/* ---------------------------------- relecture ------------------------------- */

function Review({
  playbook,
  contact,
  drafts,
  failed,
  preparing,
  prepared,
  changing,
  onToggleChange,
  onChooseModel,
  onEdit,
  onPrepare,
  onBack,
  footer,
}: {
  playbook: OutreachPlaybookKey
  contact: PickedContact | null
  drafts: PlaybookDrafts
  failed: ReadonlySet<number>
  preparing: boolean
  prepared: boolean
  changing: boolean
  onToggleChange: () => void
  onChooseModel: (key: OutreachPlaybookKey) => void
  onEdit: (index: number, patch: Partial<StepDraft>) => void
  onPrepare: () => void
  onBack: () => void
  footer: React.ReactNode
}) {
  const { t } = useTranslation('outreach')
  const terms = contact
    ? personalizationTerms({ full_name: contact.full_name, account_name: contact.company_name ?? null })
    : []
  return (
    <Box className="flex flex-col gap-3">
      <Box className="flex flex-wrap items-center justify-between gap-2">
        <Box className="flex flex-col gap-1">
          <Text element="h3" size="base" weight="semibold">
            {t('playbooks.wizard.proposed', { name: t(`playbooks.trigger.${playbook}.name`) })}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('playbooks.wizard.proposedHint')}
          </Text>
        </Box>
        <Box className="flex gap-2">
          <Button size="sm" variant="outline" className="pointer-coarse:min-h-11" onClick={onBack}>
            {t('playbooks.wizard.back')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="pointer-coarse:min-h-11"
            onClick={onToggleChange}
            aria-expanded={changing}
          >
            {t('playbooks.wizard.change')}
          </Button>
        </Box>
      </Box>

      {changing ? (
        <Box role="radiogroup" aria-label={t('playbooks.wizard.change')} className="flex flex-col gap-1">
          {OUTREACH_PLAYBOOK_KEYS.map(key => (
            <Choice key={key} checked={key === playbook} onSelect={() => onChooseModel(key)}>
              {t(`playbooks.trigger.${key}.name`)}
            </Choice>
          ))}
        </Box>
      ) : null}

      <Button className="self-start pointer-coarse:min-h-11" disabled={preparing || !contact} onClick={onPrepare}>
        {preparing ? t('playbooks.wizard.preparing') : t('playbooks.wizard.prepare')}
      </Button>
      {prepared ? (
        <Text size="sm" role="status">
          {t('playbooks.wizard.prepared')}
        </Text>
      ) : null}

      <ol className="flex flex-col gap-3">
        {OUTREACH_PLAYBOOKS[playbook].steps.map((step, index) => {
          const draft = drafts[index]
          // Une invitation LinkedIn peut porter une note courte, écrite à la main (Laura ne la rédige pas).
          const writable = GENERATED_KINDS.includes(step.kind) || step.kind === 'linkedin_invite'
          return (
            <li
              key={`${playbook}-${index}`}
              className="flex flex-col gap-2 rounded-lg border border-[var(--bellum-border)] p-3"
            >
              <Box className="flex flex-wrap items-center gap-2">
                <Text size="xs" weight="medium">
                  {step.offset_days === 0 ? t('playbooks.day0') : t('playbooks.day', { count: step.offset_days })}
                </Text>
                <Badge>{t(KIND_KEY[step.kind])}</Badge>
                <Text size="sm" weight="medium">
                  {step.label}
                </Text>
              </Box>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t(`playbooks.intent.${step.intent}`)}
              </Text>
              {writable ? (
                <>
                  {step.kind === 'email' ? (
                    <Input
                      value={draft?.subject ?? ''}
                      onChange={event => onEdit(index, { subject: event.target.value })}
                      aria-label={`${t('playbooks.wizard.subject')} — ${step.label}`}
                    />
                  ) : null}
                  <Textarea
                    rows={step.kind === 'call' ? 5 : 4}
                    value={draft?.body ?? ''}
                    onChange={event => onEdit(index, { body: event.target.value })}
                    aria-label={`${t('playbooks.wizard.body')} — ${step.label}`}
                  />
                  {failed.has(index) ? (
                    <Text size="xs" className="text-[var(--warning-soft-text)]">
                      {t('playbooks.wizard.notPrepared')}
                    </Text>
                  ) : null}
                  {/* #4163 LF — le score se montre dès l'aperçu : « non évalué » tant que le texte est vide
                      (jamais une note nue) ; une étape que Laura n'a pas pu préparer le dit déjà plus haut. */}
                  {(step.kind === 'email' || step.kind === 'linkedin_message') &&
                  (draft?.body.trim() || !failed.has(index)) ? (
                    <MessageQuality
                      channel={step.kind === 'email' ? 'email' : 'linkedin'}
                      subject={draft?.subject}
                      body={draft?.body}
                      personalization={terms}
                    />
                  ) : null}
                </>
              ) : (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('playbooks.wizard.noText')}
                </Text>
              )}
            </li>
          )
        })}
      </ol>
      {footer}
    </Box>
  )
}
