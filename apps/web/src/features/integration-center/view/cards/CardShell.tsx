import { Badge, Box, Button, Card, Text } from '@bellum/ui'
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConnectorId } from '../../lib/connectors'
import { connectorLogo } from './connector-logos'

/**
 * L'enveloppe commune à toutes les cartes de l'écran Intégrations.
 *
 * Une carte porte trois choses et pas une de plus : ce que c'est, ce que ça
 * fait pour l'utilisateur, et le geste. Ce qu'elle ne porte PLUS — ce que
 * l'outil lit et écrit (`data_types`), ses limites de débit, sa politique de
 * rétention — est de l'observabilité : ça vit au back-office (#906). Un
 * commercial devant un prospect n'a que faire de « ~100 requêtes / 10 s », et
 * l'afficher expose notre chaîne d'outillage sans lui donner un geste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPACTE TANT QU'ELLE N'EST PAS BRANCHÉE — #1442 / #1447
 * ─────────────────────────────────────────────────────────────────────────────
 * *« Les cartes actuelles sont beaucoup trop hautes quand elles sont
 * déconnectées. »* Une carte non branchée dépliait ses bénéfices ET ses
 * diagnostics avant que quiconque ait cliqué : seize cartes de cette hauteur
 * font un catalogue qu'on ne parcourt pas.
 *
 * La règle est celle du retour : **le détail ne se déplie qu'une fois connecté,
 * ou sur demande.** Un connecteur branché est celui sur lequel on a une question
 * (« est-ce que ça marche ? ») ; un connecteur à brancher n'en soulève qu'une
 * (« qu'est-ce que ça m'apporte ? »), et elle tient en trois lignes.
 *
 * ⚠️ Le détail n'est jamais SUPPRIMÉ pour une carte non branchée — il est
 * REPLIÉ, derrière un bouton qui dit ce qu'il ouvre. Le retirer ferait
 * disparaître ce que l'outil sait faire au moment précis où l'on décide de le
 * brancher.
 *
 * ⚠️ 04/09/2026 — « ce que ça fait pour l'utilisateur » était une PHRASE FIGÉE,
 * la même quel que soit ce que le serveur autorise. `allowed_actions` répondait
 * déjà à la question, ligne par ligne, et n'atteignait aucun pixel (#1443). Ce
 * n'est pas de l'observabilité : c'est la raison de brancher. Il est donc rendu
 * — et `data_types` reste au back-office, la décision de #906 tient.
 */
