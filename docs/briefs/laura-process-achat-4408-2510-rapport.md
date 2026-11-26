# Rapport LAURA-PROCESS-ACHAT-4408 (#4408)

Branche `claude/laura-process-achat-4408-2510` (base origin/main, pas de PR).

- **Rouge AVANT correction** (`tests/test_4408_petite_structure_bout_en_bout.py`, phrase de la recette via `set_turn_thread`, SANS paramètre) : 3 failed — `KeyError: 'heavy_purchasing_excluded'` (l'ETI et le compte à 3 000 salariés restaient dans la liste), `heavy_purchasing_reason(tranche 250-499) is None`, `KeyError`/ligne de palier absente.
- Nuance au brief : `test_4408_contrainte_lue_en_code.py` existe déjà sur main et garde phrase → paramètre pour des GE ; il ne couvrait ni l'ETI ni le palier.
- Défaut 2 : `purchasing_process_filter.py` — ETI (catégorie ETI, tranche ≥ 250 ou effectif exact ≥ 250) écartée, raison « ETI — process d'achat structuré ». GE / ≥ 5 000 gardent leur raison propre. Sans donnée de taille : le compte RESTE, « non vérifié » inchangé. Pas de dérogation pour les 250-999.
- Défaut 3 : `app/prompts/laura_acts.py` `widening_line_from_output` rend « N comptes ; élargi à <palier> » en CODE (N = liste rendue), posé en tête par `ensure_widening_line` ; jamais de demande de permission.
- Tests : 51 + 48 passed (4408 ×4, r22 palier, 4421, 4434, purchasing).
- Arbitrage pris seul : le palier est rendu quand un compte porte `widened` (axes compétence/secteur/taille) ; le process d'achat n'est pas un axe d'élargissement, donc aucune phrase de palier inventée quand rien n'a été élargi (4 comptes sans cible de la recette : pas de palier à annoncer).
- Démo (règle n°9) : aucun écran changé, chat seulement ; rien semé.
