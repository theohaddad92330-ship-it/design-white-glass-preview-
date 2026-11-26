import type { AutomationTemplate, CreateAutomationRuleRequest } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useActivateAutomationTemplate, useAutomationRules } from '../api'
import { templatesToOffer } from '../automationRows'

type Translate = TFunction<'actions'>

function templateRequest(template: AutomationTemplate): CreateAutomationRuleRequest {
  return {
    signal: template.signal,
    action_kind: 'enroll_sequence',
    playbook_key: template.playbook,
    template_key: template.key,
    ...(template.inactiveDays ? { inactive_days: template.inactiveDays } : {}),
  }
}

function TemplateCard({ t, template }: { t: Translate; template: AutomationTemplate }) {
  const activate = useActivateAutomationTemplate()
  return (
    <Box className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--bellum-border)] bg-card p-5">
      <Box className="flex min-w-0 flex-col gap-1">
        <Text size="sm" weight="semibold">
          {t('automations.grammar.when')}{' '}
          {t(`automations.signal.${template.signal}`, { days: template.inactiveDays ?? '' })}
        </Text>
        <Text size="sm">
          {t('automations.grammar.then')}{' '}
          {t('automations.action.enroll', { sequence: t(`outreach:playbooks.trigger.${template.playbook}.name`) })}
        </Text>
      </Box>
      <Button
        size="sm"
        className="pointer-coarse:min-h-11"
        disabled={activate.isPending}
        onClick={() => activate.mutate(templateRequest(template), { onError: error => toast.error(error.message) })}
      >
        {t('automations.templates.activate')}
      </Button>
    </Box>
  )
}

/**
 * Théo C automations-liste.A6 — les modèles de règle sur signal, FUSIONNÉS dans la bibliothèque de routines : un modèle
 * s'installe éteint puis s'allume d'un geste. Un modèle déjà installé (même signal, même séquence) n'est plus proposé.
 */
export function AutomationTemplatesBlock() {
  const { t } = useTranslation('actions')
  const rules = useAutomationRules()
  const templates = templatesToOffer(rules.data ?? [])
  if (templates.length === 0) return null
  return (
    <Box className="flex flex-col gap-3">
      <Box className="flex flex-col gap-1">
        <Text element="h2" size="lg" weight="semibold" className="tracking-tight">
          {t('automations.templates.title')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('automations.templates.help')}
        </Text>
      </Box>
      <Box className="grid gap-4 md:grid-cols-2">
        {templates.map(template => (
          <TemplateCard key={template.key} t={t} template={template} />
        ))}
      </Box>
    </Box>
  )
}
