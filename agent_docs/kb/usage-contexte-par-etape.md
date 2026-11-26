# Usage du contexte utilisateur par étape

> Source : doc interne BellumAI "05_3 — Usage du contexte par étape" (doc d'alignement produit). Distillé ici sans donnée personnelle.
> Sujet : comment le contexte utilisateur (profil ESN, relation au compte, offre à pousser) doit personnaliser chaque étape du pipeline d'analyse.

Knowledge base interne — informe la **logique de personnalisation du contrat d'entrée de TOUS les prompts** (BELLUM-RESEARCH, CONTACTS, PLAN, DISCOVER, ADVISOR, PITCH, BOOLEAN). C'est cette couche qui rend Bellum différenciant vs un produit générique qui ne fait que remonter de la donnée.

---

## Le principe central : faits mutualisés vs interprétation personnalisée

La différence entre "un outil qui remonte de la donnée" et "un produit qui interprète la donnée à la lumière de la réalité commerciale du user" :

- **Faits / collecte brute = mutualisés.** La récupération de données sur un compte (signaux, contacts, données entreprise) ne dépend pas du user. Un même compte produit les mêmes faits bruts pour deux ESN différentes. Ces couches **n'ont pas besoin** de tout le contexte utilisateur.
- **Interprétation / sorties = personnalisées.** La lecture des signaux, la qualification de l'intérêt, le Go/No-Go, les messages et le plan d'action **doivent** changer selon le profil du user. Un même compte ne doit pas être interprété de la même manière pour deux ESN différentes.

> Conséquence : ne JAMAIS injecter le profil complet partout de manière brute. Le contexte est utilisé **au bon moment, par les bons modules, avec un périmètre propre.**

## Ce qu'on appelle le contexte utilisateur

Tout ce qui décrit la réalité du user / de son ESN :

- ses offres (l'offre à pousser),
- sa taille, sa géographie,
- son positionnement, sa cible,
- ses contraintes,
- sa manière de vendre.

Ce n'est **pas un accessoire** : c'est la couche qui transforme une sortie générique en sortie qualifiée.

## Anti-patterns à éviter (règles de gouvernance d'injection)

- Injecter tout le profil partout de manière brute.
- Rendre les prompts trop lourds ou trop confus en surchargeant de contexte.
- Créer un faux sentiment de personnalisation alors que les sorties restent génériques.
- Utiliser le contexte là où il n'apporte pas réellement de valeur (ex. collecte brute).

---

## Où le contexte intervient — et comment il change la sortie

| #   | Étape                     | Le contexte doit changer…                                                                                                                                    | Prompt/agent concerné           |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| 1   | **Préparer la recherche** | Le **cadrage** de la recherche : hiérarchiser ce qu'on regarde, ce qui compte comme signal fort, ce qui est pertinent ou non pour ce profil                  | RESEARCH / BOOLEAN (requêtes)   |
| 2   | **Lire les signaux**      | L'**interprétation** des signaux et la qualification de l'intérêt d'un compte — un même compte se lit différemment selon l'ESN                               | couche lecture/résumé, RESEARCH |
| 3   | **Produire les messages** | Le **ton, les angles d'attaque, les priorités et les formulations**, en fonction du profil, de l'offre et du positionnement — contexte **indispensable** ici | Agent messages (PITCH)          |
| 4   | **Go / No-Go**            | Le score/verdict **calculé ou interprété à la lumière du contexte business** du user — jamais purement généraliste                                           | Agent Go/No-Go (ADVISOR)        |
| 5   | **Plan d'action**         | La **manière d'attaquer** le compte : selon contexte, maturité commerciale, taille de l'équipe, profondeur souhaitée                                         | Agent plan d'action (PLAN)      |

### Sous-agents qui DOIVENT s'appuyer sur le contexte

- Agent messages
- Agent Go / No-Go
- Agent plan d'action
- Éventuellement la couche de lecture / résumé de contexte (selon implémentation)

### Couches qui NE nécessitent PAS tout le contexte

- Collecte brute / récupération de données (faits mutualisés). C'est précisément pour elles qu'on évite l'injection globale et indistincte du profil.

---

## Conséquence technique : des slices de contexte, pas un blob global

Ne pas injecter l'intégralité du `profile context` dans chaque appel. À la place, prévoir des **vues / slices de contexte plus petites, adaptées au besoin de l'étape**. Certains appels custom ou certaines couches préparent un **contexte minimal** propre à l'étape :

- **Contexte minimal de recherche** (cadrage / hiérarchisation des signaux)
- **Contexte utile à l'interprétation métier** (lecture des signaux)
- **Contexte utile aux messages** (ton, angles, offre, positionnement)
- **Contexte utile au Go / No-Go** (réalité business pour le verdict)
- **Contexte utile au plan d'action** (maturité, taille équipe, profondeur)

## Questions encore ouvertes (côté implémentation)

À clarifier : quels appels custom injectent ce contexte proprement, quels sous-agents le consomment, sous quelle forme, et ce qui est déjà réellement branché vs à faire. Point majeur — c'est la couche différenciante de Bellum.
