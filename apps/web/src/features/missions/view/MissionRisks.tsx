import type { MissionRisk, MissionStatus } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { ClippedBadge } from './ClippedBadge'

/**
 * Les seuls statuts sur lesquels `missionRisks` calcule quoi que ce soit.
 *
 * ⚠️ Le calcul SORT TÔT pour tout autre statut (`mission.ts`) : une mission
 * suspendue rend donc toujours `[]`. Sans cette liste, l'écran conclurait
 * « rien à signaler » d'un silence — et « un verdict ne se conclut pas d'un
 * silence » est une cause racine déjà payée dans ce dépôt.
 */
const RISK_BEARING_STATUSES: ReadonlySet<string> = new Set(['active', 'onboarding'])

/**
 * Combien de risques on montre avant de compter le reste (#1365).
 *
 * Une seule (#2979, recette Z1 04/10 : lignes uniformes), parce qu'au-delà la cellule cesse d'être lue : une mission qui porte
 * quatre pastilles ne dit plus par quoi commencer, et c'est exactement ce que
 * la lentille « Renouvellements » doit trancher. Les autres ne DISPARAISSENT
 * pas — ils sont comptés, et la ligne complète se lit sur le dossier.
 */
const MAX_VISIBLE_RISKS = 1

/**
 * LES RISQUES D'UNE MISSION — à un seul endroit, tableau ET cartes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE COMPOSANT EXISTE (leçon payée le 03/09, commit `ebb78a30d`)
 * ─────────────────────────────────────────────────────────────────────────────
 * `MissionDeadline` a été extrait pour une raison mesurée : #1353 n'avait été
 * livré que dans la colonne du tableau, et la lentille « Renouvellements » —
 * qui rend des CARTES et non ce tableau — affichait encore l'ancienne version
 * trois minutes après le déploiement. Les risques ont exactement la même
 * topologie : deux rendus, deux lentilles, un clic d'écart. Ils vivent donc
 * ici, et nulle part ailleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE N'EST PAS RE-CALCULÉ ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * `missionRisks` les émet déjà dans son ordre de gravité — l'échéance d'abord,
 * puis le relevé, puis la marge. Re-trier ici fabriquerait une seconde échelle
 * de gravité qui divergerait de celle du serveur au premier ajout (GA-26).
 * On COUPE, on ne réordonne pas.
 *
 * ⚠️ TROIS états, jamais deux : « pas calculable sur ce statut » (non mesuré),
 * « calculé, rien à signaler » (un fait) et « voici ce qui cloche ». Les
 * confondre ferait lire un silence comme une bonne nouvelle.
 */
export function MissionRisks({
  status,
  risks,
  oneLine = false,
}: {
  status: MissionStatus | string
  risks: readonly MissionRisk[] | undefined
  /** #2979 (RBD) — tableau dense : pastille + « +N » sur UNE ligne (ellipse), sinon ~101 px par ligne. */
  oneLine?: boolean
}) {
  const { t } = useTranslation('missions')

  if (!RISK_BEARING_STATUSES.has(status)) {
    // #4191 (E3) — « non mesuré » court dans la cellule, la raison à l'infobulle (`compact`).
    return <UnknownValue compact reason={t('table.risksNotComputed')} />
  }

  const all = risks ?? []
  if (all.length === 0) {
    return (
      <Text element="span" size="sm" color="text-muted-foreground">
        {t('table.noRisk')}
      </Text>
    )
  }

  const shown = all.slice(0, MAX_VISIBLE_RISKS)
  const hidden = all.length - shown.length

  return (
    // `flex-wrap` et pas deux dispositions : une pastille tient sur une ligne
    // par construction (`badge.tsx`), et le repli à la ligne se déclenche sur la
    // LARGEUR DISPONIBLE — donc la même règle sert la cellule et la carte.
    <Box display="flex" className={'min-w-0 flex-wrap items-center gap-1'}>
      {/* #1804 (résiduel) — mesuré en production : « Renouvellement non
          engagé » (182px de contenu) peignait hors d'une cellule bornée à
          160px. `ClippedBadge` clippe proprement plutôt que de laisser le
          texte déborder ; voir son docblock pour le mécanisme. */}
      {shown.map(risk => (
        <ClippedBadge key={risk} variant="warning" oneLine={oneLine}>
          {t(`table.riskKinds.${risk}`)}
        </ClippedBadge>
      ))}
      {hidden > 0 ? (
        // Compté, jamais tu : « +1 autre » dit qu'il reste quelque chose à lire,
        // là où une coupe muette ferait croire la liste complète.
        <Text element="span" size="sm" color="text-muted-foreground" className={oneLine ? 'shrink-0' : undefined}>
          {t('table.risksMore', { count: hidden })}
        </Text>
      ) : null}
    </Box>
  )
}
