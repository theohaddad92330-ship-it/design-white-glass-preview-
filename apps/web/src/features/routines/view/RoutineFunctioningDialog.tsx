import { ROUTINE_ACTION_LEVEL, type RoutineView } from '@bellum/contracts'
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { ApprovalSettingsCard } from '@/features/action-os/view/ApprovalSettingsCard'
import { LauraIntroScope } from '@/features/laura/bubble/laura-intro-scope'
import { useNoReplyFollowUpDryRun, useRoutineRuns, useUpdateRoutine } from '../api'
import { ROUTINE_FAMILY_OF, routineToolsOf } from '../routineFamilies'
import { THEO_BTN, THEO_EYEBROW, THEO_PILL } from '@/features/automations/view/theo-classes'
import {
  RoutineDryRunResult,
  RoutineMaxItemsPerRunControl,
  RoutineGovernanceControls,
  RoutineScheduleControls,
  RoutineStatusControl,
} from './RoutineControls'
import { RoutineCardAttributes } from './RoutineCardAttributes'

type FunctioningTab = 'how' | 'settings'

/**
 * Théo C automations-bibliotheque.R2 — « VOIR LE FONCTIONNEMENT » : la fiche d'une routine en fenêtre, plus en page
 * pleine. Deux onglets (mise en page tranchée par Louis 22/10) :
 *
 *  - « Comment ça marche » : le blocage d'activation D'ABORD (c'est ce qui empêche d'agir — A3), puis les rubriques de
 *    Théo (Quand · Ce qui est lu · Résultat · Arrêt), puis ce que la maquette n'avait pas et qu'on garde : la preuve que
 *    ça marche, le repli, l'exemple, la version (automations-editeur.A3) ;
 *  - « Réglages » : statut, heure, jour, canal, relances par passage (A1), dernier passage et historique avec preuve,
 *    simulation (R4), et « Ce que tu valides » (A2), replié, qui renvoie l'autonomie à Réglages › Laura (A4).
 *
 * Aucun réglage n'est recopié ici : ce sont les composants de `RoutineControls` (UN formulaire générique, c75).
 */
export function RoutineFunctioningDialog({
  view,
  open,
  onOpenChange,
  initialTab = 'how',
}: {
  view: RoutineView
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: FunctioningTab
}) {
  const { t, i18n } = useTranslation('routines')
  const locale = i18n.language.startsWith('en') ? 'en' : 'fr'
  const { definition } = view

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('fn.closeWindow')} className="max-w-2xl">
        <LauraIntroScope>
          <DialogHeader>
            <span className={THEO_EYEBROW}>{t(`family.${ROUTINE_FAMILY_OF[definition.key]}`)}</span>
            <DialogTitle>{definition.name[locale]}</DialogTitle>
            <DialogDescription>{definition.description[locale]}</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue={initialTab} className="gap-4">
            <TabsList variant="underline" aria-label={t('fn.tabsLabel')}>
              <TabsTrigger value="how">{t('fn.tabs.how')}</TabsTrigger>
              <TabsTrigger value="settings">{t('fn.tabs.settings')}</TabsTrigger>
            </TabsList>
            <TabsContent value="how">
              <HowItWorks view={view} locale={locale} />
            </TabsContent>
            <TabsContent value="settings">
              <Settings view={view} language={i18n.language} locale={locale} />
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('fn.close')}
            </Button>
            {/* Théo C automations-bibliotheque.R3 — « Adapter » : Laura aide à régler, rien ne s'active seul. */}
            <AskLaura
              variant="prominent"
              question={t('fn.adaptQuestion', { name: definition.name[locale] })}
              label={t('fn.adaptWithLaura')}
            />
          </DialogFooter>
        </LauraIntroScope>
      </DialogContent>
    </Dialog>
  )
}

/** `.a14-template-step` — une rubrique de la fiche : un creux bordé, son titre, son texte. */
function Rubric({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box data-rubric className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-4">
      <Text element="h4" size="sm" weight="semibold" className="mb-2">
        {title}
      </Text>
      <Text size="sm" className="whitespace-pre-wrap leading-relaxed text-[var(--bellum-text-secondary)]">
        {children}
      </Text>
    </Box>
  )
}

