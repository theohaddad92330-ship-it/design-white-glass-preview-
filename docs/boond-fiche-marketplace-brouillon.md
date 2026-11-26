# Fiche Marketplace BoondManager — brouillon et calendrier

> **BROUILLON pour relecture humaine.** Rien de ce document n'a été publié, envoyé ni déposé chez BoondManager : la
> soumission est un geste humain. Lot BOOND-F de l'épopée #4700 (#4697 points 1 et 6), 28/10/2026.
>
> Règles tenues dans la rédaction : **aucun fournisseur de données n'est nommé** (la fiche dit ce que l'app branche chez le
> client, jamais quelles sources BellumAI interroge derrière) ; **aucune probabilité** (ni « chance de closing », ni
> prévisionnel pondéré) ; **aucune donnée fictive**.

## 1. La fiche

### Titre

- FR : **BellumAI — le copilote commercial des ESN**
- EN : **BellumAI — the sales copilot for IT services firms**

### Description (FR)

BellumAI connecte votre BoondManager à un copilote qui prépare le travail commercial de votre ESN : il lit vos
missions qui se terminent, vos consultants disponibles et vos besoins ouverts, puis prépare les relances et les
messages à envoyer. Il lit votre BoondManager ; il n'y écrit que trois choses — créer une mission, corriger un TJM,
changer le statut d'un besoin — et **uniquement après la validation d'un responsable**. Rien ne part tout seul, et le
copilote n'envoie jamais d'e-mail à votre place : il prépare, le commercial envoie.

### Description (EN)

BellumAI connects your BoondManager to a copilot that prepares your firm's sales work: it reads your assignments about
to end, your available consultants and your open needs, then prepares the follow-ups and the messages to send. It reads
your BoondManager; it writes only three things — create an assignment, correct a daily rate, change the status of a
need — and **only after a manager's approval**. Nothing goes out on its own, and the copilot never sends an e-mail on
your behalf: it prepares, the salesperson sends.

> _Relecture : la formulation EN est une proposition de traduction, à faire relire par un anglophone avant dépôt._

### Ce que l'app apporte

- **Voir venir les fins de mission** : les missions qui se terminent sont remontées à temps pour proposer la suite.
- **Repérer les consultants disponibles** et les rapprocher des besoins ouverts.
- **Garder l'historique à portée de main** : contacts, affaires, profils déjà proposés, relances.
- **Préparer, jamais envoyer** : plans d'action et messages prêts à relire par le commercial.
- **Des accès minimaux et visibles** : onze accès (lecture pour la plupart), aucun accès d'administration, listés sur
  l'écran de consentement et sur la carte Intégrations de l'app.
- **Une connexion sans secret collé** : OAuth 2.0 ; la déconnexion révoque l'accès.

### Ce que la fiche ne dit pas (volontairement)

- Aucun nom de source de données ni de prestataire technique : ce que BellumAI interroge derrière relève de son
  fonctionnement, pas de ce que l'app branche chez vous.
- Aucun chiffre de « chance de signature », aucun prévisionnel pondéré : BellumAI n'affiche pas de probabilité.
- Aucune promesse de résultat commercial.

### Traductions prévues

| Élément                      | FR                                     | EN                                                       |
| ---------------------------- | -------------------------------------- | -------------------------------------------------------- |
| Titre                        | ci-dessus                              | ci-dessus                                                |
| Description                  | ci-dessus                              | ci-dessus                                                |
| Ce que l'app apporte         | ci-dessus                              | à traduire avant dépôt                                   |
| Tarif                        | « Nous contacter »                     | "Contact us"                                             |
| Documentation d'installation | `docs/boond-installation-pas-a-pas.md` | à traduire (décision à prendre : avant ou après la bêta) |

### Tarif

**Nous contacter.** Décision de Louis du 28/10/2026 : **ni lien vers la page tarifs, ni forfait dédié** à la
Marketplace. La fiche porte cette seule mention.

### Pièces associées

- Documentation d'installation pas à pas : `docs/boond-installation-pas-a-pas.md`.
- Les deux vidéos de présentation : **tournage humain, hors de ce lot**.
- `GET /marketplace/{id}/data-visualization` du back-office : **prématuré** tant que nous n'avons pas d'identifiant d'app.

> **À confirmer au premier passage réel** (nous n'avons jamais vu le formulaire de dépôt de l'éditeur) : les champs
> exacts de la fiche et leurs limites de longueur, les formats attendus pour les visuels et les vidéos, la liste des
> langues acceptées, et qui, côté éditeur, valide la fiche. Source à relire : https://help.boondmanager.com/fr/articles/373727

## 2. Le calendrier

Les dates ci-dessous sont **à poser par un humain** quand la demande part : aucune n'est connue aujourd'hui. Seules les
règles de rythme sont décidées.

| Jalon                       | Règle                                                                                                        | Date    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | ------- |
| Demande de publication      | Envoyée par un humain une fois la fiche relue, la documentation validée et les points « à confirmer » levés. | à poser |
| Créneau de publication visé | **Les mardis, entre 12 h et 12 h 30.** La première date possible suit la validation de la demande.           | à poser |
| Début de la bêta            | À la publication.                                                                                            | à poser |
| Fin de la bêta              | **Environ un mois** après le début.                                                                          | à poser |

> **À confirmer au premier passage réel** : le délai d'instruction d'une demande de publication par l'éditeur, et si le
> créneau du mardi 12 h – 12 h 30 est un créneau qu'on choisit ou un créneau qu'on subit.

### Règle : préavis de 15 jours avant toute mise à jour de l'app

**Avant toute mise à jour de l'app BellumAI sur la Marketplace, les clients qui l'ont installée sont prévenus 15 jours à
l'avance** (hors urgence).

C'est une contrainte sur **notre rythme de livraison _de cette app_** — le périmètre exposé à BoondManager (scopes,
écran de connexion, écritures déclarées, adresses sortantes) — et **pas sur le produit entier** : le reste de BellumAI
continue de se livrer au rythme habituel. Conséquences à tenir :

- on regroupe les changements du périmètre Marketplace en lots, au lieu d'en livrer au fil de l'eau ;
- un changement de scopes, d'adresse sortante ou d'écriture déclarée est **toujours** un changement soumis au préavis ;
- l'**urgence** (faille de sécurité, incident) est la seule exception, avec information des clients dès que possible ;
- la date de publication d'une mise à jour tombe donc au plus tôt 15 jours après l'annonce, sur le créneau du mardi.

> **À confirmer au premier passage réel** : si l'éditeur impose lui-même ce préavis (et son canal d'envoi), ou si c'est à
> nous de prévenir les clients par nos propres moyens ; la définition exacte de l'« urgence » côté éditeur.
