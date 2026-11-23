"""People and webhooks for recruiting tools: a person of the people tools as one flat record for an ATS or a CRM, and the
account webhooks (https://alion.io/developers/webhooks) checked and parsed in one call.

>>> from alion import Alion
>>> from alion.people import to_candidate_record, parse_webhook
>>> alion = Alion()
>>> page = alion.match_people(role="Backend", technology="Python,Kubernetes", can_work_in="US")
>>> rows = [to_candidate_record(p) for p in page["items"]]          # key them by person_id
>>> # your webhook endpoint
>>> event = parse_webhook(request.body, request.headers.get("X-Alion-Signature"), os.environ["ALION_WEBHOOK_SECRET"])
>>> if event["event"] == "candidate.erased": ats.delete(event["data"]["person"]["person_id"])
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Mapping, Optional, Union

from ._errors import AlionError
from ._helpers import verify_webhook

__all__ = ["to_candidate_record", "parse_webhook", "WEBHOOK_EVENTS"]

#: The events of the account webhooks; the ones after ``window.opened`` start with client shortlists, job orders and contact sharing.
WEBHOOK_EVENTS = (
    "candidate.replied", "candidate.consented", "candidate.erased", "role.became_hard", "window.opened",
    "candidate.consent_revoked", "shortlist.candidate_added", "client.shortlist_opened", "client.invited", "order.new_matches",
)


def _str(v: Any) -> Optional[str]:
    if isinstance(v, str) and v != "":
        return v
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return str(v)
    return None


def _join(v: Any, key: Optional[str] = None) -> str:
    if not isinstance(v, list):
        return ""
    out: List[str] = []
    for x in v:
        if key is not None and isinstance(x, Mapping):
            x = x.get(key)
        if x not in (None, ""):
            out.append(str(x))
    return "; ".join(out)


def to_candidate_record(person: Mapping[str, Any]) -> Dict[str, Any]:
    """A row of search_people / match_people / similar_people, or a profile of get_person, as one flat record keyed by the
    stable ``person_id`` (it never changes, unlike the handle). The contacts are only the ones the person gave your account
    (an application to your vacancy), as their privacy lets you see them; ``contacts_basis`` says on what."""
    loc = person.get("location") or {}
    contacts = person.get("contacts") or {}
    shared = person.get("contacts_shared") or {}
    wants = person.get("wants") or {}
    jobs: List[Any] = []
    for key in ("recent_jobs", "experience"):
        if isinstance(person.get(key), list):
            jobs = person[key]
            break
    now = next((j for j in jobs if isinstance(j, Mapping) and j.get("current")), None)
    current = " at ".join(x for x in (_str(now.get("title")), _str(now.get("company"))) if x) if now else ""
    years = person.get("years_experience")
    return {
        "person_id": _str(person.get("person_id")),
        "handle": _str(person.get("person")),
        "name": _str(person.get("name")),
        "headline": _str(person.get("headline")),
        "seniority": _str(person.get("seniority")),
        "years_experience": years if isinstance(years, (int, float)) and not isinstance(years, bool) else None,
        "country": _str(loc.get("country")) if isinstance(loc, Mapping) else None,
        "city": _str(loc.get("city")) if isinstance(loc, Mapping) else None,
        "skills": _join(person.get("skills"), "name"),
        "current_job": current or None,
        "availability": _str(person.get("availability")) or _str(wants.get("availability")),
        "work_modes": _join(person.get("work_modes") if person.get("work_modes") is not None else wants.get("work_modes")),
        "can_work_in": _join(person.get("can_work_in")),
        "last_active": _str(person.get("last_active")),
        "url": _str(person.get("url")),
        "phone": _str(contacts.get("phone")),
        "linkedin": _str(contacts.get("linkedin")),
        "telegram": _str(contacts.get("telegram")),
        "github": _str(contacts.get("github")) or _str((person.get("work_links") or {}).get("github")),
        "contacts_basis": _str(shared.get("basis")),
    }


def parse_webhook(body: Union[str, bytes], signature: Optional[str], secret: str, *, tolerance: int = 300) -> Dict[str, Any]:
    """Checks the signature of an account webhook and returns its event ``{id, event, created, api_version, data}``.
    Raises AlionError ``invalid_signature`` when the signature, the secret or the timestamp does not hold, ``invalid_body``
    when the body is not an event. Pass the RAW body: the signature is over its exact bytes."""
    if not verify_webhook(body, signature, secret, tolerance=tolerance):
        raise AlionError("The webhook signature does not hold for this body and secret (or its timestamp is too old).", code="invalid_signature")
    try:
        event = json.loads(body.decode("utf-8") if isinstance(body, bytes) else body)
    except ValueError:
        raise AlionError("The webhook body is not JSON.", code="invalid_body") from None
    if not isinstance(event, dict) or not isinstance(event.get("event"), str) or not isinstance(event.get("data"), dict):
        raise AlionError("The webhook body is not an Alion event.", code="invalid_body")
    return event
