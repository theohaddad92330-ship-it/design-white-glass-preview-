import { Badge, Button, Card, HORIZONTAL_OVERSCROLL_CLASS, SelectField, Text, cn } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  TALENT_COMPARED_FIELDS,
  TALENT_DUPLICATE_ACTIONS,
  explainTalentDuplicate,
  type TalentComparedField,
  type TalentDuplicateAction,
  type TalentDuplicatePreview,
  type TalentDuplicateProposal,
  type TalentIdentityHistoryEntry,
} from '@bellum/contracts'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import {
  useDecideTalentIdentity,
  useTalentIdentity,
  useTalentIdentityPreview,
  useUndoTalentIdentity,
} from '../../talent-api'
import { talentNameText } from '../../lib/talentName'

/**
 * #2327 — LAU-FINAL-068 : l'onglet Identité d'une fiche talent.
 *
 * Trois règles portent tout l'écran :
 *
 *  - **on PROPOSE, on ne fusionne jamais** (`c37_fusion_doublons`) : aucun
 *    bouton « fusionner », et la comparaison le DIT ;
 *  - **un rapprochement s'explique** (#2327.26) — la phrase vient du contrat
 *    partagé, la même que Laura peut dire ; aucune confiance chiffrée ne
 *    s'affiche, un nombre se lirait comme une chance ;
 *  - **chaque décision vient d'un clic et s'annule** (#2327.20 / #2327.25).
 */
