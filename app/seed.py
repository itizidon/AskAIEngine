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


def run_migrations(conn):
    """Apply any schema changes that create_all won't handle automatically."""

    # Enable pgvector extension
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))

    # hashed_password column
    conn.execute(text("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS hashed_password VARCHAR NOT NULL DEFAULT '';
    """))
    conn.execute(text("""
        ALTER TABLE users
        ALTER COLUMN hashed_password DROP DEFAULT;
    """))

    # Make documents.content nullable (was NOT NULL before)
    conn.execute(text("""
        ALTER TABLE documents
        ALTER COLUMN content DROP NOT NULL;
    """))

    # Drop chunks table if embedding column is wrong type (Text instead of vector)
    # This recreates it with the correct Vector(384) type via create_all below
    conn.execute(text("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'chunks'
                AND column_name = 'embedding'
                AND data_type = 'text'
            ) THEN
                DROP TABLE chunks CASCADE;
                RAISE NOTICE 'Dropped chunks table (wrong embedding type)';
            END IF;
        END $$;
    """))

    conn.commit()
    print("  Migrations applied.")


def seed():
    # Step 1 — run migrations first
    with engine.connect() as conn:
        run_migrations(conn)

    # Step 2 — create all tables (including new ones like chat_sessions, chat_messages)
    Base.metadata.create_all(bind=engine)
    print("  Tables created/verified.")

    db = SessionLocal()
    try:
        # ── Businesses ──────────────────────────────────────────────────────────
        business_names = [
            "Acme Inc",
            "Globex Corp",
            "Umbrella Co",
            "Stark Industries",
            "Wayne Enterprises",
        ]
        businesses = []
        for name in business_names:
            business = db.query(Business).filter(Business.name == name).first()
            if not business:
                business = Business(name=name)
                db.add(business)
                db.flush()
                print(f"  Created business: {name}")
            else:
                print(f"  Business '{name}' already exists, skipping.")
            businesses.append(business)

        # ── Super admin ─────────────────────────────────────────────────────────
        super_admin_email = "admin@example.com"
        super_admin = db.query(User).filter(User.email == super_admin_email).first()
        if not super_admin:
            super_admin = User(
                email           = super_admin_email,
                name            = "Super Admin",
                hashed_password = hash_password("supersecret123"),
                role            = "admin",
            )
            db.add(super_admin)
            db.flush()
            print("  Created super admin: admin@example.com")
        else:
            super_admin.hashed_password = hash_password("supersecret123")
            super_admin.role            = "admin"
            print("  Super admin already exists, password reset.")

        # ── Business owner ──────────────────────────────────────────────────────
        owner_email = "owner@example.com"
        owner = db.query(User).filter(User.email == owner_email).first()
        if not owner:
            owner = User(
                email           = owner_email,
                name            = "Business Owner",
                hashed_password = hash_password("ownerpass123"),
                role            = "user",
            )
            db.add(owner)
            db.flush()
            print("  Created business owner: owner@example.com")
        else:
            owner.hashed_password = hash_password("ownerpass123")
            print("  Business owner already exists, password reset.")

        # Link owner to first business
        if businesses and businesses[0] not in owner.businesses:
            owner.businesses.append(businesses[0])
            print(f"  Linked owner to: {businesses[0].name}")

        # ── Test user ───────────────────────────────────────────────────────────
        test_email = "test@example.com"
        test_user = db.query(User).filter(User.email == test_email).first()
        if not test_user:
            test_user = User(
                email           = test_email,
                name            = "Test User",
                hashed_password = hash_password("testpass123"),
                role            = "user",
            )
            db.add(test_user)
            db.flush()
            print("  Created test user: test@example.com")
        else:
            test_user.hashed_password = hash_password("testpass123")
            print("  Test user already exists, password reset.")

        # Link test user to second business if available
        if len(businesses) > 1 and businesses[1] not in test_user.businesses:
            test_user.businesses.append(businesses[1])
            print(f"  Linked test user to: {businesses[1].name}")

        db.commit()

        print("\nSeed complete.")
        print("\nTest credentials:")
        print("  Super Admin   → admin@example.com  / supersecret123")
        print("  Business Owner→ owner@example.com  / ownerpass123")
        print("  Test User     → test@example.com   / testpass123")

    except Exception as e:
        db.rollback()
        print(f"\nSeed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()