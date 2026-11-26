import { daysUntilEnd, type RenewalWindow } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatDate } from '@/lib/locale'
import { ClippedBadge } from './ClippedBadge'

/**
 * LA HIÉRARCHIE DE COULEUR, telle que #1364 la demande — et à un seul endroit.
 *
 * « J-60 = information · J-30 = orange · imminent = orange soutenu · échue =
 * rouge · date inconnue = gris + action orange ».
 *
 * ⚠️ `overdue` était `warning` comme J-30 : une mission DÉJÀ dépassée se
 * peignait de la même couleur que celle qui finit dans un mois, ce qui est
 * exactement l'inverse de ce que la couleur sert à dire. Elle passe en
 * `danger`.
 *
 * ⚠️ Deux nuances d'orange n'existent PAS dans la gamme de pastilles — et on
 * n'en invente pas : une couleur écrite à la main ne suit pas le thème (D79) et
 * aucune nuance FIXE ne passe AA des deux côtés. « Imminent » se distingue donc
 * de « J-30 » par son TEXTE (« J-4 » contre « J-28 »), qui est plus précis
 * qu'une nuance. Le jour où la gamme portera un second niveau d'alerte, il se
 * branche ICI et nulle part ailleurs.
 *
 * ⚠️ `unknown` reste GRIS : l'urgence n'est pas dans la pastille, elle est dans
 * le geste — c'est la prochaine action, rendue à côté, qui porte l'accent.
 *
 * ⚠️ #2195.3, #2195.5 — les DEUX fenêtres nées le 16/09/2026 se rangent dans
 * les trois niveaux existants, elles n'en ouvrent pas de quatrième : `j45`
 * reste une INFORMATION (comme J-60 : la fin est loin mais il faut la voir),
 * `j15` une ALERTE (comme J-30 et « imminent »). Inventer une nuance de plus
 * demanderait une couleur qui n'existe pas dans la gamme — et une couleur
 * écrite à la main ne suit pas le thème (D79).
 */
const RENEWAL_VARIANT: Record<RenewalWindow, 'info' | 'warning' | 'danger' | 'secondary'> = {
  far: 'secondary',
  j60: 'info',
  j45: 'info',
  j30: 'warning',
  j15: 'warning',
  imminent: 'warning',
  overdue: 'danger',
  unknown: 'secondary',
}

/**
 * L'ÉCHÉANCE D'UNE MISSION — le temps RESTANT d'abord, la date ensuite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE COMPOSANT EXISTE, ET PAS SEULEMENT UNE CELLULE DE TABLEAU
 * ─────────────────────────────────────────────────────────────────────────────
 * #1353 a d'abord été livré dans la seule colonne du tableau. La recette live du
 * 03/09 a trouvé la conséquence en trois minutes : la lentille
 * « Renouvellements », qui rend des cartes et non un tableau, affichait encore
 * `2026-10-01` en ISO brut — et surtout, la MÊME mission se lisait « J-28 »
 * dans un onglet et « J-30 » dans l'autre.
 *
 * Les deux nombres étaient justes et ne disaient pas la même chose : le premier
 * est le compte à rebours réel, le second était le NOM de la fenêtre
 * (`renewal.j30`), une étiquette de seuil qui se lit comme un décompte. Deux
 * vérités sur la même mission, à un clic d'écart.
 *
 * L'échéance se rend donc ICI et nulle part ailleurs. C'est la même loi que
 * partout : une dérivation vit à un seul endroit (GA-26), sinon les deux copies
 * divergent — et celle-ci avait divergé avant même d'avoir vieilli d'une heure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE CAS, ET POURQUOI AUCUN NE S'ÉCRIT « J-n »
 * ─────────────────────────────────────────────────────────────────────────────
 *  · pas de date de fin → « Date de fin manquante », et la conséquence en
 *    dessous (#1364). C'est le vrai risque, pas un compte à rebours manquant —
 *    et depuis ce lot, la PORTE est rendue à côté par la prochaine action
 *    (`set_end_date`), qui ouvre le dossier où la date se pose.
 *  · échéance dépassée → « Échéance dépassée ». « J--5 » n'est pas une phrase.
 *  · fin aujourd'hui → « Fin aujourd'hui ». « J-0 » se lit comme un bug.
 *  · date présente mais ILLISIBLE → « non mesuré », jamais une date inventée.
 *    Une date qu'on ne sait pas lire se répare ; une date absente se saisit.
 */
