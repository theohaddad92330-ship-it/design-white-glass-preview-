import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import {
  APPROVED_TEMPLATE_SCENARIO_IDS,
  type ApprovedTemplateCandidate,
  type ApprovedTemplateScenarioId,
  type OutreachPersona,
} from '@bellum/contracts'
import { Button, SelectField, Text } from '@bellum/ui'
import { APPROVED_TEMPLATE_CHANNEL_FOR_ENGAGEMENT, fetchApprovedTemplateCandidates } from './approved-templates'
import type { MessageParameters } from './message-parameters'
import type { EngagementChannel } from './types'

type ApprovedTemplatePickerProps = {
  channel: EngagementChannel
  contactId: string
  parameters: MessageParameters
  onUseTemplate: (candidate: ApprovedTemplateCandidate) => void
  /** Théo C6 — monté dans la modale « Partir d'un modèle approuvé » : le choix est déjà ouvert, sans bouton. */
  alwaysOpen?: boolean
}

/**
 * #3417 (retour bêta 30/09, fiche contact) — la bibliothèque versionnée des
 * scripts et messages approuvés, à côté de « Générer » : deux chemins
 * distincts (#3417.4) — un modèle approuvé (texte exact, ici) ou un message
 * personnalisé (`ComposerDock`'s « Générer », inchangé).
 *
 * `channel === 'task'` n'a pas de canal de bibliothèque (une tâche ne
 * s'envoie pas) : l'appelant ne monte pas ce composant dans ce cas.
 */
export function ApprovedTemplatePicker({
  channel,
  contactId,
  parameters,
  onUseTemplate,
  alwaysOpen = false,
}: ApprovedTemplatePickerProps) {
  const { t } = useTranslation('engagement')
  const [toggled, setOpen] = useState(false)
  const open = alwaysOpen || toggled
  const [scenario, setScenario] = useState<ApprovedTemplateScenarioId | ''>('')
  const [candidates, setCandidates] = useState<{ ready: ApprovedTemplateCandidate[]; blockedReasons: string[] } | null>(
    null,
  )
  const [loading, setLoading] = useState(false)
  const panelId = useId()
  const templateChannel = APPROVED_TEMPLATE_CHANNEL_FOR_ENGAGEMENT[channel]

  useEffect(() => {
    if (!scenario || !templateChannel) {
      setCandidates(null)
      return
    }
    let cancelled = false
    setLoading(true)
    fetchApprovedTemplateCandidates(
      contactId,
      templateChannel,
      scenario,
      parameters.persona as OutreachPersona | undefined,
    )
      .then(res => {
        if (cancelled) return
        setCandidates({
          ready: res.ready,
          blockedReasons: res.blocked.map(item =>
            t(`composer.approvedTemplates.blocked.${item.reason}`, {
              missing: item.missing
                .map(name => t(`composer.approvedTemplates.missingNames.${name}`, { defaultValue: name }))
                .join(', '),
            }),
          ),
        })
      })
      .catch(() => {
        if (!cancelled) setCandidates({ ready: [], blockedReasons: [] })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [scenario, templateChannel, contactId, parameters.persona, t])

  if (!templateChannel) return null

  return (
    <div className="min-w-0">
      {alwaysOpen ? null : (
        <Button
          type="button"
          variant="light"
          size="sm"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(value => !value)}
          className="h-auto gap-1.5"
        >
          {t('composer.approvedTemplates.toggle')}
          <ChevronDown aria-hidden="true" className={open ? 'size-3.5 rotate-180' : 'size-3.5'} />
        </Button>
      )}
      {open ? (
        <div id={panelId} className="mt-2 space-y-2">
          <label htmlFor={`${panelId}-scenario`} className="sr-only">
            {t('composer.approvedTemplates.chooseScenario')}
          </label>
          <SelectField
            id={`${panelId}-scenario`}
            size="sm"
            // #3697.7 (recette prod 09/10) — le lot précédent passait déjà `wrap:
            // true` à chaque OPTION (lisible une fois le menu ouvert), mais le
            // PLACEHOLDER lui-même — « Choisir un scén… » — restait tronqué dans
            // le déclencheur fermé : `[&>span]:line-clamp-1` (`SelectTrigger`,
            // #3712, le défaut partout ailleurs) s'applique aussi au libellé
            // choisi/vide, pas seulement aux options de la liste ouverte.
            className="h-auto min-h-9 py-1.5 [&>span]:line-clamp-2"
            value={scenario}
            onChange={next => setScenario(next as ApprovedTemplateScenarioId)}
            emptyOption={{ label: t('composer.approvedTemplates.chooseScenario'), wrap: true }}
            options={APPROVED_TEMPLATE_SCENARIO_IDS.map(id => ({
              value: id,
              label: t(`composer.approvedTemplates.scenarios.${id}`),
              // #3697.6 (recette prod 09/10) — plusieurs des dix libellés de
              // scénario dépassent largement ce menu étroit (« Invitation
              // acceptée », « Prospection inversée (consultant) »…) ; tronqué,
              // le choix devenait illisible (« Invitation accep… »).
              wrap: true,
            }))}
          />
          {loading ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('composer.approvedTemplates.loading')}
            </Text>
          ) : null}
          {candidates && !loading ? (
            <div className="max-h-48 space-y-1.5 overflow-y-auto">
              {candidates.ready.map(candidate => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => {
                    onUseTemplate(candidate)
                    setOpen(false)
                  }}
                  className="block w-full rounded-md border border-[var(--bellum-border)] p-2 text-left hover:bg-[var(--bellum-bg-lighter)]"
                >
                  <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                    {candidate.renderedText}
                  </Text>
                  {/* #3697.6 (recette prod 09/10) — sans rôle choisi, les trames
                      sont ORDONNÉES par niveau (celui du contact d'abord, voir
                      `orderByRole`) mais ce niveau n'était jamais ÉCRIT : l'ordre
                      ne se prouvait pas à l'écran. Jamais un niveau DEVINÉ —
                      `candidate.persona` porte déjà soit un rôle précis, soit
                      `null` (le modèle s'adresse à tous les niveaux). */}
                  <Text
                    element="p"
                    size="xs"
                    data-testid="approved-template-level"
                    className="mt-1 text-[var(--bellum-text-muted)]"
                  >
                    {t('composer.approvedTemplates.level', {
                      level: candidate.persona
                        ? t(`composer.parameters.personas.${candidate.persona}`)
                        : t('composer.approvedTemplates.levelGeneric'),
                    })}
                  </Text>
                  <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                    {t('composer.approvedTemplates.sourceVersion', {
                      source: candidate.source,
                      version: candidate.version,
                    })}
                  </Text>
                </button>
              ))}
              {candidates.ready.length === 0 ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {candidates.blockedReasons.length > 0
                    ? candidates.blockedReasons.join(' · ')
                    : t('composer.approvedTemplates.none')}
                </Text>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
