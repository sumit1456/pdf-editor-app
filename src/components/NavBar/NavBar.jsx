import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { uploadPdfToBackend } from "../../services/PdfBackendService";
import "./NavBar.css";


export default function NavBar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const loadDefaultPdf = async (e) => {
    if (e) e.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    window.showLoading(true, "Fetching Welcome Document...");
    try {
      const pdfUrl = "/docs/Welcome_to_the_Editor.pdf";
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error("Failed to fetch default PDF");

      const blob = await response.blob();
      const file = new File([blob], "Welcome_to_the_Editor.pdf", { type: "application/pdf" });

      window.showLoading(true, "Extracting Scene Graph...");

      // Convert to Base64 for the editor state
      const fileBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
      });

      const jsonOutput = await uploadPdfToBackend(file, 'python');

      if (sidebarOpen) setSidebarOpen(false);

      window.showLoading(false);
      window.showMessage("Success", "Document processed successfully. Opening editor...", "success");

      navigate('/editor', {
        state: {
          sceneGraph: jsonOutput,
          backend: 'python',
          originalPdfBase64: fileBase64,
          pdfName: file.name
        }
      });
    } catch (error) {
      console.error("Error loading default PDF:", error);
      window.showLoading(false);
      window.showMessage("Error", "We couldn't load the document. Please try again or upload manually.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <nav className="nav-bar">
        <div className="left">
          <img src="./images/logo2.png" alt="error" />
          <h1>THE PDF StudIO</h1>
        </div>

        <div className="hamburger" onClick={toggleSidebar}>
          <i className="fa-solid fa-bars"></i>
        </div>

        <div className="list">
          <p><Link to="/">Home</Link></p>
          <p><Link to="/about">About</Link></p>
          <p>
            <a href="#" onClick={loadDefaultPdf} className={isLoading ? 'loading' : ''} style={{ cursor: isLoading ? 'wait' : 'pointer' }}>
              {isLoading ? 'Loading Editor...' : 'PDF Editor ✨'}
            </a>
          </p>
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
        <p>
          <a href="#" onClick={loadDefaultPdf} className={isLoading ? 'loading' : ''} style={{ cursor: isLoading ? 'wait' : 'pointer' }}>
            {isLoading ? 'Loading...' : 'PDF Editor ✨'}
          </a>
        </p>
      </div>

      {/* Overlay */}
      {sidebarOpen && <div className="overlay" onClick={toggleSidebar}></div>}
    </>
  );
}
