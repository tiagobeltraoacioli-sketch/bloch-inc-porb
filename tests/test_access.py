import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone

from service.access import ScoreGrant, ScoreRequest, score_access


class ScoreAccessTest(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 9, 23, tzinfo=timezone.utc)
        self.grant = ScoreGrant("g1", "bloch-inc", "bank-a", "tenant-a", "aml-review", frozenset({"btc:wallet-1"}), self.now + timedelta(days=1), True)
        self.request = ScoreRequest("bank-a", "tenant-a", "aml-review", "btc:wallet-1", True, True, True, True)

    def test_explicit_scoped_grant_allows_score_access(self):
        self.assertTrue(score_access(self.request, self.grant, self.now))

    def test_category_or_authentication_alone_never_grants_access(self):
        for changed in (
            replace(self.request, actor="another-bank"),
            replace(self.request, wallet_id="btc:wallet-2"),
            replace(self.request, tenant_id="tenant-b"),
            replace(self.request, purpose="marketing"),
            replace(self.request, verified_person=False),
            replace(self.request, authenticated=False),
            replace(self.request, audit_ready=False),
            replace(self.request, lawful_basis_recorded=False),
        ):
            self.assertFalse(score_access(changed, self.grant, self.now))
        self.assertFalse(score_access(self.request, replace(self.grant, approved=False), self.now))
        self.assertFalse(score_access(self.request, self.grant, self.grant.expires_at))


if __name__ == "__main__":
    unittest.main()
