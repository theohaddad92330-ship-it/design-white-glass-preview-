import { contactsSurfaceWidening, orgHasHierarchyEdges, type OrgCoverageHeader } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { SurfaceWideningNotice } from '@/features/discover/view/WideningNotice'
import { formatCount } from '@/lib/locale'

/**
 * CE QUE BELLUM CONNAÎT DU COMPTE — le bandeau, à UN seul endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL A SON PROPRE FICHIER
 * ─────────────────────────────────────────────────────────────────────────
 * Il vivait DANS `FocalOrgView`. Les trois vues commutables du 31/08/2026
 * (Groupe, Hiérarchie, Édition) l'affichent toutes — la maquette Groupe en fait
 * même sa rangée de cinq chiffres. Le recopier trois fois, c'est reproduire
 * exactement le défaut que D278 a corrigé le 30/08 : six compteurs recomptés à
 * la main, dont deux faux, pendant que le contrat en portait la dérivation.
 *
 * Ce composant ne CALCULE rien. Il reçoit `OrgCoverageHeader` — la forme que
 * `deriveOrgCoverage` produit — et se contente de la rendre. C'est le sens de
 * « une dérivation vit à un seul endroit » appliqué à un écran : la dérivation
 * est au contrat, sa LECTURE est ici, et il n'y a pas de troisième copie.
 *
 * ⚠️ Chaque compteur sait être INCONNU. `attachedToEntity` est un trou NOMMÉ du
 * contrat (le rattachement est produit par la classification, jamais par la
 * découverte) : absent, il ne s'affiche pas (#4075), jamais « 0 ». Les
 * dénombrements du graphe (liens, zones), eux, ne passent jamais par cette
 * branche — « zéro lien vérifié » est VRAI et s'écrit 0.
 */
export function OrgCoverageBanner({ coverage }: { coverage: OrgCoverageHeader }) {
  const { t } = useTranslation('accountOrg')
  // #4433.9 — peu de décideurs : la passe d'élargissement (titres retirés, bande de séniorité) se DIT, avec le
  // bandeau de Découvrir. Elle a déjà eu lieu côté serveur : pas de geste ici. Sans apport, rien.
  const widening = contactsSurfaceWidening(coverage.widened)
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        role="group"
        aria-label={t('focal.coverageAria')}
        className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1"
      >
        {/* Le dossier peut porter des contacts que le graphe ne référence pas :
          « 0 découvert » se lirait « ce compte est vide », ce qui est une autre
          affirmation. */}
        <CoverageCount value={coverage.discovered} label={t('focal.coverage.discovered')} />
        {/* Le trou NOMMÉ du contrat : le rattachement à une entité est produit par
          la classification, jamais par la découverte. Le compter sur la
          projection donnait « le nombre d'enrichis présenté comme un nombre de
          rattachés » — la phrase est du contrat, le défaut était à l'écran. */}
        <CoverageCount value={coverage.attachedToEntity} label={t('focal.coverage.attached')} />
        <CoverageCount value={coverage.llmEnriched} label={t('focal.coverage.enriched')} />
        {/* Louis 12/10/2026 — aucune arête : trois zéros en rang se lisent « rien à
          voir ». Une phrase, et les compteurs reviennent dès le premier lien
          (un vrai 0 à côté d'un lien reste un 0). Règle au contrat. */}
        {orgHasHierarchyEdges(coverage) ? (
          <>
            {/* #1 (recette 13/10) — « 0 liens vérifiés » à côté de 20 probables se lisait comme un
              compteur cassé : zéro vérifié se DIT, il ne se chiffre pas (GA-18/19). */}
            {coverage.hierarchyVerified === 0 ? (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('focal.coverage.noneVerified')}
              </Text>
            ) : (
              <CoverageCount value={coverage.hierarchyVerified} label={t('focal.coverage.verifiedLinks')} />
            )}
            <CoverageCount value={coverage.hierarchyProbable} label={t('focal.coverage.probableLinks')} />
            <CoverageCount value={coverage.uncoveredZones} label={t('focal.coverage.uncoveredZones')} />
          </>
        ) : (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('focal.coverage.noHierarchy')}
          </Text>
        )}
      </div>
      <SurfaceWideningNotice widening={widening} strict={false} />
    </div>
  )
}

/**
 * Un compteur du bandeau — et sa réponse quand il n'y a rien à compter.
 *
 * `value: number | null` sur TOUS, sans exception, y compris là où le contrat
 * garantit un nombre : c'est ce qui rend impossible de rajouter un compteur en
 * oubliant son cas absent.
 */
function CoverageCount({ value, label }: { value: number | null; label: string }) {
  // #4075 (recette N, 12/10) — une valeur ABSENTE ne s'affiche pas : « 3153 découverts rattachés
  // non mesuré — … » se lisait coupé, valeur et libellé collés. Décision Louis 20/09 : dans une
  // liste, une absence ne fait aucune ligne. Jamais « 0 », jamais un libellé orphelin ; une
  // valeur présente s'affiche toujours avec son libellé. (Le panneau « Couverture & qualité »,
  // sous un score, garde ses lignes non mesurées nommées.)
  if (value === null) return null
  return (
    <span className="flex items-baseline gap-1.5">
      <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {formatCount(value)}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
    </span>
  )
}
