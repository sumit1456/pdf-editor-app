# High-Fidelity PDF Editor

A modern, web-based PDF editor designed for high-fidelity text reproduction and layout preservation. This application leverages a sophisticated extraction engine and a Python-based backend architecture to enable precise editing of PDF documents with a focus on typographic accuracy.

## 🚀 Key Features

- **High-Fidelity Rendering**: Supports complex font styles (Bold, Italic, Small Caps) and various font families (Monospace, Scripts) to mirror original PDF aesthetics.
- **Smart Reflow Engine**: Intelligent text fragment merging and line reconstruction for a seamless editing experience.
- **Python Backend**: Fast, modular extraction using modern PDF processing libraries for advanced font extraction and document saving.
- **Interactive Editor**: Real-time preview with word-level styling, bullet detection, and smart style inheritance.
- **Vector Graphics Support**: High-performance rendering of PDF paths and images using PIXI.js.
- **Direct Export**: Generate and download modified PDFs while maintaining the original high-quality formatting.

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 19 + Vite
- **Graphics**: [PIXI.js](https://pixijs.com/) for high-performance vector rendering.
- **PDF Core**: [pdf.js](https://mozilla.github.io/pdf.js/) for document parsing.
- **Typography**: [opentype.js](https://opentype.js.org/) for font manipulation and Google Fonts integration.
- **Routing**: React Router 7.
- **Styling**: Vanilla CSS with modern typographic tokens.

### Backend
- **Core**: Python-based microservice for advanced font extraction and document saving.
- **Docker**: Containerized deployment for consistent environments.

## 📂 Project Structure

```text
├── src/
│   ├── components/       # UI Components (NavBar, PopUp, etc.)
│   ├── lib/pdf-extractor/# Core logic for fragment merging and reflow
│   ├── pages/            # Main application pages (Home, Editor, About)
│   ├── services/         # API communication (PdfBackendService)
│   └── App.jsx           # Main application entry and routing
├── python-backend/       # Python-based microservice logic
├── public/               # Static assets and sample PDFs
├── Dockerfile            # Frontend container configuration
└── docker-compose.yml    # Multi-container orchestration
```

## 🚥 Getting Started

### Prerequisites
- Node.js (v18+)
- Docker and Docker Compose (optional, for full stack)

### Local Development (Frontend)

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Access the app at `http://localhost:5173`.

### Running with Docker

To run both the frontend and the Python backend in a containerized environment:

```bash
docker-compose up --build
```

The frontend will be available at `http://localhost:3000` and the backend at `http://localhost:8000`.

## ⚙️ Configuration

The frontend looks for a `VITE_API_URL` environment variable to connect to the backend. By default, it points to `http://localhost:8000`.

## 📜 License

This project is private and intended for specific PDF editing workflows.
