import { useState } from 'react'
import { Badge, Box, Button, Text } from '@bellum/ui'
import type { ConnectedTool } from '@bellum/contracts'
import { AlertTriangle, Check, Minus, Stethoscope, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { integrationCenterApi, type CapabilityProbeResult, type ConnectorRepair } from '../../api'
import { formatDateTime } from '@/lib/locale'

/**
 * Les deux boutons que le PDF 7 appelle les plus importants de l'écran, et ce
 * qu'ils affichent (§6.2 et §6.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE PANNEAU EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La carte disait « Connecté ». Le 16/08/2026, elle le disait sur un agenda dont
 * l'API était éteinte depuis des semaines, sur un CRM à qui il manquait deux
 * portées, et sur un espace documentaire qui rendait une liste vide. Trois
 * pannes, un seul mot, et rien pour les distinguer.
 *
 * Ce panneau montre trois choses qu'aucun écran ne montrait :
 *  · la dernière PREUVE, datée, avec un échantillon d'objets réels ;
 *  · ce que le produit ne fera JAMAIS avec cet outil ;
 *  · les automatisations qui s'arrêtent si l'outil tombe.
 *
 * Ce qu'il ne montre jamais : le contenu d'un message ou d'un fichier. Une
 * preuve est un NOM.
 */

function stateTone(state: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (state === 'operational') return 'success'
  if (state === 'scope_missing' || state === 'authorization_expired') return 'danger'
  if (state === 'untested' || state === 'sync_late' || state === 'read_only') return 'warning'
  if (state === 'degraded' || state === 'limited_write') return 'warning'
  return 'neutral'
}

export function ConnectorDiagnostics({
  tool,
  hideLastSync = false,
}: {
  tool: ConnectedTool
  /** SYNC-C.6 — un CRM dit sa synchro dans sa note de périmètre (`CrmReadScopeNote`) : une seule date par carte. */
  hideLastSync?: boolean
}) {
  const { t, i18n } = useTranslation('integrationCenter')
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr'
  const [results, setResults] = useState<CapabilityProbeResult[] | null>(null)
  const [repair, setRepair] = useState<ConnectorRepair | null>(null)
  const [busy, setBusy] = useState<'test' | 'repair' | null>(null)
  const [failed, setFailed] = useState(false)

  /**
   * ⚠️ `?? []` et non `tool.capabilities` : le champ peut ne PAS être là.
   *
   * Trouvé en recette live le 21/08, et le défaut a mis tout l'écran par terre —
   * pas dégradé, ÉCRASÉ. Le web se déploie sur Vercel en une minute, l'API sur
   * Railway en dix : pendant cette fenêtre, le navigateur exécute du code neuf
   * contre une réponse ancienne. Le contrat déclare `capabilities` obligatoire,
   * mais `apiFetch` type par ASSERTION — il ne valide rien, donc le type ment et
   * le compilateur ne voit rien.
   *
   * La règle générale : tout champ AJOUTÉ à une réponse d'API se lit avec un
   * repli côté web, sinon chaque déploiement produit un écran blanc de quelques
   * minutes.
   */
  const capabilities = tool.capabilities ?? []

  // Un outil qui ne décompose aucune capacité n'a rien à diagnostiquer : ni
  // portée à comparer, ni lecture à faire. Afficher deux boutons inertes serait
  // exactement le « livré mais qui ne fait rien » que ce chantier corrige.
  // #4189.2 / #4184.4 (18/10) — mais la dernière synchro, elle, ne dépend d'aucune capacité : Salesforce
  // (aucune décomposée) n'avait AUCUNE ligne alors que HubSpot et Outlook l'avaient. Rien n'est estimé : `null` ⇒ rien.
  if (capabilities.length === 0) {
    return tool.last_sync && !hideLastSync ? (
      <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="connector-last-sync">
        {t('lastSync', { when: formatDateTime(new Date(tool.last_sync)) })}
      </Text>
    ) : null
  }

  const run = async (which: 'test' | 'repair') => {
    setBusy(which)
    setFailed(false)
    try {
      if (which === 'test') setResults((await integrationCenterApi.test(tool.provider)).results)
      else setRepair(await integrationCenterApi.repair(tool.provider))
    } catch {
      // Le diagnostic lui-même peut échouer. Le dire est le minimum : un
      // panneau qui reste vide se lit « tout va bien ».
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  const needsRepair = capabilities.some(
    capability => capability.state === 'scope_missing' || capability.state === 'authorization_expired',
  )

  return (
    <Box className="space-y-3 border-t border-[var(--bellum-border)] pt-3">
      {/* #1447 — la dernière activité RÉELLE sur la connexion. `last_sync` est
          renvoyé par le registre et n'était lu nulle part dans `apps/web/src`.
          ⚠️ Rien n'est estimé : `null` (outil modélisé, jamais utilisé, horodatage
          non fiable) ⇒ aucune ligne. Une heure de synchro devinée est pire que
          pas d'heure du tout — c'est elle qu'on croit. */}
      {tool.last_sync && !hideLastSync ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="connector-last-sync">
          {t('lastSync', { when: formatDateTime(new Date(tool.last_sync)) })}
        </Text>
      ) : null}

      {/* #2261.8 — la période couverte se lit à l'écran.
          ⚠️ `tool.coverage_period` REQUIS + nullable au contrat (contrairement à
          `rate_limits`, `.optional()`) précisément pour que l'absence se DISE :
          `undefined` (réponse d'AVANT le déploiement du champ, même piège que
          `capabilities ?? []` plus haut) reste muet, `null` (déclaration connue
          « inconnu ») nomme l'absence — jamais une case vide (GA-18/GA-19). */}
      {tool.coverage_period !== undefined ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="connector-coverage-period">
          {tool.coverage_period
            ? t('coveragePeriod', { value: tool.coverage_period[lang] })
            : t('coveragePeriodUnknown')}
        </Text>
      ) : null}

      {/* #2261.13 (décision Louis 19/09) — la latence MESURÉE par Bellum sur
          les synchronisations RÉELLES de l'espace (ou, à défaut, DÉCLARÉE par
          le fournisseur) : les deux sources ne se lisent pas pareil, et
          `as_of` date l'information plutôt que de la faire passer pour
          actuelle. `not_measured` NOMME la raison plutôt que de taire —
          jamais le même texte pour « pas assez de synchros » et « Bellum ne
          capture pas encore cet horodatage » (GA-18/GA-19). */}
      {tool.latency !== undefined ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="connector-latency">
          {tool.latency === null
            ? t('latencyUnknown')
            : tool.latency.source === 'not_measured'
              ? t('latencyNotMeasured', { reason: tool.latency.reason[lang] })
              : t(tool.latency.source === 'measured' ? 'latencyMeasured' : 'latencyDeclared', {
                  value: tool.latency.value[lang],
                  when: formatDateTime(new Date(tool.latency.as_of)),
                  days: tool.latency.window_days,
                  count: tool.latency.sample_count,
                })}
        </Text>
      ) : null}

      {/* #2261.16 — l'éventuelle feature bêta, déclarée par le fournisseur.
          `beta === null` (statut inconnu) se NOMME — jamais traité comme
          « stable » par silence. `beta.beta === false` (connu, hors bêta)
          n'ajoute rien : ce n'est pas un axe non mesuré, juste rien à signaler. */}
      {tool.beta !== undefined ? (
        tool.beta === null ? (
          <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="connector-beta">
            {t('betaUnknown')}
          </Text>
        ) : tool.beta.beta ? (
          <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="connector-beta">
            {tool.beta.feature ? t('betaFeature', { feature: tool.beta.feature[lang] }) : t('betaGeneric')}
          </Text>
        ) : null
      ) : null}

      {/* #2207.5 — les portées ACCORDÉES, pas seulement celle qui MANQUE
          (`missingScope`, ci-dessous, par capacité). Trouvé en registre :
          `tool.scopes` était chargé depuis le premier jour et n'atteignait
          aucun pixel — un opérateur ne pouvait vérifier que ce qui manquait,
          jamais ce que la connexion couvrait déjà. `?? []` : même repli que
          `capabilities ?? []` plus haut, pour une réponse d'AVANT le
          déploiement de ce champ. Liste vide ⇒ aucune ligne, jamais une
          absence affirmée. */}
      {(tool.scopes ?? []).length > 0 ? (
        <Text
          size="xs"
          color="text-[var(--bellum-text-secondary)]"
          className="break-all"
          data-testid="connector-granted-scopes"
        >
          {t('grantedScopes', { scopes: (tool.scopes ?? []).join(', ') })}
        </Text>
      ) : null}

      <Box className="space-y-1.5">
        {capabilities.map(capability => (
          <Box key={capability.key} display="flex" className="items-start gap-2">
            {capability.state === 'operational' ? (
              <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--success-soft-text)]" aria-hidden />
            ) : capability.state === 'scope_missing' || capability.state === 'authorization_expired' ? (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--danger-soft-text)]" aria-hidden />
            ) : (
              <Minus className="mt-0.5 size-3.5 shrink-0 text-[var(--text-ghost)]" aria-hidden />
            )}
            <Box className="min-w-0 flex-1">
              <Box display="flex" className="flex-wrap items-center gap-2">
                <Text size="xs">{t(`capabilityKeys.${capability.key}`, { defaultValue: capability.key })}</Text>
                <Badge variant="outline" className="text-xs" data-tone={stateTone(capability.state)}>
                  {t(`capabilityStates.${capability.state}`, { defaultValue: capability.state })}
                </Badge>
                {/* #2383.1 — le niveau de capacité (L0-L6) de CETTE action.
                    `!== undefined`, pas `capability.level` seul : le champ est
                    `.optional()` au contrat pour la même raison que
                    `coverage_period`/`latency`/`beta` — une réponse d'AVANT
                    le déploiement de ce champ ne doit rien afficher, jamais un
                    niveau deviné. */}
                {capability.level !== undefined ? (
                  <Badge variant="outline" className="text-xs" data-testid="capability-level">
                    {t(`capabilityLevels.${capability.level}`, { defaultValue: capability.level })}
                  </Badge>
                ) : null}
              </Box>
              {/* La dernière PREUVE, datée. « Connecté » ne prouve rien ; « 10
                  agendas lus, il y a 4 min » prouve. */}
              {capability.last_proof_at ? (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('lastProof', {
                    sample: capability.last_proof_sample ?? '—',
                    when: formatDateTime(new Date(capability.last_proof_at)),
                  })}
                </Text>
              ) : null}
              {/* La portée manquante, NOMMÉE : c'est ce qui dit à l'opérateur
                  quoi déclarer chez le fournisseur avant qu'une reconnexion
                  serve à quelque chose. */}
              {capability.scope_required.length > 0 && capability.state === 'scope_missing' ? (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="break-all">
                  {t('missingScope', { scopes: capability.scope_required.join(', ') })}
                </Text>
              ) : null}
              {/* #1444 — POURQUOI la capacité est dégradée.
                  `last_error_code` et `last_error_at` sont chargés depuis le
                  premier jour et n'atteignaient aucun pixel : la ligne montrait
                  « Dégradé » sans un mot sur ce qui avait échoué, alors que la
                  sonde le savait. Un badge sans sa raison envoie chercher la
                  panne partout sauf là où elle est — c'est le défaut que le
                  panneau de diagnostic existe pour corriger, et il l'avait
                  gardé. Aucune erreur enregistrée ⇒ aucune ligne, jamais un
                  « tout va bien » déduit d'un silence. */}
              {capability.last_error_code ? (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="capability-last-error">
                  {capability.last_error_at
                    ? t('lastError', {
                        reason: t(`errorCodes.${capability.last_error_code}`, {
                          defaultValue: capability.last_error_code,
                        }),
                        when: formatDateTime(new Date(capability.last_error_at)),
                      })
                    : t('lastErrorUndated', {
                        reason: t(`errorCodes.${capability.last_error_code}`, {
                          defaultValue: capability.last_error_code,
                        }),
                      })}
                </Text>
              ) : null}
            </Box>
          </Box>
        ))}
      </Box>

      <Box display="flex" className="flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={Stethoscope}
          isLoading={busy === 'test'}
          onClick={() => run('test')}
          title={t('testHint')}
        >
          {t('testButton')}
        </Button>
        {needsRepair ? (
          <Button variant="ghost" size="sm" icon={Wrench} isLoading={busy === 'repair'} onClick={() => run('repair')}>
            {t('repairButton')}
          </Button>
        ) : null}
      </Box>

      {failed ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('diagnosticFailed')}
        </Text>
      ) : null}

      {results ? (
        <Box className="space-y-1 rounded-md bg-[var(--bellum-surface-2,transparent)] p-2">
          {results.map(result => (
            <Text key={result.key} size="xs" color="text-[var(--bellum-text-secondary)]">
              {result.ok
                ? `✓ ${result.label}${result.sample ? ` — ${result.sample}` : ''}`
                : `✕ ${result.label} — ${t(`errorCodes.${result.errorCode}`, { defaultValue: result.errorCode ?? '' })}`}
            </Text>
          ))}
        </Box>
      ) : null}

      {repair ? (
        <Box className="space-y-1 rounded-md bg-[var(--bellum-surface-2,transparent)] p-2">
          <Text size="xs">{repair.reason}</Text>
          <Text size="xs">{repair.exactAction}</Text>
          {/* « 6 automatisations en dépendent » : c'est cette ligne qui donne sa
              valeur à « Réparer ». Reconnecter sans dire ce qu'on récupère ne
              motive personne. */}
          {repair.dependentRoutines.length > 0 ? (
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('dependentRoutines', { count: repair.dependentRoutines.length })}
            </Text>
          ) : null}
          {repair.neverDoes.length > 0 ? (
            <Box className="pt-1">
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {t('neverDoesTitle')}
              </Text>
              {repair.neverDoes.map(item => (
                <Text key={item} size="xs" color="text-[var(--text-ghost)]">
                  · {item}
                </Text>
              ))}
            </Box>
          ) : null}
        </Box>
      ) : null}
    </Box>
  )
}
