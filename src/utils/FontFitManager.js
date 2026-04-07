/**
 * FontFitManager - Manages FontFitWorker for high-fidelity font sizing
 * Integrates with EditorPage and PythonRenderer for bbox-based text fitting
 */

class FontFitManager {
    constructor() {
        this.worker = null;
        this.isReady = false;
        this.initPromise = null;
        this.pendingJobs = new Map();
        this.jobIdCounter = 0;
        this.debugMode = false;
    }

    /**
     * Initialize the FontFitWorker
     */
    async init() {
        if (this.isReady) return true;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            try {
                // Ensure absolute path from public root
                this.worker = new Worker('/workers/FontFitWorker.js');
                
                this.worker.onmessage = (e) => {
                    try {
                        const { type, data } = e.data;
                        
                        switch (type) {
                            case 'ready':
                                this.isReady = true;
                                console.log('[FontFitManager] Worker initialized successfully');
                                resolve(true);
                                break;
                                
                            case 'complete':
                                this._handleJobComplete(data);
                                break;
                                
                            case 'progress':
                                if (this.debugMode) {
                                    console.log('[FontFitManager] Progress:', data?.message || 'No message');
                                }
                                break;
                                
                            case 'debugLog':
                                if (this.debugMode) {
                                    console.log(`[FontFitManager] Debug: ${data?.wordId || 'unknown'} | Size: ${data?.size?.toFixed(2) || 'N/A'} | Width: ${data?.width?.toFixed(1) || 'N/A'} | Target: ${data?.target || 'N/A'}`);
                                }
                                break;
                                
                            case 'error':
                                console.error('[FontFitManager] Worker error:', data?.message || 'Unknown error');
                                this._handleJobError(data);
                                break;
                                
                            default:
                                console.warn('[FontFitManager] Unknown message type:', type, data);
                        }
                    } catch (error) {
                        console.error('[FontFitManager] Error processing worker message:', error, 'Raw message:', e.data);
                        // If we can't process the message, it might be an HTML error page
                        if (typeof e.data === 'string' && e.data.includes('<')) {
                            console.error('[FontFitManager] Worker returned HTML instead of JSON - check worker file path');
                            reject(new Error('FontFitWorker.js not found or returned HTML error page'));
                        }
                    }
                };

                this.worker.onerror = (error) => {
                    console.error('[FontFitManager] Worker failed to load:', error);
                    reject(error);
                };

                // Initialize worker
                this.worker.postMessage({ type: 'init' });
                
            } catch (error) {
                console.error('[FontFitManager] Failed to create worker:', error);
                reject(error);
            }
        });
    }

    /**
     * Fit text to bounding box width using FontFitWorker
     * @param {Array} words - Array of word objects with content, size, font properties
     * @param {number} targetWidth - Target width in pixels
     * @param {Function} onComplete - Callback function(results, summary)
     * @param {Function} onError - Callback function(error)
     * @returns {string} Job ID for tracking
     */
    fitTextToBbox(words, targetWidth, onComplete, onError) {
        if (!this.isReady) {
            this.init().then(() => {
                this.fitTextToBbox(words, targetWidth, onComplete, onError);
            });
            return null;
        }

        const jobId = `job-${++this.jobIdCounter}`;
        
        // Store job callbacks
        this.pendingJobs.set(jobId, { onComplete, onError, words, targetWidth });
        
        // Prepare words for worker
        const workerWords = words.map((word, index) => ({
            id: word.id || `word-${index}`,
            content: word.content || '',
            size: word.size || 12,
            font: word.font || 'Inter',
            google_font: word.google_font || word.font,
            is_bold: Boolean(word.is_bold),
            is_italic: Boolean(word.is_italic),
            weight: word.weight || (word.is_bold ? '700' : '400')
        }));

        // Send to worker
        this.worker.postMessage({
            type: 'fitWords',
            jobId: jobId,
            data: {
                words: workerWords,
                targetWidth: targetWidth
            }
        });

        if (this.debugMode) {
            console.log(`[FontFitManager] Submitted job ${jobId}: ${words.length} words to ${targetWidth}px`);
        }

        return jobId;
    }

    /**
     * Fit a single line of text (simplified interface)
     * @param {string} text - Text content
     * @param {Object} fontStyle - Font properties (size, family, weight, etc.)
     * @param {number} targetWidth - Target width in pixels
     * @param {Function} onComplete - Callback function(result)
     * @returns {string} Job ID
     */
    fitLine(text, fontStyle, targetWidth, onComplete) {
        const words = text.split(/\s+/).filter(word => word.length > 0).map((word, index) => ({
            id: `line-word-${index}`,
            content: word,
            ...fontStyle
        }));

        return this.fitTextToBbox(words, targetWidth, (results, summary) => {
            // Return the first result since all words get the same size in line mode
            const lineResult = results[0] || {};
            onComplete({
                optimalSize: lineResult.optimalSize || fontStyle.size,
                actualWidth: summary.totalFittedWidth || 0,
                targetWidth: targetWidth,
                fits: summary.overallFits || false,
                scale: lineResult.scale || 1.0,
                iterations: summary.totalIterations || 0
            });
        });
    }

    /**
     * Compare original font metric against candidates and find best Google Font match
     */
    async findBestFontMatch(originalFont, text, candidates, style = {}) {
        if (!this.isReady) await this.init();

        const jobId = `job-match-${++this.jobIdCounter}`;

        return new Promise((resolve, reject) => {
            this.pendingJobs.set(jobId, {
                onComplete: (data) => resolve(data),
                onError: (err) => reject(err)
            });

            this.worker.postMessage({
                type: 'matchFont',
                jobId,
                data: {
                    originalFont,
                    text,
                    candidates,
                    size: style.size,
                    isBold: style.is_bold,
                    isItalic: style.is_italic
                }
            });
        });
    }

    /**
     * Handle worker job completion
     * @private
     */
    _handleJobComplete(data) {
        if (!data) {
            console.error('[FontFitManager] Received empty completion data');
            return;
        }
        
        const { jobId, results, summary } = data;
        
        if (!jobId) {
            console.error('[FontFitManager] No jobId in completion data:', data);
            return;
        }
        
        const job = this.pendingJobs.get(jobId);
        
        if (job) {
            if (this.debugMode) {
                console.log(`[FontFitManager] Job ${jobId} completed:`, {
                    words: results?.length || 0,
                    finalSize: results?.[0]?.optimalSize || 'N/A',
                    actualWidth: summary?.totalFittedWidth || 'N/A',
                    targetWidth: summary?.targetWidth || 'N/A',
                    fits: summary?.overallFits || false
                });
            }
            
            job.onComplete(results || [], summary || {});
            this.pendingJobs.delete(jobId);
        } else {
            console.warn(`[FontFitManager] Received completion for unknown job: ${jobId}`);
        }
    }

    /**
     * Handle worker job error
     * @private
     */
    _handleJobError(data) {
        if (!data) {
            console.error('[FontFitManager] Received empty error data');
            return;
        }
        
        const { jobId, message } = data;
        const job = jobId ? this.pendingJobs.get(jobId) : null;
        
        if (job && job.onError) {
            job.onError(new Error(message || 'Unknown worker error'));
            this.pendingJobs.delete(jobId);
        } else {
            console.error(`[FontFitManager] Job ${jobId || 'unknown'} failed:`, message || 'Unknown error');
        }
    }

    /**
     * Cancel a pending job
     * @param {string} jobId - Job ID to cancel
     */
    cancelJob(jobId) {
        if (this.pendingJobs.has(jobId)) {
            this.pendingJobs.delete(jobId);
            console.log(`[FontFitManager] Cancelled job: ${jobId}`);
        }
    }

    /**
     * Enable/disable debug mode
     * @param {boolean} enabled 
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }

    /**
     * Get worker status
     */
    getStatus() {
        return {
            isReady: this.isReady,
            pendingJobs: this.pendingJobs.size,
            workerActive: !!this.worker
        };
    }

    /**
     * Cleanup worker and pending jobs
     */
    destroy() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.isReady = false;
        this.pendingJobs.clear();
        console.log('[FontFitManager] Cleaned up worker and jobs');
    }
}

// Export singleton instance
export const fontFitManager = new FontFitManager();

// Export class for testing/multiple instances
export default FontFitManager;
