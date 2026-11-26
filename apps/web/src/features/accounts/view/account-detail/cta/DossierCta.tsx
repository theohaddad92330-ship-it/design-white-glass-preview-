import { dossierCta, type DossierCtaBlockedReason, type DossierCtaPermission } from '@bellum/contracts'
import { Button, cn, DropdownMenuItem, DropdownMenuSubTrigger, type ButtonProps } from '@bellum/ui'
import { forwardRef, useCallback, useRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * #2116.28-37, .44-47 — le porteur du contrat de bouton du dossier.
 *
 * Chaque bouton de la barre d'actions déclare son identifiant (`cta`) ; ce
 * fichier lit le contrat correspondant (`packages/contracts/src/schemas/cta-contract.ts`)
 * et en rend deux choses que le JSX ne portait nulle part :
 *
 *  · le RÉSULTAT ATTENDU, en description accessible du bouton (#2116.34) ;
 *  · la RAISON d'un bouton inerte — pourquoi, ce qui manque, le geste qui
 *    débloque (#2116.45, .46, .47).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI `disabled` N'EST PAS UNE PROP ICI
 * ─────────────────────────────────────────────────────────────────────────
 * Un bouton du dossier ne peut pas être rendu inerte sans dire pourquoi : la
 * prop n'existe pas, il y a `blockedBy` (un empêchement, qui porte ses trois
 * textes) et `busy` (le geste est EN COURS — il n'y a rien à expliquer, juste
 * à attendre). Un oubli n'est donc pas un défaut à trouver en recette, c'est
 * un type qui ne compile pas. La garde `dossier-cta-contract.test.ts` interdit
 * en plus un `disabled=` écrit à la main dans les fichiers de la barre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI `title` ET PAS UN PARAGRAPHE SOUS LE BOUTON
 * ─────────────────────────────────────────────────────────────────────────
 * Le bouton « Actualiser l'analyse » est l'enfant UNIQUE d'un `TooltipTrigger
 * asChild` : lui rendre un fragment (bouton + texte) ferait rendre à Radix un
 * élément nu, sans style ni déclencheur. La description voyage donc par
 * `title`, que les lecteurs d'écran exposent comme description accessible et
 * que le navigateur montre au survol. Là où la place existe — les entrées de
 * menu — ce qui MANQUE est en plus écrit en clair sous le libellé, parce
 * qu'au doigt il n'y a pas de survol. Les trois composants transmettent leur
 * `ref` : un déclencheur Radix (`asChild`) positionne son panneau dessus, et
 * un composant qui l'avale casse le survol sans rien dire.
 */

/**
 * #2116.31 — LA PERMISSION, du contrat vers la phrase.
 *
 * Une clé de permission porte un `:` (`records:write`), et i18next lit un `:`
 * comme un séparateur de namespace — `t('accounts:cta.permission.records:write')`
 * chercherait le namespace `records`. La table est donc ici, à UN seul endroit
 * (GA-26), et elle est EXHAUSTIVE par le type : ajouter une permission au
 * contrat sans son libellé ne compile pas.
 */
const PERMISSION_LABEL_KEY: Readonly<Record<Exclude<DossierCtaPermission, 'none'>, string>> = {
  'records:write': 'accounts:cta.permission.recordsWrite',
  'data:export': 'accounts:cta.permission.dataExport',
  'contacts:enrich': 'accounts:cta.permission.contactsEnrich',
}

/** Ce que le bouton dit de lui-même : sa description, sa permission, et son
 *  empêchement éventuel. */
function useCtaCopy(id: string, blockedBy?: DossierCtaBlockedReason | null) {
  const { t } = useTranslation()
  const contract = dossierCta(id)

  // Identifiant inconnu : pas de description inventée. La garde d'architecture
  // attrape le cas en CI — ici, on ne casse pas le dossier pour une faute de frappe.
  const expected = contract ? t(contract.expectedResultKey) : ''

  // #2116.31 — le geste dit le DROIT qu'il exige, avant le clic. C'est la
  // permission du GESTE, jamais un verdict sur la personne. `none` ne s'écrit
  // pas — c'est une réponse, et elle est « ce bouton n'exige rien ».
  //
  // ⚠️ #2222 (16/09/2026) — la raison invoquée ici n'est plus vraie : le client
  // CONNAÎT désormais le rôle de qui regarde (`useUserPermissions`, alimenté par
  // `GET /workspaces/me`), et `useRouteAccess` ne pose plus `role: 'owner'` en
  // dur. Le libellé reste délibérément celui du GESTE : ce bouton annonce ce
  // qu'il exige, et c'est vrai pour tout le monde. Griser le geste pour qui n'a
  // pas le droit est possible aujourd'hui (`<CapabilityGate>`) — c'est un
  // changement de comportement à décider, pas une limite technique.
  const permissionNote =
    contract && contract.permission !== 'none' ? t(PERMISSION_LABEL_KEY[contract.permission]) : null

  if (blockedBy) {
    const missing = t(blockedBy.missingKey)
    const unblock = t(blockedBy.unblockKey)
    const why = `${t(blockedBy.whyKey)} ${missing} ${unblock}`
    return {
      title: permissionNote ? `${why} ${permissionNote}` : why,
      missing,
      unblock,
      blocked: true as const,
    }
  }
  return {
    title: permissionNote ? `${expected} ${permissionNote}` : expected,
    missing: null,
    unblock: null,
    blocked: false as const,
  }
}

/**
 * #2116.43, .53 — LE VERROU DE CLIC.
 *
 * Deux règles, une ligne de code chacune :
 *
 *  · #2116.53 (idempotence) — tant que le geste n'a pas rendu la main, un
 *    second clic ne relance rien. Sans ça, un double clic sur « Télécharger
 *    PDF » fabriquait deux fois le document, et sur une entrée de menu la
 *    mutation partait deux fois : `isPending` ne bascule qu'au rendu suivant,
 *    donc il n'a jamais protégé les deux clics d'un même tour de boucle.
 *  · #2116.53 (reprise) — le verrou tombe DÈS que le geste a rendu la main,
 *    succès OU échec. Un verrou qui resterait posé sur un rejet ferait d'un
 *    échec un bouton mort, ce qui est pire que l'échec.
 *
 * Et #2116.43 par CONSTRUCTION : cette couche n'annonce rien. Aucun `toast`
 * n'existe dans ce dossier — le succès vient du `onSuccess` de la mutation ou
 * de l'après-`await` du geste, jamais du clic. La garde
 * `dossier-cta-interdits.test.ts` interdit qu'un `toast.success` y arrive.
 *
 * Le relâchement passe par une MICROTÂCHE quand le geste est synchrone : deux
 * clics du même tour de boucle sont avalés, deux clics réellement distincts
 * (qui sont deux tâches) passent tous les deux.
 */
function useCtaClickGuard<E>(onClick: ((event: E) => unknown) | undefined, busy: boolean) {
  const inFlight = useRef(false)
  return useCallback(
    (event: E) => {
      if (busy || inFlight.current) return
      inFlight.current = true
      const release = () => {
        inFlight.current = false
      }
      let outcome: unknown
      try {
        outcome = onClick?.(event)
      } catch (error) {
        release()
        throw error
      }
      if (outcome instanceof Promise) void outcome.then(release, release)
      else queueMicrotask(release)
    },
    [busy, onClick],
  )
}

type CtaCommon = {
  /** L'identifiant du contrat — une entrée de `DOSSIER_CTA_CONTRACTS`. */
  cta: string
  /** Le geste est en cours : le bouton attend, il n'y a rien à expliquer. */
  busy?: boolean
  /** Le bouton est empêché : pourquoi, ce qui manque, comment débloquer. */
  blockedBy?: DossierCtaBlockedReason | null
  /**
   * Le clic MÈNE au geste de déblocage (l'entrée reste cliquable et ouvre ce
   * qu'il faut savoir) au lieu d'être inerte. C'est le cas de l'export PDF
   * quand l'offre ne l'inclut pas : un bouton mort n'apprend rien, celui-là
   * ouvre le palier qui le débloque.
   */
  unblockOnClick?: boolean
  /**
   * Le bouton est DÉJÀ enveloppé d'une infobulle qui porte la description du
   * contrat (`RelaunchImpactTooltip`). Un `title` natif en plus ferait deux
   * bulles superposées au survol — la description passe alors par l'infobulle,
   * jamais par rien : c'est l'appelant qui doit la rendre, et la garde relit
   * qu'il le fait.
   */
  ownTooltip?: boolean
  children?: ReactNode
}

type DossierCtaButtonProps = Omit<ButtonProps, 'disabled' | 'title' | 'children'> & CtaCommon

/** Un bouton de la barre d'actions du dossier. */
export const DossierCtaButton = forwardRef<HTMLButtonElement, DossierCtaButtonProps>(function DossierCtaButton(
  { cta, busy = false, blockedBy = null, unblockOnClick = false, ownTooltip = false, children, onClick, ...rest },
  ref,
) {
  const copy = useCtaCopy(cta, blockedBy)
  const guardedClick = useCtaClickGuard(onClick, busy)
  // Un empêchement passe TOUJOURS par `title` : il ne se dit pas dans une
  // infobulle de garantie, et c'est la seule chose qu'on refuse de taire.
  const nativeTitle = ownTooltip && !copy.blocked ? undefined : copy.title || undefined
  return (
    <Button
      {...rest}
      ref={ref}
      onClick={guardedClick}
      data-cta={cta}
      title={nativeTitle}
      disabled={busy || (copy.blocked && !unblockOnClick)}
      aria-busy={busy || undefined}
    >
      {children}
    </Button>
  )
})

type DossierCtaMenuItemProps = Omit<
  ComponentPropsWithoutRef<typeof DropdownMenuItem>,
  'disabled' | 'title' | 'children'
> &
  CtaCommon

/** Une entrée du menu « … » du dossier. */
export const DossierCtaMenuItem = forwardRef<ElementRef<typeof DropdownMenuItem>, DossierCtaMenuItemProps>(
  function DossierCtaMenuItem(
    { cta, busy = false, blockedBy = null, unblockOnClick = false, className, children, asChild, onClick, ...rest },
    ref,
  ) {
    const copy = useCtaCopy(cta, blockedBy)
    const guardedClick = useCtaClickGuard(onClick, busy)

    // `asChild` prête l'entrée à un vrai lien (clic droit « ouvrir dans un
    // nouvel onglet »). Radix fusionne les props dans un enfant UNIQUE : pas de
    // gabarit, donc pas de ligne d'explication — ce chemin est réservé aux
    // navigations, qui n'ont rien à empêcher.
    if (asChild) {
      return (
        <DropdownMenuItem
          {...rest}
          ref={ref}
          asChild
          // #2116.53 — le clic n'est PAS verrouillé sur ce chemin : `asChild`
          // le prête à un vrai lien, dont le second clic ne relance rien (il
          // navigue, et la page a déjà changé). Il reste transmis tel quel,
          // sinon `onClick` disparaîtrait avec la déstructuration.
          onClick={onClick}
          className={className}
          data-cta={cta}
          title={copy.title || undefined}
        >
          {children}
        </DropdownMenuItem>
      )
    }

    return (
      <DropdownMenuItem
        {...rest}
        ref={ref}
        onClick={guardedClick}
        data-cta={cta}
        title={copy.title || undefined}
        disabled={busy || (copy.blocked && !unblockOnClick)}
        aria-busy={busy || undefined}
        className={cn(className, copy.blocked && 'flex-col items-start gap-0.5 opacity-70')}
      >
        {/* Sans empêchement, les enfants sont rendus TELS QUELS : les envelopper
            casserait les mises en page qui comptent sur eux (le coût en crédits
            aligné à droite par `justify-between`, par exemple). */}
        {copy.blocked ? (
          <>
            <span className="flex items-center gap-1.5">{children}</span>
            {/* Ce qui MANQUE, écrit — pas seulement un cadenas. Au doigt, il n'y
                a pas de survol : `title` seul ne dirait rien sur mobile. */}
            <span className="text-xs text-[var(--bellum-text-muted)]">
              {copy.missing} {copy.unblock}
            </span>
          </>
        ) : (
          children
        )}
      </DropdownMenuItem>
    )
  },
)

type DossierCtaSubTriggerProps = Omit<
  ComponentPropsWithoutRef<typeof DropdownMenuSubTrigger>,
  'disabled' | 'title' | 'children'
> &
  CtaCommon

/** L'entrée qui ouvre un sous-menu du dossier (« Rafraîchir un axe »). */
export const DossierCtaSubTrigger = forwardRef<ElementRef<typeof DropdownMenuSubTrigger>, DossierCtaSubTriggerProps>(
  function DossierCtaSubTrigger(
    { cta, busy = false, blockedBy = null, unblockOnClick = false, children, onClick, ...rest },
    ref,
  ) {
    const copy = useCtaCopy(cta, blockedBy)
    const guardedClick = useCtaClickGuard(onClick, busy)
    return (
      <DropdownMenuSubTrigger
        {...rest}
        ref={ref}
        onClick={guardedClick}
        data-cta={cta}
        title={copy.title || undefined}
        disabled={busy || (copy.blocked && !unblockOnClick)}
        aria-busy={busy || undefined}
      >
        {children}
      </DropdownMenuSubTrigger>
    )
  },
)
