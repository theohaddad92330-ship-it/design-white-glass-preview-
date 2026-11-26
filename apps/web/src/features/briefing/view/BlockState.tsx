import type { BriefingBlockState } from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { briefingAccessIsSwitchedOff, briefingBlockIsRead } from '../block-state'

/**
 * Ce qu'un bloc affiche quand il n'a rien à afficher.
 *
 * Le point entier de ce composant est de ne JAMAIS ressembler à « il n'y a
 * rien ». Un bloc vide parce que la messagerie n'est pas connectée, un bloc vide
 * parce que la portée manque et un bloc vide parce que la journée est calme sont
 * trois situations différentes, et un commercial qui les confond arrête de faire
 * confiance au brief.
 */
export function BlockStateNotice({
  state,
  capability,
  reason,
}: {
  state: BriefingBlockState
  /**
   * `tasks` n'est pas une capacité branchée : elle ne dépend d'aucun
   * fournisseur, donc `not_connected` et `missing_scope` ne peuvent pas
   * arriver. Seul `unavailable` la concerne, et il veut dire ce qu'il dit — la
   * lecture a échoué, ce n'est pas « tu n'as rien à faire ».
   */
  capability: 'agenda' | 'mailbox' | 'tasks'
  /** Raison rendue par le serveur — elle affine le texte quand elle est connue. */
  reason?: string | null
}) {
  const { t } = useTranslation('briefing')
  if (state === 'ready') return null
  // `partial` est LU : sa phrase se met à côté de la liste, pas à sa place. La
  // règle vit dans `block-state.ts` — le brief dans la voix de Laura la lit au
  // même endroit (#1901.2).
  const readButIncomplete = briefingBlockIsRead(state)

  // `partial` porte du contenu : l'avertissement se met À CÔTÉ de la liste, pas
  // à la place. Un encadré pleine largeur ferait croire que le bloc est vide
  // alors que ce qu'il montre est vrai — il est juste incomplet.
  if (readButIncomplete) {
    return (
      <Box className="flex items-center gap-2 rounded-md border border-[var(--bellum-border)] px-3 py-2">
        <Badge variant="outline" className="text-xs">
          {t('state.partial')}
        </Badge>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t(`state.${capability}Partial`)}
        </Text>
      </Box>
    )
  }

  // « Réessaie dans un moment » est faux quand l'accès est éteint côté
  // fournisseur : celui-là ne repassera jamais tout seul.
  //
  // ⚠️ Ce prédicat comparait `reason` à `agenda_provider_api_disabled`, une
  // valeur que le produit N'ÉMET PAS (`connectorFailure` pose `reason:
  // input.code`, donc `provider_api_disabled`) : il était TOUJOURS FAUX en
  // production, et la messagerie n'y avait aucun chemin du tout bien que sa
  // phrase existe en FR et en EN. La réponse vit maintenant dans
  // `block-state.ts`, avec le brief de Laura (#1901.2).
  const providerDisabled = briefingAccessIsSwitchedOff(reason)

  // Rien à connecter pour les tâches : proposer « Connecter » enverrait vers un
  // écran d'intégrations qui n'a rien à voir avec la panne.
  if (capability === 'tasks') {
    return (
      <Box className="flex flex-col gap-2 rounded-lg border border-dashed border-[var(--bellum-border)] p-4">
        <Badge variant="outline" className="w-fit text-xs">
          {t('state.unavailable')}
        </Badge>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {reason ?? t('state.tasksUnavailable')}
        </Text>
      </Box>
    )
  }

  const label =
    state === 'not_connected'
      ? t('state.notConnected')
      : state === 'missing_scope'
        ? t('state.missingScope')
        : t('state.unavailable')

  const explanationKey =
    state === 'not_connected'
      ? `state.${capability}NotConnected`
      : state === 'missing_scope'
        ? `state.${capability}MissingScope`
        : providerDisabled
          ? `state.${capability}ProviderDisabled`
          : `state.${capability}Unavailable`

  return (
    <Box className="flex flex-col gap-3 rounded-lg border border-dashed border-[var(--bellum-border)] p-4">
      <Badge variant="outline" className="w-fit text-xs">
        {label}
      </Badge>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t(explanationKey)}
      </Text>
      {/* Un accès éteint côté fournisseur se répare, lui aussi — mais dans les
          réglages de l'outil, pas en réessayant. On y emmène. */}
      {state !== 'unavailable' || providerDisabled ? (
        <Button asChild size="sm" variant="outline" className="w-fit">
          <Link to="/integrations">
            {state === 'not_connected'
              ? // #2111.40 — « Connecter » seul ne dit pas QUOI, sur un écran
                // qui peut montrer agenda ET messagerie déconnectés côte à
                // côte. `capability` ici ne vaut jamais `tasks` (retour
                // anticipé plus haut), donc `agenda` ou `mailbox`.
                t(`state.connect${capability === 'mailbox' ? 'Mailbox' : 'Agenda'}`)
              : providerDisabled
                ? t('state.check')
                : t('state.reconnect')}
          </Link>
        </Button>
      ) : null}
    </Box>
  )
}
