import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

const MessageOverlay = ({
  title = 'Message',
  description = '',
  type = 'info'
}) => {
  const configs = {
    success: {
      icon: CheckCircle,
      iconColor: '#22c55e',
      bgColor: '#16a34a'
    },
    error: {
      icon: AlertTriangle,
      iconColor: 'red',
      bgColor: 'red'
    },
    info: {
      icon: Info,
      iconColor: '#3b82f6',
      bgColor: '#2563eb'
    },
    warning: {
      icon: AlertTriangle,
      iconColor: '#f59e0b',
      bgColor: '#d97706'
    },
    general: {
      icon: Info,
      iconColor: '#ffffff',
      bgColor: '#e5e5e5'
    }
  };

  const config = configs[type] || configs.info;
  const Icon = config.icon;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      animation: 'fadeIn 0.2s ease-out',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'linear-gradient(145deg, #1f1f1f 0%, #161616 100%)',
        borderRadius: '16px',
        padding: '0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '90%',
        maxWidth: '420px',
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
      }}>
        {/* Icon Section */}
        <div style={{
          width: '100%',
          padding: '40px 32px 24px 32px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.03) 0%, transparent 70%)'
        }}>
          <div style={{
            width: '90px',
            height: '90px',
            borderRadius: '20px',
            background: `linear-gradient(135deg, ${config.iconColor}15, ${config.iconColor}25)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
            boxShadow: `0 8px 32px ${config.iconColor}40, inset 0 1px 0 rgba(255, 255, 255, 0.1)`,
            border: `1px solid ${config.iconColor}30`,
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute',
              top: '-50%',
              left: '-50%',
              width: '200%',
              height: '200%',
              background: `radial-gradient(circle, ${config.iconColor}20 0%, transparent 70%)`,
              animation: 'pulse 2s ease-in-out infinite'
            }}></div>
            <Icon style={{
              width: '44px',
              height: '44px',
              color: config.iconColor,
              strokeWidth: 2.5,
              filter: 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3))',
              position: 'relative',
              zIndex: 1
            }} />
          </div>
        </div>

        {/* Title Section */}
        <div style={{
          width: '100%',
          padding: '0 32px 20px 32px',
          textAlign: 'center'
        }}>
          <h2 style={{
            fontSize: '22px',
            fontWeight: '700',
            color: type === 'error' ? config.iconColor : '#ffffff',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
          }}>{title}</h2>
        </div>

        {/* Description Section */}
        {description && (
          <div style={{
            width: '100%',
            padding: '0 32px 36px 32px'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(55, 55, 55, 0.4) 0%, rgba(75, 74, 74, 0.5) 100%)',
              borderRadius: '12px',
              padding: '18px 22px',
              border: '1px solid rgba(139, 69, 19, 0.3)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 4px 12px rgba(0, 0, 0, 0.2)'
            }}>
              <p style={{
                fontSize: '14px',
                color: '#e1dedeff',
                margin: 0,
                lineHeight: '1.6',
                textAlign: 'center',
                textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
              }}>{description}</p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            transform: translateY(30px) scale(0.95);
            opacity: 0;
          }
          to { 
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        @keyframes scaleIn {
          0% { 
            transform: scale(0.5) rotate(-5deg);
            opacity: 0;
          }
          50% {
            transform: scale(1.1) rotate(2deg);
          }
          100% { 
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.2);
          }
        }
      `}</style>
    </div>
  );
};

const MessageContainer = () => {
  const [currentMessage, setCurrentMessage] = useState(null);

  useEffect(() => {
    const showMessage = (title, description = '', type = 'info', duration = 3000) => {
      setCurrentMessage({ title, description, type });

      if (duration > 0) {
        setTimeout(() => {
          setCurrentMessage(null);
        }, duration);
      }
    };

    window.showMessage = showMessage;

    return () => {
      delete window.showMessage;
    };
  }, []);

  if (!currentMessage) return null;

  return (
    <MessageOverlay
      title={currentMessage.title}
      description={currentMessage.description}
      type={currentMessage.type}
    />
  );
};

export default MessageContainer;