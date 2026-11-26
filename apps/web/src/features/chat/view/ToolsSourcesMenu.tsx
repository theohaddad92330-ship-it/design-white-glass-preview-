import { toolFamiliesOf, type ConnectedClientTool, type ToolFamily } from '@bellum/contracts'
import { AlertTriangle, ChevronDown, Plug } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Popover, PopoverContent, PopoverTrigger, Text } from '@bellum/ui'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { connectedToolLogo } from './brand-logos'
import { connectedToolIcon } from './connected-tool-icons'

/**
 * #5046 / #5048 — FORME V8, FONCTION GARDÉE (Louis, 31/10/2026). Le menu « Outils de cette
 * conversation » DIT l'état de chaque outil branché (logo, nom, connecté / à reconnecter / limité,
 * capacités, « reste lu via X ») ; il ne COCHE plus : la sélection vit dans les puces « Tes outils
 * avec Laura » (`ComposerToolChips`), le seul endroit (GA-26, arbitrage du 31/10). Un outil « à
 * reconnecter » renvoie vers `/integrations` — aucune connexion ne se gère dans la conversation.
 * Les exclusions choisies via les puces partent toujours avec le tour (`excludedToolFamilies`).
 * Revient sur la case par outil de #3708.
 *
 * #3708 — « OUTILS ET SOURCES » : UNE entrée compacte dans la rangée de la saisie,
 * qui REMPLACE les bulles d'outils alignées (`ConnectedToolsStrip`, retirée).
 *
 * Ce que le menu promet, et tient :
 * - Portée dite : « cette conversation ». Une case décochée a un effet RÉEL —
 *   `Chat` transmet les familles coupées (`excludedToolFamilies`) et le service
 *   IA retire leurs outils du catalogue du tour. Ce n'est pas une mention.
 * - Désélection ≠ déconnexion : rien n'est écrit dans Réglages › Intégrations,
 *   dont le lien est au pied du menu (une seule gestion des connexions).
 * - Quatre états, tous lus sur le registre : connecté, accès limité (lecture seule,
 *   écriture partielle, portée non accordée), autorisation expirée, non connecté.
 *   « Non connecté » se dit par BESOIN (« ton CRM »), en une ligne de texte sous
 *   la liste — jamais une case, jamais un éditeur : une absence ne fait pas de
 *   ligne dans une liste (doctrine 20/09) et on ne nomme que ce que l'espace a branché.
 * - Sélectionner un outil d'envoi autorise sa PRÉPARATION, jamais un envoi.
 * - Les noms viennent des connexions (`connectedClientTools`), jamais écrits ici ;
 *   le logo (`connectedToolLogo`, fichiers SVG à licence écrite) quand il existe,
 *   sinon l'icône de Réglages › Intégrations (`connectedToolIcon`) — logo autorisé
 *   pour ce sélecteur (décision Louis 05/10/2026, livré le 15/10/2026, `doctrine.md`).
 *
 * Rien quand rien n'est branché : pas de ligne de bruit sous chaque saisie.
 * ⚠️ Une exception, la salle de démonstration : rien n'y est branché POUR DE VRAI (aucune
 * ligne de connexion, aucun jeton — le registre montre messagerie et CRM « en lecture »,
 * `tool-registry/demo-connections.ts`) et ses réponses scriptées ne consultent aucune
 * source. L'entrée y reste visible pour montrer où se règle le périmètre, et le dit
 * franchement (la note) que des outils soient listés ou non (G.6).
 */
