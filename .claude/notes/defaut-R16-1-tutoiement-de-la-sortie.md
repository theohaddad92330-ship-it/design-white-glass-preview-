# R16-1 / R16-2 — la garde lit le PROMPT, le produit rend la SORTIE

Mesuré en production le 16/09/2026, sur `2e13d009a`, dans l'espace de Louis.

## Ce qu'un utilisateur lit, aujourd'hui, sur `/welcome`

> « l'alignement technique (**vos** domaines vs. les projets en cours chez l'ETI) »

Et dans le contexte stocké que l'API rend (`GET /api/profile-context/me`, révision **25**,
produite le 15/09 à 14:23), **8 segments vouvoient**, dont :

| Champ | Ce qu'il dit |
|---|---|
| `profileRecap` | « **Vous** travaillez uniquement avec des "freelances" et **votre** équipe commerciale est de 4-8 personnes » |
| `scoringPersonalization` | « **vos** domaines (cloud, data, cybersécurité) » |
| `weeklySummaryIntro` | « Cette semaine, on a creusé les stakeholders clés chez **vos** cibles » |
| `keyAdvice` | « commencez par une ETI fintech ou industrielle » |

⚠️ Le premier est **exactement** le motif que `test_welcome_summary_tutoiement.py` cite comme
cause racine de R15N-11, et qu'il garde en dur dans `test_la_garde_sait_dire_non`.

## Pourquoi la garde est verte quand même

`test_welcome_summary_tutoiement.py` lit `ProfileContext.model_json_schema()` — **ce que le
prompt COMMANDE**. C'est juste, c'est bien fait (elle a ses trois preuves : elle sait dire non,
elle lit un corpus non vide, elle a un témoin de cas voisins). Mais une consigne de prompt n'est
pas un contrat : **rien ne relit le texte PRODUIT**. Deux conséquences, toutes deux mesurées :

1. **Un texte produit AVANT la correction reste vouvoyé pour toujours.** La révision 25 date du
   15/09 à 14:23 ; le correctif (`8f2965a84`) a atterri à 16:13. La doctrine « on archive, on ne
   supprime pas » veut que l'ancien texte survive — donc le défaut survit avec lui, et aucune
   régénération n'est déclenchée.
2. **Un modèle qui désobéit une fois passe.** Il n'y a aucun repêchage : Instructor re-demande au
   modèle sur une erreur de **validation**, jamais sur une consigne non suivie.

## Et le corpus de la garde est plus étroit que ce que le produit rend

`ProfileContext` porte **21 champs de texte rendus à l'utilisateur**. **Six** portent la consigne
de tutoiement (`profile_recap`, les quatre `*_personalization`, `key_advice`). Les quinze autres
ne la portent pas — dont `weekly_summary_intro`, `welcome`, `empty_state`, `first_analysis_cta`,
`score_context`, qui sont précisément les cinq que `stored-context-doctrine.spec.ts:98` appelle
`PHRASE_FIELDS` côté API. Deux corpus, deux listes, aucune des deux n'est celle du produit.

## Ce qu'il faut livrer

1. **Un `field_validator` pydantic** sur les champs de texte rendus verbatim, qui REFUSE
   vous/votre/vos dans la valeur produite. C'est la seule chose qui transforme une consigne en
   contrat : Instructor rejoue le tour sur une erreur de validation. ⚠️ Il doit refuser le
   vouvoiement **employé**, pas le mot cité — réutiliser la nuance `_REFUSAL` de la garde
   existante, et écrire le témoin qui le prouve.
2. **UN corpus, à UN endroit** (« un réglage vit à un seul endroit », GA-26) : la liste des champs
   rendus verbatim se dérive, elle ne se recopie pas dans trois fichiers. Les deux listes de cinq
   qui existent (IA `_WELCOME_SUMMARY_FIELDS`, API `PHRASE_FIELDS`) doivent lire la même source.
3. **Le texte DÉJÀ stocké** : décider, et écrire la décision. Une régénération de masse est une
   écriture en masse, donc un arrêt du dépôt — la proposer, ne pas la lancer. L'option qui
   n'écrit rien : détecter à la LECTURE et redemander une génération pour cet espace-là.

## Ce que ça ne doit pas devenir

- Pas de correction du texte stocké par expression régulière : « votre équipe » → « ton équipe »
  produit des phrases fausses, et c'est de la donnée inventée.
- Pas de suppression de la révision fautive : on archive, on ne supprime pas.
