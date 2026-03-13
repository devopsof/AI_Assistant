const TECH_LOGOS = [
  "SentenceTransformers",
  "ChromaDB",
  "Groq",
  "FastAPI",
];

function TechStrip() {
  return (
    <section className="tech-strip" aria-label="Built with">
      <p className="hero-kicker">Built With</p>
      <div className="tech-strip-row">
        {TECH_LOGOS.map((item) => (
          <span key={item} className="tech-chip">{item}</span>
        ))}
      </div>
    </section>
  );
}

export default TechStrip;
