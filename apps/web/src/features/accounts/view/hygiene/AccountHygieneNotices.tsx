import { Text } from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { CalendarPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccountsHygiene } from '@/features/accounts/hooks/useAccountsHygiene'
import { nextActionVerdict } from '@/features/accounts/lib/accountHygiene'

/**
 * Les contrôles de qualité, POSÉS À CÔTÉ DE L'OBJET QU'ILS CONCERNENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PHRASE QUI PORTE CE FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le cockpit sait « 7 comptes suivis sans prochaine action ». Le commercial qui
 * regarde son portefeuille ne sait pas LESQUELS, et c'est pourtant devant cette
 * ligne-là qu'il peut agir. Un contrôle qui ne se voit qu'à l'endroit où
 * personne ne peut le réparer n'a pas été livré : il a été calculé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RIEN N'EST RECALCULÉ ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le serveur DÉSIGNE les comptes concernés avec les prédicats du cockpit, au
 * caractère près (`account-hygiene.sql.ts`, garde GA-53). Refaire le calcul dans
 * le navigateur — « ce compte n'a aucune tâche à venir » — serait une seconde
 * copie de la règle, et deux copies divergent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ SE DIT « NON MESURÉ », ET OÙ IL SE TAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un contrôle non évalué n'est PAS conforme, et ça se dit. Mais cinquante
 * « non mesuré » alignés dans une liste ne se lisent plus et noient les vraies
 * alertes. D'où le partage :
 *
 *  - sur une LIGNE, la pastille ne parle que si le serveur désigne ce compte.
 *    Elle se tait sur un compte tenu comme sur un compte non lu ;
 *  - en HAUT de l'écran, une phrase le dit UNE fois : « le contrôle n'a pas pu
 *    être lu, les lignes ne sont pas marquées ». Sans elle, une liste sans
 *    pastille se lirait « tout est propre » — le mensonge le plus cher du
 *    chantier ;
 *  - sur le DOSSIER d'un compte, où il y a la place, « non mesuré » s'écrit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN AVERTISSEMENT SANS GESTE EST DU BRUIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque marque porte le geste qui la lève : la pastille de ligne ouvre le
 * dossier sur l'onglet où la prochaine action se planifie, (#3631 a retiré la note
 * « contacts sans adresse » de l'onglet Contacts). Un `<button type="button">` dans les
 * deux cas — ce qui se clique se tabule (GA-35).
 */

/**
 * La marque « aucune action programmée » sur UNE ligne de compte.
 *
 * ⚠️ Elle vit dans une ligne cliquable : le clic doit être ARRÊTÉ, sinon
 * planifier ouvre aussi le dossier sur l'onglet par défaut, et le geste demandé
 * se perd derrière celui de la ligne.
 */
export function AccountNextActionFlag({ accountId, className }: { accountId: string; className?: string }) {
  const { t } = useTranslation('accounts')
  const navigate = useNavigate()
  const { data } = useAccountsHygiene()

  if (nextActionVerdict(data, accountId).state !== 'breached') return null

  return (
    <button
      type="button"
      data-hygiene-check="accounts_without_next_action"
      title={t('hygiene.nextAction.flagHint')}
      aria-label={t('hygiene.nextAction.flagAria')}
      onClick={event => {
        event.stopPropagation()
        navigate({ to: '/accounts/$id', params: { id: accountId }, search: { tab: 'history' } })
      }}
      className={[
        // Le fond est à OPACITÉ : il se compose sur le fond du THÈME, donc le
        // texte passe par `*-soft-text` et non par la couleur sémantique nue.
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full',
        'bg-[color-mix(in_srgb,var(--bellum-warning-text)_14%,transparent)] px-1.5 py-0',
        'text-xs leading-4 text-[var(--warning-soft-text)]',
        'hover:bg-[color-mix(in_srgb,var(--bellum-warning-text)_22%,transparent)]',
        // Au doigt, la cible fait 44 px — la ligne en fait 64, il y a la place.
        'pointer-coarse:min-h-11 pointer-coarse:px-3',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <CalendarPlus className="size-2.5 shrink-0" aria-hidden />
      {t('hygiene.nextAction.flag')}
    </button>
  )
}

/**
 * Ce que la LISTE doit dire une fois, quand elle ne peut pas marquer ses lignes.
 *
 * Muette quand la lecture est complète : une liste correcte n'a pas besoin
 * d'être annoncée, et une bannière permanente s'apprend à ne plus lire.
 */
export function AccountsNextActionScopeNotice({ className }: { className?: string }) {
  const { t } = useTranslation('accounts')
  const { data, isPending } = useAccountsHygiene()

  // Pendant la lecture on n'affirme rien : dire « non mesuré » avant d'avoir
  // essayé ferait clignoter un avertissement à chaque ouverture de l'écran.
  if (isPending) return null

  const read = data?.withoutNextAction
  const message = !read ? t('hygiene.nextAction.unread') : read.truncated ? t('hygiene.nextAction.partial') : null
  if (!message) return null

  return (
    <Text size="xs" className={`block text-[var(--bellum-text-muted)] ${className ?? ''}`}>
      {message}
    </Text>
  )
}

// #3631 (Louis 05/10) — `AccountContactsEmailNotice` (« N des M contacts de ce
// compte n'ont pas d'adresse », onglet Personnes › Contacts) est RETIRÉE de la
// fiche compte, délibérément. Le contrôle reste calculé côté serveur et lu au
// Pilotage › Qualité (`contacts_without_email`).
