import { useTranslation } from 'react-i18next'
import { talentCompleteness, type TalentRow } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { UnknownValue } from '@/components/primitives/UnknownValue'

/**
 * La « Complétude » d'une ligne du vivier — ce qui remplace la colonne
 * « Score » nue de la maquette (PDF-22 §01, « à jeter »).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI « COMPLÉTUDE » ET PAS « SCORE »
 * ─────────────────────────────────────────────────────────────────────────
 * « Un score de rapprochement sans besoin de référence n'existe pas » — la
 * fiche de lecture de la maquette est explicite. Cette ligne n'est comparée à
 * AUCUN besoin ; ce qu'elle mesure est la complétude de la FICHE (identité,
 * compétences, disponibilité, tarif, CV), pas une chance de matcher quoi que
 * ce soit. `talentCompleteness` (contrats) porte le calcul, une seule fois,
 * réutilisé par le bandeau de statistiques côté serveur.
 *
 * Passe par `ScoreWithAxes` (GA-18) : un score n'est jamais nu. En `compact`
 * — chaque ligne du vivier en montre beaucoup —, mais les CINQ axes restent
 * lisibles au survol : `compact` ne met que les axes NON évaluables dans son
 * `title`, or les cinq ici sont toujours évaluables (savoir si un champ est
 * rempli ne manque jamais de donnée). Le détail est donc écrit ICI, pas confié
 * au mode compact.
 */
/**
 * #2737 — une cellule, une ligne : « 20/100 » débordait sur la colonne
 * voisine (capture du 25/09). Le contenu de `ScoreWithAxes` est remis en
 * ligne et tronqué DANS la cellule ; le détail reste au survol.
 */
const ONE_LINE = 'block min-w-0 truncate [&_*]:inline'

/**
 * #3812.3 — LE NOMBRE N'EST JAMAIS CE QUI TRONQUE.
 *
 * Recette prod 09/10 : conteneur de 96 px pour 182 px de texte, « 60/100 »
 * invisible — l'ellipsis de `truncate` coupe la fin de la ligne, et le
 * libellé (« Complétude de la fiche ») vient AVANT le score dans le flux,
 * donc c'est le score qui disparaît. Le libellé — déjà redondant avec
 * l'en-tête de colonne (« Complétude », GA-26 : un réglage ne s'affiche pas
 * deux fois) — tronque donc SEUL dans son propre conteneur ; le score vit à
 * côté, `shrink-0`, jamais rogné.
 */
const SCORE_ROW = 'flex min-w-0 items-center gap-1.5'
// #4500.4 — le texte passe à la ligne (le `title` garde le détail) : jamais tronqué, jamais `shrink-0`.
const SCORE_SLOT = 'min-w-0 break-words'

export function TalentCompletenessScore({ row }: { row: TalentRow }) {
  const { t } = useTranslation('consultants')

  /**
   * #1780 — UNE FICHE QUI ATTEND SA RELECTURE N'A PAS DE COMPLÉTUDE.
   *
   * Les cinq axes mesurent des champs de la FICHE. Tant que la lecture du CV
   * n'a pas été validée, rien n'y est encore écrit : le calcul est juste, la
   * question qu'il pose ne l'est pas encore, et « 20/100 » se lit « ce profil
   * est vide » alors que tout est dans le CV, lu, en attente d'un clic.
   *
   * ⚠️ Vu EN PRODUCTION le 09/09, juste après avoir corrigé l'entête de la
   * fiche : la ligne du vivier, elle, annonçait toujours « 20/100 ». Une règle
   * écrite pour un cas et pas pour son jumeau ne tient pas — les deux surfaces
   * lisent le même objet, elles doivent en dire la même chose.
   */
  if (row.reviewStatus === 'needs_review') {
    return (
      <span className={ONE_LINE} title={t('completeness.pendingReview')}>
        {/* #2737 — aucun score à montrer : l'absence NOMMÉE, en forme discrète
            (tiret atténué, « non mesuré — relecture… » au survol et pour le
            lecteur d'écran) — elle noyait la ligne en toutes lettres. */}
        <UnknownValue discreet reason={t('completeness.pendingReview')} />
      </span>
    )
  }

  // Décision Louis 23/10/2026 : le score consultant s'écrit EN CLAIR, jamais en
  // points. Les faits suffisent : la fiche est complète, ou voici ce qui manque.
  const missing = talentCompleteness(row)
    .axes.filter(axis => axis.score === 0)
    .map(axis => (axis.key === 'cv' ? t('completeness.axes.cv') : t(`completeness.axes.${axis.key}`).toLowerCase()))
  const text =
    missing.length === 0 ? t('completeness.allFilled') : t('completeness.toComplete', { missing: missing.join(', ') })
  const detail = missing.length === 0 ? undefined : t('completeness.missing', { missing: missing.join(', ') })

  return (
    <span className={SCORE_ROW} title={detail}>
      <Text size="sm" weight="medium" className={SCORE_SLOT}>
        {text}
      </Text>
    </span>
  )
}
