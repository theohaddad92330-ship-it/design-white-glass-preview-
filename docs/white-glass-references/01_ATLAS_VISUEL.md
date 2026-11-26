# Atlas des références visuelles BellumAI — White Glass

**But.** Ce document lit les captures comme des décisions de composition, de hiérarchie, de matière et d'interaction. Une image fixe ne prouve aucune animation : les mouvements proposés ci-dessous sont des hypothèses de conception à prototyper et à tester. Le produit actuel et ses tokens priment sur les couleurs et marques d'une référence externe. Les dix-sept captures retrouvées sont sous `images/` dans ce paquet : neuf fichiers fournis le 26 novembre et huit images antérieures retrouvées dans le projet. Toutes sont analysées ci-dessous, dans deux groupes chronologiques. Leurs noms originaux sont conservés.

**Question commune à toute carte.** Quelle décision apporte-t-elle ? Quelle donnée, période, unité, source et permission la nourrissent ? Que fait le clic ? Quel autre écran se met à jour ? Si on ne peut pas répondre, simplifier ou supprimer l'élément. Préserver la largeur du rail existant, le logo d'origine, un unique parent « Ma journée » et ses sous-onglets, ainsi que les fiches métier Comptes, Affaires, Talent et Mission. Le verre sert la lecture ; un menu ouvert doit rester opaque et lisible sur son contenu.

## Neuf images du 26 novembre

### 01 — `images/image(20261126-082310).png` — pastilles d'état

- **Ce que montre l'image :** dix capsules isolées sur noir, réparties en trois rangées avec de l'air. Chaque capsule a une icône, un libellé, un fond fumé, une bordure interne lumineuse et une lumière colorée concentrée sur un bord ; les statuts occupent plus de place que de simples tags.
- **Pourquoi Théo l'a donnée :** matérialité et statut perceptible en un regard, sans qu'une carte complète soit saturée. La répétition d'une géométrie garde la grammaire commune malgré des couleurs variées.
- **Transfert White Glass :** petit groupe de statuts **métier** dans actions et affaires : « À préparer », « En attente client », « À relancer », « Bloqué », « Signé ». Réserver la couleur à la sémantique ; icône et texte restent toujours présents. Variante de taille compacte dans une ligne, variante plus tactile dans un panneau. L'état actif peut avoir un liseré et un reflet local ; l'état inactif reste neutre.
- **Interaction/mouvement proposé :** au changement d'état confirmé, la pastille se remplit rapidement de sa teinte (environ 160–220 ms), le libellé reste stable, puis la ligne se replace si le tri change. Le statut ne s'affiche comme « envoyé » ou « signé » qu'après le retour du système de référence.
- **À refuser :** dix couleurs arc-en-ciel dans une même vue ; halo brillant autour de chaque ligne ; faux signal d'avancement fondé sur une activité seulement déclarée.

### 02 — `images/image(20261126-082323).png` — trois cartes à lumière localisée

- **Composition :** titre très lisible et court au-dessus de trois cartes identiques en largeur. Dans chaque carte, icône en haut, titre, deux lignes de texte et action ; le bas et les coins portent presque toute la lumière tandis que le centre reste sombre et calme. Grille fine en arrière-plan, très secondaire.
- **Transfert White Glass :** employer une seule carte dominante avec un reflet intérieur ou une lumière de bord pour une priorité réelle : une affaire à débloquer, une facture échue ou un point de décision. Les cartes voisines restent en papier clair avec profondeur discrète. L'intérieur doit rester assez opaque pour que chiffres et microcopie soient lus sans effort.
- **Mouvement proposé :** révélation de la lumière avec la surface au chargement, sans retarder le texte ni faire battre un halo ; léger changement de reflet au focus/hover, aucune parallax nécessaire.
- **À refuser :** copier orange/bleu/vert néon, les trois grandes cartes décoratives ou la même brillance partout. Une action comme « Préparer la relance » doit réellement ouvrir une préparation liée à son dossier.

### 03 — `images/image(20261126-082329).png` — bibliothèque de composants

