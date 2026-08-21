import { useState } from "react";
import {
  ArrowRight,
  Bike,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Navigation,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { loginUser, registerUser } from "./auth";
import { cognodbConfigured } from "./cognodb";

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (mode === "register" && name.trim().length < 2) {
      setError("Enter your name.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const user =
        mode === "register"
          ? await registerUser({ name, email, password })
          : await loginUser({ email, password });
      onAuthenticated(user);
    } catch (authError) {
      setError(authError.message);
    } finally {
      setLoading(false);
    }
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="auth-brand">
          <span>
            <Navigation size={23} />
          </span>
          rove <small>TRIP OS</small>
        </div>
        <div className="auth-story-copy">
          <p className="eyebrow">
            <Sparkles size={13} /> Built for the road ahead
          </p>
          <h1>
            Your next great ride
            <br />
            starts here.
          </h1>
          <p>
            Motorcycle-aware routes, weather-smart timing and a complete trip
            budget—all in one place.
          </p>
          <div className="auth-points">
            <span>
              <i>
                <Bike size={16} />
              </i>
              <b>Routes built for two wheels</b>
              <small>Distance, elevation, petrol and turn guidance</small>
            </span>
            <span>
              <i>
                <Sparkles size={16} />
              </i>
              <b>Smart itinerary generation</b>
              <small>Food, stays and sights fitted around your ride</small>
            </span>
            <span>
              <i>
                <ShieldCheck size={16} />
              </i>
              <b>Your plans, kept private</b>
              <small>
                {cognodbConfigured
                  ? "Trips and rider data sync through CognoDB"
                  : "CognoDB connection is unavailable"}
              </small>
            </span>
          </div>
        </div>
        <div className="auth-route-art">
          <span className="art-city">Bengaluru</span>
          <i />
          <i />
          <i />
          <span className="art-destination">
            <Navigation size={13} /> Nandi Hills
          </span>
        </div>
      </section>
      <section className="auth-form-side">
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-mobile-brand">
            <span>
              <Navigation size={18} />
            </span>{" "}
            rove
          </div>
          <p className="eyebrow">
            <LockKeyhole size={13} /> Rider account
          </p>
          <h2>{mode === "login" ? "Welcome back." : "Create your account."}</h2>
          <p className="auth-subtitle">
            {mode === "login"
              ? "Sign in to continue planning your rides."
              : "Save journeys and keep every trip in one place."}
          </p>
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => changeMode("login")}
            >
              Log in
            </button>
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              onClick={() => changeMode("register")}
            >
              Register
            </button>
          </div>
          {mode === "register" && (
            <label className="auth-field">
              <span>FULL NAME</span>
              <div>
                <UserRound size={16} />
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                />
              </div>
            </label>
          )}
          <label className="auth-field">
            <span>EMAIL</span>
            <div>
              <Mail size={16} />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="rider@example.com"
              />
            </div>
          </label>
          <label className="auth-field">
            <span>PASSWORD</span>
            <div>
              <LockKeyhole size={16} />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Show password"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          {mode === "register" && (
            <label className="auth-field">
              <span>CONFIRM PASSWORD</span>
              <div>
                <Check size={16} />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat password"
                />
              </div>
            </label>
          )}
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-submit" disabled={loading}>
            {loading
              ? "Securing your account…"
              : mode === "login"
                ? "Log in to Rove"
                : "Create account"}
            <ArrowRight size={16} />
          </button>
          <p
            className={`auth-privacy ${cognodbConfigured ? "cloud-ready" : ""}`}
          >
            <ShieldCheck size={13} />{" "}
            {cognodbConfigured
              ? "Your rider account and trip data are stored in the CognoDB graph."
              : "Connect CognoDB to enable rider accounts and trip sync."}
          </p>
        </form>
      </section>
    </main>
  );
}

export default AuthScreen;
