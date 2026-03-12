import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, UserCircle2, Wrench, LogOut } from "lucide-react";

import { useAuth } from "../auth/authContext";
import AccountSettings from "../settings/AccountSettings";
import ProfileSettings from "../settings/ProfileSettings";

const SETTINGS_STORAGE_KEY = "knowledge_assistant_settings";

function readStoredSettings(user) {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const scoped = user?.email ? parsed[user.email] || {} : {};

    return {
      profile: {
        avatar: scoped.profile?.avatar || "",
        name: scoped.profile?.name || user?.name || "",
        email: scoped.profile?.email || user?.email || "",
        bio: scoped.profile?.bio || "",
      },
      preferences: {
        defaultCollection: scoped.preferences?.defaultCollection || "General",
        theme: scoped.preferences?.theme || "light",
        language: scoped.preferences?.language || "en",
        enableKnowledgeGraph: scoped.preferences?.enableKnowledgeGraph ?? true,
        enableDebugMode: scoped.preferences?.enableDebugMode ?? false,
      },
    };
  } catch (_error) {
    return {
      profile: {
        avatar: "",
        name: user?.name || "",
        email: user?.email || "",
        bio: "",
      },
      preferences: {
        defaultCollection: "General",
        theme: "light",
        language: "en",
        enableKnowledgeGraph: true,
        enableDebugMode: false,
      },
    };
  }
}

function SettingsPage({ developerMode, onDeveloperModeChange, onClose }) {
  const { logout, user } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [saveMessage, setSaveMessage] = useState("");
  const initialState = useMemo(() => readStoredSettings(user), [user]);
  const [profile, setProfile] = useState(initialState.profile);
  const [preferences, setPreferences] = useState(initialState.preferences);

  useEffect(() => {
    setProfile(initialState.profile);
    setPreferences(initialState.preferences);
  }, [initialState]);

  useEffect(() => {
    setPreferences((current) => ({
      ...current,
      enableDebugMode: developerMode,
    }));
  }, [developerMode]);

  function persist(nextProfile, nextPreferences, message) {
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (user?.email) {
        parsed[user.email] = {
          profile: nextProfile,
          preferences: nextPreferences,
        };
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(parsed));
      }
      setSaveMessage(message);
      window.setTimeout(() => setSaveMessage(""), 2200);
    } catch (_error) {
      setSaveMessage("Could not save settings locally.");
    }
  }

  function handleProfileChange(field, value) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  function handlePreferenceChange(field, value) {
    setPreferences((current) => ({ ...current, [field]: value }));
    if (field === "enableDebugMode") {
      onDeveloperModeChange(Boolean(value));
    }
  }

  function handleLogout() {
    logout();
    onClose({ redirectToLanding: true });
  }

  const tabs = [
    { id: "profile", label: "Profile", icon: UserCircle2 },
    { id: "account", label: "Account", icon: Wrench },
    { id: "security", label: "Security", icon: ShieldCheck },
    { id: "logout", label: "Logout", icon: LogOut },
  ];

  return (
    <div className="settings-shell">
      <div className="drawer-header">
        <div>
          <p className="sidebar-group-title">System</p>
          <h3>Settings</h3>
        </div>
        <button type="button" className="secondary-button" onClick={() => onClose()}>
          Close
        </button>
      </div>

      <div className="settings-layout">
        <aside className="settings-tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                className={`settings-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </aside>

        <div className="settings-content">
          {saveMessage ? <p className="composer-status">{saveMessage}</p> : null}

          {activeTab === "profile" ? (
            <ProfileSettings
              profile={profile}
              onChange={handleProfileChange}
              onSave={() => persist(profile, preferences, "Profile updated")}
            />
          ) : null}

          {activeTab === "account" ? (
            <AccountSettings
              preferences={preferences}
              onChange={handlePreferenceChange}
              onSave={() => persist(profile, preferences, "Preferences updated")}
            />
          ) : null}

          {activeTab === "security" ? (
            <section className="settings-section-card">
              <div className="settings-section-header">
                <div>
                  <p className="sidebar-group-title">Security</p>
                  <h4>Privacy and access</h4>
                </div>
              </div>

              <div className="detail-group">
                <strong>Your knowledge stays private</strong>
                <p className="subtle-copy">
                  This local-first build stores auth, profile preferences, and workspace context
                  in browser storage for now. You can swap this layer to Cognito later without
                  changing the product flow.
                </p>
              </div>

              <div className="future-slot">
                <p className="sidebar-group-title">Next integration</p>
                <ul>
                  <li>AWS Cognito sign-in and sign-out</li>
                  <li>Managed user profiles</li>
                  <li>Team access control</li>
                </ul>
              </div>
            </section>
          ) : null}

          {activeTab === "logout" ? (
            <section className="settings-section-card">
              <div className="settings-section-header">
                <div>
                  <p className="sidebar-group-title">Logout</p>
                  <h4>End this session</h4>
                </div>
              </div>
              <p className="subtle-copy">
                This will clear the local mock session and send you back to the public landing page.
              </p>
              <div className="settings-actions">
                <button type="button" className="danger-button" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
