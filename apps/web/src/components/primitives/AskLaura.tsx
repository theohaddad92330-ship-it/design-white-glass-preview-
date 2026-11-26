import { Button } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Sparkles } from 'lucide-react'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { useAskLauraIntro } from '@/features/laura/bubble/laura-intro-store'
import { useOpenLauraInPlace } from '@/features/laura/bubble/use-open-laura-in-place'
import { useLauraIntroScope } from '@/features/laura/bubble/laura-intro-scope'
import { useCurrentLauraContext } from '@/features/laura/bubble/page-context-store'

type AskLauraProps = {
  /** La question, RÉDIGÉE pour cet écran. Elle est pré-remplie, pas envoyée. */
  question: string
  /** Ce que le lien dit. Jamais une icône muette. */
  label: string
  /** Le compte à mettre en portée, quand l'écran en désigne un. */
  accountId?: string
  /**
   * LE POIDS DU LIEN — une primitive, deux poids (décision du 04/09/2026).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI UN VARIANT PLUTÔT QU'UN SECOND COMPOSANT
   * ─────────────────────────────────────────────────────────────────────────
   * Deux retours demandent un accès à Laura plus VISIBLE sur les écrans de
   * liste — « Demander à Laura de prioriser mes renouvellements » (#1367),
   * « Demander à Laura quoi préparer » (#1384). Un lien souligné de la taille
   * du texte courant s'y perd : la question posée devant une file de travail
   * est un ARBITRAGE, pas une consultation.
   *
   * La réponse n'est PAS un second composant. `/contacts` en avait fabriqué un
   * — qui échappait à la garde en passant par `navigate()` — et c'est
   * exactement ce que D44 refuse : « deux moteurs de conversation dans le même
   * produit, c'est deux fois la dette et deux vérités possibles ». Le lien
   * reste le même lien, il change de poids.
   *
   * ⚠️ `prominent` est réservé aux écrans de LISTE. Sur une fiche, le geste
   * principal est de lire ce qui est là ; un bouton plein y prendrait la place
   * de l'action métier.
   *
   * ⚠️⚠️ **IL A LONGTEMPS RENDU UN `outline`, ET ÇA NE SUFFISAIT PAS** (#1419,
   * mesuré en production le 05/09/2026). Sur `/contacts`, « Demander à Laura »
   * et « Exporter vers un tableur » sortaient tous deux en fond transparent et
   * bordure `--bellum-border` : deux boutons rigoureusement identiques, dont
   * l'un est l'intention de la page et l'autre un utilitaire. C'est mot pour
   * mot ce que le retour décrivait — « trop secondaire, ressemble à un bouton
   * utilitaire parmi d'autres » — et remplacer un `outline` écrit à la main par
   * le `outline` du composant partagé ne l'avait pas corrigé. Le variant est
   * désormais le bouton PLEIN, donc la couleur d'accent portée par `Button`.
   *
   * ⚠️ Aucun `bg-[var(--bellum-primary-500)]` écrit à la main : `Button` porte
   * déjà la mesure de contraste, dans les deux thèmes.
   */
  variant?: 'inline' | 'prominent'
  /**
   * #2114.64 — ÉCHAPPATOIRE À LA COURSE, POUR UN CTA QUI N'EST PAS UN DOUBLON.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * MESURÉ EN RECETTE ÉCRAN LE 25/09/2026, sur le cockpit personnel
   * ─────────────────────────────────────────────────────────────────────────
   * La course de #1812/#1847 est faite pour des instances RÉPÉTÉES (une ligne
   * de `DormantOpportunitiesCard` par opportunité, trois CTA sur `MyDataView`)
   * où perdre la course et laisser la bulle porter la question est sans perte
   * : chaque ligne dit la MÊME sorte de chose. Le cockpit personnel pose DEUX
   * CTA de nature différente côte à côte dans son en-tête — « Analyser mon
   * activité » et « Préparer une revue » — et la course en cachait un des
   * deux selon l'ordre de montage : le dernier monté gagnait la bulle, son
   * propre lien disparaissait du DOM, ne laissant que la suggestion dans la
   * bulle flottante. Recette : aucun bouton « Préparer une revue » trouvé.
   *
   * `alwaysVisible` ne change rien à la course elle-même — cette instance
   * peut toujours devenir celle que la bulle propose. Elle change seulement
   * ce que CETTE instance fait quand elle gagne : elle garde son lien plutôt
   * que de s'effacer. Un CTA d'en-tête fixe, à choix limité, ne doit jamais
   * dépendre d'un ordre de montage pour rester visible.
   */
  alwaysVisible?: boolean
  /**
   * Théo L1 — sélecteur avancé — un DOSSIER PRÉCIS pour le fil (`<nature>:<id>`,
   * `?scope=` relu par `Chat`), par exemple une offre d'emploi.
   *
   * ⚠️ Avec lui, le geste est TOUJOURS le lien vers `/chat` : la bulle et
   * l'ouverture sur place ne portent qu'une question, pas un périmètre — passer
   * par elles ouvrirait un fil sur tout l'espace en croyant le cadrer.
   */
  scope?: string
  /**
   * #4345.3 — SOUS UNE SURCOUCHE, LIBÉRER LA PAGE AU LIEU DE NAVIGUER.
   *
   * La bulle est inerte sous une modale (#1847) : le lien vers `/chat` y restait donc le seul geste, et
   * « Avec Laura » du dossier /projects quittait la page (recette prod 01/11). La surcouche qui fournit cette
   * fonction la ferme ; `AskLaura` ouvre alors la bulle SUR PLACE, question pré-remplie et jamais envoyée.
   * Sans elle, rien ne change : le lien reste (gardes GA-283 / #1847).
   */
  releaseOverlay?: () => void
}

