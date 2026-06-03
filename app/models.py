from app.database import Base
from sqlalchemy import Column, Integer, String, ForeignKey, Table, Text, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector

# Junction table
user_business = Table(
    "user_business",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
    Column("business_id", Integer, ForeignKey("businesses.id"), primary_key=True)
)

class User(Base):
    __tablename__ = "users"
    hashed_password = Column(String, nullable=False)
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, default="user")
    businesses = relationship("Business", secondary=user_business, back_populates="users")

class Business(Base):
    __tablename__ = "businesses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    rag_data = Column(String)
    users = relationship("User", secondary=user_business, back_populates="businesses")
    documents = relationship("Document", back_populates="business", cascade="all, delete-orphan")
    query_logs = relationship("QueryLog", back_populates="business", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="ready")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    business = relationship("Business", back_populates="documents")
    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")


class Chunk(Base):
    __tablename__ = "chunks"
    id          = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    text        = Column(Text, nullable=False)
    embedding   = Column(Vector(384), nullable=False)  # 384 dims for all-MiniLM-L6-v2
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    document    = relationship("Document", back_populates="chunks")


class QueryLog(Base):
    __tablename__ = "query_logs"

    id = Column(Integer, primary_key=True, index=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False, index=True)
    query_text = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    business = relationship("Business", back_populates="query_logs")