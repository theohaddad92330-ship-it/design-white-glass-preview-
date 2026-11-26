# Décisions de Louis — 18/09/2026, après-midi

Trois arbitrages pris en QCM pendant la vague 18/09. Chacun bloquait des points de registre.

## D1 — Découvrir : la cible déclarée FILTRE toujours, avec un bouton pour l'ignorer

**Question posée** : une recherche en TEXTE LIBRE doit-elle respecter les secteurs cibles déclarés ?

**Mesure qui a provoqué la question** (recette prod 18/09, `474fcfa31`, espace réel « LouisESN ») :
`?freetext=entreprises+dans+le+75` rend **24 résultats, 0 dans les 5 secteurs cibles déclarés** (Fintech,
Industrie manufacturière, Aéronautique & Défense, Luxe, Santé) — 9 restauration traditionnelle, 4 restauration
rapide, 2 supermarchés. Le retour d'origine (#2489.3) disait « que santé et secteur public » ; la réalité
mesurée est pire.

**Tranché** : les résultats hors cible sont **écartés par défaut**, et l'écran **DIT combien il a écarté et
pourquoi**. Un bouton « chercher hors de ma cible » les ramène.

Ce que ça implique : un filtre, un libellé, un compteur. Le compteur n'est pas décoratif — sans lui, un écran
qui écarte silencieusement est un écran qui ment sur ce qu'il a trouvé. Et « 0 écarté » n'est pas « aucun
filtre » : les deux se lisent différemment.

## D2 — Facturation : Odoo reçoit le PREMIER adaptateur vérifié (#2565.12)

**Tranché** : **Odoo**, malgré le fait que ce soit le plus coûteux à vérifier — chaque instance diffère
(modules, champs personnalisés). C'est celui que les ESN utilisent réellement.

Rappel de doctrine qui s'applique : **un contrat d'API non vérifiable ne se devine pas.** L'adaptateur Odoo
ne part que sur ce qui est vérifiable sur une instance réelle ; ce qui varie d'une instance à l'autre se
découvre à l'exécution et se DIT, il ne se suppose pas. Et **une écriture CRM/ERP passe par une porte** :
auto-approuvée sur geste utilisateur, sinon prévisualisation figée.

Qonto et Tiime restent ouverts, après.

## D3 — #2033 : le périmètre d'autorité déclaré cadre ce que Laura PROPOSE, jamais ce que l'API autorise

**Question posée** : que fait le périmètre d'autorité collecté au questionnaire (décisions autonomes,
décisions à faire valider, personnes managées, responsabilité recrutement / staffing / marge / facturation,
droit d'inviter) ?

**Tranché** :

- Le questionnaire **collecte** les réponses (#2033.2 à #2033.8).
- Elles **n'entrent nulle part dans les droits**. `workspace-permission.guard.ts` **reste la seule autorité**
  sur ce qui est autorisé — un réglage vit à UN seul endroit (GA-26), et des permissions qui vivraient à deux
  endroits divergeraient en trois semaines.
- Ce qu'elles changent : **Laura cesse de proposer une action hors du périmètre déclaré, et le DIT**
  (« ça sort de ce que tu m'as dit décider seul »). C'est #2033.9 et #2033.10 : ne pas proposer à un Business
  Manager une action réservée au dirigeant, et ne pas lire « directeur » comme un accès à toutes les données.
- **Sans réponse, on ne devine pas** : le périmètre non renseigné ne restreint rien, Laura propose tout.
  « Non mesuré » n'est jamais une valeur basse (GA-18/GA-19) — ici, ce n'est pas un périmètre vide.

## D4 — Odoo : on code contre la doc PUBLIQUE, et tout ce qui n'est pas prouvé est marqué NON VÉRIFIÉ

**Ce qui bloquait** : `decisions-louis-18-09-soir.md` #8 disait « Odoo, Louis fournit un accès de recette », et
aucune instance Odoo n'est joignable. Un écrivain a donc refusé de deviner `account.move` — à raison :
**un contrat d'API non vérifiable ne se devine pas.**

**Tranché** : l'adaptateur part sur le **schéma Odoo documenté publiquement**, et chaque champ dont on n'est
pas certain **se découvre à l'exécution et le DIT**.

Ce que ça veut dire concrètement, et ce que ça ne veut pas dire :

- Rien n'est inventé. Un champ absent chez un client **reste absent** — il ne devient ni `0`, ni une chaîne
  vide, ni un défaut deviné. « Non mesuré » n'est jamais « 0 » (GA-18/GA-19).
- Rien n'est prouvé non plus. Ce qui vient de la doc et non d'une instance réelle porte l'état **NON VÉRIFIÉ**,
  visible, jusqu'à ce qu'une vraie instance le confirme. On ne présente pas une lecture de documentation comme
  une vérification.
- L'écriture reste derrière sa porte : auto-approuvée sur geste utilisateur, sinon prévisualisation figée.

**#2565.10 ne se ferme donc PAS** à la livraison : il se ferme quand une instance réelle a confirmé le contrat.

### D4 bis — l'Odoo de Louis EST branché : on vérifie contre le réel, pas contre la doc

**Correction apportée par Louis dans la foulée** : « mon odoo est déjà branché à bellum ». D4 partait de
l'idée qu'aucune instance n'était joignable — c'était faux.

Ce que ça change, et ce que ça ne change pas :

- Les identifiants Odoo ne sont **pas** des variables d'environnement : ils vivent chiffrés dans
  `crm_connections` (`provider = 'odoo'`), **par espace**. La vérification ne peut donc pas partir d'une
  machine de développement — elle passe par l'application, sur l'espace de Louis. Trois routes existent :
  `GET /odoo/status`, `POST /odoo/connect`, `POST /odoo/export`.
- **Louis a autorisé, le 18/09 après-midi : la lecture, PLUS une seule écriture de test** — une facture
  brouillon nommée `RECETTE — 18/09`, qu'il supprimera lui-même. C'est une exception explicite à la règle
  « tout ce qui part vers l'extérieur est interdit en recette », donnée pour ce cas précis et pas au-delà.
- Ce qui est observé sur l'instance réelle devient **vérifié**. Ce qui ne l'est pas garde l'état
  **NON VÉRIFIÉ** de D4 : on ne présente jamais une lecture de documentation comme une vérification.

**#2565.10 peut donc se fermer** — non pas à la livraison du code, mais quand le relevé de l'instance réelle
aura confirmé les noms de champs et la réponse d'écriture.
