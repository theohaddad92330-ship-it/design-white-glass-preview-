import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { OpenNeedRow, ProjectNeed, UpdateProjectNeed } from '@bellum/contracts'
import { Badge, Box, Button, Card, Input, SelectField, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { apiFetch } from '@/lib/api'
import { openNeedsKeys } from '../api'
import { useNeedQualification } from '../hooks/useNeedQualification'
import {
  needRequirementsPatch,
  needRequirementsToForm,
  type NeedRequirementsForm,
  type TriState,
} from '../model/need-requirements'

/**
 * CE QUE LE POSTE EXIGE — langues et habilitations.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉCRAN QUI MANQUAIT AU BOUT D'UNE CHAÎNE COMPLÈTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La colonne existe en base, le contrat la déclare en lecture ET en écriture, le
 * rapprochement en fait deux axes — le 6 (langues) et le 12 (habilitations), ce
 * dernier BLOQUANT. Il manquait le seul maillon qui rend tout le reste vivant :
 * un endroit pour le SAISIR. Résultat mesuré avant ce lot : les deux axes
 * tournaient toujours sur un tableau vide côté besoin, donc un profil sans
 * l'habilitation exigée n'était jamais écarté — un garde-fou qui ne s'applique
 * jamais, et qui se lit comme une protection.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUE DIT UNE LISTE VIDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne dit PAS « aucune langue exigée » : elle dit que personne ne l'a
 * renseigné, et elle dit la CONSÉQUENCE — l'axe correspondant sort du
 * dénominateur du score au lieu de valoir zéro. C'est la même règle que partout
 * ailleurs sur cette fiche : une absence porte sa raison, et la raison qui
 * compte ici est celle qui explique pourquoi le rapprochement ne bloque rien.
 *
 * ⚠️ Aucune saisie n'est OBLIGATOIRE (`c42_saisie_creation`) : ces deux champs
 * s'ajoutent APRÈS coup sur un besoin qui existe déjà, et « Enregistrer » sur un
 * formulaire inchangé ne part pas.
 */
export function NeedRequirementsCard({ need }: { need: OpenNeedRow }) {
  const { t } = useTranslation('projects')
  const [editing, setEditing] = useState(false)

  return (
    <Card className="p-4">
      <Box display="flex" className="items-start justify-between gap-2">
        <Text element="h2" size="sm" weight="semibold">
          {t('needSheet.requirementsBlock')}
        </Text>
        {editing ? null : (
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:min-h-11"
            onClick={() => setEditing(true)}
            type="button"
          >
            {t('needSheet.requirements.edit')}
          </Button>
        )}
      </Box>

      {editing ? <RequirementsForm need={need} onDone={() => setEditing(false)} /> : <RequirementsRead need={need} />}

      <NeedQualificationSection needId={need.id} />
    </Card>
  )
}

function RequirementsRead({ need }: { need: OpenNeedRow }) {
  const { t } = useTranslation('projects')
  const languages = need.languages ?? []
  const clearances = need.clearances ?? []

  return (
    <dl className="mt-2 grid gap-2">
      <Row label={t('needSheet.requirements.languages')}>
        {languages.length === 0 ? (
          // ⚠️ Pas « aucune langue » : personne ne l'a renseigné, et la
          // conséquence est NOMMÉE — l'axe sort du dénominateur.
          <UnknownValue reason={t('needSheet.requirements.languagesUnknown')} />
        ) : (
          <div className="flex flex-wrap gap-1">
            {languages.map(language => (
              <Badge key={language.code} variant="outline">
                {language.level
                  ? t('needSheet.requirements.languageWithLevel', {
                      code: language.code.toUpperCase(),
                      level: language.level,
                    })
                  : t('needSheet.requirements.languageWithoutLevel', { code: language.code.toUpperCase() })}
              </Badge>
            ))}
          </div>
        )}
      </Row>
      <Row label={t('needSheet.requirements.clearances')}>
        {clearances.length === 0 ? (
          <UnknownValue reason={t('needSheet.requirements.clearancesUnknown')} />
        ) : (
          <div className="flex flex-wrap gap-1">
            {clearances.map(clearance => (
              // ⚠️ `variant="destructive"` porte SON texte (fond opaque du
              // jeton), et c'est voulu : une habilitation exigée est le seul
              // critère de cette fiche qui ÉCARTE un profil. La peindre comme
              // une compétence souhaitée effacerait la seule information que le
              // recruteur doit voir avant de lancer un rapprochement.
              <Badge key={clearance} variant="destructive">
                {clearance}
              </Badge>
            ))}
          </div>
        )}
      </Row>
      {clearances.length > 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('needSheet.requirements.blockingHint')}
        </Text>
      ) : null}
      <Row label={t('needSheet.requirements.interviewRounds')}>
        {need.interview_rounds == null ? (
          <UnknownValue reason={t('needSheet.requirements.interviewRoundsUnknown')} />
        ) : (
          need.interview_rounds
        )}
      </Row>
      <Row label={t('needSheet.requirements.onsiteDaysPerWeek')}>
        {need.onsite_days_per_week == null ? (
          <UnknownValue reason={t('needSheet.requirements.onsiteDaysPerWeekUnknown')} />
        ) : (
          need.onsite_days_per_week
        )}
      </Row>
      <Row label={t('needSheet.requirements.freelanceExcluded')}>
        {need.freelance_excluded == null ? (
          <UnknownValue reason={t('needSheet.requirements.freelanceExcludedUnknown')} />
        ) : (
          t(need.freelance_excluded ? 'needSheet.requirements.boolYes' : 'needSheet.requirements.boolNo')
        )}
      </Row>
      <Row label={t('needSheet.requirements.budgetValidated')}>
        {need.budget_validated == null ? (
          <UnknownValue reason={t('needSheet.requirements.budgetValidatedUnknown')} />
        ) : (
          t(need.budget_validated ? 'needSheet.requirements.boolYes' : 'needSheet.requirements.boolNo')
        )}
      </Row>
    </dl>
  )
}

