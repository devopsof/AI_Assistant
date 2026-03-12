import {
  Brain,
  FolderKanban,
  GitBranch,
  Network,
  Search,
} from "lucide-react";

import FeatureCard from "../components/FeatureCard";

const FEATURES = [
  {
    icon: Brain,
    title: "AI Document Intelligence",
    description: "Automatic summaries, topics, entities, and key concepts on every upload.",
  },
  {
    icon: Search,
    title: "Hybrid Retrieval",
    description: "Semantic plus keyword search for grounded, higher-precision answers.",
  },
  {
    icon: Network,
    title: "Knowledge Graph",
    description: "Visualize how collections, documents, topics, and entities connect.",
  },
  {
    icon: FolderKanban,
    title: "Collections",
    description: "Organize knowledge into structured groups that scale with your workspace.",
  },
  {
    icon: GitBranch,
    title: "Cross-Document Insights",
    description: "Synthesize themes and concepts across multiple sources, not just one chunk.",
  },
];

function FeaturesSection() {
  return (
    <section id="features" className="marketing-section">
      <div className="section-heading">
        <p className="hero-kicker">Features</p>
        <h2>Built for real knowledge work</h2>
        <p>
          This is more than a PDF chatbot. It is an assistant app with retrieval,
          organization, synthesis, and visual exploration built in.
        </p>
      </div>
      <div className="feature-grid">
        {FEATURES.map((feature, index) => (
          <FeatureCard key={feature.title} {...feature} delay={index * 0.06} />
        ))}
      </div>
    </section>
  );
}

export default FeaturesSection;
