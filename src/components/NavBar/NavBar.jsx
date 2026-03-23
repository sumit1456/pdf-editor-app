import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { uploadPdfToBackend } from "../../services/PdfBackendService";
import ThemeToggle from "../ThemeToggle/ThemeToggle";
import "./AdtrioxNavBar.css";


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
        <div className="left" onClick={() => navigate('/')}>
          <div className="logo-icon"></div>
          <h1>pdf<span>studio</span></h1>
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

        <div className="right-actions">
          <ThemeToggle />
          <a
            href="https://mail.google.com/mail/?view=cm&fs=1&to=sumithatekar067@gmail.com&su=Feedback%20for%20THE%20PDF%20STUDIO"
            target="_blank"
            rel="noopener noreferrer"
            className="contact-btn"
          >
            Feedback
          </a>
        </div>
      </nav>

      {/* Sidebar for Mobile */}
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="left">
            <div className="logo-icon"></div>
            <h1>pdfstudio</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <ThemeToggle />
            <div className="close-btn" onClick={toggleSidebar}><i className="fa-solid fa-xmark"></i></div>
          </div>
        </div>
        <div className="sidebar-links">
          <Link to="/" onClick={toggleSidebar}><i className="fa-solid fa-house"></i> Home</Link>
          <Link to="/about" onClick={toggleSidebar}><i className="fa-solid fa-circle-info"></i> About</Link>
          <a href="#" onClick={(e) => { toggleSidebar(); loadDefaultPdf(e); }} className={isLoading ? 'loading' : ''}>
            <i className="fa-solid fa-file-pen"></i> PDF Editor ✨
          </a>
          <a
            href="https://mail.google.com/mail/?view=cm&fs=1&to=sumithatekar067@gmail.com&su=Feedback%20for%20THE%20PDF%20STUDIO"
            target="_blank"
            rel="noopener noreferrer"
            className="contact-btn"
            style={{ textAlign: 'center', marginTop: '20px' }}
            onClick={toggleSidebar}
          >
            Feedback
          </a>
        </div>
      </div>

      {/* Overlay */}
      {sidebarOpen && <div className="overlay" onClick={toggleSidebar}></div>}
    </>
  );
}
