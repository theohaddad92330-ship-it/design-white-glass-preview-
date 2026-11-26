"""La méthode validée, appliquée hors du chat de Laura (#3670.3 / .5 / .6).

Avant ce module, `method_knowledge` n'avait qu'un appelant : le chat. L'analyse
de compte (plan), l'approche (message, donc aussi les séquences qui l'appellent
côté API) et la préparation d'appel (battle card) décidaient sans elle — chaque
défaut se corrigeait par un prompt de plus.

UNE seule porte : `method_block_for`. Elle passe par
`retrieve_method_chunks_with_rules`, donc par le MÊME corpus servi que le chat
(`method_corpus_governance.is_unit_served`) et le MÊME filtre de règles
contredites par l'espace : une règle remplacée ou écartée ne peut pas réapparaître
dans un module (#3670.6). Aucun second retrieval, aucune copie de règle ici.

Ce que la porte ne fait PAS : fournir des faits (la méthode structure les choix),
réciter le cadre au commercial, ni ajouter quoi que ce soit quand rien ne
correspond — bloc vide, prompt byte-identique.
"""

from __future__ import annotations

from app.knowledge.method_situation_coverage import OUTPUT_FORMAT_BY_INTENT, OutputFormat
from app.services import bellum_api, method_knowledge

# module appelant → intention de sortie (`OUTPUT_FORMAT_BY_INTENT`).
MODULE_INTENT: dict[str, str] = {
    "analyse_compte": "compte",
    "approches": "approche",
    "sequences": "approche",  # une séquence génère ses pas par /message/generate
    "appels": "appel",
}

_FORMAT_LINE: dict[OutputFormat, str] = {
    "diagnostic_prochaine_action": (
        "FORMAT : un diagnostic du compte (ce qui est établi, ce qui manque) puis UNE prochaine action."
    ),
    "angle_message": "FORMAT : un angle nommé, puis le message qui le porte.",
    "discours_objections": "FORMAT : le discours d'appel, puis les objections probables et leur réponse.",
}

_HEADER = (
    "MÉTHODE BELLUM — elle structure tes choix (périmètre accessible, interlocuteur utile, objectif "
    "réaliste, approche adaptée) ; elle ne fournit AUCUN fait : ni budget, ni décideur, ni projet, ni "
    "relation que le dossier ne porte pas. Applique-la sans la réciter ni la citer au commercial. Un "
    "dirigeant n'est recommandé que si la méthode ou le contexte le justifie ; une correction explicite "
    "de l'utilisateur prime sur elle."
)


#: état de relation du compte (contrat `salesContext.relationship.state`) → mots
#: de la SITUATION que la méthode commande. Deux états différents sur les mêmes
#: faits donnent deux approches différentes (#3670, critère 1) ; un état inconnu
#: n'ajoute rien — on ne devine pas la relation.
_STATE_TERMS: dict[str, str] = {
    "froid": "premier message ouvrir un compte",
    "connu": "premier message ouvrir un compte",
    "linkedin": "premier message",
    "dormant": "reprise de relation réactivation",
    "ancien_client": "reprise de relation réactivation",
    "client_actif": "expansion client renouvellement de mission",
    "rang2": "partenaire rang 2",
    "besoin_ouvert": "besoin entrant",
    # #2371.4
    "partenaire_actif": "partenaire actif échange de besoins",
}


def _query(intent: str, situation_terms: str, relationship_state: str | None) -> str:
    state_terms = _STATE_TERMS.get((relationship_state or "").strip(), "")
    return " ".join(part for part in (situation_terms, state_terms, intent) if part)


async def method_block_for(
    module: str,
    *,
    situation_terms: str,
    user_id: str | None = None,
    sector: str | None = None,
    relationship_state: str | None = None,
    channel: str | None = None,
) -> str:
    """Bloc de prompt « méthode » du module, ou `""` quand rien ne correspond.

    `situation_terms` décrit la SITUATION (jamais une donnée du compte) : c'est
    elle qui rapproche la méthode de ce qu'elle commande."""
    intent = MODULE_INTENT.get(module)
    if intent is None:
        raise ValueError(f"module sans intention de méthode : {module}")
    query = _query(intent, situation_terms, relationship_state)
    chunks, rule_ids = method_knowledge.retrieve_method_chunks_with_rules(query, sector=sector, channel=channel)
    # Même filtre que le chat (#3289) : le pont n'est interrogé que si une règle de discipline sort.
    if rule_ids and user_id:
        contradicted = await bellum_api.contradicted_method_rules(user_id)
        if contradicted & rule_ids:
            chunks, _ = method_knowledge.retrieve_method_chunks_with_rules(
                query, sector=sector, excluded_rule_ids=contradicted, channel=channel
            )
    body = method_knowledge.format_method_context(chunks)
    if not body:
        return ""
    return f"\n\n{_HEADER}\n{body}\n{_FORMAT_LINE[OUTPUT_FORMAT_BY_INTENT[intent]]}"