export function CardShell({
  icon: Icon,
  connector,
  name,
  description,
  badge,
  children,
  details,
  expanded = false,
  fitContent = false,
}: {
  icon: LucideIcon
  /**
   * #1614 — de quel outil la carte parle, pour aller chercher SON logo.
   *
   * Optionnel : une carte sans connecteur (ou dont le connecteur n'a pas
   * d'éditeur — un protocole, une famille) garde son icône. L'icône reste donc
   * obligatoire, elle n'est pas remplacée : c'est le repli quand le relais ne
   * rend rien.
   */
  connector?: ConnectorId
  name: string
  description: string
  badge?: ReactNode
  children?: ReactNode
  /**
   * Ce qui ne se déplie qu'une fois branché, ou sur demande : les capacités et
   * les diagnostics. Séparé de `children`, qui porte le GESTE (le bouton
   * « Connecter ») — celui-là est toujours visible, sinon la carte ne sert plus
   * à rien une fois repliée.
   */
  details?: ReactNode
  /** Le connecteur est branché : le détail est la question qu'on se pose. */
  expanded?: boolean
  /** #4406.1 — la carte prend la hauteur de son contenu au lieu de s'étirer à la rangée (le pied ne colle plus en bas). */
  fitContent?: boolean
}) {
  const { t } = useTranslation('integrationCenter')
  const [open, setOpen] = useState(false)
  const showDetails = expanded || open
  // #3973.7 — le logo du registre unique (le même que le sélecteur de Laura), sinon l'icône générique.
  const logoSrc = connectorLogo(connector)
  return (
    // Refonte Théo (`.bo11-integration` de settings-integrations) : logo et nom en tête,
    // la phrase de bénéfice, le geste, puis un PIED séparé d'un filet — le statut à
    // gauche, le repli du détail à droite.
    <Card className={`flex flex-col gap-0 p-5 ${fitContent ? 'h-auto self-start' : 'h-full'}`}>
      <Box display="flex" className="items-center gap-3">
        {/* Le logo du registre, sinon l'icône — jamais un carré vide. `aria-hidden` : le nom de l'outil est
            écrit juste à côté, l'image ne le répète pas. Pastille `--bellum-brand-logo-chip` : lisible en
            clair comme en sombre. */}
        <span
          aria-hidden
          data-testid="connector-logo"
          className="flex size-9 shrink-0 items-center justify-center rounded-control bg-[var(--bellum-surface-2)]"
        >
          {logoSrc ? (
            <img
              src={logoSrc}
              alt=""
              width={24}
              height={24}
              loading="lazy"
              decoding="async"
              className="size-6 rounded-sm bg-[var(--bellum-brand-logo-chip)] object-contain p-0.5"
              data-testid="connector-logo-img"
            />
          ) : (
            <Icon className="size-4 text-[var(--bellum-text-secondary)]" />
          )}
        </span>
        <Text element="h3" size="base" weight="semibold" className="min-w-0 text-[var(--bellum-text-primary)]">
          {name}
        </Text>
      </Box>
      <Text size="xs" color="text-[var(--bellum-text-secondary)]" leading="relaxed" className="mt-3">
        {description}
      </Text>
      {details && showDetails ? <Box className="mt-3 space-y-3">{details}</Box> : null}

      {/* `space-y-3` : une carte porte PLUSIEURS blocs empilés — le bénéfice (#1443),
          le geste, puis le diagnostic. Sans lui, deux blocs voisins se touchent. */}
      {children && <Box className="mt-4 space-y-3">{children}</Box>}

      {/* Le pied descend au bas de la carte : les cartes d'une rangée alignent leur statut. */}
      <Box aria-hidden className="min-h-4 flex-1" />
      <Box
        display="flex"
        className="flex-wrap items-center justify-between gap-2 border-t border-[var(--bellum-border)] pt-3"
      >
        {/* #2078.13 — aucun connecteur du catalogue n'est obligatoire avant la première
            valeur (#2078.18). Une fois BRANCHÉE (badge fourni par l'appelant — connecté
            ou à reconnecter), la mention s'efface pour ne pas doubler le badge réel. */}
        {badge ?? (
          <Badge variant="outline" className="text-xs">
            {t('optionalBadge')}
          </Badge>
        )}
        {/* Le bouton n'existe QUE sur une carte repliable : sur une carte branchée
            le détail est déjà là, et un bouton « Voir le détail » qui ne replie
            rien serait un contrôle inerte. */}
        {details && !expanded ? (
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 w-fit"
            aria-expanded={open}
            onClick={() => setOpen(value => !value)}
          >
            {open ? (
              <ChevronDown className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="size-3.5 shrink-0" aria-hidden />
            )}
            {open ? t('details.hide') : t('details.show')}
          </Button>
        ) : null}
      </Box>
    </Card>
  )
}

export function ConnectedBadge() {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  return (
    <Badge variant="success" className="text-xs">
      {t('connectedBadge')}
    </Badge>
  )
}

/** Le badge d'une autorisation morte. Distinct de « connecté » à dessein : les
 *  deux se ressemblaient à l'écran, et un jeton expiré affiché « connecté »
 *  envoie chercher la panne partout sauf là où elle est. */
export function ReconnectBadge() {
  const { t } = useTranslation('integrationCenter')
  return (
    <Badge variant="destructive" className="text-xs">
      {t('states.authorization_expired')}
    </Badge>
  )
}

/**
 * #2207.17 — le badge d'un connecteur que l'offre en cours n'ouvre pas.
 *
 * Distinct d'« available » (rien n'y invite à cliquer) : sans ce badge, le
 * bouton « Connecter » promet un geste qui échoue derrière le mur de palier,
 * et l'utilisateur cherche la panne technique là où il n'y en a pas.
 */
export function NotIncludedBadge() {
  const { t } = useTranslation('integrationCenter')
  return (
    <Badge variant="outline" className="text-xs">
      {t('states.not_included_in_plan')}
    </Badge>
  )
}
