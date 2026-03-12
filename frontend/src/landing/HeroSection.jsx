import { motion } from "framer-motion";
import { Link } from "react-router-dom";

function HeroSection() {
  return (
    <section className="hero-section">
      <motion.div
        className="hero-copy"
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55 }}
      >
        <p className="hero-kicker">Personal AI Knowledge Assistant</p>
        <h1>Your personal AI knowledge assistant.</h1>
        <p>
          Upload documents, notes, and research. Ask questions and discover insights
          across your entire knowledge base with hybrid retrieval, synthesis, and a
          clean knowledge graph.
        </p>
        <div className="hero-actions">
          <Link to="/signup" className="primary-link">Get Started</Link>
          <a href="#how-it-works" className="ghost-link">View Demo</a>
        </div>
      </motion.div>

      <motion.div
        className="hero-preview"
        initial={{ opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.08 }}
      >
        <div className="preview-window">
          <div className="preview-bar">
            <span />
            <span />
            <span />
          </div>
          <div className="preview-grid">
            <aside>
              <p>Collections</p>
              <strong>DevOps</strong>
              <strong>Research</strong>
              <strong>System Design</strong>
            </aside>
            <main>
              <div className="preview-bubble assistant">Kubernetes coordinates containers across clusters.</div>
              <div className="preview-bubble user">What themes appear across my DevOps notes?</div>
              <div className="preview-tags">
                <span>Kubernetes</span>
                <span>Containers</span>
                <span>Scaling</span>
              </div>
            </main>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

export default HeroSection;
