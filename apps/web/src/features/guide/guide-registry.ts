import type { GuideDefinition, GuidePersona } from '@bellum/contracts'
import type { GuideSessionRequest, GuideStep } from './guide-store'

/**
 * #2212.44/.45 — LE REGISTRE CENTRAL, UNIQUE ET VERSIONNÉ, DES GUIDES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN REGISTRE, ET POURQUOI PAS UN STARTER PAR GUIDE
 * ─────────────────────────────────────────────────────────────────────────────
 * `guide-starters.ts` exportait `FEEDBACK_COACHMARK` comme une constante isolée
 * — un pas prouvant la chaîne, sans id ni version. C'était juste tant qu'il n'y
 * avait qu'un guide : dès qu'un deuxième arrive, « quels guides existent, dans
 * quelle version » redevient une question sans réponse unique — exactement ce
 * que #2212.44 demande (« registre central UNIQUE et VERSIONNÉ »).
 *
 * Ce fichier EST ce registre. Il combine la définition du contrat
 * (`GuideDefinition` : id, version, mode, level, trigger, audience) avec les
 * `steps` qu'elle ne porte pas (#2212.45 — le contrat ne connaît pas le web),
 * et la fiche du centre d'aide (`help`, #2214.24).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2214.24 — LES GUIDES 2 À 12 (tranché sans Louis, décision du 19/09/2026 :
 * « je complète moi-même »)
 * ─────────────────────────────────────────────────────────────────────────────
 * La source de #2214 est coupée après le guide 1. Les onze parcours suivent la
 * boucle du produit, dans l'ordre où un commercial la parcourt : analyser un
 * compte → lire son dossier → construire ses cibles → découvrir → travailler
 * avec Laura → suivre ses actions → la boîte mail → projets et besoins →
 * missions → brancher ses outils → importer ses données.
 *
 * Trois règles les tiennent, et chacune a son test :
 * 1. UN guide = UN écran. Le guide ne navigue jamais seul (GA-371, #1787) : un
 *    pas sur un autre écran sauterait en silence. C'est le centre d'aide qui
 *    ouvre l'écran, sur le clic de la personne, AVANT de lancer le guide.
 * 2. Chaque pas exige la route de son écran (`requirements.route`) : lancé
 *    ailleurs, il ne désigne jamais un homonyme.
 * 3. Chaque pas vise un ancrage présent données vides comprises (voir
 *    `guide-anchors.ts`) : l'aide sert d'abord le premier jour.
 *
 * Le tableau de bord n'a PAS de guide : tout ce qu'il montre est personnel et
 * se cache sans données ou sans palier — aucun endroit stable à désigner. La
 * visite des écrans (`ProductTourDialog`) le présente déjà.
 *
 * L'avancement ne se persiste pas (refusé) : un guide fermé se relance entier.
 */
type GuideScreen = {
  /** La route que chaque pas exige — celle que le centre d'aide ouvre. */
  route: string
  /**
   * `false` quand la route porte un paramètre (un dossier compte PRÉCIS) : le
   * centre d'aide ne devine pas lequel ouvrir, il dit où aller.
   */
  navigable: boolean
}

type CataloguedGuide = GuideDefinition & {
  steps: readonly GuideStep[]
  /** #2214.24 — la fiche du centre d'aide. `screen: null` = utile partout. */
  help: { titleKey: string; summaryKey: string; screen: GuideScreen | null }
}

/**
 * Un parcours d'écran : même forme pour les onze, seul le contenu change.
 *
 * #2214.17-.22 (épopée #2788) — `audience: ['commercial']` : les douze routes
 * couvertes (`/search`, `/accounts`, `/mes-cibles`, `/discover`, `/chat`,
 * `/actions`, `/mailbox`, `/projects`, `/missions`, `/integrations`,
 * `/settings/mes-donnees`, `/contacts`) sont TOUTES des écrans du parcours
 * commercial (#2214 — « COMMERCIAL / BUSINESS MANAGER : Découvrir, Analyser,
 * Comptes, Contacts… ») ; aucune ne touche au vivier, aux besoins/matching, à
 * la facturation ou aux réglages d'équipe des quatre autres personas. Vérifié
 * le 25/09/2026, pas deviné : c'est un fait mesuré sur le catalogue existant,
 * pas une intention.
 */
