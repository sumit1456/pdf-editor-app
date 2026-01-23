import React, { useEffect, useState } from "react";

export default function BackendWakePopup() {
  const [visible, setVisible] = useState(true);
  const [message, setMessage] = useState("Waking up server… please wait It takes around 2-3 minutes to wake service. Thank You for your patience ");

  useEffect(() => {
    let interval;

    const checkServer = async () => {
      try {
        const res = await fetch("https://resumemaker-1.onrender.com/ping", {
          method: "GET",
          cache: "no-store",
        });

        const text = await res.text();

        // SUCCESS → hide popup and stop checking
        if (text.toLowerCase().includes("server is running")) {
          setMessage("Server is awake! Loading…");

          setTimeout(() => {
            setVisible(false); // hide permanently
            clearInterval(interval); // stop further checks
          }, 800);
        }

      } catch (err) {
        setMessage("Server is starting… this may take a few seconds");
      }
    };

    // First call
    checkServer();

    // Only keep checking until it wakes
    interval = setInterval(checkServer, 4000);

    return () => clearInterval(interval);
  }, []);

  if (!visible) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.popup}>
        <div style={styles.spinner}></div>
        <p style={styles.text}>{message}</p>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",       // 🔥 makes popup non-blocking
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    background: "rgba(0,0,0,0.5)",
  },
  popup: {
    background: "#0b0b0b",
    color: "white",
    padding: "25px",
    borderRadius: "12px",
    textAlign: "center",
    width: "300px",
    border: "1px solid #222",
    pointerEvents: "auto",        // popup itself is clickable (if needed)
  },
  spinner: {
    width: "40px",
    height: "40px",
    border: "4px solid #444",
    borderTopColor: "#fff",
    borderRadius: "50%",
    margin: "auto",
    animation: "spinAnim 1s linear infinite",
  },
  text: {
    marginTop: "15px",
    fontSize: "14px",
  },
};

// Spinner animation safely added globally
const styleEl = document.createElement("style");
styleEl.innerHTML = `
@keyframes spinAnim {
  to { transform: rotate(360deg); }
}`;
document.head.appendChild(styleEl);
