import React, { useEffect, useMemo, useState, createContext, useContext } from 'react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { supabase } from './lib/supabase.js';
import {
  getDailyPosts,
  getEmails,
  getUserOrganization,
  joinOrganization,
  generatePost,
  deletePosts,
  deleteAllPosts,
  deleteImages,
  deleteAllImages
} from './api.js';

//
// Toast Notification System
//
const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

function Toast({ id, message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, 4000);

    return () => clearTimeout(timer);
  }, [id, onClose]);

  const bgColor = type === 'error' ? '#ff4444' : type === 'success' ? '#4CAF50' : '#2196F3';

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: bgColor,
        color: 'white',
        padding: '16px 24px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 10000,
        animation: 'slideIn 0.3s ease-out',
        maxWidth: '400px',
        wordWrap: 'break-word'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ flex: 1 }}>{message}</span>
        <button
          onClick={() => onClose(id)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'white',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '0',
            lineHeight: '1'
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

function ToastContainer({ toasts, removeToast }) {
  return (
    <>
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
      <div style={{ position: 'fixed', top: 0, right: 0, zIndex: 10000 }}>
        {toasts.map((toast, index) => (
          <div key={toast.id} style={{ marginBottom: index < toasts.length - 1 ? '10px' : '0' }}>
            <Toast
              id={toast.id}
              message={toast.message}
              type={toast.type}
              onClose={removeToast}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

//
// Email Table
//
function EmailTable({ emails, currentPage, onPageChange, totalEmails }) {
  const emailsPerPage = 10;

  if (!emails.length) return <p className="muted">No emails ingested yet.</p>;

  const totalPages = Math.ceil(totalEmails / emailsPerPage);

  return (
    <div>
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Sender</th>
              <th>Subject</th>
              <th>Date/Time</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((email) => (
              <tr key={email.id}>
                <td>{email.sender}</td>
                <td>{email.subject ?? '—'}</td>
                <td>{format(new Date(email.received_at), 'PPpp')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'center', alignItems: 'center' }}>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="secondary"
            style={{ minWidth: '80px' }}
          >
            Previous
          </button>
          <span style={{ color: '#666' }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="secondary"
            style={{ minWidth: '80px' }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

//
// Daily Posts
//
function PostImageCarousel({ images = [] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [images]);

  if (!images.length) return null;

  const handleNext = (event) => {
    event?.stopPropagation();
    setIndex((prev) => (prev + 1) % images.length);
  };

  const currentImage = images[index];
  const hasMultiple = images.length > 1;

  return (
    <div className={`post-image-wrapper ${hasMultiple ? 'has-multiple' : ''}`}>
      <img
        src={currentImage}
        alt={`Generated post image ${index + 1}`}
        className="post-image"
        loading="lazy"
      />
      {hasMultiple && (
        <>
          <button
            type="button"
            className="post-image-next"
            onClick={handleNext}
            title="View next image"
          >
            ›
          </button>
          <span className="post-image-indicator">{index + 1}/{images.length}</span>
        </>
      )}
    </div>
  );
}

//
// Loading Animation Component
//
function LoadingAnimation() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
      gap: '20px'
    }}>
      <div style={{
        display: 'flex',
        gap: '10px',
        alignItems: 'center'
      }}>
        <div className="loading-dot" style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: '#4A90E2',
          animation: 'bounce 1.4s infinite ease-in-out both',
          animationDelay: '-0.32s'
        }}></div>
        <div className="loading-dot" style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: '#4A90E2',
          animation: 'bounce 1.4s infinite ease-in-out both',
          animationDelay: '-0.16s'
        }}></div>
        <div className="loading-dot" style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: '#4A90E2',
          animation: 'bounce 1.4s infinite ease-in-out both'
        }}></div>
      </div>
      <p style={{ 
        color: '#666',
        fontSize: '16px',
        margin: 0,
        fontWeight: '500'
      }}>
        Generating posts...
      </p>
      <p style={{ 
        color: '#999',
        fontSize: '14px',
        margin: 0
      }}>
        This may take a moment
      </p>
    </div>
  );
}

function DailyPosts({ posts, selectedPosts = [], onSelectPost, isGenerating = false, filterType = 'today', customDate = '' }) {
  const [copiedPostId, setCopiedPostId] = useState(null);

  if (isGenerating) {
    return <LoadingAnimation />;
  }

  if (!posts.length) {
    let emptyMessage = 'No AI posts generated';
    
    if (filterType === 'custom' && customDate) {
      const dateObj = new Date(customDate + 'T00:00:00');
      emptyMessage = `No AI posts generated on ${format(dateObj, 'MMMM d, yyyy')}`;
    } else if (filterType === 'today') {
      emptyMessage = 'No AI posts generated today';
    } else if (filterType === 'week') {
      emptyMessage = 'No AI posts generated in the past week';
    } else if (filterType === 'twoweeks') {
      emptyMessage = 'No AI posts generated in the past 2 weeks';
    } else if (filterType === 'all') {
      emptyMessage = 'No AI posts generated yet';
    }
    
    return (
      <div style={{ 
        padding: '30px', 
        textAlign: 'center',
        background: '#f8fafc',
        borderRadius: '12px',
        border: '2px dashed #cbd5e0'
      }}>
        <p className="muted" style={{ margin: '0 0 8px 0', fontSize: '16px' }}>
          {emptyMessage}.
        </p>
        <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
          Hit the <strong>Get Today's Posts</strong> button to create posts based on your images!
        </p>
      </div>
    );
  }

  return (
    <div className="posts-grid">
      {posts.map((post) => {
        const images = Array.isArray(post.source_image_urls)
          ? post.source_image_urls.filter(Boolean)
          : (post.source_image_url ? [post.source_image_url] : []);

        const isSelected = selectedPosts.some((p) => p.id === post.id);
        const isCopied = copiedPostId === post.id;

        return (
          <article
            className={`post ${isSelected ? 'selected' : ''}`}
            key={post.id}
            onClick={() => onSelectPost?.(post)}
            style={{ cursor: onSelectPost ? 'pointer' : 'default' }}
          >
            {isSelected && <div className="selection-indicator">✓</div>}
            <header>
              <span className="badge highlight">{format(new Date(post.created_at), 'PP')}</span>
            </header>

            {images.length > 0 && <PostImageCarousel images={images} />}

            <p className="post-text" style={{ flex: '1 1 auto' }}>{post.caption_text}</p>

            <footer className="post-footer" style={{ marginTop: 'auto' }}>
              <button
                className="copy-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(post.caption_text);
                  setCopiedPostId(post.id);
                  setTimeout(() => setCopiedPostId(null), 2000);
                }}
                title="Copy caption"
              >
                {isCopied ? 'Caption copied!' : '📋 Copy Caption'}
              </button>
            </footer>
          </article>
        );
      })}
    </div>
  );
}

