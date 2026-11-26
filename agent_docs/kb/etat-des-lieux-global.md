# État des lieux global — BellumAI

> Source : doc de cadrage interne « 01_1 État des lieux global » (fondateur → Matteo, le dev).
> Nature : note de pilotage produit, pas un audit code. Objectif déclaré : **rendre visible et consolider l'existant**, pas ajouter des idées.
> Distillé pour la KB. Aucune donnée personnelle conservée.

## Posture du fondateur

- Le but du doc n'est pas un audit ligne à ligne, mais une **lecture technique consolidée à date**.
- Thèse centrale : « Bellum n'est pas juste un scraper. C'est une chaîne qui transforme de la donnée hétérogène en **sorties commerciales exploitables**. »
- Priorité affichée : **stopper l'ajout de features**, rendre l'existant lisible, transformer les briques en **jalons testables**, et identifier ce qui est externalisable sans casser le cœur produit.

## Briques considérées comme déjà entamées / présentes

| Brique                         | État perçu par le fondateur                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Onboarding**                 | Déjà lancé. Parcours partiellement existant (captures + vidéo), avec génération de profil derrière.                               |
| **Profiler / profile context** | Base réelle de profil utilisateur ; personnalisation des recherches/sorties via questionnaire.                                    |
| **Appels API & collecte**      | Plus au stade zéro. Couche collecte/enrichissement au moins partielle, articulée autour de **Pappers, Firecrawl, Brave, Apollo**. |
| **Stripe**                     | Commencé, présent dans la machine, **mais pas stabilisé bout en bout**.                                                           |
| **Front / design**             | Vraie matière front. Fondateur a refait pages + UX ; le dev a avancé sur front/design — recensement précis manquant.              |
| **Architecture multi-agents**  | Chantier réel, en cours. Problème : **pas assez visible ni cartographié** côté pilotage.                                          |

## Briques « en cours critiques » (déclarées)

- Recherche analytique Bellum + Sales Connect
- Identification des comptes créés
- Personnalisation / user profile via questionnaire
- **Stabilisation du socle V1**
- Dispatch / enrichissement de la donnée
- Pages front prioritaires + site web
- Architecture multi-agents réellement visible
- **Calcul du coût réel des requêtes / APIs**

## Chaîne produit telle que lue aujourd'hui (le « moteur Bellum »)

1. Questionnaire onboarding → **profil utilisateur**
2. Lancement d'une **recherche compte**
3. **Collecte / enrichissement** via APIs + scraping
4. **Résumé contexte**
5. **Interprétation agentique métier**
6. **Sorties** : contacts, organigramme, messages, **Go / No-Go**, plan d'action

## Zones de manque de lisibilité (pain points)

- Liste exacte des briques **finies** vs **testables aujourd'hui**
- État réel de **stabilité des appels API** déjà branchés
- Statut exact de **Stripe** et de **l'onboarding**
- Niveau réel d'avancement de la **personnalisation**
- **Coût réel d'une recherche / d'un compte**
- **Schémas de sortie visés pour chaque sous-agent** ← pertinent prompts/pipeline
- Frontière nette **V1 vs repoussé**

## Attentes formulées (vers le dev)

- Vision simple **fait / en cours / bloqué**
- Démos produit plus régulières
- Lecture claire des **dépendances**
- Lecture claire du **coût API**
- Lecture claire de ce qui est **montrable à court terme**
- Lecture claire de ce qu'il faut **stabiliser avant bêta**
