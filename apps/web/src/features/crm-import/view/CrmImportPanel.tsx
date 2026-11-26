import {
  CLIENT_TOOLS,
  CRM_INCREMENTAL_PROVIDERS,
  type StartSyncInput,
  type SyncEntityType,
  type SyncOutcome,
} from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/lib/api-error'
import {
  connectorFailureIsActionable,
  connectorFailureSpeaksForItself,
  connectorFailureState,
} from '@/lib/connector-failure'
import { useCrmFirstImport, useCrmImportRuns, useCrmReadStatus, useRunCrmImport } from '../api'
import { FirstImportProgress } from './FirstImportProgress'

type ImportProvider = StartSyncInput['provider']

/** Le nom de l'outil que l'espace a BRANCHÉ, dérivé du catalogue (GA-44) — jamais un littéral d'écran. */
const providerLabel = (provider: ImportProvider): string =>
  CLIENT_TOOLS.find(({ provider: candidate }) => candidate === provider)?.names[0] ?? provider

/** K.4 — les CRM dont la première reprise se lance ici : HubSpot et tous ceux qui se relisent par l'adaptateur commun. */
const isImportable = (provider: string): provider is ImportProvider =>
  provider === 'hubspot' || (CRM_INCREMENTAL_PROVIDERS as readonly string[]).includes(provider)

/**
 * La REPRISE d'un CRM existant — écran de réconciliation.
 *
 * Deux boutons, et l'ordre entre eux est le sujet : on SIMULE, on lit ce qui se
 * passerait, et seulement ensuite on importe. Le bouton d'import réel n'apparaît
 * qu'APRÈS une simulation, parce qu'un premier import massif qui se passe mal
 * est ce qui fait renoncer une ESN à changer d'outil.
 *
 * Trois nombres, jamais fondus : créés, mis à jour, écartés — chaque écart avec
 * sa raison. « 412 lignes traitées » sans dire que 90 ont été ignorées laisse
 * croire à une reprise complète, et le trou se découvre trois semaines plus tard.
 */
