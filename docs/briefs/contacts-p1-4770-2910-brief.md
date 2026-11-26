# Lot 84 — Contacts · P1 (#4770, #4799)

Périmètre : apps/web/src/i18n/locales/fr/contacts.json, apps/web/src/i18n/locales/en/contacts.json, apps/web/src/features/contacts/**, docs/briefs/**

## #4770 — la bascule « Tous »

Diagnostic : « 69 773 » est le vrai total de l'espace (contacts collectés par les analyses, ex. 41 304 déjà cité
dans #3942.2) ; le périmètre d'espace est bien appliqué. L'écart avec « Mon CRM » (1 010) est un sous-ensemble.
Le défaut est le MOT « Tous » qui laisse croire à une possession. Correctif : le segment nomme ce qu'il compte —
« Tous collectés » / « Tous collectés dans la vue » (garde #4581, #4661, #4503.4, #3942.1, #4565, #4597 ; aucune logique changée).
Test : ContactsRecommendedToggle.test.tsx (cas #4770 : 69773 sous « collectés », jamais sous « Tous »).

## #4799 — NON LIVRÉ (arbitrage Louis)

Le corps de l'issue l'écrit : choisir la source de changements de poste est un arbitrage produit, pas un constat de code.
QUESTION : quelle source ; fraîcheur toujours affichée ou au-delà d'un seuil ; sort du poste périmé.

## Ne fait pas

Aucune migration, aucun changement d'API, aucune fermeture d'issue.
