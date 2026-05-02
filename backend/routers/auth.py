from flask import Blueprint, jsonify, request
from database import supabase

bp = Blueprint("auth", __name__)


# POST /auth/register — registra un nuovo utente
@bp.route("/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email e password obbligatorie"}), 400

    try:
        result = supabase.auth.sign_up({
            "email": email,
            "password": password,
            "options": {
                "email_redirect_to": "http://localhost:3000/registrazione.html"
            }
        })
        user = result.user
        if not user:
            return jsonify({"error": "Registrazione fallita"}), 400
        return jsonify({"message": "Registrazione avvenuta con successo", "user_id": user.id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# POST /auth/resend-verification — reinvia l'email di conferma
@bp.route("/auth/resend-verification", methods=["POST"])
def resend_verification():
    data  = request.get_json()
    email = data.get("email")

    if not email:
        return jsonify({"error": "Email obbligatoria"}), 400

    try:
        supabase.auth.resend({
            "type": "signup",
            "email": email,
            "options": {
                "email_redirect_to": "http://localhost:3000/registrazione.html"
            }
        })
        return jsonify({"message": "Email di verifica reinviata"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# POST /auth/login — autentica un utente esistente
@bp.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email e password obbligatorie"}), 400

    try:
        result = supabase.auth.sign_in_with_password({"email": email, "password": password})
        session = result.session
        if not session:
            return jsonify({"error": "Credenziali non valide"}), 401
        return jsonify({
            "access_token":  session.access_token,
            "refresh_token": session.refresh_token,
            "user_id":       result.user.id,
            "email":         result.user.email
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 401


# POST /auth/refresh — rinnova l'access token tramite refresh token
@bp.route("/auth/refresh", methods=["POST"])
def refresh():
    data          = request.get_json()
    refresh_token = data.get("refresh_token")

    if not refresh_token:
        return jsonify({"error": "Refresh token mancante"}), 400

    try:
        result  = supabase.auth.refresh_session(refresh_token)
        session = result.session
        if not session:
            return jsonify({"error": "Refresh fallito"}), 401
        return jsonify({
            "access_token":  session.access_token,
            "refresh_token": session.refresh_token
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 401


# POST /auth/logout — invalida la sessione corrente
@bp.route("/auth/logout", methods=["POST"])
def logout():
    try:
        supabase.auth.sign_out()
        return jsonify({"message": "Logout effettuato"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400