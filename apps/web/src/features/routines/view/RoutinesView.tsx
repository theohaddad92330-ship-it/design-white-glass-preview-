import {
  ROUTINE_ACTION_LEVEL,
  ROUTINE_SELECTABLE_STATUSES,
  routineCadenceSchema,
  type RoutineCadence,
  type RoutineChannel,
  type RoutineView,
} from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlaybooksBlock } from '@/features/playbooks/view/PlaybooksBlock'
import {
  RoutineDryRunResult,
  RoutineMaxItemsPerRunControl,
  RoutineScheduleControls,
  RoutineStatusControl,
} from './RoutineControls'
import { useNoReplyFollowUpDryRun, useRoutineRuns, useRoutines, useRunDueRoutines, useUpdateRoutine } from '../api'

/**
 * Réglages › Routines.
 *
 * Les méta-analyses besoins posent une exigence en trois mots : « visible,
 * modifiable, désactivable ». Cet écran EST cette exigence — et il en tire une
 * conséquence que le rapport ne dit pas mais qui en découle : une routine dont
 * la source n'est pas connectée le DIT, avec le lien qui répare. Une case cochée
 * qui ne fait rien tous les matins est pire qu'une case décochée : elle laisse
 * croire que le produit surveille quelque chose.
 */
const CADENCE_FILTERS = ['all', ...routineCadenceSchema.options] as const
type CadenceFilter = (typeof CADENCE_FILTERS)[number]