function screenWalkthrough(
  id: string,
  screen: GuideScreen,
  steps: readonly (Omit<GuideStep, 'requirements' | 'titleKey' | 'bodyKey'> & { key: string })[],
  /**
   * #2212.12 — `action-guidee` pour le seul parcours dont le dernier pas
   * déclare `awaitsResult` (`analyser-un-compte`) : la progression sur clic
   * générique (#2212.14) n'a de sens que si un pas peut ensuite attendre le
   * résultat réel plutôt que le clic. Les onze autres restent `tutoriel` —
   * défaut inchangé, aucun appelant existant n'est affecté.
   */
  mode: CataloguedGuide['mode'] = 'tutoriel',
  // #2214.18 (épopée #2788) — le SEUL des treize écrans hors du parcours
  // commercial : le Vivier. `['commercial']` reste le défaut des douze autres,
  // jamais deviné pour celui-ci. Positionnel APRÈS `mode` (#2212.12) : ne
  // décale aucun appel existant, `mode` garde son quatrième rang.
  audience: GuidePersona[] = ['commercial'],
): CataloguedGuide {
  return {
    id,
    version: 1,
    mode,
    level: 'walkthrough',
    trigger: 'manual',
    audience,
    help: { titleKey: `guides.${id}.title`, summaryKey: `guides.${id}.summary`, screen },
    steps: steps.map(({ key, ...step }) => ({
      ...step,
      requirements: { route: screen.route },
      titleKey: `guides.${id}.steps.${key}.title`,
      bodyKey: `guides.${id}.steps.${key}.body`,
    })),
  }
}

