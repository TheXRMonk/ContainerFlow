import { useState } from "react";
import { Lock, Eye, EyeOff, Terminal } from "lucide-react";
import { useT } from "../i18n";

interface LoginScreenProps {
  onAuth: (token: string) => void;
}

export function LoginScreen({ onAuth }: LoginScreenProps) {
  const { t } = useT();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);

  const hackerLog = (lines: string[], onDone: () => void) => {
    lines.forEach((line, i) => {
      setTimeout(() => {
        setLogLines((prev) => [...prev, line]);
        if (i === lines.length - 1) setTimeout(onDone, 400);
      }, i * 180);
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (connecting) return;
    setConnecting(true);
    setError("");
    setLogLines([]);

    hackerLog([
      "$ containerflow connect --auth",
      `> ${t("login.establishingConnection")}`,
      `> ${t("login.validatingToken")}`,
    ], async () => {
      try {
        const res = await fetch("/api/health", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          hackerLog([
            `> ${t("login.tokenAccepted")}`,
            `> ${t("login.loadingDocker")}`,
            `> ${t("login.connectionEstablished")}`,
          ], () => {
            localStorage.setItem("df:token", token);
            setConnected(true);
            setTimeout(() => onAuth(token), 800);
          });
        } else {
          hackerLog([`> ${t("login.errorInvalidToken")}`, `> ${t("login.errorConnectionRefused")}`], () => {
            setError(t("login.invalidToken"));
            setConnecting(false);
          });
        }
      } catch {
        hackerLog([`> ${t("login.errorConnectionFailed")}`], () => {
          setError(t("login.connectionFailed"));
          setConnecting(false);
        });
      }
    });
  };

  return (
    <div className={`h-screen w-screen bg-slate-950 flex items-center justify-center transition-opacity duration-700 ${connected ? "opacity-0" : "opacity-100"}`}>
      <div className="flex flex-col items-center gap-6 w-80">
        {/* Logo + Title */}
        <img
          src="/alteonx-logo.webp"
          alt="ContainerFlow"
          className={`w-16 h-16 transition-all duration-700 ${connected ? "scale-110" : ""}`}
          style={{ filter: "brightness(0) saturate(100%) invert(45%) sepia(85%) saturate(2000%) hue-rotate(200deg) brightness(1.1)" }}
        />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-wide">ContainerFlow</h1>
          <span className="text-xs text-cyan-400 tracking-widest uppercase">AlteonX</span>
        </div>

        {/* Form */}
        <form onSubmit={submit} className={`flex flex-col gap-3 w-full transition-opacity duration-300 ${connecting ? "opacity-50 pointer-events-none" : ""}`}>
          <div className="relative">
            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => { setToken(e.target.value); setError(""); }}
              placeholder="AUTH_TOKEN"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-10 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
              autoFocus
              disabled={connecting}
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {error && <span className="text-red-400 text-xs font-mono">{error}</span>}
          <button
            type="submit"
            disabled={connecting || !token}
            className={`w-full flex items-center justify-center gap-2 text-sm font-medium py-2.5 rounded-lg transition-all duration-300 ${
              connecting
                ? "bg-slate-800 text-slate-500 cursor-wait"
                : "bg-cyan-600 hover:bg-cyan-500 text-white hover:shadow-lg hover:shadow-cyan-500/20"
            }`}
          >
            <Terminal size={14} />
            {connecting ? t("login.connecting") : t("login.connect")}
          </button>
        </form>

        {/* Terminal log */}
        {logLines.length > 0 && (
          <div className="w-full bg-slate-900/80 border border-slate-800 rounded-lg p-3 font-mono text-[11px] space-y-0.5 max-h-32 overflow-y-auto">
            {logLines.map((line, i) => (
              <div
                key={i}
                className={`${
                  line.includes("ERROR") ? "text-red-400" :
                  line.includes("accepted") || line.includes("established") || line.includes("aceptado") || line.includes("establecida") ? "text-emerald-400" :
                  line.startsWith("$") ? "text-cyan-400" : "text-slate-400"
                } animate-[fadeIn_0.15s_ease-out]`}
              >
                {line}
                {i === logLines.length - 1 && !connected && (
                  <span className="inline-block w-1.5 h-3 bg-cyan-400 ml-1 animate-pulse" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
