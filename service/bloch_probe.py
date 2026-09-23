"""Refresh public aggregate Bloch indexer status without publishing addresses."""

from .bloch import publish_probe


if __name__ == "__main__":
    status = publish_probe()
    print("Bloch indexer probe:", status["retrieved_at"], status["sampled_transactions"], "sampled transactions")
