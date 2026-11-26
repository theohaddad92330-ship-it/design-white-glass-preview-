# BellumAI White Glass — mouvement, parcours et 19 principes

**À lire avec le système prompt Claude Code et les captures du dossier `images/`.** Cette liste retranscrit les 19 intitulés visibles dans la capture envoyée par Théo. Ce sont des principes d'UX et d'animation, pas 19 effets à placer partout. Un mouvement est retenu s'il aide à reconnaître l'origine d'une action, la portée d'un filtre, une évolution de données ou la réussite d'un geste. La promesse métier reste « prochain euro + prochaine action » et « vérité avant effet waouh ».

## Les 19 intitulés, sans omission

| Nº | Intitulé visible sur la capture | Usage proposé pour BellumAI | Limite à respecter |
|---:|---|---|---|
| 1 | **Exaggeration** | Une seule priorité du jour peut recevoir une mise en évidence plus nette lorsque Laura explique un blocage urgent, puis revenir à son état normal. | Amplifier l'information, jamais la valeur commerciale ni une alerte non vérifiée. Pas de sursaut répétitif. |
| 2 | **Origin awareness** | Un filtre BU s'ouvre depuis son bouton ; le panneau de détail d'une affaire part de la ligne ou du point cliqué et revient vers cette origine à la fermeture. | Garder le focus clavier et un trajet court ; ne jamais masquer la destination ni décaler le contenu avant la fin de la lecture. |
| 3 | **Staggering** | Lors du premier affichage, introduire les groupes utiles dans l'ordre de lecture : titre et contexte, décision prioritaire, mesures, dossiers. | Le contenu existe dès le premier rendu ; ne pas retarder une liste de 20 lignes carte par carte. Décalage discret seulement. |
| 4 | **Squash and stretch** | Une pression sur une pastille de filtre peut donner un léger retour tactile avant le changement d'état. | Pas de déformation des chiffres, logos, cartes, données financières ou commandes sérieuses. |
| 5 | **Rubber banding** | Si un panneau latéral atteint sa limite de défilement, un très faible retour d'élasticité peut signaler la butée sur appareil tactile. | Aucun rebond sur « Envoyer », « Supprimer », montant, statut de paiement ou synchronisation ; suivre les conventions natives si elles existent. |
| 6 | **Doherty threshold** | Le clic sur un filtre, l'enregistrement d'un objectif ou l'ouverture de Laura donne un retour visible immédiatement : état actif, attente identifiable, puis résultat horodaté. | Ne jamais afficher « Terminé » avant accusé du serveur ; ne pas introduire une attente artificielle pour montrer une animation. |
| 7 | **Anticipation** | Au survol/focus d'un segment du graphique, le point et sa série se distinguent légèrement ; l'utilisateur sait qu'un clic révélera les dossiers de cette période. | Sur écran tactile, la même information doit rester accessible par clic et légende ; le survol n'est jamais la seule explication. |
| 8 | **Fitts's law** | Les actions fréquentes (ouvrir une affaire, préparer le RDV, choisir la période) ont des cibles confortables et proches de leur contexte. | Ne pas réduire les boutons pour copier une référence visuelle ; éviter les petites icônes seules dans une carte dense. |
| 9 | **Slow in, slow out** | Les panneaux, filtres et changements de sélection accélèrent puis ralentissent doucement sur une courte durée. | La courbe d'animation ne doit pas faire paraître l'interface lente ; l'état final doit être déterministe. |
| 10 | **Hick's law** | Regrouper les choix par contexte : période, équipe, agence/BU, série ; les options rares se trouvent dans un panneau clair plutôt que douze menus flottants. | Ne pas cacher les filtres essentiels à la décision ni multiplier les étapes pour une action courante. |
| 11 | **Follow-through** | Après sélection d'une ville, le contour de la carte, le libellé du filtre et les totaux se stabilisent dans le même état ; une fermeture de panneau conserve le contexte. | Pas de traînée décorative ni de valeur qui continue à bouger une fois le calcul fini. |
| 12 | **Arcs** | Si un élément change physiquement de place (par exemple un volet Laura qui s'ouvre depuis sa bulle), son trajet court peut suivre une trajectoire cohérente avec l'origine. | Ne pas faire voler des KPI ou des cartes à travers l'écran ; la continuité spatiale prime sur la démonstration technique. |
| 13 | **Von Restorff effect** | Une action vraiment prioritaire (« Relancer le compte avant 16 h ») se distingue des liens secondaires par contraste et place, pas par une série de halos concurrents. | Une seule priorité visuelle par zone ; les états danger, succès et retard restent sémantiques et lisibles sans couleur. |
| 14 | **Timing** | Entrées et sorties brèves ; un menu est plus rapide qu'un panneau, un retour de pression plus rapide qu'un changement de graphique. | Les durées ci-dessous sont des points de départ à vérifier dans le produit ; ne pas lier le réseau à une durée d'animation. |
| 15 | **Interruptible motion** | Un nouveau filtre, un clic retour ou une fermeture interrompt immédiatement l'animation précédente et mène à l'état demandé. | Pas de file d'animations ni d'ancien résultat qui réapparaît après une requête plus récente. |
| 16 | **Secondary action** | Un changement de période met à jour le sous-titre, les axes, la légende et le tableau lié en même temps que le graphique principal. | Les mouvements secondaires expliquent une conséquence réelle ; ne pas ajouter de particules ou reflets animés permanents. |
| 17 | **Solid drawing** | Les couches de verre ont une géométrie crédible : contour, épaisseur de bord, reflet local et ombre de contact cohérents entre bouton, menu et panneau. | « Verre » ne signifie pas texte sur fond transparent ; les surfaces de lecture restent suffisamment opaques et contrastées. |
| 18 | **Frequency of use** | Les interactions répétées chaque jour (changer de BU, ouvrir un dossier, cocher une action) sont presque instantanées et discrètes. Une première découverte peut être un peu plus guidée. | Ne jamais imposer l'animation d'accueil à chaque navigation ou à chaque changement de période. |
| 19 | **Peak-end rule** | La fin d'un vrai workflow donne une confirmation précise : « Objectif enregistré pour l'équipe Data, trimestre 1 », lien de retour et effet visible sur le cockpit. | Pas de confettis, fausse célébration ni succès avant écriture confirmée ; les erreurs proposent une réparation concrète. |

**Traduction de « règles métier » :** ces 19 titres proviennent de la capture « UX & Animation ». Les règles métier ESN qui déterminent leur emploi sont les permissions, la source et la fraîcheur des données, la distinction pipe/signé/démarré/facturé/encaissé, les objectifs individuels et collectifs, les actions datées, et la continuité compte → affaire → mission → finance → Laura. Aucun mouvement ne compense une donnée absente ou une navigation cassée.

## Langage de mouvement commun

Utiliser d'abord les tokens du produit et les contraintes d'accessibilité. Les chiffres suivants sont des **valeurs de départ pour prototypage**, à mesurer avec de vrais parcours, et non des exigences universelles.

| Élément | Durée de départ | Mouvement | Effet vérifiable |
|---|---:|---|---|
| Pression/focus d'un contrôle | 60–100 ms | Bord/ombre/opacité, déplacement inférieur à 2 px | Le clic est pris en compte. |
| Menu ou infobulle ancré | 100–160 ms | Opacité + très léger changement d'échelle depuis le déclencheur | L'origine et les options sont évidentes. |
| Panneau de dossier ou Laura | 160–240 ms | Translation courte + opacité ; pas de glissement de toute la page | On comprend quel objet est ouvert. |
| Changement de série sur un graphique | 180–280 ms | Interpolation courte si les axes restent comparables ; sinon fondu avec axes mis à jour | Le nouvel ensemble et l'unité sont lisibles. |
| Confirmation locale après accusé | 120–180 ms | État de contrôle + texte de succès précis | Le résultat persiste et apparaît sur les autres vues. |

Une seule grammaire d'accélération/décélération cohérente ; privilégier `transform` et `opacity`. Pas de flou animé sur de grandes surfaces au défilement. Respecter `prefers-reduced-motion: reduce` : afficher l'état final sans translation, interpolation ni stagger ; conserver les retours textuels et de focus. Les transitions ne bloquent ni clic, ni lecture au clavier, ni capture d'écran ; le contenu utile n'attend jamais la fin d'une chorégraphie.

## Scénarios à implémenter et à filmer

### 1. Arrivée sur « Ma journée »

1. **Dès le premier rendu** : rail compact aux proportions du produit, en-tête « Bonjour [prénom] » et [entreprise] issus de l'espace actif, période, état de connexion et contenu principal déjà dans le DOM. Si les données arrivent du réseau, garder les dimensions des zones de chargement pour éviter les sauts ; ne pas afficher de KPI fictif comme un résultat réel.
2. **Premiers 100–180 ms** : un léger changement d'opacité révèle le bloc prioritaire déjà chargé. Le titre, le pourquoi, le compte, l'échéance et le bouton restent immédiatement lisibles ; aucune animation de caractère ou compteur qui défile depuis zéro.
3. **Puis jusqu'à 250–300 ms** : mesures et graphique apparaissent par groupes de lecture, avec décalages de 25–45 ms au maximum entre deux groupes. Si la donnée a été rendue côté serveur, ne pas la masquer avant hydratation. Si une source est lente, son état de chargement reste local et indique la source ; le reste de la page fonctionne.
4. **Après chargement réel** : annoncer « Mis à jour à … » et la couverture des sources. Un rafraîchissement en arrière-plan conserve les valeurs précédentes avec un indicateur discret ; une erreur conserve l'ancienne valeur mais la marque comme telle, sans laisser croire qu'elle est actuelle.

Le premier écran répond aux questions du commercial : « Quel dossier, pourquoi maintenant, et que peut faire BellumAI ? ». Le mouvement renforce cette lecture, il ne retarde pas la réponse.

### 2. Défilement vers le bas et vers le haut

- Le rail et une barre de contexte légère peuvent rester stables. Les titres de section et contrôles prioritaires ont une position prévisible ; ne pas ajouter un second menu latéral. Éviter les grandes cartes qui forcent un long trajet vertical.
- À la première entrée dans le viewport, une section secondaire peut passer d'une opacité légèrement réduite à son état final en 120–180 ms ; les tableaux et graphiques restent accessibles dès leur arrivée. Aucun reveal qui se répète chaque fois que l'on remonte.
- À la remontée, l'utilisateur retrouve le même état des filtres, lignes ouvertes et sélection de la carte. L'en-tête peut se compacter doucement, sans couvrir le titre ni déplacer les contrôles de manière imprévisible. Pas de parallaxe décorative sur les données.
- Un changement de page ou de sous-onglet commence au haut de la nouvelle vue. Un retour explicite à un dossier peut restaurer la position précédente si ce comportement est indiqué. Le focus clavier suit le titre ou le panneau ouvert ; le scroll automatique ne surprend pas l'utilisateur.

### 3. Filtre période, agence, BU, personne ou série

1. Focus/clic : le bouton reçoit un état net en moins de 100 ms. Le menu ancré s'ouvre en 100–160 ms sur un fond suffisamment opaque pour lire toutes les options. L'option actuelle est indiquée par texte et symbole, pas seulement par couleur.
2. Choix : fermer le menu, afficher immédiatement la nouvelle portée dans le bouton, le titre et un état « Actualisation… » local si une requête est nécessaire. Garder l'ancienne valeur identifiable pendant l'attente ; ne pas la relabeller comme la nouvelle période.
3. Réponse : remplacer **ensemble** valeur, unité, période, axes, légende, tableau et liens vers dossiers. Interpoler les tracés seulement si les deux séries représentent la même mesure et des axes comparables. Si le calcul échoue, revenir à la dernière portée valide ou afficher l'erreur et « Réessayer ».
4. Nouveau choix avant la réponse : annuler/ignorer la requête précédente, interrompre l'animation précédente. Le dernier choix seul gouverne l'état. Propager ce filtre à Laura, à la carte et aux vues liées selon le contrat de la page.

### 4. Lecture d'un graphique et ouverture d'un dossier

- Au focus/survol, mettre en évidence **un point ou un segment**, afficher date, unité, valeur, série et périmètre dans une infobulle lisible placée hors de la courbe. Un clic ou la touche Entrée ouvre le détail : e-mails et LinkedIn séparés par jour, ou affaires rattachées au montant. La légende peut masquer/afficher une série et met à jour le total sans ambiguïté.
- Un panneau ou une page de détail conserve la période et la BU. Fermer revient au point et au focus d'origine. Ne pas faire apparaître des étiquettes par-dessus les traits, ni animer une valeur depuis zéro comme si elle était calculée en direct.
- Les jours sans donnée, futurs ou hors périmètre ont un état différent de « zéro ». Une comparaison annuelle ou une conversion n'est montrée que si les cohortes et dates le permettent.

### 5. Carte de France → ville → agence/BU

La carte montre uniquement les implantations réellement enregistrées et autorisées. Le point ciblé se précise au focus ; au clic, la ville et ses agences/BU s'ouvrent dans un panneau ancré. Le changement de filtre se répercute en même temps sur pipe, besoins, responsables, factures et dossiers ; conserver le chemin « France / Paris / Data ». Une ville sans agence créée propose « Créer une agence » à l'admin autorisé ; elle ne reçoit pas un chiffre inventé. Revenir à la France ou choisir une autre ville interrompt la transition en cours. Un tableau/listing équivalent permet navigation clavier et lecture sans carte.

### 6. Laura et actions entre collègues

La bulle discrète est disponible sans masquer une action de page. Elle ouvre un panneau d'où l'on comprend le contexte courant (ESN, période, BU, dossier). La réponse peut se composer progressivement **par unités sémantiques** (constat, sources, limites, options), mais pas par effet machine à écrire qui cache l'information. Un résultat transmis par Laura indique dossiers et dates cités. Pour « envoie ce besoin à Karim », montrer destinataire, contenu et conséquences avant confirmation ; après accusé réel, afficher la trace et mettre à jour la vue des deux collègues autorisés. Si les droits ou la source manquent, le dire avant d'animer un succès.

### 7. Objectif, rapport et calcul financier

Une édition ouvre un panneau/fenêtre de taille stable depuis son contrôle. Les champs et erreurs sont immédiatement lisibles ; un chiffre saisi met à jour un aperçu local clairement nommé, pas le résultat enregistré. « Enregistrer » montre l'attente, puis la cible et les graphiques se recalculent après succès vérifié. Un rapport d'activité affiche ses sources, sa période et ses exclusions, puis une génération réelle ; l'envoi mail exige destinataire, confirmation et accusé du service. Les salaires, coûts chargés, primes et factures demandent une permission serveur, une unité explicite, un historique et une confirmation pour toute suppression. Pas de rebond ou de célébration sur ces actions sensibles.

## Recette d'acceptation

Filmer et inspecter à 390, 768, 1360 et 1440 px : premier rendu, arrivée des données, erreur, scroll bas/haut, ouverture/fermeture du menu, changement rapide deux fois de filtre, clavier seul, `prefers-reduced-motion`, sélection du graphique, drill France → ville → BU, question à Laura, confirmation d'une action et retour. Vérifier que le dernier état correspond aux mêmes identifiants et à la même période sur le chiffre, la légende, le tableau, le panneau et Laura. Contrôler l'absence de texte sur les courbes, de menu transparent sur transparent, de saut de mise en page et d'effet qui vole le focus. Noter toute interaction qui ne produit aucune suite réelle et la retirer ou la raccorder avant livraison.
