# Rapport — DECLINAISON-COMPETENCE (#4579 + #4563)

Branche `claude/declinaison-competence-4579-2610` (00f1853e référentiel, 97be4dcd moisson). Pas de PR.

- **Rouge avant correction** : `tests/test_declinaison_competence_4579.py`, par `POST /discover/registry` (« dev vue et java à lille »). Sources interrogées sur `vue`/`java` seulement ; l'offre « Vue.js » jamais lue (offerCount 1 au lieu de 2) ; plafond et référentiel rouges aussi.
- **Référentiel (un seul endroit, GA-26)** : `SKILL_WRITTEN_FORMS` dans `packages/contracts/src/schemas/criteria-referential.ts`, miroir `criteria_referential.json` régénéré, lu par `skill_written_forms()` (`criteria_referential.py`, même normalisation). vue ⇒ vue.js/vuejs/vue 3 ; java ⇒ java 17/j2ee/jee ; +17 technos ESN (react, angular, node, .net, python, k8s…).
- **Plafond** : `skill_terms` (SKILL_MAX_TERMS=2) borne les compétences demandées AVANT ; les écritures sont ajoutées dans la moisson, donc « vue » ne prend rien à « java ».
- **Dédoublonnage** : clé unique `_offer_key` (lien, sinon employeur|intitulé|date) ; l'offre garde la compétence TAPÉE (`skill: "vue"`) ; compteur `received` sans doublon. Une offre trouvée par « j2ee » est lue comme « java » (`written` dans `_reject_reason`).
- **Coût** : chaque écriture = ses propres lectures, donc passe par les caches existants (FT 24 h, cache commun) ; appels comptés à l'achat. `HARVEST_KEY_VERSION` k3→k4 (une récolte k3 n'a pas les écritures).
- **Effet** : sur sources simulées seulement (pas de clé ici) — « vue » : 1 → 4 lectures par source/département, « java » : 1 → 4. Le gain réel en offres reste à MESURER en prod (4 lectures de plus par compétence et département).
- **Inconnue / écosystème** : compétence hors référentiel ou saisie à deux mots (« vue java ») = telle quelle ; ni Nuxt ni React (garde TS + Python).
- **Tests** : vitest criteria-referential (26 verts) ; pytest 7 fichiers liés verts. 4 tests existants figeaient « java = 1 appel » : isolés (`skill_written_forms` neutralisé / kafka). `test_discover_fresh_jobs_4430` : 2 rouges déjà sur main, hors périmètre.
- **Non fait** : puce d'écran « vue java » (point 5 de #4579 — aucun écran touché, craft rule 9 non déclenchée) ; #4563 (outil de Laura qui rend des offres) : hors brief. À vérifier : la puce envoie peut-être UN mot-clé « vue java » (chaîne), que `skill_terms` ne découpe pas — non prouvé côté API/NestJS ; recommandation : découper à l'entrée.
