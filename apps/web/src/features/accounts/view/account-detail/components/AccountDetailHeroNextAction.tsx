import type { Account } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useHeroPrimaryAction } from './useHeroPrimaryAction'

/**
 * #2117.27 — LA PROCHAINE ACTION DU PLAN, NOMMÉE. Sur SA PROPRE LIGNE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE PHRASE DIT
 * ─────────────────────────────────────────────────────────────────────────
 * « Continuer la prochaine action » sans dire laquelle oblige à ouvrir l'onglet
 * pour savoir ce qu'on allait faire. Le libellé du bouton reste stable — il doit
 * se reconnaître d'un dossier à l'autre — et c'est cette ligne qui porte le texte
 * du plan.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ POURQUOI ELLE VIT ICI, ET PAS DANS LA RANGÉE D'ACTIONS (défaut du 14/09/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * Elle était rendue sous le bouton, DANS la rangée d'actions du hero — une
 * rangée qui porte `shrink-0`, donc qui ne descend jamais sous sa largeur
 * `max-content`. Comme ce texte est écrit par l'analyse et n'a aucune longueur
 * maximale, il fixait la largeur de toute la rangée : **1 359 à 1 628 px pour un
 * parent de 1 174 px**. Flexbox retire le manque au seul frère rétrécissable —
 * la colonne d'identité — qui tombait à **0 px** : le nom du compte, le secteur,
 * le SIREN et le propriétaire s'enroulaient un mot par ligne sur 600 à 720 px de
 * haut, et un bouton recouvrait le `<h1>`. Mesuré sur 5 comptes sur 5 et, le
 * hero étant partagé, sur les 7 sections du dossier sur 7.
 *
 * La phrase est donc SORTIE de la rangée rigide : elle occupe sa propre ligne,
 * en pleine largeur de la carte, où sa longueur ne dispute rien à personne.
 * `truncate` la borne à la largeur de la carte (elle en est un enfant de bloc,
 * donc la borne existe vraiment, contrairement à ce qui se passait dans la
 * rangée), et `title` rend le texte complet au survol — rien n'est perdu.
 * Garde : `un-conteneur-rigide-ne-porte-pas-de-texte-libre.test.ts` (GA-333).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2117.80 — LA MOITIÉ QUI MANQUAIT : UN COMPTE PAUVRE, EN VEILLE.
 * ─────────────────────────────────────────────────────────────────────────
 * Recette 23/09, prod 7e7105fb7 : sur un compte riche, cette ligne suffit à
 * comprendre l'action principale sans scroll. Sur un compte pauvre en veille
 * (`watching`, aucune prochaine action), l'en-tête ne disait RIEN — il
 * fallait descendre ~700px jusqu'à la carte « Prochaine action » pour lire
 * « Aucune action suggérée ». Cette ligne le dit maintenant ICI aussi,
 * UNIQUEMENT quand `watchingReason === 'noAction'` : un compte mis de côté
 * (`'parked'`) reste muet, la décision humaine peut cacher une action
 * existante, simplement ignorée par choix — ce n'est pas une absence.
 */
export function AccountDetailHeroNextAction({
  account,
  onTabChange,
}: {
  account: Account
  onTabChange?: (tab: 'plan' | 'veille') => void
}) {
  const { t } = useTranslation('accounts')
  const navigate = useNavigate()
  const choice = useHeroPrimaryAction(account)

  if (choice.nextActionLabel !== null) {
    const sentence = t('hero.primary.nextActionNamed', { action: choice.nextActionLabel })
    // #4320.1 — la phrase mène à l'action : l'onglet Plan, comme le bouton principal.
    const openPlan = () => {
      if (onTabChange) {
        onTabChange('plan')
        return
      }
      void navigate({ to: '/accounts/$id', params: { id: account.id }, search: prev => ({ ...prev, tab: 'plan' }) })
    }
    return (
      <button type="button" onClick={openPlan} className="block min-h-11 w-full text-left">
        <Text
          element="p"
          size="xs"
          title={sentence}
          className="truncate text-[var(--bellum-text-secondary)] underline-offset-2 hover:underline"
        >
          {sentence}
        </Text>
      </button>
    )
  }

  if (choice.watchingReason === 'noAction') {
    const sentence = t('hero.primary.noActionSuggested')
    return (
      <Text element="p" size="xs" className="mt-2 truncate text-[var(--bellum-text-secondary)]">
        {sentence}
      </Text>
    )
  }

  return null
}
