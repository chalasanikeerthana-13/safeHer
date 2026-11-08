
from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv
from datetime import datetime, timezone
import os

# Load environment variables
load_dotenv()

# Flask application
app = Flask(__name__)
CORS(app)

# MongoDB connection
MONGO_URI = os.getenv("MONGO_URI")

client = MongoClient(MONGO_URI)
db = client["SafeHer"]

# MongoDB collections
contacts_collection = db["contacts"]
alerts_collection = db["alerts"]


# HOME API
@app.route("/")
def home():
    return jsonify({
        "project": "SafeHer",
        "message": "Women Safety Alert System API is running"
    })


# HEALTH CHECK API
@app.route("/api/health")
def health():
    return jsonify({
        "status": "healthy"
    })


# MONGODB CONNECTION TEST API
@app.route("/api/db-test")
def db_test():
    try:
        client.admin.command("ping")

        return jsonify({
            "status": "success",
            "message": "MongoDB connected successfully"
        })

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


# ==================================
# TRUSTED CONTACTS APIs
# ==================================


# GET - Get all trusted contacts
@app.route("/api/contacts", methods=["GET"])
def get_contacts():
    try:
        contacts = list(contacts_collection.find())

        for contact in contacts:
            contact["_id"] = str(contact["_id"])

        return jsonify(contacts)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# POST - Add a trusted contact
@app.route("/api/contacts", methods=["POST"])
def add_contact():
    try:
        data = request.get_json()

        if not data:
            return jsonify({
                "message": "Invalid JSON data"
            }), 400

        name = data.get("name", "").strip()
        phone = data.get("phone", "").strip()

        if not name or not phone:
            return jsonify({
                "message": "Name and phone are required"
            }), 400

        if not phone.isdigit() or len(phone) != 10:
            return jsonify({
                "message": "Enter a valid 10-digit phone number"
            }), 400

        result = contacts_collection.insert_one({
            "name": name,
            "phone": phone
        })

        return jsonify({
            "message": "Contact added successfully",
            "id": str(result.inserted_id)
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# PUT - Update a trusted contact
@app.route("/api/contacts/<contact_id>", methods=["PUT"])
def update_contact(contact_id):
    try:
        data = request.get_json()

        if not data:
            return jsonify({
                "message": "Invalid JSON data"
            }), 400

        name = data.get("name", "").strip()
        phone = data.get("phone", "").strip()

        if not name or not phone:
            return jsonify({
                "message": "Name and phone are required"
            }), 400

        if not phone.isdigit() or len(phone) != 10:
            return jsonify({
                "message": "Enter a valid 10-digit phone number"
            }), 400

        result = contacts_collection.update_one(
            {"_id": ObjectId(contact_id)},
            {
                "$set": {
                    "name": name,
                    "phone": phone
                }
            }
        )

        if result.matched_count == 0:
            return jsonify({
                "message": "Contact not found"
            }), 404

        return jsonify({
            "message": "Contact updated successfully"
        })

    except Exception:
        return jsonify({
            "message": "Invalid contact ID"
        }), 400


# DELETE - Delete a trusted contact
@app.route("/api/contacts/<contact_id>", methods=["DELETE"])
def delete_contact(contact_id):
    try:
        result = contacts_collection.delete_one({
            "_id": ObjectId(contact_id)
        })

        if result.deleted_count == 0:
            return jsonify({
                "message": "Contact not found"
            }), 404

        return jsonify({
            "message": "Contact deleted successfully"
        })

    except Exception:
        return jsonify({
            "message": "Invalid contact ID"
        }), 400


# ==================================
# SOS ALERT AND ALERT HISTORY APIs
# ==================================


# POST - Create SOS Alert (Demo Mode)
@app.route("/api/alerts", methods=["POST"])
def create_alert():
    try:
        data = request.get_json() or {}

        latitude = data.get("latitude")
        longitude = data.get("longitude")

        # Validate location coordinates when provided
        if latitude is not None and longitude is not None:
            try:
                latitude = float(latitude)
                longitude = float(longitude)

                if not (-90 <= latitude <= 90 and
                        -180 <= longitude <= 180):
                    return jsonify({
                        "message": "Invalid location coordinates"
                    }), 400

            except (TypeError, ValueError):
                return jsonify({
                    "message": "Coordinates must be numbers"
                }), 400

        alert = {
            "type": "SOS",
            "status": "DEMO_ALERT",
            "latitude": latitude,
            "longitude": longitude,
            "message": data.get(
                "message",
                "Emergency SOS alert triggered"
            ),
            "created_at": datetime.now(timezone.utc)
        }

        result = alerts_collection.insert_one(alert)

        return jsonify({
            "message": "SOS demo alert saved successfully",
            "alert_id": str(result.inserted_id),
            "status": "DEMO_ALERT"
        }), 201

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


# GET - View SOS Alert History
@app.route("/api/alerts", methods=["GET"])
def get_alerts():
    try:
        alerts = list(
            alerts_collection.find().sort("created_at", -1)
        )

        for alert in alerts:
            alert["_id"] = str(alert["_id"])
            alert["created_at"] = alert["created_at"].isoformat()

        return jsonify(alerts)

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


# ==================================
# RUN FLASK APPLICATION
# ==================================

if __name__ == "__main__":
    app.run(debug=True, port=5000)
