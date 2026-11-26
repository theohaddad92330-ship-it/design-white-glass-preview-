import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { Provenance, provenanceLabel } from '@/components/primitives/Provenance'
import { contactProvenanceKind, contactSourceLabel, formatContactDate } from '@/features/contacts/lib/contactProvenance'

/**
 * #2632.2 — LA DATE, LA SOURCE ET LA CATÉGORIE DE VÉRIFICATION D'UN CONTACT.
 *
 * Extrait de `ContactTableRow` (/contacts), qui seul portait ce badge — le
 * dossier d'un compte (`CompactContactRow`) montrait le poste sans dire
 * quand il avait été lu, ni d'où, ni ce qu'en faire. Un seul rendu, deux
 * appelants (GA-26 : un réglage vit à un seul endroit) : le recopier aurait
 * donné deux badges qui divergent au premier renommage.
 *
 * La date privilégie la dernière MISE À JOUR, la collecte en repli ; la
 * source passe par `Provenance`, qui ajoute la CATÉGORIE devant le libellé —
 * une valeur lue dans un outil connecté se revérifie à la source, une valeur
 * proposée par un modèle se relit. Une source non classée garde son libellé
 * nu plutôt que de recevoir une catégorie devinée. Rien n'est inventé : une
 * date absente s'affiche « — », jamais un « 0 » ni une date fictive.
 */
export function ContactVerificationBadge({
  contact,
  labelled = false,
}: {
  contact: { created_at?: string | null; updated_at?: string | null; source: string | null }
  /** Date nommée (« Mis à jour le … » / « Ajouté le … ») — tous les emplois, /contacts compris (#1, recette 13/10) : jamais une date nue. */
  labelled?: boolean
}) {
  const { t } = useTranslation('contacts')
  const { t: tCommon } = useTranslation('common')
  const collectedDate = formatContactDate(contact.created_at)
  const updatedDate = formatContactDate(contact.updated_at)
  const sourceKind = contact.source ? contactProvenanceKind(contact.source) : null

  return (
    <Box className="min-w-0">
      {/* #3713 — recette prod 08/10 (U 22edd95fe1) : le retrait de l'ellipse
          (tour précédent) a fait passer la date sur DEUX lignes (span 79×40
          dans la cellule 193 px) — une ligne pleine haussait toute la rangée.
          `formatContactDate` rend maintenant un format tout numérique
          (« 08/10/2026 ») assez court pour tenir sur une ligne ;
          `whitespace-nowrap` SANS `overflow-hidden`/`text-ellipse` l'empêche de
          se couper ET de passer à la ligne — aucun caractère rogné, aucune
          rangée qui gonfle. */}
      {/* Recette 13/10/2026 — `labelled` (hors tableau, où l'en-tête de colonne nomme la date) : « Mis à jour le … » /
          « Ajouté le … », et rien du tout quand aucune date n'est connue. */}
      {labelled && !collectedDate && !updatedDate ? null : (
        <Text
          element="span"
          size="sm"
          className="block whitespace-nowrap"
          color="text-[var(--bellum-text-secondary)]"
          title={
            collectedDate
              ? t('table.dateTooltip', { collected: collectedDate, updated: updatedDate ?? collectedDate })
              : undefined
          }
        >
          {labelled
            ? updatedDate
              ? t('table.dateUpdatedLabel', { date: updatedDate })
              : t('table.dateAddedLabel', { date: collectedDate })
            : (updatedDate ?? collectedDate ?? '—')}
        </Text>
      )}
      {contact.source &&
        (sourceKind ? (
          // #3713.2 — recette prod 09/10 : « lu dans un outil connecté · Enrichissement »
          // composait librement et, sans borne, passait sur 2-3 lignes dans la
          // colonne « Suivi » (193 px) — avec la date au-dessus, la rangée montait
          // à 4 lignes / 100 px. `line-clamp-1` borne la hauteur (GA-385) ; le
          // `title` porte le texte COMPLET (source + detail), jamais juste le detail,
          // pour que rien ne se perde au repli.
          <div
            className="min-w-0"
            title={provenanceLabel({ source: sourceKind, detail: contactSourceLabel(contact.source) }, tCommon)}
          >
            <Provenance
              source={sourceKind}
              detail={contactSourceLabel(contact.source)}
              className="line-clamp-1 break-words"
            />
          </div>
        ) : (
          <Text
            element="span"
            size="xs"
            noWrap
            color="text-[var(--bellum-text-muted)]"
            className="block"
            title={contactSourceLabel(contact.source)}
          >
            {contactSourceLabel(contact.source)}
          </Text>
        ))}
    </Box>
  )
}
