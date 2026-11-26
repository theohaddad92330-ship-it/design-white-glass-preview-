import { Box, Text } from '@bellum/ui'
import { groupSyncSummaryByBlock, type SyncSummaryLine } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'

/**
 * Le résumé cross-domaine d'une synchronisation (#2207.26 à #2207.32),
 * organisé en 5 blocs (#2110.47 à .53 : « ce que j'ai retrouvé / rapproché /
 * pas compris / ce que ça change / ce que je conseille »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE COMPOSANT NE CONNAÎT AUCUN DOMAINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne sait ni ce qu'est un « rendez-vous », ni ce qu'est une « ambiguïté » —
 * il rend la phrase FR+EN que le contrat porte déjà (`SyncSummaryLine.label`).
 * C'est délibéré : le vocabulaire de chaque domaine est choisi UNE fois, côté
 * serveur (`sync-summary-labels.ts`), jamais recomposé ici à partir du seul
 * compte. Le rangement d'un domaine dans un bloc est lui aussi choisi UNE
 * fois (`groupSyncSummaryByBlock`, `@bellum/contracts`) — ajouter un
 * huitième domaine ne touche donc jamais ce fichier, seulement sa
 * déclaration de bloc.
 *
 * « On n'affiche pas ce qu'on n'a pas » : `lines` ne contient JAMAIS de ligne
 * à zéro (le serveur ne la construit pas) — un domaine sans résultat n'a
 * simplement pas d'entrée, et un bloc sans ligne n'apparaît pas. Quand
 * `lines` est vide, ce composant le DIT (`syncSummary.empty`), il ne rend
 * jamais un cadre muet.
 *
 * ⚠️ Le bloc « ce que je conseille » ne porte que des recommandations
 * DÉRIVÉES d'un compte déjà présent ailleurs dans le résumé (voir
 * `groupSyncSummaryByBlock`) — jamais un signal de confiance par résultat,
 * volontairement absent : aucun `COUNT` SQL agrégé n'en porte à ce jour et
 * l'inventer violerait « jamais de donnée fictive » (#2110.47, nommé dans le
 * commentaire de #2980 du 25/09/2026).
 */
export function SyncSummary({ lines }: { lines: readonly SyncSummaryLine[] }) {
  const { t, i18n } = useTranslation('integrationCenter')
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr'

  if (lines.length === 0) {
    return (
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('syncSummary.empty')}
      </Text>
    )
  }

  const groups = groupSyncSummaryByBlock(lines)

  return (
    <Box className="space-y-2">
      {groups.map(group => (
        <Box key={group.block} className="space-y-0.5">
          <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
            {t(`syncSummary.blocks.${group.block}`)}
          </Text>
          {group.lines.map(line => (
            <Text key={`${group.block}-${line.domain}`} size="xs" color="text-[var(--bellum-text-secondary)]">
              · {line.label[lang]}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}
