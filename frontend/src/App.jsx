// Part 1: Imports, states, initial setup and API functions

import { useState, useEffect, useRef } from "react";
import axios from "axios";

import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

import {
  ShieldCheck,
  MapPin,
  Users,
  Clock,
  Heart,
  Navigation,
  Bell,
  CircleCheck,
  Plus,
  Phone,
  Activity,
  Trash2,
  X,
  Pencil
} from "lucide-react";

import "./index.css";

const API_URL = "https://safeher-backend-n9no.onrender.com/api";

// Calculate distance between two locations
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

function App() {
  // Basic states
  const [location, setLocation] = useState(null);
  const [liveSharing, setLiveSharing] = useState(false);
  const watchId = useRef(null);
  const [message, setMessage] = useState("");
  const [timer, setTimer] = useState(false);
  const [apiStatus, setApiStatus] = useState("Checking...");

  // Sidebar navigation
  const [activeSection, setActiveSection] = useState("dashboard");

  const navigateTo = (sectionId) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };

  // Trusted contacts
  const [contacts, setContacts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [editingContact, setEditingContact] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(true);

  // SOS alert history and countdown
  const [alerts, setAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [sendingSOS, setSendingSOS] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [countdownActive, setCountdownActive] = useState(false);

  // Voice SOS
  const [voiceListening, setVoiceListening] = useState(false);
  const recognitionRef = useRef(null);

  // Police stations
  const [policeStations, setPoliceStations] = useState([]);
  const [loadingPolice, setLoadingPolice] = useState(false);
  const [policeError, setPoliceError] = useState("");

  // Sort police stations by nearest distance
  const sortedPoliceStations = location
    ? [...policeStations].sort((a, b) => {
        const distanceA = getDistance(
          location.latitude,
          location.longitude,
          a.latitude,
          a.longitude
        );
        const distanceB = getDistance(
          location.latitude,
          location.longitude,
          b.latitude,
          b.longitude
        );
        return distanceA - distanceB;
      })
    : policeStations;

  // Initial loading
  useEffect(() => {
    checkBackend();
    fetchContacts();
    fetchAlerts();
  }, []);

  // Fetch police stations when location changes
  useEffect(() => {
    if (location) fetchPoliceStations();
  }, [location]);

  // Clean up location tracking and voice recognition on unmount
  useEffect(() => {
    return () => {
      if (watchId.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.log("Voice recognition already stopped.");
        }
      }
    };
  }, []);

  // Check MongoDB connection
  const checkBackend = async () => {
    try {
      const response = await axios.get(`${API_URL}/db-test`);
      if (response.data.status === "success") {
        setApiStatus("MongoDB Connected");
      } else {
        setApiStatus("Database Error");
      }
    } catch (error) {
      console.error("Backend connection error:", error);
      setApiStatus("Backend not connected");
    }
  };

  // Fetch trusted contacts
  const fetchContacts = async () => {
    try {
      setLoadingContacts(true);
      const response = await axios.get(`${API_URL}/contacts`);

      const formattedContacts = response.data.map((contact) => ({
        id: contact._id,
        name: contact.name,
        phone: contact.phone,
        relation: "Trusted contact"
      }));

      setContacts(formattedContacts);
    } catch (error) {
      console.error("Error loading contacts:", error);
      setMessage("Unable to load contacts from database.");
    } finally {
      setLoadingContacts(false);
    }
  };

  // Fetch SOS alert history
  const fetchAlerts = async () => {
    try {
      setLoadingAlerts(true);
      const response = await axios.get(`${API_URL}/alerts`);
      setAlerts(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error loading alerts:", error);
      setMessage("Unable to load alert history.");
    } finally {
      setLoadingAlerts(false);
    }
  };

  // Get current location
  const getLocation = () => {
    if (!navigator.geolocation) {
      setMessage("Your browser does not support location.");
      return;
    }

    setMessage("Requesting location permission...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setMessage("Your location is available.");
      },
      (error) => {
        console.error("Location error:", error);
        setMessage("Location permission denied. Please enable it.");
      },
      {
        enableHighAccuracy: true,
        timeout: 15000
      }
    );
  };

  // Fetch nearby police stations
  const fetchPoliceStations = async () => {
    if (!location) return;

    setLoadingPolice(true);
    setPoliceError("");
    setPoliceStations([]);

    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="police"](around:5000,${location.latitude},${location.longitude});
        way["amenity"="police"](around:5000,${location.latitude},${location.longitude});
        relation["amenity"="police"](around:5000,${location.latitude},${location.longitude});
      );
      out center;
    `;

    const servers = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.private.coffee/api/interpreter"
    ];

    let loaded = false;

    for (const server of servers) {
      try {
        const params = new URLSearchParams();
        params.append("data", query);

        const response = await axios.post(server, params, {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          timeout: 45000
        });

        if (!Array.isArray(response.data.elements)) {
          throw new Error("Invalid API response");
        }

        const stations = response.data.elements
          .map((item) => {
            const latitude = item.lat ?? item.center?.lat;
            const longitude = item.lon ?? item.center?.lon;

            if (latitude == null || longitude == null) return null;

            return {
              id: `${item.type}-${item.id}`,
              name: item.tags?.name || "Police Station",
              latitude,
              longitude
            };
          })
          .filter(Boolean);

        setPoliceStations(stations);

        if (stations.length === 0) {
          setPoliceError(
            "No police stations found within approximately 5 km."
          );
        }

        loaded = true;
        break;
      } catch (error) {
        console.error(`Overpass server failed: ${server}`, error);
      }
    }

    if (!loaded) {
      setPoliceError(
        "Unable to load nearby police stations. Check your internet and try again."
      );
    }

    setLoadingPolice(false);
  };
    // Start Emergency Countdown
  // If location is not available yet, request it automatically.
  const startCountdown = () => {
    if (countdownActive || sendingSOS) return;

    const beginCountdown = () => {
      setCountdown(5);
      setCountdownActive(true);
      setMessage("SOS countdown started. Cancel if this is not an emergency.");
    };

    if (location) {
      beginCountdown();
      return;
    }

    if (!navigator.geolocation) {
      setMessage("Your browser does not support location. Call 112 in an emergency.");
      return;
    }

    setMessage("Getting your location before starting the SOS countdown...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        beginCountdown();
      },
      (error) => {
        console.error("SOS location error:", error);
        setMessage("Location permission is needed for the demo SOS. Please allow location or call 112.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  };

  // Cancel Emergency Countdown
  const cancelCountdown = () => {
    setCountdownActive(false);
    setCountdown(5);
    setMessage("SOS cancelled successfully. No alert was saved.");
  };

  // Send SOS demo alert to MongoDB
  const sendSOS = async () => {
    if (sendingSOS) return;

    if (!location) {
      setMessage("Please detect your location before sending SOS.");
      return;
    }

    try {
      setSendingSOS(true);
      setMessage("Saving SOS demo alert...");

      const response = await axios.post(`${API_URL}/alerts`, {
        latitude: location.latitude,
        longitude: location.longitude,
        message: "SafeHer SOS demo alert"
      });

      setMessage(
        response.data.message || "SOS demo alert saved successfully."
      );
      await fetchAlerts();
    } catch (error) {
      console.error("SOS error:", error);
      setMessage(
        error.response?.data?.message ||
          "Unable to save SOS alert. Please check backend."
      );
    } finally {
      setSendingSOS(false);
    }
  };

  // Countdown timer
  useEffect(() => {
    if (!countdownActive) return;

    if (countdown === 0) {
      setCountdownActive(false);
      sendSOS();
      return;
    }

    const timerId = window.setTimeout(() => {
      setCountdown((previous) => Math.max(previous - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timerId);
  }, [countdownActive, countdown]);

  // Voice Activated SOS
  const startVoiceSOS = () => {
    console.log("Voice SOS button clicked");

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMessage("Voice recognition is not supported in this browser. Please use an updated version of Google Chrome.");
      return;
    }

    if (countdownActive || sendingSOS || voiceListening) return;

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setVoiceListening(true);
      setMessage('Listening... Say "Help me" or "Emergency".');
    };

    recognition.onresult = (event) => {
      const spokenText = event.results[0][0].transcript.toLowerCase().trim();
      console.log("Voice detected:", spokenText);

      if (
        spokenText.includes("help") ||
        spokenText.includes("emergency")
      ) {
        setMessage("Emergency voice command detected. Starting countdown...");
        startCountdown();
      } else {
        setMessage(`Command not recognized: "${spokenText}". Say Help me or Emergency.`);
      }
    };

    recognition.onerror = (event) => {
      console.error("Voice recognition error:", event.error);
      setMessage("Microphone/voice error: " + event.error + ". Check Chrome microphone permission and internet connection.");
      setVoiceListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setVoiceListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (error) {
      console.error("Unable to start voice recognition:", error);
      setVoiceListening(false);
      recognitionRef.current = null;
      setMessage("Unable to start voice recognition. Please try again.");
    }
  };

  // Start Live Location Sharing
  const startLiveSharing = () => {
    if (!navigator.geolocation) {
      setMessage("Location is not supported by your browser.");
      return;
    }

    if (watchId.current !== null) return;

    setMessage("Starting live location sharing...");

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setLiveSharing(true);
        setMessage("Live location tracking is active.");
      },
      (error) => {
        console.error("Live location error:", error);
        setMessage("Unable to track location. Check location permission.");

        if (watchId.current !== null) {
          navigator.geolocation.clearWatch(watchId.current);
          watchId.current = null;
        }

        setLiveSharing(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000
      }
    );
  };

  // Stop Live Location Sharing
  const stopLiveSharing = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }

    setLiveSharing(false);
    setMessage("Live location sharing stopped.");
  };

  // Share location through WhatsApp
  const shareLocationWhatsApp = () => {
    if (!location) {
      setMessage("Please detect your location first.");
      return;
    }

    const mapLink =
      `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;

    const text = encodeURIComponent(`My current location is: ${mapLink}`);

    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  // Safety check-in demo
  const toggleTimer = () => {
    const nextState = !timer;
    setTimer(nextState);

    setMessage(
      nextState
        ? "Demo check-in enabled. No automatic alert is scheduled."
        : "Demo check-in disabled."
    );
  };

  // Open add contact form
  const openAddForm = () => {
    setEditingContact(null);
    setContactName("");
    setContactPhone("");
    setShowForm(true);
  };

  // Open edit contact form
  const editContact = (contact) => {
    setEditingContact(contact);
    setContactName(contact.name);
    setContactPhone(contact.phone);
    setShowForm(true);
  };

  // Close contact form
  const closeForm = () => {
    setShowForm(false);
    setEditingContact(null);
    setContactName("");
    setContactPhone("");
  };

  // Add and update contacts
  const addContact = async (event) => {
    event.preventDefault();

    const name = contactName.trim();
    const phone = contactPhone.trim();

    if (!name || !/^[0-9]{10}$/.test(phone)) {
      setMessage("Enter a name and a valid 10-digit phone number.");
      return;
    }

    try {
      setIsSaving(true);

      if (editingContact) {
        await axios.put(
          `${API_URL}/contacts/${editingContact.id}`,
          { name, phone }
        );

        setContacts((previousContacts) =>
          previousContacts.map((contact) =>
            contact.id === editingContact.id
              ? { ...contact, name, phone }
              : contact
          )
        );

        setMessage("Contact updated successfully.");
      } else {
        const response = await axios.post(`${API_URL}/contacts`, {
          name,
          phone
        });

        setContacts((previousContacts) => [
          ...previousContacts,
          {
            id: response.data.id,
            name,
            phone,
            relation: "Trusted contact"
          }
        ]);

        setMessage(`${name} added to your trusted circle.`);
      }

      closeForm();
    } catch (error) {
      console.error("Contact operation failed:", error);
      setMessage(
        error.response?.data?.message ||
          "Unable to save contact. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Delete contact
  const deleteContact = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this contact?"
    );

    if (!confirmDelete) return;

    try {
      await axios.delete(`${API_URL}/contacts/${id}`);

      setContacts((previousContacts) =>
        previousContacts.filter((contact) => contact.id !== id)
      );

      setMessage("Contact deleted successfully.");
    } catch (error) {
      console.error("Error deleting contact:", error);
      setMessage(
        error.response?.data?.message || "Unable to delete contact."
      );
    }
  };

  return ( 
        <div className="app-container">

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <ShieldCheck size={32} />
          <h2>SafeHer</h2>
        </div>

        <p className="sidebar-subtitle">Women Safety System</p>

        <nav className="sidebar-nav">
          <button
            className={activeSection === "dashboard" ? "nav-item active" : "nav-item"}
            onClick={() => navigateTo("dashboard")}
          >
            <Activity size={18} />
            Dashboard
          </button>

          <button
            className={activeSection === "trusted-circle" ? "nav-item active" : "nav-item"}
            onClick={() => navigateTo("trusted-circle")}
          >
            <Users size={18} />
            Trusted Circle
          </button>

          <button
            className={activeSection === "safety-map" ? "nav-item active" : "nav-item"}
            onClick={() => navigateTo("safety-map")}
          >
            <MapPin size={18} />
            Safety Map
          </button>

          <button
            className={activeSection === "alert-history" ? "nav-item active" : "nav-item"}
            onClick={() => navigateTo("alert-history")}
          >
            <Clock size={18} />
            Alert History
          </button>
        </nav>

        <div className="sidebar-bottom">
          <ShieldCheck size={22} />
          <p>You matter. Stay safe!</p>
        </div>
      </aside>


      {/* Main Content */}
      <main className="main-content">

        {/* Dashboard */}
        <section id="dashboard" className="dashboard-section">

          <div className="top-header">
            <div>
              <h1>Welcome to SafeHer</h1>
              <p>Your safety, our priority.</p>
            </div>

            <div className="status-badge">
              <span className="status-dot"></span>
              READY
            </div>
          </div>


          {/* Dashboard Cards */}
          <div className="dashboard-grid">

            {/* SOS Card */}
            <div className="sos-card">
              <div className="card-heading">
                <ShieldCheck size={24} />
                <h2>Emergency SOS</h2>
              </div>

              <p>
                Press the button below to start your emergency SOS countdown.
              </p>

              <div className="sos-circle">
                <button
                  className="sos-button"
                  onClick={startCountdown}
                  disabled={countdownActive || sendingSOS}
                >
                  {sendingSOS
                    ? "SENDING..."
                    : countdownActive
                    ? countdown
                    : "SOS"}
                </button>
              </div>

              {countdownActive && (
                <div className="countdown-box">
                  <h3>Emergency alert in</h3>
                  <div className="countdown-number">
                    {countdown}
                  </div>
                  <p>Cancel if this is not an emergency.</p>

                  <button
                    className="cancel-button"
                    onClick={cancelCountdown}
                  >
                    Cancel SOS
                  </button>
                </div>
              )}

              {!countdownActive && (
                <p className="sos-note">
                  A 5-second countdown will begin when you press SOS.
                </p>
              )}
            </div>


            {/* Voice SOS */}
            <div className="feature-card">
              <div className="card-icon">
                <Bell size={28} />
              </div>

              <h2>Voice Activated SOS</h2>

              <p>
                Use your voice to activate the emergency countdown.
                Say "Help me" or "Emergency".
              </p>

              <button
                className="primary-button"
                onClick={startVoiceSOS}
                disabled={voiceListening || countdownActive || sendingSOS}
              >
                {voiceListening ? "Listening..." : "Start Voice SOS"}
              </button>

              {voiceListening && (
                <p className="listening-text">
                  Listening for emergency command...
                </p>
              )}
            </div>


            {/* Location Card */}
            <div className="feature-card location-card">
              <div className="card-icon">
                <MapPin size={28} />
              </div>

              <h2>Current Location</h2>

              {location ? (
                <div className="location-details">
                  <p>
                    <strong>Latitude:</strong> {location.latitude.toFixed(6)}
                  </p>
                  <p>
                    <strong>Longitude:</strong> {location.longitude.toFixed(6)}
                  </p>

                  <a
                    href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on Google Maps
                  </a>
                </div>
              ) : (
                <p>Location not detected yet.</p>
              )}

              <button
                className="secondary-button"
                onClick={getLocation}
              >
                <Navigation size={16} />
                Detect My Location
              </button>
            </div>


            {/* Live Location Sharing */}
            <div className="feature-card">
              <div className="card-icon">
                <Navigation size={28} />
              </div>

              <h2>Live Location Sharing</h2>

              <p>
                Track your current location using your device GPS.
              </p>

              {!liveSharing ? (
                <button
                  className="primary-button"
                  onClick={startLiveSharing}
                >
                  Start Live Sharing
                </button>
              ) : (
                <button
                  className="secondary-button"
                  onClick={stopLiveSharing}
                >
                  Stop Live Sharing
                </button>
              )}

              {liveSharing && (
                <p className="success-text">
                  Live location tracking is active.
                </p>
              )}
            </div>


            {/* WhatsApp Sharing */}
            <div className="feature-card">
              <div className="card-icon">
                <Phone size={28} />
              </div>

              <h2>Share Location</h2>

              <p>
                Share your current location through WhatsApp.
              </p>

              <button
                className="primary-button"
                onClick={shareLocationWhatsApp}
              >
                Share on WhatsApp
              </button>
            </div>


            {/* Safety Check-in */}
            <div className="feature-card">
              <div className="card-icon">
                <Heart size={28} />
              </div>

              <h2>Safety Check-in</h2>

              <p>
                Enable or disable the demo safety check-in.
              </p>

              <button
                className="secondary-button"
                onClick={toggleTimer}
              >
                {timer ? "Disable Check-in" : "Enable Check-in"}
              </button>

              <p className="checkin-status">
                Status: {timer ? "Enabled" : "Disabled"}
              </p>
            </div>

          </div>


          {/* Emergency Contact */}
          <div className="emergency-card">
            <div>
              <h2>Need Immediate Help?</h2>
              <p>Call India's emergency response number.</p>
            </div>

            <a href="tel:112" className="emergency-call">
              <Phone size={18} />
              Call 112
            </a>
          </div>

        </section>


        {/* Message Box */}
        {message && (
          <div className="message-box">
            <p>{message}</p>
            <button onClick={() => setMessage("")}>
              <X size={18} />
            </button>
          </div>
        )}


        {/* Trusted Circle */}
        <section id="trusted-circle" className="content-section">

          <div className="section-header">
            <div>
              <h2>Trusted Circle</h2>
              <p>Add people you trust for emergency contact reference.</p>
            </div>

            <button
              className="primary-button"
              onClick={openAddForm}
            >
              <Plus size={18} />
              Add Contact
            </button>
          </div>


          {/* Add / Edit Contact Form */}
          {showForm && (
            <div className="contact-form-card">
              <div className="form-heading">
                <h3>
                  {editingContact ? "Edit Contact" : "Add New Contact"}
                </h3>

                <button onClick={closeForm}>
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={addContact}>
                <div className="form-group">
                  <label>Contact Name</label>
                  <input
                    type="text"
                    placeholder="Enter contact name"
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    placeholder="Enter 10-digit phone number"
                    value={contactPhone}
                    onChange={(event) => setContactPhone(event.target.value)}
                    maxLength={10}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSaving}
                >
                  {isSaving
                    ? "Saving..."
                    : editingContact
                    ? "Update Contact"
                    : "Save Contact"}
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeForm}
                >
                  Cancel
                </button>
              </form>
            </div>
          )}


          {/* Contact List */}
          {loadingContacts ? (
            <p>Loading trusted contacts...</p>
          ) : contacts.length === 0 ? (
            <div className="empty-state">
              <Users size={35} />
              <h3>No Trusted Contacts Yet</h3>
              <p>Add your family members or friends.</p>
            </div>
          ) : (
            <div className="contacts-grid">
              {contacts.map((contact) => (
                <div className="contact-card" key={contact.id}>
                  <div className="contact-icon">
                    <Users size={25} />
                  </div>

                  <div className="contact-info">
                    <h3>{contact.name}</h3>
                    <p>{contact.phone}</p>
                    <span>{contact.relation}</span>
                  </div>

                  <div className="contact-actions">
                    <button
                      onClick={() => editContact(contact)}
                      title="Edit contact"
                    >
                      <Pencil size={17} />
                    </button>

                    <button
                      onClick={() => deleteContact(contact.id)}
                      title="Delete contact"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>

                  <a href={`tel:${contact.phone}`} className="call-contact">
                    <Phone size={16} />
                    Call
                  </a>
                </div>
              ))}
            </div>
          )}

        </section>


        {/* Safety Map */}
        <section id="safety-map" className="content-section">

          <div className="section-header">
            <div>
              <h2>Safety Map</h2>
              <p>View your location and nearby police stations.</p>
            </div>

            <button
              className="secondary-button"
              onClick={getLocation}
            >
              <MapPin size={17} />
              Refresh Location
            </button>
          </div>


          <div className="map-container">
            {location ? (
              <MapContainer
                center={[location.latitude, location.longitude]}
                zoom={14}
                scrollWheelZoom={true}
                style={{ height: "400px", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Your Current Location */}
                <CircleMarker
                  center={[location.latitude, location.longitude]}
                  radius={10}
                  pathOptions={{
                    color: "#e91e63",
                    fillColor: "#e91e63",
                    fillOpacity: 0.9
                  }}
                >
                  <Popup>
                    Your Current Location
                  </Popup>
                </CircleMarker>


                {/* Nearby Police Stations */}
                {sortedPoliceStations.map((station) => (
                  <CircleMarker
                    key={station.id}
                    center={[station.latitude, station.longitude]}
                    radius={7}
                    pathOptions={{
                      color: "#2563eb",
                      fillColor: "#2563eb",
                      fillOpacity: 0.8
                    }}
                  >
                    <Popup>
                      <strong>{station.name}</strong>
                      <br />
                      Nearby Police Station
                      <br />
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Get Directions
                      </a>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            ) : (
              <div className="map-placeholder">
                <MapPin size={40} />
                <h3>Location Not Available</h3>
                <p>Detect your location to view the safety map.</p>

                <button
                  className="primary-button"
                  onClick={getLocation}
                >
                  Detect Location
                </button>
              </div>
            )}
          </div>


          {/* Nearby Police Stations List */}
          <div className="police-list">
            <h3>Nearby Police Stations</h3>

            {loadingPolice ? (
              <p>Finding nearby police stations...</p>
            ) : policeError ? (
              <p>{policeError}</p>
            ) : sortedPoliceStations.length === 0 ? (
              <p>
                Detect your location to find nearby police stations.
              </p>
            ) : (
              sortedPoliceStations.map((station) => {
                const distance = location
                  ? getDistance(
                      location.latitude,
                      location.longitude,
                      station.latitude,
                      station.longitude
                    )
                  : null;

                return (
                  <div className="police-card" key={station.id}>
                    <div>
                      <h4>{station.name}</h4>
                      <p>
                        {distance !== null
                          ? `${distance.toFixed(2)} km away`
                          : "Distance unavailable"}
                      </p>
                    </div>

                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Directions
                    </a>
                  </div>
                );
              })
            )}
          </div>

        </section>


        {/* Alert History */}
        <section id="alert-history" className="content-section">

          <div className="section-header">
            <div>
              <h2>Alert History</h2>
              <p>View your previously saved SOS demo alerts.</p>
            </div>

            <button
              className="secondary-button"
              onClick={fetchAlerts}
            >
              <Activity size={17} />
              Refresh
            </button>
          </div>


          {loadingAlerts ? (
            <p>Loading alert history...</p>
          ) : alerts.length === 0 ? (
            <div className="empty-state">
              <Bell size={35} />
              <h3>No Alerts Found</h3>
              <p>Your saved SOS alerts will appear here.</p>
            </div>
          ) : (
            <div className="alerts-list">
              {alerts.map((alert, index) => (
                <div
                  className="alert-card"
                  key={alert._id || alert.id || index}
                >
                  <div className="alert-icon">
                    <Bell size={22} />
                  </div>

                  <div className="alert-details">
                    <h3>Emergency SOS Alert</h3>

                    <p>
                      {alert.message || "SafeHer SOS demo alert"}
                    </p>

                    {alert.latitude != null &&
                      alert.longitude != null && (
                        <a
                          href={`https://www.google.com/maps?q=${alert.latitude},${alert.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View Alert Location
                        </a>
                      )}

                    <span>
                      {alert.created_at
                        ? new Date(alert.created_at).toLocaleString()
                        : alert.timestamp
                        ? new Date(alert.timestamp).toLocaleString()
                        : "Date unavailable"}
                    </span>
                  </div>

                  <span className="alert-status">
                    Saved
                  </span>
                </div>
              ))}
            </div>
          )}

        </section>


        {/* Footer */}
        <footer className="app-footer">
          <ShieldCheck size={20} />
          <p>SafeHer – Your Safety, Our Priority.</p>
          <p>In a real emergency, call 112.</p>
        </footer>

      </main>
    </div>
  );
}

export default App;