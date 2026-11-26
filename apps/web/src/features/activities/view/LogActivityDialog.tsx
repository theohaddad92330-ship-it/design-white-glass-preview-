import { CALL_OUTCOMES, type CallDebrief, type CallNextAction, type CallOutcome } from '@bellum/contracts'
import {
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

type LoggableKind = 'call' | 'meeting' | 'email' | 'note' | 'linkedin'
type LoggableDirection = 'inbound' | 'outbound' | 'internal'
type EntryMode = 'note' | 'dictation' | 'transcript'

type LogActivityDraft = {
  kind: LoggableKind
  direction: LoggableDirection
  subject?: string
  body?: string
  occurredAt?: string
  durationSeconds: number | null
  /** L'issue de l'appel (N11-B). N'a de sens que sur `kind: 'call'`. */
  outcome?: CallOutcome
  /** #2377.4 — fait/besoin/objection/engagement, séparés du corps libre. */
  callDebrief?: CallDebrief
  /** #2377.6 — owner+date+condition, ou rien : jamais une action à moitié posée. */
  nextAction?: CallNextAction
  /** #2984 — DÉCLARATIF, jamais une porte : `false` reste un état honnête. */
  recordingConsent?: boolean
}

const KINDS: LoggableKind[] = ['call', 'meeting', 'email', 'note', 'linkedin']
const DIRECTIONS: LoggableDirection[] = ['outbound', 'inbound', 'internal']
const ENTRY_MODES: EntryMode[] = ['note', 'dictation', 'transcript']

/**
 * #2377.9 — les 6 boutons de « réponse rapide » du corps de l'issue #2377,
 * repris tels quels contre le catalogue existant (jamais une seconde liste).
 * Le reste des 20 valeurs de `CALL_OUTCOMES` reste accessible derrière
 * « Toutes les issues » — fermé par défaut, pour que le geste le plus
 * fréquent (raccrocher, choisir, continuer) ne demande jamais de parcourir
 * vingt boutons.
 */
const QUICK_CALL_OUTCOMES: readonly CallOutcome[] = [
  'no_answer',
  'wrong_contact',
  'callback_scheduled',
  'interest',
  'need_detected',
  'refused',
]

function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/** Le sous-ensemble de l'API Web Speech dont ce composant se sert. */
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

/**
 * « J'ai appelé, il rappelle en septembre. »
 *
 * Le geste que rien d'automatique ne remplace : ce qui s'est dit au téléphone
 * n'est écrit nulle part, et ce qui n'est pas noté disparaît avec la personne
 * qui l'a entendu.
 *
 * Deux choix de formulaire, tous deux contre une donnée fausse :
 *
 *  - la DURÉE est facultative et vide par défaut. Pré-remplir « 30 min »
 *    remplirait la base de durées que personne n'a mesurées ;
 *  - le SENS est demandé explicitement, avec « interne » proposé. Le déduire du
 *    type ferait passer chaque réunion d'équipe pour une touche client.
 *
 * #2377 — le compilateur de fin d'appel vit ICI plutôt que comme un nouvel
 * outil `/chat` : le formulaire est l'appelant réel déjà branché (voir
 * TimelinePanel), et un compilateur conversationnel complet (pattern
 * `compile_need`) est un chantier séparé, non commencé (memory
 * `prochain-chantier-les-compilateurs-de-chat.md`, ~665 points). Le
 * COMPORTEMENT demandé — transformer la fin d'appel sans ressaisir le
 * contexte, boutons rapides, aperçu avant écriture, prochaine action exigée —
 * est livré à l'identique dans ce formulaire.
 */
export function LogActivityDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  heading,
}: {
  /** #3697 — titre propre au parcours appelant (« Consigner un appel ») ; absent = « Noter un échange ». */
  heading?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: LogActivityDraft) => void
  isPending: boolean
}) {
  const { t } = useTranslation('activities')
  const [kind, setKind] = useState<LoggableKind>('call')
  // #3697 (recette prod 08/10) — « Envoyé » apparaissait déjà sélectionné sans
  // qu'on l'ait choisi. Contrairement à la Nature (« Appel » reste la seule
  // valeur plausible dans ce formulaire), le SENS n'a aucune valeur unique
  // possible : `undefined` jusqu'au clic, comme le docblock du composant le
  // promet déjà (« le sens est demandé explicitement »).
  const [direction, setDirection] = useState<LoggableDirection | undefined>(undefined)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [minutes, setMinutes] = useState('')
  const [outcome, setOutcome] = useState<CallOutcome | undefined>(undefined)
  const [showAllOutcomes, setShowAllOutcomes] = useState(false)
  const [entryMode, setEntryMode] = useState<EntryMode>('note')
  const [dictating, setDictating] = useState(false)
  const [fact, setFact] = useState('')
  const [need, setNeed] = useState('')
  const [objection, setObjection] = useState('')
  const [engagement, setEngagement] = useState('')
  // #2984 — DÉCLARATIF : décochée par défaut, elle n'empêche jamais
  // `submit()` de partir, contrairement à `recordingConsent: z.literal(true)`
  // sur la transcription audio réelle (#2319.57, un tiers reçoit un VRAI
  // enregistrement, ce n'est pas le cas ici).
  const [recordingConsent, setRecordingConsent] = useState(false)
  const [nextActionOpen, setNextActionOpen] = useState(false)
  const [nextActionOwner, setNextActionOwner] = useState('')
  const [nextActionDueDate, setNextActionDueDate] = useState('')
  const [nextActionCondition, setNextActionCondition] = useState('')
  const [nextActionExpectedResult, setNextActionExpectedResult] = useState('')
  const [nextActionError, setNextActionError] = useState(false)

  // #2377.9 — quick buttons + toute autre nature : rien ne demande de choisir
  // une issue d'abord.
  const detailVisible = kind !== 'call' || outcome !== undefined

  const selectKind = (value: LoggableKind) => {
    setKind(value)
    // L'issue n'a de sens que sur un appel : en sortir efface la sélection,
    // plutôt que de la laisser resurgir si on repasse sur « Appel » plus tard
    // sans l'avoir choisie à nouveau.
    if (value !== 'call') setOutcome(undefined)
  }

  const dictate = () => {
    const Ctor = speechRecognitionCtor()
    if (!Ctor) return
    if (dictating) {
      setDictating(false)
      return
    }
    const recognition = new Ctor()
    recognition.lang = 'fr-FR'
    recognition.continuous = true
    recognition.interimResults = false
    recognition.onresult = event => {
      const chunks: string[] = []
      for (let i = 0; i < event.results.length; i += 1) chunks.push(event.results[i]?.[0]?.transcript ?? '')
      const heard = chunks.join(' ').trim()
      if (heard) setBody(current => (current ? `${current} ${heard}` : heard))
    }
    recognition.onend = () => setDictating(false)
    recognition.start()
    setDictating(true)
  }

  const debrief = (): CallDebrief | undefined => {
    const value: CallDebrief = {}
    if (fact.trim()) value.fact = fact.trim()
    if (need.trim()) value.need = need.trim()
    if (objection.trim()) value.objection = objection.trim()
    if (engagement.trim()) value.engagement = engagement.trim()
    return Object.keys(value).length > 0 ? value : undefined
  }

  const recapLines = (): string[] => {
    const lines: string[] = []
    if (outcome) lines.push(t(`outcome.value.${outcome}`))
    if (fact.trim()) lines.push(fact.trim())
    if (need.trim()) lines.push(need.trim())
    if (objection.trim()) lines.push(objection.trim())
    if (engagement.trim()) lines.push(engagement.trim())
    if (body.trim()) lines.push(body.trim())
    return lines
  }

  // #3688.9 — SAISIE NON ENREGISTRÉE PROTÉGÉE : fermer (Annuler, croix, Échap)
  // avec du texte saisi demande avant de jeter. La fermeture APRÈS enregistrement
  // vient du parent (le dialogue se démonte), elle ne passe pas par ici.
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const dirty = [subject, body, minutes, fact, need, objection, engagement].some(value => value.trim().length > 0)
  const requestClose = (next: boolean) => {
    if (next || !dirty) {
      onOpenChange(next)
      return
    }
    setConfirmDiscard(true)
  }

  const submit = () => {
    const parsed = Number.parseInt(minutes, 10)

    // #2377.6 — refusé CÔTÉ FORMULAIRE avant même d'atteindre le serveur :
    // « Rappeler » seul est insuffisant, jamais une action à moitié posée.
    let nextAction: CallNextAction | undefined
    if (kind === 'call' && nextActionOpen) {
      const owner = nextActionOwner.trim()
      const dueDate = nextActionDueDate.trim()
      const condition = nextActionCondition.trim()
      if (!owner || !dueDate || !condition) {
        setNextActionError(true)
        return
      }
      nextAction = {
        owner,
        dueDate,
        condition,
        ...(nextActionExpectedResult.trim() ? { expectedResult: nextActionExpectedResult.trim() } : {}),
      }
    }
    setNextActionError(false)

    onSubmit({
      kind,
      // #3697 — aucune donnée inventée côté écran : un sens jamais cliqué
      // retombe sur le MÊME défaut que le contrat serveur (`logActivitySchema`,
      // `direction.default('outbound')`) plutôt que d'ajouter un second défaut.
      direction: direction ?? 'outbound',
      subject: subject.trim() || undefined,
      body: body.trim() || undefined,
      // Une durée illisible ou vide reste `null` : mieux vaut ne pas savoir que
      // savoir faux.
      durationSeconds: Number.isFinite(parsed) && parsed > 0 ? parsed * 60 : null,
      outcome: kind === 'call' ? outcome : undefined,
      callDebrief: kind === 'call' ? debrief() : undefined,
      nextAction,
      recordingConsent: kind === 'call' ? recordingConsent : undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-lg border-[var(--bellum-border)]">
        <DialogHeader>
          <DialogTitle>{heading ?? t('log.title')}</DialogTitle>
          <DialogDescription>{t('log.subtitle')}</DialogDescription>
        </DialogHeader>

        <Box className="space-y-4">
          <Box className="space-y-1.5">
            <Text element="span" size="xs" weight="medium">
              {t('log.kindLabel')}
            </Text>
            <Box display="flex" className="flex-wrap gap-1">
              {KINDS.map(value => (
                <Button
                  key={value}
                  variant={kind === value ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-pressed={kind === value}
                  onClick={() => selectKind(value)}
                >
                  {t(`kinds.${value}`)}
                </Button>
              ))}
            </Box>
          </Box>

          <Box className="space-y-1.5">
            <Text element="span" size="xs" weight="medium">
              {t('log.directionLabel')}
            </Text>
            <Box display="flex" className="flex-wrap gap-1">
              {DIRECTIONS.map(value => (
                <Button
                  key={value}
                  variant={direction === value ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-pressed={direction === value}
                  onClick={() => setDirection(value)}
                >
                  {t(`direction.${value}`)}
                </Button>
              ))}
            </Box>
          </Box>

          {kind === 'call' ? (
            <Box className="space-y-1.5">
              <Text element="span" size="xs" weight="medium">
                {t('log.outcomeLabel')}
              </Text>
              <Box display="flex" className="flex-wrap gap-1">
                {QUICK_CALL_OUTCOMES.map(value => (
                  <Button
                    key={value}
                    variant={outcome === value ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setOutcome(current => (current === value ? undefined : value))}
                  >
                    {t(`outcome.value.${value}`)}
                  </Button>
                ))}
                {!showAllOutcomes ? (
                  <Button variant="ghost" size="sm" onClick={() => setShowAllOutcomes(true)}>
                    {t('log.showAllOutcomes')}
                  </Button>
                ) : null}
              </Box>
              {showAllOutcomes ? (
                <Box display="flex" className="flex-wrap gap-1">
                  {CALL_OUTCOMES.filter(value => !QUICK_CALL_OUTCOMES.includes(value)).map(value => (
                    <Button
                      key={value}
                      variant={outcome === value ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setOutcome(current => (current === value ? undefined : value))}
                    >
                      {t(`outcome.value.${value}`)}
                    </Button>
                  ))}
                </Box>
              ) : null}
              <Text element="span" size="xs" color="text-muted-foreground">
                {t('log.outcomeHint')}
              </Text>
            </Box>
          ) : null}

          {detailVisible ? (
            <>
              <Input
                value={subject}
                onChange={event => setSubject(event.target.value)}
                placeholder={t('log.subjectPlaceholder')}
                aria-label={t('log.subjectLabel')}
              />

              {kind === 'call' ? (
                <Box display="flex" className="flex-wrap gap-1">
                  {ENTRY_MODES.map(mode => (
                    <Button
                      key={mode}
                      variant={entryMode === mode ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setEntryMode(mode)}
                    >
                      {t(`log.entryMode.${mode}`)}
                    </Button>
                  ))}
                  {entryMode === 'dictation' ? (
                    speechRecognitionCtor() ? (
                      <Button variant="ghost" size="sm" onClick={dictate}>
                        {t(dictating ? 'log.dictation.stop' : 'log.dictation.start')}
                      </Button>
                    ) : (
                      <Text element="span" size="xs" color="text-muted-foreground">
                        {t('log.dictation.unsupported')}
                      </Text>
                    )
                  ) : null}
                </Box>
              ) : null}

              <Textarea
                value={body}
                onChange={event => setBody(event.target.value)}
                placeholder={t('log.bodyPlaceholder')}
                className="min-h-[112px]"
                aria-label={t('log.bodyLabel')}
              />

              {kind === 'call' ? (
                <Box className="space-y-2">
                  <Input
                    value={fact}
                    onChange={event => setFact(event.target.value)}
                    aria-label={t('log.debrief.factLabel')}
                    placeholder={t('log.debrief.factLabel')}
                  />
                  <Input
                    value={need}
                    onChange={event => setNeed(event.target.value)}
                    aria-label={t('log.debrief.needLabel')}
                    placeholder={t('log.debrief.needLabel')}
                  />
                  <Input
                    value={objection}
                    onChange={event => setObjection(event.target.value)}
                    aria-label={t('log.debrief.objectionLabel')}
                    placeholder={t('log.debrief.objectionLabel')}
                  />
                  <Input
                    value={engagement}
                    onChange={event => setEngagement(event.target.value)}
                    aria-label={t('log.debrief.engagementLabel')}
                    placeholder={t('log.debrief.engagementLabel')}
                  />
                </Box>
              ) : null}

              {/* #2984 — DÉCLARATIVE : décochée par défaut, elle n'empêche
                  jamais `submit()`, contrairement au patron #2319.57 réservé à
                  un VRAI enregistrement audio envoyé à un tiers. */}
              {kind === 'call' ? (
                <label className="flex min-h-11 cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0"
                    checked={recordingConsent}
                    onChange={event => setRecordingConsent(event.target.checked)}
                    aria-label={t('log.recordingConsent')}
                  />
                  <Text element="span" size="xs">
                    {t('log.recordingConsent')}
                  </Text>
                </label>
              ) : null}

              {kind === 'call' ? (
                <Box className="space-y-1.5 rounded-md border border-[var(--bellum-border)] p-2">
                  <Text element="span" size="xs" weight="medium">
                    {t('log.recap.title')}
                  </Text>
                  <Box className="space-y-0.5">
                    {recapLines().map((line, index) => (
                      <Text key={`${index}-${line}`} element="p" size="xs" color="text-muted-foreground">
                        {line}
                      </Text>
                    ))}
                  </Box>
                </Box>
              ) : null}

              {kind === 'call' ? (
                <Box className="space-y-1.5">
                  {!nextActionOpen ? (
                    <Button variant="ghost" size="sm" onClick={() => setNextActionOpen(true)}>
                      {t('log.nextAction.add')}
                    </Button>
                  ) : (
                    <Box className="space-y-2">
                      <Input
                        value={nextActionOwner}
                        onChange={event => setNextActionOwner(event.target.value)}
                        aria-label={t('log.nextAction.ownerLabel')}
                        placeholder={t('log.nextAction.ownerLabel')}
                      />
                      <Input
                        type="date"
                        value={nextActionDueDate}
                        onChange={event => setNextActionDueDate(event.target.value)}
                        aria-label={t('log.nextAction.dueDateLabel')}
                      />
                      <Input
                        value={nextActionCondition}
                        onChange={event => setNextActionCondition(event.target.value)}
                        aria-label={t('log.nextAction.conditionLabel')}
                        placeholder={t('log.nextAction.conditionLabel')}
                      />
                      <Input
                        value={nextActionExpectedResult}
                        onChange={event => setNextActionExpectedResult(event.target.value)}
                        aria-label={t('log.nextAction.expectedResultLabel')}
                        placeholder={t('log.nextAction.expectedResultLabel')}
                      />
                      {nextActionError ? (
                        <Text element="span" size="xs" className="text-[var(--danger-soft-text)]" role="alert">
                          {t('log.nextAction.incomplete')}
                        </Text>
                      ) : null}
                    </Box>
                  )}
                </Box>
              ) : null}
            </>
          ) : null}

          <Box className="space-y-1.5">
            <Text element="span" size="xs" weight="medium">
              {t('log.durationLabel')}
            </Text>
            <Input
              type="number"
              min={0}
              value={minutes}
              onChange={event => setMinutes(event.target.value)}
              placeholder={t('log.durationPlaceholder')}
              aria-label={t('log.durationLabel')}
            />
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('log.durationHint')}
            </Text>
          </Box>
        </Box>

        {confirmDiscard ? (
          <Box className="rounded-md border border-dashed border-border p-3" role="alert">
            <Text size="sm">{t('log.discard.title')}</Text>
            <Box display="flex" className="mt-2 flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDiscard(false)}>
                {t('log.discard.keep')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                {t('log.discard.confirm')}
              </Button>
            </Box>
          </Box>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => requestClose(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="black" size="sm" isLoading={isPending} onClick={submit}>
            {t('log.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