export const GUIDE_REGISTRY: readonly CataloguedGuide[] = [
  {
    id: 'retour-comment-le-signaler',
    version: 1,
    mode: 'tutoriel',
    level: 'coachmark',
    trigger: 'manual',
    audience: [],
    help: {
      titleKey: 'guides.retour-comment-le-signaler.title',
      summaryKey: 'guides.retour-comment-le-signaler.summary',
      screen: null,
    },
    steps: [
      {
        anchor: 'retour.bouton-declencheur',
        // #2212.36 — le secours : quand le panneau de retour est déjà ouvert,
        // le bouton déclencheur n'est plus à l'écran.
        fallbackAnchor: 'retour.panneau',
        titleKey: 'coachmark.retour.title',
        bodyKey: 'coachmark.retour.body',
      },
    ],
  },
  screenWalkthrough(
    'analyser-un-compte',
    { route: '/search', navigable: true },
    [
      { key: 'composer', anchor: 'analyse.composer' },
      /**
       * #2212.12 — le clic sur « Lancer » ne dit rien à lui seul : il peut
       * ouvrir un dossier déjà là (cache) comme en démarrer un neuf. Le guide
       * attend `bellum:guide-analysis-started` — dispatché par
       * `useAnalysis.ts` une fois la réponse RÉELLE du serveur connue — avant
       * de se terminer, jamais le clic lui-même.
       */
      { key: 'preparer', anchor: 'analyse.preparer', awaitsResult: { event: 'bellum:guide-analysis-started' } },
    ],
    'action-guidee',
  ),
  screenWalkthrough('lire-un-dossier-compte', { route: '/accounts/', navigable: false }, [
    { key: 'action', anchor: 'compte.action-principale' },
    { key: 'sections', anchor: 'compte.sections' },
    { key: 'contenu', anchor: 'compte.contenu' },
  ]),
  screenWalkthrough('construire-ses-cibles', { route: '/accounts', navigable: false }, [
    { key: 'creer', anchor: 'cibles.creer-une-liste' },
    { key: 'listes', anchor: 'cibles.listes' },
  ]),
  screenWalkthrough('decouvrir-des-comptes', { route: '/discover', navigable: true }, [
    // #3646 — plus de saisie libre : le pas désigne le rail de critères, sans « essayer l'exemple ».
    { key: 'recherche', anchor: 'decouvrir.recherche' },
    { key: 'lancer', anchor: 'decouvrir.lancer' },
    { key: 'resultats', anchor: 'decouvrir.resultats' },
  ]),
  screenWalkthrough('travailler-avec-laura', { route: '/chat', navigable: true }, [
    { key: 'fil', anchor: 'laura.fil' },
    { key: 'saisie', anchor: 'laura.saisie' },
  ]),
  screenWalkthrough('suivre-ses-actions', { route: '/actions', navigable: true }, [
    { key: 'filtres', anchor: 'actions.filtres' },
    { key: 'journal', anchor: 'actions.journal' },
  ]),
  screenWalkthrough('lire-sa-boite-mail', { route: '/mailbox', navigable: true }, [
    // Sans messagerie branchée, le fil n'existe pas : on montre le bandeau
    // qui la branche (#2212.36), jamais un fil vide inventé.
    { key: 'fils', anchor: 'boite-mail.fils', fallbackAnchor: 'boite-mail.brancher' },
    { key: 'rechercher', anchor: 'boite-mail.rechercher' },
  ]),
  screenWalkthrough('projets-et-besoins', { route: '/projects', navigable: true }, [
    { key: 'vues', anchor: 'projets.vues' },
    { key: 'contenu', anchor: 'projets.contenu' },
  ]),
  screenWalkthrough('piloter-ses-missions', { route: '/missions', navigable: true }, [
    { key: 'vues', anchor: 'missions.vues' },
    { key: 'contenu', anchor: 'missions.contenu' },
  ]),
  screenWalkthrough('brancher-ses-outils', { route: '/integrations', navigable: true }, [
    { key: 'recherche', anchor: 'integrations.recherche' },
    { key: 'importer', anchor: 'integrations.importer' },
  ]),
  screenWalkthrough('importer-ses-donnees', { route: '/settings/mes-donnees', navigable: true }, [
    { key: 'assistant', anchor: 'import.assistant' },
    { key: 'etapes', anchor: 'import.etapes' },
  ]),
  /**
   * #2214.9 — texte fourni tel quel par l'issue #2214 (« EXEMPLE — CONTACTS »),
   * absent des guides 2 à 12 : aucun n'ouvrait `/contacts`.
   */
  screenWalkthrough('tes-contacts-deja-connus', { route: '/contacts', navigable: true }, [
    { key: 'page', anchor: 'contacts.page' },
    { key: 'recherche', anchor: 'contacts.recherche' },
  ]),
  /**
   * #2214.23 — LE GUIDE 1 « PREMIER SUCCÈS BELLUMAI », déclenché seul après
   * l'onboarding (voir `use-first-success-guide.ts`, qui décide QUAND le
   * démarrer : ce fichier ne fait que le CATALOGUER).
   *
   * ⚠️ `trigger: 'automatic'` exige `mode: 'intervention-proactive'`
   * (#2213.20, `guide.ts`) : c'est le seul mode qui parle sans qu'on le lui
   * demande, et c'est pour ça que ce guide n'est pas un `screenWalkthrough`
   * comme les douze autres — ceux-là sont « demandés par la personne, jamais
   * imposés » par construction.
   *
   * L'ancrage (`laura.saisie`) est RÉUTILISÉ, pas inventé : c'est celui du
   * guide `travailler-avec-laura`, déjà posé sur `/chat` et présent données
   * vides comprises. `/chat` est aussi la destination par défaut après
   * l'onboarding (`resolveDefaultLandingRoute`) — le cas le plus fréquent.
   * `requirements.route` gate le pas comme n'importe quel autre : lancé
   * depuis un autre écran (centre d'aide), il s'écarte proprement au lieu de
   * désigner un homonyme (GA-371).
   *
   * `help.screen` reste `null` : ce guide n'est pas listé comme « guide
   * d'écran » au sens de #2214.24 (il ne s'ouvre pas EN PLUS d'un écran, il
   * accueille sur celui où l'on vient d'atterrir) — voir le test dédié dans
   * `guide-registry.test.ts`.
   */
  {
    id: 'premier-succes-bellumai',
    version: 1,
    mode: 'intervention-proactive',
    level: 'coachmark',
    trigger: 'automatic',
    audience: [],
    help: {
      titleKey: 'guides.premier-succes-bellumai.title',
      summaryKey: 'guides.premier-succes-bellumai.summary',
      screen: null,
    },
    steps: [
      {
        anchor: 'laura.saisie',
        requirements: { route: '/chat' },
        titleKey: 'guides.premier-succes-bellumai.steps.saisie.title',
        bodyKey: 'guides.premier-succes-bellumai.steps.saisie.body',
      },
    ],
  },
  /**
   * #2214.18 (épopée #2788) — LE PREMIER GUIDE RECRUTEUR : LE VIVIER.
   *
   * Trois vérifications de nuit successives ont conclu qu'aucun écran
   * Vivier/Besoins/Matching n'existait pour ancrer un guide Recruteur — mesuré
   * à chaque fois sur ce même registre, jamais sur l'écran lui-même. C'est
   * inexact : `/consultants` EST l'adresse du Vivier (`VivierPage.tsx`,
   * #2152.39/.40, décision de Louis du 16/09/2026) depuis le 25/09/2026 à
   * 01h53 — avant la première de ces trois vérifications (25/09 17h42).
   *
   * `audience: ['recruteur']` — le seul des treize guides d'écran qui ne cible
   * pas le persona commercial : `orderGuidesByPersona` (c76, jamais un filtre)
   * le fait simplement passer en tête pour ce rôle, sans le retirer des neuf
   * autres.
   */
  screenWalkthrough(
    'vivier-de-talents',
    { route: '/consultants', navigable: true },
    [
      { key: 'vues', anchor: 'vivier.vues' },
      { key: 'ajouter', anchor: 'vivier.ajouter' },
    ],
    'tutoriel',
    ['recruteur'],
  ),
]

/** Un guide catalogué démarré tel quel : sa métadonnée de registre s'efface. */
export function guideSessionFromDefinition(definition: CataloguedGuide): GuideSessionRequest {
  return { mode: definition.mode, level: definition.level, steps: definition.steps }
}
