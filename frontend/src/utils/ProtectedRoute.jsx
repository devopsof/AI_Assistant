/**
 * Auth DISABLED — ProtectedRoute always renders children directly.
 * No login redirect.
 */
function ProtectedRoute({ children }) {
  return children;
}

export default ProtectedRoute;