import { MOTION, reduced, staggerDelay, type MotionName } from '@bellum/ui'
import type { MotionProps } from 'framer-motion'

/**
 * LA PEAU DE LA SURFACE DE LAURA — #1906 / #1907, à UN seul endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN FICHIER
 * ─────────────────────────────────────────────────────────────────────────
 * « Variation claire entre message utilisateur, réponse, preuve et action »
 * (#1907.13). Mesuré le 13/09/2026 : la carte d'action (`PendingActions`) et la
 * bulle de réponse portaient la MÊME peau — trait neutre, fond de carte, coins
 * arrondis —, et le panneau de sources (`ContextDisclosure`) aussi : trois
 * objets de nature différente se lisaient comme trois bulles empilées. Et le
 * relief écrit sur les bulles (`shadow-xs`) n'était pas peint : Tailwind 3.4
 * ne génère pas ce nom.
 *
 * Les quatre peaux vivent ici plutôt que dans chaque composant pour la raison
 * de GA-26 : distinguer quatre natures est UNE décision, et quatre fichiers qui
 * la recopient divergent au premier réglage. `chat-surface.test.ts` tient leur
 * distinction ; GA-328 (`laura-surface-finish.test.ts`) tient leurs APPELANTS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI NE CHANGE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * L'identité : blanc / gris très clair, violet Bellum, traits fins d'un pixel,
 * rayons de l'échelle nommée (GA-250). Aucune seconde teinte, aucune lueur,
 * aucune ombre au-delà de `shadow-sm` (GA-328, #1907.14 à .18) — et aucun
 * dégradé : le primaire reste PLAT (décision de Louis du 13/09/2026, batch 13 ;
 * le dégradé violet posé derrière l'accueil par #1907.9 est retiré).
 */
