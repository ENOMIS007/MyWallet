from flask import request
from database import supabase

def get_token():
    """Estrae il JWT dall'header Authorization."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1]
    return None

def get_user_id(token):
    """Ricava lo user_id dal token JWT."""
    try:
        user = supabase.auth.get_user(token)
        return user.user.id
    except Exception:
        return None
