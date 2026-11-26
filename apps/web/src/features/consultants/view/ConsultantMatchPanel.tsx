import { Badge, Button, Card, SelectField, Text } from '@bellum/ui'
import { AlreadyProposedNote } from '@/features/team-guardrails/components/AlreadyProposedNote'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileText,
  Target,
  ThumbsDown,
  ThumbsUp,
  UserPlus,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { toast } from 'sonner'
import type { ConsultantCvRewrite, ConsultantMatch, ConsultantPushOutcome } from '@bellum/contracts'
import { useCreateSubmission } from '@/features/submissions/api'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { consultantsApi } from '../api'
import { useConsultantMatch, useOpportunitiesForMatch } from '../hooks'
import { talentNameText } from '../lib/talentName'
import { TransparencyBanner } from '@/features/matching/view/TransparencyBanner'
import { BulkCvRewriteButton } from './BulkCvRewriteButton'
import { ConsultantBriefDialog } from './ConsultantBriefDialog'
import { ConsultantCvDialog } from './ConsultantCvDialog'

/** Les verdicts qui autorisent une comparaison — un verdict NON DÉFENDABLE ou
 *  NON ÉVALUABLE n'a de toute façon plus de place dans `match.top`. */
const COMPARE_MIN = 2
const COMPARE_MAX = 4

/**
 * « Matcher un besoin » (annexe méthodo p22 « Matching » + « Push »).
 *
 * Le commercial choisit un besoin du portefeuille ; le vivier est classé contre
 * lui et les 1-2 profils réellement poussables ressortent — avec leurs RAISONS
 * et leurs RISQUES. Les risques sont affichés au même niveau que les raisons :
 * la page interdit un push muet sur ce qui peut coincer, parce que le client le
 * découvrira de toute façon en soutenance.
 */
export function ConsultantMatchPanel({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const { t } = useTranslation('consultants')
  const { data: opportunities } = useOpportunitiesForMatch()
  const { data: match, isLoading } = useConsultantMatch(selectedId)
  // #2330.8 — comparer 2 à 4 profils du TOP sur les mêmes axes. Remis à zéro à
  // chaque changement de besoin : comparer des profils d'un AUTRE besoin n'a
  // pas de sens.
  const [compareIds, setCompareIds] = useState<string[]>([])
  const toggleCompare = (id: string) =>
    setCompareIds(current =>
      current.includes(id)
        ? current.filter(entry => entry !== id)
        : current.length >= COMPARE_MAX
          ? current
          : [...current, id],
    )

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Target className="size-4 text-[var(--bellum-text-accent)]" />
        <Text element="h3" size="base" weight="semibold">
          {t('match.title')}
        </Text>
      </div>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('match.subtitle')}
      </Text>

      {/* Le bandeau de transparence de l'AI Act (Annexe III), permanent et non
          masquable. Il n'était monté que sur UN des trois écrans qui classent
          des personnes — celui des besoins ouverts. Classer un candidat sans le
          dire est exactement le scénario n°2 du PDF 9. */}
      <TransparencyBanner />

      <SelectField
        value={selectedId ?? ''}
        onChange={next => {
          setCompareIds([])
          onSelect(next || null)
        }}
        emptyOption={{ label: t('match.pickNeed') }}
        options={(opportunities ?? []).map(o => ({
          value: o.id,
          label: o.company_name ? `${o.company_name} — ${o.label}` : o.label,
        }))}
        size="sm"
        className="mt-3 w-full"
      />

      {!selectedId ? null : isLoading ? (
        <Text size="sm" className="mt-4 text-[var(--bellum-text-muted)]">
          {t('match.loading')}
        </Text>
      ) : !match || match.ranked.length === 0 ? (
        <Text size="sm" className="mt-4 text-[var(--bellum-text-muted)]">
          {t('match.emptyVivier')}
        </Text>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {/* #2330.7/.9 — le TOP défendable, borné à cinq, jamais rempli
              artificiellement : `match.top` porte déjà cette règle côté
              calcul, ce bloc se contente de ne rien ajouter par-dessus. */}
          {match.top.length === 0 ? (
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('match.emptyDefendable')}
            </Text>
          ) : (
            <>
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                {t('match.topHeading', { count: match.top.length })}
              </Text>
              {match.top.length >= COMPARE_MIN ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('match.compareHint')}
                </Text>
              ) : null}
              {match.top.map(m => (
                <MatchCard
                  key={m.consultant_id}
                  match={m}
                  opportunityId={selectedId}
                  // Un profil qu'on peut AGIR dessus (shortlist/CV/brief) est
                  // un profil réellement poussable — « pas de CV catalogue »
                  // reste tenu même quand jusqu'à cinq profils sont VISIBLES.
                  isPushable={match.push.some(p => p.consultant_id === m.consultant_id)}
                  compareEnabled={match.top.length >= COMPARE_MIN}
                  compareChecked={compareIds.includes(m.consultant_id)}
                  onToggleCompare={() => toggleCompare(m.consultant_id)}
                />
              ))}
              {compareIds.length >= COMPARE_MIN ? (
                <MatchCompareTable matches={match.top.filter(m => compareIds.includes(m.consultant_id))} />
              ) : null}
              {/* #1952.5 (épopée #2844) — la même sélection (`compareIds`)
                  sert aussi à lancer la réécriture de CV en lot : aucune
                  seconde case à cocher pour le même geste (GA-26). */}
              {compareIds.length >= 1 ? (
                <BulkCvRewriteButton opportunityId={selectedId} consultantIds={compareIds} />
              ) : null}
            </>
          )}
        </div>
      )}
    </Card>
  )
}

