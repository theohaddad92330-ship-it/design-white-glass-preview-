import { SUPERVISION_ROLES, type SupervisionRole } from '@bellum/contracts'
import {
  Box,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Text,
} from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/** L'état saisi du forfait encadré — le même pour l'assistant de besoin, la fiche
 *  mission, le dialogue « depuis un document » et la fiche besoin (un seul
 *  formulaire, GA-26). Les noms restent une CHAÎNE saisie : `parseClientTeamNames`
 *  les découpe à l'envoi. */
export type SupervisedForfaitDraft = {
  supervised: boolean
  supervision_role: SupervisionRole | null
  client_team_size: number | null
  client_team_names: string
}

/**
 * #3547 — LE FORFAIT ENCADRÉ, SAISI : un interrupteur, puis (s'il est allumé) le
 * rôle tenu et l'équipe côté client, tous facultatifs. Le parent décide QUAND
 * l'afficher (le mode n'existe qu'au forfait : le serveur le refuse ailleurs).
 */
export function SupervisedForfaitFields({
  value,
  onChange,
  idPrefix,
}: {
  value: SupervisedForfaitDraft
  onChange: (patch: Partial<SupervisedForfaitDraft>) => void
  idPrefix: string
}) {
  const { t } = useTranslation('projects')
  return (
    <Box className="space-y-3 rounded-md border border-[var(--bellum-border)] p-3">
      <Box className="flex items-start justify-between gap-3">
        <Box className="min-w-0 space-y-0.5">
          <Label htmlFor={`${idPrefix}-supervised`}>{t('needWizard.supervisedLabel')}</Label>
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('needWizard.supervisedHint')}
          </Text>
        </Box>
        <Switch
          id={`${idPrefix}-supervised`}
          aria-label={t('needWizard.supervisedLabel')}
          checked={value.supervised}
          onCheckedChange={checked => onChange({ supervised: checked })}
        />
      </Box>
      {value.supervised && (
        <Box className="grid gap-3 md:grid-cols-2">
          <Box className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-supervision-role`}>{t('needWizard.supervisionRoleLabel')}</Label>
            <Select
              value={value.supervision_role ?? undefined}
              onValueChange={next => onChange({ supervision_role: next as SupervisionRole })}
            >
              <SelectTrigger id={`${idPrefix}-supervision-role`} aria-label={t('needWizard.supervisionRoleLabel')}>
                <SelectValue placeholder={t('needWizard.supervisionRolePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {SUPERVISION_ROLES.map(role => (
                  <SelectItem key={role} value={role}>
                    {t(`needWizard.supervisionRole.${role}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>
          <Box className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-client-team-size`}>{t('needWizard.clientTeamSizeLabel')}</Label>
            <Input
              id={`${idPrefix}-client-team-size`}
              type="number"
              min={1}
              value={value.client_team_size ?? ''}
              onChange={event => {
                const raw = event.target.value
                onChange({ client_team_size: raw ? Math.max(1, Number(raw)) : null })
              }}
            />
          </Box>
          <Box className="space-y-1.5 md:col-span-2">
            <Label htmlFor={`${idPrefix}-client-team-names`}>{t('needWizard.clientTeamNamesLabel')}</Label>
            <Input
              id={`${idPrefix}-client-team-names`}
              value={value.client_team_names}
              onChange={event => onChange({ client_team_names: event.target.value })}
              placeholder={t('needWizard.clientTeamNamesPlaceholder')}
            />
          </Box>
        </Box>
      )}
    </Box>
  )
}
