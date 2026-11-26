# Recette des connecteurs — 16/08/2026, en production

Testé **en vrai**, sur le compte de production de Louis, appel par appel : chaque
ligne ci-dessous a une preuve (réponse d'API ou log Railway), pas une lecture de
code. C'est la « matrice connecteurs » demandée par la to-do d'août —
`connexion / lecture / écriture / testé`.

Une règle a guidé la lecture : **« je n'ai rien trouvé » et « je n'ai pas le
droit de regarder » ne se disent pas de la même façon.** Les deux défauts
trouvés ce jour-là étaient exactement ça.

## Matrice

| Connecteur                      | Connecté              | Lecture vérifiée                                        | Écriture                                         | Preuve                                                |
| ------------------------------- | --------------------- | ------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| Google — Agenda                 | oui                   | ✅ 10 agendas, 3 rendez-vous                            | non testée (créerait un évènement chez un tiers) | `GET /agenda/calendars`, `GET /agenda/events`         |
| Google — Gmail                  | oui                   | ✅ 10 fils sans réponse                                 | non testée (enverrait un message réel)           | bloc messagerie de « Ma journée »                     |
| Google — Drive                  | oui                   | ✅ 20 fichiers, recherche par CONTENU                   | n/a                                              | `GET /google/drive/files`, `/google/drive/search`     |
| Google — Sheets                 | oui (portée accordée) | n/a                                                     | non testée                                       | `GET /google/status`                                  |
| Microsoft — Agenda              | oui                   | ✅ 1 agenda                                             | non testée                                       | `GET /agenda/calendars` (entrée `microsoft:Calendar`) |
| Microsoft — Documents           | oui                   | ⚠️ **0 résultat sans explication**                      | n/a                                              | `GET /microsoft/files/search`                         |
| HubSpot                         | oui                   | ❌ **500** sur contacts dormants ET rapport de pipeline | export contact non testé                         | logs Railway (voir ci-dessous)                        |
| Notion                          | oui                   | ✅ 23 pages                                             | n/a                                              | `GET /notion/pages`                                   |
| BoondManager (ATS)              | non                   | —                                                       | —                                                | `GET /ats/status` → `connected:false`                 |
| Téléphonie (Aircall / Ringover) | non                   | —                                                       | —                                                | `GET /telephony/status`                               |
| Signature / facturation         | non                   | —                                                       | —                                                | `GET /admin-docs/status`                              |
| Enrichissement (cascade)        | n/a                   | ✅ e-mail vérifié + LinkedIn + photo                    | 1 crédit débité (conforme)                       | `POST /contacts/:id/enrich` sur un contact réel       |
| Lien de démonstration           | n/a                   | ✅ session ouverte, salle `demo7` louée                 | n/a                                              | `POST /demo/session` sans authentification            |

## Les trois défauts trouvés, et ce qu'ils ont en commun

### 1. L'agenda était vide alors qu'il était plein (réparé)

`GET /agenda/events` rendait un 500. Le log Railway donnait la cause en clair :

```
Google Calendar API has not been used in project 240781671020 before or it is disabled.
```

L'API Calendar n'avait **jamais** été activée sur le projet Google Cloud
(`bellum-502706`). Le compte était pourtant connecté, les portées accordées, et
`/agenda/status` répondait `read: true`. Activée depuis, dans la console : les
dix agendas remontent.

### 2. Le CRM répondait « erreur interne » pour une portée manquante (corrigé, PR #936)

```
GET /crm/pipeline/report → 500
HubSpot read deals failed: This app hasn't been granted all required scopes
```

Le portail avait été branché **avant** que `crm.objects.deals.read` et
`companies.read` soient demandés. Un jeton OAuth ne gagne jamais une portée
après coup : il faut reconnecter. Rien ne le disait.

⚠️ **Action opérateur restante** : les portées doivent être déclarées dans l'app
HubSpot (portail développeur) avant qu'une reconnexion serve à quelque chose.
Ajouter une portée à `HUBSPOT_SCOPES` sans l'avoir déclarée fait échouer l'écran
de consentement entier.

### 3. La recherche documentaire rendait une liste vide (corrigé, PR #936)

`GET /microsoft/files/search` rendait `[]` quand la portée `Files.Read.All`
manquait — indiscernable de « tu n'as aucun document ». C'est le pire des trois :
une erreur se remarque, une liste vide se croit.

### Ce qu'ils ont en commun

Dans les trois cas, **le statut disait « connecté » et la donnée ne venait pas**.
La correction n'est donc pas un correctif par connecteur mais une règle :
`/crm/status` et `/microsoft/status` rendent désormais leurs capacités RÉELLES,
dérivées des portées accordées (comme Google le faisait déjà), l'écran
Intégrations les affiche ligne par ligne, et un refus de portée devient un 503
qui nomme le geste à faire.

## Pièges rencontrés pendant la recette (à ne pas re-perdre)

- **Un état de panne mis en cache survit à sa réparation.** Après l'activation de
  l'API Calendar, l'écran affichait toujours « un de tes agendas n'a pas
  répondu », y compris après rechargement complet : la réponse d'avant était
  persistée dans IndexedDB (`bellum-web-cache`). Pour vérifier une réparation en
  production : `indexedDB.deleteDatabase('bellum-web-cache')` puis recharger.
- **`GET /version` dit exactement ce qui tourne** (commit de l'API et du service
  IA). C'est la réponse à « quelle version est en production ? » — inutile de
  déduire depuis les déploiements Railway.
- **Le 202 de l'enrichissement n'est pas un succès.** `POST /contacts/:id/enrich`
  met en file ; c'est `GET /contacts/:id/enrichment` qui dit `done` et rend le
  résultat. Un test qui s'arrête au 202 ne prouve rien.

## Ce qui reste à faire côté opérateur

1. **HubSpot** — déclarer les portées manquantes dans l'app, puis reconnecter
   depuis Réglages › Intégrations. Sans ça, rapport de pipeline et contacts
   dormants restent éteints (l'écran le dit maintenant).
2. **Microsoft** — reconnecter pour accorder `Files.Read.All` si l'espace
   documentaire doit servir.
3. **BoondManager, téléphonie, signature, facturation** — jamais branchés sur cet
   espace : ce ne sont pas des pannes, ce sont des connecteurs en attente
   d'identifiants.
