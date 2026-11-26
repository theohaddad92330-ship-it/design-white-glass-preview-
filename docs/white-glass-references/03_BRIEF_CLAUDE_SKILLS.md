# Brief d'exécution pour Claude Code — références visuelles et comportement de BellumAI

Ce document accompagne l'atlas des captures et les 19 principes d'UX et d'animation. Il ne remplace ni les retours de Théo, ni le système prompt principal, ni le code. Son rôle est de traduire les références **fixes** en composants, transitions, données et gestes vérifiables dans le produit.

## Mission, contexte et limites

BellumAI est le système de travail commercial et de recrutement d'une ESN. La première seconde d'usage doit aider le Business Manager à comprendre son prochain dossier, son prochain rendez-vous et sa prochaine action ; le responsable d'agence et la direction doivent pouvoir lire la performance, les blocages, la charge, les objectifs et la finance au bon périmètre. Laura partage le même contexte et peut proposer des actions contrôlées. La priorité actuelle est **White Glass uniquement**. Le Dark Glass attend une validation distincte.

Le paquet précédent `BellumAI_White_Glass_Complet_2026-11-26.zip` rassemble une prévisualisation White Glass, la transcription des demandes, le système prompt principal, les sources et les références. Le monorepo `belllum-monorepo-main (17).zip` est la dernière source applicative fournie. Vérifie s'il existe un dépôt plus récent avant de modifier quoi que ce soit. Le Site `dist/` est une **prévisualisation statique** alimentée par des données d'exploration et par `localStorage` : il ne prouve pas que CRM, ATS, agenda, finance ou Laura soient branchés au backend. Le plan `docs/INTEGRATION_PLAN.md` décrit les raccordements à construire et les services à réutiliser. Ne représente pas une démonstration comme un fait connecté.

Garde le rail de navigation existant compact et le seul menu parent « Ma journée » avec ses sous-entrées. Comptes, Affaires, Talent et Mission restent les destinations métier canoniques. Les captures d'autres marques inspirent la composition, les matériaux, la densité et la forme des graphiques ; leurs couleurs, logos et promesses ne sont pas des instructions à copier. Les 17 captures envoyées dans ce fil sont présentes sous `images/` ; l'atlas les analyse individuellement. Une image fixe ne révèle **aucune animation réelle** : les mouvements proposés dans ce paquet sont des spécifications à concevoir et à tester, pas des observations prétendues.

## Démarrage obligatoire dans l'environnement Claude Code

1. Décompresse les deux paquets sans écraser les originaux. Repère le monorepo, la prévisualisation, le Word, l'atlas, les 19 principes et les images. Relis les retours dans l'ordre et compare au code actuel ; un retour plus récent peut corriger un arbitrage ancien.
2. Lis les instructions du dépôt (`AGENTS.md`, `CLAUDE.md` et fichiers propres au projet, **si présents**) et les tokens, composants, routes, contrats, permissions et tests existants. Ne suppose pas qu'un chemin mentionné dans un document existe dans un autre ZIP.
3. Fais l'inventaire des **skills, outils, commandes, MCP, agents et environnements réellement exposés à Claude Code**. Lis la documentation de chaque capacité pertinente avant de l'utiliser. Si un outil de navigateur, une discussion antérieure ou un connecteur n'est pas accessible, note cette limite et poursuis le travail possible. Ne crée pas de noms de skills fictifs et n'annonce pas un test que tu n'as pas exécuté.
4. Ouvre chaque image disponible à taille normale. Observe-la puis consigne : intention de lecture, composition, typographie, épaisseur et relief, limite de transparence, système de contrôles, forme des données, éléments à adapter, éléments à rejeter. Utilise `01_ATLAS_VISUEL.md` comme point de départ, puis confronte chaque observation à l'image elle-même.
5. Établis une table de correspondance « demande de Théo → route et sous-onglet → composant existant → donnée canonique → geste au clic → compétence/outillage nécessaire → test ». Distingue présent, partiel, absent et inconnu. Commence le développement seulement après cette cartographie.

### Compétences à mobiliser, si elles existent dans ton environnement

