import { timesheetDecisionLock, type TimesheetCheck, type TimesheetReview } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Text,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRejectTimesheet, useReviewInternally, useTimesheetReview, useValidateByClient } from '../api'

/** Le motif est borné comme `rejectTimesheetSchema` — un champ qui laisse taper
 *  ce que le serveur rejette ment à celui qui l'écrit. */
const REASON_MAX = 500

/** Ce que le tiroir a besoin de savoir pour aller chercher SON relevé. */
export type TimesheetReviewTarget = { missionId: string; month: string; consultantId: string | null }

/**
 * LE TIROIR DE VALIDATION D'UN RELEVÉ D'ACTIVITÉ (PDF-22 §05, PDF-06 §4.4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIX BLOCS, ET AUCUN N'EST DÉCORATIF
 * ─────────────────────────────────────────────────────────────────────────────
 * En-tête · vérification automatique · détail des jours · pièces jointes ·
 * action recommandée · valider / rejeter. La liste vient du dossier du 26 août,
 * et le tiroir des notes de frais tient déjà la même forme : ce qui est nouveau
 * ici, c'est la nuance que l'écran des relevés ne savait pas dire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ « NON VÉRIFIÉ » N'EST PAS « RIEN À SIGNALER »
 * ─────────────────────────────────────────────────────────────────────────────
 * L'écran des relevés affichait la liste d'anomalies écrite au dépôt, et son
 * absence se lisait comme une garantie. Sur un mois où PERSONNE n'a rien
 * déposé, aucune anomalie n'avait été détectée — parce qu'aucun contrôle
 * n'avait tourné. « Cassé » et « non mesurable » se ressemblent trop pour qu'on
 * les confonde.
 *
 * L'encart de vérification a donc TROIS teintes, et la troisième n'emprunte
 * jamais le vert : `success` quand tout ce qui a pu être vérifié est passé,
 * `warning` dès qu'un constat est relevé, `info` quand rien n'a pu l'être.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ L'ACTION RECOMMANDÉE SE DÉRIVE, ELLE NE S'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `recommendation` vient de `recommendTimesheetAction`, pur et testé, qui rend
 * `not_measurable` quand aucun contrôle n'a abouti — et l'écran écrit alors
 * qu'il n'a pas d'avis. Pas une phrase vague : une phrase vague a l'air d'un
 * conseil et n'en est pas un.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ UN RELEVÉ DÉCIDÉ NE SE RE-DÉCIDE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Même motif que le tiroir des notes de frais : le pied disparaît quand il n'y
 * a plus rien à décider. La frontière n'est PAS réécrite ici — elle vient de
 * `timesheetDecisionLock`, qui reflète ce que le serveur refuse déjà. Une
 * troisième copie du prédicat aurait divergé, et un bouton qui part pour
 * revenir en 400 fait recliquer.
 */
