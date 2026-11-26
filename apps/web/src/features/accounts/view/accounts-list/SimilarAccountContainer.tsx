import type { SimilarAccountSuggestion, SimilarityHeadline, SimilarityReason } from '@bellum/contracts'
import { Badge, Card, Text } from '@bellum/ui'
import { compactSector } from '@bellum/utils'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, SquareDashedMousePointer } from 'lucide-react'
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { useSimilarAccountsToExplore } from '@/features/accounts/hooks/useSimilarAccountsToExplore'
import {
  describeSimilarHeadline,
  headlineNamesAnAccount,
  type SimilarHeadlineDisplay,
} from '@/features/accounts/model/similarHeadline'
import { describeSimilarProximity } from '@/features/accounts/model/similarProximity'
import { SimilarAxesText } from '@/features/accounts/view/SimilarAxesText'
import { shouldNameSeedBase, similarSeedCount } from '@/features/accounts/model/similarSeedBase'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'

/**
 * #1316.5 — « le bloc actuel est trop étroit et coupé ».
 *
 * Le serveur en rend jusqu'à DIX, et la colonne fait 288 px : les sept
 * dernières vivaient dans un défilement interne qui concurrençait celui du
 * tableau — deux ascenseurs verticaux imbriqués, la cause racine déjà payée
 * sur cet écran. Le retour donne lui-même la sortie : « afficher seulement
 * 2–3 recommandations bien présentées puis un CTA ».
 *
 * Trois, et le reste s'ouvre SUR PLACE : envoyer vers un écran « toutes les
 * suggestions » qui n'existe pas aurait été inventer une destination.
 */
const VISIBLE_SUGGESTIONS = 3

export const SimilarAccountContainer = () => {
  const { t } = useTranslation('accounts')
  const { data: similarCompanies = [], isLoading: isLoadingSimilarCompanies, isError } = useSimilarAccountsToExplore()
  const [expanded, setExpanded] = useState(false)
  // Sur quoi la carte est BÂTIE (D24). Sous trois comptes analysés, ce n'est pas
  // un voisinage de portefeuille : c'est le prolongement d'un seul compte, et le
  // titre de la carte promet davantage.
  const seedCount = similarSeedCount(similarCompanies)

  return (
    <Card className="overflow-hidden p-4">
      <div className="mb-3 flex items-center gap-2">
        <SquareDashedMousePointer className="size-3.5 text-[var(--bellum-text-accent)] dark:text-[var(--bellum-text-accent)]" />
        <Text size="sm" weight="semibold">
          {t('sidebar.similarTitle')}
        </Text>
      </div>
      {isLoadingSimilarCompanies ? (
        <Text size="xs">{t('sidebar.similarLoading')}</Text>
      ) : isError ? (
        // #3666.k — une lecture en échec n'est pas « aucun compte similaire ».
        <QueryLoadError />
      ) : similarCompanies.length === 0 ? (
        <Text size="xs">{t('sidebar.similarEmpty')}</Text>
      ) : (
        <>
          {shouldNameSeedBase(seedCount) ? (
            <Text size="xs" className="mb-2 text-[var(--bellum-text-muted)]">
              {t('sidebar.similarSeedBase', { count: seedCount })}
            </Text>
          ) : null}
          <ul className="min-w-0 space-y-1">
            {(expanded ? similarCompanies : similarCompanies.slice(0, VISIBLE_SUGGESTIONS)).map(company => (
              <SimilarCompanyListItem key={company.id} company={company} />
            ))}
          </ul>
          {/* #1316.5 — le reste s'ouvre ici plutôt que de se cacher dans un
              défilement. Un `<button>`, pas un `<div onClick>` : ça se tabule,
              ça répond à Entrée, et un lecteur d'écran l'annonce (GA-35). */}
          {similarCompanies.length > VISIBLE_SUGGESTIONS && (
            <button
              type="button"
              onClick={() => setExpanded(open => !open)}
              className="mt-2 w-full rounded-lg px-2 py-1.5 text-left text-xs text-[var(--bellum-text-accent)] transition-colors hover:bg-[color-mix(in_srgb,var(--bellum-text-primary)_4%,transparent)]"
            >
              {expanded
                ? t('sidebar.similarShowLess')
                : t('sidebar.similarShowAll', { count: similarCompanies.length - VISIBLE_SUGGESTIONS })}
            </button>
          )}
        </>
      )}
    </Card>
  )
}

