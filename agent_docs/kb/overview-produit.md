# Overview produit — BellumAI (substance métier)

> Source : doc fondateur « TOUT CE QU'IL Y À SAVOIR » (Google Drive). Distillé pour
> nourrir les system prompts. Substance business uniquement — pas de données perso.

## 1. Catégorie & promesse

BellumAI est un **système d'intelligence commerciale spécialisé ESN / cabinets de conseil**.
Ce n'est PAS un chatbot généraliste, PAS un scraper, PAS un CRM. Son travail :
**transformer une recherche sur un compte en dossier de conquête exploitable.**

**Promesse cœur (à garder en tête pour toute sortie) :**

> « Tu entres un compte. BellumAI te dit **si le compte vaut ton temps**, **qui viser**,
> **pourquoi maintenant**, **quoi dire**, et **quelle séquence d'action lancer**. »

Les 5 questions auxquelles tout le produit doit répondre :

1. **Vaut-il mon temps ?** → score Go/No-Go
2. **Qui viser ?** → décideurs / contacts / organigramme
3. **Pourquoi maintenant ?** → signaux (achat / projet / finance / recrutement)
4. **Quoi dire ?** → messages prêts à envoyer
5. **Quelle séquence ?** → plan d'action / stratégie de compte

## 2. Cible

- **Commercial ESN / business manager** qui doit attaquer un nouveau compte.
- **Manager / directeur commercial** qui priorise les comptes et pilote la stratégie d'entrée.
- **Dirigeant de PME ESN** qui veut industrialiser la lecture des comptes.

Problème résolu : aujourd'hui l'info est dispersée, la lecture des comptes est lente,
l'organigramme reconstruit à la main, les signaux mal priorisés, les messages génériques.
BellumAI = lecture **plus rapide, plus structurée, plus actionnable** (heures/jours → minutes).

## 3. Différenciation (à respecter dans le ton des sorties)

- **Spécialisation ESN/conseil** : toute la logique vise le compte, les signaux, les décideurs,
  la stratégie d'attaque. Jamais générique.
- **Mutualisation des faits + personnalisation de l'interprétation** : deux ESN qui regardent
  le même compte ne doivent PAS obtenir le même score, la même lecture, ni les mêmes messages.
  Les faits sont mutualisés ; l'interprétation est câblée sur le contexte ESN de l'utilisateur.
- **Chaîne complète** : collecte → structure → interprète → restitue (pas juste remonter de la donnée).
- Ne jamais consommer/afficher des outputs bruts de fournisseurs : toujours des **sorties Bellum structurées**.

## 4. Parcours utilisateur cible (A→Z)

1. Onboarding / questionnaire
2. Création/MAJ fiche profil utilisateur (contexte ESN)
3. Page recherche
4. Saisie d'un compte (ex : SNCF)
5. **Résolution d'identité** : choix de la bonne entité / filiale / périmètre
6. Lancement recherche **rapide OU enrichie** (paliers, pas une recherche monolithique)
7. Collecte (APIs + scraping) + normalisation + résumé contexte
8. Dispatch vers sous-agents métier
9. **Restitution dans le dossier compte** (voir §5)
10. Actions : copier un message, enrichir le compte, rafraîchir, enrichir les contacts,
    lancer la prochaine étape commerciale

**Principe directeur** : penser **« dossier compte persistant qui vit dans le temps »**, pas une
recherche jetable refaite à zéro. Modes attendus : _load / refresh léger / enrichissement profond / deepen_.

## 5. Les deliverables (ce que le commercial obtient)

Le dossier compte affiche, en composants distincts :

| Deliverable                         | Ce que c'est                                                        |
| ----------------------------------- | ------------------------------------------------------------------- |
| **Résumé exécutif**                 | Synthèse de tête du compte                                          |
| **Score Go / No-Go**                | Le compte vaut-il l'effort ?                                        |
| **Signaux**                         | Achat / projet / finance / recrutement — le « pourquoi maintenant » |
| **Décideurs / contacts**            | Qui viser, avec statut enrichi / non enrichi                        |
| **Organigramme**                    | Nœuds / rôles / zones grises / pistes à compléter                   |
| **Messages / pitch**                | Messages prêts à envoyer, variantes, angle, niveau de perso         |
| **Plan d'action / stratégie**       | Séquence commerciale, plan de compte                                |
| **Recommandations**                 | Reco d'attaque                                                      |
| **Sources / fraîcheur / confiance** | Provenance, date, niveau de confiance (transversal)                 |

## 6. Quality bar par deliverable (ce que « bon output » veut dire)

Règles transversales de qualité (issues des risques UX identifiés) :

- **Hiérarchie, pas tout à plat** : ne pas tout montrer d'un coup sans priorité → surcharge.
- **Structuré visuellement, pas un mur de texte** : sinon faible pouvoir de démonstration.
- **Provenance + fraîcheur + confiance visibles** sur chaque fait → sinon confiance faible.
- **Personnalisé via contexte ESN**, pas générique → la perso doit être réelle, pas un faux sentiment.

Par deliverable :

- **Score Go/No-Go** : verdict clair (le compte vaut-il le temps du commercial), pilotable,
  justifié par les faits/signaux — pas un score vague et inexploitable.
- **Signaux** : priorisés et catégorisés (achat / projet / finance / recrutement),
  daté et sourcé. Doivent répondre à « pourquoi attaquer maintenant ».
- **Décideurs / contacts** : viser juste, distinguer contacts existants vs nouveaux,
  ne pas écraser l'existant lors d'un enrichissement, statut enrichi/non-enrichi explicite.
- **Organigramme** : nœuds + rôles, et **assumer les zones grises** (pistes à compléter)
  plutôt qu'inventer.
- **Messages** : prêts à envoyer, **angle explicite**, variantes, niveau de personnalisation
  visible — câblés sur le contexte ESN, jamais génériques.
- **Plan d'action / stratégie** : séquence concrète et actionnable, pas un conseil flou.
- **Sources** : chaque sortie traçable (provenance, fraîcheur, confiance) — pilier de confiance.

**Garde-fou anti-hallucination** (conforme aux règles repo) : jamais de données fictives.
Donnée absente → la marquer comme manquante / zone grise. Ne pas inventer un contact,
un signal ou une entité non prouvés.

## 7. Ce que BellumAI N'EST PAS (à ne pas dériver)

- Pas un ChatGPT emballé dans une UI.
- Pas un simple scraper.
- Pas un CRM.
- Pas une usine à gaz agentique dont la complexité dépasse la valeur perçue.
- Pas (à court terme) une plateforme d'automatisation exhaustive de tous les workflows ESN.

---

### Notes

- Le doc source est écrit par un fondateur non-technique : la substance ici est **business
  (promesse, deliverables, quality bar)**, pas une spec technique. Les détails techniques
  (tables, edge functions, prompts exacts, contrats JSON) sont à confirmer côté code/repo
  et marqués `[INFORMATION MANQUANTE]` dans le doc original.
- Décisions produit affirmées par le fondateur : recherche **par paliers** (pas monolithique),
  **slices de contexte** (pas tout le contexte partout), **dossier compte persistant**.
