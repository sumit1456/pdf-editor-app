import React from "react";
import { Link } from "react-router-dom";
import "./css-files/HomePageContainer.css";
import { useNavigate } from "react-router-dom";

import { useSelector } from "react-redux";

export default function HomePageContainer() {



  return (
    
    <div className="home-container">
      <h1 className="home-title">ResumeMaker</h1>
      <p className="home-subtitle">
        <Link to="/resumebuilder" className="home-link">
          Build simple and professional resumes quickly.
        </Link>
      </p>
      <div className="home-actions">
        <Link to="/dashboard" className="btn btn-primary">
          Build Resume
        </Link>
        <Link to="/login" className="btn btn-secondary">
          Know more about app
        </Link>
      </div>
    </div>
  );
}
