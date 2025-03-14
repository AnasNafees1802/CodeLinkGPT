/**
 * CodeLinkGPT Content Script
 * Runs on chatgpt.com pages to enhance interactions with CodeLinkGPT
 */

console.log('CodeLinkGPT: Content script loaded');

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkStatus') {
    // Check if live context is initialized
    sendResponse({ 
      isInitialized: window.liveContext !== undefined && window.liveContext !== null 
    });
    return true;
  }
  
  if (message.action === 'initLiveContext') {
    // The rest of the initialization happens in popup.js by injecting scripts
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'sendProjectStructure') {
    if (window.liveContext) {
      window.liveContext.sendProjectStructure()
        .then(result => sendResponse({ success: result }))
        .catch(error => sendResponse({ 
          success: false, 
          error: error.message 
        }));
      
      return true;
    } else {
      sendResponse({ 
        success: false, 
        error: 'Live Context Chat is not initialized' 
      });
      return true;
    }
  }
  
  if (message.action === 'stopLiveContext') {
    if (window.liveContext) {
      const result = window.liveContext.stop();
      window.liveContext = null;
      sendResponse({ success: result });
    } else {
      sendResponse({ success: false, error: 'Live Context Chat is not active' });
    }
    return true;
  }
});

// Check if the page is ready
if (document.readyState === 'complete') {
  console.log('CodeLinkGPT: Page is ready');
} else {
  window.addEventListener('load', () => {
    console.log('CodeLinkGPT: Page loaded');
  });
}

// Create a global hook for the extension
window.codeLinkGPT = {
  isAvailable: true,
  version: '1.1.0'
}; 