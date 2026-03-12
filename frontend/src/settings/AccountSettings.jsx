function AccountSettings({ preferences, onChange, onSave }) {
  return (
    <section className="settings-section-card">
      <div className="settings-section-header">
        <div>
          <p className="sidebar-group-title">Account</p>
          <h4>Workspace preferences</h4>
        </div>
      </div>

      <div className="settings-form-grid">
        <label className="auth-field">
          <span>Default collection</span>
          <input
            type="text"
            value={preferences.defaultCollection}
            onChange={(event) => onChange("defaultCollection", event.target.value)}
            placeholder="General"
          />
        </label>
        <label className="auth-field">
          <span>Theme</span>
          <select
            value={preferences.theme}
            onChange={(event) => onChange("theme", event.target.value)}
          >
            <option value="light">Light</option>
            <option value="system">System</option>
          </select>
        </label>
        <label className="auth-field">
          <span>Language</span>
          <select
            value={preferences.language}
            onChange={(event) => onChange("language", event.target.value)}
          >
            <option value="en">English</option>
            <option value="en-in">English (India)</option>
          </select>
        </label>
      </div>

      <div className="settings-toggle-stack">
        <label className="settings-row">
          <div>
            <strong>Enable Knowledge Graph</strong>
            <p className="subtle-copy">Show visual document-topic-entity relationships.</p>
          </div>
          <input
            type="checkbox"
            checked={preferences.enableKnowledgeGraph}
            onChange={(event) => onChange("enableKnowledgeGraph", event.target.checked)}
          />
        </label>

        <label className="settings-row">
          <div>
            <strong>Enable Debug Mode</strong>
            <p className="subtle-copy">Reveal retrieval timings and confidence metrics.</p>
          </div>
          <input
            type="checkbox"
            checked={preferences.enableDebugMode}
            onChange={(event) => onChange("enableDebugMode", event.target.checked)}
          />
        </label>
      </div>

      <div className="settings-actions">
        <button type="button" className="primary-button" onClick={onSave}>
          Save Preferences
        </button>
      </div>
    </section>
  );
}

export default AccountSettings;
