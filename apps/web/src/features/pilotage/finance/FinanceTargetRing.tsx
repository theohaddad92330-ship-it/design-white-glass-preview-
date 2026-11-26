import { MARGIN_TARGET_MAX_PERCENT, marginAttainment, type FinanceMarginTarget } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { appLocale } from '@/lib/locale'
import { useSetFinanceTarget } from '../api'

/**
 * L'ANNEAU « TAUX DE RÉALISATION » — D7 du 26/08, REFUSÉ ; **levé par Louis le
 * 31/08/2026**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE REFUS, SA RAISON, ET CE QUI A CHANGÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Les neuf maquettes montrent un anneau contre un objectif de 350 000 €. Le
 * refus tenait en une phrase juste : « une couleur d'alerte suppose un objectif,
 * et l'objectif n'est pas tranché » — l'inventer aurait été de la donnée
 * fabriquée. **Louis a levé le refus le 31/08/2026 en tranchant la forme :
 * l'objectif est un RÉGLAGE saisi par l'espace.** La cible cesse d'être notre
 * invention et devient la décision de l'ESN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS MOITIÉS QUE LE REVIREMENT NE LÈVE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Sans objectif saisi, AUCUN pourcentage.** L'anneau dit « objectif non
 *     défini » et porte le geste qui le répare. Jamais « 0 % », jamais un
 *     objectif par défaut — et ce n'est pas une consigne : `marginAttainment`
 *     rend une branche qui NE PORTE PAS de champ `percent`.
 *  2. **Aucun orange.** « L'orange dit “c'est mauvais”. Mauvais par rapport à
 *     quoi ? » Une couleur ne se dérive QUE de l'objectif saisi (`reached`) :
 *     atteint → la teinte de succès, pas encore → la teinte d'accent, neutre.
 *     Il n'y a pas de troisième cas, donc pas de place pour un seuil deviné.
 *  3. **Un objectif ne rend pas une marge mesurable.** Sous le seuil, l'anneau
 *     se tait plutôt que de donner à deux missions l'autorité d'un verdict.
 *
 * ⚠️ **Le chiffre est écrit à côté du graphe** — la seule règle de
 * visualisation que l'annexe dit vraiment importante. L'anneau porte le
 * pourcentage EN TOUTES LETTRES, et la marge et l'objectif sont écrits dessous :
 * l'arc n'est jamais la seule façon de lire la valeur.
 */
export function FinanceTargetRing({
  month,
  target,
  marginPercent,
  measurable,
  /** `false` sans `finance:write` : la lecture reste, le geste disparaît. */
  canEdit,
  /** `true` tant que la marge ou l'objectif n'est pas arrivé. */
  loading,
}: {
  month: string
  target: FinanceMarginTarget | undefined
  marginPercent: number | null | undefined
  measurable?: boolean
  canEdit: boolean
  loading: boolean
}) {
  const { t } = useTranslation('pilotage')
  const attainment = marginAttainment({ marginPercent, measurable, targetPercent: target?.targetPercent })

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2">
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('loading')}
        </Text>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
        {t('finance.target.title')}
      </Text>

      {attainment.measured ? (
        <Ring percent={attainment.percent} reached={attainment.reached} label={t('finance.target.title')} />
      ) : (
        /* Aucun arc, aucun cercle vide à 0 % : un anneau dessiné vide se lit
           « rien n'est atteint », ce qui est une affirmation. */
        <Text size="sm" weight="medium" className="text-[var(--bellum-text-muted)]">
          {t('finance.notMeasured')}
        </Text>
      )}

      {/* Le chiffre À CÔTÉ du graphe, dans les deux cas — et la raison NOMMÉE
          quand il n'y a rien à dessiner : « objectif non défini » et « pas assez
          de missions » appellent deux gestes différents. */}
      <Text size="xs" className="block text-center text-[var(--bellum-text-muted)]">
        {attainment.measured
          ? t('finance.target.reading', {
              margin: formatPercent(attainment.marginPercent),
              target: formatPercent(attainment.targetPercent),
            })
          : t(GAP_KEYS[attainment.gap])}
      </Text>

      {canEdit ? <TargetForm month={month} current={target?.targetPercent ?? null} /> : null}
    </div>
  )
}

