import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, ChevronLeft, Clock, Flag, Lock, Wand2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  hasAnyConfirmedAnswer,
  isAnswerFilled,
  isPersonalAnswerKey,
  resolveAnswerKnowledgeBasis,
  resolveAnswerStatus,
  type AnswerMetaMap,
  type EsnAnswers,
  type EsnProfileWorkspaceMeta,
} from '@bellum/contracts'
import { Badge, Button, cn, Text } from '@bellum/ui'
import { QuestionField } from '@/features/onboarding/components/QuestionField'
import {
  stageQuestions,
  TEMPS1_STAGES,
  type OnboardingStageDef,
  type Question,
} from '@/features/onboarding/lib/questions'
import { presentedValue } from '@/features/onboarding/lib/validation'
import { ProfileSkeleton } from '../components/ProfileSkeleton'
import { ReportCorrectionDialog } from '../components/ReportCorrectionDialog'
import { useConfirmAnswer } from '../hooks/useConfirmAnswer'
import { useAnswerStatus } from '../hooks/useAnswerStatus'
import { useAutoSaveProfile } from '../hooks/useAutoSaveProfile'
import { useEsnProfile } from '../hooks/useEsnProfile'
import { useEsnProfileWorkspaceMeta } from '../hooks/useEsnProfileWorkspaceMeta'
import { useProfileAnswers } from '../hooks/useProfileAnswers'
import { useReconfigureOnboarding } from '../hooks/useReconfigureOnboarding'

/**
 * #2006.22 — réfuté en production le 20/09 : chaque réponse s'affichait avec
 * la même coche, migrée ou confirmée — aucun badge de statut. `answer_meta`
 * (migration `1795000000001-OnboardingAnswerMeta.ts`) et son mapper
 * existaient déjà côté API mais n'avaient AUCUN appelant, donc AUCUN client
 * ne recevait jamais de statut (`GET /esn-profile/answer-status`, ajouté par
 * un lot précédent — voir `esn-profile-workspace.resolver.ts`).
 *
 * `EsnProfileService.upsertAnswers` marque désormais `confirmed` une réponse
 * SAISIE ou CORRIGÉE par l'utilisateur (`stampAnswerMeta`,
 * `answer-meta.mapper.ts`) — voir {@link hasAnyConfirmedAnswer} juste en
 * dessous pour la condition qui allume ce badge sur l'écran.
 */
function AnswerStatusBadge({ status }: { status: 'confirmed' | 'corrected' | 'proposed' | 'unknown' }) {
  const { t } = useTranslation('profile')
  const confirmedLike = status === 'confirmed' || status === 'corrected'
  return (
    <Badge variant={confirmedLike ? 'success' : 'outline'} className="gap-1">
      {confirmedLike ? <Check className="size-3 shrink-0" /> : <Clock className="size-3 shrink-0" />}
      {t(confirmedLike ? 'esn.answerStatus.confirmed' : 'esn.answerStatus.unconfirmed')}
    </Badge>
  )
}

/**
 * #2063.2/.3/.4/.5 — CE DONT LE MOTEUR SAIT DIRE « D'OÙ CETTE RÉPONSE VIENT ».
 *
 * Distinct d'`AnswerStatusBadge` (CONFIRMÉE ou non) : ceci nomme la SOURCE de
 * connaissance — déclaré, préremplié et confirmé, importé, observé, déduit,
 * inconnu — `resolveAnswerKnowledgeBasis` (`@bellum/contracts`), qui réutilise
 * `AnswerProvenance.source` + `AnswerStatus`, déjà persistés. Toujours rendu
 * quand la réponse est remplie : contrairement au badge de confirmation (qui
 * se tait tant que rien n'est confirmé nulle part, #2006.22), savoir D'OÙ vient
 * une réponse reste informatif même sur un profil où rien n'est encore
 * confirmé.
 */
function AnswerKnowledgeBasisLabel({ basis }: { basis: ReturnType<typeof resolveAnswerKnowledgeBasis> }) {
  const { t } = useTranslation('profile')
  return (
    <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
      {t(`esn.knowledgeBasis.${basis}`)}
    </Text>
  )
}

