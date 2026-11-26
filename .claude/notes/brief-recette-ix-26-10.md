# Brief — RECETTE n°4 (vague VIII servie) : mailbox, actions, Laura, vocal, integrations

Lecture seule dans Chrome. 18 points. Un verdict par point : **PASS · FAIL · PARTIAL · BLOCKED**, jamais
« ça a l'air bon ». Tu rends un tableau, puis tu t'arrêtes.

## 0. Prouver d'abord que le point est DANS le commit servi

```sh
curl -s https://api.bellum-ai.com/version
```

Le commit attendu est `d7e6ab017acd18592fbf78ce6670e613c3bf52bc` (vague VIII). Si la version servie est
un autre commit, **tout est BLOCKED** et tu le dis en une ligne : 12 points d'une recette précédente ont
été rendus sur un commit qui ne portait pas le code (mémoire `recette-prouver-que-le-point-est-dans-le-commit-servi`).
Un préfixe court qui correspond suffit ; ne complète JAMAIS un SHA de mémoire.

Application : https://app.bellum-ai.com — démonstration : https://app.bellum-ai.com/demo

## 1. Ce que tu ne fais sous aucun prétexte

- **Ne JAMAIS saisir un identifiant ni un mot de passe** : c'est le geste de l'humain. Session expirée
  (401, redirection) → ouvrir `/login` et cliquer « Se connecter » ; si ça ne suffit pas, rendre BLOCKED.
- **N'envoie rien à un tiers** : jamais « Envoyer », « Publier », « Partager », jamais « Fait » (il écrit un
  état déclaratif), jamais une rafale. « Générer le mail » et « Copier et ouvrir » ne partent vers personne :
  autorisés. Sur /integrations, « forcer une synchro » est autorisé (lecture du CRM vers Bellum).
- **Jamais de clic par coordonnées après un changement d'onglet** : retrouver l'élément d'abord.
- Jamais une valeur de secret affichée, copiée ou recopiée dans ton rapport.
- **Quitter la démonstration avant de rendre** : ne laisse pas Louis dans `/demo`. Ferme tes onglets.

## 2. Les 18 points

### /mailbox
| point | ce qui doit être VU |
|---|---|
| #4405.1 | Sur un fil (ex. InMail), « Préparer une réponse » ouvre « Répondre à ce fil » avec le texte prégénéré (~364 car.). **Mesure le bouton « Annuler » en px** : il débordait de 43 px le 25/10. Fonctionnel OK mais visuel KO = **PARTIAL**, avec le chiffre. |

### /actions (Ma journée > Traiter : E-mails), prod PUIS démo
| point | ce qui doit être VU |
|---|---|
| #4521.1 | Carte e-mail : compte ET contact (nom, fonction) cliquables, ex. Muriel Kumpflen (DG) |
| #4521.2 | Ligne signal lisible, ex. « Repli de CA : 72,4 M€ → 69,1 M€ » avec sa date ; **aucune ligne** si pas de signal (une absence ne fait AUCUNE ligne) |
| #4521.3 | « Générer le mail » : objet et corps modifiables DANS la carte, puis « Copier et ouvrir » et « Fait » ; aucune génération en masse |
| #4521.4 | Le récap de rafale ne dit plus « 88 actions sans destinataire nommé » quand les cartes nomment un contact — **relève le texte exact du récap** |
| #4521.5 | Générer ne partage, n'enregistre et n'envoie rien (onglet Réseau : aucune requête d'envoi) ; « Fait » est déclaratif — **ne clique pas « Fait »**, lis son libellé et son infobulle |
| #4521.6 | EN DÉMO : une carte e-mail de relance SNCF avec contact, signal et bouton « Générer le mail » |

### Laura, /chat
| point | ce qui doit être VU |
|---|---|
| #4408.1 | Demande « petite structure, sans gros process achat » : **0 grand groupe** dans la sélection principale ET **10 comptes** rendus. Dernier essai PARTIAL : 3 sur 10, Laura disait « ne complète pas artificiellement ». Compte les comptes rendus et relève les écartés avec leur raison. |
| #4438.6 | Longueur des réponses : mesure le nombre de mots de 3 réponses de Laura (médiane avant correctif : 86 mots). Pas de /diagnostic-laura ici : juste les 3 chiffres. |

### /chat — saisie vocale (prod, puis sous 768 px, puis thème clair ET sombre)
| point | ce qui doit être VU |
|---|---|
| #4536.1 | **Deux** boutons vocaux seulement : « Dicter un message vocal » et « Démarrer la conversation vocale ». Plus aucun bouton « flèches en boucle ». |
| #4536.2 | Conversation vocale : un mot incertain n'envoie jamais, la session se referme et le texte revient dans la saisie. Sans micro, rends BLOCKED en le disant — ne devine pas. |
| #4536.3 | Aucun libellé `continuousConversation` visible, FR et EN |
| #4536.4 | Sous 768 px : les deux boutons vocaux présents, **cibles ≥ 44 px** (mesure-les). Si ton navigateur reste à `innerWidth: 1512` malgré la demande, **dis ta largeur réelle** et rends BLOCKED plutôt qu'un faux PASS. |
| #4536.6 | Deux captures : thème clair et thème sombre. Contraste AA, aucune couleur qui jure. |

### /integrations
| point | ce qui doit être VU |
|---|---|
| #4487.1 | Pipedrive > forcer une synchro : le journal d'API ne montre plus « Pipedrive read organizations failed » |
| #4487.3 | Après un cycle de synchro, une société modifiée dans Pipedrive apparaît dans /accounts. Si tu ne peux pas modifier côté Pipedrive, dis-le et rends BLOCKED sur cette moitié. |
| #4513.1 | /integrations n'affiche plus « Par quoi commencer » |
| #4513.2 | Onglet Réseau après connexion d'un outil : **aucune** requête `connector_enabled_after_hint` |
| #4487.2 et #4513.3 | Pas de preuve à l'écran (tests seuls) → rends `sans preuve écran`, pas PASS |

## 3. La non-régression, en live

Sur chaque écran ouvert : **compte les éléments** (sonde du DOM) et signale tout défaut neuf même hors
de ta liste — texte coupé, débordement, « 0 » affiché là où il n'y a pas de donnée, libellé anglais, zone
cliquable non tabulable, deux fois le même réglage. Chaque défaut neuf avec sa mesure en px et sa route.

« Ça marche » n'est pas « c'est propre » : un point fonctionnellement bon mais visuellement cassé est
**PARTIAL**, jamais PASS.

## 4. Cadre

- Plafond : **150 tours**. Un seul recetteur à la fois (le navigateur est une ressource unique).
- Rapport : un tableau `point | verdict | ce que j'ai VU (chiffré) | route`, puis la liste des défauts neufs,
  puis ce que tu n'as pas pu prouver et pourquoi. ≤ 25 lignes hors tableau.
