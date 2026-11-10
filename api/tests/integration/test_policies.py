import uuid
from datetime import date
from pathlib import Path

import asyncpg
import httpx
import pytest

from app.services.policies import RULE_COUNTS, VERSIONS
from tests.conftest import Flow, UserFactory, make_token

TUTOR_RULES = [True] * RULE_COUNTS["tutor_agreement"]
STUDENT_RULES = [True] * RULE_COUNTS["student_policy"]


def _years_ago(n: int) -> str:
    t = date.today()
    return t.replace(year=t.year - n).isoformat()


async def _new_login(db: asyncpg.Connection) -> dict[str, str]:
    uid = uuid.uuid4()
    await db.execute("insert into auth.users(id) values ($1)", uid)
    return {"Authorization": f"Bearer {make_token(str(uid))}"}


async def test_no_account_without_accepting_the_policy(
    client: httpx.AsyncClient, db: asyncpg.Connection
) -> None:
    h = await _new_login(db)
    base = {"role": "tutor", "display_name": "Ana", "preferred_language": "en"}
    assert (await client.post("/me/onboard", headers=h, json=base)).status_code == 422
    unchecked = {**base, "policy": {"agree": False, "full_name": "Ana Lopez"}}
    assert (await client.post("/me/onboard", headers=h, json=unchecked)).status_code == 422
    assert (await client.get("/me", headers=h)).status_code == 403  # still no account


async def test_tutor_signature_is_recorded_and_exported(
    client: httpx.AsyncClient, db: asyncpg.Connection, make_user: UserFactory
) -> None:
    h = await _new_login(db)
    r = await client.post(
        "/me/onboard",
        headers=h,
        json={
            "role": "tutor",
            "display_name": "Ana",
            "preferred_language": "en",
            "policy": {"agree": True, "full_name": "  Ana María Lopez ", "rules": TUTOR_RULES},
        },
    )
    assert r.status_code == 201, r.text
    policy = r.json()["policy"]
    assert policy["accepted"] and policy["ready"] and policy["policy"] == "tutor_agreement"
    assert policy["accepted_name"] == "Ana María Lopez"

    admin = await make_user("admin")
    rows = (await client.get("/admin/policy-acceptances", headers=admin.h)).json()
    row = next(x for x in rows if x["full_name"] == "Ana María Lopez")
    assert row["policy"] == "tutor_agreement" and row["accepted_by"] == "user"
    assert row["email"].endswith("@test.local") and row["policy_version"] and row["accepted_at"]
    assert row["account_name"] == "Ana" and row["role"] == "tutor"

    student = await make_user("student")
    r = await client.get("/admin/policy-acceptances", headers=student.h)
    assert r.status_code == 403


async def test_tutor_cannot_send_offers_until_signed(flow: Flow, make_user: UserFactory) -> None:
    await flow.post_task()
    unsigned = await make_user("tutor", policy=False)
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/bids", headers=unsigned.h, json={"amount_cents": 2000}
    )
    assert r.status_code == 403 and "Contractor Agreement" in r.text
    me = (await flow.client.get("/me", headers=unsigned.h)).json()
    assert me["policy"]["accepted"] is False and me["policy"]["ready"] is False

    r = await flow.client.post(
        "/me/policy",
        headers=unsigned.h,
        json={"agree": True, "full_name": "Lee Park", "rules": TUTOR_RULES},
    )
    assert r.status_code == 200 and r.json()["policy"]["ready"]
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/bids", headers=unsigned.h, json={"amount_cents": 2000}
    )
    assert r.status_code == 201, r.text


async def test_student_needs_date_of_birth(
    client: httpx.AsyncClient, db: asyncpg.Connection
) -> None:
    h = await _new_login(db)
    r = await client.post(
        "/me/onboard",
        headers=h,
        json={
            "role": "student",
            "display_name": "Kai",
            "preferred_language": "en",
            "policy": {"agree": True, "full_name": "Kai Moana", "rules": STUDENT_RULES},
        },
    )
    assert r.status_code == 409 and "date of birth" in r.text
    assert (await client.get("/me", headers=h)).status_code == 403  # nothing half-created


