import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5173",
    specPattern: "tests/cypress/e2e/**/*.cy.{js,jsx,ts,tsx}",
    supportFile: false, // Disabling support file for simplicity in this setup
    video: false,
    screenshotOnRunFailure: true,
  },
});
