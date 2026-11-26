import type { RenewalStatus } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'

/**
 * OÙ EN EST LA RECONDUCTION — à un seul endroit, tableau ET panneau (#2195.20).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE COMPOSANT EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La même leçon que `MissionDeadline` et `MissionRisks`, payée le 03/09/2026 :
 * une valeur rendue dans la cellule d'un tableau ET ailleurs finit par exister
 * en deux versions, et la seconde reste en retard d'un déploiement. Le libellé
 * d'un statut vit donc ici, et nulle part ailleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, ET C'EST TOUT LE SUJET
 * ─────────────────────────────────────────────────────────────────────────────
 *  · la clé ABSENTE — l'API est plus ancienne que ce code (le web se déploie
 *    une dizaine de minutes avant elle). On dit « non lu », avec sa raison ;
 *  · `null` — personne n'a encore ouvert cette ligne. On dit « non renseigné » ;
 *  · une valeur — quelqu'un a posé un constat. On le nomme.
 *
 * ⚠️ `null` n'est PAS `non_engage`. Les replier l'un sur l'autre ferait dire à
 * l'écran « rien n'est engagé » sur une ligne que personne n'a regardée — un
 * constat inventé, c'est-à-dire « non mesuré » rendu comme une mesure.
 *
 * ⚠️ Aucune couleur ne classe ces huit valeurs sur une échelle de bonne ou
 * mauvaise nouvelle : ce serait retomber dans le pronostic que #2195.25 refuse.
 * Seule la CLÔTURE se distingue — une ligne décidée n'attend plus rien, et
 * c'est un fait, pas un pronostic.
 */
export function MissionRenewalStatus({ status }: { status: RenewalStatus | null | undefined }) {
  const { t } = useTranslation('missions')

  if (status === undefined) {
    return <UnknownValue reason={t('renewals.status.unread')} />
  }
  if (status === null) {
    // Volontairement PAS un `UnknownValue` : « non renseigné » n'est pas une
    // mesure impossible, c'est une ligne que personne n'a encore ouverte — et
    // c'est une invitation, pas un défaut de donnée.
    return (
      <Text element="span" size="sm" color="text-muted-foreground">
        {t('renewals.status.none')}
      </Text>
    )
  }

  return (
    <Text element="span" size="sm">
      {t(`renewals.status.values.${status}`)}
    </Text>
  )
}
