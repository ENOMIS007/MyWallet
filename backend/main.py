from flask import Flask, send_from_directory, request
from flask_cors import CORS
from database import supabase
import os
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__, static_folder="../frontend")
CORS(app)

# Serve il frontend
@app.route("/")
def index():
    return send_from_directory("../frontend", "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("../frontend", path)


# Inietta il token JWT nel client Supabase prima di ogni richiesta.
# Permette alla RLS di filtrare i dati per utente.
ROUTE_PUBBLICHE = {"/auth/login", "/auth/register", "/auth/resend-verification"}

@app.before_request
def inject_jwt():
    if request.path in ROUTE_PUBBLICHE:
        return  # login e register non richiedono token

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        supabase.postgrest.auth(token)


# Registrazione dei blueprint (Route)
from routers import categorie, transazioni, auth, programmazione, ai

app.register_blueprint(auth.bp)
app.register_blueprint(categorie.bp)
app.register_blueprint(transazioni.bp)
app.register_blueprint(programmazione.bp)
app.register_blueprint(ai.bp)


if __name__ == "__main__":
    app.run(debug=True, host="localhost", port=3000)