from flask import Blueprint, jsonify, request
from database import supabase, get_supabase_client

bp = Blueprint("categorie", __name__)
from utils import get_token, get_user_id



# GET /categorie — restituisce tutte le categorie visibili dell'utente
@bp.route("/categorie", methods=["GET"])
def get_categorie():
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401
    try:
        db    = get_supabase_client(token)
        query = db.table("categoria").select("*")
        result = query.execute()
        return jsonify(result.data)
    except Exception as e:
        return jsonify({"error": str(e)}), 401


# GET /categorie/entrate — restituisce solo le categorie visibili per entrate
@bp.route("/categorie/entrate", methods=["GET"])
def get_categorie_entrate():
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401
    try:
        db    = get_supabase_client(token)
        query = db.table("categoria").select("*").eq("is_entrata", True)
        result = query.execute()
        return jsonify(result.data)
    except Exception as e:
        return jsonify({"error": str(e)}), 401


# GET /categorie/uscite — restituisce solo le categorie visibili per uscite
@bp.route("/categorie/uscite", methods=["GET"])
def get_categorie_uscite():
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401
    try:
        db    = get_supabase_client(token)
        query = db.table("categoria").select("*").eq("is_entrata", False)
        result = query.execute()
        return jsonify(result.data)
    except Exception as e:
        return jsonify({"error": str(e)}), 401


# POST /categorie — aggiunge una nuova categoria
@bp.route("/categorie", methods=["POST"])
def add_categoria():
    token = get_token()
    if not token:
        return jsonify({"error": "Non autenticato"}), 401

    user_id = get_user_id(token)
    if not user_id:
        return jsonify({"error": "Token non valido"}), 401

    try:
        db   = get_supabase_client(token)
        data = request.get_json()
        result = db.table("categoria").insert({
            "nome":       data.get("nome"),
            "is_entrata": data.get("is_entrata"),
            "user_id":    user_id,
            "is_default": False
        }).execute()
        return jsonify(result.data), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 401