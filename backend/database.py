from supabase import create_client, Client
from dotenv import load_dotenv
import os

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Client globale (usato solo per auth.sign_up / sign_in / sign_out)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_supabase_client(token: str) -> Client:
    """
    Crea un client Supabase con il JWT dell'utente iniettato negli header.
    Necessario per far funzionare la RLS: ogni query deve girare
    nel contesto dell'utente autenticato, non della service key anonima.
    """
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    client.postgrest.auth(token)
    return client