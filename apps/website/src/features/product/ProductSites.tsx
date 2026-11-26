'use client'

import { Card, Text } from '@bellum/ui'
import { motion, useReducedMotion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Kicker } from '@/features/landing/Kicker'

/* Real metropolitan-France outline, ported verbatim from the web app
   (apps/web SitesFranceCard): naive equirectangular projection so a dot
   placed at a city's real lat/lng lands inside the silhouette. */
const FRANCE_BOUNDS = { west: -5.5, east: 9.6, south: 41.2, north: 51.2 }
const VIEW = { width: 720, height: 760 }

function project(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - FRANCE_BOUNDS.west) / (FRANCE_BOUNDS.east - FRANCE_BOUNDS.west)) * VIEW.width
  const y = ((FRANCE_BOUNDS.north - lat) / (FRANCE_BOUNDS.north - FRANCE_BOUNDS.south)) * VIEW.height
  return { x, y }
}

const BORDER_POINTS: [number, number][] = [
  [51.05, 2.37],
  [50.43, 2.83],
  [50.0, 4.15],
  [49.62, 5.86],
  [49.18, 6.7],
  [48.95, 8.05],
  [48.58, 7.75],
  [47.75, 7.34],
  [46.5, 6.65],
  [45.88, 6.87],
  [45.13, 6.95],
  [44.55, 7.05],
  [43.93, 7.46],
  [43.55, 7.05],
  [43.4, 5.4],
  [43.18, 3.05],
  [42.5, 3.05],
  [42.5, 1.7],
  [42.97, -1.4],
  [44.66, -1.16],
  [45.62, -1.04],
  [46.16, -1.55],
  [46.92, -2.08],
  [47.55, -2.93],
  [47.74, -3.36],
  [48.0, -4.78],
  [48.66, -3.99],
  [49.39, -1.55],
  [49.65, -1.62],
  [49.42, 0.06],
  [50.05, 1.36],
  [50.96, 1.85],
]

const CORSICA_POINTS: [number, number][] = [
  [43.0, 9.4],
  [42.7, 9.55],
  [42.0, 9.4],
  [41.6, 9.27],
  [41.7, 8.7],
  [42.55, 8.55],
  [43.0, 9.4],
]