export function TimesheetReviewDrawer({
  target,
  onClose,
}: {
  target: TimesheetReviewTarget | null
  onClose: () => void
}) {
  const { t } = useTranslation('missions')
  const { data, isLoading, isError } = useTimesheetReview(target)

  return (
    <Sheet open={target !== null} onOpenChange={open => (open ? undefined : onClose())}>
      {/* `dvh` et jamais `vh` : sur mobile, `vh` compte la barre d'URL et le
          pied du tiroir passe sous le bord de l'écran. `flex` + `min-h-0` sur
          le corps : un seul conteneur défile (GA-29). */}
      <SheetContent
        closeLabel={t('common:actions.close')}
        side="right"
        className="flex max-h-[100dvh] w-full max-w-xl flex-col gap-0 p-0 sm:max-w-xl"
      >
        {isLoading ? (
          // Même pendant le chargement, le dialogue porte un titre ET une
          // description : sans eux, un lecteur d'écran annonce un dialogue
          // anonyme au moment précis où l'on ne voit rien.
          <Box className="p-6">
            <SheetTitle className="text-lg">{t('cra.review.eyebrow')}</SheetTitle>
            <SheetDescription className="mt-1 text-sm">{t('cra.review.loading')}</SheetDescription>
          </Box>
        ) : isError || !data ? (
          // Un échec de lecture ne se rend jamais comme « relevé vide » : on
          // irait chercher un mois qui existe.
          <Box className="p-6">
            <SheetTitle className="text-lg">{t('cra.review.errorTitle')}</SheetTitle>
            <SheetDescription className="mt-1 text-sm">{t('cra.review.errorDescription')}</SheetDescription>
          </Box>
        ) : (
          <DrawerBody review={data} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function DrawerBody({ review, onClose }: { review: TimesheetReview; onClose: () => void }) {
  const { t } = useTranslation('missions')
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  // #2415.7 — la quantité CONTESTÉE et la DEADLINE de correction, requises
  // comme le motif : le serveur les exige tous les trois.
  const [contestedDays, setContestedDays] = useState('')
  const [correctionDeadline, setCorrectionDeadline] = useState('')
  const validate = useValidateByClient()
  const reviewInternally = useReviewInternally()
  const reject = useRejectTimesheet()

  const lock = timesheetDecisionLock(review)
  const decidable = lock.canValidate || lock.canReject || lock.canReviewInternally

  return (
    <>
      {/* ── Bloc 1 · En-tête ────────────────────────────────────────────── */}
      <SheetHeader className="border-b border-border px-5 py-4">
        <Box display="flex" className="items-start justify-between gap-3">
          <Box className="min-w-0">
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('cra.review.eyebrow')}
            </Text>
            <SheetTitle className="truncate text-2xl">{review.missionLabel ?? t('unknownMission')}</SheetTitle>
          </Box>
          <Badge variant={review.blocksInvoicing ? 'warning' : 'secondary'}>{t(`cra.states.${review.status}`)}</Badge>
        </Box>
        <SheetDescription className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <Text element="span" size="sm" weight="medium" color="text-foreground">
            {review.consultantName ?? t('cra.noConsultant')}
          </Text>
          <Text element="span" size="sm" color="text-muted-foreground">
            {review.accountName ?? t('unknownAccount')}
          </Text>
          <Text element="span" size="sm" color="text-muted-foreground">
            {review.periodMonth.slice(0, 7)}
          </Text>
        </SheetDescription>
      </SheetHeader>

      {/* Un seul conteneur défilant — jamais deux imbriqués (GA-29). */}
      <Box className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <AutomaticCheck checks={review.checks} />
        <DaysDetail review={review} />
        <Attachments review={review} />
        <Recommendation review={review} />
      </Box>

      {/* ── Bloc 6 · Valider / rejeter ──────────────────────────────────── */}
      {decidable ? (
        <Box className="border-t border-border px-5 py-3">
          {rejecting ? (
            <Box>
              <Text element="p" size="sm" weight="medium">
                {t('cra.rejectTitle')}
              </Text>
              <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5">
                {t('cra.rejectHint')}
              </Text>
              <Input
                className="mt-2"
                value={reason}
                maxLength={REASON_MAX}
                aria-label={t('cra.rejectLabel')}
                onChange={event => setReason(event.target.value.slice(0, REASON_MAX))}
                placeholder={t('cra.rejectPlaceholder')}
              />
              {/* #2415.7 — la quantité contestée et la deadline de
                  correction, requises comme le motif. */}
              <Input
                className="mt-2"
                type="number"
                min={0.5}
                max={review.days ?? 31}
                step={0.5}
                value={contestedDays}
                aria-label={t('cra.rejectContestedDaysLabel')}
                onChange={event => setContestedDays(event.target.value)}
                placeholder={t('cra.rejectContestedDaysPlaceholder')}
              />
              <Input
                className="mt-2"
                type="date"
                value={correctionDeadline}
                aria-label={t('cra.rejectCorrectionDeadlineLabel')}
                onChange={event => setCorrectionDeadline(event.target.value)}
              />
              <Box display="flex" className="mt-2 gap-2">
                {/* Désactivé tant que le motif, la quantité contestée ou la
                    deadline manquent : le serveur rendrait 400, et un bouton
                    qui part pour revenir en erreur fait recliquer. La règle
                    est tenue par le serveur ET par la base — ceci évite
                    seulement l'aller-retour. */}
                <Button
                  size="sm"
                  className="min-h-11"
                  disabled={
                    reason.trim().length === 0 ||
                    !(Number(contestedDays) > 0) ||
                    correctionDeadline.trim().length === 0 ||
                    reject.isPending
                  }
                  onClick={() =>
                    reject.mutate(
                      {
                        id: review.timesheetId as string,
                        reason: reason.trim(),
                        contestedDays: Number(contestedDays),
                        correctionDeadline,
                      },
                      {
                        onSuccess: () => {
                          setRejecting(false)
                          setReason('')
                          setContestedDays('')
                          setCorrectionDeadline('')
                          onClose()
                        },
                      },
                    )
                  }
                >
                  {t('cra.rejectConfirm')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => {
                    setRejecting(false)
                    setReason('')
                    setContestedDays('')
                    setCorrectionDeadline('')
                  }}
                >
                  {t('cra.rejectAbort')}
                </Button>
              </Box>
            </Box>
          ) : (
            <Box>
              {/* #2415.6 — la revue INTERNE, distincte de la validation
                  client : POSÉE, elle reste lisible même quand la ligne
                  propose encore valider/rejeter — sans quoi le geste
                  disparaîtrait dès qu'on a fini de le poser. */}
              {review.internalReviewedByName ? (
                <Text element="p" size="xs" color="text-muted-foreground" className="mb-2">
                  {t('cra.internalReviewedBy', { name: review.internalReviewedByName })}
                </Text>
              ) : null}
              <Box display="flex" className="gap-2">
                {lock.canValidate ? (
                  <Button
                    className="min-h-11 flex-1"
                    disabled={validate.isPending}
                    onClick={() => validate.mutate(review.timesheetId as string, { onSuccess: onClose })}
                  >
                    {t('cra.recordClientValidation')}
                  </Button>
                ) : null}
                {lock.canReviewInternally ? (
                  <Button
                    variant="outline"
                    className="min-h-11 flex-1"
                    disabled={reviewInternally.isPending}
                    onClick={() => reviewInternally.mutate(review.timesheetId as string, {})}
                  >
                    {t('cra.recordInternalReview')}
                  </Button>
                ) : null}
                {lock.canReject ? (
                  <Button variant="outline" className="min-h-11 flex-1" onClick={() => setRejecting(true)}>
                    {t('cra.reject')}
                  </Button>
                ) : null}
              </Box>
            </Box>
          )}
        </Box>
      ) : null}
    </>
  )
}

/* ── Bloc 2 · Vérification automatique ────────────────────────────────────── */

/**
 * Ce qui a été vérifié, ce qui ne l'a pas été, et POURQUOI.
 *
 * Trois teintes, et « non vérifié » n'emprunte jamais le vert de « passé » :
 * « conforme » est exactement ce qu'un valideur lit pour NE PAS ouvrir le
 * dossier.
 */
function AutomaticCheck({ checks }: { checks: TimesheetCheck[] }) {
  const { t } = useTranslation('missions')
  const flagged = checks.filter(check => check.outcome === 'flagged')
  const conclusive = checks.filter(check => check.outcome !== 'not_verified')
  const unverified = checks.length - conclusive.length

  const palette = flagged.length > 0 ? 'warning' : conclusive.length === 0 ? 'info' : 'success'

  return (
    <Box
      className="rounded-md border p-3"
      style={{ background: `var(--${palette}-soft-bg)`, borderColor: `var(--${palette}-soft-border)` }}
    >
      <Text element="p" size="sm" weight="medium" color={`var(--${palette}-soft-text)`}>
        {t('cra.review.check.title')}
      </Text>
      <Text element="p" size="sm" color={`var(--${palette}-soft-text)`}>
        {flagged.length > 0
          ? t('cra.review.check.found', { count: flagged.length })
          : conclusive.length === 0
            ? // ⚠️ La phrase qui manquait. Zéro anomalie sur zéro contrôle
              // n'est PAS « rien à signaler ».
              t('cra.review.check.nothingVerified')
            : t('cra.review.check.clean', { count: conclusive.length })}
      </Text>
      {unverified > 0 && conclusive.length > 0 ? (
        // Ce qui n'a pas pu être évalué est NOMMÉ, même quand le reste est
        // passé — sans cette ligne, « rien à signaler » aurait plus d'autorité
        // qu'il n'en a.
        <Text element="p" size="xs" color={`var(--${palette}-soft-text)`}>
          {t('cra.review.check.unverified', { count: unverified })}
        </Text>
      ) : null}

      <Box className="mt-2 space-y-1">
        {checks.map(check => (
          <Box key={check.id} display="flex" className="flex-wrap items-baseline gap-x-2">
            <Text element="span" size="xs" weight="medium" color={`var(--${palette}-soft-text)`}>
              {t(`cra.review.checks.${check.id}`)}
            </Text>
            <Text element="span" size="xs" color={`var(--${palette}-soft-text)`}>
              {checkMessage(check, t)}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

/** Le verdict d'un contrôle, en toutes lettres et dans la langue du lecteur. */
function checkMessage(check: TimesheetCheck, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (check.outcome === 'not_verified') return t(`cra.review.notVerified.${check.reason}`)
  if (check.outcome === 'passed') return t(`cra.review.passed.${check.id}`)
  switch (check.id) {
    case 'working_days': {
      // ⚠️ Jamais `?? 0` : `runTimesheetChecks` ne rend ce contrôle « flagged »
      // qu'avec un `gapDays` réel et non nul — un écart nul, lui, rend
      // « passed ». Un repli à zéro ferait semblant qu'un écart absent EST un
      // écart nul, exactement le zéro que GA-19 existe pour repérer. La
      // branche `null` est donc inatteignable ; elle reste honnête plutôt que
      // de deviner un chiffre.
      const gap = check.gapDays
      if (gap === null) return t('cra.review.notVerified.no_expected_days')
      return gap > 0
        ? t('cra.review.flagged.workingDaysOver', { count: Math.abs(gap) })
        : t('cra.review.flagged.workingDaysUnder', { count: Math.abs(gap) })
    }
    case 'zero_days':
      return t('cra.review.flagged.zeroDays')
    case 'day_fraction':
      return t('cra.review.flagged.dayFraction')
    case 'overlapping_mission':
      return t('cra.review.flagged.overlappingMission', { subject: check.subject ?? t('unknownMission') })
    case 'duplicate_validated':
      return t('cra.review.flagged.duplicateValidated', { subject: check.subject ?? t('cra.noConsultant') })
    case 'public_holidays':
      // Inatteignable : ce contrôle ne tourne jamais, faute de calendrier.
      // La branche existe pour que le compilateur tienne l'exhaustivité, et
      // elle réutilise le MÊME libellé plutôt que d'en inventer un mort.
      return t('cra.review.notVerified.no_holiday_calendar')
  }
}

/* ── Bloc 3 · Détail des jours ────────────────────────────────────────────── */

function DaysDetail({ review }: { review: TimesheetReview }) {
  const { t } = useTranslation('missions')
  return (
    <Box className="rounded-md border border-border bg-card p-3">
      <Text element="h3" size="sm" weight="semibold">
        {t('cra.review.days.title')}
      </Text>
      <Box className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Figure
          label={t('cra.review.days.declared')}
          // ⚠️ Jamais `?? 0`. « Aucun relevé » et « zéro jour déclaré » ne se
          // corrigent pas de la même façon.
          value={review.days === null ? t('cra.review.days.noDeclaration') : t('cra.days', { count: review.days })}
        />
        <Figure
          label={t('cra.review.days.expected')}
          value={
            review.expectedDays === null
              ? t('cra.review.days.noExpected')
              : t('cra.expected', { count: review.expectedDays })
          }
        />
        <Figure
          label={t('cra.review.days.gap')}
          value={review.gap === null ? t('cra.gapUnknown') : t('cra.review.days.gapValue', { count: review.gap })}
        />
      </Box>
      {review.gapExplanation ? (
        // L'explication ne MASQUE pas l'écart : elle l'accompagne. Cacher le
        // nombre donnerait un mois qui a l'air juste alors qu'il ne l'est pas.
        <Text element="p" size="xs" color="text-muted-foreground" className="mt-2">
          {t('cra.review.days.explained', { explanation: review.gapExplanation })}
        </Text>
      ) : null}
      {review.recordedAnomalies.length > 0 ? (
        <Box className="mt-2">
          {/* L'ARCHIVE, nommée comme telle : ce qui avait été vu le jour du
              dépôt. On archive, on ne supprime pas — et ce n'est PAS le verdict
              d'aujourd'hui, qui vit dans l'encart au-dessus. */}
          <Text element="p" size="xs" weight="medium" color="text-muted-foreground">
            {t('cra.review.days.recordedTitle')}
          </Text>
          {review.recordedAnomalies.map(anomaly => (
            <Text key={anomaly} element="p" size="xs" color="text-muted-foreground">
              {anomaly}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text element="p" size="xs" color="text-muted-foreground">
        {label}
      </Text>
      <Text element="p" size="sm" weight="medium">
        {value}
      </Text>
    </Box>
  )
}

/* ── Bloc 4 · Pièces jointes ──────────────────────────────────────────────── */

/**
 * LES PIÈCES — celles que le produit détient réellement.
 *
 * ⚠️ Aucun FICHIER n'est stocké sur un relevé d'activité dans Bellum, et le bloc
 * le DIT. Afficher « 0 pièce jointe » laisserait croire qu'on en attend et
 * qu'il n'y en a pas ; proposer un bouton de dépôt serait une donnée fictive
 * sous forme d'affordance — on la découvre en réunion, pas en CI.
 *
 * Ce que le produit détient, en revanche, ce sont les TRACES : la validation
 * obtenue du client, le rejet et son motif, les relances parties. Ce sont elles
 * qu'un valideur cherche quand il ouvre ce bloc.
 */
function Attachments({ review }: { review: TimesheetReview }) {
  const { t } = useTranslation('missions')
  const traces: string[] = []
  if (review.validatedByClientAt) {
    traces.push(t('cra.validatedByClient', { date: review.validatedByClientAt.slice(0, 10) }))
  }
  if (review.rejectedAt) {
    traces.push(
      review.status === 'rejected'
        ? t('cra.rejectedOn', { date: review.rejectedAt.slice(0, 10) })
        : t('cra.rejectedThenResubmitted', { date: review.rejectedAt.slice(0, 10) }),
    )
    if (review.rejectionReason) traces.push(review.rejectionReason)
    // #2415.7 — combien de jours posent problème, et par quand corriger.
    // `null` sur une ligne historique, d'avant cette trace : elle ne
    // s'invente pas.
    if (review.contestedDays !== null) traces.push(t('cra.rejectedContestedDays', { count: review.contestedDays }))
    if (review.correctionDeadline !== null) {
      traces.push(t('cra.rejectedCorrectionDeadline', { date: review.correctionDeadline }))
    }
  }
  if (review.remindersSent > 0) {
    traces.push(
      review.lastReminderAt
        ? t('cra.review.attachments.reminders', {
            count: review.remindersSent,
            date: review.lastReminderAt.slice(0, 10),
          })
        : t('cra.review.attachments.remindersUndated', { count: review.remindersSent }),
    )
  }

  return (
    <Box className="rounded-md border border-border bg-card p-3">
      <Text element="h3" size="sm" weight="semibold">
        {t('cra.review.attachments.title')}
      </Text>
      {/* La phrase qui ne ment pas : aucun fichier n'est stocké ici. */}
      <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
        {t('cra.review.attachments.noFiles')}
      </Text>
      {traces.length > 0 ? (
        <Box className="mt-2 space-y-1">
          {traces.map(trace => (
            <Text key={trace} element="p" size="xs" color="text-muted-foreground">
              {trace}
            </Text>
          ))}
        </Box>
      ) : (
        <Text element="p" size="xs" color="text-muted-foreground" className="mt-2">
          {t('cra.review.attachments.noTraces')}
        </Text>
      )}
    </Box>
  )
}

/* ── Bloc 5 · Action recommandée ──────────────────────────────────────────── */

function Recommendation({ review }: { review: TimesheetReview }) {
  const { t } = useTranslation('missions')
  // `not_measurable` porte la règle : quand rien n'a pu être vérifié, l'écran
  // dit qu'il n'a pas d'avis — jamais une phrase vague, qui aurait l'air d'un
  // conseil sans en être un.
  const neutral = review.recommendation === 'not_measurable'
  const palette = neutral ? 'info' : 'accent'

  return (
    <Box
      className="rounded-md border p-3"
      style={{ background: `var(--${palette}-soft-bg)`, borderColor: `var(--${palette}-soft-border)` }}
    >
      <Text element="p" size="sm" weight="medium" color={`var(--${palette}-soft-text)`}>
        {t('cra.review.recommended.title')}
      </Text>
      <Text element="p" size="sm" color={`var(--${palette}-soft-text)`}>
        {t(`cra.review.recommended.${review.recommendation}`)}
      </Text>
      {review.blocksInvoicing ? (
        // Le lien avec la FACTURATION, dit à l'écran : sans cette phrase, un
        // relevé bloquant se valide sans qu'on sache ce que ça débloque.
        <Text element="p" size="xs" color={`var(--${palette}-soft-text)`} className="mt-1">
          {t('cra.review.recommended.blocksInvoicing')}
        </Text>
      ) : null}
    </Box>
  )
}
