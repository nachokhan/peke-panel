
import React, { useState } from "react";
import { login } from "../../api";

export default function LoginForm({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      const res = await login(username, password);
      const token = res.data.access_token;
      localStorage.setItem("token", token);
      onLoggedIn(token);
    } catch (e2) {
      setErr("Credenciales inválidas o backend no respondió.");
    }
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        height: "100vh",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "#1f2330",
          padding: "24px",
          borderRadius: "8px",
          border: "1px solid var(--border)",
          width: "300px",
          color: "var(--txt)",
          fontSize: "14px",
          lineHeight: 1.4,
          fontFamily:
            "system-ui,-apple-system,BlinkMacSystemFont,'Inter',Roboto,'Segoe UI',sans-serif",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: "16px" }}>
          Login
        </div>

        {err && (
          <div
            style={{
              color: "#ff7b7b",
              fontSize: "12px",
              marginBottom: "8px",
              textAlign: "center",
            }}
          >
            {err}
          </div>
        )}

        <div style={{ marginBottom: "10px" }}>
          <input
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              background: "#111827",
              color: "var(--txt)",
              fontSize: "14px",
            }}
            placeholder="user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <input
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              background: "#111827",
              color: "var(--txt)",
              fontSize: "14px",
            }}
            type="password"
            placeholder="pass"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          type="submit"
          style={{
            width: "100%",
            padding: "10px",
            background: "#3b82f6",
            border: "none",
            borderRadius: "6px",
            color: "#fff",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 500,
          }}
        >
          Entrar
        </button>
      </form>
    </div>
  );
}
