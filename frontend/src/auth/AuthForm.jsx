import { useState } from "react";

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
      <form className="auth-card" onSubmit={handleSubmit}>
        <p className="hero-kicker">{mode === "login" ? "Welcome back" : "Create account"}</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>

        <div className="auth-fields">
          {fields.map((field) => (
            <label key={field.name} className="auth-field">
              <span>{field.label}</span>
              <input
                type={field.type}
                value={formState[field.name]}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
                placeholder={field.placeholder}
              />
            </label>
          ))}
        </div>

        {errorMessage ? <p className="composer-status">{errorMessage}</p> : null}

        <button type="submit" className="primary-button auth-submit" disabled={isSubmitting}>
          {isSubmitting ? "Please wait..." : submitLabel}
        </button>
        <div className="auth-footer">{footer}</div>
      </form>
    </section>
  );
}

export default AuthForm;