- **Composition :** une planche de variations contrôlées : cartes, boutons, chips, icônes et champs, chacun sur sa propre surface. Très gros titre, labels secondaires, comparaison immédiate des états. Les champs ont une enveloppe clairement visible ; les boutons distinguent leur densité et leur état sans changer de forme à chaque page.
- **Transfert White Glass :** construire des primitives partagées pour le rail, onglets, filtre, sélection, état, champ, bouton primaire/secondaire, panneau et infobulle. Documenter repos, hover, focus clavier, sélection, chargement, erreur, désactivé et menu ouvert. Cohérence de rayon, bord, opacité, taille de cible et typographie ; variations limitées par fonction, pas par page.
- **Mouvement proposé :** l'indicateur actif d'un sous-onglet glisse ou se replace sur la nouvelle option ; le menu se déploie depuis son déclencheur et se ferme sans attendre ; focus toujours visible.
- **À refuser :** une page de style détachée du produit, un menu transparent sur une carte translucide, ou des icônes purement décoratives.

### 04 — `images/image(20261126-082347).png` — courbes superposées, détail et tableau

- **Composition :** bande de KPI en haut, une grande courbe centrale faite de **plusieurs strates translucides** qui se croisent, contrôles de période à droite, puis tableau dense sous le graphique. La courbe a un volume visuel et des axes, mais les petites légendes de la capture sont peu lisibles.
- **Transfert White Glass :** dans Pilotage, montrer par exemple marge signée, marge démarrée et cible dans trois séries **définies par leurs unités** ; le remplissage sert à distinguer réalisé/cible ou deux canaux, non à inventer un volume. Une zone de détail au clic révèle la période, les dossiers contribuant et la formule. Placer l'annotation dans une infobulle ou une marge, jamais au-dessus d'un trait.
- **Mouvement proposé :** à l'entrée, ligne et aires se dévoilent en 350–550 ms après affichage des axes et de la valeur ; changement de période par morphing sobre avec axes recalculés et légende stable ; survol/keyboard affiche un guide vertical synchronisé aux séries.
- **À refuser :** superposer des aires sans signification, interpolation qui masque une donnée manquante, courbe fictive décorative, écriture trop petite pour le zoom normal.

### 05 — `images/image(20261126-082358).png` — rail compact et navigation active

- **Composition :** image de présentation d'un rail étroit et d'une version élargie, tous deux très arrondis ; pictogrammes dessinés d'un trait régulier ; l'état actif est une capsule contrastée avec une lumière au bord. L'espace autour du rail lui donne une présence d'objet.
- **Transfert White Glass :** conserver les proportions **réelles** de la sidebar BellumAI, le parent « Ma journée » et les sous-entrées existantes. Emprunter seulement le trait, la profondeur, l'indicateur latéral et la stabilité de la sélection ; ne pas remplacer les libellés métiers par une rail d'icônes ambiguës. Le contenu principal doit rester dominant à 100 % de zoom.
- **Mouvement proposé :** l'indicateur actif suit le changement de route en 180–240 ms, mais la page se repositionne immédiatement en haut. Un rail réduit conserve titre accessible et info-bulle clavier/souris.
- **À refuser :** agrandir le rail, ajouter un second menu gauche, déplacer les sous-onglets dans un autre parent ou multiplier les halos violets.

### 06 — `images/image(20261126-082415).png` — détail d'un contrôle en verre

- **Composition :** macro d'un bouton rond et d'un bouton capsule gris bleuté, sur une surface de même famille. L'effet vient de l'épaisseur : deux liserés, ombre de contact, reflet clair sur la tranche, translucidité graduée, texte blanc net. C'est un exemple de **construction de matière**, pas un modèle de taille d'interface.
- **Transfert White Glass :** reprendre un bord interne et externe discret sur le bouton principal, les menus flottants et les sélecteurs de période. Le fond du menu doit gagner en opacité à l'ouverture ; ombre et bord le détachent de la carte dessous. Les actions importantes ont une taille cible confortable et un libellé français.
- **Mouvement proposé :** pression à très faible amplitude (échelle 0,98 ou 1–2 px) et retour immédiat ; le reflet change avec l'état de focus, pas avec un loop constant.
- **À refuser :** faux relief qui nuit au contraste, grand bouton « Upload » sans pertinence métier, verre gris identique pour tous les composants.

### 07 — `images/image(20261126-092839).png` — dashboard à grille dense et carte