function toPath(points: [number, number][]): string {
  return (
    points
      .map((p, i) => {
        const { x, y } = project(p[0], p[1])
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ') + ' Z'
  )
}

const FRANCE_OUTLINE = toPath(BORDER_POINTS)
const CORSICA_OUTLINE = toPath(CORSICA_POINTS)

/**
 * Ce qu'un site vaut pour CE vendeur — `fits` / `below` / `unknown`.
 *
 * La carte affichait « score 92 », « score 85 »… : un score sur cent inventé
 * pour l'illustration, alors que le produit ne note aucun site sur cent. Il
 * rend un verdict à trois états, et le troisième est le plus important : un
 * site dont on ne connaît pas l'effectif n'est pas un petit site, et le
 * classer comme tel ferait perdre exactement les sites qu'on vient de trouver.
 * Le site vend donc ce que le produit fait — pas un chiffre plus vendeur.
 */
type FitKey = 'fits' | 'below' | 'unknown'

/* `typeKey` indexes the `sites.types` messages record; the human-readable
   label is resolved at render so the map stays locale-aware. */
type Pin = { lat: number; lng: number; fill: string; city: string; typeKey: string; fitKey: FitKey; hq?: boolean }

/* Coordinates are nudged a touch inland where a city sits right on the
   simplified outline, so every dot lands inside the silhouette. */
const PINS: Pin[] = [
  { lat: 48.8566, lng: 2.3522, fill: '#9b85ff', city: 'Paris', typeKey: 'siege', fitKey: 'fits', hq: true },
  { lat: 50.4, lng: 3.0, fill: '#4d9dff', city: 'Lille', typeKey: 'bureaux', fitKey: 'fits' },
  { lat: 48.55, lng: 7.45, fill: '#4d9dff', city: 'Strasbourg', typeKey: 'bureaux', fitKey: 'unknown' },
  { lat: 45.7578, lng: 4.832, fill: '#e6a23c', city: 'Lyon', typeKey: 'etablissement', fitKey: 'fits' },
  { lat: 43.6047, lng: 1.4442, fill: '#e6a23c', city: 'Toulouse', typeKey: 'etablissement', fitKey: 'fits' },
  { lat: 44.8378, lng: -0.5792, fill: '#36e6a0', city: 'Bordeaux', typeKey: 'siteIndustriel', fitKey: 'below' },
  { lat: 43.55, lng: 5.3, fill: '#36e6a0', city: 'Marseille', typeKey: 'siteIndustriel', fitKey: 'unknown' },
  { lat: 47.2184, lng: -1.5536, fill: '#4d9dff', city: 'Nantes', typeKey: 'bureaux', fitKey: 'below' },
]

const SITES: { city: string; region: string; typeKey: string; fitKey: FitKey }[] = [
  { city: 'Paris', region: 'Île-de-France', typeKey: 'siege', fitKey: 'fits' },
  { city: 'Lyon', region: 'Auvergne-Rhône-Alpes', typeKey: 'etablissement', fitKey: 'fits' },
  { city: 'Lille', region: 'Hauts-de-France', typeKey: 'bureaux', fitKey: 'fits' },
  { city: 'Toulouse', region: 'Occitanie', typeKey: 'etablissement', fitKey: 'unknown' },
]

/** Vert = correspond, ambre = sous le seuil, gris = pas encore qualifié. */
const FIT_TONE: Record<FitKey, string> = {
  fits: 'text-[#36e6a0]',
  below: 'text-[#e6a23c]',
  unknown: 'text-zinc-400',
}

const REGIONS = [
  { label: 'Île-de-France', pct: 100, count: 54 },
  { label: 'Auvergne-Rhône-Alpes', pct: 70, count: 38 },
  { label: 'Hauts-de-France', pct: 54, count: 29 },
]

const LEGEND = [
  { c: '#9b85ff', key: 'siege' },
  { c: '#4d9dff', key: 'bureaux' },
  { c: '#e6a23c', key: 'etablissements' },
  { c: '#36e6a0', key: 'sitesIndustriels' },
]

export function ProductSites() {
  const t = useTranslations('product')
  const reduce = useReducedMotion()
  const [hovered, setHovered] = useState<number | null>(null)
  const active = hovered != null ? PINS[hovered] : null
  const activePos = active ? project(active.lat, active.lng) : null

  return (
    <section className="py-14">
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Kicker center>{t('sites.kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(26px,3.2vw,38px)] leading-tight"
          >
            {t('sites.title')}
          </Text>
          <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-xl leading-relaxed">
            {t('sites.desc')}
          </Text>
        </div>

        <Card className="mt-10 overflow-hidden rounded-2xl border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] backdrop-blur-[16px]">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
            <Text element="span" size="sm" weight="medium" color="text-zinc-200">
              {t('sites.cardTitle')}
            </Text>
            <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-300">
              {t('sites.cardBadge')}
            </span>
          </div>

          <div className="grid items-center gap-6 p-6 md:grid-cols-[minmax(0,400px)_1fr]">
            <div>
              <div className="relative">
                <svg
                  viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
                  role="img"
                  aria-label={t('sites.mapAria')}
                  className="h-auto w-full"
                >
                  <path
                    d={FRANCE_OUTLINE}
                    fill="rgba(139,92,246,0.05)"
                    stroke="rgba(155,133,255,0.35)"
                    strokeWidth={1.5}
                  />
                  <path
                    d={CORSICA_OUTLINE}
                    fill="rgba(139,92,246,0.05)"
                    stroke="rgba(155,133,255,0.35)"
                    strokeWidth={1.5}
                  />
                  {PINS.map((pin, i) => {
                    const { x, y } = project(pin.lat, pin.lng)
                    const on = hovered === i
                    return (
                      <g
                        key={pin.city}
                        className="cursor-pointer"
                        onMouseEnter={() => setHovered(i)}
                        onMouseLeave={() => setHovered(h => (h === i ? null : h))}
                      >
                        <circle cx={x} cy={y} r={pin.hq ? 16 : 11} fill={pin.fill} opacity={on ? 0.4 : 0.22} />
                        <circle cx={x} cy={y} r={(pin.hq ? 8 : 5.5) + (on ? 2 : 0)} fill={pin.fill} />
                      </g>
                    )
                  })}
                </svg>

                {active && activePos && (
                  <div
                    className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-white/[0.14] bg-[rgba(16,16,28,0.96)] px-2.5 py-1.5 shadow-xl backdrop-blur"
                    style={{
                      left: `${(activePos.x / VIEW.width) * 100}%`,
                      top: `${(activePos.y / VIEW.height) * 100 - 2}%`,
                    }}
                  >
                    <div className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-white">
                      <span className="size-2 rounded-full" style={{ background: active.fill }} />
                      {active.city}
                    </div>
                    <div className="whitespace-nowrap text-xs text-zinc-400">
                      {t(`sites.types.${active.typeKey}`)} ·{' '}
                      <span className={FIT_TONE[active.fitKey]}>{t(`sites.fit.${active.fitKey}`)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {LEGEND.map(l => (
                  <span key={l.key} className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
                    <span className="size-2 rounded-full" style={{ background: l.c }} />
                    {t(`sites.legend.${l.key}`)}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 font-mono text-xs uppercase tracking-[0.1em] text-zinc-500">
                {t('sites.tablePriority')}
              </div>
              {/* Écart figma-sync — le tableau défilait le corps de page en
                  entier sous 360px. Il défile désormais dans SON conteneur
                  (§5 du design system), jamais la page. */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-xs uppercase tracking-[0.1em] text-zinc-500">
                      <th className="pb-2 text-left font-medium">{t('sites.tableVille')}</th>
                      <th className="pb-2 text-left font-medium">{t('sites.tableType')}</th>
                      <th className="pb-2 text-right font-medium">{t('sites.tableFit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SITES.map(s => (
                      <tr key={s.city} className="border-t border-white/[0.08]">
                        <td className="py-2 text-xs text-zinc-300">
                          <b className="font-medium text-white">{s.city}</b> · {s.region}
                        </td>
                        <td className="py-2">
                          <span className="rounded border border-violet-500/26 bg-violet-500/[0.12] px-1.5 py-0.5 text-xs text-violet-300">
                            {t(`sites.types.${s.typeKey}`)}
                          </span>
                        </td>
                        <td className={`py-2 text-right text-xs ${FIT_TONE[s.fitKey]}`}>
                          {t(`sites.fit.${s.fitKey}`)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mb-3 mt-5 font-mono text-xs uppercase tracking-[0.1em] text-zinc-500">
                {t('sites.geoTitle')}
              </div>
              <div className="flex flex-col gap-2.5">
                {REGIONS.map((r, i) => (
                  <div key={r.label} className="grid grid-cols-[130px_1fr_36px] items-center gap-2.5">
                    <span className="truncate text-xs text-zinc-300">{r.label}</span>
                    <span className="h-[7px] overflow-hidden rounded-full bg-white/[0.06]">
                      <motion.span
                        className="block h-full rounded-full bg-[linear-gradient(90deg,#5b3fe0,#9b85ff)]"
                        initial={reduce ? false : { width: 0 }}
                        whileInView={{ width: `${r.pct}%` }}
                        viewport={{ once: true, amount: 0.6 }}
                        transition={{ duration: 0.9, delay: i * 0.12, ease: [0.22, 0.61, 0.36, 1] }}
                      />
                    </span>
                    <span className="text-right font-mono text-xs text-zinc-400">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  )
}
