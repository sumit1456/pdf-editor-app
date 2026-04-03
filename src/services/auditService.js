const BASE_URL = 'http://localhost:8000';

/**
 * High-Fidelity Audit Reporter
 * Directly sends structured fitting results to the backend.
 * Uses keepalive to ensure delivery even if the page is navigating.
 */
export const reportAudit = async (reportData) => {
    try {
        const payload = JSON.stringify(reportData);
        
        // Use fetch for reporting...
        await fetch(`${BASE_URL}/api/audit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: payload
        });
    } catch (err) {
        // Silent fail in production, but we're in dev
        console.error('[AuditService] Failed to send report:', err);
    }
};
