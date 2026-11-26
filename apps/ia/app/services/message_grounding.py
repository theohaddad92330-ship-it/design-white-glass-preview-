"""#4524.2 — « Sur quoi Laura s'appuie » : les faits que le commercial a COCHÉS pilotent le paquet du message.

Le commercial choisit, au-dessus de « Générer », les signaux du compte et les besoins du contact sur lesquels le
message s'appuie, ou « Angle libre ». Ce choix voyage jusqu'ici :

- ``facts`` : seuls les faits cochés entrent au prompt, dans un bloc nommé. Les signaux du compte non cochés n'y sont
  PAS — ni dans le bloc « signaux récents », ni dans l'extrait du dossier (``raw_analysis``) qui les porte aussi.
- ``free_angle`` : aucun fait imposé ; l'angle tapé par le commercial (``context``) pilote seul.

Sans choix (``None``), rien ne change : le paquet est celui d'avant, à l'octet près.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

_KIND_LABELS = {
    "account_signal": "signal du compte",
    "contact_signal": "signal du contact",
    "contact_need": "besoin du contact",
}


class GroundingFact(BaseModel):
    """Un fait coché : son libellé et, quand on l'a, sa preuve (source · date). Jamais inventée."""

    kind: Literal["account_signal", "contact_signal", "contact_need"]
    label: str = Field(max_length=300)
    proof: str | None = Field(default=None, max_length=300)
    # #4977 — « job_offer » : ce signal du compte est l'OFFRE d'emploi (poste, ville) ; absent = un signal ordinaire.
    topic: Literal["job_offer"] | None = None

    @field_validator("label")
    @classmethod
    def _label_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("label is blank")
        return value.strip()

    @field_validator("proof")
    @classmethod
    def _proof_clean(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None


class MessageGrounding(BaseModel):
    mode: Literal["facts", "free_angle"]
    facts: list[GroundingFact] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def _facts_need_a_fact(self) -> MessageGrounding:
        # « Faits cochés » sans aucun fait n'est pas un choix : on ne le devine pas en « angle libre ».
        if self.mode == "facts" and not self.facts:
            raise ValueError("mode 'facts' needs at least one fact")
        if self.mode == "free_angle":
            self.facts = []
        return self


def _fact_line(fact: GroundingFact) -> str:
    proof = f" — preuve : {fact.proof}" if fact.proof else ""
    return f"- [{_KIND_LABELS[fact.kind]}] {fact.label}{proof}"


_PHONE_NO_OFFER = (
    "\n\nOFFRE D'EMPLOI : aucune offre n'est liée à cet appel. Le script reste général ; "
    "n'invente aucune offre, aucun poste, aucune ville."
)


def _phone_offer_block(facts: list[GroundingFact]) -> str:
    """#4977 — l'ouverture de l'appel part de l'offre cochée, avec un angle prestation ; sans offre, le dit."""
    offers = [fact for fact in facts if fact.topic == "job_offer"]
    if not offers:
        return _PHONE_NO_OFFER
    lines = "\n".join(_fact_line(fact) for fact in offers)
    return (
        "\n\nOFFRE D'EMPLOI DÉCLENCHEUSE (appel) : l'ouverture PART de cette offre — sa première phrase nomme le poste "
        "et, s'il est écrit, la ville, tels qu'écrits ci-dessous (la date de l'offre est la preuve), puis propose un "
        "angle prestation (ce que l'ESN peut apporter sur ce poste). Le persona du contact ne change que le niveau de "
        "langage, jamais le fait : c'est l'offre. Ne cite ni poste ni ville qui ne sont pas dans l'offre, "
        f"n'invente aucune date :\n{lines}"
    )


def apply_grounding(
    raw_analysis: dict[str, Any],
    recent_signals: list | None,
    grounding: MessageGrounding | None,
    channel: str | None = None,
) -> tuple[dict[str, Any], list | None, str]:
    """``(raw_analysis, recent_signals, bloc)`` après le choix du commercial.

    ``None`` ⇒ les trois entrées inchangées (même objets) et un bloc vide. Canal ``phone`` (#4977) : le bloc dit aussi
    si l'ouverture part d'une offre d'emploi cochée, ou que le script reste général.
    """
    if grounding is None:
        return raw_analysis, recent_signals, ""
    # Les signaux du compte ne partent plus que par le bloc ci-dessous : on les retire de l'extrait du dossier.
    trimmed = {key: value for key, value in raw_analysis.items() if key != "recent_signals"}
    if grounding.mode == "free_angle":
        block = (
            "\n\nANGLE LIBRE (choix du commercial) : aucun fait du compte ni du contact n'est imposé. "
            "N'en cite aucun de toi-même ; appuie-toi sur l'angle demandé ci-dessus et sur rien d'autre."
        )
        return trimmed, [], block + (_PHONE_NO_OFFER if channel == "phone" else "")
    lines = "\n".join(_fact_line(fact) for fact in grounding.facts)
    block = (
        "\n\nSUR QUOI S'APPUYER (faits choisis par le commercial — appuie-toi sur ces faits SEULS, "
        f"n'en cite aucun autre du dossier) :\n{lines}"
    )
    return trimmed, [], block + (_phone_offer_block(grounding.facts) if channel == "phone" else "")
