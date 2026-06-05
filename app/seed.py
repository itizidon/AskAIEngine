import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models import Base, User, Business
from app.auth import hash_password

DATABASE_URL = "postgresql://don:jqh40ybn6P%21@localhost:5432/ragproject"
engine       = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)


def reset_schema():
    """Drop all tables and extensions, then recreate from scratch."""
    print("  Dropping all tables...")
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS query_logs    CASCADE;"))
        conn.execute(text("DROP TABLE IF EXISTS chunks        CASCADE;"))
        conn.execute(text("DROP TABLE IF EXISTS documents     CASCADE;"))
        conn.execute(text("DROP TABLE IF EXISTS user_business CASCADE;"))
        conn.execute(text("DROP TABLE IF EXISTS users         CASCADE;"))
        conn.execute(text("DROP TABLE IF EXISTS businesses    CASCADE;"))
    print("  All tables dropped.")

    print("  Enabling pgvector extension...")
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
    print("  pgvector ready.")


def seed():
    # ── Step 1: Wipe and recreate schema ────────────────────────────────────────
    reset_schema()

    print("  Creating tables from models...")
    Base.metadata.create_all(bind=engine)
    print("  Tables created.")

    # ── Step 2: Seed data ────────────────────────────────────────────────────────
    db = SessionLocal()
    try:
        # ── Businesses ───────────────────────────────────────────────────────────
        business_names = [
            "Acme Inc",
            "Globex Corp",
            "Umbrella Co",
            "Stark Industries",
            "Wayne Enterprises",
        ]
        businesses = []
        for name in business_names:
            business = Business(name=name)
            db.add(business)
            businesses.append(business)
        db.flush()
        print(f"  Created {len(businesses)} businesses.")

        # ── Super admin ──────────────────────────────────────────────────────────
        super_admin = User(
            email           = "admin@example.com",
            name            = "Super Admin",
            hashed_password = hash_password("supersecret123"),
            role            = "admin",
        )
        db.add(super_admin)
        db.flush()
        print("  Created super admin: admin@example.com")

        # ── Business owner ───────────────────────────────────────────────────────
        owner = User(
            email           = "owner@example.com",
            name            = "Business Owner",
            hashed_password = hash_password("ownerpass123"),
            role            = "user",
        )
        db.add(owner)
        db.flush()
        owner.businesses.append(businesses[0])  # Linked to Acme Inc
        print(f"  Created business owner: owner@example.com → linked to {businesses[0].name}")

        # ── Test user ────────────────────────────────────────────────────────────
        test_user = User(
            email           = "test@example.com",
            name            = "Test User",
            hashed_password = hash_password("testpass123"),
            role            = "user",
        )
        db.add(test_user)
        db.flush()
        test_user.businesses.append(businesses[1])  # Linked to Globex Corp
        print(f"  Created test user: test@example.com → linked to {businesses[1].name}")

        db.commit()

        print("\nSeed complete.")
        print("\nTest credentials:")
        print("  Super Admin    → admin@example.com / supersecret123")
        print("  Business Owner → owner@example.com / ownerpass123")
        print("  Test User      → test@example.com  / testpass123")

    except Exception as e:
        db.rollback()
        print(f"\nSeed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()