- **Composition :** petit rail, cartes de tailles variées, une carte géographique plus grande que les mini-charts, anneau, séries temporelles et KPI de premier plan. C'est une **carte du monde**, pas la carte de France demandée. La densité apporte une vue d'ensemble, mais les légendes sont trop petites dans cette capture.
- **Transfert White Glass :** rétablir dans Équipe/Admin une carte de **France** retrouvable immédiatement. Clic région ou ville → agences disponibles → BU → même filtre dans objectif, pipe, staffing, personnes et dossier. Une carte et une liste synchronisées permettent navigation clavier et évitent de s'en remettre au survol. Pour un espace neuf, création d'agence avec ville réelle et BU saisie, jamais une implantation fictive. Varier les tailles de modules : carte large et quelques détails, non une mosaïque de compteurs équivalents.
- **Mouvement proposé :** zoom modéré sur zone sélectionnée avec transition 250–350 ms ; panneau de détail qui apparaît à côté, chiffres recalculés seulement après chargement ; retour explicite au périmètre France.
- **À refuser :** carte choroplèthe sans dénominateur, chiffres sans périmètre, origine du chiffre inconnue, synthèse de zones qui confond BU et géographie.

### 08 — `images/image(20261126-092849).png` — dashboard d'équipe CRM

- **Composition :** très haute densité informative. Des colonnes par anomalie montrent avatars et nombres, une liste des réunions sans suite, un chiffre de valeur en retard et des barres horizontales empilées par commercial. La rangée du haut donne des entrées de gestion ; les portraits empêchent la page d'être une simple série de lignes anonymes.
- **Transfert White Glass :** dans Équipe, montrer propriétaires, dossiers sans prochaine date, affaire sans valeur, besoin sans profil, RDV sans compte rendu et actions échues, **avec dates et liens directs**. Une barre horizontale segmentée peut comparer « en retard / à faire » par personne avec légende, période et même définition des tâches. Cliquer un nom filtre la liste de dossiers ; l'avatar aide à reconnaître, ne sert pas à juger une personne. Les rapports d'activité admin s'appuient sur événements réellement tracés, avec provenance et version.
- **Mouvement proposé :** filtre de personne stabilise le tableau et met en avant la colonne utile sans faire surgir toute la grille en cascade ; lors d'une action déléguée, l'élément se déplace après confirmation.
- **À refuser :** classement humiliant des personnes, portrait sans consentement ni fallback, graphique de retards qui mélange portée équipe et activité privée, surcharge illisible sur écran réduit.

### 09 — `images/image(20261126-092857).png` — grille asymétrique de génération de leads

- **Composition :** un grand histogramme vertical, quatre petits indicateurs au centre et un cercle de répartition à droite. La grille n'est pas uniforme. Bande de navigation supérieure sombre et accent turquoise/orange ; plusieurs barres gris bleuté sont des artefacts ou placeholders sur la capture.
- **Transfert White Glass :** conserver l'asymétrie **au service d'une question** : volume de prospection e-mail vs LinkedIn en grand, RDV et besoins à côté, sources de besoins ou statuts des affaires dans un panneau. Afficher les deux canaux en séries séparées avec couleur, légende, unité, période, détail du jour et provenance. Un anneau n'a d'intérêt que si le total, les catégories et la part inconnue sont explicites.
- **Mouvement proposé :** barres croissent depuis une ligne de base une seule fois quand les données arrivent, l'axe reste visible ; clic d'un jour ouvre les événements correspondants, pas un simple nombre isolé ; sélection d'un canal rééchelonne ou conserve l'échelle selon la question, avec indication claire.
- **À refuser :** reprendre les couleurs HubSpot, l'énorme diagramme circulaire pour une répartition triviale, les faux placeholders, les blocs uniformes sans hiérarchie.

## Huit images antérieures retrouvées dans le projet

### 10 — `images/PHOTO-2026-11-25-13-38-01.jpg` — liste des 19 principes UX & Animation (message 4)

