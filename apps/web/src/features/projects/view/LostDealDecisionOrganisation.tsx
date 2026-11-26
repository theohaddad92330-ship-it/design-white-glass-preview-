import { Box, Text } from '@bellum/ui'
import { PROJECT_CONTACT_ROLES, type ProjectContact } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { useProjectContacts } from '../hooks/useProjectContacts'
import { useSimilarProjects } from '../hooks/useSimilarProjects'

/**
 * #3246 (R17 15/10) — « ORGANISATION DE LA DÉCISION » d'une perte : les acteurs connus de
 * l'affaire et leur rôle (`project_contacts`, le circuit de décision de #2171.19), le décideur,
 * et ce qui MANQUE. Lecture seule, rien de calculé hors des rôles saisis. Une absence est une
 * phrase « non renseigné », jamais un bloc vide ni un « 0 ».
 */
const KEY_ROLES = ['decideur', 'sponsor', 'acheteur'] as const

export function LostDealDecisionOrganisation({ projectId }: { projectId: string }) {
  const { t } = useTranslation('projects')
  const { data, isError } = useProjectContacts(projectId)
  const contacts: ProjectContact[] = data ?? []
  const decider = contacts.find(contact => contact.role === 'decideur')
  const missing = KEY_ROLES.filter(role => !contacts.some(contact => contact.role === role))

  return (
    <Box className="space-y-2" data-anchor="project-decision-organisation">
      <Text size="sm" weight="medium">
        {t('detail.decisionOrg.title')}
      </Text>
      {isError ? (
        <Text size="xs" color="text-muted-foreground" data-testid="decision-error">
          {t('detail.decisionOrg.error')}
        </Text>
      ) : (
        <>
          {contacts.length === 0 ? (
            <Text size="xs" color="text-muted-foreground" data-testid="decision-empty">
              {t('detail.decisionOrg.empty')}
            </Text>
          ) : (
            <ul className="space-y-0.5">
              {contacts.map(contact => (
                <li key={`${contact.contact_id}-${contact.role}`} className="text-xs leading-snug">
                  <span>{contact.full_name}</span>
                  {' · '}
                  <span style={{ color: 'var(--text-muted)' }}>{t(`detailContacts.roles.${contact.role}`)}</span>
                </li>
              ))}
            </ul>
          )}
          <Text size="xs" data-testid="decision-decider">
            {t('detail.decisionOrg.decider')} : {decider ? decider.full_name : t('detail.decisionOrg.unknown')}
          </Text>
          {missing.length > 0 && (
            <Text size="xs" color="text-muted-foreground" data-testid="decision-missing">
              {t('detail.decisionOrg.missing')} : {missing.map(role => t(`detailContacts.roles.${role}`)).join(', ')}
            </Text>
          )}
        </>
      )}
    </Box>
  )
}

/**
 * #3246 (R17 15/10) — les PERTES comparables de l'espace : le même besoin sur d'autres comptes
 * (`GET /projects/:id/similar`), restreint aux affaires perdues. Aucune → une phrase.
 */
export function LostDealComparableLosses({ projectId }: { projectId: string }) {
  const { t } = useTranslation('projects')
  const { data, isPending, isError } = useSimilarProjects(projectId, true)
  const losses = (data?.matches ?? []).filter(match => match.stage === 'lost')

  return (
    <Box className="space-y-2" data-anchor="project-comparable-losses">
      <Text size="sm" weight="medium">
        {t('detail.comparableLosses.title')}
      </Text>
      {isPending ? (
        <Text size="xs" color="text-muted-foreground">
          {t('detail.comparableLosses.loading')}
        </Text>
      ) : isError ? (
        <Text size="xs" color="text-muted-foreground" data-testid="comparable-error">
          {t('detail.comparableLosses.error')}
        </Text>
      ) : losses.length === 0 ? (
        <Text size="xs" color="text-muted-foreground" data-testid="comparable-empty">
          {t('detail.comparableLosses.empty')}
        </Text>
      ) : (
        <ul className="space-y-0.5">
          {losses.map(match => (
            <li key={match.id} className="text-xs leading-snug">
              {match.company_name ?? t('similar.unknownCompany')} · {match.label}
            </li>
          ))}
        </ul>
      )}
    </Box>
  )
}
