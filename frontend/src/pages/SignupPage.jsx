import { Link, useNavigate } from "react-router-dom";

import AuthForm from "../auth/AuthForm";
import { useAuth } from "../auth/authContext";

function SignupPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();

  async function handleSignup(formState) {
    await signup(formState);
    navigate("/app");
  }

  return (
    <AuthForm
      mode="signup"
      title="Create your account"
      subtitle="Start building a private AI-powered knowledge base."
      submitLabel="Create Account"
      onSubmit={handleSignup}
      fields={[
        { name: "name", label: "Name", type: "text", placeholder: "Your name" },
        { name: "email", label: "Email", type: "email", placeholder: "you@example.com" },
        { name: "password", label: "Password", type: "password", placeholder: "Create a password" },
        { name: "confirmPassword", label: "Confirm password", type: "password", placeholder: "Confirm your password" },
      ]}
      footer={
        <p>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      }
    />
  );
}

export default SignupPage;