//
// Daily Images
//
function DailyImages({ images, selectedImages = [], onSelectImage, filterType = 'today', customDate = '' }) {
  if (!images.length) {
    let emptyMessage = 'No images received';
    
    if (filterType === 'custom' && customDate) {
      const dateObj = new Date(customDate + 'T00:00:00');
      emptyMessage = `No images received on ${format(dateObj, 'MMMM d, yyyy')}`;
    } else if (filterType === 'today') {
      emptyMessage = 'No images received today';
    } else if (filterType === 'week') {
      emptyMessage = 'No images received in the past week';
    } else if (filterType === 'twoweeks') {
      emptyMessage = 'No images received in the past 2 weeks';
    } else if (filterType === 'all') {
      emptyMessage = 'No images received yet';
    }
    
    return <p className="muted">{emptyMessage}.</p>;
  }

  return (
    <div className="strip-scroll image-strip" role="list">
      {images.map((image) => {
        const imageKey = `${image.emailId}-${image.index}`;
        const isSelected = selectedImages.some(
          (img) => `${img.emailId}-${img.index}` === imageKey
        );

        return (
          <div
            key={imageKey}
            className={`image-strip-item ${isSelected ? 'selected' : ''}`}
            role="listitem"
            onClick={() => onSelectImage?.(image)}
            style={{ cursor: onSelectImage ? 'pointer' : 'default' }}
          >
            <img
              src={image.url}
              alt={image.altText}
              className="image-strip-img"
              loading="lazy"
            />
            {isSelected && <div className="selection-indicator">✓</div>}
          </div>
        );
      })}
    </div>
  );
}