export function TalentIdentityPanel({ talentId }: { talentId: string }) {
  const { t, i18n } = useTranslation('consultants')
  const locale = i18n.language?.startsWith('en') ? 'en' : 'fr'
  const { data, isLoading, isError } = useTalentIdentity(talentId)
  const undo = useUndoTalentIdentity(talentId)
  const [openId, setOpenId] = useState<string | null>(null)

  if (isLoading) return null
  if (isError || !data) {
    return (
      <Card className="p-4">
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('identity.error')}
        </Text>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text size="sm" weight="medium">
          {t('identity.title')}
        </Text>
        <Badge variant={data.state === 'new' ? 'outline' : 'warning'}>
          {t('identity.state', { state: t(`identity.states.${data.state}`) })}
        </Badge>
      </div>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {t('identity.intro')}
      </Text>

      {data.items.length === 0 ? (
        <Text size="sm" className="mt-3 text-[var(--bellum-text-muted)]">
          {t('identity.empty')}
        </Text>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {data.items.map(item => (
            <li key={item.talentId} className="rounded-md border border-[var(--bellum-border)] p-3">
              <ProposalHeader item={item} explanation={explainTalentDuplicate(item, locale)} />
              {item.decision ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {item.decision.action === 'assign_to_recruiter'
                      ? t('identity.assignedTo', { name: item.decision.assigneeName ?? t('identity.someone') })
                      : t('identity.decidedBy', { name: item.decision.decidedByName ?? t('identity.someone') })}
                  </Text>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={undo.isPending}
                    onClick={() => item.decision && undo.mutate(item.decision.id)}
                  >
                    {t('identity.undo')}
                  </Button>
                </div>
              ) : null}
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="mt-2"
                aria-expanded={openId === item.talentId}
                onClick={() => setOpenId(current => (current === item.talentId ? null : item.talentId))}
              >
                {openId === item.talentId ? t('identity.hideCompare') : t('identity.compare')}
              </Button>
              {openId === item.talentId ? <IdentityComparison talentId={talentId} otherId={item.talentId} /> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ProposalHeader({ item, explanation }: { item: TalentDuplicateProposal; explanation: string }) {
  const { t } = useTranslation('consultants')
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/consultants/$id"
          params={{ id: item.talentId }}
          className="text-sm font-medium text-[var(--bellum-text-accent)]"
        >
          {talentNameText(item.fullName, t('name.unnamed'))}
        </Link>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('identity.reason', { reason: t(`intake.duplicate.reasons.${item.reason}`) })}
        </Text>
      </div>
      <Text size="sm">{explanation}</Text>
    </div>
  )
}

/** #2327.19 — fiche A, fiche B, champs, documents, historique, conséquences, actions. */
function IdentityComparison({ talentId, otherId }: { talentId: string; otherId: string }) {
  const { t } = useTranslation('consultants')
  const { data, isLoading } = useTalentIdentityPreview(talentId, otherId)
  const decide = useDecideTalentIdentity(talentId)
  const members = useWorkspaceMembers()
  const [assignee, setAssignee] = useState('')

  if (isLoading || !data) {
    return (
      <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
        {t('identity.loadingCompare')}
      </Text>
    )
  }

  const run = (action: TalentDuplicateAction) =>
    decide.mutate({
      otherTalentId: otherId,
      action,
      assigneeId: action === 'assign_to_recruiter' ? assignee : null,
    })

  return (
    <div className="mt-3 flex flex-col gap-3">
      {/* #2588 — un tableau large ne renvoie pas le navigateur en arrière. */}
      <div className={cn('overflow-x-auto', HORIZONTAL_OVERSCROLL_CLASS)}>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[var(--bellum-text-muted)]">
              <th className="py-1 pr-3 font-normal" />
              <th className="py-1 pr-3 font-medium">{t('identity.sideA')}</th>
              <th className="py-1 pr-3 font-medium">{t('identity.sideB')}</th>
              <th className="py-1 font-normal" />
            </tr>
          </thead>
          <tbody>
            {TALENT_COMPARED_FIELDS.map(field => {
              const state = fieldState(data, field)
              return (
                <tr key={field} className="border-t border-[var(--bellum-border)]">
                  <th scope="row" className="py-1 pr-3 font-normal text-[var(--bellum-text-muted)]">
                    {t(`identity.fields.${field}`)}
                  </th>
                  <td className="py-1 pr-3">{data.a[field] ?? t('identity.notProvided')}</td>
                  <td className="py-1 pr-3">{data.b[field] ?? t('identity.notProvided')}</td>
                  <td className="py-1 text-[var(--bellum-text-secondary)]">
                    {state ? t(`identity.fieldStates.${state}`) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SideDetails
          title={t('identity.sideA')}
          documents={data.documents.a.map(document => document.filename)}
          history={data.history.a}
        />
        <SideDetails
          title={t('identity.sideB')}
          documents={data.documents.b.map(document => document.filename)}
          history={data.history.b}
        />
      </div>
      <Link to="/consultants/$id" params={{ id: otherId }} className="text-xs text-[var(--bellum-text-accent)]">
        {t('identity.openOther')}
      </Link>

      <div>
        <Text size="xs" weight="medium">
          {t('identity.consequencesTitle')}
        </Text>
        <ul className="mt-1 list-disc pl-5">
          {TALENT_DUPLICATE_ACTIONS.map(action => (
            <li key={action}>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t(`identity.consequences.${action}`, { count: data.consequences.documentsCopiedOnUpdate })}
              </Text>
            </li>
          ))}
        </ul>
        {/* La fusion n'est pas un bouton désactivé : elle n'existe pas, et
            l'écran dit pourquoi (`c37_fusion_doublons`). */}
        <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('identity.mergeUnavailable')}
        </Text>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['keep_separate', 'update_existing', 'ignore'] as const).map(action => (
          <Button
            key={action}
            type="button"
            size="xs"
            variant={action === 'keep_separate' ? 'outline' : 'ghost'}
            disabled={decide.isPending || (action === 'update_existing' && data.documents.b.length === 0)}
            onClick={() => run(action)}
          >
            {t(`identity.actions.${action}`)}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SelectField
          size="sm"
          ariaLabel={t('identity.assignee')}
          value={assignee}
          onChange={setAssignee}
          emptyOption={{ label: t('identity.assigneePlaceholder') }}
          options={(members.data ?? []).map(member => ({
            value: member.userId,
            label: member.fullName ?? member.email ?? t('identity.someone'),
          }))}
        />
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={decide.isPending || assignee === ''}
          onClick={() => run('assign_to_recruiter')}
        >
          {t('identity.actions.assign_to_recruiter')}
        </Button>
      </div>
    </div>
  )
}

function SideDetails({
  title,
  documents,
  history,
}: {
  title: string
  documents: string[]
  history: TalentIdentityHistoryEntry[]
}) {
  const { t, i18n } = useTranslation('consultants')
  return (
    <div className="flex flex-col gap-1">
      <Text size="xs" weight="medium">
        {title} · {t('identity.documents')}
      </Text>
      {documents.length === 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('identity.noDocuments')}
        </Text>
      ) : (
        <ul>
          {documents.map((filename, index) => (
            <li key={`${filename}-${index}`}>
              <Text size="xs">{filename}</Text>
            </li>
          ))}
        </ul>
      )}
      <Text size="xs" weight="medium" className="mt-1">
        {t('identity.history')}
      </Text>
      {history.length === 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('identity.noHistory')}
        </Text>
      ) : (
        <ul>
          {history.slice(0, 5).map((entry, index) => (
            <li key={`${entry.field}-${entry.at}-${index}`}>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('identity.historyLine', {
                  field: entry.field,
                  actor: entry.actorName ?? t('identity.unknownActor'),
                  date: new Date(entry.at).toLocaleDateString(i18n.language),
                })}
                {entry.rule ? ` · ${t('identity.historyRule', { rule: entry.rule })}` : ''}
              </Text>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function fieldState(
  preview: TalentDuplicatePreview,
  field: TalentComparedField,
): 'identical' | 'different' | 'oneSided' | null {
  if (preview.fields.identical.includes(field)) return 'identical'
  if (preview.fields.different.includes(field)) return 'different'
  if (preview.fields.oneSided.includes(field)) return 'oneSided'
  return null
}
