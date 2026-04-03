/**
 * FontFitIntegrationTest - Test utility for verifying FontFitWorker integration
 * with backend result.json bbox data
 */

import { fontFitManager } from './FontFitManager';

export class FontFitIntegrationTest {
    constructor() {
        this.testResults = [];
    }

    /**
     * Test FontFitWorker with sample bbox data from backend result.json
     */
    async testWithBackendBboxData() {
        console.log('[FontFitIntegrationTest] Starting integration test with backend bbox data...');
        
        // Sample bbox data from result.json (Python backend format)
        const sampleLines = [
            {
                id: 'test-line-1',
                content: 'SUMIT HATEKAR',
                bbox: [226.9199981689453, 5.951017379760742, 368.35919189453125, 20.297218322753906],
                fontStyle: {
                    size: 14.346199989318848,
                    font: 'CMBX12',
                    google_font: 'Source Serif 4',
                    is_bold: true,
                    is_italic: false
                }
            },
            {
                id: 'test-line-2', 
                content: 'Full Stack Developer',
                bbox: [249.28599548339844, 20.297218322753906, 345.9975891113281, 34.643418322753906],
                fontStyle: {
                    size: 11.955199813842773,
                    font: 'CMR12',
                    google_font: 'Source Serif 4',
                    is_bold: false,
                    is_italic: false
                }
            },
            {
                id: 'test-line-3',
                content: 'Fast. Precise. Built for text-heavy documents.',
                bbox: [205.30833897238162, 159.99996000000002, 588.3921868862916, 177.333289],
                fontStyle: {
                    size: 17.333329000000003,
                    font: 'Helvetica-Bold',
                    google_font: 'Inter',
                    is_bold: true,
                    is_italic: false
                }
            }
        ];

        try {
            // Initialize FontFitManager
            await fontFitManager.init();
            fontFitManager.setDebugMode(true);

            // Test each line
            for (const line of sampleLines) {
                const result = await this.testLineFitting(line);
                this.testResults.push(result);
            }

            // Print summary
            this.printTestSummary();
            
        } catch (error) {
            console.error('[FontFitIntegrationTest] Test failed:', error);
            this.testResults.push({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Test individual line fitting
     */
    async testLineFitting(line) {
        const { id, content, bbox, fontStyle } = line;
        const targetWidth = bbox[2] - bbox[0];
        
        console.log(`[FontFitIntegrationTest] Testing line "${content}" with target width ${targetWidth.toFixed(2)}px`);

        return new Promise((resolve) => {
            const jobId = fontFitManager.fitLine(
                content,
                fontStyle,
                targetWidth,
                (result) => {
                    const success = result.fits;
                    const accuracy = Math.abs(result.actualWidth - targetWidth) / targetWidth;
                    
                    console.log(`[FontFitIntegrationTest] Line ${id} result:`, {
                        originalSize: fontStyle.size,
                        optimalSize: result.optimalSize.toFixed(2),
                        targetWidth: targetWidth.toFixed(2),
                        actualWidth: result.actualWidth.toFixed(2),
                        fits: result.fits,
                        accuracy: (accuracy * 100).toFixed(2) + '%',
                        iterations: result.iterations
                    });

                    resolve({
                        id,
                        content,
                        success,
                        accuracy,
                        result,
                        bbox,
                        targetWidth
                    });
                }
            );
        });
    }

    /**
     * Print test summary
     */
    printTestSummary() {
        console.log('\n[FontFitIntegrationTest] === TEST SUMMARY ===');
        
        const successful = this.testResults.filter(r => r.success).length;
        const total = this.testResults.length;
        
        console.log(`Total tests: ${total}`);
        console.log(`Successful: ${successful}`);
        console.log(`Failed: ${total - successful}`);
        console.log(`Success rate: ${((successful / total) * 100).toFixed(1)}%`);
        
        if (successful > 0) {
            const avgAccuracy = this.testResults
                .filter(r => r.success && r.accuracy !== undefined)
                .reduce((sum, r) => sum + r.accuracy, 0) / successful;
            
            console.log(`Average accuracy: ${(avgAccuracy * 100).toFixed(2)}%`);
        }
        
        console.log('\nDetailed results:');
        this.testResults.forEach(result => {
            if (result.success) {
                console.log(`✓ ${result.id}: "${result.content}" - ${(result.accuracy * 100).toFixed(2)}% accuracy`);
            } else {
                console.log(`✗ ${result.id}: ${result.error || 'Unknown error'}`);
            }
        });
        
        console.log('=== END SUMMARY ===\n');
    }

    /**
     * Test integration with EditorPage workflow
     */
    async testEditorPageIntegration() {
        console.log('[FontFitIntegrationTest] Testing EditorPage integration workflow...');
        
        // Simulate EditorPage workflow
        const simulatedEdit = {
            lineId: 'editor-test-line',
            text: 'Edited content with longer text to test fitting',
            bbox: [100, 50, 500, 70], // 400px width
            fontStyle: {
                size: 16,
                font: 'Inter',
                google_font: 'Inter',
                is_bold: false,
                is_italic: false
            }
        };

        try {
            await fontFitManager.init();
            
            const result = await new Promise((resolve) => {
                fontFitManager.fitLine(
                    simulatedEdit.text,
                    simulatedEdit.fontStyle,
                    simulatedEdit.bbox[2] - simulatedEdit.bbox[0],
                    resolve
                );
            });

            console.log('[FontFitIntegrationTest] EditorPage integration result:', {
                originalSize: simulatedEdit.fontStyle.size,
                optimalSize: result.optimalSize.toFixed(2),
                scale: (result.optimalSize / simulatedEdit.fontStyle.size).toFixed(2),
                fits: result.fits,
                accuracy: ((1 - Math.abs(result.actualWidth - (simulatedEdit.bbox[2] - simulatedEdit.bbox[0])) / (simulatedEdit.bbox[2] - simulatedEdit.bbox[0])) * 100).toFixed(2) + '%'
            });

            return result;
            
        } catch (error) {
            console.error('[FontFitIntegrationTest] EditorPage integration test failed:', error);
            throw error;
        }
    }
}

// Export singleton for easy testing
export const fontFitIntegrationTest = new FontFitIntegrationTest();

// Auto-run tests in development mode
if (process.env.NODE_ENV === 'development') {
    // Uncomment to run tests automatically
    // setTimeout(() => fontFitIntegrationTest.testWithBackendBboxData(), 2000);
}
