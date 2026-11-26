import type { OpenNeedRow } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Coins } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatCents } from '@/lib/money'
import { PropagatedBlock } from '@/features/propagation/PropagatedBlock'
import { usePropagationDigest } from '@/features/propagation/api'
import { useAccountRate } from '@/features/propagation/hooks'

/**
 * « TARIF CIBLE vs TARIF VENDU MOYEN CHEZ CE CLIENT » (PDF-02 du 26/08, §4.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Un commercial qui qualifie un besoin à 560 € ne savait pas que ce client-là
 * achète à 620 € en moyenne — ni l'inverse. Les deux moitiés existaient et ne se
 * rencontraient nulle part : le tarif cible est une colonne de `project_needs`,
 * le tarif vendu moyen est servi par `GET /delivery/propagation` depuis le
 * 28/08. Il manquait l'écran qui les met côte à côte, parce que le besoin
 * n'avait aucune fiche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ SIX ÉTATS, ET AUCUN N'EST « 0 € »
 * ─────────────────────────────────────────────────────────────────────────────
 * La question à se poser sur chaque chiffre est celle du dépôt : *si cette
 * valeur est absente, « 0 » est-il VRAI ?* Ici, jamais. Un client sans mission
 * chiffrée n'achète pas « à 0 € », il n'a simplement pas d'historique de prix ;
 * un besoin sans TJM cible n'est pas un besoin gratuit, personne n'a communiqué
 * le budget. Les six états se disent donc chacun avec ses mots :
 *
 *  1. **la lecture court** — on ne sait pas ENCORE. Un « aucune mission »
 *     affiché pendant le chargement est un zéro déguisé : il se lit comme un
 *     fait et il est faux une seconde sur deux.
 *  2. **la lecture a échoué** — « cassé » et « ce client n'a jamais rien
 *     acheté » se ressemblent trop pour partager une phrase.
 *  3. **le besoin n'a pas de compte** — il n'y a personne chez qui comparer.
 *  4. **le compte n'a aucune mission** — pas d'historique de prix. C'est l'état
 *     du prospect, et c'est une vraie réponse.
 *  5. **des missions, aucune chiffrée** — un forfait ne porte pas de TJM. La
 *     moyenne ne se calcule pas ; elle ne vaut pas zéro.
 *  6. **les deux chiffres** — et alors seulement l'ÉCART, qui est ce que le §4.2
 *     demande vraiment.
 *
 * ⚠️ L'écart ne dit pas si c'est BIEN ou MAL. « Ton tarif cible est 60 € sous ce
 * que ce client paye d'habitude » est un fait ; « tu te vends trop bas » serait
 * un jugement que rien ne fonde — le besoin peut être plus junior, plus court,
 * ou d'une autre nature que les missions déjà vendues. On rend l'écart, le
 * commercial rend l'arbitrage.
 *
 * ⚠️ Le tarif vendu moyen passe par {@link PropagatedBlock} : un bloc propagé
 * porte un lien vers sa source et ne s'édite jamais sur place (§4.4, GA-59). Il
 * se corrige dans les MISSIONS, jamais ici.
 */
