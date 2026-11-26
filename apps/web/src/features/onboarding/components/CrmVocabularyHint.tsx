import { useTranslation } from 'react-i18next'
import { CLIENT_TOOLS } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useCrmVocabulary } from '@/features/crm/hooks/useCrmVocabulary'
import type { CrmVocabularyField } from '@/features/onboarding/lib/questions'

type Props = { field: CrmVocabularyField }

/**
 * #2031.5 / #2045.5 — décision Louis 18/09/2026 : « PROPOSER sans remplir ».
 *
 * Montre ce que le CRM BRANCHÉ de l'espace contient RÉELLEMENT, dans SES
 * propres mots, comme aide à la saisie — jamais une correspondance devinée
 * vers le catalogue fermé (`ESN_ANSWER_OPTIONS`, voir `crm-vocabulary.ts`
 * côté API pour la doctrine complète). Purement informatif : ce composant ne
 * reçoit aucun `onChange`, il ne PEUT structurellement rien écrire dans une
 * réponse — la personne choisit toujours elle-même dans les choix du
 * catalogue, juste en dessous.
 *
 * Rien à montrer (CRM non branché, muet, ou lecture en échec) ⇒ ce composant
 * ne rend RIEN — jamais un exemple, jamais un repli (« jamais de donnée
 * fictive »), et jamais un texte qui prétendrait avoir mesuré un « zéro »
 * qu'on n'a en réalité pas pu lire (GA-18/GA-19).
 *
 * ⚠️ Le nom du CRM DE L'ESPACE se nomme ici (« HubSpot »), et c'est voulu :
 * cet écran n'est jamais vu que par la personne qui répond au questionnaire
 * — contrairement au digest CRM du copilote (`formatCrmPresence`,
 * `crm-presence.ts`) qui généralise en « Votre CRM » parce qu'il peut finir
 * dans un prompt partagé devant un CLIENT. Ce qui reste interdit ici, comme
 * partout, c'est de nommer NOS PROPRES fournisseurs (D02/08) — jamais celui
 * que l'espace a branché lui-même.
 */
export function CrmVocabularyHint({ field }: Props) {
  const { t } = useTranslation('onboarding')
  const { data } = useCrmVocabulary()
  const values = field === 'industries' ? data?.industries : data?.countries

  if (!data?.provider || !values || values.length === 0) return null

  return (
    <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
      {t(`crmVocabularyHint.${field}`, { provider: providerLabel(data.provider), values: values.join(', ') })}
    </Text>
  )
}

/**
 * Le nom affiché arrive par DÉRIVATION depuis `CLIENT_TOOLS`
 * (`@bellum/contracts`, tool-naming.ts) — jamais un littéral écrit ici : c'est
 * la même règle et le même « un seul endroit » (GA-26) que
 * `connectedClientTools`, gardés par GA-44
 * (`architecture/no-vendor-names-in-app.test.ts`). Le repli sur `provider`
 * lui-même ne devrait jamais s'exécuter (chaque provider de `CrmVocabulary`
 * a une entrée dans `CLIENT_TOOLS`) — il évite seulement un écran muet si le
 * catalogue divergeait un jour.
 */
export function providerLabel(provider: 'hubspot'): string {
  return CLIENT_TOOLS.find(tool => tool.provider === provider)?.names[0] ?? provider
}