export function ProfileStagePage() {
  const { stage: stageCode } = useParams({ from: '/settings/profile/$stage' })
  const { data: answers, isLoading } = useEsnProfile()
  const { data: meta, isLoading: loadingMeta } = useEsnProfileWorkspaceMeta()
  const stage = TEMPS1_STAGES.find(s => s.code === stageCode)

  if (isLoading || loadingMeta || !answers || !stage) return <ProfileSkeleton />
  return <StageEditor stage={stage} answers={answers} meta={meta ?? null} />
}

/** Exportée pour le test (`ProfileStagePage.test.tsx`) : évite de mocker
 *  `useParams`/`useEsnProfile` juste pour exercer le rendu des questions. */
export function StageEditor({
  stage,
  answers,
  meta,
}: {
  stage: OnboardingStageDef
  answers: EsnAnswers
  meta: EsnProfileWorkspaceMeta | null
}) {
  const { t } = useTranslation('profile')
  const navigate = useNavigate()
  const { values, setField, dirty } = useProfileAnswers(answers)
  useAutoSaveProfile(values, dirty)
  const { data: answerMeta } = useAnswerStatus()
  // #4425.4 — « Confirmer » une réponse sans origine, sans la réécrire.
  const confirmAnswer = useConfirmAnswer()
  // #2006.22 (décision Louis 20/09/2026) — le badge reste ÉTEINT tant
  // qu'AUCUNE réponse n'a jamais été réellement confirmée : un badge qui dit
  // « non confirmé » partout, parce que rien n'est jamais confirmé, ne
  // distingue rien et n'informe personne — c'est l'état réfuté en production.
  // Dès qu'UNE clé est `confirmed`/`corrected`, il redevient un signal utile
  // PARTOUT sur l'écran.
  const answerStatusVisible = hasAnyConfirmedAnswer(answerMeta ?? {})
  // #2018.7 — la clé du champ en cours de signalement, ou `null` : un seul
  // dialogue à la fois, réutilisé pour chaque champ verrouillé.
  const [reporting, setReporting] = useState<string | null>(null)

  // Once a canonical (shared) company profile exists, its company fields are
  // editable by owner/admin only — a member sees them read-only. Personal
  // fields (the member's own sales pain) always stay editable.
  const lockedCompany = (meta?.shared ?? false) && !(meta?.canEditCompany ?? true)
  const isLocked = (question: Question): boolean => lockedCompany && !isPersonalAnswerKey(question.key)
  const statusOf = (map: AnswerMetaMap | undefined, key: string) => resolveAnswerStatus(map?.[key])
  const basisOf = (map: AnswerMetaMap | undefined, key: string) => resolveAnswerKnowledgeBasis(map?.[key])

  // #2021 — recette écran 26/09 : depuis CETTE page (une colonne, sans la
  // carte « Besoin d'aide ? »), rien ne menait au mode guidé. Le geste (#2022)
  // existait déjà, plus bas sur `/settings/profile` (`ReconfigureAnswersSection`)
  // — MÊME déclencheur (`useReconfigureOnboarding`, GA-26), rendu trouvable
  // depuis l'éditeur de chaque étape.
  const guidedMode = useReconfigureOnboarding()
  const onOpenGuidedMode = async (): Promise<void> => {
    const ok = await guidedMode.trigger()
    if (!ok) toast.error(t('stage.guidedModeError'))
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' as const }}
        className="mx-auto w-full max-w-4xl space-y-6"
      >
        {/* Maquette Théo V22 `settings-espace#profil` (thème ouvert) — `.v12-header` : le retour au profil, l'eyebrow,
            le titre du thème, la phrase ; puis une carte par question (`.v12-setting-block`). */}
        <header className="space-y-3">
          <Button
            type="button"
            variant="ghost"
            icon={ChevronLeft}
            size="sm"
            iconPosition="left"
            className="-ml-3 pointer-coarse:min-h-11"
            onClick={() => navigate({ to: '/settings/profile' })}
          >
            {t('common:actions.back')}
          </Button>
          <div>
            <Text
              element="p"
              size="xs"
              weight="semibold"
              className="mb-2 uppercase tracking-widest text-[var(--bellum-text-muted)]"
            >
              {t('framing.eyebrow')}
            </Text>
            <Text element="h1" size="3xl" weight="semibold" className="tracking-tight">
              {t(`onboarding:${stage.title}`)}
            </Text>
            <Text size="sm" className="mt-2 text-[var(--bellum-text-secondary)]">
              {t('stage.autoSaveHint')}
            </Text>
          </div>
          {(guidedMode.available || lockedCompany) && (
            <div className="flex flex-wrap items-center gap-3">
              {guidedMode.available && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={Wand2}
                  isLoading={guidedMode.pending}
                  disabled={guidedMode.pending}
                  className="pointer-coarse:min-h-11"
                  onClick={() => void onOpenGuidedMode()}
                >
                  {t('stage.guidedModeLink')}
                </Button>
              )}
              {lockedCompany && (
                <Text
                  size="xs"
                  className="inline-flex items-center gap-1 rounded-badge border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2 py-1 text-[var(--bellum-text-secondary)]"
                >
                  <Lock aria-hidden className="size-3" />
                  {t('esn.shared.subtitleLocked')}
                </Text>
              )}
            </div>
          )}
        </header>

        <div className="space-y-6">
          {stageQuestions(stage)
            // #4291.5 — le profil d'espace se règle dans Réglages › Règles d'espace, et nulle part ailleurs (GA-26).
            .filter(question => question.key !== 'workspace_profile')
            .map(question => {
              const locked = isLocked(question)
              // #2006.22 — un statut ne se montre que sur une réponse RENSEIGNÉE :
              // une question vide n'a rien à confirmer (GA-18/19, une absence ne
              // s'affiche jamais comme une valeur).
              const filled = isAnswerFilled(presentedValue(question, values[question.key]))
              return (
                <section
                  key={question.key}
                  aria-labelledby={`stage-q-${question.key}`}
                  data-stage-question={question.key}
                  className="overflow-hidden rounded-card border border-[var(--bellum-border)] bg-card"
                >
                  <div className="space-y-1 border-b border-[var(--bellum-border)] px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Text element="h2" size="base" weight="semibold" id={`stage-q-${question.key}`}>
                        {t(`onboarding:${question.label}`, 'max' in question ? { max: question.max } : undefined)}
                      </Text>
                      {locked && <Lock aria-hidden className="size-3 text-[var(--bellum-text-secondary)]" />}
                      {filled && answerStatusVisible && (
                        <AnswerStatusBadge status={statusOf(answerMeta, question.key)} />
                      )}
                      {filled && <AnswerKnowledgeBasisLabel basis={basisOf(answerMeta, question.key)} />}
                      {/* #4425.4 — l'origine n'est pas établie : un geste humain la fonde.
                          Jamais sur un champ verrouillé (le rôle change le geste : signaler),
                          jamais sur une absence. */}
                      {filled && !locked && basisOf(answerMeta, question.key) === 'unknown' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="pointer-coarse:min-h-11"
                          aria-label={`${t('esn.confirmAnswer.button')} — ${t(`onboarding:${question.label}`, 'max' in question ? { max: question.max } : undefined)}`}
                          onClick={() =>
                            void confirmAnswer(question.key).catch(() => toast.error(t('esn.confirmAnswer.error')))
                          }
                        >
                          {t('esn.confirmAnswer.button')}
                        </Button>
                      )}
                    </div>
                    {question.subtitle && (
                      <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                        {t(`onboarding:${question.subtitle}`, 'max' in question ? { max: question.max } : undefined)}
                      </Text>
                    )}
                    {locked && (
                      <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                        {t('esn.shared.lockedField')}
                      </Text>
                    )}
                    {locked && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        icon={Flag}
                        onClick={() => setReporting(question.key)}
                      >
                        {t('esn.correction.reportButton')}
                      </Button>
                    )}
                  </div>
                  <div
                    aria-disabled={locked}
                    className={cn('px-5 py-4 sm:px-6', locked ? 'pointer-events-none opacity-60' : undefined)}
                  >
                    <QuestionField
                      question={question}
                      value={presentedValue(question, values[question.key])}
                      onChange={next => {
                        if (!locked) setField(question.key, next)
                      }}
                    />
                  </div>
                </section>
              )
            })}
        </div>
      </motion.div>
      {reporting && (
        <ReportCorrectionDialog
          open
          fieldKey={reporting}
          onOpenChange={open => {
            if (!open) setReporting(null)
          }}
        />
      )}
    </>
  )
}
