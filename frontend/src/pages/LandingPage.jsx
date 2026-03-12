import CTASection from "../landing/CTASection";
import FeaturesSection from "../landing/FeaturesSection";
import HeroSection from "../landing/HeroSection";
import HowItWorks from "../landing/HowItWorks";
import ProductDemoSection from "../landing/ProductDemoSection";
import SecuritySection from "../landing/SecuritySection";
import UseCasesSection from "../landing/UseCasesSection";

function LandingPage() {
  return (
    <main className="marketing-main">
      <HeroSection />
      <ProductDemoSection />
      <FeaturesSection />
      <HowItWorks />
      <UseCasesSection />
      <SecuritySection />
      <CTASection />
    </main>
  );
}

export default LandingPage;
