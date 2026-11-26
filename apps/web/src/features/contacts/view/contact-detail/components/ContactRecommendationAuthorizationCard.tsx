import type { Contact, ContactRecommendationAuthorizableReason } from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { ShieldQuestion, Unlock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { useContactRanking } from '@/features/contacts/hooks/useContactRanking'
import {
  useAuthorizeContactRecommendation,
  useRevokeContactRecommendationAuthorization,
} from '@/features/contacts/hooks/useAuthorizeContactRecommendation'

/** #2160.60 — les DEUX SEULES raisons qu'un membre de l'espace peut lever ici :
 *  un doute d'IDENTITÉ, jamais une permission (RGPD/opposition/écarté) ni un
 *  fait de cycle de vie — même liste, côté client, que `contactRecommendationAuthorizableReasonSchema`. */
const AUTHORIZABLE_REASONS = new Set<ContactRecommendationAuthorizableReason>(['homonym_conflict', 'entity_mismatch'])

function asAuthorizableReason(reason: string | null | undefined): ContactRecommendationAuthorizableReason | null {
  return reason != null && AUTHORIZABLE_REASONS.has(reason as ContactRecommendationAuthorizableReason)
    ? (reason as ContactRecommendationAuthorizableReason)
    : null
}

/**
 * #2160.60 — « Autoriser la recommandation », sur la FICHE CONTACT seulement.
 *
 * N'apparaît QUE quand ce contact est actuellement écarté du classement du
 * compte pour un doute d'IDENTITÉ (`homonym_conflict` / `entity_mismatch`) —
 * jamais pour une permission (écarté, masqué) ni un fait de cycle de vie
 * (ex-employé), qui restent des portes qu'aucun geste d'ici ne lève. La raison
 * ACTUELLE vient du classement du compte ({@link useContactRanking}, déjà
 * chargé ailleurs dans l'app — même requête, mise en cache) : c'est la SEULE
 * source de vérité sur ce qui bloque ce contact aujourd'hui.
 *
 * Réversible : une fois autorisée, la carte montre la date et permet de
 * retirer l'autorisation — jamais un second statut, les trois colonnes
 * reviennent à `NULL` (voir `revokeRecommendationAuthorization`, service API).
 */
export function ContactRecommendationAuthorizationCard({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  const { data: ranking, isLoading } = useContactRanking(contact.account_id ?? '', {})
  const authorize = useAuthorizeContactRecommendation(contact.id)
  const revoke = useRevokeContactRecommendationAuthorization(contact.id)

  const authorizedReason = asAuthorizableReason(contact.recommendation_authorized_reason ?? null)
  const authorizedAt = contact.recommendation_authorized_at ?? null

  if (authorizedAt && authorizedReason) {
    const dateLabel = formatDate(authorizedAt, { day: 'numeric', month: 'long', year: 'numeric' })
    return (
      <Box className="mt-4">
        <Badge variant="outline" className="gap-1 border-[var(--bellum-success)] text-[var(--success-soft-text)]">
          <Unlock className="size-3" />
          {t('recommendationAuthorization.authorizedSince', {
            date: dateLabel,
            reason: t(`recommendationAuthorization.reason.${authorizedReason}`),
          })}
        </Badge>
        <Box className="mt-2">
          <Button size="sm" variant="ghost" isLoading={revoke.isPending} onClick={() => revoke.mutate()}>
            {t('recommendationAuthorization.revoke')}
          </Button>
        </Box>
      </Box>
    )
  }

  // Non autorisé : n'apparaît que si le classement du compte écarte ACTUELLEMENT
  // ce contact pour l'une des deux raisons overridables. Tant que le classement
  // n'a pas répondu, rien ne s'affiche — jamais un bouton qui disparaîtrait au
  // premier chargement réel.
  if (isLoading) return null
  const currentReason = asAuthorizableReason(ranking?.excluded.find(x => x.contact_id === contact.id)?.reason ?? null)
  if (!currentReason) return null

  return (
    <Box className="mt-4 rounded-md border border-border bg-card p-4">
      <Box display="flex" className="items-center gap-2">
        <ShieldQuestion className="size-4 text-[var(--warning-soft-text)]" />
        <Text element="h3" size="sm" weight="medium">
          {t('recommendationAuthorization.title')}
        </Text>
      </Box>
      <Text size="sm" color="text-muted-foreground" className="mt-2">
        {t(`recommendationAuthorization.reason.${currentReason}`)}
      </Text>
      <Button
        size="sm"
        variant="outline"
        className="mt-3"
        isLoading={authorize.isPending}
        onClick={() => authorize.mutate(currentReason)}
      >
        {t('recommendationAuthorization.action')}
      </Button>
    </Box>
  )
}
