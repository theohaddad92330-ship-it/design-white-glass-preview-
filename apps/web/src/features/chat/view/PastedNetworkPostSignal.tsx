import { useTranslation } from 'react-i18next'
import { DeclareLinkedInSignalDialog } from '@/features/accounts/view/account-detail/tabs/veille/DeclareLinkedInSignalDialog'

/**
 * Le lien d'un POST ou d'une ANNONCE LinkedIn (jamais un profil) : l'hôte est
 * `linkedin.com` ou l'un de ses sous-domaines, ancré en tête d'URL — un
 * `evil.example/linkedin.com/posts/…` ne passe pas.
 */
const LINKEDIN_POST_URL =
  /https?:\/\/(?:[a-z0-9-]+\.)?linkedin\.com\/(?:posts|feed\/update|pulse|jobs\/view)\/[^\s<>()[\]"']+/i

/** #3924 — le post LinkedIn COLLÉ dans une question, et le texte qui l'entoure. */
export function linkedInPostOf(content: string): { url: string; note: string } | null {
  const match = LINKEDIN_POST_URL.exec(content)
  if (!match || (match.index > 0 && /[^\s(]/.test(content.charAt(match.index - 1)))) return null
  const url = match[0]
  const note = (content.slice(0, match.index) + content.slice(match.index + url.length)).replace(/\s+/g, ' ').trim()
  return { url, note }
}

/**
 * #3924 (chantier distinct de l'issue) — « coller le texte ou l'URL d'un post
 * LinkedIn » DANS LAURA. Sous la question du commercial qui porte un post
 * LinkedIn, dans le fil d'un COMPTE : le geste « Ajouter ce post comme signal
 * du compte » ouvre le MÊME formulaire que la fiche compte (#2634.1),
 * pré-rempli de ce qui a été collé. Rien ne s'écrit sans son clic — Laura
 * prépare, le commercial déclare — et LinkedIn n'est jamais contacté
 * (doctrine `c79_collecte_large_mais_propre`). Hors d'un fil de compte, rien :
 * un signal déclaré n'a pas d'autre endroit où s'écrire.
 */
export function PastedNetworkPostSignal({ accountId, content }: { accountId: string | null; content: string }) {
  const { t } = useTranslation('chat')
  const post = accountId ? linkedInPostOf(content) : null
  if (!accountId || !post) return null
  return (
    <div className="flex justify-end">
      <DeclareLinkedInSignalDialog
        accountId={accountId}
        initialUrl={post.url}
        initialNote={post.note}
        triggerLabel={t('linkedinPost.declare')}
      />
    </div>
  )
}
