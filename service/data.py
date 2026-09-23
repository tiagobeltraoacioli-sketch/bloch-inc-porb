"""Fixed synthetic data for product and API demonstrations only."""

from datetime import datetime, timezone

AS_OF = "2026-09-23T12:00:00Z"
SOURCE = {
    "source_id": "synthetic-lab-v1",
    "provider": "Bloch Inc design laboratory",
    "kind": "generated_fixture",
    "purpose": "interface demonstration",
    "lawful_basis": "not applicable: generated, non-personal fixture",
    "license": "first-party synthetic fixture",
    "observed_at": AS_OF,
    "ingested_at": AS_OF,
    "expires_at": "2026-12-31T00:00:00Z",
    "confidence": None,
    "missingness": "0% in this fixture; not representative of live feeds",
}

OVERVIEW = {
    "mode": "synthetic_demo",
    "as_of": AS_OF,
    "status": "No live chain or provider connection",
    "method": "hand-authored deterministic fixture v1",
    "sample_size": {"transactions": 12480, "wallets": 1840, "signals": 263},
    "metrics": {
        "transactions_observed": 12480,
        "wallets_observed": 1840,
        "transactions_with_signals": 263,
        "review_queue": 18,
        "red_median": 182,
        "blue_median": 684,
    },
    "risk_distribution": [
        {"label": "0–199", "count": 6890},
        {"label": "200–399", "count": 3470},
        {"label": "400–599", "count": 1460},
        {"label": "600–799", "count": 500},
        {"label": "800–1000", "count": 160},
    ],
    "trend": [
        {"day": "D1", "red": 248, "blue": 638, "signals": 17},
        {"day": "D2", "red": 231, "blue": 646, "signals": 24},
        {"day": "D3", "red": 262, "blue": 641, "signals": 22},
        {"day": "D4", "red": 220, "blue": 658, "signals": 18},
        {"day": "D5", "red": 213, "blue": 665, "signals": 25},
        {"day": "D6", "red": 242, "blue": 659, "signals": 31},
        {"day": "D7", "red": 205, "blue": 671, "signals": 29},
        {"day": "D8", "red": 196, "blue": 676, "signals": 34},
        {"day": "D9", "red": 182, "blue": 684, "signals": 27},
        {"day": "D10", "red": 189, "blue": 681, "signals": 36},
    ],
    "typologies": [
        {"code": "R102", "name": "Velocity spike", "count": 87},
        {"code": "R105", "name": "Fan-in collector", "count": 61},
        {"code": "R106", "name": "Fan-out dispersal", "count": 45},
        {"code": "R104", "name": "Rapid pass-through", "count": 39},
        {"code": "R111", "name": "Micro probing", "count": 31},
    ],
    "reviews": [
        {"case_id": "SIM-301", "signal": "R102", "state": "Needs evidence", "age_hours": 4},
        {"case_id": "SIM-302", "signal": "R105", "state": "Under review", "age_hours": 11},
        {"case_id": "SIM-303", "signal": "R111", "state": "Disputed", "age_hours": 19},
        {"case_id": "SIM-304", "signal": "R104", "state": "Under review", "age_hours": 27},
    ],
    "sources": [SOURCE],
    "provenance": {
        "source_ids": [SOURCE["source_id"]],
        "model_version": "fixture-v1",
        "observed_at": AS_OF,
        "sample_size": 12480,
        "missingness": SOURCE["missingness"],
        "limitations": "Synthetic data do not establish real AML accuracy or legal compliance.",
    },
}


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
