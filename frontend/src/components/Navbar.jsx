import { BrainCircuit, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../auth/authContext";

function Navbar() {
  const { isAuthenticated } = useAuth();

  return (
    <header className="marketing-navbar">
      <Link to="/" className="brand-lockup">
        <span className="brand-icon">
          <BrainCircuit size={18} />
        </span>
        <span>Knowledge Assistant</span>
      </Link>

      <nav className="marketing-nav-links">
        <a href="#features">Features</a>
        <a href="#how-it-works">How it works</a>
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
      </nav>
    </header>
  );
}

export default Navbar;