export function MissionDeadline({
  endsOn,
  renewal,
  variant = 'inline',
  oneLine = false,
}: {
  endsOn: string | null | undefined
  renewal: RenewalWindow | undefined
  /** `inline` : badge et date côte à côte (tableau). `stacked` : l'un sous l'autre (carte). */
  variant?: 'inline' | 'stacked'
  /** #2979 (RBD) — cellule de tableau dense : UNE ligne (pastille + date courte, ellipse), le détail au `title`. */
  oneLine?: boolean
}) {
  const { t } = useTranslation('missions')
  const days = daysUntilEnd(endsOn)
  const readable = formatDate(endsOn, { day: 'numeric', month: 'short', year: 'numeric' })

  if (days === null && oneLine) {
    // #2979 (RBD) — la pastille seule ; la conséquence complète passe au `title` de la cellule.
    return (
      <div className="flex min-w-0 flex-wrap items-center" title={t('noEndDateConsequence')}>
        <ClippedBadge variant={RENEWAL_VARIANT.unknown} oneLine>
          {t('noEndDateTitle')}
        </ClippedBadge>
      </div>
    )
  }

  if (days === null) {
    /**
     * #1364 — « remplacer "Sans échéance" par "Date de fin manquante" », avec
     * la CONSÉQUENCE en sous-texte.
     *
     * La phrase d'avant disait déjà les deux, mais en une seule ligne de
     * cellule : l'état et sa conséquence se lisaient comme un commentaire, pas
     * comme un manque à combler. Séparés, l'œil attrape l'état et la
     * conséquence explique pourquoi il faut y aller.
     *
     * ⚠️ La conséquence ne nomme PAS le produit — l'application se déploie en
     * marque blanche, et une phrase qui dit « Bellum ne peut pas… » se lirait
     * de travers chez un client dont l'outil porte son propre nom.
     */
    return (
      <Box display="flex" className="min-w-0 flex-col items-start gap-0.5">
        {/* #1804 (résiduel) — « Date de fin manquante » (22 caractères) est
            long pour une pastille dans une colonne bornée à 8rem. */}
        <ClippedBadge variant={RENEWAL_VARIANT.unknown}>{t('noEndDateTitle')}</ClippedBadge>
        {/* #2979 — une ligne, jamais plus : la conséquence complète reste au `title`. */}
        <Text
          element="span"
          size="xs"
          color="text-muted-foreground"
          title={t('noEndDateConsequence')}
          className="block max-w-full truncate"
        >
          {t('noEndDateConsequence')}
        </Text>
      </Box>
    )
  }

  const label = days < 0 ? t('table.overdue') : days === 0 ? t('table.endsToday') : t('table.daysLeft', { count: days })

  if (oneLine) {
    // #2979 (RBD, recette G5 11/10 : cellule Échéance 70-86 px, lignes à ~101 px) — pastille + date COURTE
    // (sans l'année) sur une ligne, ellipse ; le texte entier (compte à rebours + date complète) au `title`.
    const short = formatDate(endsOn, { day: 'numeric', month: 'short' })
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-1" title={readable ? `${label} · ${readable}` : label}>
        <ClippedBadge variant={RENEWAL_VARIANT[renewal ?? 'unknown']} oneLine>
          {label}
        </ClippedBadge>
        {short ? (
          <Text element="span" size="sm" color="text-muted-foreground" className="min-w-0">
            {short}
          </Text>
        ) : (
          <UnknownValue reason={t('table.endsOnUnreadable')} />
        )}
      </div>
    )
  }

  return (
    <Box
      display="flex"
      className={variant === 'stacked' ? 'flex-col items-start gap-1' : 'flex-wrap items-center gap-2'}
    >
      {/* #1804 (résiduel) — « Échéance dépassée » (18 caractères) approche le
          plancher de 8rem ; défensif au même titre que les autres pastilles
          de cette famille. */}
      <ClippedBadge variant={RENEWAL_VARIANT[renewal ?? 'unknown']}>{label}</ClippedBadge>
      {readable ? (
        <Text element="span" size="sm" color="text-muted-foreground">
          {readable}
        </Text>
      ) : (
        <UnknownValue reason={t('table.endsOnUnreadable')} />
      )}
    </Box>
  )
}