| Compétence ou famille de skill | Travail attendu | Preuve attendue |
| --- | --- | --- |
| Inspection d'images et lecture visuelle | Comparer chaque capture au produit actuel à zoom normal ; repérer volumes, recouvrements, densité et proportions. | Fiche par image, captures avant/après annotées, décisions de transfert dans le produit. |
| Recherche produit et UX | Parcours Business Manager, responsable d'agence, direction et admin ; comparer des CRM/ATS réels à partir de sources vérifiables. | Scénarios et frictions, provenance des références, critique des écrans et arbitrages. |
| Design system et frontend | Réutiliser tokens, logo, rail, primitives, champs, états et grille du monorepo ; White Glass sobre, contrasté, hiérarchie typographique. | Diff ciblé des composants, états visuels à 390, 768, 1360 et 1440 px ; aucun menu transparent sur transparent. |
| Motion et interaction | Donner un rythme utile au chargement, au scroll, aux filtres, aux graphiques et aux panneaux selon `02_MOTION_19_PRINCIPES.md`. | Démonstration ou capture vidéo des états, durée mesurée, usage clavier et `prefers-reduced-motion`. |
| Visualisation de données | Choisir une forme selon la décision : série, comparaison, ventilation, carte, échéancier ; relier le graphique au détail. | Définition du KPI, axes/unités/légende, filtres, cas zéro/absent/retardé, drilldown cliquable. |
| Accessibilité et microcopie | Contraste, focus, taille des cibles, lecteurs d'écran, mouvement réduit et français naturel sans jargon inventé. | Test clavier, zoom, contraste et revue de tous les libellés d'action et états d'erreur. |
| Navigateur et tests de parcours | Manipuler la page comme un utilisateur payant : clic, retour, scroll, filtre, saisie, changement de rôle et d'espace. | Journal de parcours, captures et échecs corrigés ; pas seulement des assertions DOM. |
| Backend, contrats et intégrations | Réutiliser les modules d'espace, objectifs, CRM/ATS, agenda, activité, finance et Laura ; contrôler droits, provenance, fraîcheur et idempotence. | Contrats typés, tests d'API et d'isolation ESN, preuve d'accusé d'envoi ou état honnête de non-raccordement. |
| Revue de code et tests | Vérifier calculs de KPI et primes, absence de régression des fiches métier, composants conditionnels et actions. | Tests ciblés, diff relu, matrice « demande → test → résultat ». |

« Mobiliser toutes les skills » veut dire utiliser toutes les capacités **pertinentes et disponibles** pour vérifier le travail, pas lancer des outils sans rapport. Si une compétence manque, documente la preuve qu'il faudra produire autrement. Pour une recommandation en ligne susceptible d'avoir changé, cherche une source actuelle et officielle ; la capture d'une interface ne démontre ni son modèle de données ni ses permissions.

## Contrat de comportement visuel

Le mouvement accompagne la compréhension et l'état réel. Un composant utile est lisible dès l'affichage ; l'animation affine la perception sans retenir l'information derrière un grand effet. La typographie, les blancs, l'alignement et la dimension d'un chiffre ont plus de poids qu'un halo. Le verre s'applique principalement à la coque, à la navigation et aux panneaux, avec liseré et reflet local ; les données restent sur une surface assez opaque. Le violet du produit est un accent fonctionnel, jamais un remplissage générique. Les menus et options gardent un fond lisible. Pas d'emojis décoratifs ni de graphiques inventés pour remplir la page.

- **Chargement d'une route.** Place immédiatement le titre, le prénom/entreprise autorisés, la portée et la date de fraîcheur connus. Le bloc qui porte la décision principale entre en premier ; les sections secondaires peuvent apparaître avec un faible décalage, sans saut de mise en page. Une attente réseau affiche un squelette à la géométrie de la vraie carte et un état de source, sans cacher une donnée déjà valable. Le graphique peut révéler sa série après ses axes et sa légende. Si le mouvement est réduit, tous les contenus sont visibles sans transition. Une erreur n'est pas remplacée par un zéro spectaculaire.
- **Défilement vers le bas et remontée.** Le contenu suit le geste sans scroll forcé, parallax parasite ni grands blocs qui se déclenchent en boucle. Une section peut entrer une seule fois avec un déplacement discret, puis reste stable quand l'utilisateur remonte. Le contexte et les filtres utiles restent trouvables, mais la navigation ne grossit pas sur le contenu. Changer de page revient en haut ; revenir d'un dossier peut restaurer le contexte de liste si le parcours l'exige. Maintiens le focus visible et préserve les repères des lecteurs d'écran.
- **Ouverture et application d'un filtre.** Le contrôle réagit immédiatement au press/focus, ouvre un panneau suffisamment opaque, expose options, portée et sélection. La mise à jour affiche soit le résultat cohérent, soit une attente et la date de la dernière valeur ; ne fais pas glisser un ancien chiffre sous un nouveau libellé. Titre, KPI, courbe, légende, liste, carte et Laura suivent la même ville/BU/période. Les requêtes dépassées sont ignorées, l'ordre de tri reste compréhensible et vider le filtre est possible. Une transition courte peut montrer le passage d'un jeu de données à l'autre ; les nombres ne « comptent » pas artificiellement vers une valeur non confirmée.
- **Graphique et drilldown.** Le survol ou le focus souligne une série et révèle date, unité, source et répartition sans couvrir la courbe. Clic sur segment, barre, point ou nom ouvre les dossiers de cette portée, pas un autre écran sans contexte. Les couleurs de séries restent distinctes et la légende est manipulable. Une sélection persiste assez pour comprendre la relation entre graphique et liste.
- **Carte de France.** Le clic sur une ville révèle les agences enregistrées et les BU de cette ville, puis filtre les affaires, besoins, responsables et finances autorisés. Le périmètre courant est visible et réversible. Une agence n'apparaît pas avant d'être créée ou importée ; le déplacement de la carte n'invente pas une performance locale.
- **Laura et actions.** Le contexte de page est transmis avec l'espace et les permissions. Une réponse longue peut apparaître progressivement, mais ses preuves et liens restent accessibles ; la conversation ne déplace pas l'interface de façon imprévisible. Avant de transmettre, écrire dans un CRM ou envoyer un message, montre destinataire, contenu et conséquence, demande une confirmation adaptée, puis n'affiche « envoyé » qu'après accusé réel. L'échec laisse une action de reprise claire.
- **Formulaires admin et objectifs.** Le focus et la validation sont nets ; sauvegarde et recalcul sont deux états différents. Une modification d'objectif d'équipe/individu et de période montre où elle s'applique et quelles vues se recalculent. Désactive ou explique la validation impossible. Les données sensibles de salaire et primes suivent les droits serveur et une trace, sans animation ludique qui masque le résultat.