/**
 * La recherche de `/chat` d'un « Demander à Laura » (question pré-remplie, compte, contexte d'écran). UN seul endroit :
 * `AskLaura` et `AskLauraMenuItem` (#2408.81, item de menu de ligne) la lisent ici (GA-26).
 */
export function useAskLauraChatSearch({
  question,
  accountId,
  scope,
}: {
  question: string
  accountId?: string
  scope?: string
}) {
  const pageContext = useCurrentLauraContext()
  // #3002 (#2206.45-.48, 25/09/2026) — un contexte SANS compte (pilotage,
  // briefing…) n'est scopé à AUCUN dossier : rien ne peut le prêter au
  // mauvais, donc il voyage TOUJOURS, `accountId` présent ou pas. Avant ce
  // correctif, `context` ne partait QUE pour un appelant qui passait déjà un
  // `accountId` — un écran comme `/pilotage` (jamais d'`accountId`, il ne
  // porte pas UN dossier) perdait donc systématiquement son contexte dès que
  // ce lien naviguait réellement vers `/chat` (mobile, ou surcouche ouverte —
  // `isActive` faux ci-dessous) au lieu de rester déposé dans la bulle. Même
  // règle « entretenue » côté lecture : voir `entryPageContext`.
  const contextTravels = pageContext && (pageContext.entityId === null || pageContext.entityId === accountId)
  const context = contextTravels ? pageContext : undefined
  // Théo L1 — un dossier précis remplace le compte : le fil est cadré sur l'objet, pas sur son compte.
  const search = scope
    ? { prompt: question, scope }
    : {
        prompt: question,
        ...(accountId ? { accountId } : {}),
        ...(context ? { context } : {}),
      }
  return search
}

/**
 * L'ACCÈS CONTEXTUEL AU COPILOTE — un lien, pas un second copilote.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE COMPOSANT
 * ─────────────────────────────────────────────────────────────────────────
 * SIX retours du 02/09 demandent la même chose sur six écrans : « Demander à
 * Laura de prioriser mon portefeuille » (#1316), « d'arbitrer mes priorités »
 * (#1318), « d'analyser cette relation » (#1319), « quoi corriger » (#1322),
 * « voir les recommandations » (#1327), « prioriser mes besoins » (#1334).
 *
 * Six implémentations auraient été six copilotes. D44 a tranché : Laura est une
 * SURCOUCHE, pas un second moteur — « deux moteurs de conversation dans le même
 * produit, c'est deux fois la dette et deux vérités possibles ». Le tome 7 §48
 * appelle « risque technique n°1 » le cas où chaque écran implémente sa propre
 * logique.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Il n'appelle **aucune** route : il ouvre la conversation existante avec la
 * question déjà écrite dans le composer. Le commercial la relit, la modifie, et
 * l'envoie lui-même.
 *
 * ⚠️ **Jamais `?ask=`**, qui poste la question sans que personne ne l'ait relue.
 * #1321.4 le refuse en toutes lettres : « ne pas envoyer aveuglément une
 * commande en un clic ». Et c'est la doctrine du dépôt : le copilote prépare,
 * le commercial envoie — ce n'est pas une convention, c'est l'absence de code.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1812 — IL DÉPOSE AU LIEU D'OCCUPER LA PAGE
 * ─────────────────────────────────────────────────────────────────────────
 * Louis : « je ne veux plus qu'on prenne de l'espace pour ces CTA » — Laura
 * elle-même s'agrandit à l'arrivée avec la question, au lieu d'un lien de plus
 * sur trente écrans. `useAskLauraIntro` (magasin partagé, `laura-intro-store`)
 * fait exactement ça : ce composant DÉPOSE la question, `LauraDock` la LIT.
 *
 * ⚠️ **Aucun des 30 appels existants n'a changé** — le changement vit
 * ENTIÈREMENT ici. Deux replis, tous deux nommés « jamais un trou » :
 *
 *  1. **Pas de bulle sous 768 px** (`useIsMobile`) : Laura y est déjà le
 *     premier onglet ET l'écran d'arrivée (voir `LauraDock.tsx`), donc rien
 *     n'y lirait l'amorce. Le lien d'avant reste le SEUL accès sur mobile.
 *  2. **Plusieurs `<AskLaura>` sur le même écran** (`MyDataView` en pose
 *     trois ; `DormantOpportunitiesCard` et la colonne « prochaine action »
 *     de `MissionTrackingTable` en posent un PAR LIGNE). La bulle ne peut
 *     proposer qu'UNE amorce à la fois — `useAskLauraIntro` répond alors
 *     `false` à tous SAUF le gagnant, et ceux-là gardent leur lien
 *     visible : rien ne disparaît, une seule instance passe le relais à la
 *     bulle. Voir le docblock de `laura-intro-store.ts`, règle 1.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1847 — DANS UNE SURCOUCHE, LE LIEN RESTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le relais à la bulle suppose que la bulle soit ATTEIGNABLE. Sous une modale,
 * elle ne l'est pas : Radix pose `pointer-events: none` sur le corps du
 * document et `aria-hidden="true"` sur tout ce qui n'est pas la modale — la
 * ligne agrandie de Laura reste peinte (`z-widget` = 80 passe au-dessus de
 * `z-overlay` = 60) mais son bouton « Envoyer » ne répond plus et aucun
 * lecteur d'écran ne l'annonce. Mesuré le 10/09/2026 sur `/watchlist` : la
 * modale d'un signal ne rendait plus que « En faire une action », « Ouvrir le
 * dossier » et « Fermer » — la troisième action que #1423 avait explicitement
 * dessinée (« demander quoi faire ») s'était effacée au profit d'un contrôle
 * inerte. Même chose dans le tiroir d'un fil de `/mailbox`, où `LauraDock`
 * masque en plus la ligne (`useAnySheetOpen`, GA-205) : le geste n'existait
 * plus nulle part.
 *
 * Un composant qui s'efface au profit d'un contrôle inatteignable s'efface
 * pour RIEN. À l'intérieur d'une surcouche, `AskLaura` garde donc son lien —
 * et c'est la surcouche, pas la page, qui tient la portée de l'amorce (voir
 * `laura-intro-scope.tsx`).
 */