//
// Homepage (for non-logged-in users)
//
function Homepage({ onShowLogin, onShowSignUp }) {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [showContactModal, setShowContactModal] = useState(false);

  // Add your Pexels video URLs here
  // To get the direct video URL from Pexels:
  // 1. Go to the video page on Pexels
  // 2. Click the download button
  // 3. Right-click on your preferred quality and copy the link
  const videos = [
    'https://videos.pexels.com/video-files/8813228/8813228-hd_1920_1080_25fps.mp4',
    'https://videos.pexels.com/video-files/3678329/3678329-hd_1920_1080_25fps.mp4',
  ];

  const handleVideoEnd = () => {
    setCurrentVideoIndex((prevIndex) => (prevIndex + 1) % videos.length);
  };

  const buttonStyle = {
    background: 'transparent',
    border: '2px solid white',
    color: 'white',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'all 0.3s',
    whiteSpace: 'nowrap'
  };

  const buttonHoverHandlers = {
    onMouseEnter: (e) => {
      e.target.style.background = 'white';
      e.target.style.color = 'black';
    },
    onMouseLeave: (e) => {
      e.target.style.background = 'transparent';
      e.target.style.color = 'white';
    }
  };

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100vh',
      overflow: 'hidden',
      background: '#000'
    }}>
      {/* Video Background */}
      <video
        key={currentVideoIndex}
        autoPlay
        muted
        loop
        playsInline
        onEnded={handleVideoEnd}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          minWidth: '100%',
          minHeight: '100%',
          width: 'auto',
          height: 'auto',
          transform: 'translate(-50%, -50%)',
          objectFit: 'cover',
          zIndex: 1
        }}
      >
        <source src={videos[currentVideoIndex]} type="video/mp4" />
      </video>

      {/* Dark Overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.4)',
        zIndex: 2
      }} />

      {/* Navbar */}
      <nav style={{
        position: 'relative',
        zIndex: 3,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '15px 20px',
        color: 'white',
        flexWrap: 'wrap',
        gap: '15px'
      }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(18px, 5vw, 24px)', fontWeight: 'bold' }}>Postforge</h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            onClick={onShowLogin}
            style={buttonStyle}
            {...buttonHoverHandlers}
          >
            Login
          </button>
          <button
            onClick={onShowSignUp}
            style={buttonStyle}
            {...buttonHoverHandlers}
          >
            Create Account
          </button>
          <button
            onClick={() => setShowContactModal(true)}
            style={buttonStyle}
            {...buttonHoverHandlers}
          >
            Contact
          </button>
        </div>
      </nav>

      {/* Hero Text */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 3,
        textAlign: 'center',
        color: 'white',
        padding: '0 20px',
        maxWidth: '100%'
      }}>
        <h1 style={{
          fontSize: 'clamp(32px, 10vw, 72px)',
          fontWeight: 'bold',
          margin: 0,
          marginBottom: '20px',
          textShadow: '2px 2px 20px rgba(0,0,0,0.5)',
          letterSpacing: 'clamp(-1px, -0.3vw, -2px)'
        }}>
          Posting made easy
        </h1>
        <p style={{
          fontSize: 'clamp(16px, 4vw, 24px)',
          margin: 0,
          textShadow: '1px 1px 10px rgba(0,0,0,0.5)'
        }}>
          Transform your emails into engaging social media posts
        </p>
      </div>

      {/* Contact Modal */}
      {showContactModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.8)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => setShowContactModal(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '40px',
              maxWidth: '400px',
              width: '90%',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowContactModal(false)}
              style={{
                position: 'absolute',
                top: '15px',
                right: '15px',
                background: 'transparent',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#666',
                padding: '5px 10px'
              }}
            >
              ×
            </button>
            <h2 style={{ margin: '0 0 30px 0', color: '#333', textAlign: 'center' }}>Get in Touch</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <a
                href="mailto:cj2585@columbia.edu"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '15px',
                  padding: '15px',
                  background: '#f5f5f5',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: '#333',
                  transition: 'all 0.3s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e8e8e8';
                  e.currentTarget.style.transform = 'translateX(5px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f5f5f5';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <div>
                  <div style={{ fontWeight: '500' }}>Email</div>
                  <div style={{ fontSize: '14px', color: '#666' }}>cj2585@columbia.edu</div>
                </div>
              </a>
              <a
                href="https://www.linkedin.com/in/scout-jiang-0b1275111/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '15px',
                  padding: '15px',
                  background: '#f5f5f5',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: '#333',
                  transition: 'all 0.3s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e8e8e8';
                  e.currentTarget.style.transform = 'translateX(5px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f5f5f5';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                <div>
                  <div style={{ fontWeight: '500' }}>LinkedIn</div>
                  <div style={{ fontSize: '14px', color: '#666' }}>Scout Jiang</div>
                </div>
              </a>
              <a
                href="https://github.com/ScoutCJ"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '15px',
                  padding: '15px',
                  background: '#f5f5f5',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: '#333',
                  transition: 'all 0.3s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e8e8e8';
                  e.currentTarget.style.transform = 'translateX(5px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f5f5f5';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <div>
                  <div style={{ fontWeight: '500' }}>GitHub</div>
                  <div style={{ fontSize: '14px', color: '#666' }}>@ScoutCJ</div>
                </div>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

