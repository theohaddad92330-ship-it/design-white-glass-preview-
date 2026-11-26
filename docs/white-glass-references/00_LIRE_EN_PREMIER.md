# BellumAI — dossier visuel et motion pour Claude Code

Ce ZIP accompagne le paquet **BellumAI White Glass complet** livré séparément. Il rassemble les **17 captures originales envoyées dans ce fil** et explique pourquoi elles ont été données, ce qu'il faut en tirer pour le produit et comment vérifier les interactions. Les fichiers image gardent leurs noms et leur résolution. Huit captures anciennes ont été retrouvées dans les fichiers du projet ; les neuf dernières étaient déjà disponibles. Aucune capture n'a été recréée.

## Lire dans cet ordre

1. `Retours_Theo_BellumAI_Illustrés.docx` : les 20 messages de Théo dans l'ordre, avec les 17 images à leur emplacement. La version `.md` est recherchable et pointe vers `images/`.
2. `01_ATLAS_VISUEL.md` : lecture image par image, transfert pertinent vers BellumAI et défauts à éviter.
3. `02_MOTION_19_PRINCIPES.md` : les **19 intitulés de la capture UX & Animation**, leur application prudente, puis des scénarios de chargement, scroll, filtres, graphiques, carte, Laura et formulaires.
4. `03_BRIEF_CLAUDE_SKILLS.md` : compétences et outils à découvrir dans l'environnement de Claude Code, orchestration, preuves à produire.
5. `04_PROMPT_SYSTEME_CLAUDE_CODE.md` : prompt complet, actualisé pour les 17 originaux. Il peut être donné au démarrage de la session ; les instructions du dépôt et les contraintes de sécurité restent à respecter.
6. `05_TRANSMETTRE_A_CLAUDE_CODE.md` : deux voies concrètes pour que Claude lise le code sans pièce jointe trop lourde, en local ou par dépôt GitHub privé.

## Les images

| Ordre du fil | Fichiers dans `images/` | Ce que Théo veut faire comprendre |
| --- | --- | --- |
| 19 principes | `PHOTO-2026-11-25-13-38-01.jpg` | Rythme, perception, feedback, continuité et arrêt des animations. |
| Trois références analytics | `image(9).png`, `image(10).png`, `image(20261125-133158).png` | Grands graphiques et détails, entonnoir seulement si ses données le permettent, diversité de formes utiles. |
| CRM Companies | `PHOTO-2026-11-25-14-54-44.jpg` | Comptes reconnaissables, navigation compacte, hiérarchie, indicateurs variés avec un geste métier. |
| Trois vues BellumAI | `Capture d’écran 2026-11-25 à 23.30.56.png`, `23.31.09.png`, `23.31.25.png` | Proportions du vrai produit, sous-onglets, pipe, actions, objectifs, finance et accent violet mesuré. |
| Six références de matière | `image(20261126-082310).png` à `image(20261126-082415).png` | Pastilles, lumière localisée, composants, couches de courbes, rail et épaisseur du verre. |
| Trois CRM traditionnels | `image(20261126-092839).png` à `image(20261126-092857).png` | Densité lisible, carte, comparaison d'équipe, grille asymétrique et répartition des sources. |

La liste raccourcit certains noms pour la lecture ; `01_ATLAS_VISUEL.md` référence chacun des **17 noms exacts**. Les trois captures « BellumAI » sont des références du produit à confronter au code le plus récent, pas des données client à recopier. Les images sombres donnent des idées de structure et de matière pour **White Glass** ; elles ne demandent pas de développer le Dark maintenant.

## Ce que Claude doit produire

Le premier écran s'adresse au commercial par son prénom, situe son ESN et ses données, puis lui montre le dossier prioritaire, la raison, la date et le prochain geste. Les managers lisent l'équipe, les agences, les BU, les objectifs, les affaires, les besoins, les retards, le staffing et la finance dans le même périmètre. La carte de France permet ville → agence → BU → dossiers. Laura partage ce contexte, explique ses sources et demande une confirmation avant toute écriture ou transmission. Le rail garde les proportions du code, avec **un seul parent « Ma journée » et ses sous-onglets**. Comptes, Affaires, Talent et Mission restent les destinations métier de référence.

Le verre donne du relief par plans, liserés, reflets locaux et ombres de contact. Les surfaces de lecture, champs et menus ouverts restent opaques et contrastés. Les tailles, graisses et espaces composent une hiérarchie. Les dégradés appartiennent aux données ou à un accent ciblé ; ils ne recouvrent pas chaque carte. Chaque graphique a une unité, une période, un filtre pertinent, une légende, un détail au clic et une source. Chaque texte doit parler le français de l'utilisateur ESN, expliquer un résultat ou demander une action réelle.

Le comportement compte autant que l'image fixe : chargement lisible dès le premier rendu ; groupes secondaires révélés légèrement et une seule fois ; scroll bas/haut sans saut ni animation rejouée ; filtre ancré lisible, puis titre, chiffres, axes, liste, carte et Laura mis à jour **ensemble** ; requête précédente interrompue si l'utilisateur change de choix ; focus, clavier et mouvement réduit pris en charge ; succès annoncé seulement après confirmation du système. Les durées du document motion sont des départs à tester, jamais des effets imposés.

## Source de vérité et limites

Fournir aussi à Claude le paquet White Glass complet, ou mieux le **dépôt extrait** du dernier monorepo fourni. Sa version `(17)` est la dernière source applicative de ce dossier ; Claude doit vérifier s'il existe un état Git plus récent. La prévisualisation White Glass `dist/` est un Site statique alimenté par des données d'exploration et `localStorage`. Elle ne prouve ni intégration CRM/ATS réelle, ni envoi de mail, ni partage entre ESN. Lire `docs/INTEGRATION_PLAN.md` du paquet source, réutiliser les services existants et tester les droits et la provenance. Une image fixe ne contient pas les animations qu'on imagine : l'atlas distingue toujours observation et proposition.

Le ZIP contient les fichiers graphiques de **ce fil**. Les autres discussions du projet ne sont pas reproduites ici ; Claude doit les consulter si son environnement y donne réellement accès. Ne pas prétendre qu'une capacité, une donnée ou une synchronisation existe sans vérification.
