import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { MATCH_AXES } from '@bellum/contracts'
import { Box, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@bellum/ui'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import {
  RADAR_MAX_PROFILES,
  RADAR_MIN_PROFILES,
  axisEvaluability,
  axisSpokes,
  radarSegments,
  type RadarGeometry,
  type RadarProfile,
} from './radarGeometry'

/**
 * Le RADAR DE RAPPROCHEMENT — 13 axes, 2 à 4 profils superposés (PDF 5 §4.6,
 * PDF 15 §8 visualisation n°5, BEL-ATS-008).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA QUESTION À LAQUELLE IL RÉPOND, ET UNE SEULE
 * ─────────────────────────────────────────────────────────────────────────
 * « Sur quels axes ? » — la forme radar, dans la table du §8. Il ne dit ni
 * combien, ni comment ça évolue, ni où ça coince : ces questions-là ont leurs
 * propres formes, et les empiler ici ferait un graphe qui ne répond à rien.
 *
 * ⚠️ **Une seule nature par graphe.** Les séries d'un même radar sont
 * homogènes — quatre profils, ou quatre besoins, jamais un mélange. Comparer un
 * profil à un besoin sur les mêmes axes ferait une figure lisible et fausse.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES AXES NON ÉVALUABLES SONT HACHURÉS — LE CŒUR DE L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────
 * Un axe hachuré dit « on n'a pas pu juger ». Un axe à zéro dit « c'est
 * mauvais ». Les confondre ferait mesurer la complétude de NOS données au lieu
 * du profil — exactement ce que le moteur refuse déjà en sortant l'axe du
 * dénominateur.
 *
 * La distinction se lit de TROIS façons, et aucune n'est une couleur :
 *
 *  1. la branche est HACHURÉE (une texture, donc lisible en noir et blanc, en
 *     contrastes forcés, et pour qui ne distingue pas les teintes) ;
 *  2. le tracé du profil s'INTERROMPT au lieu de passer par le centre ;
 *  3. le tableau écrit « non mesuré », jamais « 0 ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE TABLEAU N'EST PAS UN REPLI, C'EST LA MOITIÉ DU COMPOSANT
 * ─────────────────────────────────────────────────────────────────────────
 * Le §4.6 demande que « chaque axe porte sa valeur en chiffre à côté ». Treize
 * axes × quatre profils font cinquante-deux nombres : posés sur la figure ils la
 * rendent illisible, et la règle du dépôt sur les étiquettes directes dit la
 * même chose. Ils vivent donc dans le tableau, TOUJOURS rendu, à côté du
 * graphe — ce qui le rend du même coup lisible par un lecteur d'écran. Un
 * graphe qu'un lecteur d'écran ne peut pas lire n'existe pas pour tout le monde.
 *
 * De même, la branche porte son RANG sur la figure et son NOM dans son
 * `<title>` : treize libellés français autour d'un rayon de 110 px se
 * chevauchent, et un libellé illisible ne nomme rien.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX TEINTES, PAS QUATRE — ET UN SECOND CANAL POUR LES DISTINGUER
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ Une version antérieure empruntait l'ambre et le rouge, ASSOMBRIS, pour les
 * séries 3 et 4. C'est exactement l'anti-patron que la charte proscrit : « une
 * couleur de statut ne représente jamais une série, ni l'inverse » — les
 * teintes de succès/alerte/danger sont RÉSERVÉES à un état (bon → critique) et
 * ne s'empruntent JAMAIS pour une identité, même assombries, même quand rien
 * de mauvais n'est réellement encodé. Un lecteur qui reconnaît l'ambre ou le
 * rouge ailleurs dans l'appli lirait une alerte qui n'existe pas.
 *
 * Le dépôt n'expose que DEUX teintes non sémantiques (la primaire et
 * l'information) ; succès/alerte/danger restent hors jeu. Pour couvrir quatre
 * profils avec deux teintes sans jamais confondre deux séries, le second canal
 * est le TRAIT : plein pour les deux premières séries, tireté pour les deux
 * suivantes. Une même teinte peut donc revenir (rang 1 et 3 partagent la
 * primaire), mais jamais avec le même trait — et l'identité ne repose de toute
 * façon jamais sur la couleur seule : la légende et le tableau portent le nom
 * de chaque profil en toutes lettres.
 */
const SERIES_COLOURS = [
  'var(--bellum-primary-500)',
  'var(--bellum-info)',
  'var(--bellum-primary-500)',
  'var(--bellum-info)',
] as const
/** `undefined` = trait plein. Rang 3 et 4 : le second canal d'identité. */
const SERIES_DASH: readonly (string | undefined)[] = [undefined, undefined, '6 3', '2 3']

const GEOMETRY: RadarGeometry = { centre: 130, radius: 100 }
const VIEWBOX = 260
/** Les anneaux de repère — 25 / 50 / 75 / 100. Discrets : ils situent, ils ne parlent pas. */
const RINGS = [0.25, 0.5, 0.75, 1]

