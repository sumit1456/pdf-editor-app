import React from "react";
import { useNavigate } from "react-router-dom";
import "./css-files/HomePage2.css";
import { uploadPdfToBackend } from "../../services/PdfBackendService";

export default function HomePage() {
  const fileInputRef = React.useRef(null);
  const navigate = useNavigate();
  const [backend, setBackend] = React.useState('python'); // 'python' or 'java'

  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (file && file.type === "application/pdf") {
      try {
        console.log(`PDF Selected (${backend}):`, file.name);
        const jsonOutput = await uploadPdfToBackend(file, backend);
        console.log("Extracted Scene Graph JSON:", jsonOutput);

        // Navigate to the editor with the data and backend type
        navigate('/editor', { state: { sceneGraph: jsonOutput, backend } });
      } catch (error) {
        console.error("Error extracting PDF:", error);
        alert(`Failed to extract PDF. Make sure the ${backend} backend is running.`);
      }
    }
  };

  return (
    <div className="home-container">
      {/* Animated background elements */}
      <div className="bg-decoration">
        <div className="floating-shape shape-1"></div>
        <div className="floating-shape shape-2"></div>
      </div>

      <div className="main-landing">
        <header className="hero-section">
          <div className="hero-badge">Next Gen PDF Engine</div>

          <h1 className="hero-title">
            THE PDF <span className="highlight">STUDIO</span>
          </h1>

          <p className="hero-subtitle">
            Professional-grade PDF editing without the DOM.
            Harness the power of WebGL and high-fidelity extraction.
          </p>

          <div className="backend-toggle-container">
            <span className={`toggle-label ${backend === 'python' ? 'active' : ''}`} onClick={() => setBackend('python')}>
              Python <small>Native</small>
            </span>
            <span className={`toggle-label ${backend === 'java' ? 'active' : ''}`} onClick={() => setBackend('java')}>
              Java <small>Legacy</small>
            </span>
            <div className={`toggle-switch-multi ${backend}`}>
              <div className="switch-handle"></div>
            </div>
          </div>
        </header>

        <section className="action-area">
          <div className="upload-zone" onClick={handleUploadClick}>
            <div className="upload-icon">
              <i className="fa-solid fa-cloud-arrow-up"></i>
            </div>
            <div className="upload-text">
              <h3>Drop your resume here</h3>
              <p>or click to browse your files</p>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf"
              style={{ display: "none" }}
            />
          </div>
          <p className="hint-text">Supported format: PDF (Max 10MB)</p>
        </section>

        <section className="features-section">
          <div className="feature-card">
            <div className="feature-icon">
              <i className="fa-solid fa-microchip"></i>
            </div>
            <h3>Scene Graph Extraction</h3>
            <p>Converts raw PDF data into structured, editable JSON nodes with layout awareness.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <i className="fa-solid fa-bolt-lightning"></i>
            </div>
            <h3>WebGL Rendering</h3>
            <p>Lightning fast rendering using PixiJS for a smooth, high-fidelity experience.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              <i className="fa-solid fa-layer-group"></i>
            </div>
            <h3>DOM-less Architecture</h3>
            <p>Pure mathematical layout engine for pixel-perfect results on any browser.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
