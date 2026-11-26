import { guideAnchorIdSchema, type GuideAnchorId } from '@bellum/contracts'

/**
 * #2212.16 — LE CATALOGUE DES ANCRAGES : LE SEUL ENDROIT OÙ UNE CIBLE EXISTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN CATALOGUE, ET PAS SEULEMENT UN ATTRIBUT DANS LE DOM
 * ─────────────────────────────────────────────────────────────────────────────
 * Sans catalogue, « cet ancrage n'est pas dans la page » et « cet ancrage
 * n'existe nulle part dans le produit » sont le même silence. Ce sont deux faits
 * très différents : le premier est normal (le tiroir est fermé, on est sur un
 * autre écran), le second est un DÉFAUT — un pas de guide qui vise un élément
 * qu'un remaniement a emporté. Le catalogue permet de les distinguer, et c'est
 * ce qui donne la raison d'absence `anchor-undeclared` (#2212.37).
 *
 * Il sert aussi de liste à la garde `un-ancrage-de-guide-est-pose-dans-le-code` :
 * chaque entrée doit être POSÉE quelque part dans `apps/web/src`. Une entrée
 * jamais posée est du code juste que personne n'appelle — le motif qui revient
 * dans les ~30 chantiers livrés.
 *
 * ⚠️ Le catalogue ne doit JAMAIS être vide : une garde aveugle n'est pas une
 * exemption, et une garde qui boucle sur zéro entrée est verte sans rien lire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SOCLE Y MET, ET CE QU'IL N'Y MET PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux entrées, sur le MÊME écran — celui qui existe partout. Elles prouvent la
 * chaîne de bout en bout, cible principale ET cible de secours (#2212.36), sans
 * lier le socle à un écran particulier. Les ~140 pas de guide à venir ajoutent
 * la leur en même temps que l'attribut sur l'élément qu'ils visent : les deux
 * gestes vont ensemble, et la garde le vérifie.
 */
export const GUIDE_ANCHOR_CATALOGUE = [
  /**
   * Le bouton qui ouvre l'envoi d'un retour, monté à la racine donc présent sur
   * TOUS les écrans (`apps/web/src/features/feedback/FeedbackWidget.tsx`). C'est
   * pour ça qu'il sert de premier ancrage : un socle dont la cible dépendrait
   * d'un écran précis ne pourrait pas se prouver ailleurs que sur cet écran.
   */
  'retour.bouton-declencheur',
  /**
   * Le panneau du même widget, une fois ouvert. Il sert de cible de SECOURS
   * (#2212.36) et ce n'est pas un exemple de confort : quand le panneau est
   * ouvert, le bouton déclencheur n'est plus à l'écran. Désigner le bouton
   * échouerait alors pour une raison qui n'a rien d'une panne — c'est exactement
   * ce qu'une cible de secours est censée rattraper.
   */
  'retour.panneau',
  /*
   * #2214.24 — LES ANCRAGES DES GUIDES 2 À 12, un espace de noms par écran.
   *
   * Chacun est posé sur un élément présent DÈS que l'écran est monté, données
   * vides comprises : jamais sur une ligne de liste, jamais derrière un
   * chargement ou une porte de palier, jamais dans la barre latérale (#1787).
   * Un ancrage conditionnel ferait sauter son pas en silence le jour où la
   * liste est vide — c'est-à-dire le premier jour, celui où l'on a besoin d'aide.
   */
  'analyse.composer',
  'analyse.preparer',
  'compte.action-principale',
  'compte.sections',
  'compte.contenu',
  'cibles.creer-une-liste',
  'cibles.listes',
  'decouvrir.recherche',
  'decouvrir.lancer',
  'decouvrir.resultats',
  'laura.fil',
  'laura.saisie',
  'actions.filtres',
  'actions.journal',
  'boite-mail.fils',
  /** Secours de `boite-mail.fils` : sans messagerie branchée, le fil n'existe pas. */
  'boite-mail.brancher',
  'boite-mail.rechercher',
  'projets.vues',
  'projets.contenu',
  'missions.vues',
  'missions.contenu',
  'integrations.recherche',
  'integrations.importer',
  'import.assistant',
  'import.etapes',
  /*
   * #2214.9 — LES ANCRAGES DU GUIDE « TES CONTACTS DÉJÀ CONNUS », le texte
   * fourni par l'issue #2214 pour l'écran Contacts, absent des guides 2 à 12
   * (`guide-registry.ts` n'ouvrait aucun guide sur `/contacts`).
   */
  'contacts.page',
  'contacts.recherche',
  /*
   * #2214.18 (épopée #2788) — LES ANCRAGES DU GUIDE « VIVIER », le premier
   * guide ciblé sur le persona Recruteur. Posés sur des éléments TOUJOURS
   * montés sur `/consultants?view=talents` (par défaut), vivier vide compris :
   * la barre des trois vues (`VivierViewTabs.tsx`) et le bouton « Ajouter »
   * (`ConsultantsPage.tsx`), ni l'un ni l'autre conditionnés par une donnée.
   */
  'vivier.vues',
  'vivier.ajouter',
] as const

/** L'attribut que le composant pose et que le moteur lit. Un seul nom (GA-26). */
export const GUIDE_ANCHOR_ATTRIBUTE = 'data-guide-anchor'

/**
 * Ce qu'un composant étale sur l'élément qu'un guide pourra désigner :
 * `<button {...guideAnchorProps('retour.bouton-declencheur')}>`.
 *
 * C'est un ATTRIBUT DE DONNÉE, pas un identifiant ni une classe : il ne change
 * ni le style, ni l'accessibilité, ni le comportement de l'élément. Poser un
 * ancrage ne coûte donc rien au composant, et le retirer ne casse que le guide —
 * ce qui est le bon sens de la dépendance.
 */
export function guideAnchorProps(anchor: GuideAnchorId): Record<string, string> {
  return { [GUIDE_ANCHOR_ATTRIBUTE]: anchor }
}

/** Cet ancrage est-il déclaré dans le catalogue du produit (#2212.37) ? */
export function isDeclaredGuideAnchor(value: string): boolean {
  return (GUIDE_ANCHOR_CATALOGUE as readonly string[]).includes(value)
}

/**
 * Retrouve l'élément d'un ancrage dans la page — ou `null`, jamais une exception.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA VALIDATION N'EST PAS UNE FORMALITÉ, C'EST LA BARRIÈRE DE #1787
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ancrage est validé par le schéma du contrat AVANT qu'un sélecteur existe.
 * Sans ça, `findGuideAnchorElement('"] , *')` construirait un sélecteur
 * arbitraire et le moteur se remettrait à DEVINER la structure du DOM —
 * exactement ce que `ProductTourDialog.tsx:9-19` refuse. Après validation, un
 * ancrage ne peut contenir ni guillemet, ni crochet, ni chevron, ni espace :
 * le sélecteur est sûr par construction.
 *
 * La recherche porte sur tout le document, et c'est voulu : les surcouches du
 * produit (tiroirs, modales) se rendent par portail dans `document.body`, donc
 * une cible dans un tiroir ouvert est trouvée sans que le moteur connaisse le
 * tiroir (#2212.25).
 */
export function findGuideAnchorElement(anchor: string, root: ParentNode = document): HTMLElement | null {
  if (!guideAnchorIdSchema.safeParse(anchor).success) return null
  return root.querySelector<HTMLElement>(`[${GUIDE_ANCHOR_ATTRIBUTE}="${anchor}"]`)
}