export const CHAT_SURFACE = {
  /** #1907.13 — ta question : le violet plein, et le texte calibré pour lui (6,37:1 dans les deux thèmes). */
  question: 'rounded-xl rounded-br bg-[var(--bellum-primary-500)] text-[var(--bellum-on-primary)] shadow-sm',
  /**
   * #1907.13 — la réponse de Laura : une bulle posée sur la page — trait neutre, relief doux (#1907.5).
   *
   * #3273 — LE TEXTE DE LA RÉPONSE EST CE QU'ON LIT LE PLUS DANS CE PRODUIT.
   * Il portait `--bellum-text-secondary` — le même gris qu'une puce de connecteur
   * ou une légende — pendant que `--bellum-text-primary` restait réservé au gras
   * À L'INTÉRIEUR du texte. Le corps était donc plus PÂLE que ses propres mots en
   * gras, l'inverse de ce qu'une hiérarchie typographique doit faire. Passé en
   * primaire : le gras continue de se distinguer par le POIDS (`font-semibold`),
   * plus par la seule couleur.
   */
  reply:
    'rounded-xl rounded-bl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-[var(--bellum-text-primary)] shadow-sm',
  /**
   * #3273 — LA TAILLE DU CORPS D'UNE RÉPONSE, À UN SEUL ENDROIT (GA-26).
   *
   * Elle était écrite en dur, IDENTIQUE, à deux endroits de `Chat.tsx` (la bulle
   * du fil et l'amorce de Laura) : `text-sm leading-relaxed`, 14 px partout. Une
   * échelle jamais mesurée en desktop : `text-sm` est la taille d'une LÉGENDE
   * (GA-31 la classe aussi comme telle ailleurs dans le produit), pas celle d'un
   * texte qu'on lit plusieurs paragraphes durant. `text-base` (16 px, dans
   * l'échelle GA-31) au-delà de `md` ; sous 768 px, `text-sm` reste — la garde
   * mobile GA-30 tient déjà les cibles tactiles, pas la taille du texte, et une
   * ligne à 16 px sur un écran de 375 px de large couperait plus de mots par
   * ligne qu'elle n'en gagnerait en lisibilité.
   */
  replyText: 'text-sm leading-relaxed md:text-base',
  /**
   * #1907.13 — la preuve (contexte, sources, non consulté) : EN RETRAIT. Le
   * creux `--bellum-surface-2`, sans trait ni relief — c'est le rôle que
   * `tokens.css` donne à ce fond (« zone en retrait »), et les trois niveaux
   * de texte y sont calibrés AA.
   */
  proof: 'rounded-lg bg-[var(--bellum-surface-2)]',
  /** #1907.13 / #1907.10 — une action : un liseré violet et un relief doux. C'est ce qui se clique. */
  action: 'rounded-lg border border-[var(--accent-soft-border)] bg-[var(--bellum-surface-1)] shadow-sm',
  /** #1906.9 / #1907.10 — la boîte de saisie flotte : un seul cadre, en relief. */
  composer: 'rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] shadow-sm',
  /**
   * #3774.1.1 — les gouttières de la saisie sont CELLES du fil (`px-4 md:px-8` sur
   * `MessagesArea`) : sans elles, la saisie commençait 4 à 12 px avant la colonne qu'elle
   * est censée prolonger, et la grille « commune » avait deux bords gauches.
   *
   * #1906.8 / #1906.9 — ce qui entoure la saisie. C'était une BANDE — trait
   * supérieur et fond de carte — dans laquelle la boîte se posait : un cadre
   * dans un cadre, qui faisait de la saisie un pied de formulaire.
   *
   * #3847.1 — `md:px-8` (était `md:px-6`) : la colonne ne borne plus le bloc à
   * 768 px, la marge latérale devient la seule chose qui respire autour du
   * contenu pleine largeur. `px-4` au téléphone est INCHANGÉ.
   */
  composerBand: 'shrink-0 px-4 pb-3 pt-1 md:px-8',
  /**
   * #1906.7 — la colonne de lecture, partagée par l'accueil et le fil. L'accueil
   * était borné à 576 px (`max-w-xl`) quand le fil l'est à 768 : six cartes de
   * 185 × 154 px mesurées en production, et un écran qui changeait de largeur
   * au premier message.
   *
   * #2001 (14/09/2026) l'avait CALÉE À GAUCHE (`mr-auto`) sans l'élargir : 768 px
   * centrés dans une zone de 1 244 px laissaient ~215 px de gouttière à gauche —
   * « pas au milieu comme dans une discussion par SMS téléphone ». La zone de
   * saisie, juste dessous, occupait déjà TOUTE la largeur depuis le 27/08 : le
   * fil était le seul objet de l'écran à ne pas partir du même bord que ce qu'on
   * tape.
   *
   * ⚠️⚠️ #3847.1 — DÉCISION LOUIS 08/10/2026, RENVERSEMENT ASSUMÉ ET DATÉ de
   * #2001 (ci-dessus) pour la seule surface /chat : la colonne n'est plus
   * bornée du tout. « La barre latérale devrait faire tout l'écran » — mesuré
   * en production le 08/10, la bande vide à droite du composeur n'avait pas
   * disparu avec #2001, elle avait seulement changé de bord. Le fil, le
   * composeur et les cartes occupent désormais toute la largeur disponible à
   * droite de la barre latérale ; la gouttière devient `md:px-8` sur les
   * conteneurs partagés (`composerBand`, `MessagesArea`) plutôt qu'un `max-w-`
   * sur la colonne. `c90_chat_pleine_largeur` au registre de doctrine.
   *
   * Ce que ce renversement NE touche PAS : `reading` ci-dessous garde sa borne
   * de 70 caractères (D81 reste pour le TEXTE qu'on lit dans une bulle) — ce
   * qui s'élargit est le BLOC (où se posent cartes et composeur), jamais la
   * prose. Sous 768 px rien ne change : `w-full` gagnait déjà, il gagne encore.
   */
  column: 'w-full',
  /**
   * #1907.13 / D81 — la largeur de LECTURE d'une bulle. Ce n'est PAS la colonne
   * ci-dessus : la colonne borne le BLOC (768 px, là où se posent les cartes et
   * les tableaux), celle-ci borne le TEXTE QU'ON LIT.
   *
   * Elle était écrite `max-w-[min(680px,92%)]`, à DEUX endroits (la bulle du fil
   * et l'amorce de Laura) : 680 px à `text-sm` mesurent ≈ 93-97 caractères, donc
   * une ligne et demie de la borne de D81 — et deux copies d'un même réglage
   * divergent au premier retour (GA-26).
   *
   * ⚠️ Elle s'exprime en `ch` et jamais en pixels : `ch` suit la police RACINE,
   * donc la borne survit au réglage « Taille du texte » du système. Un `680px`
   * garde 97 caractères par ligne quand quelqu'un choisit « Grand », c'est-à-dire
   * exactement au moment où la ligne devient la plus dure à suivre.
   *
   * Le `92%` reste : sous 760 px environ, c'est lui qui mord, et il laisse la
   * gouttière qui distingue une bulle de son bord d'écran.
   */
  reading: 'min-w-0 max-w-[min(70ch,92%)]',
  /**
   * GA-26 — L'ANNEAU DE FOCUS, À UN SEUL ENDROIT.
   *
   * Il était réécrit SIX fois à la main dans `Chat.tsx` — cinq
   * `focus-visible:ring-[var(--bellum-primary-500)]` et un `color-mix` sur le
   * cadre de la saisie. Un réglage qui vit à six endroits n'en est plus un.
   *
   * ⚠️ La couleur n'est PAS une nuance fixe de la gamme primaire : `primary-500`
   * tombe à 2,68:1 sur le fond sombre, sous le 3:1 que WCAG 1.4.11 demande à un
   * indicateur non textuel — l'anneau du thème sombre était donc à peine visible,
   * ce qui est le contraire de ce qu'un anneau de focus doit faire (#1944.8).
   * `--bellum-text-accent` est la seule teinte d'accent définie DES DEUX CÔTÉS.
   *
   * `focus-visible` et non `focus` : la souris ne peint pas d'anneau.
   * `outline-none` va avec — sans lui, le contour natif double le nôtre.
   */
  focusRing: 'outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-text-accent)]',
  /**
   * GA-26 — le même anneau, quand c'est le CADRE qui reçoit le focus d'un de ses
   * enfants (la boîte de saisie autour du `textarea`). Deux formes parce que
   * Tailwind ne compose pas un variant à l'exécution, une seule couleur : une
   * classe construite en JavaScript ne serait jamais générée par le JIT.
   */
  focusWithinRing: 'focus-within:ring-2 focus-within:ring-[var(--bellum-text-accent)]',
  /**
   * GA-26 — LA GOUTTIÈRE DU BOUTON DE SIGNALEMENT, nommée plutôt que recopiée.
   *
   * Valait `ml-14 md:ml-0` tant que `FeedbackWidget.tsx` s'ancrait en bas à
   * GAUCHE sous 768 px. La recette iPhone du 25/09 (#2117.84) l'a fait passer
   * à DROITE (`right-4`) à toutes les largeurs — la saisie réservait donc 56 px
   * pour un bouton qui ne s'y posait plus, exactement le défaut mesuré par
   * Louis le 26/09 (#3050, point 5 : « composer décalé à droite… au lieu de
   * pleine largeur »).
   *
   * Vide désormais : sur /chat mobile le bouton se tait carrément (`FeedbackWidget`,
   * `hiddenOnChatMobile`), et ailleurs il partage déjà le coin bas-droite avec
   * `Envoyer` sans qu'aucune marge n'ait jamais existé pour l'y accommoder. Le
   * jeton RESTE — nommé, à un seul endroit (GA-26) — pour que le jour où un
   * bouton reprend ce coin, c'est ICI que la réservation se réécrit.
   */
  composerFeedbackGutter: '',
  /**
   * #3351.3 (LAU-UI-301, recette prod 30/09) — LE FILET ENTRE LA SAISIE ET LA
   * RANGÉE D'OUTILS.
   *
   * « Blocs mieux délimités » : le champ et la rangée d'amorces/outils
   * vivaient dans le MÊME cadre (`CHAT_SURFACE.composer`) sans rien qui les
   * sépare — un bloc unique pour deux gestes (écrire, puis agir). Le même
   * trait 1px que le reste de la surface (GA-328, jamais 2px — `thickBorders`
   * dans `laura-surface-finish.test.ts`), jamais une seconde couleur : ce
   * n'est pas un second cadre, juste la limite entre deux zones d'un même.
   */
  composerToolbarDivider: 'border-t border-[var(--bellum-border)]',
} as const

type ChatMotionProps = Pick<MotionProps, 'initial' | 'animate' | 'exit' | 'transition'>

/**
 * #1907.11 — un mouvement de la grammaire du produit (`packages/ui/src/motion.ts`),
 * dans sa version réduite quand le système demande moins de mouvement.
 *
 * La surface de Laura écrivait ses mouvements à la main (`y: 8, scale: 0.99`,
 * `animate-pulse`) : ils répondaient à la bonne question sans parler la langue
 * du reste du produit. `reduced` ne supprime rien — un contenu qui apparaît
 * d'un coup est plus brutal que ce dont la personne se plaint.
 */
export function chatMotion(name: MotionName, reduce: boolean | null): ChatMotionProps {
  const variant = MOTION[name]
  return (reduce ? reduced(variant, name) : variant) as ChatMotionProps
}

/** #1907.11 — le même mouvement, décalé par la cascade du produit (40 ms, plafonnée à huit). */
export function staggered(motion: ChatMotionProps, index: number): ChatMotionProps {
  return { ...motion, transition: { ...motion.transition, delay: staggerDelay(index) } }
}
