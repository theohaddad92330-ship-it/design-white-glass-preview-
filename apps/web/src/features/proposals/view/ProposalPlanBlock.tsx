import type { ProposalSection, ProposalSectionKey, ProposalSectionState } from '@bellum/contracts'
import { Badge, Box, Button, Card, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { proposalsApi, proposalsKeys } from '../api'
import { SignatureHandoff } from './SignatureHandoff'

/**
 * Théo C HT-6 — « LA PROPOSITION COMMERCIALE », DANS LE DÉTAIL D'UNE PRÉSENTATION.
 *
 * Le Studio de propositions (`/propositions`) est FONDU dans Affaires › Présentations (Louis, 22/10/2026) :
 * UNE proposition par AFFAIRE, portée par la fiche affaire ; chaque présentation de l'affaire la montre ici
 * (même contenu, pas de copie). Les dix sections sont des lignes avec leur état — Prête / Incomplète / Vide —
 * et le geste qui répare. Ce que le studio garantissait tient tel quel :
 *
 *  - le plan RASSEMBLE et VÉRIFIE, il n'invente ni prix, ni planning, ni disponibilité ;
 *  - « 6 sections prêtes sur 10 » est un DÉCOMPTE de sections non vides, jamais « la proposition est bonne » ;
 *  - une section vide est MONTRÉE avec sa raison — un trou masqué se découvre en soutenance ;
 *  - aucun geste d'envoi ni d'enregistrement : il n'existe aucune route d'écriture, c'est l'absence de code.
 */
export function ProposalPlanBlock({ projectId, accountId }: { projectId: string; accountId: string | null }) {
  const { t } = useTranslation('proposals')
  const studio = useQuery({
    queryKey: proposalsKeys.outline(projectId),
    queryFn: () => proposalsApi.get(projectId),
  })
  const view = studio.data

  return (
    <Card className="space-y-3 p-4">
      <Box>
        <Text element="h2" size="base" weight="semibold">
          {t('plan.title')}
        </Text>
        {view ? (
          <Text size="sm" weight="medium" className="mt-0.5 block">
            {t('summary.ready', { count: view.outline.readyCount, total: view.outline.sections.length })}
          </Text>
        ) : null}
        <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-secondary)]">
          {t('plan.intro')}
        </Text>
      </Box>

      {studio.isLoading ? (
        <div className="h-24 animate-pulse rounded-md bg-[var(--bellum-surface-2)]" />
      ) : studio.isError || !view ? (
        <Box>
          {/* Un échec de lecture n'est pas un plan vide : le dire, et offrir le geste qui le lève. */}
          <Text size="sm" className="text-[var(--danger-soft-text)]">
            {t('state.failed')}
          </Text>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 pointer-coarse:min-h-11"
            onClick={() => void studio.refetch()}
          >
            {t('state.retry')}
          </Button>
        </Box>
      ) : (
        <>
          <ul className="divide-y divide-[var(--bellum-border)]">
            {view.outline.sections.map(section => (
              <SectionRow key={section.key} section={section} projectId={projectId} accountId={accountId} />
            ))}
          </ul>
          <SignatureHandoff projectId={projectId} />
          <Box className="flex flex-wrap items-center gap-2">
            <AskLaura
              label={t('plan.askLaura')}
              question={t('plan.askLauraQuestion', { project: view.project.label })}
              accountId={accountId ?? undefined}
            />
          </Box>
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('nothingSent')}
          </Text>
        </>
      )}
    </Card>
  )
}

const STATE_CLASS: Record<ProposalSectionState, string> = {
  ready: 'text-[var(--success-soft-text)]',
  partial: 'text-[var(--warning-soft-text)]',
  missing: 'text-[var(--bellum-text-muted)]',
}

/**
 * Où se corrige un manque, section par section. Le plan ne redemande jamais une valeur qui vit ailleurs :
 * le TJM se saisit sur le positionnement, la disponibilité sur la fiche vivier, la qualification sur
 * l'affaire, les preuves citables sur le compte.
 */
const FIX_TARGET: Record<ProposalSectionKey, 'account' | 'project' | 'talent'> = {
  context: 'account',
  scope: 'project',
  approach: 'project',
  team: 'talent',
  schedule: 'project',
  pricing: 'project',
  references: 'account',
  risks: 'project',
  objections: 'talent',
  validation: 'project',
}

function SectionRow({
  section,
  projectId,
  accountId,
}: {
  section: ProposalSection
  projectId: string
  accountId: string | null
}) {
  const { t } = useTranslation('proposals')
  const target = FIX_TARGET[section.key]
  return (
    <li className="space-y-1 py-3">
      <Box className="flex items-start justify-between gap-2">
        <Text element="h3" size="sm" weight="semibold">
          {t(`section.${section.key}`)}
        </Text>
        <Badge variant="outline" className={STATE_CLASS[section.state]}>
          {t(`status.${section.state}`)}
        </Badge>
      </Box>
      {section.content.map(line => (
        <Text key={line} size="sm" className="block">
          {line}
        </Text>
      ))}
      {section.gaps.length > 0 ? (
        <Box>
          <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
            {t('gaps.title', { count: section.gaps.length })}
          </Text>
          <ul className="list-inside list-disc">
            {section.gaps.map(gap => (
              <li key={gap}>
                <Text size="xs" element="span" className="text-[var(--warning-soft-text)]">
                  {gap}
                </Text>
              </li>
            ))}
          </ul>
          <Button asChild variant="ghost" size="xs" className="mt-1 pointer-coarse:min-h-11">
            {target === 'account' && accountId ? (
              <Link to="/accounts/$id" params={{ id: accountId }}>
                {t('fix.account')}
              </Link>
            ) : target === 'talent' ? (
              <Link to="/consultants">{t('fix.talent')}</Link>
            ) : (
              <Link to="/projects/$id" params={{ id: projectId }}>
                {t('fix.project')}
              </Link>
            )}
          </Button>
        </Box>
      ) : null}
      {section.sources.length > 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="block">
          {`${t('sources.title')} · ${section.sources.join(' · ')}`}
        </Text>
      ) : null}
    </li>
  )
}
