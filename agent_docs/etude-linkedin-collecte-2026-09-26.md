# Étude — collecte de données LinkedIn compatible avec les contraintes d'accès (#3100)

Source : call bêta Apricot Labs du 24/09/2026 (espace à deux sièges). Voir aussi #2634 (arbitrage
d'origine, fermé le 24/09/2026) et `agent_docs/doctrine.md` § `c79_collecte_large_mais_propre`.

## Le principe qui tranche

Doctrine (#2634.1, 21/09/2026) : « on collecte LARGEMENT, tant que c'est PROPRE ». Le test qui décide
100 % des cas : **la collecte suppose-t-elle de se faire passer pour quelqu'un d'autre** (un navigateur
humain, un utilisateur connecté, un partenaire autorisé) ? Si oui, on ne le fait pas — exclut LinkedIn
par scraping et faux user-agent, quelle que soit l'attractivité du signal.

## Sources possibles, condition d'accès, coût, verdict

| Source                                                                    | Condition d'accès                                                                                        | Coût                                                                                           | Verdict                                                                                                                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scraping du site LinkedIn (posts, annonces, profils)                      | Aucune — contourne l'auth et les CGU                                                                     | Nul en argent, interdit en doctrine                                                            | **Écarté par doctrine** : usurpe un navigateur/utilisateur humain (c79)                                                                               |
| API officielle LinkedIn (Marketing / Talent / Sales Navigator API)        | Accord partenaire LinkedIn, app registration, quota négocié, souvent réservé à des partenaires certifiés | Élevé et incertain (pas de tarif public self-service ; cycle de partenariat de plusieurs mois) | **Non tranché ici** — reste l'objet de #2634, question commerciale/juridique séparée, toujours ouverte                                                |
| Revendeurs de données LinkedIn (scrapers tiers en marque blanche)         | Aucune de notre côté ; le revendeur porte le risque CGU                                                  | Abonnement payant, variable                                                                    | **Écarté par doctrine** : la collecte du revendeur usurpe pour notre compte — on n'agrège pas le risque d'un tiers pour contourner notre propre règle |
| Apporté par l'utilisateur (URL, texte d'un post/annonce collé ou importé) | Aucune côté serveur — le commercial a déjà vu l'information de ses yeux                                  | Nul                                                                                            | **Retenu et livré** (décision coordinateur 24/09/2026, doctrine ligne 31)                                                                             |

## Ce qui est déjà livré (à ne pas recoder)

La quatrième voie est en production sur `main` :

- Contrat : `packages/contracts/src/schemas/doctrine-registry.ts:2359` (entrée du registre).
- Route : `POST /accounts/:id/signals/declare` — `AccountsController.declareSignals`
  (`apps/api/src/modules/accounts/accounts.controller.ts:1761-1770`).
- Service : `AccountsService.declareSignals` (`apps/api/src/modules/accounts/accounts.service.ts:1943`).
- DTO : `apps/api/src/modules/accounts/dto/declare-signals.dto.ts`.
- Écran : onglet Veille d'une fiche compte →
  `apps/web/src/features/accounts/view/account-detail/tabs/veille/DeclareLinkedInSignalDialog.tsx`,
  via `useDeclareSignals` (`apps/web/src/features/accounts/hooks/useDeclareSignals.ts`) et
  `accountsApi.declareSignals` (`apps/web/src/features/accounts/api.ts:558`).
- Migration : `apps/api/src/migrations/1795997906098-AccountDeclaredSignals.ts`.
- Tests : `accounts.service.spec.ts:982` (service), `accounts.controller.spec.ts:255` (contrôleur),
  `DeclareLinkedInSignalDialog.test.tsx` (écran, prouve qu'aucun appel sortant ne vise LinkedIn),
  `demo-declared-linkedin-signal-coverage.spec.ts` (garde de parité démo).
- Le signal porte sa source à l'écran : « LinkedIn (apporté par toi) », jamais le nom nu de la
  plateforme confondu avec une collecte automatisée.
- Démo : `apps/api/src/modules/demo/demo-coverage.ts:1395`.

## Ce qui reste ouvert (hors lot n11)

La voie API officielle sous contrat reste une question commerciale et juridique séparée, non résolue
par cette étude — objet propre de #2634 (fermé comme « le principe est tranché », pas comme « la voie
API est ouverte »). Aucune ligne de code ne doit anticiper un accord de partenariat qui n'existe pas.

## Verdict

Étudié : trois voies écartées par doctrine (scraping direct, API sans accord, revendeur), une voie
retenue et déjà livrée (apporté par l'utilisateur). Rien à coder dans ce lot — la tranche minimale utile
existe déjà et son chemin d'écran est documenté ci-dessus.
