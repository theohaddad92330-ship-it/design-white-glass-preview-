# Lot L7 — Laura, sujet B : capacités, contexte d'écran et routage (#1950, #1951)

**39 points** à l'état `retenu`, extraits de `registre-2026-09-12.md`.
L'état se change dans le REGISTRE d'origine, par édition de SA ligne (jamais `Write` : 1 242 lignes).

| Point | La demande, en huit mots | Sujet | Existant (preuve) | État | Preuve en recette |
| ----- | ------------------------ | ----- | ----------------- | ---- | ----------------- |
| 1950.1 | Jamais refuser en bloc | B | NON PROUVÉ | retenu | — |
| 1950.4 | Plan affiche : objectif final | B | ABSENT | retenu | — |
| 1950.5 | Plan affiche : étapes prévues | B | ABSENT | retenu | — |
| 1950.6 | Plan affiche : données disponibles | B | ABSENT | retenu | — |
| 1950.7 | Plan affiche : données manquantes | B | ABSENT | retenu | — |
| 1950.8 | Plan affiche : outils nécessaires | B | ABSENT | retenu | — |
| 1950.9 | Plan affiche : coût estimé | B | ABSENT — coût seulement par carte | retenu | — |
| 1950.10 | Plan affiche : durée estimée | B | ABSENT | retenu | — |
| 1950.11 | Plan affiche : points de validation | B | ABSENT (partiel par carte) | retenu | — |
| 1950.12 | Plan affiche : résultats attendus | B | ABSENT | retenu | — |
| 1950.13 | Plan affiche : éléments impossibles | B | ABSENT | retenu | — |
| 1950.14 | Lancer tout le plan | B | ABSENT | retenu | — |
| 1950.15 | Modifier une étape | B | ABSENT | retenu | — |
| 1950.16 | Supprimer une étape | B | PARTIEL — au niveau carte seule (`PendingActions.tsx:531-534`) | retenu | — |
| 1950.18 | Exécuter uniquement la 1ʳᵉ étape | B | PARTIEL — sous-produit non garanti | retenu | — |
| 1950.20 | Chaque étape a un état | B | PARTIEL — au niveau carte (`CardState`), pas au niveau plan | retenu | — |
| 1950.21 | Échec n'efface pas résultats précédents | B | PARTIEL — vrai par indépendance, pas par garde explicite | retenu | — |
| 1950.22 | Étape dépendante bloquée si prérequis échoué | B | ABSENT — contredit explicitement (`PendingActions.tsx:289-292`) | recetté | Une étape ne se lancera plus si son prérequis a échoué ‖ RECETTÉ 21/09/2026 sur PROD 5483e3631 (vérification de code, appelant nommé) : `apps/ia/app/services/chat_orchestrator.py:1474` appelle `_stabilise_declared_dependencies` (`chat_tools.py:284,297`). |
| 1950.23 | Données enregistrées en page propriétaire | B | PARTIEL — vrai par outil, pas de concept de plan unifié | retenu | — |
| 1950.24 | Plan ≠ deuxième vérité | B | NON PROUVÉ (moot, pas de plan) | retenu | — |
| 1950.25 | Coût total annoncé avant dépense | B | ABSENT | retenu | — |
| 1950.27 | Plan repris après fermeture de page | B | ABSENT — `useState` React, non persisté | retenu | Un plan interrompu se retrouvera intact à la réouverture du fil |
| 1950.28 | Exécution partielle expliquée | B | NON PROUVÉ | retenu | — |
| 1951.1 | Scope « un contact » | B | ABSENT — `ChatScope` n'a que 3 kinds (`chat-scope.ts:32`) | retenu | — |
| 1951.4 | Scope « une opportunité » | B | ABSENT | retenu | — |
| 1951.5 | Scope « une mission » | B | ABSENT | retenu | — |
| 1951.6 | Scope « un rendez-vous » | B | ABSENT | retenu | — |
| 1951.7 | Scope « un territoire » | B | ABSENT | retenu | — |
| 1951.8 | Scope « une séquence » | B | ABSENT | retenu | — |
| 1951.11 | Basculer scope ou lancer analyse distincte | B | NON PROUVÉ | retenu | — |
| 1951.17 | Jamais mauvais compte silencieusement | B | PARTIEL — incident réel documenté #1779, correctif partiel (libellé) | retenu | — |
| 1951.18 | Jamais perdre contexte d'origine | B | PARTIEL — vrai pour le scope compte uniquement | retenu | — |
| 1951.21 | Revenir au périmètre précédent | B | NON PROUVÉ | retenu | — |
| 1951.22 | Conserver permissions objet actif | B | NON PROUVÉ | retenu | — |
| 1951.23 | Recette : homonymes | B | PARTIEL — clarification générique seule | retenu | — |
| 1951.24 | Recette : changement de compte | B | PARTIEL — fonctionne compte↔compte | retenu | — |
| 1951.25 | Recette : consultant puis besoin | B | ABSENT — objets scope absents | retenu | — |
| 1951.26 | Recette : mission puis contact | B | ABSENT | retenu | — |
| 1951.27 | Recette : territoire sans compte | B | ABSENT | retenu | — |
