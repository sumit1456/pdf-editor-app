import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage, sendChatMessageV2, sendEditMessage, sendEditMessageV2, checkIndexingStatus } from '../../services/PdfBackendService';
import './ChatPanel.css';

/**
 * TypewriterText — reveals `html` text word-by-word.
 * When animate=false (history messages) it renders instantly.
 * While animating it calls scrollRef.scrollTo on every tick.
 */
const TypewriterText = ({ html, animate, scrollRef }) => {
    const words = (html || '').split(' ');
    const [count, setCount] = useState(animate ? 0 : words.length);
    const timerRef = useRef(null);

    useEffect(() => {
        if (!animate) {
            setCount(words.length);
            return;
        }
        setCount(0);
        let i = 0;
        const BATCH = 15; // words per tick — reduce for slower reveal
        timerRef.current = setInterval(() => {
            i = Math.min(i + BATCH, words.length);
            setCount(i);
            if (scrollRef?.current) {
                scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            }
            if (i >= words.length) clearInterval(timerRef.current);
        }, 55);
        return () => clearInterval(timerRef.current);
    }, [html, animate]); // eslint-disable-line react-hooks/exhaustive-deps

    const visible = words.slice(0, count).join(' ');
    return <span dangerouslySetInnerHTML={{ __html: visible.replace(/\n/g, '<br/>') }} />;
};

