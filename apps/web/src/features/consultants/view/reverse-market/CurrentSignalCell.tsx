import type { MarketSignalDate } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { Provenance } from '@/components/primitives/Provenance'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatMonth } from '@/lib/locale'

/**
 * #2288.1 — LE signal actuel d'un environnement compatible : une DATE et la
 * NATURE de sa source (jamais un fournisseur, GA-44) — jamais un chiffre nu.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2288.2 — DEUX NATURES DE DATE, ET ELLES NE SE LISENT PAS PAREIL
 * ─────────────────────────────────────────────────────────────────────────
 * Cette cellule ne décide RIEN : elle rend ce que le serveur a déjà tranché
 * (`decideMarketSignalDate`, `@bellum/contracts` — la seule fonction qui
 * tranche, GA-26). Ce qu'elle doit tenir, c'est que la GRANULARITÉ se lise :
 *
 * · `own` — mon espace a observé : le JOUR, tel qu'il est ;
 * · `shared` — l'observation vient d'ailleurs : le MOIS, et la cellule ÉCRIT
 *   « au mois près ». Sans cette mention, « août 2026 » se lit comme une date
 *   qu'on aurait arrondie par paresse, alors que c'est une date qu'on a
 *   floutée EXPRÈS : la date exacte, croisée avec l'entreprise et le fait,
 *   désignerait quel espace a observé — et deux espaces peuvent être
 *   concurrents (la raison de GA-43) ;
 * · rien — l'absence est NOMMÉE, jamais un zéro, jamais une date devinée.
 *
 * ⚠️ Un mois ILLISIBLE ne s'imprime pas. `formatMonth` rend `null` sur ce
 * qu'aucun calendrier ne sait lire : on nomme alors l'absence plutôt que de
 * recopier la valeur brute — même règle que `Provenance` tient sur les dates.
 */
export function CurrentSignalCell({ signal }: { signal: MarketSignalDate | null }) {
  const { t } = useTranslation('consultants')

  if (signal?.nature === 'own') {
    // #2288.2 — mon espace : la date EXACTE, telle qu'elle est.
    return <Provenance source="human" observedAt={signal.observedOn} detail={t('reverseMarket.compatible.signalOwn')} />
  }

  if (signal?.nature === 'shared') {
    // #2288.2 — ce qui vient d'ailleurs : le MOIS, et la granularité écrite.
    const month = formatMonth(signal.observedMonth)
    if (month) {
      return (
        <Box className="flex flex-col">
          <Text size="sm">{t('reverseMarket.compatible.signalShared', { month })}</Text>
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('reverseMarket.compatible.signalSharedGrain')}
          </Text>
        </Box>
      )
    }
  }

  return <UnknownValue reason={t('reverseMarket.compatible.currentSignalReason')} />
}
