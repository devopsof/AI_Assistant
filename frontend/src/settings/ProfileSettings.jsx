function ProfileSettings({ profile, onChange, onSave }) {
  return (
    <section className="settings-section-card">
      <div className="settings-section-header">
        <div>
          <p className="sidebar-group-title">Profile</p>
          <h4>Your account details</h4>
        </div>
      </div>

      <div className="settings-form-grid">
        <label className="auth-field">
          <span>Profile picture</span>
          <input
            type="text"
            value={profile.avatar}
            onChange={(event) => onChange("avatar", event.target.value)}
            placeholder="Paste an image URL"
          />
        </label>
        <label className="auth-field">
          <span>Name</span>
          <input
            type="text"
            value={profile.name}
            onChange={(event) => onChange("name", event.target.value)}
            placeholder="Your name"
          />
        </label>
        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            value={profile.email}
            onChange={(event) => onChange("email", event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="auth-field">
          <span>Bio</span>
          <textarea
            rows={4}
            value={profile.bio}
            onChange={(event) => onChange("bio", event.target.value)}
            placeholder="Tell people what you use this assistant for"
          />
        </label>
      </div>

      <div className="settings-actions">
        <button type="button" className="primary-button" onClick={onSave}>
          Save Changes
        </button>
      </div>
    </section>
  );
}

export default ProfileSettings;