export function NeedRateComparison({ need }: { need: OpenNeedRow }) {
  const { t } = useTranslation('projects')
  // ⚠️ Le MÊME hook que {@link SoldLine}, et pas un second calcul : les deux
  // lisent la même entrée de cache (`propagationKeys.digest()`), donc une seule
  // requête réseau et une seule indexation. Recopier `accountPropagationById`
  // ici en ferait une deuxième définition, qui dériverait.
  const rate = useAccountRate(need.account_id || undefined)

  const target = need.target_tjm_cents
  const sold = rate?.averageSoldDailyRateCents ?? null

  return (
    <section
      className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3"
      aria-labelledby="need-rate-comparison-title"
      data-testid="need-rate-comparison"
    >
      <div className="flex items-start gap-3">
        <Coins className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <Text element="h3" size="sm" weight="semibold" id="need-rate-comparison-title">
            {t('needSheet.rate.title')}
          </Text>

          {/* LE TARIF CIBLE. Absent, il se DIT — « – » suffit dans une colonne
              de tableau qui en porte dix-huit, pas dans un bloc dont c'est le
              sujet : le lecteur doit savoir que personne ne l'a communiqué,
              pas croire à un défaut d'affichage. */}
          <Text size="sm" className="mt-1 text-[var(--bellum-text-primary)]">
            {target === null
              ? t('needSheet.rate.targetUnknown')
              : t('needSheet.rate.target', { amount: formatCents(target) })}
          </Text>

          <SoldLine need={need} />

          {/* L'ÉCART — seulement quand les deux chiffres existent. Le calculer
              contre une absence produirait un nombre qui ressemble à une mesure. */}
          {target !== null && sold !== null && rate ? (
            <Text size="sm" weight="medium" className="mt-1 text-[var(--bellum-text-primary)]">
              {target === sold
                ? t('needSheet.rate.gapNone')
                : target > sold
                  ? t('needSheet.rate.gapAbove', { amount: formatCents(target - sold) })
                  : t('needSheet.rate.gapBelow', { amount: formatCents(sold - target) })}
            </Text>
          ) : null}
        </div>
      </div>
    </section>
  )
}

/**
 * Le tarif vendu moyen, ou la phrase qui dit pourquoi il n'y en a pas.
 *
 * Extrait parce que c'est là que vivent cinq des six états : les garder dans le
 * rendu principal ferait un arbre de ternaires que personne ne relit, et c'est
 * exactement le genre d'endroit où un `?? 0` finit par apparaître.
 */
function SoldLine({ need }: { need: OpenNeedRow }) {
  const { t } = useTranslation('projects')
  const digest = usePropagationDigest()
  const rate = useAccountRate(need.account_id ?? undefined)

  // 3 — le besoin ne pend d'aucun compte : il n'y a personne chez qui comparer.
  // Testé AVANT le chargement : cette réponse-là ne dépend d'aucune lecture.
  // #2558.1 — le compte ne peut plus MANQUER dans le contrat (il a remplacé
  // `project_id NOT NULL`). La garde reste, sur une chaîne VIDE : une charge
  // malformée se dit, elle ne se comble pas par une comparaison inventée.
  if (!need.account_id) return <Muted>{t('needSheet.rate.noAccount')}</Muted>
  // 1 — on ne sait pas ENCORE. Un « aucune mission » pendant le chargement est
  // un zéro déguisé.
  if (digest.isPending) return <Muted>{t('needSheet.rate.loading')}</Muted>
  // 2 — la lecture a échoué. Distinct de « rien à comparer ».
  if (digest.isError) return <Muted>{t('needSheet.rate.failed')}</Muted>
  // 4 — le serveur ne rend AUCUNE ligne pour un compte sans mission
  // (`missions` est `positive()`). C'est l'état du prospect, et c'est vrai.
  if (!rate) return <Muted>{t('needSheet.rate.noMission')}</Muted>
  // 5 — des missions, aucune chiffrée. La moyenne ne se calcule pas ; elle ne
  // vaut pas zéro. Le nombre de missions, lui, est mesuré : il se dit.
  if (rate.averageSoldDailyRateCents === null) {
    return <Muted>{t('needSheet.rate.soldUnmeasured', { count: rate.missions })}</Muted>
  }

  // 6 — le chiffre, et son lien vers les missions qui le composent.
  return (
    <Text size="sm" className="mt-0.5 text-[var(--bellum-text-primary)]">
      <PropagatedBlock source={rate.source}>
        {t('needSheet.rate.sold', {
          amount: formatCents(rate.averageSoldDailyRateCents),
          count: rate.missions,
        })}
      </PropagatedBlock>
      {/* La moitié qu'on oublie de montrer : une moyenne muette sur ce qu'elle
          ignore se lit comme une mesure complète. */}
      {rate.missionsWithoutRate > 0
        ? ` · ${t('needSheet.rate.someWithoutRate', { count: rate.missionsWithoutRate })}`
        : ''}
    </Text>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <Text size="sm" className="mt-0.5 text-[var(--bellum-text-secondary)]">
      {children}
    </Text>
  )
}
