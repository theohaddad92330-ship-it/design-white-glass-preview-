# TRANCHÉ PAR LOUIS — 15/09/2026, QCM. Seize décisions.

Prises en trois salves, toutes en réponse à des questions posées avec leurs options et
leur recommandation. **Aucune ne se re-litige.** Quand l'une a été prise CONTRE ma
recommandation, c'est écrit, avec ce qu'elle coûte.

| # | Sujet | Décision | Ce que ça débloque |
| - | ----- | -------- | ------------------ |
| 1 | **Suppression d'un fil de Laura** | L'**auteur + les gérants de l'espace**, par une permission RBAC existante — jamais un rôle déclaré (cohérent avec « un rôle déclaré ne donne aucun droit »). | #1911.15 |
| 2 | **Parité démo** | **Semer les 37 colonnes** ET descendre la garde au **niveau colonne**, capable de nommer la colonne manquante. | lot en vol |
| 3 | **Jalon « premier collègue invité »** | Ajouter un troisième état **« sans objet »** au contrat. Un booléen qui ne peut jamais passer à vrai ment. | #2077.9 |
| 4 | **Tutoiement** | **Partout, prompts compris.** L'issue #2023 écrivait « Votre organisation » ; la garde de lexique gagne. | #2023, R15N-11 |
| 5 | **« Probabilité de signature »** | **Refusée — septième fois.** On garde complétude / maturité / potentiel. Écrit ici pour qu'il n'y ait pas de huitième. | #2065.20 |
| 6 | **Réponses obsolètes** | **Ne redemander que l'ABSENT.** Détecter l'obsolète demanderait une date par réponse que la base ne porte pas ; deviner reposerait des questions au hasard. | #2022.4 |
| 7 | **Canaux SMS et e-mail des alertes** | **BRANCHER les émetteurs** — contre ma recommandation, qui était de les masquer. ⚠️ Voir l'encadré ci-dessous. | alertes Découvrir |
| 8 | **Écran des offres** | **Growth en self-service, Entreprise par contact.** Je code les trois états : sans crédit, retour de Stripe, abandon avant paiement. | #2003.22/.23, #2004.16 |
| 9 | **Plafond de Laura à l'écran** | **Ne rien afficher.** Les deux valeurs coïncident aujourd'hui, pas forcément demain — et le jour où elles divergent, personne ne ferait le lien. | — |
| 10 | **`weekly_digest = true` hérités** | **Balayage avec simulation et compte affiché AVANT d'écrire**, même forme que la régénération des contextes. | écriture de masse |
| 11 | **Dette RGPD — 4 pièces** | **Louis s'en occupe cette semaine.** Je prépare les quatre brouillons à partir de ce que le code fait réellement. | c64 |
| 12 | **PR de la couche BU** | **Louis lit la PR en ENTIER.** Je prépare un résumé lisible, avec les `fichier:ligne`. | #2087 |
| 13 | **Bail de démonstration** | Le bouton « voir la démo » **peut consommer un bail** des huit. | #2002.4 |
| 14 | **« Écosystème ESN »** | **Se compose**, ne se sème pas. Un objectif semé attribuerait au visiteur une intention qu'il n'a pas formulée. | #2151.46 |
| 15 | **« Profil validé »** | Coche la **VALIDATION**, pas la complétion. Un profil rempli n'est pas un profil validé. | #2077.3 |
| 16 | **Type de résultat de Découvrir** | Sans objet : on attend le lot qui porte l'énumération. En déclarer une seconde violerait « un réglage vit à un seul endroit ». | #2151.5 |

---

## ⚠️ La décision 7 — l'envoi sortant, prise les yeux ouverts

Louis a choisi **brancher les émetteurs**, contre ma recommandation de les masquer. L'option
qu'il a retenue portait l'avertissement en toutes lettres : *« l'e-mail est un ENVOI SORTANT
vers de vraies personnes — c'est un arrêt du dépôt, donc un lot à part avec sa propre
recette. »*

Ce que ça engage, et qui ne se néglige pas :

- **L'envoi réel vers l'extérieur est l'arrêt le plus strict du §10.** La permission de Louis
  du 25/08 sur son espace de test couvre « brouillon oui, envoi non ». Cette décision-ci
  ouvre l'envoi pour CE canal, pas pour le reste.
- Le lot doit livrer, avant tout envoi : un **interrupteur d'opérateur** (le SMS en a déjà
  un par sa clé fournisseur), une **liste d'envoi bornée** en recette, et la preuve qu'un
  canal sans clé est un **no-op strict** — zéro appel réseau, pas un envoi silencieux.
- La **cadence** quotidienne/hebdomadaire n'est exécutée par personne aujourd'hui : elle fait
  partie du lot, sinon le canal est branché et rien ne part quand même.
- Recoupe la décision 11 : la **base légale du consentement aux notifications** est l'une des
  quatre pièces dues. Brancher l'e-mail avant qu'elle soit posée est un risque assumé par
  Louis, et c'est écrit ici pour qu'on le sache dans trois mois.

## Les décisions prises contre ma recommandation

Deux, et elles sont ici pour la même raison que les deux du 14/09 : qu'on sache qu'elles ont
été prises les yeux ouverts.

- **Décision 7, brancher les émetteurs.** Le risque est de faire partir un vrai message
  depuis un canal dont la base légale n'est pas tranchée.
- Pour mémoire, la décision 9 suit ma recommandation, et la 2, la 3, la 10 aussi.

## Ce que je fais maintenant, sans redemander

Les décisions 1, 2, 3, 5, 6, 8, 10, 13, 14, 15 partent en lots. La 4 est déjà l'état du code.
La 7 part **seule**, avec un brief dédié et ses garde-fous. La 11 et la 12 sont deux
documents que je prépare pour Louis, pas du code.
