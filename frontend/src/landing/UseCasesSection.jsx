import { motion } from "framer-motion";

const USE_CASES = [
  {
    title: "Students",
    description: "Organize research papers, lecture notes, and summaries in one private study system.",
  },
  {
    title: "Engineers",
    description: "Interrogate technical documents, architecture notes, and incident writeups faster.",
  },
  {
    title: "Writers",
    description: "Extract insights from drafts, notebooks, references, and long-form idea collections.",
  },
];

function UseCasesSection() {
  return (
    <section className="marketing-section">
      <div className="section-heading">
        <p className="hero-kicker">Use Cases</p>
        <h2>Built for real-world knowledge work</h2>
      </div>

      <div className="use-case-grid">
        {USE_CASES.map((useCase, index) => (
          <motion.article
            key={useCase.title}
            className="feature-card"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.45, delay: index * 0.05 }}
          >
            <h3>{useCase.title}</h3>
            <p>{useCase.description}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

export default UseCasesSection;
