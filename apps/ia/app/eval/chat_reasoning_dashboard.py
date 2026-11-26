"""#3198 (épopée #3223) — LE TABLEAU DE PILOTAGE DU RAISONNEMENT COMMERCIAL,
un rapport généré par script, MÊME forme que `chat_dashboard.py` (#2443.11).

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
#3198 demande douze TAUX sur le trafic réel (source route utilisée, taux
réponses public-only, taux Market Memory, taux contre-conseil, taux
alternatives, taux corrections, taux rerun après correction, taux
recommandations génériques, outils ignorés, tours interrompus par budget,
comptes les plus contestés, secteurs les moins fiables) et huit ALERTES qui
en dérivent (source interne jamais utilisée, hausse des réponses génériques,
Market Memory non citée, correction sans changement, NO_GO sans
alternatives, GO sur grands comptes sans accès, réponses après budget
épuisé, absence de DataForge).

Mise à jour 02/10/2026 (#3223.1-.5) : une partie des vingt N'A PAS besoin du
pipeline d'échantillonnage production (#2443.10, devenu un opt-in par espace côté API, #2899 — voir
`chat_prod_sampling.py`) — elle se lit sur des FAITS DE PRODUIT que chaque tour persiste
déjà (`knowledge_receipt`, `turn_observability`, et `reasoning_trace`, posée
par `routers/chat.py`), agrégés côté API (`reasoning-quality.ts`,
`GET /internal/analytics/reasoning-quality`, écran `/produit/raisonnement` du
back-office) : ces neuf métriques et ces quatre alertes sont listées dans
`COMPUTED_ON_REAL_TRAFFIC`, avec OÙ elles se lisent. Elles ne sont PAS
recalculées ici (GA-26 : une dérivation vit à un seul endroit).

Les douze et huit restants portent un JUGEMENT commercial du tour (contre-
conseil, alternatives, correction, générique) que la trace persistée ne porte
pas encore : ils restent NOMMÉS, avec leur raison — les calculer fabriquerait
une donnée fictive (CLAUDE.md : « JAMAIS de données fictives »). Même principe
que `chat_dashboard.py:NOT_YET_MEASURED` : « un score n'est jamais nu, ce qui
n'a pas pu être évalué est nommé », jamais un silence, jamais un zéro.

Mise à jour 11/10/2026 (décision Louis, #3223) : le taux de recommandations
génériques et l'alerte « hausse des réponses génériques » se lisent sur un
DÉTECTEUR ÉVALUÉ (`generic_recommendation_judge.py` — juge IA, jeu étiqueté,
taux d'accord, seuil écrit) ; les comptes et secteurs les plus contestés, en
agrégé sur au moins trois espaces seulement (c64, c92). Les quatre passent
dans `COMPUTED_ON_REAL_TRAFFIC`.
"""

from __future__ import annotations

_JUDGMENT_REASON = (
    "jugement commercial du tour — la trace persistée (`reasoning_trace`) ne porte que le diagnostic "
    "(routage, sources, outils, vérificateur), pas ce champ de jugement ; l'échantillonnage de "
    "conversations (#2899 : opt-in par espace, aucun lecteur ne les rejoue encore) n'invente rien"
)

_API = "calculé côté API (`GET /internal/analytics/reasoning-quality`, écran `/produit/raisonnement`)"

