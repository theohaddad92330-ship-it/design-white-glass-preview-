import { type InterventionFormat } from '@bellum/contracts'

/**
 * LA FORME QUE L'INTERVENTION DEMANDE — le seul endroit qui applique `format`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'IL CORRIGE (mesuré le 29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * `format` était **écrit et jamais appliqué**. Le contrat le portait, le service
 * l'écrivait en base (`laura.service.ts`), la contrainte SQL le couvrait, les
 * réglages l'annonçaient à l'utilisateur — « Une bulle », « Une carte », « Un
 * panneau » — et le rendu s'en moquait : les trente-cinq interventions
 * sortaient dans la même carte en bas à droite. Trois d'entre elles se
 * déclarent `panel`, dont un appel d'offres à trois jours d'échéance, priorité
 * 90 : la forme la plus visible du catalogue était rendue comme la plus
 * discrète, et l'écran de réglages promettait autre chose que ce qui arrivait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE SEULE DÉRIVATION, ET ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-26 : une dérivation vit à un seul endroit. Le jour où une deuxième surface
 * arrive (le bloc d'écran, la barre de commande), elle lit cette table plutôt
 * que de refaire son propre `switch` — deux tables divergent au premier ajout.
 *
 * ⚠️ La table est un `Record<InterventionFormat, …>` : ajouter un format au
 * contrat sans lui donner de forme ne compile plus. C'est exactement ce qui
 * manquait — un format sans rendu est un levier qui n'existe pas.
 */

type LauraPresentation = {
  /** Le conteneur : placement, largeur, hauteur, empilement. */
  container: string
  /**
   * Le panneau porte un titre VISIBLE, la bulle et la carte non.
   *
   * Un tiroir pleine hauteur qui s'ouvre sans se nommer se lit comme un bout
   * d'écran qui a déraillé ; une carte de deux lignes en bas à droite se
   * reconnaît toute seule et un titre y prendrait la moitié de la place.
   */
  showsTitle: boolean
  /** Le budget de lignes du §11.3 du tome 6. `null` = libre (le panneau). */
  maxLines: number | null
  /** Le même budget en caractères — voir `BUDGETS`. `null` = libre. */
  maxChars: number | null
  /** Le repli visuel qui l'applique, ou `''` quand le budget est libre. */
  clamp: string
}

/**
 * Les classes de repli, écrites en toutes lettres.
 *
 * Tailwind ne génère que ce qu'il LIT dans les sources : `line-clamp-${n}`
 * construit à l'exécution ne produirait aucune règle CSS, et le repli serait un
 * attribut sans effet — exactement le « levier qui n'existe pas » que ce
 * fichier corrige pour `format`. Le type est un `Record` sur l'union : poser un
 * budget de 7 lignes ne compile pas, plutôt que de rendre un `undefined`.
 */
const CLAMPS = { 2: 'line-clamp-2', 3: 'line-clamp-3', 4: 'line-clamp-4' } as const

