import { MARKET_OBSERVATION_MIN_PERSONS, matchingExpertises } from '@bellum/contracts'
import { Badge, Card, CardContent, Text } from '@bellum/ui'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'

/**
 * #1611 — LES ANGLES QUE L'ENVIRONNEMENT OBSERVÉ CORROBORE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CORRECTION QUE LE RETOUR APPORTE, ET QUI COMMANDE TOUT LE RESTE
 * ─────────────────────────────────────────────────────────────────────────────
 * « NE PAS implémenter : “PHP absent de la stack observée ⇒ angle PHP écarté”.
 * Même avec 10 ou 25 technologies observées, l'absence dans un échantillon ne
 * prouve pas que la technologie est absente de l'entreprise. »
 *
 * **La mémoire marché ne peut donc JAMAIS produire un NO-GO par absence.** C'est
 * « non mesuré n'est pas zéro » appliqué à un échantillon, et c'est la raison
 * pour laquelle cette carte ne sait faire qu'une chose : RENFORCER. Elle
 * n'affaiblit rien, n'écarte rien, et ne mentionne même pas ce qui n'est pas
 * corroboré — une expertise absente de cette liste ne dit rien du tout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX MOITIÉS, ET CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 *  · les expertises DÉCLARÉES par l'ESN (`useEsnProfile`) ;
 *  · l'environnement OBSERVÉ du compte — qui **n'existait pas sur le dossier**
 *    avant #1607.2 : `coverageFor` le calculait, la façade le jetait.
 *
 * L'appariement est `matchingExpertises` (`@bellum/contracts`), et il vit à un
 * seul endroit. ⚠️ **Ne jamais en écrire un second ici** : c'est là que `C#` et
 * `Go` se font jeter comme des mots courts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ACTION PROPOSÉE PEUT ÊTRE, ET CE QU'ELLE NE PEUT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Mémoire marché SEULE ⇒ **action de VÉRIFICATION** (« vérifier si l'équipe
 * travaille avec des externes »), jamais une action commerciale. Une
 * corroboration structurelle n'est pas une preuve actuelle : la distinction se
 * lit dans le libellé, pas dans un drapeau invisible.
 */

/** Combien d'expertises corroborées la carte nomme. Trois : au-delà, ce n'est
 *  plus un angle, c'est le catalogue de l'ESN. */
const MAX_REINFORCED = 3

/**
 * #1611.3 — LE TROISIÈME ÉTAT : « PEU DE CORROBORATION », NI PLEIN NI MUET.
 *
 * La correspondance était BINAIRE — soit le renforcement plein, soit rien — et
 * la cause n'était pas ici : la façade de l'API jetait le comptage
 * (`.map(entry => entry.techno)`). `observed_stack_detail` le rend maintenant.
 *
 * ⚠️ Le seuil ne s'invente pas pour l'occasion. `MARKET_OBSERVATION_MIN_PERSONS`
 * est le PLANCHER d'existence d'une observation : sous lui, la ligne n'entre pas
 * dans le corpus. Une expertise vue EXACTEMENT au plancher est donc la
 * corroboration la plus faible qui puisse exister ; au-dessus, elle renforce.
 * Aucun nombre nouveau n'entre dans le produit (GA-26).
 *
 * ⚠️ Et « faible » ne dit RIEN CONTRE l'expertise. C'est le même interdit que la
 * carte entière : l'absence dans un échantillon ne prouve pas l'absence dans
 * l'entreprise, et « peu » n'est pas « pas ».
 */
function corroborationStrength(
  expertise: string,
  detail: { techno: string; persons: number }[] | undefined,
): 'strong' | 'weak' {
  // Sans le champ neuf (API antérieure), on ne DEGRADE rien : le comportement
  // d'avant était muet sur ce cas, pas faux.
  if (!detail) return 'strong'
  const matched = detail.filter(entry => matchingExpertises([entry.techno], [expertise]).length > 0)
  if (matched.length === 0) return 'strong'
  return matched.some(entry => entry.persons > MARKET_OBSERVATION_MIN_PERSONS) ? 'strong' : 'weak'
}

export function ReinforcedAnglesCard({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accountDetail')
  const { data: marketContext } = useAccountMarketContext(accountId, true)
  const { data: esnAnswers } = useEsnProfile()

  const observed = marketContext?.observed_stack ?? []
  const expertises = esnAnswers?.expertise_areas ?? []
  const corroborated = matchingExpertises(observed, expertises).slice(0, MAX_REINFORCED)

  // Trois silences, un seul rendu : pas de profil déclaré, pas de couverture, ou
  // aucune corroboration. « Si aucune corroboration : ne rien conclure. »
  if (corroborated.length === 0) return null

  const detail = marketContext?.observed_stack_detail
  const strong = corroborated.filter(e => corroborationStrength(e, detail) === 'strong')
  const weak = corroborated.filter(e => corroborationStrength(e, detail) === 'weak')

  // Tout au plancher : on le DIT, au lieu de renforcer ce qui ne l'est pas.
  // Un seul message — afficher les deux écrirait deux verdicts sur la même
  // donnée, et c'est le lecteur qui trancherait au hasard.
  if (strong.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[var(--bellum-text-muted)]" aria-hidden />
            <Text size="sm" weight="semibold">
              {t('reinforced.weak', { expertises: weak.join(', ') })}
            </Text>
          </div>
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('reinforced.weakWhy')}
          </Text>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
          <Text size="sm" weight="semibold">
            {t('reinforced.title')}
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          {strong.map(expertise => (
            <Badge key={expertise} variant="outline" className="px-2 py-0.5 text-xs font-normal">
              {expertise}
            </Badge>
          ))}
        </div>
        {/* Le POURQUOI est affiché, toujours : un angle renforcé sans sa raison
            se suit une fois, puis ne se suit plus. */}
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('reinforced.why')}
        </Text>
        {/* ⚠️ Une action de VÉRIFICATION, pas une action commerciale : la
            corroboration est structurelle, elle ne prouve aucune intervention
            actuelle. */}
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('reinforced.action')}
        </Text>
      </CardContent>
    </Card>
  )
}
