import { Badge, Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'

/**
 * LA MARGE D'UNE MISSION — trois états, et le seul qui appelle un geste le dit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `in` ET PAS `== null` (D45, 28/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Parce que le service RETIRE la clé sans `finance:read` au lieu de la mettre à
 * `null` — et que la distinction porte toute la cellule :
 *
 *  · clé ABSENTE → « ce n'est pas ton périmètre ». Rien à faire, c'est un
 *    droit ; aller remplir la fiche ne changerait rien, et lui coller un
 *    « Compléter » enverrait chercher une panne qui n'existe pas.
 *  · `null`      → « personne n'a saisi le coût chargé ». Il y a un geste à
 *    faire, il est nommé, et depuis #1356 il a une PORTE.
 *  · un nombre   → la marge, `0` compris : une marge mesurée à zéro est une
 *    information, et une alerte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE #1356 CHANGE, ET CE QU'IL NE CHANGE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour demande « aucun long texte dans la cellule » : l'état vide se
 * lisait « Non mesuré — le coût chargé n'est pas renseigné », une phrase de
 * cellule de tableau. Il devient un titre, une cause, et une porte —
 * « Marge non mesurée » / « Coût chargé manquant » / « Compléter ».
 *
 * Ce qu'il ne change PAS : le nombre vient du serveur et n'est jamais recalculé
 * ici. La fiche et cette cellule lisent le même noyau (`missionMargin`), sinon
 * l'une dirait « 32 % » et l'autre « 31,8 % » de la même mission.
 *
 * ⚠️ La porte mène au DOSSIER de la mission, où les conditions commerciales se
 * saisissent déjà — jamais un second formulaire (« ne pas créer de nouveau
 * formulaire », #1354, repris par #1356 et #1365).
 */
export function MissionMargin({
  mission,
  canReadFinance,
  compact = false,
}: {
  /** La ligne ENTIÈRE, et pas seulement le pourcentage : sur une API plus
   *  ancienne que ce code, c'est encore la PRÉSENCE de la clé qui distingue
   *  « pas ton périmètre » de « pas mesuré ». */
  mission: { id: string; marginPercent?: number | null }
  /**
   * LE DROIT DU LECTEUR, RENDU À CÔTÉ DE LA LISTE — #1365.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * LE TROISIÈME ÉTAT N'ÉTAIT PAS ATTEIGNABLE
   * ─────────────────────────────────────────────────────────────────────────
   * #1365 exige « trois états obligatoires : marge calculée · coût chargé
   * manquant · donnée non accessible / hors périmètre ». Le troisième se
   * décidait sur `'marginPercent' in mission` — la clé absente valant « pas ton
   * périmètre ».
   *
   * Or depuis D45 (28/08/2026) le service ne RETIRE plus la clé : il la met à
   * `null`, présente et vide. Le test `in` ne pouvait donc plus être vrai en
   * production, et un lecteur sans `finance:read` lisait « Coût chargé
   * manquant · Compléter » — on l'envoyait réparer une donnée qu'il n'a pas le
   * droit de voir, et qui n'a peut-être rien.
   *
   * C'est une LECTURE qui avait survécu à son écriture. Le drapeau voyage avec
   * la réponse pour cette raison exacte, et personne ne le lisait : le défaut
   * n°1 du dépôt, du calcul juste que personne n'appelle.
   *
   * ⚠️ `undefined` n'est pas `false`. Il veut dire « l'écran ne sait pas
   * encore » — une API plus ancienne que ce code, ou un montage de test qui ne
   * décrit pas ce droit. On retombe alors sur la présence de la clé, qui reste
   * juste sur cette API-là. Conclure « pas le droit » d'un silence remettrait
   * un verdict là où il n'y a qu'une absence de mesure.
   */
  canReadFinance?: boolean
  /**
   * #4191 (recette 3, F2) — la cellule d'un TABLEAU : « non mesurée » court, et la raison à l'infobulle
   * (`title`) + au lecteur d'écran. Jamais « 0 » (GA-18). La fiche garde la forme longue.
   */
  compact?: boolean
}) {
  const { t } = useTranslation('missions')

  if (canReadFinance === false) return <UnknownValue reason={t('table.marginNoAccess')} />
  if (canReadFinance === undefined && !('marginPercent' in mission)) {
    return <UnknownValue reason={t('table.marginNoAccess')} />
  }

  const percent = mission.marginPercent
  if ((percent === null || percent === undefined) && compact) {
    return (
      <Box display="flex" className="min-w-0 flex-col items-start gap-0.5">
        <Text
          element="span"
          size="sm"
          color="text-[var(--bellum-text-muted)]"
          title={`${t('table.marginNotMeasuredTitle')} — ${t('table.marginMissingCost')}`}
        >
          {t('table.marginNotMeasuredShort')}
          <span className="sr-only">{` — ${t('table.marginMissingCost')}`}</span>
        </Text>
        <Link
          to="/missions/$id"
          params={{ id: mission.id }}
          title={t('table.marginCompleteHint')}
          className="inline-flex shrink-0 items-center whitespace-nowrap text-[var(--bellum-text-accent)] underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current focus-visible:decoration-current pointer-coarse:min-h-11"
        >
          <Text element="span" size="xs" weight="medium">
            {t('table.marginComplete')}
          </Text>
        </Link>
      </Box>
    )
  }
  if (percent === null || percent === undefined) {
    return (
      <Box display="flex" className="min-w-0 flex-col items-start gap-0.5">
        {/* #2979 — deux lignes, jamais quatre : le titre ne revient pas à la ligne, la cause
            se tronque (title = texte entier) et la porte reste à côté d'elle. */}
        <Text element="span" size="sm" color="text-[var(--bellum-text-muted)]" className="whitespace-nowrap">
          {t('table.marginNotMeasuredTitle')}
        </Text>
        <Box display="flex" className="max-w-full min-w-0 items-center gap-1">
          <Text
            element="span"
            size="xs"
            color="text-muted-foreground"
            className="break-words"
            title={t('table.marginMissingCost')}
          >
            {t('table.marginMissingCost')}
          </Text>
          {/* Un vrai lien : ce qui se clique se tabule (GA-35). La couleur passe
              par `--bellum-text-accent` — aucune nuance FIXE de la gamme primaire
              ne passe AA des deux côtés (D79). */}
          <Link
            to="/missions/$id"
            params={{ id: mission.id }}
            title={t('table.marginCompleteHint')}
            className="inline-flex shrink-0 items-center whitespace-nowrap text-[var(--bellum-text-accent)] underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current focus-visible:decoration-current pointer-coarse:min-h-11"
          >
            <Text element="span" size="xs" weight="medium">
              {t('table.marginComplete')}
            </Text>
          </Link>
        </Box>
      </Box>
    )
  }

  // Le même seuil que le badge de la fiche : deux écrans ne colorent pas la
  // même mission différemment.
  // Une marge saine est un chiffre, pas une pastille : la couleur est réservée à l'exception (marge négative).
  if (percent >= 0) {
    return (
      <Text element="span" size="sm" className="tabular-nums">
        {t('table.marginValue', { percent })}
      </Text>
    )
  }
  return (
    <Badge variant="warning" className="tabular-nums">
      {t('table.marginValue', { percent })}
    </Badge>
  )
}
