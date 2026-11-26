import type { AccountIntelligenceSource } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'

/**
 * D'où vient une valeur, et de quand.
 *
 * #2116.1-8 — les huit provenances du contexte canonique
 * (`AccountIntelligenceSource`) rejoignent les cinq libellés d'origine ICI, et
 * pas dans une seconde primitive : deux composants de provenance produiraient
 * deux vocabulaires, et c'est exactement ce que le retour reprochait. Chacune
 * se traduit par la clé `common:provenance.<source>` — une seule table.
 */
export type ProvenanceSource =
  | 'human'
  | 'connector'
  | 'pipeline'
  | 'model'
  | 'inferred'
  | 'public'
  | AccountIntelligenceSource

/**
 * La provenance d'une valeur affichée — la source ET la date.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE PRIMITIVE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `field_provenance` arbitre déjà les écritures depuis des mois, et les écrans
 * n'en montrent presque rien. Or les deux gestes qu'un commercial fait devant
 * une donnée douteuse dépendent entièrement de sa provenance : une valeur
 * saisie par un collègue se discute avec lui, une valeur d'un registre public
 * se vérifie à la source, une valeur d'un modèle se relit.
 *
 * La DATE compte autant que la source. « Information de mars 2026, à
 * revérifier » est la formulation que le tome 1 impose aux faits d'accès, et
 * elle vaut partout : une donnée périmée **redevient inconnue**, elle ne
 * disparaît pas et elle ne reste pas vraie non plus.
 */
type ProvenanceLabelInput = {
  source: ProvenanceSource | null
  observedAt?: string | null
  detail?: string | null
  /**
   * #2116.19 — dire « date inconnue » plutôt que de se taire.
   *
   * Par défaut une date absente ne s'écrit pas : la plupart des appelants
   * rendent un bloc dont la date n'est pas le sujet. Là où la date EST une
   * métadonnée promise — une recommandation — son absence doit se LIRE, sinon
   * elle se lit « aujourd'hui ».
   */
  nameMissingDate?: boolean
}

type ProvenanceProps = ProvenanceLabelInput & {
  /**
   * #3713.1 — un appelant dans une ligne DENSE (la colonne « Suivi » du
   * tableau contacts, 193 px) borne la hauteur plutôt que de laisser
   * `sourceLabel · detail` composer librement : sans borne, la phrase passe
   * sur plusieurs lignes et gonfle la ligne entière (GA-385 — un texte libre
   * dans une ligne dense porte une borne de lignes). Absent partout ailleurs :
   * cette primitive ne force AUCUNE borne par défaut, seul l'appelant dense
   * la demande.
   */
  className?: string
}

/**
 * Le TEXTE de la provenance (source · date), sans le rendu. Extrait pour
 * #3840/#3842 : un appelant qui doit COMBINER cette chaîne avec d'autres
 * champs sur une seule ligne (`ContactFieldMeta`) a besoin de la chaîne brute,
 * pas d'un `<Text>` déjà posé — un seul calcul (GA-26), réutilisé par
 * {@link Provenance} elle-même ci-dessous.
 */
export function provenanceLabel(
  { source, observedAt, detail, nameMissingDate = false }: ProvenanceLabelInput,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  // #2116.1-8 — une provenance absente est NOMMÉE. Un fait sans source rendu
  // sans mention se lit comme un fait établi : c'est le vide qui ment.
  const sourceLabel = source ? t(`provenance.${source}`) : t('provenance.unknownSource')
  const formattedDate = formatDate(observedAt, { day: '2-digit', month: 'short', year: 'numeric' })
  const dateIsUnreadable = Boolean(observedAt) && formattedDate === null
  const dateLabel = formattedDate
    ? t('provenance.on', { date: formattedDate })
    : nameMissingDate || dateIsUnreadable
      ? t('provenance.unknownDate')
      : null
  return [sourceLabel, dateLabel, detail].filter(Boolean).join(' · ')
}

export function Provenance({ source, observedAt, detail, nameMissingDate = false, className }: ProvenanceProps) {
  const { t } = useTranslation('common')
  /**
   * R15-10 (recette du 15/09/2026, prod `5ca597d5a`) — LA DATE SE LIT.
   *
   * Cette ligne interpolait `observedAt` BRUT : la fiche contact de THALES
   * affichait « lu dans un outil connecté · le 2026-09-11T07:22:37:46.992Z ».
   * `provenanceLabel` (ci-dessus) porte le remède — la date passe par
   * `formatDate` (`@/lib/locale`), la seule dérivation « date lisible » du
   * front (GA-26) — et une date ILLISIBLE se NOMME plutôt que de se taire ou
   * de se recopier brute.
   */
  return (
    <Text size="xs" color="text-[var(--bellum-text-muted)]" className={className}>
      {provenanceLabel({ source, observedAt, detail, nameMissingDate }, t)}
    </Text>
  )
}
