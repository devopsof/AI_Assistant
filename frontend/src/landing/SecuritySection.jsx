function SecuritySection() {
  return (
    <section className="marketing-section security-section">
      <div className="section-heading">
        <p className="hero-kicker">Privacy</p>
        <h2>Designed for trust from day one</h2>
      </div>

      <div className="security-grid">
        <div className="feature-card">
          <h3>Your knowledge stays private</h3>
          <p>Keep documents, notes, and collections inside a protected assistant workspace.</p>
        </div>
        <div className="feature-card">
          <h3>Local-first architecture</h3>
          <p>The current product runs locally with clean Docker deployment paths for later cloud rollout.</p>
        </div>
        <div className="feature-card">
          <h3>Clear upgrade path</h3>
          <p>Auth, storage, and deployment are structured so Cognito, S3, and ECS can drop in later.</p>
        </div>
      </div>
    </section>
  );
}

export default SecuritySection;
