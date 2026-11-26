import { ArrowLeft } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { AskLaura } from '@/components/primitives/AskLaura'
import { conversationIdFromReturnParam, lauraContextEnvelopeFromSearch } from '@/lib/return-to-conversation'
import { Banner, bannerActionClassName } from '@/components/layout/Banner'

/**
 * #1933.8 / #1903.20 — depuis une page ouverte par Laura, revenir au fil
 * source. Lit `?from=chat:<id>` sur l'URL COURANTE, quelle que soit la route
 * (même patron que `campaignFromSearch` : `location.search`, jamais
 * `Route.useSearch()`), pour couvrir tous les écrans que Laura peut ouvrir
 * SANS les modifier un par un — un `?from=` qu'aucun `validateSearch` ne
 * déclare n'est jamais retiré de l'URL par le routeur, seule sa lecture
 * TYPÉE (`Route.useSearch()`) l'ignorerait.
 *
 * Rendu ICI, dans `CustomerPageContent` — le chrome commun à tout écran
 * « client » — plutôt que dans chaque page cible : un réglage vit à un seul
 * endroit (GA-26), et une capacité posée page par page finit par en oublier
 * une.
 *
 * ⚠️ Ce que ce bouton NE fait PAS : la navigation quitte la page, donc un
 * champ libre non soumis ne survit pas — ce n'est pas un état que l'URL peut
 * porter. Ce que Laura a préremplit SURVIT (c'est l'URL de la page qui le
 * porte) : un retour au fil PUIS un « précédent » du navigateur retrouve
 * l'écran tel qu'elle l'avait ouvert.
 *
 * #2147.9/.10 (épopée #2785) — ce chrome est aussi le SECOND appelant réel de
 * l'enveloppe de contexte transportable : `?ctx=` (indépendant de `from`, une
 * continuité peut porter l'un sans l'autre — Découvrir → Analyser n'a pas de
 * fil source mais transporte une raison). Seule sa `reason` se montre ici ;
 * un `ctx` sans raison ne rend rien — jamais une ligne vide.
 *
 * #3452 (retour bêta, 30/09/2026) — Louis, depuis /chat : « le lien Découvrir
 * ouvre bien /discover, mais je perds Laura — je veux pouvoir continuer la
 * discussion, en bas à droite ». Le bouton ci-dessus RAMÈNE (il quitte
 * l'écran) ; à côté, `<AskLaura>` DÉPOSE une amorce dans le canal déjà tenu
 * par `laura-intro-store` (#1812) — LauraDock, monté à la racine, la lit et
 * s'agrandit bas-droite SANS naviguer, exactement le mécanisme que 30 écrans
 * utilisent déjà (D44 : Laura est une SURCOUCHE, jamais un second moteur).
 * Le fil de la bulle reste délibérément ÉPHÉMÈRE (`ephemeral-thread.ts`, clé
 * neuve) — ce n'est donc pas un rejeu message par message de la conversation
 * quittée, mais la manière DÉJÀ ÉTABLIE de la reprendre sans repartir de
 * zéro ; en inventer une seconde referait la dette que D44 refuse.
 */
export const ReturnToConversationBanner = memo(function ReturnToConversationBanner() {
  const { t } = useTranslation('common')
  const location = useLocation()
  const navigate = useNavigate()
  const search = location.search as Record<string, unknown>
  const conversationId = conversationIdFromReturnParam(search.from)
  const reason = lauraContextEnvelopeFromSearch(search)?.reason ?? null
  if (!conversationId && !reason) return null

  return (
    <Banner
      icon={conversationId ? ArrowLeft : undefined}
      tone="accent"
      actions={
        <>
          {conversationId && (
            <button
              type="button"
              onClick={() => {
                void navigate({ to: '/chat', search: { conversationId } })
              }}
              className={bannerActionClassName('accent')}
            >
              {t('actions.returnToConversation')}
            </button>
          )}
          {conversationId && (
            <AskLaura question={t('lauraContext.continueQuestion')} label={t('actions.continueWithLaura')} />
          )}
        </>
      }
    >
      {reason ? t('lauraContext.reason', { reason }) : null}
    </Banner>
  )
})
