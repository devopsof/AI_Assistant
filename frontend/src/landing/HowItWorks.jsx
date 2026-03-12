import { motion } from "framer-motion";

const STEPS = [
  {
    title: "Upload documents",
    description: "Bring in notes, PDFs, and markdown files into collections inside your workspace.",
  },
  {
    title: "Ask questions",
    description: "Use hybrid retrieval and conversation-aware querying to find the right context.",
  },
  {
    title: "Discover insights",
    description: "Explore cross-document synthesis, source trails, and a document-centric knowledge map.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="marketing-section">
      <div className="section-heading">
        <p className="hero-kicker">How It Works</p>
        <h2>Three simple steps</h2>
      </div>
      <div className="timeline-grid">
        {STEPS.map((step, index) => (
          <motion.article
            key={step.title}
            className="timeline-card"
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.45, delay: index * 0.08 }}
          >
            <span className="timeline-step">{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

export default HowItWorks;
