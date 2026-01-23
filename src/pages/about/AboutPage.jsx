import React from 'react';
import './AboutPage.css';

const AboutPage = () => {
    return (
        <div className="about-container">
            {/* Background decoration matching HomePage */}
            <div className="bg-decoration">
                <div className="floating-shape shape-1"></div>
            </div>

            <div className="about-content">
                <header className="about-hero fade-in-up">
                    <div className="status-badge">Version 1.0 (Early Release)</div>
                    <h1>
                        THE PDF <span className="highlight">STUDIO</span>
                    </h1>
                    <p>
                        A high-fidelity PDF engine built for the modern web.
                        We leverage DOM SVG technology to provide pixel-perfect text rendering and professional editing tools
                        using precision-mapped layouts.
                    </p>
                </header>

                <section className="about-section fade-in-up" style={{ animationDelay: '0.2s' }}>
                    <div className="section-grid">
                        <div className="info-card">
                            <h3><i className="fa-solid fa-bolt"></i> What it can do</h3>
                            <ul>
                                <li>
                                    <i className="fa-solid fa-check"></i>
                                    <span><strong>Scene Graph Extraction:</strong> Deconstructs PDF operators into editable structural nodes.</span>
                                </li>
                                <li>
                                    <i className="fa-solid fa-check"></i>
                                    <span><strong>WebGL Rendering:</strong> Experience buttery smooth performance even with complex documents.</span>
                                </li>
                                <li>
                                    <i className="fa-solid fa-check"></i>
                                    <span><strong>Typographic Precision:</strong> Adjust fonts, weights, and colors with real-time text measurement.</span>
                                </li>
                                <li>
                                    <i className="fa-solid fa-check"></i>
                                    <span><strong>SVG Text Rendering:</strong> High-fidelity DOM-based text rendering for maximum browser compatibility and accessibility.</span>
                                </li>
                            </ul>
                        </div>

                        <div className="info-card warning">
                            <h3><i className="fa-solid fa-triangle-exclamation"></i> V1 Limitations</h3>
                            <p>
                                As this is an initial version (V1), it is optimized for standard layouts (like resumes and letters).
                            </p>
                            <ul>
                                <li>
                                    <i className="fa-solid fa-circle-exclamation"></i>
                                    <span><strong>Race Conditions:</strong> Certain asynchronous font loading might cause layout shifts.</span>
                                </li>
                                <li>
                                    <i className="fa-solid fa-circle-exclamation"></i>
                                    <span><strong>Complex Overlaps:</strong> Deeply layered graphics may sometimes render out of order.</span>
                                </li>
                                <li>
                                    <i className="fa-solid fa-circle-exclamation"></i>
                                    <span><strong>Legacy Fonts:</strong> Non-standard font encodings might result in extraction errors.</span>
                                </li>
                                <li>
                                    <i className="fa-solid fa-circle-exclamation"></i>
                                    <span><strong>Tables:</strong> Complex multi-nested tables are currently handled as individual text blocks.</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>

                <section className="about-section fade-in-up" style={{ animationDelay: '0.4s' }}>
                    <div className="info-card" style={{ width: '100%', textAlign: 'center' }}>
                        <h3><i className="fa-solid fa-compass"></i> Our Vision</h3>
                        <p style={{ maxWidth: '800px', margin: '0 auto' }}>
                            We believe that PDF editing should feel as fluid as a design tool.
                            By treating PDFs as mathematical scenes rather than static images or brittle HTML,
                            we're building the foundation for the next generation of document collaboration.
                        </p>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default AboutPage;