/** #2330.8 — comparer 2 à 4 profils du top sur les MÊMES axes, côte à côte. */
function MatchCompareTable({ matches }: { matches: ConsultantMatch[] }) {
  const { t } = useTranslation('consultants')
  // Les critères sont les mêmes six pour tout le classement (une seule cible) —
  // le premier profil sélectionné donne donc l'ordre des lignes.
  const criteria = matches[0]?.breakdown.map(item => ({ key: item.criterion, label: item.label })) ?? []
  return (
    <div className="mt-1 overflow-x-auto overscroll-x-contain rounded-lg border border-[var(--bellum-border)]">
      <table className="w-full text-left">
        <caption className="sr-only">{t('match.compareTitle')}</caption>
        <thead>
          <tr className="border-b border-[var(--bellum-border)]">
            <th className="p-2">
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                {t('match.compareTitle')}
              </Text>
            </th>
            {matches.map(m => (
              <th key={m.consultant_id} className="p-2">
                <Text size="xs" weight="semibold">
                  {talentNameText(m.full_name, t('name.unnamed'))}
                </Text>
                <Badge variant="outline">{t(`match.verdict.${m.verdict}`)}</Badge>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {criteria.map(criterion => (
            <tr key={criterion.key} className="border-b border-[var(--bellum-border)] last:border-0">
              <th scope="row" className="p-2 text-left">
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {criterion.label}
                </Text>
              </th>
              {matches.map(m => {
                const cell = m.breakdown.find(item => item.criterion === criterion.key)
                return (
                  <td key={m.consultant_id} className="p-2">
                    {cell ? (
                      <Text size="xs">
                        {cell.points}/{cell.max}
                        <span className="block text-[var(--bellum-text-muted)]">{cell.proof}</span>
                      </Text>
                    ) : (
                      <UnknownValue reason={t('match.scoreUnmeasuredReason')} />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MatchCard({
  match,
  opportunityId,
  isPushable,
  compareEnabled,
  compareChecked,
  onToggleCompare,
}: {
  match: ConsultantMatch
  opportunityId: string | null
  isPushable: boolean
  compareEnabled: boolean
  compareChecked: boolean
  onToggleCompare: () => void
}) {
  const { t } = useTranslation('consultants')
  const [cvOpen, setCvOpen] = useState(false)
  const [briefOpen, setBriefOpen] = useState(false)
  // Le CV réécrit vit dans l'état du dialogue : il est généré à la demande et
  // remplacé à chaque régénération — rien à mettre en cache global.
  const [rewrite, setRewrite] = useState<ConsultantCvRewrite | null>(null)
  const feedback = useMutation({
    mutationFn: (outcome: ConsultantPushOutcome) =>
      consultantsApi.recordFeedback(match.consultant_id, { opportunity_id: opportunityId ?? undefined, outcome }),
    onSuccess: () => toast.success(t('match.feedbackSaved')),
    onError: () => toast.error(t('match.feedbackError')),
  })
  // Retenir un profil sur un besoin — le geste central d'un ATS, et le seul
  // qui manquait : `POST /submissions` existait avec son service, son écran de
  // suivi et ses tests, sans aucun appelant. On ne pouvait donc PAS positionner
  // quelqu'un depuis l'interface.
  const shortlist = useCreateSubmission()
  return (
    <div className="rounded-lg border border-[var(--bellum-border)] p-3">
      <div className="flex items-center justify-between gap-2">
        {/* Le nom du profil rapproché — jamais le nom du FICHIER déposé, que
            `cv-intake` écrit dans `full_name` faute d'autre chose
            (`talentName.ts`). Un profil qu'on POUSSE à un client sous un nom de
            fichier est la pire occurrence de ce défaut. */}
        <Text size="sm" weight="semibold">
          {talentNameText(match.full_name, t('name.unnamed'))}
        </Text>
        <div className="flex items-center gap-1.5">
          {/* Sous MIN_AXES_FOR_SCORE critères évaluables, `match.score` vaut
              `null` — jamais 0 (GA-18/GA-19). `selectPush` exclut déjà ce cas du
              push ; ce repli défensif tient la même promesse ICI, au même
              niveau que `ScorePill` sur la carte du moteur principal
              (`features/matching/view/MatchCard.tsx`) : on ÉCRIT « non mesuré »,
              on n'écrit jamais zéro. */}
          {match.score === null ? (
            <UnknownValue reason={t('match.scoreUnmeasuredReason')} />
          ) : (
            <Badge variant="primary">{t('match.score', { score: match.score })}</Badge>
          )}
        </div>
      </div>

      {/* #2330.1/.5 — le verdict NOMMÉ, jamais un pourcentage seul : c'est LUI
          qui dit d'emblée ce qu'il faut faire du profil, le score reste un
          détail à côté. */}
      <Badge
        variant={
          match.verdict === 'fortement_defendable'
            ? 'primary'
            : match.verdict === 'non_defendable'
              ? 'destructive'
              : 'outline'
        }
        className="mt-1.5"
      >
        {t(`match.verdict.${match.verdict}`)}
      </Badge>

      {/* Ce qui n'a pas pu être noté est NOMMÉ — un score n'est jamais nu,
          y compris quand il est absent. */}
      {match.score === null && match.unevaluated.length > 0 ? (
        <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('match.unevaluatedList', { list: match.unevaluated.join(', ') })}
        </Text>
      ) : null}

      {/* Ce que CE client a déjà dit de cette personne (§7.2).
          Un refus est rouge, un SILENCE est gris : peindre un silence en rouge
          ferait écarter des profils que le client n'a jamais regardés. Le
          drapeau informe, il ne retire pas — écarter d'office serait décider à
          la place du commercial. */}
      {match.clientHistory ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant={match.clientHistory.flag === 'rejected' ? 'destructive' : 'outline'}>
            {t(`match.clientHistory.${match.clientHistory.flag}`)}
          </Badge>
          {match.clientHistory.reason ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t(`detail.submissionReason.${match.clientHistory.reason}`)}
              {formatDate(match.clientHistory.at, { dateStyle: 'medium' })
                ? ` · ${formatDate(match.clientHistory.at, { dateStyle: 'medium' })}`
                : ''}
            </Text>
          ) : null}
          {match.clientHistory.recoverable ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('match.clientHistory.recoverable')}
            </Text>
          ) : null}
        </div>
      ) : null}

      {match.reasons.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {match.reasons.map((reason, index) => (
            <li key={index} className="flex items-start gap-1.5">
              <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-[var(--success-soft-text)]" />
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {reason}
              </Text>
            </li>
          ))}
        </ul>
      ) : null}

      {match.risks.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {match.risks.map((risk, index) => (
            <li key={index} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-[var(--warning-soft-text)]" />
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {risk}
              </Text>
            </li>
          ))}
        </ul>
      ) : null}

      {/* #2330.6 — ce qui MANQUE, nommé à part des risques : un gap porte sur
          une compétence attendue, un risque sur une condition de mission. */}
      {match.gaps.length > 0 ? (
        <div className="mt-2">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('match.gapsTitle')}
          </Text>
          <ul className="mt-1 flex flex-col gap-0.5">
            {match.gaps.map((gap, index) => (
              <li key={index}>
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {gap}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* #2330.6 — la prochaine étape, DÉDUITE du verdict et du profil. */}
      {match.recommendedStep ? (
        <Text size="xs" weight="medium" className="mt-2 text-[var(--bellum-text-secondary)]">
          {t('match.recommendedStep', { action: match.recommendedStep })}
        </Text>
      ) : null}

      {/* #2330.8 — comparer ce profil à d'autres du top, sur les mêmes axes.
          Icône nommée par son `<label>`, cible ≥44 px via `p-2` (GA-32/GA-35). */}
      {compareEnabled ? (
        <label className="mt-2 flex items-center gap-1.5 p-2">
          <input type="checkbox" checked={compareChecked} onChange={onToggleCompare} aria-label={t('match.compare')} />
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('match.compare')}
          </Text>
        </label>
      ) : null}

      {/* Réécriture du CV selon la mission (p22) — le profil ne se pousse pas
          avec un CV générique. Nécessite un besoin sélectionné : sans mission,
          il n'y a rien selon quoi adapter. Réservé aux profils RÉELLEMENT
          poussables — jusqu'à cinq profils sont VISIBLES (#2330.7), « pas de
          CV catalogue » reste tenu en réservant les ACTIONS aux 1-2 poussés. */}
      {opportunityId && isPushable ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--bellum-border)] pt-2">
          {/* #4158.23 — « déjà proposé » par un collègue : qui, quel client, quelle date. */}
          <AlreadyProposedNote projectId={opportunityId} consultantIds={[match.consultant_id]} />
          <Button
            size="xs"
            variant="ghost"
            className="gap-1"
            disabled={shortlist.isPending}
            onClick={() =>
              shortlist.mutate({
                projectId: opportunityId,
                consultantId: match.consultant_id,
                // `shortlisted` et non `submitted` : retenir un profil n'est
                // pas l'avoir envoyé au client. Confondre les deux ferait
                // compter des envois qui n'ont pas eu lieu.
                stage: 'shortlisted',
                proposedRateCents: null,
              })
            }
          >
            <UserPlus className="size-3" />
            {t('match.shortlist')}
          </Button>
          <Button size="xs" variant="ghost" className="gap-1" onClick={() => setCvOpen(true)}>
            <FileText className="size-3" />
            {t('cv.open')}
          </Button>
          {/* Le brief de soutenance : déterministe, testé, exposé par une route
              — et son client web n'avait aucun appelant depuis le PDF 4. */}
          <Button size="xs" variant="ghost" className="gap-1" onClick={() => setBriefOpen(true)}>
            <ClipboardList className="size-3" />
            {t('brief.open')}
          </Button>
          <ConsultantBriefDialog
            open={briefOpen}
            consultantId={match.consultant_id}
            opportunityId={opportunityId}
            onClose={() => setBriefOpen(false)}
          />
          <ConsultantCvDialog
            open={cvOpen}
            consultantId={match.consultant_id}
            consultantName={talentNameText(match.full_name, t('name.unnamed'))}
            opportunityId={opportunityId}
            rewrite={rewrite}
            onClose={() => setCvOpen(false)}
            onGenerated={setRewrite}
          />
        </div>
      ) : null}

      {/* Boucle de feedback (annexe méthodo p22) : l'issue du push capitalise le
          REX. Réservée aux profils réellement POUSSÉS — même raison que le
          bloc précédent, on ne capitalise pas l'issue d'un push qui n'a pas
          eu lieu. */}
      {isPushable ? (
        <div className="mt-3 flex items-center gap-2 border-t border-[var(--bellum-border)] pt-2">
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('match.feedbackPrompt')}
          </Text>
          <Button
            size="xs"
            variant="ghost"
            className="gap-1"
            disabled={feedback.isPending}
            onClick={() => feedback.mutate('retenu')}
          >
            <ThumbsUp className="size-3" />
            {t('match.retained')}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="gap-1"
            disabled={feedback.isPending}
            onClick={() => feedback.mutate('refuse')}
          >
            <ThumbsDown className="size-3" />
            {t('match.refused')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
