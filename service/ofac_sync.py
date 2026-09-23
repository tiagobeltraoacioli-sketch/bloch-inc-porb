"""Refresh private OFAC files and publish aggregate source metadata."""

from .ofac import sync


if __name__ == "__main__":
    status = sync()
    print("OFAC snapshot refreshed:", status["retrieved_at"], status["address_identifiers"], "address identifiers")
