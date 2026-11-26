import { Box, Text } from '@bellum/ui'
import type { ConnectedTool } from '@bellum/contracts'
import { Eye, PenLine, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { tieredActions, type CapabilityTier } from '../../lib/capability-tiers'
import { derivedCapabilities } from '../../lib/derived-capabilities'
import { connectorActions } from './connector-benefits'

/**
 * CE QUE BELLUM PEUT FAIRE AVEC CET OUTIL — en trois rangs (#1443, puis #1444).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENNENT CES PHRASES
 * ─────────────────────────────────────────────────────────────────────────────
 * De `allowed_actions`, ligne de registre par ligne de registre. Rien
 * d'autorisé, rien d'affiché — c'est ce que #1443 exigeait mot pour mot :
 * *« ne jamais promettre une action que le connecteur ne sait pas faire »*.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI TROIS RANGS PLUTÔT QU'UNE LISTE — #1444
 * ─────────────────────────────────────────────────────────────────────────────
 * *« L'utilisateur doit comprendre la différence entre "connecté" et "Bellum
 * peut réellement faire cette action". »* À plat, lire un agenda et envoyer un
 * e-mail en son nom se ressemblaient. **Lire · Préparer · Agir après
 * validation** n'est pas une trouvaille d'affichage : c'est une règle du
 * produit — le copilote prépare, il n'envoie jamais — qui n'était visible nulle
 * part.
 *
 * Un rang sans aucune ligne est RETIRÉ : « cet outil ne sait que lire » doit se
 * voir, et un intitulé « Agir » suivi du vide se lirait comme une capacité
 * perdue.
 *
 * ⚠️ Le vocabulaire est celui de la CAPACITÉ, jamais celui d'un éditeur — le nom
 * de l'outil est déjà l'entête de la carte, et c'est le seul écran du produit où
 * il a le droit d'y être.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX BLOCS, PAS UN — #2078.14
 * ─────────────────────────────────────────────────────────────────────────────
 * *Ce que l'outil branché apporte* et *ce que Bellum bâtit dessus* ne sont pas
 * la même promesse, et les mélanger a coûté une capacité réelle : la détection
 * de conflits entre rendez-vous EXISTE (`AgendaService.conflicts`), et comme
 * elle n'est l'action d'aucun connecteur, #1443 l'interdisait d'affichage. Le
 * second bloc lui donne l'endroit où être vraie. Sa table vit dans
 * `lib/derived-capabilities.ts`, avec le chemin de son calcul.
 */
const TIER_ICON: Record<CapabilityTier, typeof Eye> = {
  read: Eye,
  prepare: PenLine,
  act: Send,
}

export function ConnectorBenefits({ tools }: { tools?: readonly ConnectedTool[] }) {
  const { t } = useTranslation('integrationCenter')
  const actions = connectorActions(tools)
  const groups = tieredActions(actions)
  // #2078.14 — ce que NOUS calculons au-dessus de ces accès. Vide tant que les
  // accès requis manquent : un calcul privé de sa matière ne s'annonce pas.
  const derived = derivedCapabilities(actions)
  if (groups.length === 0) return null

  return (
    <Box className="space-y-2" data-testid="connector-benefits">
      <Text size="xs" weight="semibold" color="text-[var(--bellum-text-secondary)]">
        {t('benefitsTitle')}
      </Text>
      {groups.map(group => {
        const Icon = TIER_ICON[group.tier]
        return (
          <Box key={group.tier} className="space-y-0.5">
            <Box display="flex" className="items-center gap-1.5">
              <Icon className="size-3.5 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />
              <Text size="xs" weight="medium" color="text-[var(--bellum-text-primary)]">
                {t(`capabilityTiers.${group.tier}`)}
              </Text>
            </Box>
            {/* Une vraie liste : un lecteur d'écran annonce « liste de 3
                éléments », ce qu'une pile de paragraphes ne dit pas. */}
            <ul className="space-y-0.5 pl-5">
              {group.actions.map(action => (
                <li key={action} className="flex gap-1.5">
                  <span aria-hidden="true" className="text-[var(--text-ghost)]">
                    ·
                  </span>
                  <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                    {t(`toolActions.${action}`)}
                  </Text>
                </li>
              ))}
            </ul>
          </Box>
        )
      })}

      {/* #2078.14 — le second bloc. Il porte un intitulé DIFFÉRENT parce qu'il
          promet autre chose : un calcul qui nous appartient, bâti sur les accès
          ci-dessus. Absent tant qu'aucune capacité n'est débloquée — un titre
          suivi du vide se lit comme une capacité perdue. */}
      {derived.length > 0 ? (
        <Box className="space-y-0.5 border-t border-[var(--bellum-border)] pt-2" data-testid="connector-built-on-top">
          <Text size="xs" weight="semibold" color="text-[var(--bellum-text-secondary)]">
            {t('builtOnTopTitle')}
          </Text>
          <ul className="space-y-0.5 pl-5">
            {derived.map(capability => (
              <li key={capability} className="flex gap-1.5">
                <span aria-hidden="true" className="text-[var(--text-ghost)]">
                  ·
                </span>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t(`derivedCapabilities.${capability}`)}
                </Text>
              </li>
            ))}
          </ul>
        </Box>
      ) : null}
    </Box>
  )
}