export function MatchRadar({ profiles, title }: { profiles: readonly RadarProfile[]; title: string }) {
  const { t } = useTranslation(['consultants', 'matching'])
  const chartId = useId()
  // Jamais plus de quatre : au-delà, treize branches superposées ne se lisent
  // plus. Le retrait est DIT, il ne se devine pas d'une liste plus courte.
  const shown = profiles.slice(0, RADAR_MAX_PROFILES)
  const dropped = profiles.length - shown.length

  if (shown.length < RADAR_MIN_PROFILES) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('consultants:radar.needsTwo')}
      </Text>
    )
  }

  const spokes = axisSpokes(GEOMETRY)

  return (
    <Box className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <Box className="w-full shrink-0 lg:w-[22rem]">
        <svg
          role="img"
          aria-labelledby={`${chartId}-title`}
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          className="h-auto w-full"
        >
          <title id={`${chartId}-title`}>{t('consultants:radar.chartName', { title })}</title>
          <defs>
            {/* La TEXTURE du « non évaluable ». Un id stable : le composant n'est
                jamais monté deux fois sur le même écran, et le test le lit. */}
            <pattern
              id="bellum-radar-hatch"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--bellum-text-muted)" strokeWidth="1.5" opacity="0.45" />
            </pattern>
          </defs>

          {RINGS.map(ring => (
            <circle
              key={ring}
              cx={GEOMETRY.centre}
              cy={GEOMETRY.centre}
              r={GEOMETRY.radius * ring}
              fill="none"
              stroke="var(--bellum-border)"
              strokeWidth="1"
            />
          ))}

          {spokes.map(spoke => {
            const evaluability = axisEvaluability(shown, spoke.axis)
            const label = t(`matching:axes.${spoke.axis}`)
            return (
              <g key={spoke.axis} data-axis={spoke.axis} data-evaluability={evaluability}>
                <title>{label}</title>
                {/* La branche non évaluable pour TOUT LE MONDE est hachurée sur
                    toute sa longueur : c'est la seule situation où « on n'a pas
                    pu juger » est vrai de chacun. */}
                {evaluability === 'none' ? (
                  <line
                    x1={GEOMETRY.centre}
                    y1={GEOMETRY.centre}
                    x2={spoke.x}
                    y2={spoke.y}
                    stroke="url(#bellum-radar-hatch)"
                    strokeWidth="10"
                    strokeLinecap="butt"
                  />
                ) : null}
                <line
                  x1={GEOMETRY.centre}
                  y1={GEOMETRY.centre}
                  x2={spoke.x}
                  y2={spoke.y}
                  stroke="var(--bellum-border)"
                  strokeWidth="1"
                />
                <text
                  x={GEOMETRY.centre + (spoke.x - GEOMETRY.centre) * 1.16}
                  y={GEOMETRY.centre + (spoke.y - GEOMETRY.centre) * 1.16}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-xs"
                  fill="var(--bellum-text-muted)"
                >
                  {spoke.index + 1}
                </text>
              </g>
            )
          })}

          {shown.map((profile, rank) => (
            <g key={profile.id} data-series={profile.id}>
              {radarSegments(profile, GEOMETRY).map((segment, part) => (
                <polyline
                  key={`${profile.id}-${part}`}
                  points={segment.map(point => `${point.x},${point.y}`).join(' ')}
                  fill="none"
                  stroke={SERIES_COLOURS[rank]}
                  strokeWidth="2"
                  strokeDasharray={SERIES_DASH[rank]}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {radarSegments(profile, GEOMETRY)
                .flat()
                .map(point => (
                  <circle
                    key={`${profile.id}-${point.axis}`}
                    cx={point.x}
                    cy={point.y}
                    r="3"
                    fill={SERIES_COLOURS[rank]}
                    stroke="var(--bellum-surface-1)"
                    strokeWidth="2"
                  />
                ))}
            </g>
          ))}
        </svg>

        {/* La légende : l'identité ne dépend jamais de la teinte seule. */}
        <Box className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {shown.map((profile, rank) => (
            <span key={profile.id} className="inline-flex items-center gap-1.5">
              {/* Le TRAIT du témoin reprend celui du tracé (plein ou tireté) :
                  aux rangs 1 et 3, la teinte seule ne distinguerait pas les deux
                  séries — c'est le second canal qui le fait, ici comme sur le
                  graphe. */}
              <svg viewBox="0 0 16 10" className="h-2.5 w-4 shrink-0" aria-hidden="true">
                <line
                  x1="0"
                  y1="5"
                  x2="16"
                  y2="5"
                  stroke={SERIES_COLOURS[rank]}
                  strokeWidth="2.5"
                  strokeDasharray={SERIES_DASH[rank]}
                  strokeLinecap="round"
                />
              </svg>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {profile.label}
              </Text>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-[var(--bellum-surface-2)]">
              <svg viewBox="0 0 10 10" className="size-full">
                <rect width="10" height="10" fill="url(#bellum-radar-hatch)" />
              </svg>
            </span>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('consultants:radar.hatchLegend')}
            </Text>
          </span>
        </Box>

        {dropped > 0 ? (
          <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
            {t('consultants:radar.capped', { count: dropped })}
          </Text>
        ) : null}
      </Box>

      {/* Le chiffre de chaque axe, à côté du graphe — et l'alternative lisible. */}
      <Box className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('matching:compare.axis')}</TableHead>
              {shown.map(profile => (
                <TableHead key={profile.id}>{profile.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {MATCH_AXES.map((axis, index) => (
              <TableRow key={axis}>
                <TableCell>
                  <Text size="sm">{`${index + 1} · ${t(`matching:axes.${axis}`)}`}</Text>
                </TableCell>
                {shown.map(profile => {
                  const result = profile.axes.find(entry => entry.axis === axis)
                  const score = result?.score ?? null
                  return (
                    <TableCell key={profile.id} title={result?.detail ?? undefined}>
                      {/* ⚠️ Jamais `score ?? 0` : c'est la faute que tout ce
                          composant existe pour ne pas commettre. */}
                      {score === null ? <UnknownValue /> : <Text size="sm">{String(score)}</Text>}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  )
}