export function AskLaura({
  question,
  label,
  accountId,
  variant = 'inline',
  alwaysVisible = false,
  scope,
  releaseOverlay,
}: AskLauraProps) {
  const isMobile = useIsMobile()
  const isActive = useAskLauraIntro({ question, label, accountId })
  const openInPlace = useOpenLauraInPlace(releaseOverlay)
  // #1847 — hors de toute surcouche, la profondeur vaut 0 et rien ne change.
  const inOverlay = useLauraIntroScope() > 0
  /**
   * #2146.6 — LE CONTEXTE D'ÉCRAN SURVIT À LA NAVIGATION.
   *
   * `LauraDock` lit déjà `useCurrentLauraContext()` en direct : sur desktop,
   * quand ce composant s'efface au profit de la bulle (ligne ci-dessous), rien
   * à transporter — la bulle voit le même magasin, sur le même écran.
   *
   * Mais dès que ce composant rend un vrai `<Link>` (repli mobile, ou une
   * instance qui a perdu la course de #1812), la navigation vers `/chat`
   * DÉMONTE l'écran d'origine et efface ce qu'il avait publié. Le remettre
   * dans l'URL (`context`, lu par `entryPageContext` dans `Chat.tsx`) est ce
   * qui le fait survivre. Même règle que le magasin et que `entryPageContext`
   * : le contexte ne voyage que pour le compte qu'il décrit — un contexte
   * publié pour un AUTRE compte que celui en portée ne part pas.
   */
  const search = useAskLauraChatSearch({ question, accountId, scope })

  // #1847 — la troisième condition : sous une modale ou un tiroir, la bulle est
  // inerte, donc le lien reste ici plutôt que de passer un relais mort.
  // #2114.64 — la quatrième : un CTA d'en-tête fixe ne s'efface jamais, même
  // gagnant de la course (voir le docblock de `alwaysVisible` ci-dessus).
  if (isActive && !isMobile && !inOverlay && !alwaysVisible && !scope) return null

  // #4309.1 / #4345.1 — sur bureau, hors surcouche et hors `/chat`, la bulle existe et est atteignable :
  // le CTA l'ouvre SUR PLACE (question pré-remplie) au lieu de naviguer. Mobile et surcouche gardent le lien.
  // #4345.3 — sous surcouche, hors /chat : la surcouche se ferme (elle rend la bulle atteignable), puis la bulle s'ouvre.
  // La fermeture de la surcouche passe par la porte unique `useOpenLauraInPlace(releaseOverlay)` (GA-237).
  if (openInPlace && !scope) {
    const open = () => openInPlace(question)
    if (variant === 'prominent') {
      return (
        <Button type="button" size="sm" variant="default" onClick={open}>
          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          {label}
        </Button>
      )
    }
    return (
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1.5 self-start rounded-control py-1 text-sm font-semibold text-[var(--bellum-text-accent)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] pointer-coarse:min-h-11"
      >
        <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </button>
    )
  }

  if (variant === 'prominent') {
    return (
      <Button asChild size="sm" variant="default">
        <Link to="/chat" search={search}>
          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          {label}
        </Link>
      </Button>
    )
  }

  return (
    <Link
      to="/chat"
      search={search}
      className="inline-flex items-center gap-1.5 self-start rounded-control py-1 text-sm font-semibold text-[var(--bellum-text-accent)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] pointer-coarse:min-h-11"
    >
      <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </Link>
  )
}
