import type { AutomationRuleView, AutomationTrialView } from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LauraFace,
  Spinner,
  Switch,
  Text,
  Textarea,
} from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Bot, ChevronRight, CircleStop, Flag, Radar, UserCheck, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CustomerPage } from '@/components/page/CustomerPage'
import { AskLaura } from '@/components/primitives/AskLaura'
import {
  useActivateAutomationDraft,
  useArchiveAutomationRule,
  useDeleteAutomationRule,
  useAutomationRules,
  useAutomationSwitchPreview,
  useAutomationTrial,
  useDuplicateAutomationRule,
  useSaveAutomationDraft,
  useUpdateAutomationRule,
} from '../api'
import { formOfRule, requestOfForm, ruleToolsOf, type RuleForm } from '../ruleDraft'
import { AutomationRuleSettingsDialog } from './AutomationRuleSettingsDialog'
import { AutomationsGuide } from './AutomationsGuide'
import { AutomationSwitchPreview } from './AutomationSwitchPreview'
import {
  THEO_BTN,
  THEO_BTN_PLAIN_SM,
  THEO_BTN_PRIMARY,
  THEO_BTN_SOFT,
  THEO_CARD,
  THEO_EYEBROW,
  THEO_PILL,
  THEO_PILL_ACCENT,
} from './theo-classes'

/**
 * Théo C automations-editeur — « AJUSTER TON AUTOMATISATION » : un seul écran pour discuter du besoin avec Laura, vérifier
 * le parcours et garder la main sur chaque résultat (la création en quatre écrans de l'assistant reste celle des
 * séquences ; ici on RÈGLE une règle qui existe).
 *
 *  - Le scénario est une chaîne de TROIS maillons — déclencheur → « Laura repère et prépare » → validation humaine —
 *    (les deux maillons « Laura » de la maquette fusionnés : même acteur, deux fois la même ligne).
 *  - Modifier une règle ne touche JAMAIS celle qui tourne : « Régler » enregistre un BROUILLON (version suivante), qui
 *    n'est activable qu'APRÈS un essai réussi ; chaque modification efface l'essai.
 *  - L'essai lit les vraies données de l'espace et ne crée ni tâche ni message ; il entre au journal des essais.
 *  - On archive, on ne supprime pas : la règle s'éteint, sort de la liste, et ses tâches, brouillons et preuves restent.
 */
export function AutomationEditorPage({ id }: { id: string }) {
  const { t } = useTranslation('routines')
  const { data, isLoading, isError } = useAutomationRules()
  const rule = data?.find(candidate => candidate.id === id)

  return (
    <CustomerPage
      anchorId="automation-editor"
      pageTitle={t('editor.title')}
      pageSubtitle={t('editor.subtitle')}
      headerActions={<BackLink />}
    >
      {isLoading ? (
        <Box className="flex h-48 items-center justify-center">
          <Spinner />
        </Box>
      ) : isError || !rule ? (
        <Box className={`${THEO_CARD} flex flex-col items-start gap-3`}>
          <Text weight="medium">{t('editor.notFoundTitle')}</Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('editor.notFoundBody')}
          </Text>
        </Box>
      ) : (
        // La clé suit la version et l'état du brouillon : un brouillon enregistré ou activé repart d'un état propre.
        <Editor key={`${rule.id}:${rule.version ?? 1}:${rule.draft ? 'draft' : 'live'}`} rule={rule} />
      )}
    </CustomerPage>
  )
}

/** `.a14-head .a14-tools` — « Retour aux automatisations », à droite du titre. */
function BackLink() {
  const { t } = useTranslation('routines')
  return (
    <Link to="/actions/automatisations" className={THEO_BTN}>
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('editor.back')}
    </Link>
  )
}