const SimilarCompanyListItem = ({ company }: { company: SimilarAccountSuggestion }) => {
  const navigate = useNavigate()
  const { t } = useTranslation('accounts')

  return (
    <li>
      {/* #1415 — « CTA compact : Analyser ».
          UN SEUL élément interactif, et c'est la ligne entière. Poser un
          bouton « Analyser » DANS le bouton de la ligne serait du HTML
          invalide et rendrait le clic sur la zone commune indéterminé — le
          défaut déjà payé sur cet écran avec l'aperçu du signal (#1416). Le
          nom accessible dit donc le GESTE (« Analyser Untel »), et la pastille
          « Analyser » à droite est la trace visible du même geste. Elle
          remplace la flèche qui n'apparaissait QU'AU SURVOL : au doigt, rien
          n'annonçait ce que la ligne allait faire. */}
      <button
        type="button"
        aria-label={t('sidebar.similarAnalyseAria', { company: company.company_name })}
        onClick={() => navigate({ to: '/search', search: { company: company.company_name } })}
        className="group flex w-full min-w-0 flex-col gap-1 overflow-hidden rounded-lg p-2 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-[color-mix(in_srgb,var(--bellum-text-primary)_4%,transparent)] active:scale-[0.99] pointer-coarse:min-h-11"
      >
        <div className="flex w-full min-w-0 items-start gap-3">
          <CompanyAvatar name={company.company_name} size="md" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <Text size="xs" weight="semibold" noWrap className="truncate text-[var(--bellum-text-primary)]">
                {company.company_name}
              </Text>
            </div>
            <div className="mt-1 flex max-w-full min-w-0 items-center gap-1.5 overflow-hidden">
              <Badge
                variant="outline"
                className="min-w-0 max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium text-[var(--bellum-text-secondary)]"
                title={company.sector}
              >
                {/* #1315.3 — le secteur LISIBLE ; la chaîne d'enrichissement
                  complète reste en infobulle sur la pastille. */}
                <span className="block max-w-[140px] truncate">{compactSector(company.sector)}</span>
              </Badge>
              {/* #1415 — « localisation ». Elle voyageait déjà, collée au secteur
                dans `description` : la carte affichait donc le secteur DEUX
                fois (pastille + phrase) et la ville se perdait entre les deux.
                Muette quand le registre ne la publie pas — jamais « — », qui
                ferait croire à une entreprise sans adresse. */}
              {company.city ? (
                <Text
                  size="xs"
                  noWrap
                  className="min-w-0 truncate text-[var(--bellum-text-muted)]"
                  title={company.city}
                >
                  {company.city}
                </Text>
              ) : null}
            </div>
          </div>
          <span className="mt-0.5 flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--bellum-text-accent)_12%,transparent)] px-2 py-0.5 text-xs font-medium text-[var(--bellum-text-accent)]">
            {t('sidebar.similarAnalyse')}
            <ArrowRight className="size-3" aria-hidden />
          </span>
        </div>
        {/* #1576 — LA RAISON PREND LA LARGEUR DE LA CARTE, ET PAS CELLE DE LA
            COLONNE DU MILIEU.
            Mesuré en production le 08/09/2026 : entre l'avatar et la pastille
            « Analyser », il restait **91 px** — et « Ressemble à NOVA LOGISTIQUE
            (client d'exemple), où tu as gagné une mission » y tenait sur SIX
            lignes, 112 px de haut, contre 110 px pour la carte entière d'à côté.
            Un nom de compte est du texte LIBRE : sa longueur n'est bornée par
            rien, et une phrase qui le cite ne peut pas vivre dans une gouttière.
            Elle sort donc de la colonne du milieu et passe sous la ligne, en
            pleine largeur (248 px mesurés).

            #1415 — la phrase `description` reste PARTIE de cette carte : le
            serveur la fabrique avec `buildSuggestionDescription(city, sector,
            seed)`, c'est-à-dire exactement les deux faits que la ligne du haut
            affiche déjà, chacun à sa place (loi 4 du tome 7). Le champ est
            intact côté API — les trois autres écrans qui le lisent ne bougent
            pas. */}
        <SimilarProximityLine
          scoreSimilarity={company.score_similarity}
          reasons={company.similarity_reasons}
          unevaluated={company.similarity_unevaluated}
          headline={company.similarity_headline}
        />
      </button>
    </li>
  )
}

