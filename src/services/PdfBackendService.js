import { BASE_URL, ENDPOINTS } from "./api";

/**
 * Service to handle communication with the PDF Extraction Backend.
 */
export const uploadPdfToBackend = async (file, sessionId) => {
    const formData = new FormData();
    formData.append('file', file);
    if (sessionId) formData.append('session_id', sessionId);

    try {
        const response = await fetch(`${BASE_URL}${ENDPOINTS.EXTRACT}`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Backend Error ${response.status}: ${errorText || response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("PDF Extraction Failed:", error);
        throw error;
    }
};

/**
 * Service to save/export the reconstructed PDF.
 */
export const savePdfToBackend = async (payload) => {
    console.log("===============================================");
    console.log(payload);
    console.log("===============================================");



    try {
        const response = await fetch(`${BASE_URL}${ENDPOINTS.SAVE}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Export Error ${response.status}: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("PDF Export Failed:", error);
        throw error;
    }
};

/**
 * Service to create a PDF from raw text input.
 */
export const createPdfFromText = async (text) => {
    try {
        const response = await fetch(`${BASE_URL}${ENDPOINTS.CREATE_FROM_TEXT}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Creation Error ${response.status}: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("PDF Creation Failed:", error);
        throw error;
    }
};

/**
 * Diagnostic Logging for Font Matching
 * Sends original vs frontend-refined mapping to diagnostic_render.log
 */
export const logFontMapping = async (diagData) => {
    try {
        await fetch(`${BASE_URL}${ENDPOINTS.LOG}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(diagData),
        });
    } catch (error) {
        console.warn('[BackendService] Failed to log font mapping:', error);
    }
};

/**
 * Service to chat with the AI Assistant about the PDF.
 */
export const sendChatMessage = async (message, sessionId, history = [], provider = null, model = null) => {
    try {
        const response = await fetch(`${BASE_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                message, 
                session_id: sessionId, 
                history,
                llm_provider: provider,
                llm_model: model
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Chat Error ${response.status}: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("AI Chat Failed:", error);
        throw error;
    }
};

/**
 * Send a message to the Agent Gateway and stream events/result via backend SSE proxy.
 * Replaces the previous webhook-waiting mechanism with direct gateway SSE streaming.
 *
 * @param {string} message - User prompt
 * @param {string} sessionId - PDF session ID
 * @param {function} [onProgress] - Optional callback for intermediate events: ({ event, data, raw })
 * @returns {Promise<{ ready: boolean, run_id: string, answer: any }>}
 */
export const sendAgentMessage = async (message, sessionId, onProgress = null) => {
    // 1. Trigger agent run
    const response = await fetch(`${BASE_URL}/api/agent-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, session_id: sessionId }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.detail || data.error || `Agent request failed (${response.status})`);
    }

    const runId = data.run_id || data.id;
    if (!runId) {
        // Gateway returned an immediate synchronous result (no async run)
        return data;
    }

    // 2. Stream events from backend proxy: GET /api/agent-result/{run_id}/stream
    const streamRes = await fetch(`${BASE_URL}/api/agent-result/${runId}/stream`, {
        headers: {
            'Accept': 'text/event-stream',
        },
    });

    if (!streamRes.ok) {
        const errData = await streamRes.json().catch(() => ({}));
        throw new Error(errData.detail || `Agent stream failed (${streamRes.status})`);
    }

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let currentEvent = 'message';
    let currentDataLines = [];
    let completedResult = null;

    const timeout = setTimeout(() => {
        try { reader.cancel(); } catch { }
    }, 130000);

    const handleEventBlock = (eventType, dataLines) => {
        if (!dataLines || dataLines.length === 0) return;
        const raw = dataLines.join('\n');
        let parsed = null;
        try {
            parsed = JSON.parse(raw);
        } catch {
            parsed = raw;
        }

        if (parsed && typeof parsed === 'object') {
            if (parsed.ready === true) {
                completedResult = parsed;
            } else if (parsed.ready === false) {
                throw new Error(parsed.error || 'Agent run failed.');
            }
        }

        if (typeof onProgress === 'function') {
            try {
                onProgress({ event: eventType, data: parsed, raw });
            } catch (cbErr) {
                console.warn('[sendAgentMessage] Error in onProgress callback:', cbErr);
            }
        }
    };

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() || '';

            for (const rawLine of lines) {
                const line = rawLine.trimEnd();
                if (!line) {
                    // Empty line marks end of an SSE message block
                    handleEventBlock(currentEvent, currentDataLines);
                    currentEvent = 'message';
                    currentDataLines = [];
                } else if (line.startsWith('event:')) {
                    currentEvent = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                    currentDataLines.push(line.slice(5).trimStart());
                } else if (line.startsWith(':')) {
                    // SSE keepalive comment
                }
            }
        }

        // Process any trailing buffered block
        if (sseBuffer.trim()) {
            const trailingLines = sseBuffer.split('\n');
            for (const rawLine of trailingLines) {
                const line = rawLine.trimEnd();
                if (line.startsWith('event:')) {
                    currentEvent = line.slice(6).trim();
                } else if (line.startsWith('data:')) {
                    currentDataLines.push(line.slice(5).trimStart());
                }
            }
            handleEventBlock(currentEvent, currentDataLines);
        }

        if (completedResult) {
            return completedResult;
        }

        throw new Error('Agent stream closed without returning a result.');
    } finally {
        clearTimeout(timeout);
    }
};

/**
 * Streaming version of chat message sending.
 * Returns a readable stream reader.
 */
export const sendChatMessageV2 = async (message, sessionId, history = [], provider = null, model = null) => {
    const response = await fetch(`${BASE_URL}/chat-v2`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            message, 
            session_id: sessionId, 
            history,
            llm_provider: provider,
            llm_model: model
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Chat Streaming Error ${response.status}: ${errorText}`);
    }

    return response.body.getReader();
};

/**
 * Service to send a dedicated edit request to the AI.
 */
export const sendEditMessage = async (message, sessionId, history = [], provider = null, model = null) => {
    try {
        const response = await fetch(`${BASE_URL}/chat-edit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                message, 
                session_id: sessionId, 
                history,
                llm_provider: provider,
                llm_model: model
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Edit Error ${response.status}: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error("AI Edit Failed:", error);
        throw error;
    }
};

/**
 * Streaming version of AI edit requests.
 */
export const sendEditMessageV2 = async (message, sessionId, history = [], provider = null, model = null) => {
    const response = await fetch(`${BASE_URL}/chat-edit-v2`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            message, 
            session_id: sessionId, 
            history,
            llm_provider: provider,
            llm_model: model
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Edit Streaming Error ${response.status}: ${errorText}`);
    }

    return response.body.getReader();
};

/**
 * Service to explicitly clear a session and its vector data.
 */
export const deleteSession = async (sessionId) => {
    if (!sessionId) return;
    try {
        await fetch(`${BASE_URL}/chat/session/${sessionId}`, {
            method: 'DELETE',
            // use keepalive to ensure request completes even if tab is closing
            keepalive: true
        });
    } catch (error) {
        console.warn("[BackendService] Failed to clear session:", error);
    }
};

/**
 * Cleanup session data from Pinecone.
 */
export const cleanupSession = async (sessionId) => {
    if (!sessionId) return;
    try {
        await fetch(`${BASE_URL}/cleanup-session/${sessionId}`, {
            method: 'POST',
            keepalive: true
        });
    } catch (error) {
        console.warn("[BackendService] Failed to cleanup session:", error);
    }
};
/**
 * Service to check the indexing status of a document for AI chat.
 */
export const checkIndexingStatus = async (sessionId) => {
    try {
        const response = await fetch(`${BASE_URL}${ENDPOINTS.CHAT_STATUS}/${sessionId}`);
        if (!response.ok) return { success: false, status: 'error' };
        return await response.json();
    } catch (error) {
        console.error("Status Check Failed:", error);
        return { success: false, status: 'error' };
    }
};
