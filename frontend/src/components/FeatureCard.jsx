import { motion } from "framer-motion";

function FeatureCard({ icon: Icon, title, description, delay = 0 }) {
  return (
    <motion.article
      className="feature-card"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.45, delay }}
    >
      <div className="feature-icon">
        <Icon size={20} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </motion.article>
  );
}

export default FeatureCard;
