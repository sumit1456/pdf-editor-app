import React from "react";
import { useNavigate } from "react-router-dom";
import "./css-files/AdtrioxHome.css";
import { uploadPdfToBackend } from "../../services/PdfBackendService";

export default function HomePage() {
  const fileInputRef = React.useRef(null);
  const navigate = useNavigate();

  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  const processFile = async (file) => {
    if (file && file.type === "application/pdf") {
      window.showLoading(true, "Extracting Scene Graph...");
      try {
        const fileBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(file);
        });

        const jsonOutput = await uploadPdfToBackend(file);
        window.showLoading(false);
        window.showMessage("Success", "Extraction complete. Document is ready.", "success");

        navigate('/editor', {
          state: {
            sceneGraph: jsonOutput,
            originalPdfBase64: fileBase64,
            pdfName: file.name
          }
        });
      } catch (error) {
        console.error("Error extracting PDF:", error);
        window.showLoading(false);
        window.showMessage("Error", `We encountered an issue while processing your document.`, "error");
      }
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    processFile(file);
  };

  const handleTryDemo = async () => {
    window.showLoading(true, "Loading Demo Document...");
    try {
      const response = await fetch('/docs/Welcome_to_the_Editor.pdf');
      if (!response.ok) throw new Error("Failed to fetch demo file");
      const blob = await response.blob();
      const file = new File([blob], "Welcome_to_the_Editor.pdf", { type: "application/pdf" });
      await processFile(file);
    } catch (error) {
      console.error("Error loading demo:", error);
      window.showLoading(false);
      window.showMessage("Error", "Could not load the demo document.", "error");
    }
  };

  return (
    <div className="home-container">
      <div className="bg-decoration"></div>

      <main className="main-landing">
        <section className="hero-section">
          {/* Floating UI elements acting as feature cards */}
          <div className="floating-ui floating-sidebar">
            <div className="peek-header" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fa-solid fa-microchip" style={{ fontSize: '1rem' }}></i>
              <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>Scene Graph</span>
            </div>
          </div>

          <div className="floating-ui floating-toolbar">
            <div className="peek-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <i className="fa-solid fa-bolt-lightning" style={{ fontSize: '1rem' }}></i>
              <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>Smart Reflow</span>
            </div>
          </div>

          <div className="floating-ui floating-properties">
            <div className="peek-header" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fa-solid fa-layer-group" style={{ fontSize: '1rem' }}></i>
              <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>Clean Export</span>
            </div>
          </div>

          <div className="hero-badge">Studio Engine V1.2</div>

          <h1 className="hero-title">
            THE PDF STUDIO
          </h1>

          <div className="hero-subtitle-container">
            <span className="hero-subtitle-line">A specialized environment for high-precision document reconstruction.</span>
            <span className="hero-subtitle-line">Edit, reflow, and export PDFs with industry-standard mathematical accuracy.</span>
          </div>

          <div className="hero-actions">
            <button className="btn-primary" onClick={handleUploadClick}>
              Upload PDF
            </button>
            <button className="btn-secondary" onClick={handleTryDemo}>
              Try Live Demo
            </button>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf"
            style={{ display: "none" }}
          />
        </section>



        <section className="vision-banner">
          <h3>Native Document Freedom.</h3>
          <p>
            We've built a renderer that doesn't just display PDFs, but understands them.
            By mapping every character and path, we give you the tools to rebuild any
            document from the ground up.
          </p>
        </section>
      </main>
    </div>
  );
}