//
// Login Card
//
function LoginCard({ onSuccess, onBack, initialMode = 'signIn' }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const toggleMode = () => {
    if (mode === 'magicLink') {
      setMode('signIn');
    } else {
      setMode(mode === 'signIn' ? 'signUp' : 'signIn');
    }
    setMessage('');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'magicLink') {
        // Send magic link
        const { error: magicLinkError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: window.location.origin
          }
        });
        if (magicLinkError) throw magicLinkError;
        setMessage('Check your email for a magic link to sign in!');
      } else if (mode === 'signIn') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        if (data.session) onSuccess(data.session);
      } else {
        // Validate password confirmation for sign-up
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setMessage('Check your email to confirm this account, then sign in.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card login-card">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            fontSize: '14px',
            marginBottom: '10px',
            padding: '5px 0'
          }}
        >
          ← Back to home
        </button>
      )}
      <h1>Postforge</h1>
      <p className="muted">
        {mode === 'magicLink' 
          ? 'Enter your email to receive a login link' 
          : 'Sign in to review ingested emails and daily AI captions.'}
      </p>
      <form className="form" onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@school.org"
          required
        />

        {mode !== 'magicLink' && (
          <>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </>
        )}

        {mode === 'signUp' && (
          <>
            <label htmlFor="confirm-password">Confirm Password</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </>
        )}

        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Working…' : mode === 'magicLink' ? 'Send Magic Link' : mode === 'signIn' ? 'Sign In' : 'Create account'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      {mode === 'signIn' && (
        <button 
          type="button" 
          className="link" 
          onClick={() => {
            setMode('magicLink');
            setMessage('');
            setError('');
          }}
          style={{ marginBottom: '10px' }}
        >
          Forgot password? Use magic link
        </button>
      )}

      <button type="button" className="link" onClick={toggleMode}>
        {mode === 'magicLink' 
          ? '← Back to password login'
          : mode === 'signIn' 
            ? 'Need an account? Create one' 
            : 'Already registered? Sign in'}
      </button>
    </section>
  );
}

//
// Onboarding Card
//
function OnboardingCard({ accessToken, onSuccess }) {
  const [flow, setFlow] = useState('create');
  const [joinEmail, setJoinEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const mailgunDomain = import.meta.env.VITE_MAILGUN_DOMAIN || 'sandbox.mailgun.org';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (!joinEmail) throw new Error('Enter the forwarding email to join your organization.');
      const organization = await joinOrganization(accessToken, {
        recipientEmail: joinEmail.trim().toLowerCase()
      });
      setMessage(`Joined ${organization.name}!`);
      onSuccess(organization);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card login-card">
      <h1>🎉 Welcome to Postforge!</h1>
      <p className="muted">Create a new organization or join an existing team.</p>

      <div className="onboarding-toggle">
        <button type="button" className={flow === 'create' ? 'toggle active' : 'toggle'} onClick={() => { setFlow('create'); setError(''); setMessage(''); }}>
          Create new org
        </button>
        <button type="button" className={flow === 'join' ? 'toggle active' : 'toggle'} onClick={() => { setFlow('join'); setError(''); setMessage(''); }}>
          Join existing org
        </button>
      </div>

      {flow === 'create' ? (
        <div style={{ marginTop: '30px' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '15px', textAlign: 'center' }}>To create an organization to use Postforge, please contact the developer.</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '25px' }}>
            <a
              href="mailto:cj2585@columbia.edu"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '15px',
                padding: '15px',
                background: '#f5f5f5',
                borderRadius: '8px',
                textDecoration: 'none',
                color: '#333',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e8e8e8';
                e.currentTarget.style.transform = 'translateX(5px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f5f5f5';
                e.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <div>
                <div style={{ fontWeight: '500' }}>Email</div>
                <div style={{ fontSize: '14px', color: '#666' }}>cj2585@columbia.edu</div>
              </div>
            </a>
            <a
              href="https://www.linkedin.com/in/scout-jiang-0b1275111/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '15px',
                padding: '15px',
                background: '#f5f5f5',
                borderRadius: '8px',
                textDecoration: 'none',
                color: '#333',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e8e8e8';
                e.currentTarget.style.transform = 'translateX(5px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f5f5f5';
                e.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
              <div>
                <div style={{ fontWeight: '500' }}>LinkedIn</div>
                <div style={{ fontSize: '14px', color: '#666' }}>Scout Jiang</div>
              </div>
            </a>
            <a
              href="https://github.com/ScoutCJ"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '15px',
                padding: '15px',
                background: '#f5f5f5',
                borderRadius: '8px',
                textDecoration: 'none',
                color: '#333',
                transition: 'all 0.3s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e8e8e8';
                e.currentTarget.style.transform = 'translateX(5px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f5f5f5';
                e.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <div>
                <div style={{ fontWeight: '500' }}>GitHub</div>
                <div style={{ fontSize: '14px', color: '#666' }}>@ScoutCJ</div>
              </div>
            </a>
          </div>
        </div>
      ) : (
        <form className="form" onSubmit={handleSubmit}>
          <label htmlFor="join-email">Organization Forwarding Email</label>
          <input id="join-email" type="email" value={joinEmail} onChange={(e) => setJoinEmail(e.target.value)} placeholder="team@example.org" required />
          <p className="muted" style={{ fontSize: '14px' }}>Enter the forwarding email set by your teammate (e.g., nycschools@{mailgunDomain})</p>
          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Working…' : 'Join Organization'}
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      {flow === 'join' && (
        <div style={{ marginTop: '20px', padding: '15px', background: '#f0f7ff', borderRadius: '8px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#555' }}>💡 <strong>Tip:</strong> Forward emails with images to your organization email to automatically generate Instagram posts!</p>
        </div>
      )}
    </section>
  );
}

