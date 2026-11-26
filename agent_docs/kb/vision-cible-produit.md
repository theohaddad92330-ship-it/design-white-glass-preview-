# Vision cible produit — BellumAI

> Distillé d'un doc d'alignement interne ("Vision cible produit"). North star produit.
> Aucune donnée personnelle. Source : doc d'alignement BellumAI.

## TL;DR

BellumAI n'est plus un assistant IA générique "qui fait plein de choses" : il a pivoté vers un **système d'intelligence commerciale spécialisé ESN**. La promesse : faire gagner un temps énorme à un commercial / dirigeant ESN sur la lecture d'un compte, la qualification, la préparation commerciale et la stratégie d'attaque. La valeur n'est pas de remonter de l'info — c'est de transformer un travail long de recherche + analyse + préparation en un **dossier de conquête directement actionnable**. Destination produit, pas backlog immédiat : V1 très utile et concrète, puis montée en gamme progressive.

## Promesse produit (north star)

BellumAI aide un commercial ESN à savoir **quel compte attaquer, pourquoi, comment, avec quels signaux, quels décideurs, quels messages, et quel plan d'action.**

Ce n'est pas un moteur de collecte. C'est une **chaîne complète de transformation de la donnée brute en sortie métier utile**.

## Les 8 deliverables north-star (ce que chaque prompt doit servir)

Chaque sortie de BellumAI, et donc chaque prompt, doit contribuer à produire l'un de ces 8 livrables. Aucune sortie ne doit être décorative ; tout doit être actionnable.

1. **Identifier le bon compte** — désambiguïsation, entité utile (pas la holding/SCI vide).
2. **Récupérer les bons signaux** — signaux business pertinents pour une ESN (recrutement IT, stack, actualité, croissance…).
3. **Comprendre le contexte de l'entreprise** — résumé contexte lisible et exploitable.
4. **Identifier les bons interlocuteurs** — décideurs réels, pas un annuaire générique.
5. **Reconstituer la chaîne de décision** — organigramme / circuit décisionnel d'achat.
6. **Produire des messages contextualisés** — prêts à envoyer, adaptés au compte ET au profil de l'ESN utilisatrice.
7. **Produire un Go / No-Go argumenté** — décision de qualification justifiée.
8. **Produire un plan d'action concret** — étapes opérationnelles, pas du conseil abstrait.

## Workflow cible (parcours produit)

1. Onboarding / questionnaire
2. Création ou enrichissement d'une fiche profil utilisateur
3. Page de recherche
4. Lancement de la recherche sur un compte
5. Résumé contexte
6. Production des sorties structurées (les 8 deliverables)

## Le profil utilisateur comme différenciateur clé

La personnalisation est un sujet **majeur**, pas un habillage. Règle north star : **deux ESN concurrentes ne doivent PAS obtenir la même interprétation ni la même recommandation sur le même compte.**

Le profil utilisateur (issu du questionnaire / fiche) doit concrètement :

- **enrichir le contexte** de la recherche ;
- **influencer la lecture métier des signaux** ;
- **influencer les messages générés** ;
- **influencer la stratégie proposée** ;
- rendre BellumAI **réellement différenciant vs un outil générique**.

→ Implication prompts : le profil utilisateur doit être un input de premier ordre dans les prompts d'interprétation, de messaging et de stratégie — pas un simple champ ignoré.

## Barre de qualité — à préserver

- Profondeur de recherche et d'enrichissement.
- Logique multi-agents **quand elle sert vraiment la qualité des sorties**.
- Personnalisation via le profil utilisateur.
- Spécialisation ESN.
- Capacité à produire un dossier **plus intelligent qu'un simple scraping**.

## Anti-patterns — à éviter

- Sensation d'usine à gaz agentique trop abstraite.
- Produit impressionnant sur le papier mais peu utile à l'usage.
- Pages / blocs décoratifs et pas assez actionnables.
- Agents qui existent sans vraie logique métier claire.
- Un front qui "raconte beaucoup" mais dont la sortie n'apporte pas assez de valeur perçue.

## Lecture exécution

Pas un appel à gonfler le scope. Destination, pas roadmap immédiate :
**V1 très utile (impressionnante parce que concrète) → montée en gamme progressive.**
La vision sert à arbitrer ce qu'on fait maintenant vs ce qu'on repousse.
