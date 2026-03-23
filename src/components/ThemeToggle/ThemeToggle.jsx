import React from 'react';
import { useTheme } from '../../context/ThemeContext';
import './ThemeToggle.css';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle Theme">
      <div className={`toggle-track ${theme}`}>
        <div className="toggle-thumb">
          {theme === 'light' ? (
            <i className="fa-solid fa-sun icon-sun"></i>
          ) : (
            <i className="fa-solid fa-moon icon-moon"></i>
          )}
        </div>
      </div>
    </button>
  );
};

export default ThemeToggle;
