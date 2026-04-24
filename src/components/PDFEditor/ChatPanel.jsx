import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage, sendEditMessage } from '../../services/PdfBackendService';
import './ChatPanel.css';

const ChatPanel = ({ pdfName, onAIModification }) => {
    const [mode, setMode] = useState('chat'); // 'chat' or 'edit'
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: `Hello! I'm your AI assistant for **${pdfName}**. I can answer questions about the content or help you perform **AI-assisted PDF edits** directly. How can I help you today?`
        }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    const handleSend = async () => {
        if (!input.trim() || isTyping) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsTyping(true);

        // Integrate with backend API
        try {
            let sessionId = sessionStorage.getItem('pdf_session_id');
            
            // Fix: Generate a session ID if it doesn't exist to prevent 422 errors
            if (!sessionId) {
                sessionId = "session_" + Date.now();
                sessionStorage.setItem('pdf_session_id', sessionId);
                console.log("[ChatPanel] Generated new session_id:", sessionId);
            }
            
            // Send last 5 rounds (10 messages) of history
            const history = messages.slice(-10).map(m => ({
                role: m.role,
                content: m.content
            }));

            console.log(`[ChatPanel] Mode: ${mode} | Session: ${sessionId}`);
            console.log(`[ChatPanel] Sending message with ${history.length} history messages:`, userMsg);

            // Use the specialized endpoint based on current mode
            const data = mode === 'edit' 
                ? await sendEditMessage(userMsg, sessionId, history)
                : await sendChatMessage(userMsg, sessionId, history);

            console.log('[ChatPanel] Raw API response:', data);
            
            if (data.success) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.answer || data.response || "Task completed."
                }]);

                // If the AI generated modifications, pass them to the parent callback
                if (data.modifications && data.modifications.length > 0) {
                    console.log(`[ChatPanel] AI returned ${data.modifications.length} modifications:`, data.modifications);
                    if (onAIModification) {
                        console.log('[ChatPanel] Calling onAIModification callback...');
                        onAIModification(data.modifications);
                    } else {
                        console.warn('[ChatPanel] onAIModification prop is NOT set! Edits cannot be applied to the editor.');
                    }
                } else {
                    console.log('[ChatPanel] No modifications returned from AI.');
                }
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: "Sorry, I encountered an error: " + (data.error || "Unknown error")
                }]);
            }
            setIsTyping(false);
        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "I'm having trouble connecting to the AI server. Please try again later."
            }]);
            setIsTyping(false);
        }
    };

    return (
        <div className="chat-panel-container">
            <div className="chat-mode-header">
                <div 
                    className={`mode-btn ${mode === 'chat' ? 'active' : ''}`} 
                    onClick={() => setMode('chat')}
                >
                    💬 Chat
                </div>
                <div 
                    className={`mode-btn ${mode === 'edit' ? 'active' : ''}`} 
                    onClick={() => setMode('edit')}
                >
                    ✏️ Edit
                </div>
            </div>
            <div className="chat-messages" ref={scrollRef}>
                {messages.map((msg, idx) => (
                    <div key={idx} className={`message-bubble ${msg.role}`}>
                        <div 
                            className="message-content" 
                            dangerouslySetInnerHTML={{ __html: (msg.content || '').replace(/\n/g, '<br/>') }} 
                        />
                    </div>
                ))}
                {isTyping && (
                    <div className="message-bubble assistant typing">
                        <div className="typing-indicator">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                )}
            </div>

            <div className="chat-input-wrapper">
                <div className="chat-input-container">
                    <textarea
                        rows="1"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Ask anything about the PDF..."
                    />
                    <button 
                        className={`send-button ${input.trim() ? 'active' : ''}`}
                        onClick={handleSend}
                        disabled={!input.trim() || isTyping}
                    >
                        <i className="fa-solid fa-paper-plane"></i>
                    </button>
                </div>
                <div className="chat-footer-hint">Powered by Groq & Pinecone</div>
            </div>
        </div>
    );
};

export default ChatPanel;
