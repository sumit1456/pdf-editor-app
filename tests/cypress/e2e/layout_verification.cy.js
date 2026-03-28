describe('PDF Layout Verification', () => {
    beforeEach(() => {
        cy.viewport(1280, 1200); // Taller viewport for better visibility
        cy.visit('/');
    });

    it('should load edited_resume.pdf and capture layout diagnostic screenshots', () => {
        // 1. Load the PDF using Cypress readFile (binary)
        cy.readFile('public/docs/edited_resume.pdf', null).then((fileContent) => {
            cy.get('input[type="file"]').selectFile({
                contents: fileContent,
                fileName: 'edited_resume.pdf',
                mimeType: 'application/pdf'
            }, { force: true });
        });

        // 2. Wait for extraction and rendering
        cy.get('.editing-panel', { timeout: 30000 }).should('be.visible');
        cy.get('.webgl-single-page', { timeout: 20000 }).should('be.visible');
        
        // Ensure fonts are calibrated (this takes ~500ms after load)
        cy.wait(2000);

        // 3. Overall Page Layout Screenshot
        cy.screenshot('layout-full-overview');

        // 4. Specifically check for bullets and tables
        cy.get('svg text').then($texts => {
            cy.log(`Total text nodes: ${$texts.length}`);
        });

        // 5. Capture top section (usually contains header/bullets in a resume)
        cy.get('.page-paper-wrapper').first().screenshot('layout-top-section', {
            clip: { x: 0, y: 0, width: 800, height: 400 }
        });

        // 6. Capture potential table area (usually mid-bottom)
        cy.get('.page-paper-wrapper').first().screenshot('layout-mid-section', {
            clip: { x: 0, y: 400, width: 800, height: 400 }
        });

        // 7. Capture bottom section (potential java code or other details)
        cy.get('.page-paper-wrapper').first().screenshot('layout-bottom-section', {
            clip: { x: 0, y: 800, width: 800, height: 400 }
        });
        
        // 8. Toggle FIT MODE and capture again to see scaling effect
        cy.contains('button', 'FIT MODE', { matchCase: false }).click();
        cy.wait(1000);
        cy.screenshot('layout-fit-mode-on');
    });
});
