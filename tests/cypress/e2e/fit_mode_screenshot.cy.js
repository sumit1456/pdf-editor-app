describe('Fit Mode Capture', () => {
    it('captures fit mode', () => {
        cy.viewport(1280, 1200);
        cy.visit('/');
        
        // Upload the PDF directly
        cy.readFile('public/docs/edited_resume.pdf', null).then((fileContent) => {
            cy.get('input[type="file"]').selectFile({
                contents: fileContent,
                fileName: 'edited_resume.pdf',
                mimeType: 'application/pdf'
            }, { force: true });
        });

        // Wait for editor to load
        cy.get('.editing-panel', { timeout: 30000 }).should('be.visible');
        cy.get('.webgl-single-page', { timeout: 20000 }).should('be.visible');
        cy.wait(5000); // Allow fonts to load and initial render metrics

        // Turn on Fit Mode
        cy.contains('button', 'FIT MODE', { matchCase: false }).click();
        cy.wait(2000); // Wait for scaling changes to apply

        // Capture screenshot
        cy.screenshot('fit-mode-screenshot-only');
    });
});