function RequirementsForm({ need, onDone }: { need: OpenNeedRow; onDone: () => void }) {
  const { t } = useTranslation('projects')
  const qc = useQueryClient()
  const [form, setForm] = useState<NeedRequirementsForm>(() => needRequirementsToForm(need))

  const save = useMutation<ProjectNeed | null, Error, UpdateProjectNeed | null>({
    mutationFn: patch =>
      patch === null
        ? Promise.resolve(null)
        : apiFetch<ProjectNeed, UpdateProjectNeed>({
            path: `/projects/needs/${need.id}`,
            method: 'PATCH',
            body: patch,
          }),
    onSuccess: result => {
      // Rien n'a bougé : on referme sans annoncer une écriture qui n'a pas eu
      // lieu. Un « enregistré » sur un formulaire inchangé apprend à ne plus
      // lire les confirmations.
      if (result !== null) {
        void qc.invalidateQueries({ queryKey: openNeedsKeys.all })
        void qc.invalidateQueries({ queryKey: ['projects'] })
        toast.success(t('needSheet.requirements.saved'))
      }
      onDone()
    },
    onError: () => toast.error(t('needSheet.requirements.saveFailed')),
  })

  return (
    <form
      className="mt-2 grid gap-3"
      onSubmit={event => {
        event.preventDefault()
        save.mutate(needRequirementsPatch(need, form))
      }}
    >
      <label className="grid gap-1">
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('needSheet.requirements.languages')}
        </Text>
        <Input
          value={form.languages}
          onChange={event => setForm(state => ({ ...state, languages: event.target.value }))}
          placeholder={t('needSheet.requirements.languagesPlaceholder')}
        />
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('needSheet.requirements.languagesHint')}
        </Text>
      </label>

      <label className="grid gap-1">
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('needSheet.requirements.clearances')}
        </Text>
        <Input
          value={form.clearances}
          onChange={event => setForm(state => ({ ...state, clearances: event.target.value }))}
          placeholder={t('needSheet.requirements.clearancesPlaceholder')}
        />
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('needSheet.requirements.clearancesHint')}
        </Text>
      </label>

      <label className="grid gap-1">
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('needSheet.requirements.interviewRounds')}
        </Text>
        <Input
          type="number"
          min={0}
          max={10}
          value={form.interviewRounds}
          onChange={event => setForm(state => ({ ...state, interviewRounds: event.target.value }))}
        />
      </label>

      <label className="grid gap-1">
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('needSheet.requirements.onsiteDaysPerWeek')}
        </Text>
        <Input
          type="number"
          min={0}
          max={5}
          value={form.onsiteDaysPerWeek}
          onChange={event => setForm(state => ({ ...state, onsiteDaysPerWeek: event.target.value }))}
        />
      </label>

      <TriStateField
        label={t('needSheet.requirements.freelanceExcluded')}
        value={form.freelanceExcluded}
        onChange={value => setForm(state => ({ ...state, freelanceExcluded: value }))}
      />

      <TriStateField
        label={t('needSheet.requirements.budgetValidated')}
        value={form.budgetValidated}
        onChange={value => setForm(state => ({ ...state, budgetValidated: value }))}
      />

      <Box display="flex" className="flex-wrap gap-2">
        <Button size="sm" type="submit" className="pointer-coarse:min-h-11" disabled={save.isPending}>
          {t('needSheet.requirements.save')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          className="pointer-coarse:min-h-11"
          onClick={onDone}
          disabled={save.isPending}
        >
          {t('needSheet.requirements.cancel')}
        </Button>
      </Box>
    </form>
  )
}

