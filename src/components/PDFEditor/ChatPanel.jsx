import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage, sendChatMessageV2, sendEditMessage, sendEditMessageV2, checkIndexingStatus } from '../../services/PdfBackendService';
import './ChatPanel.css';

const ChatPanel = ({ pdfName, onAIModification }) => {
    const [mode, setMode] = useState('chat'); // 'chat' or 'edit'
    const [useStreaming, setUseStreaming] = useState(true); // Toggle for streaming
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: `Hello! I'm your AI assistant for **${pdfName}**. I can answer questions about the content or help you perform **AI-assisted PDF edits** directly. How can I help you today?`
        }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [indexingStatus, setIndexingStatus] = useState('ready'); // 'indexing', 'ready', 'error'
    const scrollRef = useRef(null);
    const pollInterval = useRef(null);
    const appliedModIds = useRef(new Set()); // Track applied edits during a stream

    // Initial status check and polling
    useEffect(() => {
        const sessionId = sessionStorage.getItem('pdf_session_id');
        if (!sessionId) return;

        const checkStatus = async () => {
            const data = await checkIndexingStatus(sessionId);
            if (data.success) {
                setIndexingStatus(data.status);
                if (data.status === 'ready' || data.status === 'error') {
                    if (pollInterval.current) {
                        clearInterval(pollInterval.current);
                        pollInterval.current = null;
                    }
                }
            }
        };

        // Check immediately
        checkStatus();

        // Start polling if indexing
        pollInterval.current = setInterval(checkStatus, 3000);

        return () => {
            if (pollInterval.current) clearInterval(pollInterval.current);
        };
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    const handleSend = async () => {
        if (!input.trim() || isTyping || indexingStatus === 'indexing') return;

        // Use streaming ONLY for chat mode if enabled. 
        // Reverting 'edit' mode to stable batch processing as requested.
        if (useStreaming && mode === 'chat') {
            return handleSendV2();
        }

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsTyping(true);

        try {
            let sessionId = sessionStorage.getItem('pdf_session_id');
            if (!sessionId) {
                sessionId = "session_" + Date.now();
                sessionStorage.setItem('pdf_session_id', sessionId);
            }
            
            const history = messages.slice(-10).map(m => ({
                role: m.role,
                content: typeof m.content === 'object' ? m.content.answer : m.content
            }));

            console.log(`[ChatPanel] Mode: ${mode} | Using Stable Batch Logic`);

            // Standard batch API call
            const data = mode === 'edit' 
                ? await sendEditMessage(userMsg, sessionId, history)
                : await sendChatMessage(userMsg, sessionId, history);

            if (data.success) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.answer || data.response || "Task completed."
                }]);

                if (data.modifications && data.modifications.length > 0) {
                    console.log(`[ChatPanel] Applying ${data.modifications.length} modifications...`);
                    if (onAIModification) {
                        onAIModification(data.modifications);
                    }
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
                content: "Connection trouble. Please try again."
            }]);
            setIsTyping(false);
        }
    };

    /**
     * STREAMING VERSION OF HANDLESEND (v2)
     * Handles both Chat and Edit modes with real-time feedback.
     */
    const handleSendV2 = async () => {
        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsTyping(true);
        appliedModIds.current.clear();

        try {
            let sessionId = sessionStorage.getItem('pdf_session_id');
            if (!sessionId) {
                sessionId = "session_" + Date.now();
                sessionStorage.setItem('pdf_session_id', sessionId);
            }

            const history = messages.slice(-10).map(m => ({
                role: m.role,
                content: typeof m.content === 'object' ? m.content.answer : m.content
            }));

            // Add placeholder for AI response
            setMessages(prev => [...prev, { role: 'assistant', content: { answer: '...' }, isStreaming: true }]);

            // Switch service based on mode
            const reader = mode === 'edit'
                ? await sendEditMessageV2(userMsg, sessionId, history)
                : await sendChatMessageV2(userMsg, sessionId, history);

            const decoder = new TextDecoder();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (dataStr === '[DONE]') break;
                        if (!dataStr) continue;

                        try {
                            const parsed = JSON.parse(dataStr);
                            
                            // 1. Update UI (Chat Message)
                            setMessages(prev => {
                                const updated = [...prev];
                                const lastMsg = updated[updated.length - 1];
                                lastMsg.content = {
                                    ...lastMsg.content,
                                    ...parsed
                                };
                                return updated;
                            });

                            // 2. If in EDIT mode, apply modifications as they arrive (Ghost Editing)
                            if (mode === 'edit' && parsed.modifications && parsed.modifications.length > 0) {
                                // Find mods we haven't applied yet in this session
                                const newMods = parsed.modifications.filter(m => !appliedModIds.current.has(m.id));
                                if (newMods.length > 0) {
                                    console.log(`[ChatPanel Stream] Applying ${newMods.length} new modifications...`);
                                    newMods.forEach(m => appliedModIds.current.add(m.id));
                                    if (onAIModification) {
                                        onAIModification(newMods);
                                    }
                                }
                            }
                        } catch (e) {
                            // Skip partial JSON errors
                        }
                    }
                }
            }

            // Mark streaming as finished
            setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1].isStreaming = false;
                return updated;
            });
            setIsTyping(false);

        } catch (error) {
            console.error("Streaming error:", error);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "Streaming connection lost. Please check your network."
            }]);
            setIsTyping(false);
        }
    };

    const handleSuggestedClick = (question) => {
        if (isTyping || indexingStatus === 'indexing') return;
        setInput(question);
        // We can't call handleSend directly easily because input won't be updated yet
        // but we can pass it or use a useEffect. Or just call a common logic.
    };

    // Use effect to trigger send when input is set from suggested
    useEffect(() => {
        if (input && messages.length > 0 && messages[messages.length-1].role === 'assistant' && messages[messages.length-1].content?.suggested_questions?.includes(input)) {
             // This is a bit hacky, let's just make handleSend accept an optional message
        }
    }, [input]);

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
                {messages.map((msg, idx) => {
                    const isAssistant = msg.role === 'assistant';
                    let structuredData = null;
                    
                    if (isAssistant && typeof msg.content === 'object') {
                        structuredData = msg.content;
                    } else if (isAssistant && typeof msg.content === 'string' && msg.content.trim().startsWith('{')) {
                        try {
                            structuredData = JSON.parse(msg.content);
                        } catch (e) {}
                    }

                    return (
                        <div key={idx} className={`message-bubble ${msg.role}`}>
                            <div className="message-content">
                                {structuredData ? (
                                    <div className="structured-response">
                                        {structuredData.highlights && structuredData.highlights.length > 0 && (
                                            <div className="highlights-box">
                                                <div className="highlights-header">✨ Key Takeaways</div>
                                                <ul>
                                                    {structuredData.highlights.map((h, i) => <li key={i}>{h}</li>)}
                                                </ul>
                                            </div>
                                        )}
                                        
                                        <div 
                                            className="main-answer" 
                                            dangerouslySetInnerHTML={{ __html: (structuredData.answer || '').replace(/\n/g, '<br/>') }} 
                                        />
                                        
                                        {structuredData.suggested_questions && structuredData.suggested_questions.length > 0 && (
                                            <div className="suggested-questions">
                                                <div className="suggested-label">Try asking:</div>
                                                <div className="suggested-pills-container">
                                                    {structuredData.suggested_questions.map((q, i) => (
                                                        <button 
                                                            key={i} 
                                                            className="suggested-q-pill" 
                                                            onClick={() => {
                                                                setInput(q);
                                                                // Trigger send in next tick
                                                                setTimeout(() => document.getElementById('chat-send-trigger')?.click(), 10);
                                                            }}
                                                        >
                                                            {q}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div dangerouslySetInnerHTML={{ __html: (msg.content || '').replace(/\n/g, '<br/>') }} />
                                )}
                            </div>
                        </div>
                    );
                })}
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
                    {indexingStatus === 'indexing' && (
                        <div className="indexing-loader">
                            <div className="spinner-small"></div>
                            <span>AI is indexing your document...</span>
                        </div>
                    )}
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={indexingStatus === 'indexing' ? "Waiting for AI..." : (mode === 'chat' ? "Ask a question..." : "Describe changes...")}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        disabled={indexingStatus === 'indexing'}
                    />
                    <button 
                        id="chat-send-trigger"
                        className={`send-button ${(!input.trim() || isTyping || indexingStatus === 'indexing') ? '' : 'active'}`}
                        onClick={handleSend}
                        disabled={!input.trim() || isTyping || indexingStatus === 'indexing'}
                    >
                        <i className="fa-solid fa-paper-plane" style={{fontSize: '0.9rem'}}></i>
                    </button>
                </div>
                <div className="chat-footer-hint">Powered by Groq & Pinecone</div>
            </div>
        </div>
    );
};

export default ChatPanel;
