describe('Font Style Preservation Tests', () => {
  beforeEach(() => {
    // Visit localhost:5173 and wait for app to load
    cy.visit('http://localhost:5173');
    cy.wait(3000); // Wait for app to fully load
    
    // Click on Live Demo
    cy.contains('Live Demo').click();
    cy.wait(7000); // Wait for PDF to load (longer wait for heavy PDF)
  });

  it('should verify font styles before and after editing, expecting a single font family after appending x', () => {
    // Wait for the line groups to render fully. In PythonRenderer, they have className="line-group"
    cy.get('.line-group', { timeout: 15000 }).should('have.length.greaterThan', 0);

    // The app auto-selects the first line on load. 
    // We can identify its ID from the active input card in the sidebar.
    // In EditorPage.jsx, the active input card has id="input-card-ID" and className "active"
    cy.get('.premium-input-card.active', { timeout: 10000 }).then(($card) => {
      const cardId = $card.attr('id');
      const lineId = cardId.replace('input-card-', '');
      
      cy.log(`Auto-selected line ID: ${lineId}`);

      // Take screenshot before edit
      cy.screenshot('before-edit');

      // BEFORE EDIT: Gather font details from that specific line group in the PDF
      // In PythonRenderer, the line group might be identified by the ref which we don't have,
      // but we can find the one that corresponds to the active node if we can.
      // Actually, since the first line is selected, we can just grab the first .line-group or the one with specific ID if it exists.
      // In PDFRenderer it has id="line-ID", but in PythonRenderer it doesn't seem to have the ID on the group?
      // Wait, PythonRenderer line 1289 has line.id being passed to onPointerDown but the <g> doesn't have an ID.
      // However, we can use the fact that it's the 'active' one if they were some marker.
      // Let's use the first one as specified by the user's "use that instead" (referring to the auto-selected first line).
      
      cy.get('.line-group').first().within(() => {
        cy.get('text').then(($texts) => {
          const fontFamilies = new Set();
          const stylesBefore = [];
          
          $texts.each((i, $text) => {
            const family = $text.getAttribute('font-family');
            const weight = $text.getAttribute('font-weight');
            const fill = $text.getAttribute('fill');
            const fontSize = $text.getAttribute('font-size');
            const width = $text.getBoundingClientRect().width;
            
            fontFamilies.add(family);
            stylesBefore.push({ text: $text.textContent, family, weight, fill, fontSize, width });
          });
          
          cy.log('BEFORE EDIT: Details:', JSON.stringify(stylesBefore, null, 2));
          cy.wrap(fontFamilies.size).as('uniqueFamiliesBefore');
        });
      });

      // Do edit: append 'x' to the active textarea in the Content Studio
      // The active card has a textarea inside it.
      cy.wrap($card).find('textarea').type('x');

      cy.wait(3000); // Wait for edit to apply and re-render

      // AFTER EDIT: Gather font details from the same first line
      cy.get('.line-group').first().within(() => {
        cy.get('text').then(($texts) => {
          const fontFamilies = new Set();
          const stylesAfter = [];
          
          $texts.each((i, $text) => {
            const family = $text.getAttribute('font-family');
            const weight = $text.getAttribute('font-weight');
            const fill = $text.getAttribute('fill');
            const fontSize = $text.getAttribute('font-size');
            const width = $text.getBoundingClientRect().width;
            
            fontFamilies.add(family);
            stylesAfter.push({ text: $text.textContent, family, weight, fill, fontSize, width });
          });
          
          cy.log('AFTER EDIT: Details:', JSON.stringify(stylesAfter, null, 2));
          
          // Assertion: After edit, there should only be one font family
          expect(fontFamilies.size, 'Expected exactly one font family after edit').to.equal(1);
        });
      });

      // Take screenshot after edit
      cy.screenshot('after-edit');
      
      // Log info about the normalization
      cy.get('@uniqueFamiliesBefore').then((countBefore) => {
         cy.log(`Fonts before: ${countBefore}. Normalized to 1 font family after edit.`);
      });
      
      cy.log('✅ Edits applied and verified successfully');
    });
  });
});