function HowItWorks({ view, locale }: { view: RoutineView; locale: 'fr' | 'en' }) {
  const { t } = useTranslation('routines')
  const update = useUpdateRoutine()
  const { definition, blockers } = view
  return (
    <Box className="flex flex-col gap-4">
      {/* Théo C automations-bibliotheque.A3 — le blocage D'ABORD, avec le lien qui répare. Une case cochée qui ne fait
          rien tous les matins est pire qu'une case décochée : elle laisse croire que le produit surveille. */}
      {blockers.length > 0 ? (
        <Box
          role="group"
          aria-label={t('fn.blockedTitle')}
          className="flex flex-wrap items-center gap-3 rounded-card border border-[var(--warning-soft-text)] bg-[var(--warning-soft-bg)] px-4 py-3"
        >
          <Box className="min-w-0 flex-1">
            <Text size="sm" weight="semibold">
              {t('fn.blockedTitle')}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {blockers.map(blocker => t(`blocker.${blocker}`)).join(' ')}
            </Text>
          </Box>
          <Link to="/integrations" className={THEO_BTN}>
            {t('blocker.fix')}
          </Link>
        </Box>
      ) : null}

      <Box data-section="rubrics" className="grid gap-3 sm:grid-cols-2">
        <Rubric title={t('fn.rubric.when')}>{definition.condition[locale]}</Rubric>
        <Rubric title={t('fn.rubric.reads')}>{definition.reads[locale]}</Rubric>
        <Rubric title={t('fn.rubric.result')}>{definition.outcome[locale]}</Rubric>
        {/* `null` = arrêt non vérifié au code : aucune rubrique plutôt qu'un « non renseigné » (GA-18/GA-19). */}
        {definition.stopCondition ? (
          <Rubric title={t('fn.rubric.stop')}>{definition.stopCondition[locale]}</Rubric>
        ) : null}
        {/* Théo C automations-editeur.A3 — la preuve que ça marche, et ce qu'elle fait quand elle ne peut pas. */}
        <Rubric title={t('fn.rubric.proof')}>{definition.acceptance[locale]}</Rubric>
        <Rubric title={t('fn.rubric.fallback')}>{definition.fallback[locale]}</Rubric>
        {definition.example ? <Rubric title={t('fn.rubric.example')}>{definition.example[locale]}</Rubric> : null}
      </Box>
      {/* #2843.24 — risque 0-4, rôles, déroulé, ce qu'elle laisse ; jamais le coût (c132). */}
      <RoutineCardAttributes definition={definition} />

      {/* `.a14-connectors` — les outils que la routine lit. */}
      <Box className="flex flex-wrap items-center gap-1.5">
        {routineToolsOf(definition.requires).map(tool => (
          <span key={tool} className={THEO_PILL}>
            {t(`tool.${tool}`)}
          </span>
        ))}
      </Box>

      <Box className="flex flex-wrap items-center gap-2">
        <Badge variant="info" className="text-xs">
          {t(`level.${definition.automationLevel}`)}
        </Badge>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('actions:actionLevel.current', {
            level: t(`actions:actionLevel.levels.${ROUTINE_ACTION_LEVEL[definition.automationLevel]}`),
          })}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('fn.version', { version: definition.version })}
        </Text>
      </Box>

      {/* #2916 (#2399.6/.7) — la routine a changé depuis la dernière fois que ce compte l'a vue. */}
      {view.updated ? (
        <Box className="flex flex-col gap-2 rounded-lg border border-[var(--bellum-border)] p-3">
          <Box className="flex flex-wrap items-center gap-2">
            <Badge variant="info" className="text-xs">
              {t('updated.badge')}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              disabled={update.isPending}
              onClick={() => update.mutate({ key: definition.key, patch: { acknowledgeVersion: true } })}
            >
              {t('updated.acknowledge')}
            </Button>
          </Box>
          {(view.versionNotes ?? []).map(note => (
            <Box key={note.version} className="flex flex-col gap-1">
              <Text size="xs" weight="medium">
                {t('updated.changes', { version: note.version })}
              </Text>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {note.changes[locale]}
              </Text>
              {(note.fieldChanges ?? []).map(change => (
                <Text
                  key={change.field}
                  size="xs"
                  data-testid={`routine-field-change-${change.field}`}
                  className="text-[var(--bellum-text-secondary)]"
                >
                  <span className="font-medium">{t(`updated.diff.field.${change.field}`)}</span>
                  {' · '}
                  {t('updated.diff.before')} : {change.before ? change.before[locale] : t('updated.diff.notSet')}
                  {' → '}
                  {t('updated.diff.after')} : {change.after ? change.after[locale] : t('updated.diff.notSet')}
                </Text>
              ))}
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {note.migration[locale]}
              </Text>
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}

function Settings({ view, language, locale }: { view: RoutineView; language: string; locale: 'fr' | 'en' }) {
  const { t } = useTranslation('routines')
  const { definition } = view
  // #2205.49-52/.62 — l'historique ne charge qu'à l'ouverture : vingt lignes par routine n'ont pas à partir à chaque
  // affichage.
  const [showHistory, setShowHistory] = useState(false)
  const history = useRoutineRuns(definition.key, showHistory)
  // #2398.13/#2205.38 — la simulation dédiée, pour la seule routine où le calcul de la cible est séparé de l'écriture.
  const supportsDryRun = definition.key === 'no_reply_follow_up'
  const [showDryRun, setShowDryRun] = useState(false)
  const dryRun = useNoReplyFollowUpDryRun(supportsDryRun && showDryRun)
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso),
    )

  return (
    <Box className="flex flex-col gap-4">
      {/* Théo C automations-bibliotheque.A1 — les réglages d'une routine activée : statut, heure, jour, canal,
          relances par passage. */}
      <Box className="flex flex-wrap items-start gap-3">
        <RoutineStatusControl view={view} />
        {/* #2843.13 — autonomie, owner, portée, validations. */}
        <RoutineGovernanceControls view={view} />
        <RoutineScheduleControls view={view} />
        <RoutineMaxItemsPerRunControl view={view} />
      </Box>

      <Box className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {view.lastRunAt ? t('lastRun.at', { date: formatDate(view.lastRunAt) }) : t('lastRun.never')}
        </Text>
        {/* #2266.27 — le prochain déclenchement, connu et affiché ; `null` = rien (jamais une date devinée). */}
        {view.nextTriggerAt ? (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('nextTrigger.at', { date: formatDate(view.nextTriggerAt) })}
          </Text>
        ) : null}
        {view.lastOutcome ? (
          <Box className="flex flex-wrap items-center gap-x-1 gap-y-0.5" data-testid="routine-last-outcome">
            {view.lastFailed ? (
              <Badge variant="danger" className="text-xs">
                {t('lastRun.failed')}
              </Badge>
            ) : null}
            <Text size="xs" className="min-w-0 break-words leading-snug text-[var(--bellum-text-secondary)]">
              {view.lastFailed ? '· ' : null}
              {view.lastOutcome}
            </Text>
          </Box>
        ) : null}
      </Box>

      <Box className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowHistory(open => !open)}>
          {showHistory ? t('history.hide') : t('history.show')}
        </Button>
        {/* Théo C automations-bibliotheque.R4 — « simuler » pour TOUTE routine : la simulation dédiée quand elle
            existe, sinon celle, générique, que la fiche suffit à dire. Une seule à la fois, jamais deux. */}
        <Button size="sm" variant="outline" onClick={() => setShowDryRun(open => !open)}>
          {showDryRun ? t('dryRun.hide') : t('dryRun.show')}
        </Button>
      </Box>

      {showHistory ? (
        <Box className="flex flex-col gap-1.5 border-t border-[var(--bellum-border)] pt-3">
          {history.isLoading ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('history.loading')}
            </Text>
          ) : !history.data?.length ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('history.empty')}
            </Text>
          ) : (
            history.data.map(run => (
              <Box key={run.id} className="flex flex-wrap items-center gap-2">
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {formatDate(run.createdAt)}
                </Text>
                {run.failed ? (
                  <Badge variant="danger" className="text-xs">
                    {t('lastRun.failed')}
                  </Badge>
                ) : null}
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {run.outcome}
                </Text>
                {/* #2205.54 — la PREUVE vérifiable : seul un lien RÉEL (`http…`) devient un bouton. */}
                {run.proofRef?.startsWith('http') ? (
                  <Button asChild size="sm" variant="ghost">
                    <a href={run.proofRef} target="_blank" rel="noreferrer">
                      {t('history.proof')}
                    </a>
                  </Button>
                ) : null}
              </Box>
            ))
          )}
        </Box>
      ) : null}

      {showDryRun ? (
        supportsDryRun ? (
          <RoutineDryRunResult query={dryRun} />
        ) : (
          <GenericRoutineSimulation view={view} locale={locale} />
        )
      ) : null}

      {/* Théo C automations-bibliotheque.A2/A4 — « Ce que tu valides » : le réglage d'approbation de l'espace, replié,
          et l'autonomie générale de Laura, qui se règle dans Réglages › Laura. */}
      <details className="rounded-lg border border-[var(--bellum-border)] p-3">
        <summary className="cursor-pointer text-sm font-medium pointer-coarse:min-h-11">
          {t('fn.validates.title')}
        </summary>
        <Box className="mt-3 flex flex-col gap-3">
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('fn.validates.never')}
          </Text>
          <ApprovalSettingsCard />
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('fn.validates.autonomy')}{' '}
            <Link to="/settings/laura-mode" className="text-[var(--bellum-text-accent)] underline underline-offset-2">
              {t('fn.validates.autonomyLink')}
            </Link>
            .
          </Text>
        </Box>
      </details>
    </Box>
  )
}

/**
 * #2399.5 — la simulation GÉNÉRIQUE : ce que la fiche dit déjà, relu au conditionnel, plus l'état des prérequis
 * AUJOURD'HUI. Ni résultat chiffré ni probabilité : rien n'est calculé qui ne soit déjà écrit au catalogue.
 */
function GenericRoutineSimulation({ view, locale }: { view: RoutineView; locale: 'fr' | 'en' }) {
  const { t } = useTranslation('routines')
  const { definition, blockers } = view
  return (
    <Box className="flex flex-col gap-1 rounded-md border border-[var(--bellum-border)] p-3">
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('simulation.reads', { reads: definition.reads[locale] })}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('simulation.condition', { condition: definition.condition[locale] })}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('simulation.outcome', { outcome: definition.outcome[locale] })}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {blockers.length === 0 ? t('simulation.ready') : blockers.map(blocker => t(`blocker.${blocker}`)).join(' ')}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('simulation.note')}
      </Text>
    </Box>
  )
}