/**
 * Pourquoi ce compte est proposé (critère d'acceptation §4 : « les comptes
 * recommandés expliquent systématiquement la proximité avec le profil
 * utilisateur »). Trois états seulement, et le troisième est un aveu : quand
 * aucun critère du profil n'a matché, la carte le DIT et propose de compléter le
 * profil, plutôt que de laisser croire à une recommandation personnalisée.
 */
function SimilarProximityLine({
  scoreSimilarity,
  reasons,
  unevaluated,
  headline,
}: {
  scoreSimilarity?: number
  reasons?: SimilarityReason[]
  /** #2040.18 — les axes que le questionnaire n'a pas rendus évaluables. */
  unevaluated?: SimilarityReason[]
  headline?: SimilarityHeadline
}) {
  const { t } = useTranslation('accounts')
  // #2040.18 — les critères matchés tranchent quand le scalaire se tait : sous
  // trois axes évaluables, le serveur ne publie plus de score.
  const proximity = describeSimilarProximity(scoreSimilarity, reasons)
  const matched = proximity !== 'seed'
  // #1576 / #1632 — UNE SEULE raison par carte, la plus forte disponible, et
  // elle nomme toujours le compte de référence. L'ordre vit dans le modèle.
  const display = describeSimilarHeadline(headline, matched)
  const strong = display.kind === 'twin' || display.kind === 'tech' || matched

  return (
    <div className="space-y-0.5">
      <Text
        size="xs"
        // i18n keys: sidebar.similarWhyStrong | sidebar.similarWhyPartial | sidebar.similarWhySeed
        title={t(matched ? 'sidebar.similarWhyTooltip' : 'sidebar.similarWhySeedTooltip')}
        className={
          strong
            ? 'text-[var(--bellum-text-accent)] dark:text-[var(--bellum-text-accent)]'
            : 'text-[var(--bellum-text-muted)]'
        }
      >
        <SimilarHeadlineText display={display} proximity={proximity} />
      </Text>
      {/* Les critères NOMMÉS, quand le serveur les expose (SIM-01). « Proche de
          ta cible » sans dire pourquoi se lit comme une formule ; « même secteur
          que tes cibles · dans ta zone » se vérifie d'un coup d'œil. Une réponse
          antérieure au champ n'affiche simplement pas cette ligne.

          ⚠️ Muette dès qu'une raison NOMME un compte : deux phrases sous une
          carte de 288 px, c'est deux raisons — et le retour n'en veut qu'une. */}
      {/* #2040.18 — ce qui n'a pas pu être évalué est NOMMÉ, sur la MÊME ligne
          que les critères matchés : « tu ne l'as pas dit » n'est pas « ça ne
          matche pas ». La ligne est partagée avec le panneau « Similaires » de
          Découvrir (`SimilarAxesText`) — une seule dérivation, un seul libellé. */}
      {!headlineNamesAnAccount(display) && <SimilarAxesText reasons={reasons} unevaluated={unevaluated} />}
    </div>
  )
}

/**
 * La phrase elle-même. Le nom du compte de référence est en GRAS, rien d'autre
 * (#1576) — d'où le `<Trans>` : une chaîne concaténée sortirait de l'i18n et
 * mettrait la ponctuation française au mauvais endroit dans l'autre langue.
 */
export function SimilarHeadlineText({
  display,
  proximity,
}: {
  display: SimilarHeadlineDisplay
  proximity?: 'strong' | 'partial' | 'seed'
}) {
  const { t } = useTranslation('accounts')

  if (display.kind === 'twin' || display.kind === 'sector') {
    return (
      <Trans
        t={t}
        // i18n keys: sidebar.similarHeadlineTwin | sidebar.similarHeadlineSector
        i18nKey={display.kind === 'twin' ? 'sidebar.similarHeadlineTwin' : 'sidebar.similarHeadlineSector'}
        values={{ account: display.account }}
        components={{ account: <span className="font-semibold" /> }}
      />
    )
  }

  if (display.kind === 'tech') {
    return (
      <Trans
        t={t}
        i18nKey="sidebar.similarHeadlineTech"
        values={{ account: display.account, technologies: display.technologies.join(', ') }}
        components={{ account: <span className="font-semibold" /> }}
      />
    )
  }

  // Le comportement d'avant ce lot, mot pour mot.
  return (
    <>{t(`sidebar.similarWhy${proximity === 'strong' ? 'Strong' : proximity === 'partial' ? 'Partial' : 'Seed'}`)}</>
  )
}
