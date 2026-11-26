"""#2443.11 (#2899) — LE TABLEAU DE PILOTAGE DU CHAT, un RAPPORT généré par script.

Décision Louis 27/09/2026 : « le tableau de pilotage est un rapport généré
par script à partir des résultats d'éval. Pas un nouvel écran produit. »

Point d'entrée réel : ``python -m tests.chat_dashboard_report`` (voir ce
module) — CE fichier ne fait que le RENDU, pur, sans jamais lire `CORPUS` :
GA-193 (`tests/test_dependency_declaration_guard.py`) refuse tout import de
`tests/` (où vit `CORPUS`, décision #1948) depuis `app/**`, même local et
tardif. `tests/chat_dashboard_report.py` calcule les métriques et appelle
`render_markdown` ici.

─────────────────────────────────────────────────────────────────────────────
CE QUI EST MESURÉ AUJOURD'HUI, ET CE QUI NE L'EST PAS — NOMMÉ, JAMAIS À ZÉRO
─────────────────────────────────────────────────────────────────────────────
#2443 demande neuf axes par version : réussite globale, P0, secteur, persona,
outil, coût, latence, corrections, échecs. Ce rapport en calcule QUATRE
hermétiquement depuis le corpus versionné (P0/rôles clés, hard failures
nommés, persona, outil) — les cinq autres dépendent de données que ce dépôt
ne porte pas encore (un run LIVE contre le vrai modèle pour réussite/coût/
latence/échecs, un champ « secteur » absent du schéma de scénario, et un
corpus de corrections vide — `SOURCE_SPECS`, #2443.2). Doctrine : « un score
n'est jamais nu, et ce qui n'a pas pu être évalué est nommé » — jamais un
axe manquant affiché à 0, jamais deviné.

#2443.11 demande aussi un pilotage PAR VERSION (comparer une version de
prompt/modèle/mémoire à une autre) : aucun run d'éval n'est persisté avec un
identifiant de version nulle part dans ce dépôt, donc cette comparaison n'est
pas calculable aujourd'hui — nommée ci-dessous, jamais un delta inventé.
"""

from __future__ import annotations

from app.eval.chat_commercial_measures import MEASURE_SPECS
from app.eval.chat_prod_samples import ProdSampleReport

#: Les six axes de #2443/#2443.11 que ce rapport ne calcule PAS aujourd'hui,
#: avec la raison — jamais un silence, jamais un 0 (doctrine).
NOT_YET_MEASURED: dict[str, str] = {
    "réussite globale": "nécessite un run LIVE contre le vrai modèle (payant, hors CI) — non exécuté par ce script",
    "coût": "même raison que « réussite globale » — un coût réel se mesure sur un run LIVE, jamais estimé",
    "latence": "même raison que « réussite globale » — une latence réelle se mesure sur un run LIVE, jamais estimée",
    "échecs": "même raison que « réussite globale » — un échec se constate sur une RÉPONSE, ce rapport ne rejoue rien",
    "secteur": "`Meta` (schéma de scénario, #1948) ne porte pas de champ secteur aujourd'hui — l'inventer serait deviné",
    "corrections": (
        "dépend des sources EXPORTS_CONVERSATIONNELS/CORRECTIONS du corpus multi-source (#2443.2) — "
        "vides à ce jour (`SOURCE_SPECS`), rien à agréger"
    ),
    "comparaison entre versions": (
        "aucun run d'éval n'est persisté avec un identifiant de version — rien à comparer à ce jour, "
        "jamais un delta inventé"
    ),
}


def _prod_samples_section(report: ProdSampleReport) -> list[str]:
    """#2899 / #2443.10 — les demandes que les espaces ayant coché ont versées, ANONYMISÉES.
    Pont éteint = « non mesuré », jamais « 0 » (GA-18 / GA-19)."""
    lines = ["## Demandes de production anonymisées (#2443.10, opt-in par espace)", ""]
    if not report.measured:
        lines.append("- **non mesuré** : le pont interne vers l'API n'est pas branché ou n'a pas répondu.")
    elif not report.samples:
        lines.append("- Aucun espace n'a encore versé de demande (l'échantillonnage est éteint par défaut).")
    else:
        lines.append(f"- **{len(report.samples)}** demandes relues, texte seul (ni espace ni personne).")
        lines.append(
            f"- **{report.not_anonymous}** ne passe pas la seconde lecture (e-mail, téléphone, lien, SIREN, IBAN)."
        )
    lines.append("")
    return lines


def render_markdown(metrics: dict) -> str:
    lines: list[str] = []
    lines.append("# Tableau de pilotage — plateforme d'évaluation conversationnelle de Laura")
    lines.append("")
    lines.append(f"Version du registre de prompts : `{metrics['version']}`")
    lines.append(f"Cas du corpus : **{metrics['total_cases']}**")
    lines.append("")

    lines.append("## P0 — rôles clés (doctrine c77)")
    lines.append("")
    lines.append("| Rôle | Cas | dont hard failure nommé |")
    lines.append("| --- | --- | --- |")
    for role, stats in metrics["key_role_coverage"].items():
        lines.append(f"| {role} | {stats['cases']} | {stats['cases_with_named_hard_failure']} |")
    lines.append("")

    lines.append("## Hard failures nommés (seize valeurs, #2443.6)")
    lines.append("")
    lines.append("| Hard failure | Cas |")
    lines.append("| --- | --- |")
    for failure, count in metrics["hard_failure_coverage"].items():
        lines.append(f"| {failure} | {count} |")
    lines.append("")

    lines.append("## Persona (les cinq familles, #1920)")
    lines.append("")
    lines.append("| Persona | Cas |")
    lines.append("| --- | --- |")
    for persona, count in metrics["persona_counts"].items():
        lines.append(f"| {persona} | {count} |")
    lines.append("")

    lines.append("## Outil")
    lines.append("")
    lines.append("| Outil | Cas |")
    lines.append("| --- | --- |")
    for outil, count in sorted(metrics["outil_counts"].items(), key=lambda kv: (-kv[1], kv[0])):
        lines.append(f"| {outil} | {count} |")
    lines.append("")

    prod_samples = metrics.get("prod_samples")
    if isinstance(prod_samples, ProdSampleReport):
        lines.extend(_prod_samples_section(prod_samples))

    lines.append("## Non mesuré aujourd'hui — nommé, jamais à zéro")
    lines.append("")
    for axe, raison in NOT_YET_MEASURED.items():
        lines.append(f"- **{axe}** : {raison}")
    lines.append("")

    lines.append("## Mesures d'intelligence commerciale (LAU-FINAL-203, #3197)")
    lines.append("")
    lines.append("| Mesure | Calculable aujourd'hui | Raison si non |")
    lines.append("| --- | --- | --- |")
    for measure, spec in MEASURE_SPECS.items():
        statut = "oui" if spec.computable_today else "non"
        raison = "—" if spec.computable_today else spec.reason
        lines.append(f"| {spec.label.fr} (`{measure.value}`) | {statut} | {raison} |")
    lines.append("")

    return "\n".join(lines)