- **Observation :** capture verticale de vidéo, non d'interface. Un visage occupe le bord gauche ; une liste numérotée de 19 principes en blanc à droite, le dernier (« Peak-end rule ») en orange. La liste est coupée aux bords, mais les intitulés sont identifiables. Elle ne donne ni durée, ni easings, ni démonstration d'un mouvement.
- **Intention de Théo :** explorer des principes de perception, de guidage et de rythme au-delà d'un simple fade générique. `02_MOTION_19_PRINCIPES.md` restitue les 19 intitulés dans l'ordre de la capture et leur traduction BellumAI.
- **Transfert :** transitions qui rendent l'origine et le résultat d'un filtre compréhensibles, hiérarchie des étapes, réponse rapide aux actions, animation interrompable, bon retour après une tâche accomplie. À vérifier avec des gestes utilisateur réels.
- **À refuser :** appliquer 19 effets à chaque clic, prendre l'orange comme couleur de marque ou traiter une liste de règles comme la preuve que tel mouvement existe dans la capture.

### 11 — `images/image(9).png` — dashboard Overview sombre, graphe et personne (message 7)

- **Observation :** rail de pictogrammes étroit, recherche centrale, salutation et nombreux onglets en tête. La grille donne une grande place à la courbe verte qui monte avec aire sous la ligne ; à droite une fiche « Persona Spotlight » associe avatar, contexte, score, personnes et message, puis tableau de profils. Bordures minces, grandes zones sombres et cartes imbriquées.
- **Intention :** associer une **tendance** à l'objet humain ou commercial qui l'explique, puis rendre la recherche et le passage à l'action immédiatement disponibles.
- **Transfert White Glass :** dans Ma journée/Pilotage, courbe de performance datée et étendue sur plusieurs périodes ; près d'elle, affaire, compte, consultant ou commercial contributif avec preuve et prochaine action. Salutation personnalisée par prénom/ESN. Dans Laura, réponse avec objets référencés plutôt qu'un score sans source.
- **Mouvement proposé :** axe et valeurs stables ; un point de courbe sélectionné met en avant le dossier correspondant et déplace seulement un indicateur local, pas toute la page. L'onglet change sans retour au milieu du scroll.
- **À refuser :** score « 99,9 » artificiel, grand nombre de sous-onglets clonés, fond vert lumineux sur chaque carte, petits textes de la capture.

### 12 — `images/image(10).png` — flux de conversion et modules satellites (message 7)

- **Observation :** en haut à gauche, un entonnoir **horizontal** à quatre colonnes et nappes gris translucides porte 72K, 38.2K, 16.8K, 5.6K et 100/53/23/8 %. À droite un disque hachuré ; en bas, origines de trafic par traits, équipe avec avatars/état vide, et heatmap « Sales by hour ». Le grand graphique explique une perte d'étape, la grille du dessous répond à d'autres questions.
- **Transfert White Glass :** un passage RDV → besoin → profil → entretien → démarrage n'a une forme d'entonnoir et un pourcentage **que si les événements appartiennent à la même cohorte reliée par affaire**. Sinon présenter cinq volumes côte à côte avec date, unité et cas sous-jacents. Pour un manager, les étapes lentes ouvrent la liste des dossiers bloqués ; la heatmap ne sert que si l'heure locale et les actions confirmées sont disponibles.
- **Mouvement proposé :** une sélection de période réorganise largeur et valeurs de façon stable, garde les libellés ancrés ; un segment choisi affiche la liste et l'écart. Pas de fluide en boucle.
- **À refuser :** inférer des conversions de métriques indépendantes, reproduire le disque hachuré sans catégorie lisible ou un faux état « pas d'équipe » alors que l'onboarding connaît déjà des membres.

### 13 — `images/image(20261125-133158).png` — planche éditoriale de dataviz (message 7)

- **Observation :** composition sur papier blanc cassé en sections espacées. Un éventail de points, un classement de colonnes de points sur bloc noir, une série de 90 jours en traits verticaux fins, une plage d'activité en tiges épaisses, une fleur segmentée, quatre barres de revenu, une grille de points de sources et un anneau de « dataset ». Le titre est petit mais précis, les formes changent avec la question, la palette est presque monochrome.
- **Transfert White Glass :** sélectionner la grammaire par décision : tiges datées pour volume d'approches e-mail/LinkedIn, points pour comparer une distribution, barres pour résultat par BU, courbe pour trajectoire, carte pour implantation. Espace autour des graphes, titre utile, note de méthode sans jargon. Un anneau n'est justifié que par des catégories distinguables et un total visible.
- **Mouvement proposé :** transition entre granularités jour/semaine par agrégation visible ; survol ou focus révèle le détail exact d'un point et les dossiers. Le graphique ne doit pas dépendre d'une animation pour être compris.
- **À refuser :** copier huit expérimentations dans une page, axes ou labels microscopiques, visualisation poétique sans décision métier, noir dominant dans White Glass.

