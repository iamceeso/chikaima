from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.user import User
from app.repositories.base import Repository


class UserRepository(Repository[User]):
    def __init__(self, db: Session) -> None:
        super().__init__(db, User)

    def get_by_email(self, email: str) -> User | None:
        return self.db.query(User).filter(User.email == email).first()
