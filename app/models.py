from app.database import Base
from sqlalchemy import Column, Integer, String, ForeignKey, Table, Text, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import JSONB

# ── Junction table: which users can access which businesses ────────────────────
user_business = Table(
    "user_business",
    Base.metadata,
    Column("user_id",     Integer, ForeignKey("users.id"),      primary_key=True),
    Column("business_id", Integer, ForeignKey("businesses.id"), primary_key=True),
)


class Organization(Base):
    """
    The paying entity. One admin creates an org when they subscribe.
    All businesses, users, and search quota belong to the org.
    """
    __tablename__ = "organizations"

    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String, nullable=False)
    owner_id      = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Subscription
    plan          = Column(String, nullable=False, default="free")  # free/starter/pro/business
    is_active     = Column(Boolean, nullable=False, default=True)
    stripe_customer_id      = Column(String, nullable=True)   # for Stripe integration later
    stripe_subscription_id  = Column(String, nullable=True)

    created_at    = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    owner         = relationship("User", foreign_keys=[owner_id], back_populates="owned_org")
    businesses    = relationship("Business", back_populates="organization", cascade="all, delete-orphan")
    members       = relationship("OrgMember", back_populates="organization", cascade="all, delete-orphan")
    query_logs    = relationship("QueryLog", back_populates="organization")


class OrgMember(Base):
    """
    Tracks every user who belongs to an org (admin or not).
    Separate from user_business — this is org-level membership,
    user_business is business-level access.
    """
    __tablename__ = "org_members"

    id              = Column(Integer, primary_key=True, index=True)
    org_id          = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"),         nullable=False, index=True)
    role            = Column(String, nullable=False, default="member")  # admin / member
    invited_by_id   = Column(Integer, ForeignKey("users.id"),         nullable=True)
    joined_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    organization    = relationship("Organization", back_populates="members")
    user            = relationship("User", foreign_keys=[user_id], back_populates="org_memberships")
    invited_by      = relationship("User", foreign_keys=[invited_by_id])


class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    email           = Column(String, unique=True, nullable=False)
    name            = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role            = Column(String, default="user")   # global role: superadmin / user
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    owned_org       = relationship("Organization", foreign_keys="Organization.owner_id", back_populates="owner", uselist=False)
    org_memberships = relationship("OrgMember", foreign_keys="OrgMember.user_id", back_populates="user")
    businesses      = relationship("Business", secondary=user_business, back_populates="users")


class Business(Base):
    __tablename__ = "businesses"

    id              = Column(Integer, primary_key=True, index=True)
    org_id          = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name            = Column(String, nullable=False)
    rag_data        = Column(String, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    organization    = relationship("Organization", back_populates="businesses")
    users           = relationship("User", secondary=user_business, back_populates="businesses")
    documents       = relationship("Document", back_populates="business", cascade="all, delete-orphan")
    query_logs      = relationship("QueryLog", back_populates="business")


class Document(Base):
    __tablename__ = "documents"

    id              = Column(Integer, primary_key=True, index=True)
    business_id     = Column(Integer, ForeignKey("businesses.id"), nullable=False, index=True)
    filename        = Column(String, nullable=False)
    content         = Column(Text, nullable=True)
    status          = Column(String, nullable=False, default="ready")
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    business        = relationship("Business", back_populates="documents")
    chunks          = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")


class Chunk(Base):
    __tablename__ = "chunks"

    id              = Column(Integer, primary_key=True, index=True)
    business_id     = Column(Integer, ForeignKey("businesses.id"), nullable=False, index=True)
    document_id     = Column(Integer, ForeignKey("documents.id"),  nullable=False, index=True)
    chunk_index     = Column(Integer, nullable=False)
    text            = Column(Text, nullable=False)
    embedding       = Column(Vector(384), nullable=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    document        = relationship("Document", back_populates="chunks")


class QueryLog(Base):
    __tablename__ = "query_logs"

    id              = Column(Integer, primary_key=True, index=True)
    org_id          = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)  # ← tracks against subscription
    business_id     = Column(Integer, ForeignKey("businesses.id"),    nullable=False, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"),         nullable=False, index=True)  # ← who asked it
    query_text      = Column(Text, nullable=False)
    answer          = Column(JSONB, nullable=False)
    retrieval_plan  = Column(String, nullable=True)   # which tier was used: basic/hyde/multiquery
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    organization    = relationship("Organization", back_populates="query_logs")
    business        = relationship("Business",     back_populates="query_logs")
    user            = relationship("User")