### 14 — `images/PHOTO-2026-11-25-14-54-44.jpg` — CRM Companies multicolore (message 8)

- **Observation :** rail très fin à gauche et barre d'onglets horizontale, titre « Companies » fort, recherche et bouton d'ajout, trois cartes de KPI puis chips de filtre. Les cartes des comptes forment une grille colorée ; chaque carte choisit un instrument distinct (demi-jauge, anneau, colonnes, mini-courbe) avec nom, secteur et action circulaire. Texture du fond brun fumé, contraste marqué à l'intérieur des cartes.
- **Transfert White Glass :** une fiche ou carte de compte doit être reconnaissable par son logo ou monogramme réel, son état commercial, son montant, son responsable et son prochain geste. Dans la vue de suivi autorisée, varier l'instrument uniquement si les données changent de nature : santé d'un compte, tendance de réponse ou affaires, échéances. Le sous-onglet et le filtre doivent garder l'espace de travail visible. Les pages Comptes canoniques ne sont pas à refondre dans ce chantier.
- **Mouvement proposé :** filtre « À risque » resserre la grille, conserve les cartes restantes dans un ordre stable et annonce le résultat ; bouton d'une carte ouvre le dossier associé. Un retour maintient contexte et filtre.
- **À refuser :** sept couleurs arbitraires, courbe propre à chaque client sans données, peinture brillante sur toutes les cartes, CTA lecture multimédia (« play ») sans action commerciale claire.

### 15 — `images/Capture d’écran 2026-11-25 à 23.30.56.png` — BellumAI Équipe, vue d'ensemble (message 13)

- **Observation :** référence produit White Glass. Sidebar claire et raisonnablement étroite, logo BellumAI noir, parent « Ma journée » déplié avec Mon activité, Mon agenda, Équipe et Pilotage. À droite : quatre indicateurs, grand bloc « Le potentiel à convertir » avec barre segmentée de pipe et montants par étape, carte Laura avec avatar et action, puis « Qui porte quoi » avec portraits, comptes/affaires/actions, barres de délai et mouvements récents. Titre et chiffre dominent les légendes ; violet en nuances mesurées.
- **Transfert :** préserver proportion du rail et hiérarchie de navigation, l'avatar de Laura, le lien entre distribution du travail, pipeline et dossier. Les données affichées dans la capture sont une référence de structure, pas des chiffres à insérer chez un client. L'utilisateur admin doit pouvoir traverser objectif → propriétaire → affaire → action.
- **Mouvement proposé :** la sélection Équipe ouvre en haut ; pipeline segmenté se révèle sans déplacer les KPI ; un clic sur un segment fixe le filtre de l'étape et la liste des affaires correspondantes, tout en gardant la légende.
- **À corriger par rapport à la capture :** textes tels que « une lecture du scénario » ou « commence par lever le blocage » demandent un dossier et une raison explicites ; les valeurs signées ne doivent pas se confondre avec facturation/encaissement. Le rail ne doit pas être agrandi sous prétexte de glass.

### 16 — `images/Capture d’écran 2026-11-25 à 23.31.09.png` — BellumAI Équipe, plans et actions (message 13)

- **Observation :** même rail et barre haute ; sous-onglets Équipe au bord supérieur ; contrôles Portée, mois et statut, recherche par action et compte, bascule Liste/Répartition/Semaine, bouton « Créer une action ». Grande liste de lignes blanches, chacune avec tâche, compte/affaire, explication, responsable et date, état « En retard » et bouton « Préparer ». Beaucoup de verticalité et de vides dans les lignes malgré une information riche.
- **Transfert :** garder le filtrage d'état, personne, période, compte et la possibilité de passer d'une liste à une semaine. Une action doit pointer vers le même dossier dans le produit, Laura et le rapport. Réduire la hauteur des lignes sans sacrifier le contexte, séparer titre, date et problème, préparer un e-mail ou RDV avec destinataire et aperçu. Distinguer tâche enregistrée d'envoi réellement exécuté.
- **Mouvement proposé :** au clic de filtre, le nombre de résultats s'actualise dans la même zone, les lignes se réordonnent sans grand effondrement ; une action terminée change de statut puis quitte la vue « À faire » après confirmation et annonce accessible.
- **À corriger :** menu déroulant transparent sur fond transparent, répétition « Préparer » sans destination claire, chemin de scroll trop long et retour de page au milieu de liste.