/**
 * LA TABLE DES CONTRAINTES DE SURFACE — §11.3 du tome 6, §6.1 du tome 7.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE VIT ICI ET PAS DANS UN FICHIER À PART
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-26 : un réglage vit à un seul endroit. La longueur maximale d'un message
 * est une propriété du CONTENEUR — 320 px de bulle n'accueillent pas ce que
 * 420 px de panneau accueillent. La poser ailleurs que sur la ligne qui décrit
 * ce conteneur garantit qu'un jour l'un bougera sans l'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMENT LES CARACTÈRES SE DÉDUISENT DES PIXELS
 * ─────────────────────────────────────────────────────────────────────────────
 * `maxChars = maxLines × charsPerLine`, où `charsPerLine` est la largeur de
 * contenu du conteneur — sa largeur MOINS son remplissage — divisée par la
 * largeur d'un caractère :
 *
 *  · bulle   : 20rem (320 px) − 2 × p-3 (24 px) = 296 px → 42 caractères/ligne
 *  · carte   : 24rem (384 px) − 2 × p-4 (32 px) = 352 px → 50 caractères/ligne
 *  · panneau : libre — il est pleine hauteur, rien n'y déborde
 *
 * ⚠️ **L'estimation est volontairement PESSIMISTE.** Une police d'interface à
 * 14 px avance en moyenne de 6,3 à 6,6 px par caractère en français ; on compte
 * 7 px. Un texte que la garde accepte se rend donc en MOINS de lignes qu'elle
 * ne le croit, et le `line-clamp` posé par `LauraCard` ne peut pas couper ce
 * que la CI a laissé passer. C'est l'ordre qui compte : la garde EMPÊCHE, le
 * repli CONTIENT.
 *
 * Le budget survit au réglage « Taille du texte » : la largeur du conteneur
 * s'exprime en `rem`, donc elle grandit avec la police racine et le rapport
 * caractères-par-ligne ne bouge pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉCART AVEC LA SOURCE, ÉCRIT PLUTÔT QUE MASQUÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le §11.3 pose « 2 lignes + 1 bouton » pour la carte comme pour la bulle. Le
 * catalogue livré ne les tient pas : **31 des 32** textes de carte et de bulle
 * dépassent deux lignes — 26 cartes sur 27, 5 bulles sur 5, médiane 121
 * caractères sur la carte et 120 sur la bulle (les 3 panneaux, eux, sont
 * « libres » chez la source aussi). Le plafond retenu
 * ici est donc **4 lignes** — le plafond réel du conteneur — et non celui de la
 * source. Le ramener à 2 tronquerait trente et un messages ou demanderait de les
 * réécrire : une décision de produit, parquée au tracker, pas un choix de code.
 *
 * ⚠️ C'est un CLIQUET : on ne relève pas ce plafond pour faire passer un texte
 * trop long. Un texte qui ne tient pas se raccourcit.
 *
 * Les deux nombres vivent ENSEMBLE sur une ligne, et `null` veut dire « libre »
 * — jamais « zéro caractère par ligne ». Deux tables séparées auraient permis à
 * une largeur de bouger sans son nombre de lignes.
 */

const BUDGETS: Record<InterventionFormat, { maxLines: keyof typeof CLAMPS; charsPerLine: number } | null> = {
  bubble: { maxLines: 4, charsPerLine: 42 },
  card: { maxLines: 4, charsPerLine: 50 },
  panel: null,
}

/** Ce que les trois formes partagent : le fond, la bordure, l'ombre. */
// Théo — une surcouche : filet `border2`, surface, ombre et rayon de surcouche (`rounded-overlay`, 12 px).
const SKIN = 'border-[var(--bellum-border-strong)] bg-[var(--bellum-surface-1)] shadow-overlay'

/** Ce que la table PORTE elle-même ; le budget, lui, se dérive (voir plus bas). */
type LauraShape = Pick<LauraPresentation, 'container' | 'showsTitle'>

/**
 * ⚠️ Les trois placements évitent la barre de navigation basse du mobile
 * (`--bellum-mobile-nav-height`), et le panneau s'exprime en `inset-y-0` — donc
 * sans une seule unité `vh`, qui mesure faux dès que la barre d'URL d'un
 * navigateur mobile se replie.
 *
 * ⚠️ `md:bottom-20` (5 rem = 80 px) sur la bulle et la carte — POURQUOI.
 *
 * Le lanceur de la bulle de Laura (`features/laura/bubble/LauraDock.tsx`) occupe
 * désormais le coin bas-droite au-dessus de 768 px : 48 px de haut, posé à 16 px
 * du bas, donc jusqu'à 64 px. Sans ce décalage, il se poserait SUR cette carte —
 * et comme il vit en `z-widget` (80) alors que la carte est en `z-30`, il
 * masquerait un message que Laura n'a le droit de dire qu'une fois par écran.
 * Un message perdu de cette façon ne se redemande pas : le serveur a déjà écrit
 * sa trace et refusera « écran déjà servi ».
 *
 * Le décalage est sous `md:` et non inconditionnel parce que **la bulle
 * n'apparaît pas sous 768 px** (Laura y est déjà le premier onglet et l'écran
 * d'arrivée) : y remonter la carte de 64 px la ferait flotter au milieu de rien.
 *
 * ⚠️ La valeur est écrite EN TOUTES LETTRES et non calculée : Tailwind ne génère
 * que ce qu'il LIT dans les sources — c'est la même raison que `CLAMPS`
 * ci-dessus. Elle est volontairement supérieure de 16 px à la hauteur du lanceur
 * (64 px), pour que les deux ne se touchent pas.
 */
