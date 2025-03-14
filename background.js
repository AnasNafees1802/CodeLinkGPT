// Initialize extension when installed
chrome.runtime.onInstalled.addListener(() => {
  // Set default settings
  chrome.storage.sync.set({
    extensionInitialized: true
  });
  
  console.log('CodeLinkGPT extension installed');
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // We'll keep this empty but ready for future functionality
  return true;
}); 