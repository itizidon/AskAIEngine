# app/routes/auth_routes.py
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field

from app.database import get_db
from app.models import User, Business
from app.auth import (
    hash_password,
    verify_password,
    set_jwt_cookie,
    remove_jwt_cookie,
    create_token,
    get_current_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── SCHEMAS ─────────────────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    business_name: str = Field(..., alias="businessName")


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    business_id: int  # add this

    model_config = {
        "from_attributes": True
    }

# ── ROUTES ──────────────────────────────────────────────────────────────────────
@router.post("/signup", response_model=UserResponse, status_code=201)
def signup(body: SignupRequest, response: Response, db: Session = Depends(get_db)):
    # --- Check for existing email ---
    print(body)
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # --- Create new user ---
    user = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # --- Create default business for user ---
    business = Business(
        name=f"{body.name}'s Business"
    )
    db.add(business)
    db.commit()
    db.refresh(business)

    # --- Associate user with business ---
    user.businesses.append(business)
    db.commit()

    # --- Set JWT cookie including user_id and business_id ---
    set_jwt_cookie(response, user.id, business_id=business.id)

    return UserResponse.model_validate({
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "business_id": user.businesses[0].id if user.businesses else None
    })


@router.post("/login", response_model=UserResponse)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    response: Response = None,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # set JWT cookie
    set_jwt_cookie(response, user.id, business_id=user.businesses[0].id if user.businesses else None)

    # Create a dict to include business_id
    user_data = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "business_id": user.businesses[0].id if user.businesses else None,
    }

    return UserResponse.model_validate(user_data)

@router.post("/logout")
def logout(response: Response):
    remove_jwt_cookie(response)
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
def me(current_context = Depends(get_current_user)):
    user, business_id = current_context

    user_dict = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "business_id": business_id,
    }

    return UserResponse.model_validate(user_dict)