//
// Dashboard
//
function Dashboard({ user, organization, emails, posts, loading, onRefresh, onSignOut, error, accessToken, onPostsUpdate, onLoadMoreEmails, onLoadMorePosts, emailsHasMore, postsHasMore }) {
  const { addToast } = useToast();
  const displayEmail = useMemo(() => user?.email ?? 'user', [user]);
  const [imageFilter, setImageFilter] = useState('today');
  const [postFilter, setPostFilter] = useState('today');
  const [imageCustomDate, setImageCustomDate] = useState('');
  const [postCustomDate, setPostCustomDate] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [selectedPosts, setSelectedPosts] = useState([]);
  const [generatingPost, setGeneratingPost] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [emailPage, setEmailPage] = useState(1);
  const emailsPerPage = 10;

  const getDateRange = (filter, customDate = '') => {
    const now = new Date();
    switch (filter) {
      case 'today': return { start: startOfDay(now), end: endOfDay(now) };
      case 'week': return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
      case 'twoweeks': return { start: startOfDay(subDays(now, 14)), end: endOfDay(now) };
      case 'all': return { start: null, end: null };
      case 'custom': {
        if (!customDate) return { start: null, end: null };
        // Parse date in local timezone by adding time component
        const [year, month, day] = customDate.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return { start: startOfDay(date), end: endOfDay(date) };
      }
      default: return { start: startOfDay(now), end: endOfDay(now) };
    }
  };

  const filteredImages = useMemo(() => {
    const { start, end } = getDateRange(imageFilter, imageCustomDate);
    return emails.flatMap(email => {
      const imageUrls = email.parsed_content?.image_urls ?? [];
      if (!imageUrls.length) return [];

      const emailDate = new Date(email.received_at);
      if (start && end && (emailDate < start || emailDate > end)) return [];

      const subject = email.subject ?? 'Untitled email';
      const sender = email.sender ?? 'Unknown sender';
      const textContent = email.parsed_content?.text_content || email.raw_text || '';

      return imageUrls.map((url, index) => ({
        url, imageUrl: url, emailId: email.id, index, subject, sender, textContent,
        altText: `Forwarded email image ${index + 1} from ${sender}`, receivedAt: email.received_at
      }));
    });
  }, [emails, imageFilter, imageCustomDate]);

  const filteredPosts = useMemo(() => {
    const { start, end } = getDateRange(postFilter, postCustomDate);
    if (!start || !end) return posts;
    return posts.filter(post => {
      const postDate = new Date(post.created_at);
      return postDate >= start && postDate <= end;
    });
  }, [posts, postFilter, postCustomDate]);

  const paginatedEmails = useMemo(() => {
    const startIndex = (emailPage - 1) * emailsPerPage;
    const endIndex = startIndex + emailsPerPage;
    return emails.slice(startIndex, endIndex);
  }, [emails, emailPage, emailsPerPage]);

  const handleEmailPageChange = (newPage) => {
    setEmailPage(newPage);
  };

  // Reset to page 1 when emails change
  useEffect(() => {
    setEmailPage(1);
  }, [emails.length]);

  const handleSelectImage = (image) => {
    const key = `${image.emailId}-${image.index}`;
    const isSelected = selectedImages.some(img => `${img.emailId}-${img.index}` === key);

    if (isSelected) {
      setSelectedImages(selectedImages.filter(img => `${img.emailId}-${img.index}` !== key));
    } else if (selectedImages.length < 5) {
      setSelectedImages([...selectedImages, image]);
    } else {
      addToast('Maximum 5 images can be selected', 'error');
    }
  };

  const handleClearSelection = () => setSelectedImages([]);

  const handleGeneratePost = async (useSelection = false) => {
    setGeneratingPost(true);
    setGenerateError('');
    try {
      const payload = useSelection && selectedImages.length > 0 ? selectedImages : [];
      const result = await generatePost(accessToken, payload);
      if (result.success) {
        addToast(`Success! Generated ${result.posts.length} post(s)`, 'success');
        onPostsUpdate?.();
        setSelectedImages([]);
      }
    } catch (err) {
      setGenerateError(err.message);
      addToast(`Failed to generate post: ${err.message}`, 'error');
    } finally {
      setGeneratingPost(false);
    }
  };

  const handleSelectPost = (post) => {
    const isSelected = selectedPosts.some((p) => p.id === post.id);
    if (isSelected) {
      setSelectedPosts(selectedPosts.filter((p) => p.id !== post.id));
    } else {
      setSelectedPosts([...selectedPosts, post]);
    }
  };

  const handleDeletePosts = async () => {
    if (selectedPosts.length === 0) return;

    const confirmMessage = `Delete ${selectedPosts.length} selected post(s)?`;
    if (!confirm(confirmMessage)) return;

    try {
      const postIds = selectedPosts.map((p) => p.id);
      await deletePosts(accessToken, postIds);
      addToast(`Successfully deleted ${selectedPosts.length} post(s)`, 'success');
      setSelectedPosts([]);
      onPostsUpdate?.();
      onRefresh?.();
    } catch (err) {
      addToast(`Failed to delete posts: ${err.message}`, 'error');
    }
  };

  const getFilterLabel = (filter, customDate) => {
    switch (filter) {
      case 'today': return 'from Today';
      case 'week': return 'from Past Week';
      case 'twoweeks': return 'from Past 2 Weeks';
      case 'all': return '';
      case 'custom':
        if (!customDate) return '';
        const date = new Date(customDate);
        return `from ${format(date, 'MMMM d, yyyy')}`;
      default: return 'from Today';
    }
  };

  const handleDeleteAllPosts = async () => {
    const label = getFilterLabel(postFilter, postCustomDate);
    const confirmMessage = label 
      ? `Delete all posts ${label}? This cannot be undone.`
      : 'Delete ALL posts in history? This cannot be undone.';
    
    if (!confirm(confirmMessage)) return;

    try {
      const { start, end } = getDateRange(postFilter, postCustomDate);
      const result = await deleteAllPosts(
        accessToken,
        start ? start.toISOString() : null,
        end ? end.toISOString() : null
      );
      addToast(result.message || 'Successfully deleted posts', 'success');
      setSelectedPosts([]);
      onPostsUpdate?.();
      onRefresh?.();
    } catch (err) {
      addToast(`Failed to delete posts: ${err.message}`, 'error');
    }
  };

  const handleDeleteImages = async () => {
    if (selectedImages.length === 0) return;

    const confirmMessage = `Delete ${selectedImages.length} selected image(s)?`;
    if (!confirm(confirmMessage)) return;

    try {
      const images = selectedImages.map((img) => ({
        emailId: img.emailId,
        index: img.index
      }));
      await deleteImages(accessToken, images);
      addToast(`Successfully deleted ${selectedImages.length} image(s)`, 'success');
      setSelectedImages([]);
      onRefresh?.();
    } catch (err) {
      addToast(`Failed to delete images: ${err.message}`, 'error');
    }
  };

  const handleDeleteAllImages = async () => {
    const label = getFilterLabel(imageFilter, imageCustomDate);
    const confirmMessage = label 
      ? `Delete all images ${label}? This cannot be undone.`
      : 'Delete ALL images in history? This cannot be undone.';
    
    if (!confirm(confirmMessage)) return;

    try {
      const { start, end } = getDateRange(imageFilter, imageCustomDate);
      const result = await deleteAllImages(
        accessToken,
        start ? start.toISOString() : null,
        end ? end.toISOString() : null
      );
      addToast(result.message || 'Successfully deleted images', 'success');
      setSelectedImages([]);
      onRefresh?.();
    } catch (err) {
      addToast(`Failed to delete images: ${err.message}`, 'error');
    }
  };

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <h1 style={{ margin: 0 }}>{organization?.name || 'Daily'} Storybuilder</h1>
          <p className="muted" style={{ margin: 0, fontSize: '14px' }}>
            Your forwarding address is{' '}
            <strong
              onClick={() => {
                navigator.clipboard.writeText(organization?.recipient_email || '');
                addToast('Email address copied to clipboard!', 'success');
              }}
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
              title="Click to copy"
            >
              {organization?.recipient_email}
            </strong>
          </p>
          <span style={{ fontSize: '14px', color: '#666' }}>Signed in as <strong>{displayEmail}</strong></span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginLeft: 'auto' }}>
          <button onClick={onSignOut} className="secondary" style={{ minWidth: '120px' }}>
            Sign out
          </button>
          <button onClick={onRefresh} disabled={loading} className="secondary" style={{ minWidth: '120px' }}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </nav>

      <main className="dashboard-main">

        {error && <p className="error banner">{error}</p>}
        {generateError && <p className="error banner">{generateError}</p>}

        <section className="content-panel">
          <div className="content-panel-header">
            <h2>Your Posts</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <select value={postFilter} onChange={(e) => setPostFilter(e.target.value)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e0' }}>
                <option value="today">Today</option>
                <option value="week">Past Week</option>
                <option value="twoweeks">Past 2 Weeks</option>
                <option value="all">All Time</option>
                <option value="custom">Custom Date</option>
              </select>
              {postFilter === 'custom' && (
                <input
                  type="date"
                  value={postCustomDate}
                  onChange={(e) => setPostCustomDate(e.target.value)}
                  style={{ 
                    padding: '6px 10px', 
                    borderRadius: '6px', 
                    border: '1px solid #cbd5e0', 
                    fontSize: '14px',
                    cursor: 'pointer',
                    minWidth: '150px'
                  }}
                />
              )}
              <span className="content-count badge highlight">{filteredPosts.length} ready</span>
              {selectedPosts.length > 0 && (
                <span className="badge success">{selectedPosts.length} selected</span>
              )}
              {selectedPosts.length === 0 && (
                <button className="secondary" onClick={() => handleGeneratePost(false)} disabled={generatingPost}>
                  {generatingPost ? 'Generating...' : "Get Today's Posts"}
                </button>
              )}
            </div>
          </div>
          <DailyPosts posts={filteredPosts} selectedPosts={selectedPosts} onSelectPost={handleSelectPost} isGenerating={generatingPost} filterType={postFilter} customDate={postCustomDate} />
          {filteredPosts.length > 0 && (
            <div style={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {selectedPosts.length > 0 && (
                <>
                  <button className="secondary" onClick={handleDeletePosts}>
                    Delete Selected ({selectedPosts.length})
                  </button>
                  <button className="secondary" onClick={() => setSelectedPosts([])}>
                    Clear Selection
                  </button>
                </>
              )}
              <button className="secondary" onClick={handleDeleteAllPosts} style={{ marginLeft: selectedPosts.length > 0 ? 'auto' : '0' }}>
                {`Delete All Posts${getFilterLabel(postFilter, postCustomDate) ? ` ${getFilterLabel(postFilter, postCustomDate)}` : ''}`}
              </button>
            </div>
          )}
          {postsHasMore && (
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <button onClick={onLoadMorePosts} disabled={loading} className="secondary">
                {loading ? 'Loading...' : 'Load More Posts'}
              </button>
            </div>
          )}
        </section>

        <section className="content-panel">
          <div className="content-panel-header">
            <h2>Your Images</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <select value={imageFilter} onChange={(e) => setImageFilter(e.target.value)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e0' }}>
                <option value="today">Today</option>
                <option value="week">Past Week</option>
                <option value="twoweeks">Past 2 Weeks</option>
                <option value="all">All Time</option>
                <option value="custom">Custom Date</option>
              </select>
              {imageFilter === 'custom' && (
                <input
                  type="date"
                  value={imageCustomDate}
                  onChange={(e) => setImageCustomDate(e.target.value)}
                  style={{ 
                    padding: '6px 10px', 
                    borderRadius: '6px', 
                    border: '1px solid #cbd5e0', 
                    fontSize: '14px',
                    cursor: 'pointer',
                    minWidth: '150px'
                  }}
                />
              )}
              <span className="muted">{filteredImages.length} image{filteredImages.length !== 1 ? 's' : ''}</span>
              {selectedImages.length > 0 && <>
                <span className="badge success">{selectedImages.length} selected</span>
                <button onClick={handleClearSelection} className="secondary" style={{ padding: '4px 8px', fontSize: '12px' }}>Clear</button>
                <button className="primary" onClick={() => handleGeneratePost(true)} disabled={generatingPost}>
                  {generatingPost ? 'Generating...' : `Generate Posts from Selected (${selectedImages.length})`}
                </button>
                <button className="secondary" onClick={handleDeleteImages}>
                  Delete Selected ({selectedImages.length})
                </button>
              </>}
            </div>
          </div>
          <DailyImages images={filteredImages} selectedImages={selectedImages} onSelectImage={handleSelectImage} filterType={imageFilter} customDate={imageCustomDate} />
          {filteredImages.length > 0 && (
            <div style={{ marginTop: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button className="secondary" onClick={handleDeleteAllImages}>
                {`Delete All Images${getFilterLabel(imageFilter, imageCustomDate) ? ` ${getFilterLabel(imageFilter, imageCustomDate)}` : ''}`}
              </button>
            </div>
          )}
        </section>

        <section className="content-panel">
          <div className="content-panel-header">
            <h2>Forwarded Emails</h2>
            <span className="muted">{emails.length} total</span>
          </div>
          <EmailTable
            emails={paginatedEmails}
            currentPage={emailPage}
            onPageChange={handleEmailPageChange}
            totalEmails={emails.length}
          />
        </section>
      </main>
    </div>
  );
}

//
// App Component
//
function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [checkingOrganization, setCheckingOrganization] = useState(true);
  const [emails, setEmails] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailsHasMore, setEmailsHasMore] = useState(true);
  const [postsHasMore, setPostsHasMore] = useState(true);
  const [view, setView] = useState('home'); // 'home', 'login', 'signup'

  const accessToken = session?.access_token ?? null;
  const loadingRef = React.useRef(false);
  const prevUserIdRef = React.useRef(null);

  const ITEMS_PER_PAGE = 20;

  const checkOrganization = React.useCallback(async (token) => {
    if (!token) return;

    setCheckingOrganization(true);
    try {
      const org = await getUserOrganization(token);
      setOrganization(org);
      return org;
    } catch (err) {
      // If error is 404, user has no organization (expected for new users)
      if (err.message?.includes('404') || err.message?.includes('not assigned')) {
        setOrganization(null);
        return null;
      }
      // For other errors, show error message
      setError(err.message);
      return null;
    } finally {
      setCheckingOrganization(false);
    }
  }, []);

  const loadData = React.useCallback(async (token, emailsOffset = 0, postsOffset = 0) => {
    if (!token || loadingRef.current) {
      return;
    }

    loadingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const [emailsData, postsData] = await Promise.all([
        getEmails(token, ITEMS_PER_PAGE, emailsOffset),
        getDailyPosts(token, ITEMS_PER_PAGE, postsOffset)
      ]);

      if (emailsOffset === 0) {
        setEmails(emailsData);
      } else {
        setEmails(prev => [...prev, ...emailsData]);
      }

      if (postsOffset === 0) {
        setPosts(postsData);
      } else {
        setPosts(prev => [...prev, ...postsData]);
      }

      setEmailsHasMore(emailsData.length === ITEMS_PER_PAGE);
      setPostsHasMore(postsData.length === ITEMS_PER_PAGE);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      prevUserIdRef.current = data.session?.user?.id ?? null;
      if (data.session?.access_token) {
        const org = await checkOrganization(data.session.access_token);
        if (org) {
          loadData(data.session.access_token);
        }
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;

      const newUserId = newSession?.user?.id ?? null;
      const prevUserId = prevUserIdRef.current;

      // Update session and user state
      setSession(newSession);
      setUser(newSession?.user ?? null);

      // Skip reloading data if the user hasn't changed (same user, just session update)
      if (newUserId === prevUserId && prevUserId !== null) {
        return;
      }

      // Update the tracked user ID
      prevUserIdRef.current = newUserId;

      if (newSession?.access_token) {
        const org = await checkOrganization(newSession.access_token);
        if (org) {
          loadData(newSession.access_token);
        }
      } else {
        setOrganization(null);
        setEmails([]);
        setPosts([]);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []); // Empty dependency array - only run once on mount

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setOrganization(null);
    setEmails([]);
    setPosts([]);
    setLoading(false);
    setView('home');
  };

  const handleOnboardingComplete = async (org) => {
    setOrganization(org);
    if (accessToken) {
      loadData(accessToken);
    }
  };

  const loadMoreEmails = React.useCallback(() => {
    if (!accessToken || !emailsHasMore || loadingRef.current) return;
    loadData(accessToken, emails.length, 0);
  }, [accessToken, emails.length, emailsHasMore, loadData]);

  const loadMorePosts = React.useCallback(() => {
    if (!accessToken || !postsHasMore || loadingRef.current) return;
    loadData(accessToken, 0, posts.length);
  }, [accessToken, posts.length, postsHasMore, loadData]);

  if (!session) {
    if (view === 'home') {
      return (
        <div className="app">
          <Homepage
            onShowLogin={() => setView('login')}
            onShowSignUp={() => setView('signup')}
          />
        </div>
      );
    }

    return (
      <div className="app centered">
        <LoginCard
          initialMode={view === 'signup' ? 'signUp' : 'signIn'}
          onSuccess={(newSession) => {
            setSession(newSession);
            setUser(newSession.user);
            setView('home');
          }}
          onBack={() => setView('home')}
        />
      </div>
    );
  }

  if (checkingOrganization) {
    return (
      <div className="app centered">
        <p>Loading...</p>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="app centered">
        <OnboardingCard accessToken={accessToken} onSuccess={handleOnboardingComplete} />
      </div>
    );
  }

  return (
    <div className="app">
      {error && <p className="error banner">{error}</p>}
      <Dashboard
        user={user}
        organization={organization}
        emails={emails}
        posts={posts}
        loading={loading}
        onRefresh={() => loadData(accessToken)}
        onSignOut={handleSignOut}
        error={error}
        accessToken={accessToken}
        onPostsUpdate={() => loadData(accessToken)}
        onLoadMoreEmails={loadMoreEmails}
        onLoadMorePosts={loadMorePosts}
        emailsHasMore={emailsHasMore}
        postsHasMore={postsHasMore}
      />
    </div>
  );
}

// Wrap App with ToastProvider
export default function AppWithToast() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  );
}