### 17 — `images/Capture d’écran 2026-11-25 à 23.31.25.png` — BellumAI Pilotage, cap et finance (message 13)

- **Observation :** quatre KPI horizontaux (pipe ouvert, affaires gagnées, profils disponibles, actions à faire), carte « Le cap d'octobre » avec arc violet de 47 %, signé 71 k€ / cible 150 k€, carte distincte « De la mission à l'encaissement » avec encaissé, à suivre et brouillon, puis courbe d'évolution des affaires et étapes de décision. Grand fond clair, arrondis, faible violet ponctuel, titres de taille différente.
- **Transfert :** une cible administrable doit conditionner arc, écart et trajectoire, avec période et propriétaire. Finance montre facturé/encaissé et factures reliées, sans assimiler pipe à trésorerie. La courbe expose vraie série et filtre ; étape de décision ouvre affaires et prochaines dates. La palette des quatre segments et le grand espace rendent les niveaux distincts sans tout colorer.
- **Mouvement proposé :** arc progresse une seule fois quand la cible et le réalisé sont connus ; si cible absente, état explicatif. Changement mois ou BU met à jour arc, montants, courbe et liste dans un même périmètre, sans chiffres intermédiaires incohérents.
- **À corriger :** libellés « scénario illustratif » et chiffres fictifs sur un écran payant ; compléter staffing/finance par données et actions du vrai système ; garder les textes hors courbe.

## Croisement de références vers les pages

| Surface Bellum | Références utiles | Décision et interaction attendues |
| --- | --- | --- |
| Ma journée | 02, 03, 09, 15, 17 | Saluer par prénom et ESN, puis priorités sur affaires et mission, cadence e-mail/LinkedIn distincte, prochain geste explicite et détail relié. |
| Agenda et activité | 01, 03, 16 | Temps, compte, responsable et état des suites ; clic préparatoire, retour après RDV, trace sourcée. |
| Équipe / admin | 05, 07, 08, 15 | Rail non élargi ; carte France, agence/ville/BU, objectifs et blocages avec propriétaires, filtres cohérents, rapport sourcé. |
| Pilotage | 04, 07, 12, 17 | Trajectoire vs cible, montant et dénominateur fiables, source, drill-down affaires ; finance différenciée de pipe et encaissement. |
| Laura | 02, 03, 11 | Une recommandation contextualisée par les dossiers et droits ; expliquer preuve, manque et action, prévisualiser toute écriture. |

## Grammaire White Glass à vérifier en prototype

1. **Proportions :** mesurer la sidebar du code actuel avant tout dessin ; vérifier écran 1360–1440 px à 100 % de zoom, puis 768 et 390 px. Le contenu ne doit pas être déformé par un rail nouveau.
2. **Plans :** fond légèrement teinté, coque et surfaces en papier de densités différentes, menu flottant plus opaque que son support, liseré net, ombre de contact. Reflet local sur un composant prioritaire, pas dégradé global.
3. **Typographie :** titre de page > question métier > chiffre > label > métadonnée ; contraste et longueur maîtrisés. Une carte de deux lignes claires vaut mieux qu'une formule floue « volume de gestes du journal ».
4. **Graphe :** chaque couleur représente une variable ou un statut défini, chaque axe a une unité et une période, chaque point/tige a un détail. Ne superposer ni texte ni chiffres sur les traits.
5. **Mouvement :** introduire un changement, préserver le contexte spatial, permettre l'interruption, respecter `prefers-reduced-motion`. Une image fixe ne donne pas de durée ni de courbe d'accélération : ce sont des choix à tester auprès d'utilisateurs.
6. **Données :** onboarding préremplit identité, ESN et périmètre connus, mais ne crée pas de faits CRM. Distinguer connecté, non connecté, erreur, retard, inconnu et zéro. Les clics et les rapports respectent les droits de chaque ESN.
