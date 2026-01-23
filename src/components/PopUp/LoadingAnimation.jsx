import React, { useState, useEffect } from 'react';

const LoadingOverlay = ({ message = "Loading...", show = true }) => {
  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)', // Slightly darker for better contrast than original 0.1
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000000,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '32px',
      }}>
        <div style={{ position: 'relative', width: '120px', height: '120px' }}>
          <div style={{
            position: 'absolute',
            width: '120px',
            height: '120px',
            border: '3px solid transparent',
            borderTopColor: '#ffffff',
            borderRightColor: '#ffffff',
            borderRadius: '50%',
            animation: 'spin 1.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite',
            boxShadow: '0 0 20px rgba(255, 255, 255, 0.3)',
          }}></div>
          <div style={{
            position: 'absolute',
            width: '85px',
            height: '85px',
            border: '3px solid transparent',
            borderTopColor: 'rgba(255, 255, 255, 0.7)',
            borderLeftColor: 'rgba(255, 255, 255, 0.7)',
            borderRadius: '50%',
            animation: 'spin 2.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite reverse',
            top: '17.5px',
            left: '17.5px',
          }}></div>
          <div style={{
            position: 'absolute',
            width: '50px',
            height: '50px',
            border: '3px solid transparent',
            borderTopColor: 'rgba(255, 255, 255, 0.4)',
            borderBottomColor: 'rgba(255, 255, 255, 0.4)',
            borderRadius: '50%',
            animation: 'spin 1.2s linear infinite',
            top: '35px',
            left: '35px',
          }}></div>
        </div>
        <div style={{
          fontSize: '20px',
          fontWeight: '700',
          color: '#ffffff',
          letterSpacing: '1px',
          textAlign: 'center',
          textTransform: 'uppercase',
        }}>{message}</div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {[0, 0.2, 0.4].map((delay, i) => (
            <span key={i} style={{
              width: '10px',
              height: '10px',
              background: '#ffffff',
              borderRadius: '50%',
              animation: `bounceOverlay 1.4s ease-in-out infinite`,
              animationDelay: `${delay}s`,
              boxShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
            }}></span>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes bounceOverlay {
          0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

const LoadingContainer = () => {
  const [loadingState, setLoadingState] = useState({ show: false, message: '' });

  useEffect(() => {
    const showLoading = (show, message = "Processing...") => {
      setLoadingState({ show, message });
    };

    window.showLoading = showLoading;

    return () => {
      delete window.showLoading;
    };
  }, []);

  return <LoadingOverlay show={loadingState.show} message={loadingState.message} />;
};

export default LoadingContainer;