export function CrmImportPanel() {
  const { t } = useTranslation('crmImport')
  const { data: runs, isError, error } = useCrmImportRuns()
  const importer = useRunCrmImport()
  // K.4 — la reprise vise le CRM que l'espace a BRANCHÉ (le nom de SON outil, qu'il a lui-même autorisé) ;
  // aucun branché lisible → HubSpot, comme avant.
  const { data: statuses } = useCrmReadStatus(true)
  const connected: ImportProvider[] = []
  for (const { provider: p } of statuses ?? []) if (isImportable(p)) connected.push(p)
  const [chosen, setChosen] = useState<ImportProvider | null>(null)
  const provider: ImportProvider = chosen && connected.includes(chosen) ? chosen : (connected[0] ?? 'hubspot')
  // SYNC-B — la reprise part SEULE au branchement : le panneau en montre l'avancée, la simulation reste à la main.
  const { data: firstImports } = useCrmFirstImport()
  const firstImport = (firstImports ?? []).find(({ provider: candidate }) => candidate === provider)
  const [preview, setPreview] = useState<SyncOutcome | null>(null)
  // #2388.24 — la reprise couvre aussi les COMPTES : un onglet choisit QUELLE
  // entité la simulation/l'import porte, plutôt qu'un second panneau dupliqué.
  const [entityType, setEntityType] = useState<SyncEntityType>('contact')

  const start = (dryRun: boolean) => {
    importer.mutate({ provider, entityType, dryRun, limit: 200 }, { onSuccess: outcome => setPreview(outcome) })
  }

  const selectProvider = (next: ImportProvider) => {
    if (next === provider) return
    setChosen(next)
    setPreview(null)
  }

  const selectEntityType = (next: SyncEntityType) => {
    if (next === entityType) return
    setEntityType(next)
    setPreview(null)
  }

  return (
    <Box className="space-y-4">
      <Box className="space-y-1">
        <Text element="p" size="sm" weight="medium">
          {t('title')}
        </Text>
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('subtitle')}
        </Text>
      </Box>

      {firstImport ? <FirstImportProgress state={firstImport} crm={providerLabel(provider)} /> : null}

      {connected.length > 1 ? (
        <Box display="flex" className="flex-wrap gap-1" role="group" aria-label={t('providerChoice')}>
          {connected.map(candidate => (
            <Button
              key={candidate}
              variant={candidate === provider ? 'black' : 'outline'}
              size="sm"
              onClick={() => selectProvider(candidate)}
            >
              {providerLabel(candidate)}
            </Button>
          ))}
        </Box>
      ) : null}

      <Box display="flex" className="gap-1">
        <Button
          variant={entityType === 'contact' ? 'black' : 'outline'}
          size="sm"
          onClick={() => selectEntityType('contact')}
        >
          {t('entityTabs.contact')}
        </Button>
        <Button
          variant={entityType === 'account' ? 'black' : 'outline'}
          size="sm"
          onClick={() => selectEntityType('account')}
        >
          {t('entityTabs.account')}
        </Button>
      </Box>

      <Box display="flex" className="flex-wrap items-center gap-2">
        <Button variant="black" size="sm" isLoading={importer.isPending} onClick={() => start(true)}>
          {t('actions.simulate')}
        </Button>
        {/* Le bouton d'import réel n'apparaît qu'APRÈS une simulation réussie :
            un premier import massif raté fait renoncer une ESN à changer
            d'outil. */}
        {preview && preview.dryRun && !preview.unavailable ? (
          <Button variant="outline" size="sm" isLoading={importer.isPending} onClick={() => start(false)}>
            {t('actions.run')}
          </Button>
        ) : null}
      </Box>

      {/* #2388.49 — l'écriture suit un MAPPING affiché avant création : les
          comptes de la simulation disent COMBIEN, pas QUELS CHAMPS seront
          touchés. Le mapping est FIXE (`crm-import.service.ts#apply` n'écrit
          que `email`/`full_name`) : l'afficher tel quel ne peut pas mentir
          plus longtemps que le code qui écrit réellement. */}
      {preview && preview.dryRun && !preview.unavailable ? <FieldMapping entityType={entityType} /> : null}

      {preview ? <Outcome outcome={preview} /> : null}

      <Box className="space-y-2 border-t border-border pt-4">
        <Text element="p" size="xs" weight="medium" color="text-muted-foreground">
          {t('history.title')}
        </Text>
        {isError ? (
          <HistoryUnavailable error={error} />
        ) : (runs?.length ?? 0) === 0 ? (
          <Text size="xs" color="text-muted-foreground">
            {t('history.empty')}
          </Text>
        ) : (
          <Box className="space-y-1">
            {runs?.map(run => (
              <Box
                key={run.id}
                display="flex"
                className="items-center justify-between gap-2 rounded-md border border-border p-2"
              >
                <Box display="flex" className="min-w-0 items-center gap-2">
                  <Text element="span" size="xs" weight="medium">
                    {/* La CAPACITÉ, jamais l'éditeur : la doctrine ne réserve
                        les noms de fournisseur qu'à Réglages › Intégrations, où
                        l'utilisateur autorise lui-même l'accès. */}
                    {t(`providers.${run.provider}`)}
                  </Text>
                  {/* Une simulation reste dans l'historique, MARQUÉE : c'est la
                      trace qu'on a regardé avant d'écrire. */}
                  {run.dryRun ? <Badge variant="secondary">{t('simulation')}</Badge> : null}
                  {run.error ? <Badge variant="warning">{t('failed')}</Badge> : null}
                </Box>
                <Text element="span" size="xs" color="text-muted-foreground">
                  {t('history.counts', { created: run.created, updated: run.updated, skipped: run.skippedCount })}
                </Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

/**
 * L'écran qui RÉPARE — une seule orthographe.
 *
 * `/settings/integrations` n'est plus qu'une redirection conservée pour les URL
 * de callback OAuth déjà déclarées chez les fournisseurs. L'écran qui porte le
 * bouton « Connecter » vit à `/integrations`.
 */
const INTEGRATIONS_ROUTE = '/integrations'

/**
 * Ce que l'historique dit quand il n'a pas pu être lu.
 *
 * `GET /crm/import/runs` traverse le même CRM que le reste, et échoue par le
 * contrat de connecteur : `code`, portées nommées, phrase déjà écrite. Le
 * panneau déstructurait `isError` SANS `error`, donc rendait une clé unique pour
 * trois situations qui n'appellent pas le même geste.
 *
 * ⚠️ Le corps porte `provider`. Il n'arrive pas ici — `ApiError` ne transporte
 * que `status`, `code` et `message` — et on nomme la CAPACITÉ. Garde GA-45.
 */
function HistoryUnavailable({ error }: { error: unknown }) {
  const { t } = useTranslation('crmImport')
  const failure = error instanceof ApiError ? error : null

  // #1836 — dérivation partagée : quatre écrans la recopiaient, et le jour où
  // un cinquième état est né, trois ne l'ont pas su.
  const state = connectorFailureState(error)

  // La phrase du serveur telle quelle quand il en porte une : elle NOMME les
  // portées manquantes, ou la capacité dont l'autorisation est morte — ce que
  // le navigateur ne peut pas deviner.
  const message = connectorFailureSpeaksForItself(state)
    ? failure?.message?.trim() ||
      (state === 'scope_missing' ? t('history.scopeMissing') : t('history.authorizationExpired'))
    : state === 'not_connected'
      ? t('history.notConnected')
      : t('history.loadError')

  return (
    <Box display="flex" className="flex-col items-start gap-2">
      <Text element="p" size="xs" color="text-muted-foreground">
        {message}
      </Text>
      {/* Une PANNE ne se répare pas dans Intégrations : pas de faux chemin. */}
      {connectorFailureIsActionable(state) ? (
        <Link
          to={INTEGRATIONS_ROUTE}
          className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('history.openIntegrations')}
          <ArrowRight className="size-3.5 shrink-0" aria-hidden />
        </Link>
      ) : null}
    </Box>
  )
}

/**
 * #2388.49 — ce qui sera ÉCRIT, avant le clic sur « Importer pour de bon ».
 *
 * Mapping FIXE et volontairement minimal : c'est exactement ce que
 * `CrmImportService.apply` écrit aujourd'hui (`email`, `full_name`), ni plus
 * ni moins. Un mapping éditable est un chantier séparé (#2388.51 pour la
 * validation) — celui-ci dit la vérité sur le code existant, pas une
 * promesse de configuration qui n'existe pas encore.
 */
function FieldMapping({ entityType }: { entityType: SyncEntityType }) {
  const { t } = useTranslation('crmImport')
  return (
    <Box className="space-y-1 rounded-md border border-dashed border-border p-3">
      <Text element="p" size="xs" weight="medium" color="text-muted-foreground">
        {t('mapping.title')}
      </Text>
      {entityType === 'account' ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          · {t('mapping.companyName')}
        </Text>
      ) : (
        <>
          <Text element="p" size="xs" color="text-muted-foreground">
            · {t('mapping.email')}
          </Text>
          <Text element="p" size="xs" color="text-muted-foreground">
            · {t('mapping.fullName')}
          </Text>
        </>
      )}
    </Box>
  )
}

function Outcome({ outcome }: { outcome: SyncOutcome }) {
  const { t } = useTranslation('crmImport')

  if (outcome.unavailable) {
    return (
      <Box className="rounded-md border border-dashed border-destructive/40 p-3">
        <Text size="sm" color="text-muted-foreground">
          {/* L'erreur du fournisseur TELLE QUELLE : « 401 invalid_grant » se
              répare, « l'import a échoué » non. */}
          {t('outcome.failed', { reason: outcome.unavailable })}
        </Text>
      </Box>
    )
  }

  return (
    <Box className="space-y-2 rounded-md border border-border bg-[var(--bellum-surface-2)] p-3">
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Badge variant={outcome.dryRun ? 'secondary' : 'success'}>
          {outcome.dryRun ? t('outcome.simulated') : t('outcome.applied')}
        </Badge>
        <Text element="span" size="xs" color="text-muted-foreground">
          {t('outcome.counts', {
            created: outcome.created,
            updated: outcome.updated,
            skipped: outcome.skipped.length,
          })}
        </Text>
        {outcome.truncated ? (
          // « 200 contacts importés » sur une base de 3000 se lit comme une fin.
          <Badge variant="warning">{t('outcome.truncated')}</Badge>
        ) : null}
      </Box>

      {outcome.skipped.length > 0 ? (
        <Box className="space-y-0.5">
          {/* Chaque écart avec SA raison : un import qui annonce un total sans
              dire ce qu'il a laissé de côté laisse croire à une reprise
              complète. */}
          {outcome.skipped.slice(0, 10).map(entry => (
            <Text key={entry.ref} element="p" size="xs" color="text-muted-foreground">
              {entry.ref} — {t(`reasons.${entry.reason}`)}
            </Text>
          ))}
          {outcome.skipped.length > 10 ? (
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('outcome.moreSkipped', { count: outcome.skipped.length - 10 })}
            </Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  )
}
