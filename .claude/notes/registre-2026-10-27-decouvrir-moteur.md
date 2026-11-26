# Registre — lot DECOUVRIR-MOTEUR (vague L, 27/10/2026)

| # | Point | État | Preuve en recette (le geste à l'écran) |
| --- | --- | --- | --- |
| #4664.1 | `_evidence()` porte l'`url` de chaque offre (`discover_skill_offers.py`) | livré | `test_4664_offres_du_compte.py` ; `/discover` + compétence, tiroir « Aperçu du compte » : chaque intitulé ouvre son annonce |
| #4664.2 | Contrat : `offers` déclaré (`discover-skill-evidence.ts`) | livré | `SkillSearch.test.tsx` (le détail traverse zod) |
| #4664.3 | Tiroir : détail des offres, 10 au plus, total vrai au-delà | livré | `SkillEvidenceOffers` sous la ligne de preuve ; `offerCount > 10` → « Les 10 plus récentes sur N offres » |
| #4664.4 | Démo : plusieurs offres par compte, classée | livré | `demo-discover-skill-coverage.spec.ts` ; recherche « SAP » en démo, tiroir du 1er compte : 3 offres liées |
| #4663.1 | La ligne « N offres <compétence> · la plus récente » SUR la carte | livré | APPELANT : `CandidateRow.tsx` (carte, colonne gauche) + tiroir ; `CandidateRow.skillEvidence.test.tsx` |
| #4626.1 | Entrepreneur individuel affirmé par le registre → écarté à la collecte | livré | `recherche_entreprises._list_row` porte `individualEntrepreneur` (complements) ; `account_qualification` exclut ; `test_4626_entrepreneur_individuel_collecte.py` |
| #4626.2 | Rattrapage des listes déjà collectées | livré | `_LIST_PROJECTION_VERSION` dans la clé du cache de listes : aucune liste d'avant ne se ressert |
| #4626.3 | Personne SANS preuve du registre | écarté | aucune devinette sur la forme du nom (régression « restauration » 9/12) : la ligne reste, marque `person_like_name` seulement si tranche connue < 50 |
| #4579.1-4 | Déclinaison des compétences (vue → vue.js, vuejs, vue 3) | déjà là | `harvest_skill_offers` → `skill_written_forms` (`criteria_referential.py:89`), appelant `discover_skill_offers.py` boucle `for term in skills` ; `test_declinaison_competence_4579.py` (porte `POST /discover/registry`) |
| #4579.5 | L'écran dit ce qu'il a cherché | reformulé | IA + contrat livrés : `query.skillSearch.searched` (`searched_forms`, un seul endroit) ; rendu de la puce = écran hors périmètre → reste |
| #4519.1 | Expertise → métiers, jamais libellé littéral | déjà là | `harvest_terms` appelé `routers/discover.py:2199` et `job_offers_search.py:220` ; `test_decouvrir_expertise_4519_moteur.py` |
| #4519.2 | Palier atteint / où tombent les candidats | déjà là | dit à l'écran ; entonnoir `skillSearch.sources/coverage/silentFilters` ; `searched` nomme maintenant les métiers réellement cherchés. La mesure prod (3 → dizaines) exige les clés de production : NON mesurée ici |
| #4469.1 | Compétence cherchée dans le métier de l'offre, jamais le lieu | déjà là | `discover_skill_offers.py:736-740` (`termChecked` ne dispense plus), `test_competence_lieu_4469*.py` |
| #4469.2 | La ZONE ne se déduit jamais d'un mot de la compétence | livré | garde : `test_4469_zone_jamais_deduite_de_la_competence.py` : service de communes qui répond « Saint-Cloud » à « cloud », la porte réelle ne pose aucune zone ; « à Lille » en pose bien une (sait dire NON) |
