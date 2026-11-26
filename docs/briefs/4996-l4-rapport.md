# Rapport — claude/4996-l4 (#4996 L4, Refs #4731)

**Fait (8 points)**

1. Contrat `contact-perimeter.ts` : `perimeter=mine|all`, `AccountContactsPerimeterResponse` (ajout seul, exporté).
2. Noyau pur `contacts/contact-perimeter.ts` : garde `entity_id ∈ zones` OU NULL OU entité `is_default`.
3. Texte libre neutre : seules les zones avec `entity_id` sont lues (SQL), elles seules filtrent.
4. Compteur exact `outside_perimeter_count` (rendu aussi en `all`, pour la ligne « N hors de ton périmètre — Tout voir »).
5. Ordre « ma zone d'abord » (stable), en `mine` comme en `all`.
6. Sans zone d'entité : aucun filtre, `outside_perimeter_count: null`.
7. `ContactsService.findByAccountInPerimeter` : zones DU LECTEUR, bornées à l'espace, non archivées ; compte hors périmètre BU = liste vide, aucune zone lue.
8. Contrôleur `GET contacts/account/:accountId?perimeter=` : valeur inconnue → 400 ; sans paramètre = tableau d'avant (inchangé).

**Fichiers** : `packages/contracts/src/schemas/contact-perimeter(.test).ts`, `index.ts` ; `apps/api/src/modules/contacts/{contact-perimeter,contacts.service,contacts.controller}.ts` + specs `contact-perimeter`, `contacts.service.perimeter`, `contacts.controller`.

**Tests** (rouge → vert) : contracts `contact-perimeter.test.ts` (2) ; api `contact-perimeter.spec`, `contacts.service.perimeter.spec` (négatif : hors périmètre ⇒ rien lu), `contacts.controller.spec` (35 verts). Non lancé : ci:local, suite complète, build.

**Écarts / questions**

- La réponse change de forme (objet) UNIQUEMENT quand `?perimeter=` est présent ; choix pour rester ajout seul. L6 (web) lira cette forme.
- Le web ne recopie pas le calcul ; aucune migration, aucun fichier chaud touché.
