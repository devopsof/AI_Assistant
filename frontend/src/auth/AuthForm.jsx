import { useMemo, useState } from "react";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, MailCheck } from "lucide-react";
import { motion } from "framer-motion";

function AuthForm({
  mode = "login",
  title,
  subtitle,
  fields,
  submitLabel,
  onSubmit,
  footer,
}) {
  const [formState, setFormState] = useState(
    Object.fromEntries(fields.map((field) => [field.name, ""]))
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const emailValid = /\S+@\S+\.\S+/.test(formState.email || "");
  const passwordStrength = useMemo(() => {
    const password = formState.password || "";
    if (password.length >= 10 && /[A-Z]/.test(password) && /\d/.test(password)) {
      return "Strong";
    }
    if (password.length >= 8) {
      return "Good";
    }
    return password ? "Weak" : "";
  }, [formState.password]);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      setIsSubmitting(true);
      setErrorMessage("");
      await onSubmit(formState);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="auth-shell">
      <motion.div
        className="auth-layout"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <aside className="auth-brand-panel">
          <p className="hero-kicker">Knowledge Assistant</p>
          <h2>Upload documents, ask smarter questions, and discover connected insights.</h2>
          <p>
            A private AI workspace for notes, research, and technical documents.
          </p>
          <div className="auth-brand-quote">
            <strong>{mode === "login" ? "Welcome back." : "Start your workspace."}</strong>
            <span>Hybrid retrieval, collections, graph exploration, and grounded answers.</span>
          </div>
        </aside>

        <form className="auth-card" onSubmit={handleSubmit}>
          <p className="hero-kicker">{mode === "login" ? "Welcome back" : "Create account"}</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>

          <button type="button" className="oauth-button">
            <MailCheck size={16} />
            Continue with Google
          </button>

          <div className="auth-divider"><span>or continue with email</span></div>

          <div className="auth-fields">
            {fields.map((field) => {
              const isPasswordField = field.type === "password";
              const type = isPasswordField && showPassword ? "text" : field.type;

              return (
                <label key={field.name} className="auth-field">
                  <span>{field.label}</span>
                  <div className="auth-input-wrap">
                    <input
                      type={type}
                      value={formState[field.name]}
                      onChange={(event) =>
                        setFormState((current) => ({
                          ...current,
                          [field.name]: event.target.value,
                        }))
                      }
                      placeholder={field.placeholder}
                    />
                    {field.name === "email" && emailValid ? (
                      <CheckCircle2 size={16} className="field-icon success" />
                    ) : null}
                    {isPasswordField ? (
                      <button
                        type="button"
                        className="field-visibility"
                        onClick={() => setShowPassword((current) => !current)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    ) : null}
                  </div>
                  {field.name === "password" && mode === "signup" && passwordStrength ? (
                    <small className={`password-strength ${passwordStrength.toLowerCase()}`}>
                      Password strength: {passwordStrength}
                    </small>
                  ) : null}
                </label>
              );
            })}
          </div>

          {errorMessage ? <p className="composer-status">{errorMessage}</p> : null}

          <button type="submit" className="primary-button auth-submit" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle size={16} className="spin" /> : null}
            <span>{isSubmitting ? "Please wait..." : submitLabel}</span>
          </button>
          <div className="auth-footer prominent-link">{footer}</div>
        </form>
      </motion.div>
    </section>
  );
}

export default AuthForm;