const ChatPanel = ({ pdfName, onAIModification }) => {
    const [mode, setMode] = useState('chat'); // 'chat' or 'edit'
    const [useStreaming, setUseStreaming] = useState(true);

    // Display labels only — backend uses python-backend/.env (same as scripts/test_llm_apis.py)
    const GROQ_MODEL = import.meta.env.VITE_GROQ_MODEL || 'openai/gpt-oss-120b';
    const GOOGLE_MODEL = import.meta.env.VITE_GOOGLE_MODEL || 'gemini-2.5-flash-lite';

    const MODELS = {
        groq: { name: `Groq (${GROQ_MODEL})`, icon: '⚡', provider: 'groq' },
        gemini: { name: `Gemini (${GOOGLE_MODEL})`, icon: '🧠', provider: 'google' },
    };

    const welcomeMessage = {
        role: 'assistant',
        content: `Hello! I'm your AI assistant for **${pdfName}**. I can answer questions about the content or help you perform **AI-assisted PDF edits** directly. How can I help you today?`
    };

    const [messages, setMessages] = useState([welcomeMessage]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [indexingStatus, setIndexingStatus] = useState('ready');

    const scrollRef = useRef(null);
    const pollInterval = useRef(null);
    const [selectedLLM, setSelectedLLM] = useState('groq');
    const appliedModIds = useRef(new Set());

    const updateStreamingText = (rawText) => {
        setMessages(prev => {
            const lastIdx = prev.length - 1;
            if (lastIdx < 0 || prev[lastIdx].role !== 'assistant') return prev;
            return prev.map((msg, i) =>
                i === lastIdx ? { ...msg, content: rawText, isStreaming: true } : msg
            );
        });
    };

    const finalizeStreamingMessage = (structuredData) => {
        setMessages(prev => {
            const lastIdx = prev.length - 1;
            if (lastIdx < 0 || prev[lastIdx].role !== 'assistant') return prev;
            return prev.map((msg, i) =>
                i === lastIdx ? { ...msg, content: structuredData, isStreaming: false } : msg
            );
        });
    };

    const processSseLine = (line, onParsed) => {
        if (!line.startsWith('data: ')) return false;
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') return true;
        if (!dataStr) return false;

        try {
            const parsed = JSON.parse(dataStr);
            console.log('[ChatPanel Stream] Received chunk:', parsed);
            onParsed(parsed);
        } catch (e) {
            console.warn('[ChatPanel Stream] Failed to parse SSE JSON:', dataStr.slice(0, 200), e);
        }
        return false;
    };

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

    // Auto-scroll to bottom — throttled and smooth during streaming
    const scrollTimer = useRef(null);
    useEffect(() => {
        if (scrollRef.current) {
            if (scrollTimer.current) clearTimeout(scrollTimer.current);
            scrollTimer.current = setTimeout(() => {
                scrollRef.current.scrollTo({
                    top: scrollRef.current.scrollHeight,
                    behavior: 'smooth'
                });
            }, 80);
        }
        return () => { if (scrollTimer.current) clearTimeout(scrollTimer.current); };
    }, [messages, isTyping]);

    const handleSend = async () => {
        if (!input.trim() || isTyping || indexingStatus === 'indexing') return;

        // Route to streaming logic if enabled
        if (useStreaming) {
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
                content: (m.content !== null && typeof m.content === 'object') ? (m.content.answer ?? '') : (m.content ?? '')
            })).filter(m => m.content);

            console.log(`[ChatPanel] Mode: ${mode} | Using Stable Batch Logic`);

            const currentModel = MODELS[selectedLLM];
            // Omit llm_model — backend reads GROQ_MODEL / GOOGLE_MODEL from .env (same as test_llm_apis.py)
            console.log(`[ChatPanel] provider=${currentModel.provider} | model=backend .env default`);

            const data = mode === 'edit'
                ? await sendEditMessage(userMsg, sessionId, history, currentModel.provider, null)
                : await sendChatMessage(userMsg, sessionId, history, currentModel.provider, null);

            if (data.success) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.answer || data.response || "Task completed."
                }]);

                if (data.modifications && data.modifications.length > 0) {
                    console.log(`[ChatPanel] Applying ${data.modifications.length} modifications...`);
                    if (onAIModification) {
                        onAIModification(data.modifications, userMsg);
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
                content: (m.content !== null && typeof m.content === 'object') ? (m.content.answer ?? '') : (m.content ?? '')
            })).filter(m => m.content);

            // Placeholder bubble — typing dots render inside it (no literal "...")
            setMessages(prev => [...prev, { role: 'assistant', content: null, isStreaming: true }]);

            const currentModel = MODELS[selectedLLM];
            console.log(`[ChatPanel Stream] provider=${currentModel.provider} | model=backend .env default`);

            const reader = mode === 'edit'
                ? await sendEditMessageV2(userMsg, sessionId, history, currentModel.provider, null)
                : await sendChatMessageV2(userMsg, sessionId, history, currentModel.provider, null);

            const decoder = new TextDecoder();
            let finalModifications = null;
            let sseBuffer = '';
            let streamDone = false;
            let rawText = '';

            while (!streamDone) {
                const { done, value } = await reader.read();
                if (done) break;

                sseBuffer += decoder.decode(value, { stream: true });
                const lines = sseBuffer.split('\n');
                sseBuffer = lines.pop() || '';

                for (const line of lines) {
                    if (processSseLine(line, (parsed) => {
                        if (parsed.type === 'delta') {
                            rawText += parsed.content;
                            updateStreamingText(rawText);
                        } else if (parsed.type === 'result') {
                            const data = parsed.data;
                            finalizeStreamingMessage(data);
                            if (data.modifications) {
                                finalModifications = data.modifications;
                            }
                        } else if (parsed.answer) {
                            // Handles edit mode single-payload and any direct or fallback chat response
                            finalizeStreamingMessage(parsed);
                            if (parsed.modifications !== undefined) {
                                finalModifications = parsed.modifications;
                            }
                        } else if (parsed.error && !parsed.answer) {
                            finalizeStreamingMessage({ answer: `Sorry, something went wrong: ${parsed.error}` });
                        }
                    })) {
                        streamDone = true;
                        break;
                    }
                }
            }

            // Process any remaining buffered line
            if (sseBuffer.trim()) {
                processSseLine(sseBuffer.trim(), (parsed) => {
                    if (parsed.type === 'delta') {
                        rawText += parsed.content;
                        updateStreamingText(rawText);
                    } else if (parsed.type === 'result') {
                        const data = parsed.data;
                        finalizeStreamingMessage(data);
                        if (data.modifications) {
                            finalModifications = data.modifications;
                        }
                    } else if (parsed.answer) {
                        finalizeStreamingMessage(parsed);
                        if (parsed.modifications !== undefined) {
                            finalModifications = parsed.modifications;
                        }
                    } else if (parsed.error && !parsed.answer) {
                        finalizeStreamingMessage({ answer: `Sorry, something went wrong: ${parsed.error}` });
                    }
                });
            }

            console.log('[ChatPanel Stream] Stream finished');

            // Mark streaming as finished
            setMessages(prev => {
                const lastIdx = prev.length - 1;
                if (lastIdx < 0) return prev;
                return prev.map((msg, i) =>
                    i === lastIdx ? { ...msg, isStreaming: false } : msg
                );
            });
            setIsTyping(false);

            // Apply modifications once the stream is completely finished
            if (mode === 'edit' && finalModifications && finalModifications.length > 0) {
                console.log(`[ChatPanel Stream] Stream finished. Applying ${finalModifications.length} fully formed modifications...`);
                if (onAIModification) {
                    onAIModification(finalModifications, userMsg);
                }
            }

        } catch (error) {
            console.error("Streaming error:", error);
            setMessages(prev => {
                const lastIdx = prev.length - 1;
                const errorContent = { answer: `Streaming connection lost: ${error.message || 'Please check your network.'}` };
                if (lastIdx >= 0 && prev[lastIdx].role === 'assistant' && prev[lastIdx].isStreaming) {
                    return prev.map((msg, i) =>
                        i === lastIdx ? { ...msg, content: errorContent, isStreaming: false } : msg
                    );
                }
                return [...prev, { role: 'assistant', content: errorContent }];
            });
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
        if (input && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content?.suggested_questions?.includes(input)) {
            // This is a bit hacky, let's just make handleSend accept an optional message
        }
    }, [input]);

    return (
        <div className="chat-panel-container">
            <div className="chat-mode-header">
                <div className="mode-btns">
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

                <div className="llm-selector-container">
                    <select
                        value={selectedLLM}
                        onChange={(e) => setSelectedLLM(e.target.value)}
                        className="llm-selector-dropdown"
                    >
                        {Object.entries(MODELS).map(([id, m]) => (
                            <option key={id} value={id}>
                                {m.icon} {m.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="chat-messages" ref={scrollRef}>
                {messages.map((msg, idx) => {
                    const isAssistant = msg.role === 'assistant';
                    let structuredData = null;

                    // Only treat as structured if content is a non-null object
                    if (isAssistant && msg.content !== null && typeof msg.content === 'object') {
                        structuredData = msg.content;
                    }

                    // Show typing dots only when content is null (before first delta token)
                    const showTypingInBubble = msg.isStreaming && msg.content === null;
                    // Raw text streaming phase (delta tokens accumulating)
                    const isStreamingText = msg.isStreaming && typeof msg.content === 'string';
                    // Animate typewriter only on the last (newest) assistant message
                    const shouldAnimate = !msg.isStreaming && isAssistant && idx === messages.length - 1;

                    return (
                        <div key={idx} className={`message-bubble ${msg.role}${msg.isStreaming ? ' streaming' : ''}`}>
                            <div className="message-content">
                                {showTypingInBubble ? (
                                    <div className="typing-indicator" aria-label="Assistant is typing">
                                        <span></span><span></span><span></span>
                                    </div>
                                ) : isStreamingText ? (
                                    // Progressive raw-text phase — show accumulating text with a blinking cursor
                                    <div className="streaming-text">
                                        <span dangerouslySetInnerHTML={{ __html: (msg.content || '').replace(/\n/g, '<br/>') }} />
                                        <span className="stream-cursor" />
                                    </div>
                                ) : structuredData ? (
                                    <div className="structured-response">
                                        {/* Answer first */}
                                        <div className="main-answer">
                                            <TypewriterText
                                                html={structuredData.answer || ''}
                                                animate={shouldAnimate}
                                                scrollRef={scrollRef}
                                            />
                                        </div>

                                        {/* Highlights below the answer */}
                                        {structuredData.highlights && structuredData.highlights.length > 0 && (
                                            <div className="highlights-box">
                                                <div className="highlights-header">✨ Key Takeaways</div>
                                                <ul>
                                                    {structuredData.highlights.map((h, i) => <li key={i}>{h}</li>)}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Suggested questions at the bottom */}
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
                {isTyping && !messages.some(m => m.isStreaming) && (
                    <div className="message-bubble assistant">
                        <div className="message-content">
                            <div className="typing-indicator" aria-label="Assistant is typing">
                                <span></span><span></span><span></span>
                            </div>
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
                        <i className="fa-solid fa-paper-plane" style={{ fontSize: '0.9rem' }}></i>
                    </button>
                </div>
                <div className="chat-footer-hint">Powered by Groq & Pinecone</div>
            </div>
        </div>
    );
};

export default ChatPanel;