/** Même forme que la fiche : `<dt>`/`<dd>`, pour que la relation soit ANNONCÉE. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <dt className="min-w-[7rem] text-xs text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-[var(--bellum-text-primary)]">{children}</dd>
    </div>
  )
}

/**
 * #2323.41/.42 — un booléen à TROIS états, jamais une case à cocher : l'état
 * non coché d'une case se confondrait avec un « non » explicite, alors que
 * `null` (« personne n'a répondu ») et `false` (« la réponse est non ») sont
 * deux faits distincts (doctrine UNKNOWN ≠ ZERO).
 */
function TriStateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: TriState
  onChange: (value: TriState) => void
}) {
  const { t } = useTranslation('projects')
  return (
    <div className="grid gap-1">
      <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <SelectField
        ariaLabel={label}
        value={value}
        onChange={next => onChange(next as TriState)}
        options={[
          { value: 'unknown', label: t('needSheet.requirements.boolUnknown') },
          { value: 'yes', label: t('needSheet.requirements.boolYes') },
          { value: 'no', label: t('needSheet.requirements.boolNo') },
        ]}
      />
    </div>
  )
}

/**
 * #2323.32/.34/.35/.36 / #2323.38-.45 — LA QUESTION PRIORITAIRE PAR AXE, ET
 * LES CONTRADICTIONS DÉTECTÉES.
 *
 * ⚠️ Ce bloc ne CALCULE rien : `useNeedQualification` relit
 * `GET /projects/needs/:id/qualification`, dont la décision entière vit dans
 * `needQualificationQuestions`/`needContradictions` (packages/contracts). Même
 * discipline UNKNOWN ≠ ZERO que le reste de la fiche : ce qui n'a pas pu être
 * évalué est NOMMÉ (`notEvaluable`), jamais tu.
 *
 * ⚠️ #2323.44/.45 — l'arbitrage est une PROPOSITION affichée, jamais un bouton
 * qui l'applique : « ce qui n'écrit pas tout seul » (doctrine).
 */
function NeedQualificationSection({ needId }: { needId: string }) {
  const { t } = useTranslation('projects')
  const { questions, contradictions, notEvaluable, isLoading, isError } = useNeedQualification(needId)

  if (isLoading) {
    return (
      <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
        {t('needSheet.qualification.loading')}
      </Text>
    )
  }
  if (isError) {
    return (
      <Text size="xs" className="mt-3 text-[var(--danger-soft-text)]">
        {t('needSheet.qualification.failed')}
      </Text>
    )
  }

  return (
    <div className="mt-4 grid gap-3 border-t border-[var(--bellum-border)] pt-3">
      <Text element="h3" size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
        {t('needSheet.qualification.title')}
      </Text>

      <div className="grid gap-1">
        <Text element="span" size="xs" weight="semibold">
          {t('needSheet.qualification.questionsTitle')}
        </Text>
        {questions.length === 0 ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('needSheet.qualification.noQuestions')}
          </Text>
        ) : (
          <ul className="grid gap-1">
            {questions.map(question => (
              <li key={question.axis} className="text-sm text-[var(--bellum-text-primary)]">
                <Badge variant="outline" className="mr-1">
                  {t(`needSheet.qualification.axis.${question.axis}`)}
                </Badge>
                {question.question.fr}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-1">
        <Text element="span" size="xs" weight="semibold">
          {t('needSheet.qualification.contradictionsTitle')}
        </Text>
        {contradictions.length === 0 ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('needSheet.qualification.noContradictions')}
          </Text>
        ) : (
          <ul className="grid gap-2">
            {contradictions.map(contradiction => (
              <li key={contradiction.key}>
                <Text size="sm" className="text-[var(--danger-soft-text)]">
                  {contradiction.label.fr}
                </Text>
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('needSheet.qualification.arbitration')} : {contradiction.arbitration.fr}
                </Text>
              </li>
            ))}
          </ul>
        )}
      </div>

      {notEvaluable.length > 0 ? (
        <div className="grid gap-1">
          <Text element="span" size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
            {t('needSheet.qualification.notEvaluableTitle')}
          </Text>
          <ul className="grid gap-0.5">
            {notEvaluable.map(item => (
              <li key={item.key}>
                <UnknownValue reason={item.reason.fr} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
