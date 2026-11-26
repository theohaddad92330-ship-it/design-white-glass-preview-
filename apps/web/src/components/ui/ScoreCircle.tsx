import { accountScoreColor } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'

interface ScoreCircleProps {
  /**
   * 0-10, or `null` when the account has never been scored.
   *
   * `null` is NOT 0: `accountScoreColor` paints a 0 red (NO-GO, "we evaluated
   * this account and it is not worth pursuing") whereas an unscored account has
   * simply not been analysed yet. Call sites used to collapse the two with
   * `?? 0`, so the dashboard showed a red 0/10 for an account the accounts
   * table showed as « - ».
   */
  score: number | null
  size?: 'sm' | 'md' | 'lg' // 32px / 48px / 64px
}

const SIZE_MAP = { sm: 32, md: 48, lg: 64 }
const STROKE_MAP = { sm: 2.5, md: 3, lg: 4 }

/** L'échelle de `priority_score`. Un score ne s'affiche jamais sans elle. */
const SCORE_MAX = 10

// Canonical bands (GO >= 7 / PRUDENT 5-6 / NO-GO < 5) — was green >= 8 / amber
// >= 3, which coloured most PRUDENT and even STOP accounts as "GO green".
const scoreColor = accountScoreColor

/**
 * La pastille de score d'un compte — l'arc porte la VALEUR, pas une animation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI IL N'Y A PLUS DE `motion.circle` ICI
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 27/08/2026 sur `/accounts` : les 25 lignes rendaient
 * `stroke-dashoffset = 84.82300164692441`, c'est-à-dire **la circonférence
 * entière** — un arc vide — quel que soit le score. Seule la couleur variait,
 * ce qui a masqué le défaut pendant des mois.
 *
 * La cause n'était pas un calcul faux, c'était l'ENDROIT où la valeur vivait.
 * L'arc était un `motion.circle` avec `initial = circonférence` (anneau vide)
 * et `animate = circonférence − remplissage`. Autrement dit :
 *
 *   - ce que React COMMET dans le DOM est l'anneau VIDE, pour toujours ;
 *   - la vraie valeur n'est jamais écrite que par la boucle d'images de
 *     framer-motion, en `setAttribute`, pendant 1,2 s après le montage.
 *
 * Il suffit donc que cette boucle ne tourne pas pour que la jauge reste vide
 * définitivement — et `requestAnimationFrame` ne se déclenche pas dans un
 * onglet qui n'est pas visible. Une liste ouverte en arrière-plan (clic milieu,
 * restauration de session, capture d'écran, impression) affiche 0 % partout, et
 * rien ne le rattrape tant que quelque chose ne relance pas l'animation.
 * `getAnimations()` ne le montrait pas non plus : framer anime un ATTRIBUT SVG
 * en JavaScript, jamais par l'API Web Animations, donc il n'y avait aucune
 * animation « en attente » à trouver.
 *
 * Même sur un onglet visible, l'anneau annonçait 0 % pendant 1,2 s au-dessus
 * d'une donnée déjà chargée — exactement ce que la loi 3 de
 * `packages/ui/src/motion.ts` interdit : « si une donnée est prête, elle
 * s'affiche ; l'animation l'accompagne, elle ne la précède pas ». Et 1,2 s
 * n'est aucun des quatre paliers de `DURATION`.
 *
 * La correction est structurelle : **l'arc est rendu tel qu'il vaut**, dès la
 * première peinture, sans dépendre d'une horloge. Le mouvement retiré ne
 * répondait à aucune des cinq questions du §16 du tome 7.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ET L'ÉCHELLE
 * ─────────────────────────────────────────────────────────────────────────
 * Le chiffre affiché est nu par nécessité — « 4/10 » n'est pas lisible dans un
 * cercle de 32 px. Il porte donc son barème par son NOM accessible et son
 * infobulle : sans eux, un lecteur voit « 4 » à côté d'un « 14/25 » et d'un
 * « 83/100 » sur la fiche du même compte, sans pouvoir savoir lequel il lit.
 */
export function ScoreCircle({ score, size = 'md' }: ScoreCircleProps) {
  const { t } = useTranslation('common')
  const px = SIZE_MAP[size]
  const sw = STROKE_MAP[size]
  const r = (px - sw * 2) / 2
  const circ = 2 * Math.PI * r
  const color = scoreColor(score)
  // En rem, et sur l'échelle : un chiffre en pixels ignore le réglage
  // « Taille du texte » des préférences, et 10 px était sous le plancher.
  const fontSize = size === 'lg' ? '1rem' : size === 'md' ? '0.875rem' : '0.75rem'
  // Unscored: empty ring + a dash in ghost grey, never a filled/red zero.
  const fillRatio = score === null ? 0 : clampRatio(score / SCORE_MAX)
  const dashOffset = circ - fillRatio * circ
  const label = score === null ? t('score.accountUnknown') : t('score.accountGauge', { score, max: SCORE_MAX })

  return (
    <div className="relative" style={{ width: px, height: px }} role="img" aria-label={label} title={label}>
      <svg width={px} height={px} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true" focusable="false">
        {/* Track */}
        <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke="var(--bellum-border)" strokeWidth={sw} />
        {/* Fill — la valeur, écrite en clair dans le DOM. */}
        <circle
          data-testid="score-circle-fill"
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" style={{ transform: 'rotate(0deg)' }}>
        <span aria-hidden="true" style={{ fontSize, fontWeight: 700, color, fontFamily: "'Geist Mono', monospace" }}>
          {score === null ? '—' : score}
        </span>
      </div>
    </div>
  )
}

/** Un score hors barème ne dessine ni un arc négatif ni plus d'un tour. */
function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0
  return Math.min(1, Math.max(0, ratio))
}
