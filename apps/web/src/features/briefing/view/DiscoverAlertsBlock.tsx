import type { DiscoverAlertEvent } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'

/**
 * #2151.23 / #2151.61 — UNE ALERTE IMPORTANTE APPARAÎT DANS AUJOURD'HUI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE BLOC DIT, ET CE QU'IL NE DIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque ligne porte TROIS choses, et jamais moins : ce qui est apparu (le
 * genre), d'où on le sait (la NATURE de la source — jamais l'éditeur qui nous
 * la vend), et QUAND. Une ligne qui dirait « nouveau signal » sans date ni
 * source serait une affirmation qu'on ne peut ni vérifier ni contredire — c'est
 * exactement ce que « Nouveau signal détecté » disait au bloc d'à côté avant
 * qu'on lui rende sa date.
 *
 * ⚠️ **LE VIDE SE DIT AVEC UNE DATE, JAMAIS AVEC UN ZÉRO.** « 0 alerte »
 * affirmerait quelque chose du MARCHÉ ; « aucun déclenchement depuis le 14
 * septembre » dit ce qu'on sait — qu'on regarde, et que rien n'est apparu. Et
 * quand on n'a même pas de date, on le dit aussi (« depuis qu'on surveille »)
 * plutôt que d'en fabriquer une.
 *
 * ⚠️ Aucune probabilité, sous aucune formulation : pas de « chance que ce signal
 * devienne une affaire ». Une alerte SIGNALE ; le commercial décide.
 *
 * ⚠️ #2151.24 — le DÉTAIL vit sur l'objet. `href` vaut `null` quand l'objet n'a
 * pas d'écran : la ligne s'affiche alors comme un CONSTAT, sans lien mort.
 */
export function DiscoverAlertsBlock({
  alerts,
  lastEventAt,
}: {
  // ⚠️ `| undefined` : entre le déploiement du front et celui de l'API,
  // l'écran peut recevoir une réponse d'AVANT ce champ — même tolérance que
  // `ChainBlockersBlock` juste au-dessus dans BriefingPage, pour la même
  // raison (cf. `discoverAlerts` dans daily-briefing.ts).
  alerts: readonly DiscoverAlertEvent[] | undefined
  lastEventAt: string | null
}) {
  const { t, i18n } = useTranslation('briefing')

  if (!alerts || alerts.length === 0) {
    const date = formatDay(lastEventAt, i18n.language)
    return (
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {date ? t('discoverAlerts.emptySince', { date }) : t('discoverAlerts.emptyNever')}
      </Text>
    )
  }

  return (
    <Box className="flex flex-col gap-2">
      {alerts.map(alert => {
        const day = formatDay(alert.occurredAt, i18n.language)
        const attribute = t(day ? 'discoverAlerts.on' : 'discoverAlerts.undated', {
          kind: t(`discoverAlerts.kind.${alert.kind}`),
          source: t(`discoverAlerts.source.${alert.sourceKind}`),
          date: day ?? '',
        })
        const label = alert.subjectLabel.trim()

        // #2097.21 (correctif) — LE LOGO DU COMPTE, quand le sujet EN EST un.
        // Mesuré en recette le 25/09 : cette section ne rendait AUCUNE image.
        // Seul `new_signal` porte un sujet dont on SAIT que c'est un compte
        // (`briefing.controller.ts`) — un besoin ou une mission n'a ni logo
        // ni site (même doctrine que `businessObject.logoUrl`), donc les
        // autres genres urgents restent en texte seul plutôt que de montrer
        // un monogramme pour un objet qui n'est pas une entreprise.
        const isAccountSubject = alert.kind === 'new_signal'

        return (
          <Box
            key={alert.id}
            className="flex flex-col gap-0.5 rounded-lg border border-[var(--bellum-border)] px-3 py-2"
          >
            <Box className="flex items-center gap-2">
              {isAccountSubject ? (
                <CompanyAvatar
                  name={label || t(`discoverAlerts.kind.${alert.kind}`)}
                  logoUrl={alert.logoUrl}
                  website={alert.website}
                />
              ) : null}
              {alert.href ? (
                // Un lien porte le nom de l'objet : c'est ce qu'on clique, et
                // c'est ce que le lecteur d'écran annonce.
                <Link to={alert.href} className="min-w-0 underline">
                  <Text element="span" size="sm">
                    {label || t(`discoverAlerts.kind.${alert.kind}`)}
                  </Text>
                </Link>
              ) : (
                <Text element="span" size="sm">
                  {label || t(`discoverAlerts.kind.${alert.kind}`)}
                </Text>
              )}
            </Box>
            <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
              {attribute}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

/**
 * Le JOUR, dans la langue de l'utilisateur — ou `null` quand la date est
 * illisible. On ne remplace jamais une date qu'on n'a pas su lire par
 * aujourd'hui : ce serait rajeunir un fait à chaque affichage.
 */
function formatDay(value: string | null, language: string): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long' }).format(parsed)
}
