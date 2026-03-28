describe('Fit Mode Interactive Auditor', () => {
    it('should audit Fit Mode effectiveness after manual upload', () => {
        cy.viewport(1920, 1080); // Large window for easier manual interaction
        cy.visit('/');

        cy.log('ACTION REQUIRED: Please upload your PDF manually now.');
        
        // Wait for the user to upload and the editor to load the scene graph
        cy.get('.editing-panel', { timeout: 120000 }).should('be.visible');
        
        cy.log('Editor loaded. Initializing audit...');
        cy.wait(2000); // Wait for initial rendering

        // Turn on FIT MODE
        cy.contains('button', 'FIT MODE', { matchCase: false }).click();
        cy.log('Fit Mode enabled.');
        cy.wait(3000); // Wait for all scaling to apply

        const auditResults = {
            totalLines: 0,
            overflowLines: [],
            compressedLines: 0
        };

        cy.get('svg text').each(($text) => {
            const textContent = $text.text().trim();
            if (!textContent || textContent.length < 2) return;

            auditResults.totalLines++;

            const measuredWidth = parseFloat($text.attr('data-fit-measured-width')) || 0;
            const targetWidth = parseFloat($text.attr('data-fit-target-width')) || 0;
            const scaleX = parseFloat($text.attr('data-fit-scale')) || 1.0;

            // Detect if it's likely a bullet or special symbol
            const isBullet = /^[\u2022\u25E6\u25A0\xBB\-\u2013\u2014\u25CF\u2217\u22c6]/.test(textContent) || (textContent.length === 1);

            // If the measured width is significantly larger than the target width
            if (measuredWidth > targetWidth + 1.2) {
                if (scaleX >= 0.98) {
                    // Logic failure or capped by 1.0 limit (or bullet exemption)
                    auditResults.overflowLines.push({ 
                        content: textContent.substring(0, 40), 
                        diff: (measuredWidth - targetWidth).toFixed(1),
                        target: targetWidth.toFixed(1),
                        type: isBullet ? 'BULLET (Exempt)' : 'TEXT (Capped)'
                    });
                } else {
                    auditResults.compressedLines++;
                }
            }
        }).then(() => {
            cy.log('--- FIT MODE AUDIT REPORT ---');
            cy.log(`Total Significant Lines: ${auditResults.totalLines}`);
            cy.log(`Successfully Compressed: ${auditResults.compressedLines}`);
            cy.log(`FAILED TO FIT: ${auditResults.overflowLines.length}`);
            
            if (auditResults.overflowLines.length > 0) {
                cy.log('-- Top Failures (Natural Width > BBox) --');
                auditResults.overflowLines.slice(0, 20).forEach(line => {
                    const icon = line.type.includes('BULLET') ? '🛡️' : '❌';
                    cy.log(`${icon} [${line.type}] Diff: +${line.diff}pt | ${line.content}...`);
                });
            }
            cy.log('Audit complete. Check the items marked with ❌ for real overflow issues.');
        });
        
        // Final pause to let user inspect the result
        cy.pause();
    });
});
