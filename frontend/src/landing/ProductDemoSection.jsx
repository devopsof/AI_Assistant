import { motion } from "framer-motion";

const DEMOS = [
  {
    title: "Ask questions across your documents",
    description: "Chat with workspace collections using grounded retrieval, synthesis, and citations.",
  },
  {
    title: "Explore knowledge visually",
    description: "Follow document, topic, and entity relationships from a clean knowledge map.",
  },
  {
    title: "Discover hidden insights",
    description: "See summaries, concepts, and cross-document themes as soon as files are uploaded.",
  },
];

function ProductDemoSection() {
  return (
    <section className="marketing-section product-demo-section">
      <div className="section-heading">
        <p className="hero-kicker">Product Demo</p>
        <h2>See the product before you sign in</h2>
      </div>

      <div className="demo-grid">
        {DEMOS.map((item, index) => (
          <motion.article
            key={item.title}
            className="demo-card"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.4, delay: index * 0.06 }}
          >
            <div className="demo-window">
              <span />
              <span />
              <span />
            </div>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

export default ProductDemoSection;