async def test_minor_cannot_book_until_guardian_consents(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    student = await make_user("student", policy=False)
    tutor = await make_user("tutor")
    flow = Flow(client, student, tutor)
    minor = {
        "agree": True,
        "full_name": "Kai Moana",
        "date_of_birth": _years_ago(15),
        "rules": STUDENT_RULES,
    }

    r = await client.post("/me/policy", headers=student.h, json=minor)
    assert r.status_code == 409 and "parent or guardian" in r.text

    guardian = {"guardian_name": "Lani Moana", "guardian_email": "lani@example.com"}
    r = await client.post("/me/policy", headers=student.h, json={**minor, **guardian})
    assert r.status_code == 200, r.text
    p = r.json()["policy"]
    assert p["accepted"] and p["minor"] and not p["guardian_consent"] and not p["ready"]

    await flow.to("bid")  # a minor may still post and receive offers...
    r = await client.post(
        f"/tasks/{flow.task_id}/hire", headers=student.h, json={"bid_id": flow.bid_id}
    )
    assert r.status_code == 403 and "guardian" in r.text  # ...but not book

    r = await client.post(
        "/me/policy", headers=student.h, json={**minor, **guardian, "guardian_consent": True}
    )
    assert r.json()["policy"]["ready"]
    await flow.hire()

    admin = await make_user("admin")
    rows = (await client.get("/admin/policy-acceptances", headers=admin.h)).json()
    mine = {x["accepted_by"]: x for x in rows if x["user_id"] == str(student.id)}
    assert mine["user"]["full_name"] == "Kai Moana"
    assert mine["guardian"]["full_name"] == "Lani Moana"
    assert mine["guardian"]["email"] == "lani@example.com"


async def test_adult_student_books_without_guardian(flow: Flow, make_user: UserFactory) -> None:
    adult = await make_user("student", policy=False)
    r = await flow.client.post(
        "/me/policy",
        headers=adult.h,
        json={
            "agree": True,
            "full_name": "Rae Smith",
            "date_of_birth": _years_ago(19),
            "rules": STUDENT_RULES,
        },
    )
    p = r.json()["policy"]
    assert p["ready"] and not p["minor"]


async def test_unaccepted_student_cannot_book(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    flow = Flow(client, await make_user("student", policy=False), await make_user("tutor"))
    await flow.to("bid")
    r = await client.post(
        f"/tasks/{flow.task_id}/hire", headers=flow.student.h, json={"bid_id": flow.bid_id}
    )
    assert r.status_code == 403 and "Student and Parent Policy" in r.text


async def test_future_birth_date_rejected(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    s = await make_user("student", policy=False)
    t = date.today()
    r = await client.post(
        "/me/policy",
        headers=s.h,
        json={
            "agree": True,
            "full_name": "Rae Smith",
            "rules": STUDENT_RULES,
            "date_of_birth": t.replace(year=t.year + 1).isoformat(),
        },
    )
    assert r.status_code == 409


async def test_acceptances_are_append_only(db: asyncpg.Connection, make_user: UserFactory) -> None:
    await make_user("tutor")
    with pytest.raises(asyncpg.RaiseError, match="append-only"):
        await db.execute("update policy_acceptances set full_name = 'Someone Else'")
    with pytest.raises(asyncpg.RaiseError, match="append-only"):
        await db.execute("delete from policy_acceptances")


async def test_students_must_be_13_or_older(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    s = await make_user("student", policy=False)
    body = {
        "agree": True,
        "full_name": "Kid Tester",
        "rules": STUDENT_RULES,
        "guardian_name": "Pat Tester",
        "guardian_email": "pat@example.com",
        "guardian_consent": True,
    }
    r = await client.post("/me/policy", headers=s.h, json={**body, "date_of_birth": _years_ago(12)})
    assert r.status_code == 409 and "13 or older" in r.text
    r = await client.post("/me/policy", headers=s.h, json={**body, "date_of_birth": _years_ago(13)})
    assert r.status_code == 200 and r.json()["policy"]["ready"]


async def test_every_rule_must_be_checked(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    t = await make_user("tutor", policy=False)
    body = {"agree": True, "full_name": "Lee Park"}
    for rules in ([], [True] * (len(TUTOR_RULES) - 1), [*TUTOR_RULES[:-1], False]):
        r = await client.post("/me/policy", headers=t.h, json={**body, "rules": rules})
        assert r.status_code == 409 and "each rule" in r.text
    assert (await client.post("/me/policy", headers=t.h, json=body)).status_code == 422


async def test_blank_or_one_letter_names_are_rejected_cleanly(
    client: httpx.AsyncClient, db: asyncpg.Connection, make_user: UserFactory
) -> None:
    t = await make_user("tutor", policy=False)
    for name in ("   ", " a ", ""):
        body = {"agree": True, "full_name": name, "rules": TUTOR_RULES}
        assert (await client.post("/me/policy", headers=t.h, json=body)).status_code == 422
        h = await _new_login(db)
        onboard = {"role": "tutor", "display_name": "Ana", "preferred_language": "en"}
        r = await client.post("/me/onboard", headers=h, json={**onboard, "policy": body})
        assert r.status_code == 422


async def test_guardian_email_cannot_be_the_students_own(
    client: httpx.AsyncClient, db: asyncpg.Connection
) -> None:
    uid = uuid.uuid4()
    await db.execute("insert into auth.users(id) values ($1)", uid)
    h = {"Authorization": f"Bearer {make_token(str(uid), email='kai@example.com')}"}
    body = {
        "role": "student",
        "display_name": "Kai",
        "preferred_language": "en",
        "policy": {
            "agree": True,
            "full_name": "Kai Moana",
            "date_of_birth": _years_ago(15),
            "rules": STUDENT_RULES,
            "guardian_name": "Lani Moana",
            "guardian_email": "  KAI@example.com ",
            "guardian_consent": True,
        },
    }
    r = await client.post("/me/onboard", headers=h, json=body)
    assert r.status_code == 409 and "their own" in r.text
    body["policy"]["guardian_email"] = "lani@example.com"  # type: ignore[index]
    assert (await client.post("/me/onboard", headers=h, json=body)).status_code == 201


async def test_guardian_consent_later_needs_only_the_guardian(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    s = await make_user("student", policy=False)
    other = await make_user("student", policy=False)
    consent = {"consent": True, "guardian_name": "Lani Moana", "guardian_email": "lani@example.com"}
    r = await client.post("/me/policy/guardian", headers=s.h, json=consent)
    assert r.status_code == 409 and "first" in r.text  # nothing accepted yet

    minor = {
        "agree": True,
        "full_name": "Kai Moana",
        "date_of_birth": _years_ago(15),
        "rules": STUDENT_RULES,
        "guardian_name": "Lani Moana",
        "guardian_email": "lani@example.com",
    }
    assert (await client.post("/me/policy", headers=s.h, json=minor)).status_code == 200
    r = await client.post("/me/policy/guardian", headers=s.h, json={**consent, "consent": False})
    assert r.status_code == 422
    r = await client.post("/me/policy/guardian", headers=s.h, json=consent)
    assert r.status_code == 200 and r.json()["policy"]["ready"]

    # Once consent is on record, the guardian can't be swapped for someone else.
    swap = {"guardian_name": "Some One", "guardian_email": "someone@example.com"}
    r = await client.post("/me/policy/guardian", headers=s.h, json={**consent, **swap})
    p = r.json()["policy"]
    assert p["guardian_name"] == "Lani Moana" and p["guardian_email"] == "lani@example.com"
    r = await client.post("/me/policy", headers=s.h, json={**minor, **swap})
    p = r.json()["policy"]
    assert p["guardian_name"] == "Lani Moana" and p["guardian_email"] == "lani@example.com"

    adult = {**minor, "date_of_birth": _years_ago(20)}
    assert (await client.post("/me/policy", headers=other.h, json=adult)).status_code == 200
    r = await client.post("/me/policy/guardian", headers=other.h, json=consent)
    assert r.status_code == 409 and "under 18" in r.text


async def test_hire_needs_the_tutor_signed_on_the_current_version(
    flow: Flow, db: asyncpg.Connection
) -> None:
    await flow.to("bid")
    # The agreement is republished: the tutor's signature is on an older version only.
    await db.execute("alter table policy_acceptances disable trigger user")
    await db.execute(
        "update policy_acceptances set policy_version = 'old' where user_id = $1", flow.tutor.id
    )
    await db.execute("alter table policy_acceptances enable trigger user")
    r = await flow.client.post(
        f"/tasks/{flow.task_id}/hire", headers=flow.student.h, json={"bid_id": flow.bid_id}
    )
    assert r.status_code == 409 and "Tutor Agreement" in r.text


def test_api_and_web_agree_on_policy_versions_and_rules() -> None:
    """policies.ts holds the text people actually read; the API must gate on the same version."""
    src = (Path(__file__).parents[3] / "web/src/content/policies.ts").read_text(encoding="utf-8")
    for policy, version in VERSIONS.items():
        assert f'"{version}"' in src, policy
    assert src.count('label: "') == sum(RULE_COUNTS.values())
