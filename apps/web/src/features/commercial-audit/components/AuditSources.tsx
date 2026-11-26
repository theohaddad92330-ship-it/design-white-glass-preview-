import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { isPersonalAnswerKey, type EsnAnswers } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { InlineProfileValue } from '@/components/primitives/InlineProfileValue'
import { TEMPS1_STAGES } from '@/features/onboarding/lib/questions'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { useEsnProfileWorkspaceMeta } from '@/features/profile/hooks/useEsnProfileWorkspaceMeta'
import { useSaveEsnField } from '@/features/profile/hooks/useSaveEsnField'
import { answerQuestionOf, answerStageOf } from '../lib/audit-sources'

/**
 * #4425.1 — « Calculé à partir de : … » : les réponses du profil dont une valeur
 * de l'audit DÉRIVE, chacune corrigeable à sa source.
 *
 *  - réponse à choix unique / texte / nombre → champ EN LIGNE
 *    (`InlineProfileValue`), écrit sur le même `PUT /esn-profile` que le
 *    questionnaire (`useSaveEsnField`) ; le serveur relance la génération du
 *    contexte, l'audit se recalcule sur la valeur corrigée ;
 *  - réponse à choix multiples → lien vers son étape (`/settings/profile/$stage`),
 *    où l'éditeur multi-choix existe déjà : pas de seconde copie à tenir.
 *
 * Le verrou de rôle est celui de `ProfileStagePage` : espace partagé + non
 * owner/admin ⇒ les champs d'ENTREPRISE ne s'éditent pas (les champs
 * personnels, si). Le serveur le refuse de toute façon ; l'écran ne promet pas
 * une saisie qui serait ignorée.
 *
 * Tant que le profil n'est pas lu, le bloc se tait : « Non renseigné » serait
 * une affirmation sur une réponse qu'on n'a pas encore vue.
 */
export function AuditSources({ answerKeys }: { answerKeys: readonly (keyof EsnAnswers)[] }) {
  const { t } = useTranslation('commercialAudit')
  const { data: answers } = useEsnProfile()
  const { data: meta } = useEsnProfileWorkspaceMeta()
  const saveField = useSaveEsnField()
  if (!answers) return null

  const lockedCompany = (meta?.shared ?? false) && !(meta?.canEditCompany ?? true)

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--bellum-border)] pt-2" data-testid="audit-sources">
      <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
        {t('sources.title')}
      </Text>
      {answerKeys.map(key => (
        <SourceField
          key={key}
          answerKey={key}
          answers={answers}
          locked={lockedCompany && !isPersonalAnswerKey(key)}
          save={saveField}
        />
      ))}
    </div>
  )
}

function SourceField({
  answerKey,
  answers,
  locked,
  save,
}: {
  answerKey: keyof EsnAnswers
  answers: EsnAnswers
  locked: boolean
  save: ReturnType<typeof useSaveEsnField>
}) {
  const { t } = useTranslation(['commercialAudit', 'onboarding'])
  const question = answerQuestionOf(answerKey)
  if (!question) return null

  const label = t(`onboarding:${question.label}`)
  const raw = answers[answerKey]
  const shown = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string').join(', ') || null
    : typeof raw === 'string' && raw.trim() !== ''
      ? raw
      : typeof raw === 'number'
        ? String(raw)
        : null
  const lockedReason = locked ? t('commercialAudit:sources.locked') : null

  if (question.kind === 'single') {
    return (
      <InlineProfileValue
        label={label}
        value={shown}
        options={question.choices.map(choice => ({
          value: choice.value,
          label: choice.labelKey ? t(`onboarding:${choice.labelKey}`) : choice.value,
        }))}
        onSave={next => save(answerKey, next as EsnAnswers[typeof answerKey])}
        lockedReason={lockedReason}
      />
    )
  }
  if (question.kind === 'text') {
    return (
      <InlineProfileValue
        label={label}
        value={shown}
        onSave={next => save(answerKey, next as EsnAnswers[typeof answerKey])}
        lockedReason={lockedReason}
      />
    )
  }

  // Choix multiples, tags, nombre : l'éditeur de l'étape existe — on y mène.
  const stage = answerStageOf(answerKey)
  return (
    <div>
      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <div className="flex flex-wrap items-center gap-2">
        <Text element="span" size="sm" className={shown ? undefined : 'text-[var(--bellum-text-muted)]'}>
          {shown ?? t('common:inlineEdit.notProvided')}
        </Text>
        {lockedReason ? (
          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
            {lockedReason}
          </Text>
        ) : (
          stage && (
            <Button asChild variant="ghost" size="sm" className="pointer-coarse:min-h-11">
              <Link
                to="/settings/profile/$stage"
                params={{ stage }}
                aria-label={`${t('common:actions.edit')} — ${label}`}
              >
                {t('common:actions.edit')}
              </Link>
            </Button>
          )
        )}
      </div>
    </div>
  )
}

/**
 * Un bloc CALCULÉ (verdict, maturité, plan…) n'est pas éditable : il nomme les
 * étapes du profil qui l'alimentent, une par lien. Rien n'est écrit d'ici.
 */
export function AuditStageSources({ stages }: { stages: readonly string[] }) {
  const { t } = useTranslation(['commercialAudit', 'onboarding'])
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="audit-stage-sources">
      <Text element="span" size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
        {t('commercialAudit:sources.title')}
      </Text>
      {stages.map(code => {
        const stage = TEMPS1_STAGES.find(candidate => candidate.code === code)
        if (!stage) return null
        return (
          <Button key={code} asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
            <Link to="/settings/profile/$stage" params={{ stage: code }}>
              {t(`onboarding:${stage.title}`)}
            </Link>
          </Button>
        )
      })}
    </div>
  )
}
