document.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  const liveChatBtn = document.getElementById('liveChatBtn');
  const liveChatControls = document.getElementById('liveChatControls');
  const initLiveChatBtn = document.getElementById('initLiveChatBtn');
  const sendStructureBtn = document.getElementById('sendStructureBtn');
  const stopLiveChatBtn = document.getElementById('stopLiveChatBtn');
  
  // Initialize state
  let liveChatActive = false;
  
  // Event: Toggle live chat controls
  liveChatBtn.addEventListener('click', () => {
    // Check if we're on ChatGPT site
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      const isChatGPTSite = currentTab && 
                           currentTab.url && 
                           (currentTab.url.includes('chatgpt.com'));
      
      if (!isChatGPTSite) {
        alert('Please open chatgpt.com to use the Live Context AI Chat feature.');
        return;
      }
      
      // Toggle live chat controls
      if (liveChatControls.style.display === 'none') {
        liveChatControls.style.display = 'block';
      } else {
        liveChatControls.style.display = 'none';
      }
    });
  });
  
  // Event: Initialize live chat
  initLiveChatBtn.addEventListener('click', () => {
    // Check if we're on ChatGPT site
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.url || !currentTab.url.includes('chatgpt.com')) {
        alert('Please open chatgpt.com to use this feature.');
        return;
      }
      
      // Execute content script to initialize live chat
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['scripts/fileSystem.js']
      }, () => {
        chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          files: ['scripts/live-context.js']
        }, () => {
          // Initialize the LiveContextChat
          chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: () => {
              // Initialize if not already initialized
              if (!window.liveContext) {
                window.liveContext = new LiveContextChat();
                window.liveContext.init().then(result => {
                  if (result) {
                    alert('Live Context Chat initialized successfully! Now you can interact with your project files in ChatGPT.');
                  }
                });
              } else {
                alert('Live Context Chat is already initialized!');
              }
            }
          });
          
          liveChatActive = true;
        });
      });
    });
  });
  
  // Event: Send project structure
  sendStructureBtn.addEventListener('click', () => {
    if (!liveChatActive) {
      alert('Please initialize Live Context Chat first.');
      return;
    }
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.url || !currentTab.url.includes('chatgpt.com')) {
        alert('Please open chatgpt.com to use this feature.');
        return;
      }
      
      // Send a message to manually reinitialize the project context
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => {
          if (window.liveContext) {
            window.liveContext.initializeProjectContext()
              .then(() => alert('Project context initialized successfully!'))
              .catch(error => alert('Error initializing project context: ' + error.message));
          } else {
            alert('Live Context Chat is not initialized!');
          }
        }
      });
    });
  });
  
  // Event: Stop live chat
  stopLiveChatBtn.addEventListener('click', () => {
    if (!liveChatActive) {
      alert('Live Context Chat is not active.');
      return;
    }
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.id) return;
      
      // Stop the live chat
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => {
          if (window.liveContext) {
            window.liveContext.stop();
            window.liveContext = null;
            alert('Live Context Chat stopped successfully.');
          }
        }
      });
      
      liveChatActive = false;
      liveChatControls.style.display = 'none';
    });
  });
  
  // Check if we're on ChatGPT site to show/hide the live chat button
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const isChatGPTSite = currentTab && 
                         currentTab.url && 
                         currentTab.url.includes('chatgpt.com');
    
    if (!isChatGPTSite) {
      liveChatBtn.classList.add('disabled');
      liveChatBtn.title = 'Only available on chatgpt.com';
    } else {
      // Check if live chat is already active on this tab
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => window.liveContext !== undefined && window.liveContext !== null
      }, (results) => {
        if (results && results[0] && results[0].result) {
          liveChatActive = true;
          liveChatControls.style.display = 'block';
        }
      });
    }
  });
}); 