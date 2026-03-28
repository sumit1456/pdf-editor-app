describe('PDF Reflow Diagnostics', () => {
  beforeEach(() => {
    // Increase viewport to ensure everything is visible
    cy.viewport(1280, 800);
    cy.visit('/');
  });

  it('should measure the effect of text editing in Reflow mode', () => {
    // 1. Enter the editor via Live Demo
    cy.contains('Try Live Demo').click();
    
    // 2. Wait for the editor UI to appear
    cy.get('.editing-panel', { timeout: 15000 }).should('be.visible');
    
    // 3. Wait for the editor UI and first card
    cy.get('.premium-input-card', { timeout: 15000 }).first().as('sidebarCard');
    
    // 4. Toggle REFLOW mode ON
    cy.contains('button', 'REFLOW', { matchCase: false }).click();
    cy.log('Toggled Reflow mode ON');
    cy.wait(1000);

    // 5. Find any text element on the canvas (now in reflow mode)
    cy.get('svg text', { timeout: 15000 }).should('have.length.at.least', 1).then($texts => {
      cy.log(`SUCCESS: Found ${$texts.length} text nodes on canvas in Reflow mode`);
      const $firstText = $texts.first();
      cy.wrap($firstText).parent().as('canvasNode');
    });

    // 6. Click the sidebar card (which should now be a block)
    cy.get('.premium-input-card').first().click();

    // 7. Capture initial width
    cy.get('@canvasNode').find('text').first().then($text => {
      const initialWidth = $text[0].getBBox().width;
      cy.log(`Initial Width: ${initialWidth.toFixed(2)}px`);
      cy.wrap(initialWidth).as('initialWidth');
    });

    // 8. Edit the text in the sidebar to be significantly longer
    const testString = " [REFLOW TEST: Adding significant length to this line to diagnose how the engine handles expansion and whether it wraps correctly or overflows.]";
    cy.get('.premium-input-card textarea').first().type(testString);
    
    // 9. Wait for re-render and measure expansion
    cy.wait(3000); // 3 seconds for reflow calculation and debounce
    
    cy.get('@canvasNode').find('text').first().then($text => {
      const finalWidth = $text[0].getBBox().width;
      cy.get('@initialWidth').then(initialWidth => {
        const expansionRatio = finalWidth / initialWidth;
        cy.log(`Final Width: ${finalWidth.toFixed(2)}px`);
        cy.log(`Expansion Ratio: ${expansionRatio.toFixed(2)}x`);
        
        // ASSERTION: Expansion ratio should be near 1.0 because it should WRAP, not grow horizontally
        // We'll be lenient (1.5x) to allow for some measurement variance, but it shouldn't be 4x+
        expect(expansionRatio).to.be.below(1.5, "Text should wrap, not expand horizontally past 1.5x of original width");
      });
    });

    cy.screenshot('reflow-fixed-verification');
  });
});
