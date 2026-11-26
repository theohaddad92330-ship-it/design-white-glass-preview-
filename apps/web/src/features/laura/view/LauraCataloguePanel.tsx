import {
  INTERVENTION_FAMILIES,
  INTERVENTION_FORMATS,
  interventionsOfFamily,
  type InterventionDefinition,
} from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { useTranslation } from 'react-i18next'
import { useLauraCatalogue } from '../useLaura'

/**
 * CE QUE LAURA SAIT DIRE — le catalogue, à l'écran (§5.4 du PDF 10).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU QU'IL COMBLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le catalogue existait — trente interventions, quatre familles, cinq formats,
 * chacune avec la phrase de ce qu'elle prétend détecter — la route existait, et
 * son docblock disait : « Le catalogue, pour l'écran de réglages ». **Cet écran
 * n'existait pas.** La constante, le helper et la route n'avaient aucun
 * appelant hors test : personne ne pouvait répondre à « qu'est-ce que Laura a
 * le droit de me dire ? » autrement qu'en lisant le code.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ICI ET PAS SUR UN ÉCRAN À ELLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le docblock du contrôleur l'INTERDIT explicitement : l'interrupteur de D49
 * vit dans les préférences de notification, avec le plafond de proactivité,
 * « parce qu'il répond à la même question et se règle au même endroit ». Ce
 * panneau se pose donc juste à côté de lui — et il est en LECTURE seule, il
 * n'ouvre aucun second chemin d'écriture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL MONTRE, ET DANS QUEL ORDRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Par FAMILLE d'abord — les quatre répondent à des moments différents de la vie
 * d'un espace — puis par FORMAT, parce que la forme décide de ce qui interrompt :
 * une bulle se remarque, un panneau prend la place. Une famille ou un format
 * qu'aucune intervention ne porte ne s'affiche PAS : une section vide se lit
 * comme une capacité en panne.
 *
 * ⚠️ `condition` et `action` viennent du SERVEUR et sont rendus tels quels.
 * Les traduire par clé demanderait une table de trente phrases en regard d'une
 * source qui vit dans `@bellum/contracts` : elle dériverait au premier
 * ajustement de formulation, et une explication périmée est pire qu'une
 * explication dans la mauvaise langue. Le chemin propre est un `?lang=` sur la
 * route, comme `/settings/catalogues` le fait déjà.
 */
export function LauraCataloguePanel() {
  const { t } = useTranslation('laura')
  const catalogue = useLauraCatalogue()

  return (
    <SettingsBlock label={t('catalogue.title')} description={t('catalogue.description')}>
      <Box display="flex" className="flex-col gap-5 p-4">
        {catalogue.status === 'loading' ? (
          // « Je ne sais pas encore » n'est pas « rien » : annoncer zéro
          // intervention pendant le chargement se lit comme un vrai zéro.
          <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
            {t('catalogue.loading')}
          </Text>
        ) : catalogue.status === 'failed' ? (
          <Text element="p" size="sm" className="text-[var(--warning-soft-text)]">
            {t('catalogue.failed')}
          </Text>
        ) : catalogue.interventions.length === 0 ? (
          <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
            {t('catalogue.empty')}
          </Text>
        ) : (
          <>
            {groupByFamily(catalogue.interventions).map(family => (
              <Box key={family.family}>
                <Text element="h3" size="sm" weight="semibold">
                  {t(`catalogue.families.${family.family}`, { defaultValue: family.family })}
                </Text>
                <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t(`catalogue.familyHints.${family.family}`, { defaultValue: '' })}
                </Text>
                <Box display="flex" className="mt-2 flex-col gap-3">
                  {family.formats.map(group => (
                    <Box key={group.format}>
                      <Text element="h4" size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                        {t(`catalogue.formats.${group.format}`, { defaultValue: group.format })}
                      </Text>
                      <Box display="flex" className="mt-1 flex-col gap-2">
                        {group.items.map(item => (
                          <Box key={item.key} className="rounded-md border border-border p-2">
                            <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                              {t('catalogue.detects')}
                            </Text>
                            <Text element="p" size="xs">
                              {item.condition}
                            </Text>
                            <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                              {t('catalogue.proposes')}
                            </Text>
                            <Text element="p" size="xs">
                              {item.action}
                            </Text>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
            {/* D48, écrit là où la question se pose : Laura guide et
                pré-remplit, l'exécution passe par une porte qui demande un
                accord. Aucune entrée du catalogue ne porte de verbe
                d'écriture, et un test le vérifie côté contrat. */}
            <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('catalogue.neverWrites')}
            </Text>
            <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('catalogue.silenceMatters')}
            </Text>
          </>
        )}
      </Box>
    </SettingsBlock>
  )
}

/**
 * Le catalogue, rangé par famille puis par format.
 *
 * L'ordre vient des constantes du contrat et non du tableau reçu : deux
 * chargements doivent ranger pareil, sinon la page bouge sous les yeux de
 * quelqu'un qui la relit. Une famille ou un format sans entrée disparaît —
 * une section vide se lirait comme une capacité en panne.
 *
 * ⚠️ Le regroupement par famille vit dans le contrat (GA-26, une dérivation à un
 * seul endroit) et il porte sur ce que la ROUTE a SERVI — le payload est passé
 * en argument, jamais relu depuis `LAURA_INTERVENTIONS`. Appeler
 * `interventionsOfFamily(family)` tout court serait une régression de la
 * décision écrite dans `useLaura.ts` : le jour où le serveur filtrera (par
 * offre, par espace, par droit), cet écran doit montrer le catalogue reçu, pas
 * celui du bundle.
 */
function groupByFamily(interventions: readonly InterventionDefinition[]) {
  return INTERVENTION_FAMILIES.map(family => {
    const ofFamily = interventionsOfFamily(family, interventions)
    return {
      family,
      formats: INTERVENTION_FORMATS.map(format => ({
        format,
        items: ofFamily.filter(item => item.format === format),
      })).filter(group => group.items.length > 0),
    }
  }).filter(group => group.formats.length > 0)
}
