# Boond Marketplace — les 9 contrats non documentés (#4699)

> Doctrine : **un contrat d'API non vérifiable ne se devine pas.** Ce fichier est le registre des neuf points
> qui ne sont documentés nulle part de public. Statut au 2026-10-29 : **AUCUN n'est répondu** — chacun reste
> « non vérifié » et ne doit être comblé par aucune hypothèse silencieuse. Une réponse du support s'écrit ICI
> (réponse verbatim, date, auteur), puis l'issue dépendante est mise à jour.

Sources déjà consultées (à citer dans chaque question) : spec OpenAPI https://doc.boondmanager.com/api/ ·
métadonnées RFC 8414 `https://ui.boondmanager.com/.well-known/oauth-authorization-server` · collection développeurs
(2 articles) · ~200 tutoriels.

## Format imposé par le partenariat (support, Julien Jaudeau en copie)

Chaque message : méthodologie suivie · méthode d'authentification choisie · objectif visé · parcours souhaité ·
requête envoyée · retour de l'API · documentations consultées. Questions regroupées par thème, pas en vrac.

## Groupes à envoyer (par Louis — la routine n'envoie rien)

| Groupe                         | Questions                             | Débloque                                |
| ------------------------------ | ------------------------------------- | --------------------------------------- |
| A. Authentification            | 1, 2, 3                               | #4688 (Q2 décide l'architecture d'auth) |
| B. Réseau                      | 4 (IP), 5 (iFrame, `frame-ancestors`) | #4694, #4696                            |
| C. Écriture et événements      | 6 (`POST /actions`), 7 (webhooks)     | #4692                                   |
| D. Environnement et validation | 8 (sandbox), 9 (checklist)            | #4695                                   |

## Statut des dix points

| #   | Point                                                                                                                                                                         | Statut      | Réponse (date, verbatim)                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Durées de vie access/refresh, refresh tournant ?, effet de `POST /api/oauth2/revoke` sur les deux jetons                                                                      | non vérifié | —                                                                                                                                                                       |
| 2   | OAuth2 accepté sur TOUTES les routes déclarées (dont `POST /actions`, `POST /contacts`, `GET /application/dictionary`) ? sinon lesquelles exigent encore JWT-App              | non vérifié | —                                                                                                                                                                       |
| 3   | Scope couvrant `POST /actions` ; scope couvrant `GET /application/dictionary`                                                                                                 | non vérifié | —                                                                                                                                                                       |
| 4   | Déclaration des IP autorisées (format, nombre, délai) ; IP partagée changeante (Railway) acceptable ou IP dédiée exigée                                                       | non vérifié | —                                                                                                                                                                       |
| 5   | iFrame : URL d'embed, contexte transmis, authentification, origine à autoriser dans `frame-ancestors`                                                                         | en partie   | 02/11/2026 : app de type iFrame unique (Url app/installation/désinstallation, boutons, affichage page, widget, événements) ; restent contexte, auth, `frame-ancestors`. |
| 6   | Corps exact de `POST /actions` sur fiche contact : `dependsOn.type` = `"contact"` ? attributs obligatoires ? (l'exemple de la doc montre `"resource"`)                        | vérifié     | (02/11/2026, instance de test, UI web) réponse 200, contact fictif — corps ci-dessous.                                                                                  |
| 7   | Webhooks : payload, signature, dédoublonnage ; best-effort sans retry, rattrapage par le journal d'activité ?                                                                 | en partie   | 02/11/2026 : la page webhooks existe ; payload, signature, dédoublonnage restent à vérifier.                                                                            |
| 8   | Sandbox : URL, OAuth2 (issuer distinct ? redirect_uri séparée ?), accès Developer space avec notre compte de test ou offre ADVANCED ?                                         | vérifié     | 02/11/2026 : Administration › Configuration avancée › Espace développeur › API / Sandbox (jeton + clé client, `X-Jwt-Client`), quota test 25 000 req/mois.              |
| 9   | Checklist complète de validation Marketplace (sécurité, performance, support, RGPD)                                                                                           | non vérifié | —                                                                                                                                                                       |
| 10  | Le formulaire d'app n'a ni scopes, ni `redirect_uri`, ni IP, ni OAuth2 alors que les métadonnées RFC 8414 existent : où s'enregistre le client OAuth2 d'une app Marketplace ? | non vérifié | —                                                                                                                                                                       |

## Q6 — corps de `POST /actions` (vérifié le 02/11/2026)

```
POST /api/actions
{"data":{"type":"action","attributes":{"typeOf":61,"title":"…","text":"<div>…</div>","location":"","startDate":"2026-11-02T11:00:00.000Z","endDate":"2026-11-02T12:00:00.000Z","startTimezone":"Europe/Paris","endTimezone":"Europe/Paris","synchronizeWithAdvancedAppCalendar":false,"relationType":"parent","guests":[]},"relationships":{"dependsOn":{"data":{"type":"contact","id":"1"}},"mainManager":{"data":{"type":"resource","id":"1"}},"company":{"data":{"type":"company","id":"1"}},"file":{"data":null},"createdBy":{"data":null},"positioning":{"data":null},"delivery":{"data":null}}}}
```

- `dependsOn.type` = `"contact"` ; `text` = HTML (le texte du commercial est échappé, jamais d'HTML brut) ; `typeOf` numérique lu au
  dictionnaire `setting.action.contact` de la connexion (instance de test : 61 Appel abouti, 62 Appel non abouti, 2 Note, 60 Rendez-vous,
  63 Email, 64 Prospection téléphonique, 65 Push CV, 3 Rappel, 10 Présentation client, 11 Suivi de mission) — jamais codé en dur (#4690).
- Pour mémoire : `POST /api/contacts` exige `firstName`, `lastName` et `relationships.company` (422 code 1017 sinon).
- **Réserve** : corps capturé avec l'auth de l'UI web, pas encore rejoué en `X-Jwt-Client` / OAuth2.
- Code : `zero-layer/boond-action-body.ts` (constructeur, test qui fige cette forme), appelé par `AtsWriteService` (`log_call`).

## Gabarit de message (à copier par groupe)

```
Objet : BellumAI — App Marketplace — <groupe> (contrats non documentés)
Méthodologie suivie : lecture de la spec OpenAPI, des métadonnées RFC 8414, des articles développeurs.
Méthode d'authentification choisie : OAuth2 (authorization code) — à confirmer pour les routes visées.
Objectif visé : <…>
Parcours souhaité : <…>
Requête envoyée : <méthode, chemin, en-têtes SANS valeur de secret, corps>
Retour de l'API : <statut, corps>
Documentations consultées : <liens>
Question(s) : <numéros ci-dessus, texte intégral>
```

## Clôture de l'issue

Neuf réponses écrites dans la table ci-dessus avec leur date ; chaque issue dépendante (#4688, #4692, #4694,
#4695, #4696) mise à jour avec la réponse qui la débloque ; ce qui reste sans réponse est nommé « non vérifié »
dans l'issue concernée.
