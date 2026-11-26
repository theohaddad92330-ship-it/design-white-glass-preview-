import { TYPE_SCALE, cn } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { FigureScope } from '@/components/primitives/FigureScope'

/**
 * L'entête du cockpit — il dit à quoi sert CET écran (#1404, #2113.19-22).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE SOUS-TITRE A CHANGÉ DE NATURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il portait la relance la plus urgente (« 3 relances en retard à traiter en
 * priorité »). C'était utile et c'est devenu faux à deux titres, le jour où
 * #1404 a posé la frontière entre les écrans :
 *
 *  · l'urgence est une DÉCISION IMMÉDIATE, donc le domaine d'« Aujourd'hui » ;
 *    la répéter ici brouille la seule chose que cet écran doit dire ;
 *  · le nombre est déjà dans la tuile « En retard », à trois centimètres —
 *    c'est la loi 4 du tome 7, « rien n'apparaît deux fois sous la même forme
 *    avec le même contenu ».
 *
 * Le sous-titre annonce donc le RÔLE de l'écran, comme le retour le rédige.
 * L'urgence n'est pas perdue : elle est dans sa tuile, et la tuile mène à sa
 * liste.
 *
 * ⚠️ Le prénom vient du PROFIL (`useFirstName`), jamais d'une chaîne. Le retour
 * écrivait « Ton cockpit, Maëlle » — c'est un exemple, pas une valeur, et le
 * livrer tel quel aurait salué tout le monde du même prénom.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2113.21/.22 — LE RÉSUMÉ NE DIT PAS « TON PORTEFEUILLE PROGRESSE »
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour d'origine cite : « Ton portefeuille progresse, mais trois comptes
 * restent sans prochaine action. » Rien dans `CockpitTrajectory` ne porte de
 * TENDANCE (aucun champ n'y compare à une période antérieure) : affirmer une
 * progression serait une donnée inventée. Seul le second membre de la phrase
 * est prouvable — `perspective.coverage.without_next_action`, le MÊME compte
 * que la tuile cliquable de `PortfolioCoverageCard` (GA-26 : un seul calcul,
 * deux appelants) — et c'est la seule partie rendue ici. `null` (feature non
 * portée par cet espace, ou compte non mesurable) n'affiche AUCUNE ligne :
 * jamais un zéro qui n'a pas été mesuré.
 */
const WITHOUT_NEXT_ACTION_HREF: string = '/accounts?headline=withoutNextAction'

export function PersonalCockpitHeader({
  firstName,
  withoutNextAction = null,
}: {
  firstName: string
  withoutNextAction?: number | null
}) {
  const { t } = useTranslation('dashboard')

  return (
    <div className="space-y-1">
      <h1 className={cn(TYPE_SCALE.pageTitle, 'text-foreground')}>{t('personal.headerTitle', { firstName })}</h1>
      <p className="text-sm text-muted-foreground">{t('personal.headerSubtitle')}</p>
      {withoutNextAction !== null && withoutNextAction > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground" data-testid="cockpit-header-summary">
            {t('personal.headerSummary', { count: withoutNextAction })}
          </p>
          {/* Même patron que la tuile `PortfolioCoverageCard` : `href` porté
              par une variable de type `string` (pas un littéral) plutôt
              qu'un `search` typé — la route `/accounts` n'a pas à connaître
              ce paramètre pour que ce lien reste juste. */}
          <Link
            to={WITHOUT_NEXT_ACTION_HREF}
            className="text-xs font-medium text-[var(--bellum-text-accent)] hover:underline pointer-coarse:min-h-11 pointer-coarse:inline-flex pointer-coarse:items-center"
          >
            {t('personal.headerCta', { count: withoutNextAction })}
          </Link>
          {/* #4298.2 — un compte d'état sur le portefeuille, pas une période. */}
          <FigureScope scope={{ period: { kind: 'now' }, sources: ['portfolio'] }} />
        </div>
      ) : null}
    </div>
  )
}