export function RoutinesView({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, i18n } = useTranslation('routines')
  const { data, isLoading, isError, refetch } = useRoutines()
  const runDue = useRunDueRoutines()
  // #2916 (#2399.1/.5) — LE FILTRE de la bibliothèque : sur une trentaine
  // d'automatisations, une liste plate ne se parcourt plus. Client-side,
  // sur les données DÉJÀ chargées — aucune lecture neuve.
  const [cadenceFilter, setCadenceFilter] = useState<CadenceFilter>('all')

  if (isLoading) {
    return (
      <Box className="flex h-48 items-center justify-center">
        <Spinner />
      </Box>
    )
  }

  if (isError || !data) {
    return (
      <Box className="flex flex-col items-start gap-3 rounded-lg border border-[var(--bellum-border)] p-6">
        <Text weight="medium">{t('error.title')}</Text>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          {t('error.retry')}
        </Button>
      </Box>
    )
  }

  const visibleRoutines = data.filter(view => cadenceFilter === 'all' || view.definition.cadence === cadenceFilter)

  return (
    <Box className="flex w-full flex-col gap-5">
      <Box className="flex flex-wrap items-start justify-between gap-3">
        {/* `embedded` : la page de Réglages (maquette `settings-laura`) porte déjà le titre et la phrase. */}
        {embedded ? null : (
          <Box className="flex flex-col gap-1">
            {/* #2456 — `element="h1"` : le titre était déjà visible, mais rendu en
                `<p>`. Seule la balise change. */}
            <Text element="h1" size="lg" weight="semibold">
              {t('page.heading')}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('page.subtitle')}
            </Text>
          </Box>
        )}
        <Box className="flex flex-col items-end gap-1">
          <Button size="sm" variant="outline" onClick={() => runDue.mutate()} disabled={runDue.isPending}>
            {runDue.isPending ? t('page.running') : t('page.runNow')}
          </Button>
          {runDue.data ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {runDue.data.executed === 0 ? t('page.ranNone') : t('page.ranSome', { count: runDue.data.executed })}
            </Text>
          ) : null}
        </Box>
      </Box>

      {/* #2916 (#2399.1/.5) — le filtre de la bibliothèque, par cadence. */}
      <Box className="flex items-center gap-2">
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('library.filterLabel')}
        </Text>
        <Select value={cadenceFilter} onValueChange={value => setCadenceFilter(value as CadenceFilter)}>
          <SelectTrigger className="w-48" aria-label={t('library.filterLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CADENCE_FILTERS.map(option => (
              <SelectItem key={option} value={option}>
                {option === 'all' ? t('library.filterAll') : t(`cadence.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Box>

      <Box className="flex flex-col gap-3">
        {visibleRoutines.length === 0 ? (
          // #2958.104 — une cadence sans routine ne laisse pas une zone
          // blanche sous le filtre : elle le dit, et rend toute la bibliothèque.
          <Box className="flex flex-col items-start gap-2">
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('library.emptyCadence')}
            </Text>
            <Button size="sm" variant="outline" onClick={() => setCadenceFilter('all')}>
              {t('library.showAll')}
            </Button>
          </Box>
        ) : (
          visibleRoutines.map(view => <RoutineRow key={view.definition.key} view={view} language={i18n.language} />)
        )}
      </Box>

      {/* #1438 — LE RÉGLAGE DES RELANCES AUTOMATIQUES, arrivé de `/pilotage`.
          « Le bloc complet Relances automatiques avec seuil en jours, Simuler et
          Armer est une interface de configuration d'automatisation. Il ne doit
          pas occuper la page Décisions. » Il est ici parce que c'est déjà
          l'endroit qui promet « chaque routine est visible, réglable et
          désactivable » — et parce qu'un réglage vit à UN seul endroit
          (loi 1 du tome 7, garde GA-26). Pilotage n'en garde qu'une synthèse. */}
      <PlaybooksBlock />
    </Box>
  )
}

function RoutineRow({ view, language }: { view: RoutineView; language: string }) {
  const { t } = useTranslation('routines')
  const update = useUpdateRoutine()
  const { definition, subscription, blockers } = view
  const locale = language.startsWith('en') ? 'en' : 'fr'
  const blocked = blockers.length > 0
  // #2205.49-52/.62 — l'historique ne charge qu'à l'ouverture : vingt lignes
  // par routine cochée n'ont pas à partir à chaque affichage des réglages.
  const [showHistory, setShowHistory] = useState(false)
  const history = useRoutineRuns(definition.key, showHistory)
  // #2398.13/#2205.38 — « Test (dry-run avant activation) », pour la seule
  // routine où le calcul de la cible est déjà séparé de l'écriture (voir
  // `RoutineExecutors.dryRunNoReplyFollowUp`) : pas un bouton générique qui
  // laisserait croire que les autres routines se simulent aussi.
  const supportsDryRun = definition.key === 'no_reply_follow_up'
  const [showDryRun, setShowDryRun] = useState(false)
  const dryRun = useNoReplyFollowUpDryRun(supportsDryRun && showDryRun)

  return (
    <Box className="flex flex-col gap-3 rounded-xl border border-[var(--bellum-border)] p-4">
      <Box className="flex items-start justify-between gap-3">
        <Box className="flex min-w-0 flex-col gap-1">
          <Box className="flex items-center gap-2">
            {/* #2916 (#2399.1/.5) — LA FICHE : le parcours comprendre→exemple→
                simuler→configurer→activer commence ici, par un lien vers une
                page dédiée plutôt qu'une carte de plus dans la liste plate. */}
            <Link
              to="/settings/routines"
              search={{ routine: definition.key }}
              className="text-sm font-medium hover:underline"
            >
              {definition.name[locale]}
            </Link>
            <Badge variant="outline" className="text-xs">
              {t(`cadence.${definition.cadence}`)}
            </Badge>
            {/* #2205.18/.19/.28/.30/.58/.60 — le NIVEAU D'AUTONOMIE vivait dans
                le catalogue (`RoutineDefinition.automationLevel`) sans jamais
                être rendu : une routine plafonnée N4 se lisait comme
                n'importe quelle autre. */}
            <Badge variant="info" className="text-xs">
              {t(`level.${definition.automationLevel}`)}
            </Badge>
            {/* #2399.6 — le compteur de VERSION (fondation du versioning),
                envoyé par le service depuis son ajout au catalogue mais jamais
                rendu. Il n'avance pas encore automatiquement à un changement
                de contenu (reste : un déclencheur, hors de cette tranche) —
                l'afficher ici est ce qui rend ce reste VÉRIFIABLE plutôt
                qu'un entier qui ne sert à personne. */}
            <Badge variant="outline" className="text-xs">
              {t('field.version', { version: definition.version })}
            </Badge>
            {/* #2916 (#2399.6/.7) — la routine a changé depuis la dernière
                fois que ce compte l'a vue (`view.updated`, dérivé côté
                service : `subscription.seenVersion` en base contre
                `definition.version` du catalogue). Le bouton juste à côté est
                le geste qui fait AVANCER `seen_version` — sans lui, ce
                badge resterait affiché pour toujours une fois apparu. */}
            {view.updated ? (
              <>
                <Badge variant="info" className="text-xs">
                  {t('updated.badge')}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ key: definition.key, patch: { acknowledgeVersion: true } })}
                >
                  {t('updated.acknowledge')}
                </Button>
              </>
            ) : null}
          </Box>
          {/* #2399.7 — ce qui change entre la version vue et la version courante,
              et ce que devient la configuration déjà posée. Dérivé côté service
              (`view.versionNotes`), absent si la routine est à jour. */}
          {view.updated && view.versionNotes?.length ? (
            <Box className="flex flex-col gap-1 rounded-lg border border-[var(--bellum-border)] p-3">
              {view.versionNotes.map(note => (
                <Box key={note.version} className="flex flex-col gap-1">
                  <Text size="xs" className="font-medium">
                    {t('updated.changes', { version: note.version })}
                  </Text>
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {note.changes[locale]}
                  </Text>
                  {/* #2916.7 — le DIFF par champ modifié : avant → maintenant. Un champ qui n'avait pas de
                      valeur se dit « non renseignée » (jamais 0) ; sans valeur après, la ligne n'existe pas. */}
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
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {definition.description[locale]}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {definition.outcome[locale]}
          </Text>
          {/* #2153.41/.43/.47 et #2205.16/.17 — condition (alias « déclencheur »),
              critère de validation et repli sont ENVOYÉS par le service
              (`routineDefinitionSchema`) depuis leur ajout, mais n'atteignaient
              aucun écran : une routine qu'on active sans savoir ce qui doit
              être vrai pour qu'elle tourne, comment on prouve qu'elle marche,
              et ce qu'elle fait quand elle échoue n'est pas une routine
              « visible » au sens de l'exigence en tête de fichier (D-47,
              agent_docs/passe-b-dossier-26-aout/RECONSTRUIT-groupes-D-E.md:262).
              Un seul rendu de `condition` : deux lots du 21/09 visaient le
              même champ sous deux noms (« condition » / « déclencheur ») —
              GA-26, un réglage ne s'affiche pas deux fois sous la même forme. */}
          {/* #2896 / #2449.37 — le NIVEAU D'ACTION (répondre / préparer / exécuter /
              automatiser), dans le vocabulaire que Laura affiche partout ailleurs,
              DÉRIVÉ du niveau N du catalogue (`ROUTINE_ACTION_LEVEL`) : aucun
              second champ à tenir en phase. */}
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('actions:actionLevel.current', {
              level: t(`actions:actionLevel.levels.${ROUTINE_ACTION_LEVEL[definition.automationLevel]}`),
            })}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('field.condition', { condition: definition.condition[locale] })}
          </Text>
          {/* #2399.3 — CE QU'ELLE LIT (attribut 4), envoyée par le service
              (`routineDefinitionSchema.reads`) et présente dans le fixture de
              test depuis #2153/#2205, mais jamais rendue : même défaut que
              condition/acceptance/fallback avant eux. */}
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('field.reads', { reads: definition.reads[locale] })}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('field.acceptance', { acceptance: definition.acceptance[locale] })}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('field.fallback', { fallback: definition.fallback[locale] })}
          </Text>
          {/* #2399.3 — l'EXEMPLE (attribut 16 de la fiche à dix-sept), envoyé
              par le service depuis son ajout au catalogue mais jamais rendu.
              `null` sur la majorité des routines (texte source introuvable,
              v1 tranché sans Louis sur trois d'entre elles) : on n'affiche
              rien plutôt qu'une ligne « exemple non renseigné » (GA-18/GA-19,
              une absence ne fait aucune ligne dans une liste). */}
          {definition.example ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('field.example', { example: definition.example[locale] })}
            </Text>
          ) : null}
          {/* #2398.6/#2398.14 (épopée #2843) — LA CONDITION D'ARRÊT : le
              NO-GO promettait de ne jamais activer sans la montrer
              (`RoutineDetailPage.tsx`), mais aucun champ ne la portait —
              `RoutineDefinition.stopCondition`, envoyée par le service
              depuis son ajout au catalogue. `null` sur la majorité des
              routines (arrêt non encore vérifié dans le code) : même défaut
              que `example`, on n'affiche rien plutôt qu'une ligne « non
              renseignée » (GA-18/GA-19). */}
          {definition.stopCondition ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('field.stopCondition', { stopCondition: definition.stopCondition[locale] })}
            </Text>
          ) : null}
        </Box>
        {/* #2398.7 — LE STATUT (six valeurs nommées côté contrat), remplace
            l'interrupteur booléen : seules `active`/`paused`/`disabled` sont
            réglables ici (`ROUTINE_SELECTABLE_STATUSES`), les trois autres
            (`draft`/`error`/`deprecated`) n'ont encore aucun mécanisme qui les
            PRODUIT (voir `routineStatusSchema`) — les proposer ferait choisir
            un état que rien ne sait afficher ensuite.
            #2399.8/#2399.9 — BLOQUÉE, elle ne s'active plus pour rien : le
            blocage est dit juste en dessous (`blocker.<raison>` + lien qui
            répare). */}
        <RoutineStatusControl view={view} />
      </Box>

      {/* Ce qui empêche la routine de tenir sa promesse, avec le lien qui répare. */}
      {blocked ? (
        <Box className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[var(--bellum-border)] px-3 py-2">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {blockers.map(blocker => t(`blocker.${blocker}`)).join(' ')}
          </Text>
          <Button asChild size="sm" variant="outline">
            <Link to="/integrations">{t('blocker.fix')}</Link>
          </Button>
        </Box>
      ) : null}

      <Box className="flex flex-wrap items-center gap-3">
        <RoutineScheduleControls view={view} />
        <RoutineMaxItemsPerRunControl view={view} />

        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {view.lastRunAt
            ? t('lastRun.at', {
                date: new Intl.DateTimeFormat(language, {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(view.lastRunAt)),
              })
            : t('lastRun.never')}
        </Text>
        {/* #2266.27 — le prochain déclenchement, connu et affiché. `null` pour
            une routine désactivée ou une cadence continue (pas d'instant
            unique à nommer) : rien ne s'affiche alors — une absence ne se
            déguise pas en date devinée (GA-18/19). */}
        {view.nextTriggerAt ? (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('nextTrigger.at', {
              date: new Intl.DateTimeFormat(language, {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(view.nextTriggerAt)),
            })}
          </Text>
        ) : null}
        {/* Ce que la dernière exécution a produit, en clair — la moitié
            « jamais opaque » de l'exigence du rapport. */}
        {view.lastOutcome ? (
          <Box className="flex flex-wrap items-center gap-x-1 gap-y-0.5" data-testid="routine-last-outcome">
            {/* #2205.26/.55 — un échec se DISTINGUE visuellement, il ne se
                devine plus au texte seul. */}
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

        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setShowHistory(v => !v)}>
          {showHistory ? t('history.hide') : t('history.show')}
        </Button>
        {supportsDryRun ? (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setShowDryRun(v => !v)}>
            {showDryRun ? t('dryRun.hide') : t('dryRun.show')}
          </Button>
        ) : null}
      </Box>

      {/* #2205.49-52/.62 — la table `routine_runs` existait déjà (idempotence)
          mais rien ne la lisait au-delà du dernier résultat : impossible de
          répondre « les routines tournent-elles vraiment, jour après jour ? »
          (critère de recette #2205.62, « logs audités »). */}
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
                  {new Intl.DateTimeFormat(language, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(run.createdAt))}
                </Text>
                {run.failed ? (
                  <Badge variant="danger" className="text-xs">
                    {t('lastRun.failed')}
                  </Badge>
                ) : null}
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {run.outcome}
                </Text>
                {/* #2205.54 — la PREUVE vérifiable, jamais un identifiant brut
                    affiché comme s'il était cliquable : seul un lien RÉEL
                    (`http…`) devient un bouton (même règle que `PendingActions.tsx`,
                    #1931.18 — « ce qui se clique se tabule », GA-32). Un
                    `proofRef` qui n'est qu'un identifiant fournisseur (pas
                    d'URL) n'a rien à rendre ici : ce n'est pas une preuve
                    consultable depuis cet écran. */}
                {run.proofRef?.startsWith('http') ? (
                  <Button asChild size="sm" variant="ghost" className="h-6 px-2 text-xs">
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

      {/* #2398.13/#2205.38 — la simulation : ZÉRO écriture, ZÉRO appel
          modèle. Personne ne peut raisonnablement laisser une relance se
          préparer automatiquement sans avoir vu, sur SES données, ce qui
          se passerait — même raison que le dry-run des playbooks
          (§43/G5 du rapport), réutilisée ici pour cette seule routine. */}
      {showDryRun ? <RoutineDryRunResult query={dryRun} /> : null}
    </Box>
  )
}
