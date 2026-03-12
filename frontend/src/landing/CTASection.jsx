import { Link } from "react-router-dom";

function CTASection() {
  return (
    <section className="cta-section">
      <p className="hero-kicker">Get Started</p>
      <h2>Start building your personal knowledge system today.</h2>
      <p>
        Organize collections, upload source material, and ask grounded questions over
        everything you know.
      </p>
      <Link to="/signup" className="primary-link">Create Account</Link>
    </section>
  );
}

export default CTASection;
