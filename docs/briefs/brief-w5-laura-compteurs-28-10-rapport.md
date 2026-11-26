# Rapport W5 — branche `claude/laura-compteurs-28-10` (e3e6dfbb, c2d793b9, 32cd05b8, db7aa386)

**#4288.4** — `apps/ia/app/services/record_listing.py:1371` (+ `:813` repli Bellum marqué `complete=False`). Test qui sait dire NON : `test_4288_forced_record_listings.py::test_a_bounded_read_never_concludes_none` (3 lus sur 23 ⇒ « Non mesuré », jamais « aucune ») ; `test_a_complete_empty_read_still_says_none` garde la vraie absence.
⚠️ Cause probable non corrigée à la racine : sans CRM, le repli lit les BESOINS (3), pas les affaires du pipe (table `opportunities`, 23 lignes dont PREVOIR / SNCF RESEAU perdues). Aucune lecture API des affaires perdues du pipe n'existe : à créer (route pont + `_fetch_bellum_lost_deals`). Ici : la limite est dite, jamais une conclusion négative.

**#4323.1** — `CompetitivePositioningCard.tsx:73` + `PresentEsnList.tsx` / `BriefFold.tsx` (prop `detail`) + i18n `accountDetail.json`. Les deux chiffres mesurent deux populations (ESN présentes vs concurrents analysés pour notre angle) : chacun le dit, le compteur replié porte sa ventilation par preuve. Tests : `CompetitivePositioningCard.test.tsx` « le compteur nomme sa population… », `PresentEsnList.test.tsx` « jamais nu ».

**#4408.1** — `chat_tools.py:15557` `_widen_department_to_region` (appel avant `candidates = …`), `_size_line` (:15864), `_widening_proposal` (:15888, la phrase « au-delà du dernier palier : dis-le » était la source de « palier non lancé »). Plafond région, aucune requête France. Tests : `test_4408_1_laura_elargit_jusqu_a_la_region.py` (3 cas, dont l'arrêt à la région et « rien ne s'élargit au-dessus du seuil »). Jumeaux corrigés : trois textes d'outil/orchestrateur disaient encore « puis la France » (contraire à c144). Non couvert : ville → paliers déjà faits par le registre ; département+région explicite non élargis.

**#4294.5** — `CadrageColumn.tsx` (`themesLine`, `data-testid="cadrage-themes"`). Le calcul existait et était affiché, mais enfermé dans le repli « Personnalisation » et jamais nommé « thème » (libellé « Priorités de vente »). Test : `CadrageColumn.test.tsx` « sait dire NON… » (écrit après le code, pas rouge d'abord). Rien semé en démo (aucun `demo-dataset.ts` touché).

Non fait / à noter : tests ciblés seulement (pytest ia 5 fichiers, vitest web 5 fichiers, `tsc` web propre) ; `packages/contracts` construit localement pour vitest (dist non commité).
