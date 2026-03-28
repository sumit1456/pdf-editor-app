describe('Font Style Preservation Tests', () => {
  beforeEach(() => {
    // Visit localhost:8080 and wait for app to load
    cy.visit('http://localhost:8080');
    cy.wait(3000); // Wait for app to fully load
    
    // Click on Live Demo
    cy.contains('Live Demo').click();
    cy.wait(5000); // Wait for PDF to load
  });

  it('should preserve font styles when editing first line via content studio', () => {
    // Variables to store original and edited data
    let originalLineData = {};
    let editedLineData = {};

    // Step 1: Click on first line and get its data
    cy.get('[data-testid^="line-group"]').first().click();
    cy.wait(1000);

    // Get original font configurations from DOM
    cy.get('[data-testid^="line-group"]').first().within(() => {
      cy.get('text').then(($text) => {
        const textElement = $text[0];
        originalLineData = {
          fontSize: textElement.getAttribute('font-size'),
          fontFamily: textElement.getAttribute('font-family'),
          fontWeight: textElement.getAttribute('font-weight'),
          fill: textElement.getAttribute('fill'),
          content: textElement.textContent,
          width: textElement.getBoundingClientRect().width,
          transform: textElement.style.transform,
          dataFitMeasuredWidth: textElement.getAttribute('data-fit-measured-width'),
          dataFitTargetWidth: textElement.getAttribute('data-fit-target-width'),
          dataFitScale: textElement.getAttribute('data-fit-scale')
        };
        
        cy.log('Original line data:', originalLineData);
        
        // Take screenshot of original line
        cy.screenshot('original-first-line');
      });
    });

    // Step 2: Edit the same line via content studio
    cy.get('[data-testid="content-studio"]').should('be.visible');
    cy.get('[data-testid="content-input"]').first().clear().type('Modified text content for testing');
    cy.wait(2000); // Wait for edit to apply

    // Step 3: Check edited line data
    cy.get('[data-testid^="line-group"]').first().within(() => {
      cy.get('text').then(($text) => {
        const textElement = $text[0];
        editedLineData = {
          fontSize: textElement.getAttribute('font-size'),
          fontFamily: textElement.getAttribute('font-family'),
          fontWeight: textElement.getAttribute('font-weight'),
          fill: textElement.getAttribute('fill'),
          content: textElement.textContent,
          width: textElement.getBoundingClientRect().width,
          transform: textElement.style.transform,
          dataFitMeasuredWidth: textElement.getAttribute('data-fit-measured-width'),
          dataFitTargetWidth: textElement.getAttribute('data-fit-target-width'),
          dataFitScale: textElement.getAttribute('data-fit-scale')
        };
        
        cy.log('Edited line data:', editedLineData);
        
        // Take screenshot of edited line
        cy.screenshot('edited-first-line');
        
        // Assertions - font styles should be preserved
        expect(editedLineData.fontFamily).to.equal(originalLineData.fontFamily);
        expect(editedLineData.fontWeight).to.equal(originalLineData.fontWeight);
        expect(editedLineData.fill).to.equal(originalLineData.fill);
        
        // Content should be different
        expect(editedLineData.content).to.not.equal(originalLineData.content);
        expect(editedLineData.content).to.contain('Modified text content');
        
        cy.log('✅ Font styles preserved after edit');
      });
    });
  });

  it('should preserve font configurations when moving lines in move mode', () => {
    let beforeMoveData = {};
    let afterMoveData = {};

    // Step 1: Click on second line (different from first test)
    cy.get('[data-testid^="line-group"]').eq(1).click();
    cy.wait(1000);

    // Get data before moving
    cy.get('[data-testid^="line-group"]').eq(1).within(() => {
      cy.get('text').then(($text) => {
        const textElement = $text[0];
        beforeMoveData = {
          fontSize: textElement.getAttribute('font-size'),
          fontFamily: textElement.getAttribute('font-family'),
          fontWeight: textElement.getAttribute('font-weight'),
          fill: textElement.getAttribute('fill'),
          content: textElement.textContent,
          x: textElement.getAttribute('x'),
          y: textElement.getAttribute('y'),
          transform: textElement.style.transform,
          bbox: textElement.getBoundingClientRect(),
          dataFitMeasuredWidth: textElement.getAttribute('data-fit-measured-width'),
          dataFitTargetWidth: textElement.getAttribute('data-fit-target-width'),
          dataFitScale: textElement.getAttribute('data-fit-scale')
        };
        
        cy.log('Before move data:', beforeMoveData);
        
        // Take screenshot before move
        cy.screenshot('before-move-line');
      });
    });

    // Step 2: Turn on move mode
    cy.get('[data-testid="move-mode-toggle"]').click();
    cy.wait(500);
    
    // Verify move mode is active
    cy.get('[data-testid="move-mode-toggle"]').should('have.class', 'active');

    // Step 3: Move the line using drag and drop
    cy.get('[data-testid^="line-group"]').eq(1).then(($line) => {
      const rect = $line[0].getBoundingClientRect();
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height / 2;
      
      cy.wrap($line)
        .trigger('pointerdown', { clientX: startX, clientY: startY, button: 0 })
        .trigger('pointermove', { clientX: startX + 50, clientY: startY + 20 })
        .trigger('pointerup', { clientX: startX + 50, clientY: startY + 20 });
    });
    
    cy.wait(2000); // Wait for move to complete

    // Step 4: Check data after moving
    cy.get('[data-testid^="line-group"]').eq(1).within(() => {
      cy.get('text').then(($text) => {
        const textElement = $text[0];
        afterMoveData = {
          fontSize: textElement.getAttribute('font-size'),
          fontFamily: textElement.getAttribute('font-family'),
          fontWeight: textElement.getAttribute('font-weight'),
          fill: textElement.getAttribute('fill'),
          content: textElement.textContent,
          x: textElement.getAttribute('x'),
          y: textElement.getAttribute('y'),
          transform: textElement.style.transform,
          bbox: textElement.getBoundingClientRect(),
          dataFitMeasuredWidth: textElement.getAttribute('data-fit-measured-width'),
          dataFitTargetWidth: textElement.getAttribute('data-fit-target-width'),
          dataFitScale: textElement.getAttribute('data-fit-scale')
        };
        
        cy.log('After move data:', afterMoveData);
        
        // Take screenshot after move
        cy.screenshot('after-move-line');
        
        // Assertions - font configurations should be preserved
        expect(afterMoveData.fontSize).to.equal(beforeMoveData.fontSize);
        expect(afterMoveData.fontFamily).to.equal(beforeMoveData.fontFamily);
        expect(afterMoveData.fontWeight).to.equal(beforeMoveData.fontWeight);
        expect(afterMoveData.fill).to.equal(beforeMoveData.fill);
        expect(afterMoveData.content).to.equal(beforeMoveData.content);
        expect(afterMoveData.transform).to.equal(beforeMoveData.transform);
        
        // Position should have changed
        expect(afterMoveData.x).to.not.equal(beforeMoveData.x);
        expect(afterMoveData.y).to.not.equal(beforeMoveData.y);
        
        cy.log('✅ Font configurations preserved after move');
      });
    });

    // Step 5: Turn off move mode
    cy.get('[data-testid="move-mode-toggle"]').click();
  });

  it('should test Fit Mode functionality with font preservation', () => {
    let beforeFitData = {};
    let afterFitData = {};

    // Step 1: Click on a line and get initial data
    cy.get('[data-testid^="line-group"]').eq(2).click();
    cy.wait(1000);

    cy.get('[data-testid^="line-group"]').eq(2).within(() => {
      cy.get('text').then(($text) => {
        const textElement = $text[0];
        beforeFitData = {
          fontSize: textElement.getAttribute('font-size'),
          fontFamily: textElement.getAttribute('font-family'),
          fontWeight: textElement.getAttribute('font-weight'),
          fill: textElement.getAttribute('fill'),
          content: textElement.textContent,
          transform: textElement.style.transform,
          dataFitMeasuredWidth: textElement.getAttribute('data-fit-measured-width'),
          dataFitTargetWidth: textElement.getAttribute('data-fit-target-width'),
          dataFitScale: textElement.getAttribute('data-fit-scale')
        };
        
        cy.log('Before Fit Mode:', beforeFitData);
        cy.screenshot('before-fit-mode');
      });
    });

    // Step 2: Turn on Fit Mode
    cy.get('[data-testid="fit-mode-toggle"]').click();
    cy.wait(3000); // Wait for worker fitting to complete

    // Step 3: Check data after Fit Mode
    cy.get('[data-testid^="line-group"]').eq(2).within(() => {
      cy.get('text').then(($text) => {
        const textElement = $text[0];
        afterFitData = {
          fontSize: textElement.getAttribute('font-size'),
          fontFamily: textElement.getAttribute('font-family'),
          fontWeight: textElement.getAttribute('font-weight'),
          fill: textElement.getAttribute('fill'),
          content: textElement.textContent,
          transform: textElement.style.transform,
          dataFitMeasuredWidth: textElement.getAttribute('data-fit-measured-width'),
          dataFitTargetWidth: textElement.getAttribute('data-fit-target-width'),
          dataFitScale: textElement.getAttribute('data-fit-scale')
        };
        
        cy.log('After Fit Mode:', afterFitData);
        cy.screenshot('after-fit-mode');
        
        // Assertions - styles should be preserved, sizes may change
        expect(afterFitData.fontFamily).to.equal(beforeFitData.fontFamily);
        expect(afterFitData.fontWeight).to.equal(beforeFitData.fontWeight);
        expect(afterFitData.fill).to.equal(beforeFitData.fill);
        expect(afterFitData.content).to.equal(beforeFitData.content);
        
        // Font size or transform may have changed due to fitting
        cy.log('Font size before:', beforeFitData.fontSize, 'after:', afterFitData.fontSize);
        cy.log('Transform before:', beforeFitData.transform, 'after:', afterFitData.transform);
        
        cy.log('✅ Font styles preserved in Fit Mode');
      });
    });

    // Step 4: Turn off Fit Mode
    cy.get('[data-testid="fit-mode-toggle"]').click();
  });

  it('should comprehensively test font style preservation across multiple operations', () => {
    const testResults = [];

    // Test multiple lines
    [0, 1, 2, 3].forEach((lineIndex) => {
      cy.log(`Testing line ${lineIndex + 1}`);
      
      // Click on line
      cy.get('[data-testid^="line-group"]').eq(lineIndex).click();
      cy.wait(500);

      // Get initial data
      cy.get('[data-testid^="line-group"]').eq(lineIndex).within(() => {
        cy.get('text').then(($text) => {
          const textElement = $text[0];
          const initialData = {
            fontSize: textElement.getAttribute('font-size'),
            fontFamily: textElement.getAttribute('font-family'),
            fontWeight: textElement.getAttribute('font-weight'),
            fill: textElement.getAttribute('fill'),
            content: textElement.textContent
          };
          
          testResults.push({
            lineIndex,
            initial: initialData
          });
          
          cy.screenshot(`line-${lineIndex + 1}-initial`);
        });
      });

      // Edit the line
      cy.get('[data-testid="content-studio"]').should('be.visible');
      cy.get('[data-testid="content-input"]').eq(lineIndex).clear().type(`Test content for line ${lineIndex + 1}`);
      cy.wait(1000);

      // Get edited data
      cy.get('[data-testid^="line-group"]').eq(lineIndex).within(() => {
        cy.get('text').then(($text) => {
          const textElement = $text[0];
          const editedData = {
            fontSize: textElement.getAttribute('font-size'),
            fontFamily: textElement.getAttribute('font-family'),
            fontWeight: textElement.getAttribute('font-weight'),
            fill: textElement.getAttribute('fill'),
            content: textElement.textContent
          };
          
          testResults[lineIndex].edited = editedData;
          
          cy.screenshot(`line-${lineIndex + 1}-edited`);
          
          // Verify preservation
          expect(editedData.fontFamily).to.equal(initialData.fontFamily);
          expect(editedData.fontWeight).to.equal(initialData.fontWeight);
          expect(editedData.fill).to.equal(initialData.fill);
        });
      });
    });

    // Log all test results
    cy.log('Complete test results:', testResults);
    cy.screenshot('comprehensive-test-results');
  });
});