Les durées indicatives du document `02_MOTION_19_PRINCIPES.md` sont des hypothèses de conception à ajuster sur appareils réels. Ne transforme jamais une ligne de données, un total ou la position de scroll en cible mobile pendant que l'utilisateur cherche à cliquer. Évite l'animation répétée des graphiques à chaque remontée, les transitions trop longues, le rubber band sur opérations sensibles, et toute motion qui retarde un retour d'état.

## Orchestration des travaux

Si Claude Code permet plusieurs agents, attribue des périmètres sans conflit de fichiers et exige une preuve concrète de chacun :

1. **Inventaire et métier** : routes, composants et modèles existants ; parcours des quatre rôles, objets canoniques, exigences manquantes.
2. **Direction visuelle** : examen individuel des images, tokens, proportions, densité, typographie, surfaces et règles de transfert.
3. **Mouvement et accessibilité** : storyboard de route/scroll/filtre, états clavier et mouvement réduit, vidéos/captures de contrôle.
4. **Données et backend** : source des mesures, permissions, santé des connecteurs, objectifs, finance, partage intra-ESN et Laura.
5. **Microcopie** : phrases de guidage propres à chaque vue, libellés d'action, états vides et erreurs utiles.
6. **Implémentation et recette** : modifications ciblées et tests du comportement réel avec les autres agents en revue croisée.

Un responsable principal arbitre les contradictions entre prévisualisation et monorepo, intègre les changements et conserve un journal court de décision. Les agents ne doivent pas paralléliser l'écriture dans le même fichier. La dernière demande explicite de Théo prime : White Glass aujourd'hui ; pas de refonte du Dark ni des fiches Comptes/Affaires/Talent/Mission.

## Critiques et portes de sortie

Pour chaque écran et sous-onglet, joue un utilisateur qui a payé la licence et dispose d'un onboarding riche, parfois avec des connecteurs absents. Vérifie en un regard : « qui suis-je, de quelle ESN, quelle période, quel périmètre, qu'est-ce qui mérite mon temps, que va-t-il se passer si j'appuie ? ». Un résultat sans source est douteux ; un bouton sans effet réel est un défaut. Clique tous les contrôles, change la taille des textes, ouvre les menus au-dessus des courbes, teste un nom long et une page sans données. Vérifie la carte France, les objectifs, rapports, prime, transmissions, factures et dossiers. À chaque changement, assure-toi que les autres vues corrélées et Laura reçoivent le même contexte.

La validation finale comporte :

- des captures avant/après aux largeurs pertinentes et un contrôle du chargement, de la remontée, du filtre, du graphique et des panneaux ;
- les tests clavier, contraste, focus, zoom et mouvement réduit ;
- les calculs vérifiés et leurs entrées, la provenance, la fraîcheur et les permissions ;
- un parcours utilisateur complet par rôle, y compris données partielles et panne de connecteur ;
- une autocritique page par page : défaut trouvé, correction, risque restant et preuve ;
- la distinction explicite entre prévisualisation navigable, code intégré au monorepo et fonctions réellement déployées.

Ne déclare pas « parfait » parce que les captures sont belles. Une revue est achevée quand les éléments sont au bon endroit, que le prochain geste est clair, que chaque promesse tient au clic et que les données qui circulent entre les pages restent correctes et autorisées.
