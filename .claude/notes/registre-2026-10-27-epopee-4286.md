# Registre — épopée #4286 (lot L-EPOPEE-4286, 27/10/2026)

| Point | État | Verdict | Appelant (fichier:ligne) | Preuve en recette |
| --- | --- | --- | --- | --- |
| #4286.1 DECP | livré | ORPHELIN côté veille → branché | `tabs/TabSignal.tsx` (extraSignals ← `awardSignalsForWatch`) ; carte déjà câblée `CompanyPublicDataSection.tsx:932`, flux API `accounts.service.ts:1928` | Fiche Thales > Veille : lignes « Marché attribué — … » datées, source « Marchés publics attribués » |
| #4286.2 Malt/Free-Work | reformulé | — | — | accord de données écrit, Louis seul (c79) |
| #4286.3 critères d'ensemble | livré | donnée | — | balayage /discover (3 signaux datés/compte) : mesure de couverture, pas de câblage manquant |
| #4286.4 « Ce que Bellum ajoute » | livré | câblé | `TabOverview.tsx:543`, `AccountDetailTabContent.tsx:508` (libellé `{{brand}}`, d'où le grep littéral vide) | Fiche d'un compte connu du CRM > Synthèse |
| #4286.5 rejeu signaux | reformulé | câblé | `admin-segment-catchup.controller.ts` (`signals/preview`, `signals`) ; epoch `#4437.5` couvre requester | geste opérateur ciblé |
| #4286.6 Affaires passées | livré | câblé | `AccountOpportunityScreen.tsx:211` (sous-vue Historique), `TabSignal` via `AccountHistoryFactsSection` | Opportunités > Historique ; sinon « Aucune affaire du CRM rattachée » (donnée de lien compte↔CRM) |
| #4286.7 rejeu deals | reformulé | idem .5 | — | — |
| #4286.8 Effectif observé | livré | câblé | collecte `watchlist-refresh.worker.ts:228` → `legalNotices.ts:63` → `CompanyPublicDataSection.tsx:160` | après ≥ 2 passages Sirene |
| #4286.9 RNE | livré | câblé | `ia.client.ts:2079` ← `public-registry-watch.ts:253` ← worker `collectRne` | clé INPI posée (non vérifiable ici) |
| #4286.10 | reformulé | — | RNE fait foi | — |
| #4286.11/.12 demandeur | livré | câblé | `SignalCard.tsx:240`, `WhyNowItemList.tsx:102`, `accounts.service.ts:616` ; `/mes-cibles` redirige vers `/signals` (`routes/mes-cibles/index.tsx`) | Signaux > carte d'offre « rattaché au… » |
| #4286.13 postes (#4272) | écarté | absent | — | aucun fournisseur sous contrat (doctrine.md:31) |
| #4286.14 2e source (#4273) | écarté | absent | — | idem : contrat d'API non vérifiable ne se devine pas |
| #4286.15 base commune (#4268) | écarté | — | — | « rien ne se code avant arbitrage » |