const GAP_KEYS = {
  no_target: 'finance.target.none',
  margin_not_measured: 'finance.target.marginUnknown',
  margin_not_measurable: 'finance.target.marginNotEnough',
} as const

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat(appLocale(), { maximumFractionDigits: 1 }).format(value)} %`
}

/**
 * L'arc.
 *
 * ⚠️ Aucune couleur hexadécimale : les deux teintes sont des jetons, donc elles
 * suivent le thème. Le `stroke` d'un tracé n'est pas du texte — la règle du
 * contraste AA porte sur les couples texte/fond, et le pourcentage au centre est
 * peint, lui, en couleur de TEXTE.
 *
 * `role="img"` + `aria-label` : sans eux, un lecteur d'écran annonce un groupe
 * de tracés sans nom. La valeur reste par ailleurs écrite en toutes lettres
 * juste en dessous — l'arc n'est jamais le seul chemin vers le chiffre.
 */
function Ring({ percent, reached, label }: { percent: number; reached: boolean; label: string }) {
  const { t } = useTranslation('pilotage')
  const radius = 42
  const circumference = 2 * Math.PI * radius
  // ⚠️ L'ARC est borné à 100 %, le CHIFFRE ne l'est pas : un cercle ne peut pas
  // dessiner 160 %, mais l'écrêter à l'écrit effacerait la seule bonne nouvelle
  // que ce bloc sache donner.
  const drawn = Math.min(Math.max(percent, 0), 100)
  const stroke = reached ? 'var(--bellum-success)' : 'var(--bellum-text-accent)'

  return (
    <svg
      viewBox="0 0 100 100"
      className="h-28 w-28"
      role="img"
      aria-label={t('finance.target.aria', { label, value: formatPercent(percent) })}
    >
      <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--bellum-border)" strokeWidth="10" />
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={stroke}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${(drawn / 100) * circumference} ${circumference}`}
        // −90° : un arc qui démarre à trois heures se lit comme une horloge
        // cassée. Aucune animation — le mouvement a une grammaire, et une jauge
        // qui se remplit à chaque rendu fatigue en trois jours.
        transform="rotate(-90 50 50)"
      />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        // ⚠️ `font-size` en `rem` et jamais en pixels : un pixel ignore le
        // réglage « Taille du texte », qui agit sur la police RACINE.
        style={{ fontSize: '1.125rem', fontWeight: 600 }}
        fill={reached ? 'var(--bellum-success-text)' : 'var(--bellum-text-primary)'}
      >
        {formatPercent(percent)}
      </text>
    </svg>
  )
}

/**
 * La SAISIE de l'objectif — sans elle, la table serait « du code juste que
 * personne n'appelle », le défaut n°1 du dépôt.
 *
 * Un `<form>` et non un `<div onClick>` : ce qui se clique se tabule, et un
 * formulaire répond à la touche Entrée sans qu'on ait à l'écrire.
 */
function TargetForm({ month, current }: { month: string; current: number | null }) {
  const { t } = useTranslation('pilotage')
  const inputId = useId()
  const [value, setValue] = useState(current === null ? '' : String(current))
  const save = useSetFinanceTarget()

  // Le mois change (le sélecteur de période au-dessus) : le champ doit suivre
  // l'objectif du mois AFFICHÉ. Sans cela, la valeur de juillet resterait dans
  // le champ d'août, et un clic l'y écrirait.
  useEffect(() => {
    setValue(current === null ? '' : String(current))
  }, [current, month])

  const trimmed = value.trim()
  const parsed = trimmed === '' ? null : Number(trimmed.replace(',', '.'))
  // `null` (effacer) est valide ; un nombre hors bornes ne l'est pas. Le champ
  // refuse exactement ce que la contrainte SQL refuse — un formulaire qui laisse
  // taper ce que le serveur rejette ment à celui qui l'écrit.
  const invalid = parsed !== null && (!Number.isFinite(parsed) || parsed <= 0 || parsed > MARGIN_TARGET_MAX_PERCENT)

  return (
    <form
      className="flex flex-wrap items-end justify-center gap-2"
      onSubmit={event => {
        event.preventDefault()
        if (invalid) return
        save.mutate({ month, targetPercent: parsed })
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId}>
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('finance.target.field')}
          </Text>
        </label>
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          min={1}
          max={MARGIN_TARGET_MAX_PERCENT}
          step="0.1"
          value={value}
          aria-invalid={invalid}
          onChange={event => setValue(event.target.value)}
          className="min-h-9 w-24 rounded border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1 text-sm pointer-coarse:min-h-11"
          placeholder={t('finance.target.placeholder')}
        />
      </div>
      <button
        type="submit"
        disabled={invalid || save.isPending}
        className="min-h-9 rounded-md border border-[var(--bellum-border)] px-2 py-1 text-xs font-medium text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] disabled:opacity-50 pointer-coarse:min-h-11"
      >
        {t('finance.target.save')}
      </button>
      {/* ⚠️ `aria-live` : la confirmation d'un enregistrement qui n'apparaît que
          visuellement n'existe pas pour un lecteur d'écran. */}
      <Text size="xs" className="w-full text-center text-[var(--bellum-text-muted)]" aria-live="polite">
        {invalid
          ? t('finance.target.invalid', { max: MARGIN_TARGET_MAX_PERCENT })
          : save.isError
            ? t('finance.target.saveFailed')
            : save.isSuccess
              ? t('finance.target.saved')
              : t('finance.target.hint')}
      </Text>
    </form>
  )
}
