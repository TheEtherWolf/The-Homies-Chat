/**
 * Extension Download Handler for The Homies Chat
 * Serves the browser extension files for download
 */

const fs = require('fs');
const path = require('path');
const express = require('express');

// Create a router for the extension download endpoints
const router = express.Router();

// Serve the extension download page
router.get('/extension', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'extension-download.html'));
});

// Handle the extension download request
router.get('/download-extension', (req, res) => {
  // Since we can't use archiver, we'll provide a direct download of the manifest file
  // with instructions to clone the repository
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=manifest.json');
  
  const manifestPath = path.join(__dirname, 'browser-extension', 'manifest.json');
  
  // Check if the manifest file exists
  if (fs.existsSync(manifestPath)) {
    const fileStream = fs.createReadStream(manifestPath);
    fileStream.pipe(res);
  } else {
    res.status(404).send('Extension files not found');
  }
});

// Add a button to the UI for downloading the extension
function injectDownloadButton(html) {
  // Find a good spot to inject our button in the HTML
  const navbarInjectionPoint = '<div class="navbar-nav">';
  
  // Create the button HTML
  const downloadButton = `
    <div class="navbar-nav">
      <a class="nav-link" href="/extension" title="Get Browser Notifications">
        <i class="fas fa-bell"></i> Get Notifications
      </a>
    </div>
    ${navbarInjectionPoint}
  `;
  
  // Inject the button into the HTML
  return html.replace(navbarInjectionPoint, downloadButton);
}

module.exports = {
  router,
  injectDownloadButton
};