const PRESENTATIONS: Record<InterventionFormat, LauraShape> = {
  /** 320 px : un signal court, qu'on remarque sans qu'il prenne la place. */
  bubble: {
    container: `fixed bottom-[calc(1.5rem+var(--bellum-mobile-nav-height,0px))] right-6 z-30 w-[min(20rem,calc(100vw-3rem))] rounded-overlay border p-3.5 md:bottom-20 ${SKIN}`,
    showsTitle: false,
  },
  /** 384 px : la forme par défaut, celle de vingt-sept interventions sur
   *  trente-cinq. Assez de place pour la phrase et son geste. */
  card: {
    container: `fixed bottom-[calc(1.5rem+var(--bellum-mobile-nav-height,0px))] right-6 z-30 w-[min(24rem,calc(100vw-3rem))] rounded-overlay border p-4 md:bottom-20 ${SKIN}`,
    showsTitle: false,
  },
  /**
   * Le tiroir droit du §1 : 420 px, pleine hauteur, pleine largeur sous 768 px.
   *
   * `z-overlay` et non `z-30` : il passe devant la navigation, sinon un tiroir
   * pleine hauteur se ferait couper par la barre latérale. Il reste NON modal —
   * pas de voile, pas de piège au clavier, on peut continuer à travailler
   * derrière. Une modale bloquante est explicitement interdite (§5.5).
   */
  panel: {
    container: `fixed inset-y-0 right-0 z-overlay flex w-full flex-col overflow-y-auto border-l p-5 pb-[calc(1.25rem+var(--bellum-mobile-nav-height,0px))] md:w-[26.25rem] ${SKIN}`,
    showsTitle: true,
  },
}

/**
 * La forme d'un format.
 *
 * Le paramètre est un `string` et non un `InterventionFormat` : le catalogue
 * vient du SERVEUR, qui peut être en avance sur le navigateur d'un onglet resté
 * ouvert. Un format inconnu retombe sur la carte — une intervention dans la
 * mauvaise forme reste lisible, une intervention invisible est perdue.
 */
export function presentationFor(format: string): LauraPresentation {
  // `hasOwnProperty` et non `in` : `in` remonte la chaîne de prototypes, donc un
  // serveur qui enverrait `"constructor"` ou `"toString"` passerait pour un
  // format connu et rendrait une intervention sans conteneur — invisible.
  const known = (Object.prototype.hasOwnProperty.call(PRESENTATIONS, format) ? format : 'card') as InterventionFormat
  const budget = BUDGETS[known]
  return {
    ...PRESENTATIONS[known],
    maxLines: budget?.maxLines ?? null,
    maxChars: budget ? budget.maxLines * budget.charsPerLine : null,
    clamp: budget ? CLAMPS[budget.maxLines] : '',
  }
}

/**
 * #3551 — sur `/chat`, aucune surimpression : le composeur occupe le bas, l'en-tête
 * (Continuer, Résumé, Participants, Détails, Partager) le haut. La carte se pose DANS le
 * flux du fil (`chat-slot.ts`) : même peau que les autres formats, sans position.
 */
// #3192.3 (recette 05/10 : « facture > 30 jours » recouvrait le haut du fil défilé) — la carte est BORNÉE :
// `max-h-44` (11 rem) + `overflow-y-auto` : une phrase longue défile DANS la carte au lieu de l'allonger sur le fil ;
// `shrink-0` : jamais comprimée par la colonne ; `sticky`/`fixed`/`absolute` n'y figurent jamais (elle défile avec le fil).
export const CHAT_INFLOW_CONTAINER = `relative z-0 mx-4 mt-2 max-h-44 w-[min(24rem,calc(100%-2rem))] shrink-0 overflow-y-auto rounded-2xl border p-3 md:mx-6 ${SKIN}`
