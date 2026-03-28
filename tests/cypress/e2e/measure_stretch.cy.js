describe('Identify Text Stretching in Fit/Flow Layout', () => {
    beforeEach(() => {
        cy.viewport(1280, 1200);
        cy.visit('/');
    });

    it('should load edited_resume.pdf and identify heavily stretched lines', () => {
        // 1. Upload the target PDF using cy.readFile binary trick
        cy.readFile('public/docs/edited_resume.pdf', null).then((fileContent) => {
            cy.get('input[type="file"]').selectFile({
                contents: fileContent,
                fileName: 'edited_resume.pdf',
                mimeType: 'application/pdf'
            }, { force: true });
        });

        // 2. Wait for rendering
        cy.get('.editing-panel', { timeout: 30000 }).should('be.visible');
        cy.get('.webgl-single-page', { timeout: 20000 }).should('be.visible');
        cy.wait(3000); // Allow fonts to load and initial render metrics

        // 3. Turn on Fit Mode (or Reflow/Flow layout)
        cy.contains('button', 'FIT MODE', { matchCase: false }).click();
        cy.wait(2000); // Wait for scaling changes to apply

        // 4. Scan all text elements for their horizontal scale
        let stretchedItems = { bullets: 0, normal: 0, extreme: [] };

        cy.get('svg text').each(($text) => {
            const transform = $text.css('transform') || $text.attr('style') || '';
            const textContent = $text.text().trim();
            if (!textContent) return;

            // Extract the scale factor from the inline style transform: scale(1.5, 1) applied by React
            let scaleX = 1.0;
            const styleAttr = $text.attr('style') || '';
            const match = styleAttr.match(/scale\(([^,]+),/);
            if (match && match[1]) {
                scaleX = parseFloat(match[1]);
            }

            // Check if it's a bullet
            const isBullet = /^[\u2022\u25E6\u25A0\u2023\u25B8\u2043\u2219\xB7\xD7\xBB\-\u2013\u2014]/.test(textContent) || textContent.includes('·');

            if (scaleX > 1.1) {
                if (isBullet) stretchedItems.bullets++;
                else stretchedItems.normal++;

                if (scaleX >= 1.5) {
                    stretchedItems.extreme.push({ content: textContent.substring(0, 50), scale: scaleX, type: isBullet ? 'Bullet' : 'Normal' });
                }
            }
        }).then(() => {
            cy.log('--- STRETCH DIAGNOSTICS ---');
            cy.log(`Stretched Bullets (>1.1x): ${stretchedItems.bullets}`);
            cy.log(`Stretched Normal Text (>1.1x): ${stretchedItems.normal}`);
            cy.log(`Extreme Stretches (>=1.5x): ${stretchedItems.extreme.length}`);
            
            stretchedItems.extreme.forEach(item => {
                cy.log(`[${item.scale.toFixed(2)}x] [${item.type}]: ${item.content}...`);
            });

            // If we have massive stretches, the test will pass but print out useful logs.
            // We can add an assertion to fail if there are extreme stretches so we get a screenshot.
            if (stretchedItems.extreme.length > 0) {
                throw new Error(`Found ${stretchedItems.extreme.length} extremely stretched lines (>1.5x factor). See Cypress logs for details.`);
            }
        });
    });
});
