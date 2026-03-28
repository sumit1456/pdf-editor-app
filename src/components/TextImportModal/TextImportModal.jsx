import React, { useState, useEffect } from 'react';
import './TextImportModal.css';

const TextImportModal = ({ isOpen, onClose, onSubmit }) => {
    const [text, setText] = useState('');

    useEffect(() => {
        if (isOpen) {
            setText('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Import Text</h3>
                    <button className="close-btn" onClick={onClose}>
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div className="modal-body">
                    <p>Enter the text you want to convert into a PDF. This will create a high-fidelity editable document.</p>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Start typing your content here..."
                        autoFocus
                    />
                </div>
                <div className="modal-footer">
                    <button className="btn-cancel" onClick={onClose}>Cancel</button>
                    <button 
                        className="btn-submit" 
                        onClick={() => onSubmit(text)}
                        disabled={!text.trim()}
                    >
                        Generate PDF
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TextImportModal;
