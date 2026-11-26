"""#3231 (#219.6, X50) — CLIENT INTERNE, branché sur sa SOURCE : la déclaration.

Pour un compte qui est lui-même une direction informatique servant plusieurs
métiers, le commanditaire interne, l'utilisateur, l'entité juridique et le
client final ne sont PAS la même personne — appeler chaque métier cité un
« client externe » fausse la lecture du compte.

Aucune donnée collectée ne dit qu'un métier est interne (le triage du 28/09
écarte la détection par ressemblance de texte : ce serait inventer une preuve).
La source est donc une DÉCLARATION du commercial sur la fiche compte
(`accounts.declared_internal_client_mode`, correction humaine ordinaire,
provenance « saisi à la main ») : `None` = non déclaré, ce module ne dit alors
rien. Le vocabulaire est celui de `INTERNAL_CLIENT_MODES`
(`packages/contracts/src/schemas/account.ts`) — un test lit les deux fichiers.

Appelants réels : `prompts/bellum_advisor.py::build_system_prompt` (chat de
Laura — `account_data` est la ligne `accounts` entière) et
`routers/phase4_plan.py::_plan` (prompt du plan ; l'API fusionne la colonne dans
`account_data` au replan). Jamais de probabilité, jamais de nom de fournisseur.
"""

from __future__ import annotations

from typing import Any

INTERNAL_CLIENT_MODES = ("internal_service", "external_buyer")

_FIELD = "declared_internal_client_mode"

# #219.6 (J05) — les quatre rôles NOMMÉS à la main sur la fiche compte, dans l'ordre où
# la consigne les énonce. Texte libre, en clair ; absent = aucune ligne (jamais « inconnu »).
_ROLE_FIELDS = (
    ("declared_internal_sponsor", "Commanditaire interne"),
    ("declared_internal_users", "Utilisateurs"),
    ("declared_legal_entity", "Entité juridique"),
    ("declared_end_client", "Client final"),
)


def _declared_roles_lines(account_data: Any) -> str:
    """Une ligne par rôle NOMMÉ ; ``""`` quand aucun ne l'est."""
    if not isinstance(account_data, dict):
        return ""
    lines = []
    for field, label in _ROLE_FIELDS:
        value = account_data.get(field)
        if isinstance(value, str) and value.strip():
            lines.append(f"- {label} : {value.strip()}")
    if not lines:
        return ""
    return "\nRôles nommés par le commercial (à utiliser tels quels, sans en inventer d'autres) :\n" + "\n".join(lines)


def internal_client_mode_of(account_data: Any) -> str | None:
    """La déclaration du compte, ou ``None`` — jamais une valeur hors vocabulaire."""
    if not isinstance(account_data, dict):
        return None
    value = account_data.get(_FIELD)
    return value if value in INTERNAL_CLIENT_MODES else None


def internal_client_block(account_data: Any, company_name: str) -> str:
    """Bloc de prompt ; ``""`` quand rien n'est déclaré (prompt inchangé au byte près)."""
    mode = internal_client_mode_of(account_data)
    if mode == "internal_service":
        return (
            f"\n\n===== CLIENT INTERNE — {company_name} (#219.6) =====\n"
            f"Déclaré par le commercial : {company_name} est une direction interne qui sert plusieurs métiers.\n"
            "Consigne : distingue le commanditaire (le métier qui porte le besoin et le budget), "
            "l'utilisateur (ses équipes), l'entité juridique (qui contracte) et le client final "
            "(les clients de l'entreprise, hors périmètre de cette direction). "
            "N'appelle jamais un métier cité « client externe » : c'est un commanditaire interne, "
            "sauf si la déclaration est corrigée."
            + _declared_roles_lines(account_data)
        )
    if mode == "external_buyer":
        return (
            f"\n\n===== CLIENT DIRECT — {company_name} (#219.6) =====\n"
            f"Déclaré par le commercial : {company_name} achète pour son propre compte, comme client externe direct.\n"
            "Consigne : ne range pas les métiers cités en commanditaires internes d'une direction "
            "de services ; traite l'entreprise comme le client."
        )
    return ""


__all__ = ["INTERNAL_CLIENT_MODES", "internal_client_block", "internal_client_mode_of"]
