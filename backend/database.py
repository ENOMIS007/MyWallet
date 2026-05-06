from supabase import create_client, Client
from dotenv import load_dotenv
import os

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY")  # sb_secret_... (Secret API key)

# Client Supabase globale
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_supabase_client(token: str) -> Client:
    """Restituisce un client Supabase autenticato con il JWT dell'utente per abilitare la RLS."""
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    client.postgrest.auth(token)
    return client