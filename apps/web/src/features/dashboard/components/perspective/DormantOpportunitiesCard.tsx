import type { CockpitDormantOpportunity } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { CockpitSources } from './CockpitSources'
import { StructuralPotentialBadge } from './StructuralPotentialBadge'
import type { CockpitProvenance } from '@bellum/contracts'

/**
 * « Bellum a retrouvé des opportunités à réveiller » (#1407, 2e section).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SEULE RÈGLE DE CE BLOC
 * ─────────────────────────────────────────────────────────────────────────────
 * La dernière ligne du retour : « Ne jamais inventer une relation passée :
 * source + date obligatoires ». Tout le reste en découle.
 *
 * Chaque carte affiche donc ses PREUVES — un profil poussé, un contact connu,
 * un échange, un besoin ouvert — chacune avec sa date, telles que la base les
 * porte. Aucune phrase n'est générée : ce qui est écrit est ce qui est stocké.
 * Un compte sans preuve datée ne figure pas ici, même s'il est silencieux : un
 * silence sans passé n'est pas une opportunité endormie, c'est un compte dont
 * on ne sait rien.
 *
 * ⚠️ Le signal récent est FACULTATIF, et son absence se dit. Il aurait été
 * facile d'écrire « un nouveau besoin vient d'apparaître » sur chaque carte —
 * c'est l'exemple du retour, et c'est précisément le genre de phrase qui rend
 * un produit invendable la première fois qu'un client vérifie. Sans signal, la
 * raison affichée EST le silence, avec sa durée.
 *
 * ⚠️ « Dormant » n'est pas un état de cycle de vie ici : cette valeur-là est une
 * décision produit PARQUÉE, et la dériver reviendrait à la trancher en passant.
 * C'est un croisement, et il se relit dans le service.
 */
export function DormantOpportunitiesCard({
  opportunities,
  provenance,
}: {
  opportunities: CockpitDormantOpportunity[]
  provenance: CockpitProvenance
}) {
  const { t, i18n } = useTranslation('dashboard')
  if (opportunities.length === 0) return null

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })

  return (
    <section
      aria-label={t('perspective.dormant.title')}
      className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text element="h2" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('perspective.dormant.title')}
        </Text>
      </div>

      <ul className="mt-3 space-y-3">
        {opportunities.map(item => {
          const name = item.company_name ?? t('perspective.unnamedAccount')
          return (
            <li key={item.account_id} className="rounded-lg border border-[var(--bellum-border)] p-3">
              <div className="flex items-start gap-3">
                <CompanyAvatar name={name} logoUrl={item.logo_url ?? null} website={item.website ?? null} />
                <div className="min-w-0 flex-1">
                  {/* #1574.1 — LE POTENTIEL STRUCTUREL, À CÔTÉ DU NOM, PAS DANS LA RAISON.
                      La raison dit l'état de la RELATION (un signal, ou la durée du
                      silence) ; ce badge dit un POTENTIEL observé sur le marché. Les
                      mélanger ferait lire l'observation comme une raison d'agir — très
                      exactement ce que le retour interdit (« ne jamais transformer cette
                      mémoire en prétexte automatique pour contacter le client »).
                      Le composant est celui du bloc « Ma couverture » (#1573.4) : deux
                      copies auraient fini par dire deux choses. */}
                  <div className="flex min-w-0 items-center gap-2">
                    <Text size="sm" weight="medium" className="truncate text-[var(--bellum-text-primary)]">
                      {name}
                    </Text>
                    {/* ⚠️ `?? null` et pas seulement `??` : le champ est ABSENT d'une API
                        plus ancienne que le web, et le lire sans garde casserait la carte
                        pendant toute la durée du déploiement. */}
                    {(item.market_paths ?? null) !== null && (
                      <StructuralPotentialBadge companyName={name} count={item.market_paths as number} />
                    )}
                  </div>

                  {/* LA RAISON EXACTE, et rien d'autre. Un signal quand il y en
                      a un ; sinon, la durée du silence — jamais un événement
                      inventé pour rendre la carte plus attirante. */}
                  <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
                    {item.new_signal
                      ? t('perspective.dormant.reasonSignal', {
                          signal: item.new_signal.label,
                          date: formatDate(item.new_signal.detected_at),
                        })
                      : item.last_interaction_at
                        ? t('perspective.dormant.reasonSilence', { date: formatDate(item.last_interaction_at) })
                        : t('perspective.dormant.reasonNeverExchanged')}
                  </Text>

                  {/* Les preuves — source ET date, comme le retour l'exige.
                      ⚠️ UNE LIGNE PAR PREUVE, ET ELLE SE TRONQUE. La première
                      version les rendait en pastilles arrondies : une forme qui
                      promet deux ou trois mots. Les libellés du dépôt sont des
                      analyses entières, et la recette du 04/09 a montré des
                      pastilles de CINQ LIGNES — une bulle qui fait la moitié de
                      la carte ne se lit plus comme une étiquette. Le serveur les
                      borne désormais ; ici on cesse de promettre une forme
                      courte, et `truncate` tient le cas restant (un libellé
                      borné reste long sur un écran étroit). */}
                  <ul className="mt-2 space-y-0.5">
                    {item.evidence.map(evidence => (
                      <li key={`${evidence.kind}-${evidence.occurred_at}`} className="min-w-0">
                        <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
                          {t(`perspective.dormant.evidence.${evidence.kind}`, {
                            label: evidence.label ?? '',
                            date: formatDate(evidence.occurred_at),
                          })}
                        </Text>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Link
                      to="/accounts/$id"
                      params={{ id: item.account_id }}
                      className="text-sm font-medium text-[var(--bellum-text-accent)] hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
                    >
                      {t('perspective.dormant.why')}
                    </Link>
                    {/* #1574.2 — DEUX CTA, JAMAIS LES DEUX.
                        `new_signal` porte une information STRUCTURELLE sur
                        l'entreprise (ex. « Levée de fonds ») — pas un fait de
                        la relation. Elle demande d'abord une QUALIFICATION :
                        « Vérifier maintenant ». Sans signal, la seule matière
                        est la relation passée elle-même (l'`evidence`
                        au-dessus) : il y a de quoi préparer une reprise,
                        « Préparer la reprise ». Les deux passent par le MÊME
                        point d'entrée vers Laura (D44) — seuls le libellé et
                        la question changent. */}
                    {item.new_signal ? (
                      <AskLaura
                        label={t('perspective.dormant.verify')}
                        question={t('perspective.dormant.verifyQuestion', {
                          company: name,
                          signal: item.new_signal.label,
                        })}
                        accountId={item.account_id}
                      />
                    ) : (
                      <AskLaura
                        label={t('perspective.dormant.prepare')}
                        question={t('perspective.dormant.prepareQuestion', { company: name })}
                        accountId={item.account_id}
                      />
                    )}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <CockpitSources provenance={provenance} />
    </section>
  )
}