export function ToolsSourcesMenu({
  tools,
  unconnectedFamilies = [],
  excludedProviders,
  disabled,
}: {
  tools: readonly ConnectedClientTool[]
  /** #3708.2 — familles branchables et non branchées : une ligne de texte, jamais une case. */
  unconnectedFamilies?: readonly ToolFamily[]
  excludedProviders: readonly string[]
  disabled?: boolean
}) {
  const { t } = useTranslation('chat')
  const [open, setOpen] = useState(false)
  const groupId = useId()
  const isDemo = useIsDemo()
  if (tools.length === 0 && !isDemo) return null
  const selected = tools.filter(tool => !excludedProviders.includes(tool.provider)).length
  const summary =
    selected === tools.length
      ? t('toolsSources.trigger')
      : t('toolsSources.triggerCount', { selected, total: tools.length })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={summary}
          className="min-h-11 min-w-11 shrink-0 gap-1 rounded-full text-[var(--bellum-text-secondary)]"
        >
          <Plug className="size-3.5 shrink-0" aria-hidden />
          <span className="hidden max-w-[12rem] truncate whitespace-nowrap sm:inline">{summary}</span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </Button>
      </PopoverTrigger>
      {/* #3708 — 810 px de haut, y = −152 dans 827 px : la hauteur se borne à la fenêtre (`dvh`, jamais
          `vh`) ET à la place que Radix mesure, et la collision/le flip garde le popover dans l'écran.
          Recette 07/10 — le défilement vivait sur CE conteneur entier : la dernière ligne (« Google
          Drive ») partait avec le pied (« Gérer les connexions » / « Terminé »), coupée en bas d'un
          popover court. La colonne est maintenant un flex : le titre et le pied restent fixes, SEULE
          la liste défile dans sa propre région bornée (`min-h-0` : sans lui, un enfant flex refuse de
          rétrécir sous sa hauteur de contenu, et ne défilerait jamais). */}
      <PopoverContent
        align="start"
        collisionPadding={16}
        avoidCollisions
        // #3708 — après « Terminé », le popover reste monté le temps de l'animation de sortie (Radix
        // Presence) et captait les clics suivants (« Gérer les connexions » → /integrations) :
        // fermé, il ne capte plus aucun clic.
        className="flex w-80 data-[state=closed]:pointer-events-none max-w-[calc(100vw-2rem)] max-h-[min(calc(100dvh-2rem),var(--radix-popover-content-available-height))] flex-col gap-2 overflow-y-auto p-2"
      >
        {/* #3708 (recette prod 09/10) — « entrée Outlook rognée sous le texte
            de pied (~40 px) » : le titre, le pied et les notes AUTOUR de la
            liste n'avaient pas de hauteur protégée (`shrink-0`) — quand le
            popover manquait de place, flexbox les COMPRESSAIT au lieu de
            laisser la LISTE (seule `flex-1`) absorber la contrainte, et leur
            texte chevauchait la dernière ligne au lieu de rester sous elle. */}
        <Text id={groupId} size="sm" weight="medium" className="shrink-0 px-2 pt-1">
          {t('toolsSources.title')}
        </Text>
        <Text size="xs" className="shrink-0 px-2 text-[var(--bellum-text-secondary)]">
          {t('toolsSources.scope')}
        </Text>
        {isDemo ? (
          <Text size="xs" className="shrink-0 px-2 text-[var(--bellum-text-secondary)]">
            {t('toolsSources.demoNote')}
          </Text>
        ) : null}
        {/* #3708.a (recette prod 09/10, build aef69661e9) — « ligne Outlook rognée à y 486-506,
            pied à 509 » : le pied ne chevauchait plus rien, c'est la LISTE qui tranchait sa
            dernière ligne contre un plafond FIXE (`max-h-80`, 320 px), quelle que soit la place
            réelle. Plus de plafond propre : la liste prend la hauteur bornée du popover (flex) et
            ne défile que quand la fenêtre manque de place — zone délimitée, dernière ligne
            décollée du bord. */}
        <ul
          aria-labelledby={groupId}
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain border-y border-[var(--bellum-border)] pt-1 pb-2"
        >
          {tools.map(tool => {
            const Icon = connectedToolIcon(tool)
            // #3973 (Louis 05/10, livré 15/10) — le logo quand un fichier à licence écrite existe, sinon l'icône.
            const logo = connectedToolLogo(tool.provider, tool.family)
            const isSelected = !excludedProviders.includes(tool.provider)
            const stillRead = isSelected ? undefined : stillReadThrough(tool, tools, excludedProviders)
            return (
              <li key={tool.provider}>
                {(() => {
                  const body = (
                    <>
                      {logo ? (
                        <img
                          src={logo}
                          alt=""
                          width={16}
                          height={16}
                          loading="lazy"
                          decoding="async"
                          aria-hidden
                          className="size-4 shrink-0 rounded-sm bg-[var(--bellum-brand-logo-chip)] object-contain p-px"
                          data-testid={`tool-logo-${tool.provider}`}
                        />
                      ) : (
                        <Icon className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm text-[var(--bellum-text-primary)]">{tool.name}</span>
                        <span
                          className={`flex items-center gap-1 text-xs ${
                            tool.needsReconnect || tool.limited
                              ? 'text-[var(--warning-soft-text)]'
                              : 'text-[var(--bellum-text-muted)]'
                          }`}
                        >
                          {tool.needsReconnect || tool.limited ? (
                            <AlertTriangle className="size-3 shrink-0" aria-hidden />
                          ) : null}
                          {t(
                            tool.needsReconnect
                              ? 'composer.connectedTools.stateNeedsReconnect'
                              : tool.limited
                                ? 'composer.connectedTools.stateLimited'
                                : 'composer.connectedTools.stateConnected',
                          )}
                        </span>
                        {tool.needsReconnect ? (
                          // #5046 — un lien LIBELLÉ vers /integrations (la ligne n'est plus un lien entier) :
                          // aucune connexion ne se gère dans la conversation.
                          <Link
                            to="/integrations"
                            className="inline-flex min-h-11 items-center self-start rounded-md text-xs font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
                          >
                            {t('toolsSources.reconnect')}
                          </Link>
                        ) : (
                          <span className="text-xs text-[var(--bellum-text-muted)]">
                            {t(isSelected ? 'toolsSources.stateRead' : 'toolsSources.stateExcluded')}
                          </span>
                        )}
                        {stillRead ? (
                          <span className="text-xs text-[var(--bellum-text-muted)]">
                            {t('toolsSources.familyStillRead', { name: stillRead.name })}
                          </span>
                        ) : null}
                        {/* #3774.3.1 — les capacités RÉELLES et VÉRIFIÉES (jamais devinées depuis le
                            catalogue) : une absence ne fait AUCUNE ligne (doctrine). Mêmes libellés que
                            Réglages › Intégrations — un seul endroit (GA-26). */}
                        {tool.capabilities && tool.capabilities.length > 0 ? (
                          <span className="text-xs text-[var(--bellum-text-muted)]">
                            {tool.capabilities.map(key => t(`integrationCenter:capabilityKeys.${key}`)).join(', ')}
                          </span>
                        ) : null}
                      </span>
                    </>
                  )
                  const rowClass =
                    'flex min-h-11 items-center gap-2 rounded-lg border border-[var(--bellum-border)] px-3 py-2'
                  return <div className={rowClass}>{body}</div>
                })()}
              </li>
            )
          })}
        </ul>
        {unconnectedFamilies.length > 0 ? (
          <Text size="xs" className="shrink-0 px-2 text-[var(--bellum-text-secondary)]">
            {t('toolsSources.notConnected', {
              families: unconnectedFamilies.map(family => t(`composer.connector.family.${family}`)).join(', '),
            })}
          </Text>
        ) : null}
        <Text size="xs" className="shrink-0 px-2 text-[var(--bellum-text-secondary)]">
          {t('toolsSources.noSend')}
        </Text>
        {/* #5046 (recette prod 01/11) — au PIED, plus dans l'en-tête : désélection ≠ déconnexion. */}
        <Text size="xs" className="shrink-0 px-2 text-[var(--bellum-text-secondary)]">
          {t('toolsSources.noDisconnect')}
        </Text>
        <div className="flex shrink-0 items-center justify-between gap-2 px-1">
          <Link
            to="/integrations"
            className="inline-flex min-h-11 items-center rounded-md px-2 text-xs text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('toolsSources.manage')}
          </Link>
          <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setOpen(false)}>
            {t('toolsSources.done')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * L'outil coché qui lit ENCORE ce que l'outil décoché lisait. #3973 — un outil
 * multi-familles (Microsoft 365 : messagerie ET agenda) n'est « encore lu » que si
 * CHACUNE de ses familles l'est : sinon la phrase promettrait une lecture qui n'a
 * plus lieu. Nomme l'outil qui porte sa famille principale.
 */
function stillReadThrough(
  tool: ConnectedClientTool,
  tools: readonly ConnectedClientTool[],
  excludedProviders: readonly string[],
): ConnectedClientTool | undefined {
  const others = tools.filter(other => other.provider !== tool.provider && !excludedProviders.includes(other.provider))
  const servedBy = (family: ToolFamily) => others.find(other => toolFamiliesOf(other).includes(family))
  return toolFamiliesOf(tool).every(servedBy) ? servedBy(tool.family) : undefined
}
