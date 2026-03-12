import { Link, useLocation, useNavigate } from "react-router-dom";

import AuthForm from "../auth/AuthForm";
import { useAuth } from "../auth/authContext";

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  async function handleLogin(formState) {
    await login(formState);
    navigate(location.state?.from || "/app");
  }

  return (
    <AuthForm
      mode="login"
      title="Log in to your assistant"
      subtitle="Access your private knowledge workspace."
      submitLabel="Login"
      onSubmit={handleLogin}
      fields={[
        { name: "email", label: "Email", type: "email", placeholder: "you@example.com" },
        { name: "password", label: "Password", type: "password", placeholder: "Enter your password" },
      ]}
      footer={
        <p>
          Don&apos;t have an account? <Link to="/signup">Sign up</Link>
        </p>
      }
    />
  );
}

export default LoginPage;