#: Ce qui se lit DÉJÀ sur le trafic réel — et où. Jamais recalculé ici.
COMPUTED_ON_REAL_TRAFFIC: dict[str, str] = {
    "source route utilisée": f"{_API} — part des tours par couche du reçu de connaissance",
    "taux de réponses public-only": f"{_API}",
    "taux d'usage Market Memory": f"{_API}",
    "outils ignorés malgré disponibilité": f"{_API} — outils de la route d'intention, aucun appelé",
    "tours interrompus par budget": f"{_API}",
    "taux de corrections utilisateur": f"{_API} — part des tours où une correction a été reconnue (`reasoning_trace.correction_recognized`)",
    "taux de rerun après correction": f"{_API} — part des corrections suivies d'un rappel d'un outil invalidé (`correction_rerun`, absent sans invalidation nommée)",
    "taux de contre-conseil": f"{_API} — lu comme la part des verdicts de compte défavorables (WATCH, après preuve, NO_GO)",
    "taux d'alternatives": f"{_API} — part des verdicts défavorables où l'outil d'alternatives a été appelé",
    "taux élevé de NO_GO sans alternatives": f"{_API}, alerte sur 3 jours (`ObservabilityAlertsService`)",
    "source interne jamais utilisée sur plusieurs jours": f"{_API}, alerte sur 3 jours (`ObservabilityAlertsService`)",
    "réponses finales après budget épuisé": f"{_API}, alerte sur 3 jours (`ObservabilityAlertsService`)",
    "absence systématique de DataForge": f"{_API}, alerte sur 3 jours (`ObservabilityAlertsService`)",
    # #3223 (décision Louis 11/10/2026) — un DÉTECTEUR ÉVALUÉ, pas une heuristique.
    "taux de recommandations génériques": (
        f"{_API} — verdicts du juge IA évalué (`generic_recommendation_judge.py`) sur un échantillon quotidien "
        "borné ; « non fiable » tant que son taux d'accord avec le jeu étiqueté n'atteint pas le seuil écrit"
    ),
    "hausse des réponses génériques": f"{_API}, alerte sur 3 jours (`ObservabilityAlertsService`), muette tant que le juge est non fiable",
    "comptes les plus contestés": (
        f"{_API} — part des tours corrigés par taille de compte, uniquement en agrégé sur au moins trois espaces "
        "(c64, c92 : jamais un nom de compte ni d'espace)"
    ),
    "secteurs les moins fiables": (
        f"{_API} — part des tours corrigés par secteur, uniquement en agrégé sur au moins trois espaces (c64, c92)"
    ),
}

#: Les métriques du DASHBOARD INTERNE de #3198 encore non mesurées, avec leur
#: raison. Vide depuis le 11/10/2026 : les douze se lisent côté API.
DASHBOARD_METRICS_NOT_YET_MEASURED: dict[str, str] = {}

#: Les huit ALERTES de #3198 — distinctes des cinq alertes sécurité/opérations
#: de #2879 (`observability-alerts.ts` : authorization_denied, abnormal_refund,
#: hallucination_rate, error_rate, latency ; #3198 couvre la QUALITÉ du
#: raisonnement commercial, pas la sécurité/les opérations). Même patron
#: (cron + seuil + dispatch, `ObservabilityAlertsService`), mais chaque
#: condition suppose sa PROPRE donnée de trafic réel — même pipeline absent.
ALERTS_NOT_YET_MEASURED: dict[str, str] = {
    "Market Memory appelée mais non citée": (
        "la citation d'une source dans le TEXTE de la réponse n'est pas persistée en champ structuré — "
        "seule la consultation de la couche l'est (`knowledge_receipt`)"
    ),
    "correction utilisateur sans changement de résultat": (
        "le résultat d'un outil AVANT et APRÈS la correction n'est pas persisté (la trace ne garde que les noms "
        "d'outils) — comparer deux résultats exige de stocker leur empreinte, un chantier de collecte à part"
    ),
    "taux élevé de GO sur grands comptes sans accès": _JUDGMENT_REASON,
}


def render_markdown() -> str:
    """Le rapport — texte, pour le même usage CLI que `chat_dashboard.py`
    (``python -m tests.chat_reasoning_dashboard_report``). Pas de métrique ni
    d'alerte calculée : les deux sections nomment ce qui manque, jamais un
    chiffre deviné."""
    lines: list[str] = []
    lines.append("# Tableau de pilotage — raisonnement commercial de Laura (#3198)")
    lines.append("")
    lines.append("## Déjà lues sur le trafic réel")
    lines.append("")
    for name, where in COMPUTED_ON_REAL_TRAFFIC.items():
        lines.append(f"- **{name}** : {where}")
    lines.append("")
    lines.append("## Métriques non mesurées aujourd'hui — nommées, jamais à zéro")
    lines.append("")
    for metric, raison in DASHBOARD_METRICS_NOT_YET_MEASURED.items():
        lines.append(f"- **{metric}** : {raison}")
    lines.append("")
    lines.append("## Alertes non mesurées aujourd'hui — nommées, jamais à zéro")
    lines.append("")
    for alert, raison in ALERTS_NOT_YET_MEASURED.items():
        lines.append(f"- **{alert}** : {raison}")
    lines.append("")
    return "\n".join(lines)
