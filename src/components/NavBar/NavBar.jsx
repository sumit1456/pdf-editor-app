import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./NavBar.css";





export default function NavBar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <>
      <nav className="nav-bar">
        <div className="left">
          <img src="./web-logo.png" alt="Resume Maker Logo" />
          <h1>Resume Maker</h1>
        </div>

        <div className="hamburger" onClick={toggleSidebar}>
          <i className="fa-solid fa-bars"></i>
        </div>

        <div className="list">
          <p><Link to="/">Home</Link></p>
          <p><Link to="/templates">Templates</Link></p>
          <p><Link to="/about">About</Link></p>
          <p><Link to="/ui-editor/webgl">PDF Editor ✨</Link></p>
        </div>

        <div className="box-icons">
          <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer" aria-label="LinkedIn">
            <i className="fa-brands fa-linkedin-in"></i>
          </a>
          <a href="https://github.com/" target="_blank" rel="noreferrer" aria-label="GitHub">
            <i className="fa-brands fa-github"></i>
          </a>
          <a href="mailto:someone@example.com" aria-label="Email">
            <i className="fa-solid fa-envelope"></i>
          </a>
        </div>
      </nav>

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <p><Link to="/" onClick={toggleSidebar}>Home</Link></p>
        <p><Link to="/templates" onClick={toggleSidebar}>Templates</Link></p>
        <p><Link to="/about" onClick={toggleSidebar}>About</Link></p>
        <p><Link to="/ui-editor/webgl" onClick={toggleSidebar}>PDF Editor ✨</Link></p>
      </div>

      {/* Overlay */}
      {sidebarOpen && <div className="overlay" onClick={toggleSidebar}></div>}
    </>
  );
}
