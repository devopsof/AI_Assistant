import { useEffect, useState } from "react";
import { BrainCircuit, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/authContext";

function Navbar() {
  const { isAuthenticated } = useAuth();
  const [showStickyCta, setShowStickyCta] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setShowStickyCta(window.scrollY > 420);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={`marketing-navbar ${showStickyCta ? "scrolled" : ""}`}>
      <Link to="/" className="brand-lockup">
        <span className="brand-icon">
          <BrainCircuit size={18} />
        </span>
        <span>Knowledge Assistant</span>
      </Link>

      <nav className="marketing-nav-links">
        <a href="#features">Features</a>
        <a href="#how-it-works">How it works</a>
        <a href="#security">Privacy</a>
        {isAuthenticated ? (
          <Link to="/app" className="primary-link">
            Open App
            <ChevronRight size={16} />
          </Link>
        ) : (
          <>
            <Link to="/login" className="ghost-link">Login</Link>
            <Link to="/signup" className="primary-link">
              Get Started
              <ChevronRight size={16} />
            </Link>
          </>
        )}
        {showStickyCta ? (
          <Link to={isAuthenticated ? "/app" : "/signup"} className="sticky-open-app">
            Open App
            <ChevronRight size={15} />
          </Link>
        ) : null}
      </nav>
    </header>
  );
}

export default Navbar;
