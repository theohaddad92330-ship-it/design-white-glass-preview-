import type { TodayItem } from './todayQueue'

/**
 * Lot L-A (#4164) — « COPIER ET OUVRIR » : le geste qui remplace l'envoi quand
 * aucun mandat ne le couvre (c82 — le copilote prépare, le commercial envoie).
 *
 * Pur : il rend le texte à copier et l'adresse à ouvrir ; c'est l'appelant qui
 * touche au presse-papiers et à la fenêtre. Pour LinkedIn on n'invente AUCUNE
 * URL de profil (« un contrat d'API non vérifiable ne se devine pas ») : on
 * ouvre la recherche du contact, ou la messagerie à défaut de nom.
 */
export function buildCopyOpen(item: TodayItem): { text: string; href: string } | null {
  if (!item.draft) return null
  const { subject, body } = item.draft
  if (item.channel === 'email') {
    const text = subject ? `${subject}\n\n${body}` : body
    const query = [subject ? `subject=${encodeURIComponent(subject)}` : null, `body=${encodeURIComponent(body)}`]
      .filter(Boolean)
      .join('&')
    return { text, href: `mailto:${item.recipient ? encodeURIComponent(item.recipient) : ''}?${query}` }
  }
  if (item.channel === 'linkedin') {
    const who = [item.contactName, item.accountName].filter(Boolean).join(' ')
    return {
      text: body,
      href: who
        ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(who)}`
        : 'https://www.linkedin.com/messaging/',
    }
  }
  return null
}
