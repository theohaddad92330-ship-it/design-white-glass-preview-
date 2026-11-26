import { Box, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { Keyboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ShortcutKeys } from '../ShortcutKeys'
import { SHORTCUT_SCOPES, type Shortcut, shortcutsInScope } from '../shortcuts'

/**
 * RÉGLAGES › RACCOURCIS CLAVIER — la page dédiée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE PAGE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux exigences qui semblaient s'opposer, et qui ne s'opposent pas.
 *
 * Le tome 7 §30 : « **un raccourci qu'il faut découvrir n'existe pas** ». Le lot
 * du 29/08 y a répondu en collant les touches sur chaque entrée de navigation —
 * c'était la seule surface disponible, et le dépôt n'affichait alors les
 * raccourcis nulle part.
 *
 * Louis, le 30/08, `/accounts` sous les yeux : `G J`, `G C`, `G P`, `G T`,
 * `G M`, `G A`, `G L`, `⌘ K` — **sept capuchons visibles en permanence sur huit
 * lignes**, dans la colonne la plus étroite du produit, ouverte huit heures par
 * jour. « Je veux plus que les raccourcis soient dans la sidebar mais dans une
 * page dédiée dans les réglages où on peut les set, les voir etc etc mais plus
 * que ça pollue l'interface. »
 *
 * La règle n'est pas contestée, l'ENDROIT l'est — et il a raison : la règle
 * porte sur la VISIBILITÉ, pas sur l'emplacement. Une page y répond MIEUX qu'un
 * capuchon, parce qu'elle tient ce qu'aucune paire de lettres ne peut tenir :
 * **la portée** de chaque raccourci et **ce qu'il fait**. `G C` collé sur une
 * ligne ne dit pas s'il répond partout ou seulement dans une liste ; un
 * raccourci dont on ignore où il répond ne s'essaie qu'une fois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS ENCORE, ET POURQUOI C'EST ÉCRIT À L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne permet pas de REDÉFINIR les touches. Ce n'est pas un oubli, et la
 * raison est mesurée — elle est donc DITE à l'utilisateur, en bas de page,
 * plutôt que laissée à deviner :
 *
 *  1. `⌘B` est écouté dans `packages/ui/src/components/sidebar.tsx`, un paquet
 *     qui ne peut pas importer l'app web. Une touche redéfinie ici afficherait
 *     une lettre que le gestionnaire n'écoute pas — le défaut n°1 du dépôt (du
 *     code juste que personne n'appelle), servi à l'utilisateur.
 *  2. Redéfinir une COMBINAISON suppose une liste des combinaisons réservées
 *     par le navigateur, le système et les lecteurs d'écran. Elle n'existe nulle
 *     part dans ce dépôt, et la deviner ferait perdre `⌘T` ou `⌘W` à quelqu'un.
 *  3. Les préférences d'interface sont aujourd'hui stockées dans le navigateur
 *     (`bellum-preferences`), donc par POSTE. Un raccourci redéfini sur le
 *     portable n'existerait pas sur le fixe — pire qu'un raccourci figé, parce
 *     qu'on ne peut pas apprendre un geste qui change de machine en machine.
 *
 * Une page qui offrirait de régler sans rien enregistrer serait pire que pas de
 * page du tout. Elle donne donc ce qu'elle peut tenir : voir, et comprendre.
 */
export function ShortcutsSettingsView({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation('shortcuts')

  return (
    <Box className="flex flex-col gap-1">
      {/* `embedded` — Théo D settings-prefs.R5 : la table complète vit dans le repli
          « Tous les raccourcis » du sous-onglet Raccourcis, qui porte déjà le titre. */}
      {!embedded && (
        <>
          <Text element="h1" size="xl" weight="semibold" className="flex items-center gap-2">
            <Keyboard className="size-5 text-[var(--bellum-text-accent)]" aria-hidden />
            {t('title')}
          </Text>
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]" className="mb-6">
            {t('page.subtitle')}
          </Text>
        </>
      )}

      {/* Au DOIGT, cette page n'a pas de sujet — et l'entrée qui y mène est
          masquée en pointeur grossier. Elle reste atteignable par son adresse,
          donc elle le DIT au lieu d'afficher une grille de touches inutilisable.
          `pointer-fine:hidden` et non une branche de rendu : un seul arbre,
          comme les règles mobiles du dépôt l'exigent. */}
      <Text
        element="p"
        size="sm"
        color="text-[var(--bellum-text-secondary)]"
        className="pointer-fine:hidden mb-6 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3"
      >
        {t('page.needsKeyboard')}
      </Text>

      {SHORTCUT_SCOPES.map(scope => (
        <ScopeTable key={scope} scope={scope} shortcuts={shortcutsInScope(scope)} />
      ))}

      {/* La raison pour laquelle rien ne se redéfinit encore. Écrite ICI, à
          l'endroit où la question se pose, et pas dans un tracker que
          l'utilisateur ne lira jamais : une page nommée « Raccourcis clavier »
          qui ne laisse rien changer doit dire pourquoi, sinon chacun conclut que
          c'est cassé. */}
      <SettingsBlock label={t('page.customize.title')} description={t('page.customize.intro')}>
        <Box className="flex flex-col gap-3 px-5 py-4 sm:px-6">
          {CUSTOMIZE_BLOCKERS.map(blocker => (
            <Text key={blocker} element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
              {t(`page.customize.blockers.${blocker}`)}
            </Text>
          ))}
        </Box>
      </SettingsBlock>
    </Box>
  )
}

/**
 * Les trois obstacles mesurés, nommés plutôt que comptés.
 *
 * Une liste NOMMÉE et non un « trois raisons » : le jour où l'un tombe (les
 * préférences remontent au compte, par exemple), on retire la ligne et la page
 * cesse d'affirmer quelque chose de faux. Un compte, lui, resterait juste tout
 * en devenant mensonger.
 */
const CUSTOMIZE_BLOCKERS = ['handler', 'reserved', 'perDevice'] as const

/**
 * Un tableau par portée.
 *
 * La PORTÉE est le regroupement ET une colonne : le regroupement la rend
 * évidente à l'œil qui balaie, la colonne la rend lisible à qui arrive au
 * milieu du tableau ou l'entend ligne par ligne dans un lecteur d'écran.
 *
 * Le TABLEAU prend toute la largeur de sa carte : un tableau a besoin de ses
 * colonnes (D81). Ses cellules, elles, gardent la borne de lecture par défaut du
 * composant `Text` — aucune n'atteint 70 caractères, donc la borne ne coupe
 * jamais rien, et lui écrire `full` aurait été une échappatoire ouverte sans
 * qu'aucune ligne n'en ait besoin (GA-34, cliquet à zéro).
 */
function ScopeTable({ scope, shortcuts }: { scope: (typeof SHORTCUT_SCOPES)[number]; shortcuts: readonly Shortcut[] }) {
  const { t } = useTranslation('shortcuts')
  return (
    <SettingsBlock label={t(`scopes.${scope}.name`)} description={t(`scopes.${scope}.explainer`)}>
      {/* Ce qui déborde défile dans SON conteneur, jamais dans le corps de la
          page : trois colonnes ne tiennent pas dans 320 px. */}
      <Box className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-[var(--bellum-border)] bg-[var(--bellum-surface-2)]">
              <TableHead className="w-32 text-[var(--bellum-text-muted)]">{t('page.columns.keys')}</TableHead>
              <TableHead className="text-[var(--bellum-text-muted)]">{t('page.columns.action')}</TableHead>
              <TableHead className="w-32 text-[var(--bellum-text-muted)]">{t('page.columns.scope')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shortcuts.map(shortcut => (
              <TableRow key={shortcut.id} className="border-[var(--border-subtle)]">
                <TableCell className="align-top">
                  {/* `announce` : c'est ICI, et nulle part ailleurs, que les
                      touches doivent être LUES à voix haute — la page est le
                      seul endroit où l'on vient pour les apprendre, et le seul
                      où les énoncer ne renomme aucun bouton. */}
                  <ShortcutKeys shortcut={shortcut} announce />
                </TableCell>
                <TableCell className="align-top">
                  <Text element="p" size="sm" weight="medium">
                    {t(shortcut.labelKey)}
                  </Text>
                  <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
                    {t(shortcut.descriptionKey)}
                  </Text>
                </TableCell>
                <TableCell className="align-top">
                  <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
                    {t(`scopes.${shortcut.scope}.name`)}
                  </Text>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </SettingsBlock>
  )
}
