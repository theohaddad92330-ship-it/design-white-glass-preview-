# Lot 80 — Découvrir · P0 (#4712, #4793, #4663)

Périmètre : apps/ia/app/services/discover_skill_offers.py, apps/ia/app/services/research/homonym.py, apps/ia/app/services/homonym_disambiguation.py, apps/ia/app/services/data_sources/recherche_entreprises.py, apps/web/src/features/discover/view/SkillSearch.tsx, apps/web/src/i18n/locales/fr/discoverSkill.json, apps/web/src/i18n/locales/en/discoverSkill.json, apps/api/src/modules/demo/demo-discover-skill.ts, apps/api/src/modules/demo/demo-coverage.ts

## Antériorité

- **#4663** — DÉJÀ LIVRÉ sur `origin/main` : `CandidateRow.tsx:358` rend `SkillEvidenceLine` sur la carte (et `:471` dans le tiroir), test `CandidateRow.skillEvidence.test.tsx` (« tiroir fermé »), démo `demo-discover-skill.ts` sème `skillEvidence`. Rien recodé ; clos par preuve.
- **#4793** — BLOQUÉ : « Dépend de : le lot lecteur commun », absent de `main` (aucune lecture de base dans `discover_signals.py`). Question à Louis, aucun code.
- **#4712** — prolonge #4674 (qui a fait SORTIR ces employeurs), s'appuie sur #4419.3 (départage par le département) et #4617 (le registre refuse en 429, cause de `pending`).

## Ce qui change (#4712)

1. Le lieu part à la RECHERCHE : `search_companies(department=…)` pose `departement` (le registre filtre par établissement) ; le candidat porte `siteEstablishments` (établissements ACTIFS sur place, absent si aucun lieu demandé — jamais un « 0 » d'ignorance).
2. L'établissement sur place tranche l'homonymie (`_site_tiebreak`) : un seul sur place gagne ; plusieurs → pas de SIREN, motif FINAL `homonym_on_site`.
3. Le suffixe de programme se retire (`employer_registry_name`) : « Mantu Manager Program » → « Mantu » ; sans entité, motif FINAL `brand_or_program`.
4. L'écran nomme ces motifs (`pending.reason.*`) et le titre ne promet plus « identité en cours » (garde #4674 : aucun SIREN deviné, aucune action sans SIREN).

## Décisions touchées, nommées

Garde #4515 (lieu de travail de l'offre, texte de couverture démo), garde #4664 et #4683 (idem : seule la phrase de couverture
du bloc COMPETENCE-TROUVE est prolongée), garde #4565 (`resolve_company_identity` gagne un paramètre optionnel, défaut inchangé),
garde #4657 (cache d'identité : un homonyme tranché par le lieu n'est toujours pas rangé).

## Ce que le lot DÉFAIT

- Le titre « … identité en cours » de la section (#4674) devient « … sans SIREN » : l'attente n'existe que pour l'état `pending`.
- `identityReason: 'homonym'` de la démo (#4674) devient `homonym_on_site`.

## Ce que le lot ne fait PAS

- Point 4 (Amaris Consulting en cible) : `intermediary_kind` dépend du référentiel ESN/NAF ; non vérifiable sans donnée réelle → question.
- Mesure « avant/après » sur Bordeaux + cybersécurité : exige la prod ; à faire à la recette.
- Tranche à la COMMUNE : seul le département est porté par l'offre ici.
- « Société hors France » (#4713), reprise différée des non-résolus.
- Pas de nouveau champ de contrat : `identity` garde `pending|ambiguous|unmatched`, le motif voyage dans `identityReason`.
