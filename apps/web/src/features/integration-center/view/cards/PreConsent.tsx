import { Box, Button, Text } from '@bellum/ui'
import type { ConnectedTool } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'

/**
 * Ce que l'utilisateur lit AVANT d'être renvoyé chez le fournisseur.
 *
 * Le PDF 7 §6.1 est catégorique : « L'écran de pré-consentement est
 * obligatoire. Il vient avant la redirection, pas après. » Le dépôt redirigeait
 * immédiatement — l'utilisateur découvrait donc l'écran du fournisseur, qui
 * énumère des portées techniques (« Consulter, modifier et supprimer… »), sans
 * avoir jamais lu ce que BellumAI compte en faire ni ce qu'il ne fera jamais.
 * C'est le moment où les gens refusent, et ils ont raison de refuser une demande
 * qu'ils ne comprennent pas.
 *
 * Le contenu vient des CAPACITÉS déclarées côté serveur, pas d'un texte
 * rédigé à part : il ne peut donc pas mentir plus longtemps que le code.
 */
export function PreConsent({
  tools,
  name,
  onCancel,
  onConfirm,
  connecting,
}: {
  tools?: readonly ConnectedTool[]
  /**
   * #2078.16 — le nom du connecteur, pour dire « Continuer sans HubSpot »
   * plutôt qu'un « Annuler » muet. Ce n'est pas une étape d'assistant que ce
   * bouton fait AVANCER (le centre d'intégrations est une page de réglages,
   * pas une étape) : il ferme le pré-consentement et laisse l'utilisateur
   * continuer à travailler sans ce connecteur, qui reste facultatif
   * (#2078.13, `CardShell`) — le geste est le même qu'« Annuler », le mot
   * dit en plus qu'il ne bloque rien.
   */
  name: string
  onCancel: () => void
  onConfirm: () => void
  connecting: boolean
}) {
  const { t } = useTranslation('integrationCenter')
  // Même repli que dans le panneau de diagnostic : le champ peut manquer
  // pendant la fenêtre où le web est déployé et l'API pas encore.
  const capabilities = (tools ?? []).flatMap(tool => tool.capabilities ?? [])

  return (
    <Box className="space-y-2 rounded-lg border border-[var(--bellum-border)] p-3">
      <Text size="xs" weight="semibold">
        {t('preConsentTitle')}
      </Text>
      {capabilities.length > 0 ? (
        <Box className="space-y-0.5">
          {capabilities.map(capability => (
            <Text key={capability.key} size="xs" color="text-[var(--bellum-text-secondary)]">
              · {t(`capabilityKeys.${capability.key}`, { defaultValue: capability.key })}
            </Text>
          ))}
        </Box>
      ) : null}
      {/* #2388.2 — la liste ci-dessus dit ce qui SERA fait ; cette ligne dit
          que rien D'AUTRE ne l'est. `preConsentNever` couvre des ACTIONS
          (supprimer, envoyer sans clic) : ceci couvre la PORTÉE (lecture
          comprise). */}
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('preConsentScopeLimited')}
      </Text>
      <Text size="xs" color="text-[var(--text-ghost)]">
        {t('preConsentNever')}
      </Text>
      <Box display="flex" className="justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('preConsentContinueWithout', { name })}
        </Button>
        <Button variant="default" size="sm" isLoading={connecting} onClick={onConfirm}>
          {t('preConsentConfirm')}
        </Button>
      </Box>
    </Box>
  )
}