function Editor({ rule }: { rule: AutomationRuleView }) {
  const { t } = useTranslation('routines')
  const navigate = useNavigate()
  const save = useSaveAutomationDraft()
  const trial = useAutomationTrial()
  const activate = useActivateAutomationDraft()
  const duplicate = useDuplicateAutomationRule()
  const archive = useArchiveAutomationRule()
  const remove = useDeleteAutomationRule()
  const toggle = useUpdateAutomationRule()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [node, setNode] = useState<NodeKind | null>(null)
  const [instruction, setInstruction] = useState('')
  const [lastTrial, setLastTrial] = useState<AutomationTrialView | null>(null)

  // L'éditeur montre ce qu'il éditerait : le brouillon quand il y en a un, la règle qui tourne sinon.
  const form = formOfRule(rule)
  const days = form.inactiveDays === '' ? '' : form.inactiveDays
  const sentence = t(`actions:automations.signal.${form.signal}`, { days })
  const title = form.name === '' ? sentence : form.name
  const draft = rule.draft ?? null
  const tested = draft?.tested === true
  const version = rule.version ?? 1
  const nextVersion = version + 1
  // #2399.7 — la bascule se fait les yeux ouverts : la comparaison est rendue (et lue) avant que le bouton s'ouvre.
  const comparison = useAutomationSwitchPreview(rule.id, draft !== null && tested)
  const compared = comparison.data !== undefined
  const tools = ruleToolsOf(form.signal, form.result)
  // Théo C automations-editeur — QUATRE maillons, comme la maquette : déclencheur, repérage, préparation, validation.
  const chainNodes: { kind: NodeKind; icon: LucideIcon; kicker: string; title: string; body: string | null }[] = [
    { kind: 'trigger', icon: Flag, kicker: t('editor.chain.trigger'), title: sentence, body: null },
    {
      kind: 'scout',
      icon: Radar,
      kicker: t('editor.chain.scout'),
      title: t('editor.chain.scoutTitle'),
      body: t(`editor.chain.scoutBody.${form.signal}`),
    },
    {
      kind: 'prepare',
      icon: Bot,
      kicker: t('editor.chain.laura'),
      title: t('editor.chain.lauraTitle'),
      body:
        form.result === 'enroll_sequence'
          ? t('editor.chain.lauraEnroll', {
              sequence: t(`outreach:playbooks.trigger.${requestOfForm(form).playbook_key}.name`),
            })
          : t(`editor.chain.laura_${form.result}`),
    },
    {
      kind: 'human',
      icon: UserCheck,
      kicker: t('editor.chain.human'),
      title: t('editor.chain.humanTitle'),
      body: t('editor.chain.humanBody'),
    },
  ]
  const openedNode = chainNodes.find(item => item.kind === node) ?? null

  const applyDraft = (next: RuleForm) => {
    save.mutate(
      { id: rule.id, draft: requestOfForm(next) },
      {
        onSuccess: () => {
          setSettingsOpen(false)
          setLastTrial(null)
          toast.success(t('editor.toast.draftSaved', { version: nextVersion }))
        },
        onError: error => toast.error(error.message),
      },
    )
  }

  return (
    <Box className="flex w-full flex-col">
      <AutomationsGuide />

      {/* `.a14-builder` — deux colonnes : la conversation avec Laura (collante), puis le scénario et l'essai. */}
      <Box
        data-section="builder"
        className="grid items-start gap-4 lg:grid-cols-[minmax(17rem,0.9fr)_minmax(0,1.1fr)] xl:grid-cols-[minmax(18.75rem,0.82fr)_minmax(0,1.18fr)] xl:gap-6"
      >
        {/* Théo C automations-editeur.N1 — « Laura, avec toi » : on précise la règle à Laura, qui répond dans la
            conversation. Rien ne se modifie seul : la précision part en question pré-remplie, le réglage reste un geste. */}
        <section
          aria-label={t('editor.laura.title')}
          data-section="laura"
          className="overflow-hidden rounded-2xl border border-[var(--bellum-border)] bg-card lg:sticky lg:top-4"
        >
          <Box className="flex items-center gap-2.5 border-b border-[var(--bellum-border)] px-5 py-4">
            <LauraFace size={34} decorative />
            <Box className="min-w-0">
              <Text element="h2" size="sm" weight="semibold">
                {t('editor.laura.title')}
              </Text>
              <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
                {t('editor.laura.tagline')}
              </Text>
            </Box>
          </Box>
          <Box role="log" className="flex max-h-80 flex-col gap-4 overflow-y-auto p-5 lg:max-h-[30rem]">
            <Box className="border-l-2 border-[var(--bellum-accent-line)] pl-3 text-sm leading-relaxed">
              <Text element="span" size="xs" weight="semibold" className="mb-1 block text-[var(--bellum-text-accent)]">
                {t('editor.laura.bubbleName')}
              </Text>
              {t('editor.laura.intro')}
            </Box>
          </Box>
          <Box className="border-t border-[var(--bellum-border)] p-3">
            <Textarea
              value={instruction}
              onChange={event => setInstruction(event.target.value)}
              placeholder={t('editor.laura.placeholder')}
              aria-label={t('editor.laura.placeholder')}
              rows={3}
              maxLength={3000}
              className="min-h-20 resize-y rounded-control bg-[var(--bellum-surface-2)] text-sm"
            />
            <Box className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('editor.laura.note')}
              </Text>
              {instruction.trim() === '' ? (
                <Button size="sm" disabled>
                  {t('editor.laura.refine')}
                </Button>
              ) : (
                <AskLaura
                  variant="prominent"
                  alwaysVisible
                  label={t('editor.laura.refine')}
                  question={t('editor.laura.question', { name: title, sentence, text: instruction.trim() })}
                />
              )}
            </Box>
          </Box>
        </section>

        <Box data-section="plan" className="flex min-w-0 flex-col gap-4">
          {/* `.a14-plan-card` — TON SCÉNARIO : titre, pastilles, chaîne en quatre maillons, arrêt, outils, préparé. */}
          <section aria-label={t('editor.scenario.kicker')} className={THEO_CARD}>
            <Box className="flex items-start justify-between gap-3">
              <Box className="min-w-0">
                <span className={THEO_EYEBROW}>{t('editor.scenario.kicker')}</span>
                <Text element="h2" className="mt-2 text-xl font-semibold leading-snug tracking-tight">
                  {title}
                </Text>
                <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
                  {t('editor.scenario.when', { signal: sentence })} · {t(`editor.result.${form.result}`)}
                </Text>
              </Box>
              <button type="button" className={THEO_BTN_PLAIN_SM} onClick={() => setSettingsOpen(true)}>
                {t('editor.scenario.adjust')}
              </button>
            </Box>

            <Box className="mt-3 flex flex-wrap items-center gap-2">
              <span className={THEO_PILL}>{t('editor.scenario.scope')}</span>
              <span className={THEO_PILL_ACCENT}>{t(`editor.result.${form.result}`)}</span>
              <span className={THEO_PILL}>
                {draft
                  ? t('editor.scenario.versionDraft', { version: nextVersion })
                  : t('editor.scenario.version', { version })}
              </span>
              {/* Théo C automations-editeur.A4 — l'origine d'une règle : ici, une règle (les routines ont leur
                  bibliothèque, les workflows leur écran). */}
              <span className={THEO_PILL}>{t('actions:automations.origin.rule')}</span>
              {/* Théo C automations-editeur.A1 — le coût, SANS chiffre (#4468) : le plafond se règle dans « Régler ». */}
              <span className={THEO_PILL}>
                {rule.credit_cost === 0 ? t('editor.scenario.costIncluded') : t('editor.scenario.costUses')}
              </span>
              {/* Hors maquette, gardé : l'interrupteur de la règle qui tourne. */}
              <label className="ml-auto inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
                <Switch
                  checked={rule.enabled}
                  disabled={toggle.isPending}
                  aria-label={t('editor.scenario.enabled')}
                  onCheckedChange={enabled =>
                    toggle.mutate({ id: rule.id, patch: { enabled } }, { onError: error => toast.error(error.message) })
                  }
                />
                <span aria-hidden="true">{t('editor.scenario.enabled')}</span>
              </label>
            </Box>

            <ol className="mt-5 flex flex-col" aria-label={t('editor.chain.label')}>
              {chainNodes.map((item, index) => (
                <ChainNode
                  key={item.kind}
                  icon={item.icon}
                  laura={item.kind === 'scout' || item.kind === 'prepare'}
                  human={item.kind === 'human'}
                  first={index === 0}
                  kicker={item.kicker}
                  title={item.title}
                  body={item.body}
                  openLabel={t('editor.node.open', { name: item.title })}
                  onOpen={() => setNode(item.kind)}
                />
              ))}
            </ol>

            {/* `.a14-plan-tail` — ce qui arrête le suivi. */}
            <Box className="mt-3.5 flex items-start gap-2 border-t border-[var(--bellum-border)] pt-3.5 text-xs leading-relaxed text-[var(--bellum-text-secondary)]">
              <CircleStop className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <Text element="p" size="xs">
                <strong className="text-[var(--bellum-text-primary)]">{t('editor.stops.title')}.</strong>{' '}
                {t('editor.stops.body')}
              </Text>
            </Box>

            {/* Théo C automations-editeur.N5 — les outils requis : ceux de l'espace du client, jamais nos fournisseurs. */}
            <details className="mt-4">
              <summary className="inline-flex min-h-8 cursor-pointer items-center text-xs text-[var(--bellum-text-secondary)] pointer-coarse:min-h-11">
                {t('editor.tools.title')}
              </summary>
              <Box className="mt-2 flex flex-col gap-2.5">
                <Box className="flex flex-wrap gap-1.5">
                  {tools.map(tool => (
                    <span key={tool} className={THEO_PILL}>
                      {t(`tool.${tool}`)}
                    </span>
                  ))}
                </Box>
                <Link to="/integrations" className={`${THEO_BTN_PLAIN_SM} w-fit`}>
                  {t('editor.tools.connections')}
                </Link>
                <Text size="xs" className="leading-relaxed text-[var(--bellum-text-secondary)]">
                  {t('editor.tools.body')}
                </Text>
              </Box>
            </details>

            {/* Ce que la règle a préparé : le lien mène à « À traiter ». Jamais « 0 » pour une règle qui n'a pas tourné. */}
            <Link
              to="/actions"
              className="mt-3 inline-flex w-fit items-center text-xs text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
            >
              {rule.firings_30d === null
                ? t('editor.prepared.unmeasured')
                : t('editor.prepared.count', { count: rule.firings_30d })}
            </Link>
          </section>

          {/* Théo C automations-editeur.R5 — « Essayer avant de conserver » : lit, ne crée rien. */}
          <section aria-label={t('editor.try.title')} className={THEO_CARD}>
            <Box className="flex flex-wrap items-start justify-between gap-3">
              <Box className="min-w-0 flex-1">
                <Text element="h3" size="sm" weight="semibold" className="mb-2">
                  {t('editor.try.title')}
                </Text>
                <Text size="xs" className="leading-relaxed text-[var(--bellum-text-secondary)]">
                  {t('editor.try.body')}
                </Text>
                {!rule.enabled ? (
                  <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                    {t('editor.try.pausedPromise')}
                  </Text>
                ) : null}
              </Box>
              <button
                type="button"
                className={THEO_BTN_SOFT}
                disabled={trial.isPending}
                onClick={() =>
                  trial.mutate(rule.id, {
                    onSuccess: result => setLastTrial(result),
                    onError: error => toast.error(error.message),
                  })
                }
              >
                {trial.isPending ? t('editor.try.running') : t('editor.try.run')}
              </button>
            </Box>
            {lastTrial ? <TrialResult trial={lastTrial} /> : null}

            {/* `.a14-savebar` — enregistrer le brouillon, activer la version suivante une fois testée. */}
            <Box className="mt-4 flex flex-wrap items-center gap-2">
              {/* Théo C automations-editeur — « Enregistrer le brouillon » : le geste qui crée la version suivante. */}
              <button type="button" className={`${THEO_BTN} flex-1 sm:flex-none`} onClick={() => setSettingsOpen(true)}>
                {t('editor.actions.saveDraft')}
              </button>
              {draft ? (
                <button
                  type="button"
                  className={`${THEO_BTN_PRIMARY} flex-1 sm:flex-none`}
                  disabled={!tested || !compared || activate.isPending}
                  onClick={() =>
                    activate.mutate(rule.id, {
                      onSuccess: () => {
                        setLastTrial(null)
                        toast.success(t('editor.toast.activated', { version: nextVersion }))
                      },
                      onError: error => toast.error(error.message),
                    })
                  }
                >
                  {t('editor.actions.activate', { version: nextVersion })}
                </button>
              ) : null}
            </Box>
            {draft && tested ? <AutomationSwitchPreview ruleId={rule.id} /> : null}
            {draft && !tested ? (
              <Text size="xs" className="mt-5 leading-relaxed text-[var(--bellum-text-muted)]">
                {t('editor.actions.testToActivate')}
              </Text>
            ) : null}
          </section>

          <Box className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={THEO_BTN_PLAIN_SM}
              disabled={duplicate.isPending}
              onClick={() =>
                duplicate.mutate(rule.id, {
                  onSuccess: copy => {
                    toast.success(t('editor.toast.duplicated'))
                    void navigate({ to: '/actions/automatisations/$id', params: { id: copy.id } })
                  },
                  onError: error => toast.error(error.message),
                })
              }
            >
              {t('editor.actions.duplicate')}
            </button>
            <button type="button" className={THEO_BTN_PLAIN_SM} onClick={() => setArchiveOpen(true)}>
              {t('editor.actions.archive')}
            </button>
            {/* Hors maquette, gardé : la suppression confirmée (l'archivage reste le geste par défaut). */}
            <button
              type="button"
              className={`${THEO_BTN_PLAIN_SM} ml-auto text-[var(--bellum-text-secondary)]`}
              onClick={() => setRemoveOpen(true)}
            >
              {t('editor.actions.delete')}
            </button>
          </Box>
        </Box>
      </Box>

      {settingsOpen ? (
        <AutomationRuleSettingsDialog
          rule={rule}
          open
          onOpenChange={setSettingsOpen}
          onApply={applyDraft}
          pending={save.isPending}
        />
      ) : null}

      {/* Théo C automations-editeur — chaque maillon ouvre son état : ce qu'il fait, et « Régler ». */}
      <Dialog open={openedNode !== null} onOpenChange={open => (open ? null : setNode(null))}>
        <DialogContent closeLabel={t('editor.close')}>
          {openedNode ? (
            <>
              <DialogHeader>
                <DialogTitle>{t(`editor.node.${openedNode.kind}`)}</DialogTitle>
                <DialogDescription>{openedNode.title}</DialogDescription>
              </DialogHeader>
              {openedNode.body ? <Text size="sm">{openedNode.body}</Text> : null}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setNode(null)
                    setSettingsOpen(true)
                  }}
                >
                  {t('editor.node.adjust')}
                </Button>
                <Button onClick={() => setNode(null)}>{t('editor.close')}</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent closeLabel={t('editor.close')}>
          <DialogHeader>
            <DialogTitle>{t('editor.remove.title')}</DialogTitle>
            <DialogDescription>{t('editor.remove.body')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>
              {t('editor.cancel')}
            </Button>
            <Button
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(rule.id, {
                  onSuccess: () => {
                    setRemoveOpen(false)
                    void navigate({ to: '/actions/automatisations' })
                  },
                  onError: error => toast.error(error.message),
                })
              }
            >
              {t('editor.remove.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent closeLabel={t('editor.close')}>
          <DialogHeader>
            <DialogTitle>{t('editor.archive.title')}</DialogTitle>
            <DialogDescription>{t('editor.archive.body')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>
              {t('editor.cancel')}
            </Button>
            <Button
              disabled={archive.isPending}
              onClick={() =>
                archive.mutate(rule.id, {
                  onSuccess: () => {
                    setArchiveOpen(false)
                    toast.success(t('editor.toast.archived'))
                    void navigate({ to: '/actions/automatisations' })
                  },
                  onError: error => toast.error(error.message),
                })
              }
            >
              {t('editor.archive.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  )
}

type NodeKind = 'trigger' | 'scout' | 'prepare' | 'human'

/** `.a14-node` + `.a14-wire` — un maillon cliquable, relié au précédent par un fil d'accent. */
function ChainNode({
  icon: Icon,
  laura,
  human,
  first,
  kicker,
  title,
  body,
  openLabel,
  onOpen,
}: {
  icon: LucideIcon
  laura: boolean
  human: boolean
  first: boolean
  kicker: string
  title: string
  body: string | null
  openLabel: string
  onOpen: () => void
}) {
  return (
    <li className="flex flex-col">
      {first ? null : <span aria-hidden="true" className="ml-8 h-5 border-l border-[var(--bellum-accent-line)]" />}
      <button
        type="button"
        aria-label={openLabel}
        onClick={onOpen}
        className={`grid w-full grid-cols-[2rem_minmax(0,1fr)_1rem] items-start gap-3 rounded-xl border p-3.5 text-left transition-colors duration-immediate ease-bellum-out hover:border-[var(--bellum-accent-line)] md:grid-cols-[2.25rem_minmax(0,1fr)_1rem] md:p-4 ${
          human
            ? 'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)]'
            : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)]'
        }`}
      >
        <span
          aria-hidden="true"
          className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-control border border-[var(--bellum-border)] bg-card text-[var(--bellum-text-accent)]"
        >
          {laura ? <LauraFace size={32} decorative className="rounded-none" /> : <Icon className="size-4" />}
        </span>
        <span className="flex min-w-0 flex-col">
          <Text
            element="span"
            size="xs"
            weight="semibold"
            className="mb-1 uppercase tracking-wide text-[var(--bellum-text-muted)]"
          >
            {kicker}
          </Text>
          <Text element="span" size="sm" weight="semibold" className="leading-snug">
            {title}
          </Text>
          {body ? (
            <Text element="span" size="xs" className="mt-1 leading-relaxed text-[var(--bellum-text-secondary)]">
              {body}
            </Text>
          ) : null}
        </span>
        <ChevronRight className="mt-1 size-4 text-[var(--bellum-text-muted)]" aria-hidden="true" />
      </button>
    </li>
  )
}

function TrialResult({ trial }: { trial: AutomationTrialView }) {
  const { t } = useTranslation('routines')
  if (trial.outcome === 'failed') {
    return (
      <Box
        role="status"
        className="mt-3.5 flex flex-col gap-1 rounded-xl border border-[var(--warning-soft-text)] bg-[var(--warning-soft-bg)] p-4"
      >
        <Text size="sm">{t('journal.failed', { reason: trial.reason ?? '' })}</Text>
      </Box>
    )
  }
  return (
    <Box
      role="status"
      className="mt-3.5 flex flex-col gap-1.5 rounded-xl border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] p-4"
    >
      <Text element="h4" size="sm" weight="semibold">
        {trial.situations_read === null || trial.situations_read === 0
          ? t('journal.readNone')
          : t('journal.read', { count: trial.situations_read })}
      </Text>
      {trial.situation_labels.length > 0 ? (
        <ul className="mt-1 overflow-hidden rounded-xl border border-[var(--bellum-border)] bg-card">
          {trial.situation_labels.map(label => (
            <li
              key={label}
              className="flex min-h-11 items-center border-b border-[var(--bellum-border)] px-3.5 py-2.5 text-sm font-semibold last:border-b-0"
            >
              {label}
            </li>
          ))}
        </ul>
      ) : null}
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {trial.would_act === null || trial.would_act === 0
          ? t('journal.wouldActNone')
          : t('journal.wouldAct', { count: trial.would_act })}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('editor.try.kept')}
      </Text>
    </Box>
  )
}
