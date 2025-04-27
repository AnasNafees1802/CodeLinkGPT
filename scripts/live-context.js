/**
 * Live Context AI Chat
 * Integrates with ChatGPT for real-time file content access
 */

class LiveContextChat {
  constructor() {
    this.fsHandler = new FileSystemHandler();
    this.projectData = null;
    this.selectedFiles = new Set();
    this.targetInput = null;
    this.targetSelector = null;
    this.observer = null;
    this.isInitialized = false;
    this.pendingRequests = new Set();
    this.lastKnownPromptBox = null;
    this.promptBoxObserver = null;
    this.processedMessages = new Set(); // Track processed messages
    this.addedFileContents = new Set(); // Track which files have been added to prevent duplication
    
    // New properties for file autocomplete
    this.fileDropdown = null;
    this.dropdownVisible = false;
    this.projectFilePaths = null;
    this.dropdownKeyHandler = null;
  }

  /**
   * Initialize the Live Context Chat
   */
  async init() {
    // Check if we're on ChatGPT site
    if (!this.isChatGPTSite()) {
      alert('This feature can only be used on the ChatGPT website.');
      return false;
    }

    // Load project
    try {
      await this.selectProject();
    } catch (error) {
      console.error('Failed to load project:', error);
      alert('Failed to load project: ' + error.message);
      return false;
    }

    // Start monitoring for prompt box changes
    this.startPromptBoxMonitoring();

    // Start conversation monitoring
    this.startConversationMonitoring();

    // Initialize project context
    await this.initializeProjectContext();
    
    // Add autocomplete functionality
    this.initializeAutoComplete();
    
    // Add CSS styles for the dropdown
    this.addDropdownStyles();

    this.isInitialized = true;
    return true;
  }

  /**
   * Check if current page is ChatGPT
   */
  isChatGPTSite() {
    return window.location.hostname === 'chatgpt.com' || 
           window.location.hostname === 'www.chatgpt.com';
  }

  /**
   * Select project and files
   */
  async selectProject() {
    // Show project selection UI
    const project = await this.fsHandler.openProjectFolder();
    this.projectData = {
      name: project.name,
      path: project.path,
      structure: await this.fsHandler.getProjectStructure()
    };
    
    // For now, we'll just select all files
    this.selectedFiles = new Set();
    this.collectFilePaths(this.projectData.structure, this.selectedFiles);
    
    console.log(`Project loaded: ${this.projectData.name} with ${this.selectedFiles.size} files`);
    return true;
  }

  /**
   * Collect all file paths from project structure
   */
  collectFilePaths(structure, fileSet) {
    for (const node of structure) {
      if (node.type === 'file') {
        fileSet.add(node.path);
      } else if (node.type === 'directory' && Array.isArray(node.children)) {
        this.collectFilePaths(node.children, fileSet);
      }
    }
  }

  /**
   * Start monitoring for prompt box changes
   */
  startPromptBoxMonitoring() {
    // Function to find the current prompt box
    const findPromptBox = () => {
      const promptBox = document.getElementById('prompt-textarea');
      if (promptBox !== this.lastKnownPromptBox) {
        console.log('Prompt box location changed, updating reference');
        this.targetInput = promptBox;
        this.targetSelector = '#prompt-textarea';
        this.lastKnownPromptBox = promptBox;
        
        // Check if this is a new conversation
        // On ChatGPT, empty prompt box usually means a new conversation 
        if (promptBox && (
            promptBox.textContent === '' || 
            promptBox.value === '' || 
            promptBox.innerHTML === '')) {
          console.log('Detected new conversation, resetting file tracking');
          this.reset();
        }
        
        // Reattach autocomplete handlers when promptbox changes
        if (promptBox && this.isInitialized) {
          this.attachAutocompleteHandlers(promptBox);
        }
      }
      return promptBox;
    };

    // Initial find
    findPromptBox();

    // Create observer for the entire chat container
    const chatContainer = document.querySelector('main') || document.body;
    this.promptBoxObserver = new MutationObserver(() => {
      findPromptBox();
    });

    // Observe changes in the chat container
    this.promptBoxObserver.observe(chatContainer, {
      childList: true,
      subtree: true
    });

    console.log('Started monitoring prompt box location');
  }

  /**
   * Initialize project context in the prompt
   */
  async initializeProjectContext() {
    // Wait for the prompt box to be available
    const maxAttempts = 10;
    let attempts = 0;
    
    while (!this.targetInput && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500));
      this.targetInput = document.getElementById('prompt-textarea');
      attempts++;
    }

    if (!this.targetInput) {
      console.error('Could not find prompt box');
      return false;
    }

    // Check if there are any existing conversations
    const conversations = this.extractConversations();
    if (conversations.length === 0) {
      // No existing conversation, set up initial context
      const contextMessage = this.generateInitialContext();
      await this.setPromptContent(contextMessage, false);
      console.log('Initial project context set up');
    }

    return true;
  }

  /**
   * Generate initial context message
   */
  generateInitialContext() {
    const fileTypes = this.analyzeProjectFileTypes();
    const totalFiles = this.selectedFiles.size;
    const mainFiles = this.identifyMainFiles();

    return `# 🔗 CodeLinkGPT - Project Context

    You are now in a live coding environment with access to the project files.
    Your Name is **CodeLinkGPT** and you are here to assist with code-related tasks.
    You can request files, ask questions about the code, and get help with debugging.
    Read and understand the instructions carefully before proceeding.
    You can also ask questions about the project or request specific files.

    ## 📝 How To Request Files

    You can request files in multiple ways:

**Option 1:** Use the **@filename.ext** syntax directly
- Example: @index.js or @src/components/App.js

**Option 2:** Make a natural language request 
- Example: "Show me the manifest.json file" or "I need to see package.json"

**Option 3:** Use the filename in your question
- Example: "What does the App.js component do?" or "How is the API call in api.js structured?"

I'm working on a project called **"${this.projectData.name}"**. Here's what you need to know:

## 📊 Project Overview
- **Total Files:** ${totalFiles}
- **Main Technologies:** ${fileTypes.join(', ')}
${mainFiles.length > 0 ? `- **Key Files:** ${mainFiles.join(', ')}` : ''}

## 📁 Project Structure
\`\`\`
${this.generateStructureText(this.projectData.structure)}
\`\`\`

If You understand the instructions, please respond with "CodeLinkGPT is Ready" and I will assist you with your coding tasks.`;
  }

  /**
   * Analyze project file types
   */
  analyzeProjectFileTypes() {
    const extensions = new Set();
    for (const file of this.selectedFiles) {
      const ext = file.split('.').pop().toLowerCase();
      if (ext && !extensions.has(ext)) {
        extensions.add(this.getLanguageFromExtension('.' + ext));
      }
    }
    return Array.from(extensions).filter(Boolean);
  }

  /**
   * Identify main project files
   */
  identifyMainFiles() {
    const mainFiles = [];
    const commonMainFiles = ['package.json', 'requirements.txt', 'main.py', 'index.js', 'app.js', 'README.md'];
    
    for (const file of this.selectedFiles) {
      const fileName = file.split('/').pop();
      if (commonMainFiles.includes(fileName)) {
        mainFiles.push(fileName);
      }
    }
    return mainFiles;
  }

  /**
   * Set content in the prompt box without submitting
   */
  async setPromptContent(text, append = false) {
    if (!this.targetInput) {
      const input = document.getElementById('prompt-textarea');
      if (!input) {
        console.error('Cannot find prompt box');
        return false;
      }
      this.targetInput = input;
    }

    try {
      // Focus the input
      this.targetInput.focus();

      // Get current content
      let currentContent = '';
      if (this.targetInput.getAttribute('contenteditable') === 'true') {
        currentContent = this.targetInput.innerHTML;
      } else {
        currentContent = this.targetInput.value;
      }

      // Check for file content markers to avoid duplication more precisely
      if (append && text.includes('<!-- file-content-')) {
        const markerMatch = text.match(/<!-- file-content-(.*?)-\d+ -->/);
        if (markerMatch && markerMatch[1]) {
          const fileName = markerMatch[1];
          if (currentContent.includes(`// File: ${fileName}`)) {
            console.log(`File ${fileName} content already exists in prompt box, skipping...`);
            return true;
          }
        }
      }

      // Set the content
      let newContent = append ? currentContent + text : text;
      
      // For contenteditable divs, we may need to clean up any hidden markers
      newContent = newContent.replace(/<!-- file-content-.*?-->/g, '');
      
      if (this.targetInput.getAttribute('contenteditable') === 'true') {
        // Handle newlines and spacing correctly for contenteditable divs
        // First check if text is not already HTML (has no HTML tags)
        if (!append && !/<[a-z][\s\S]*>/i.test(newContent)) {
          // Convert plain text to HTML with proper spacing
          newContent = newContent
            // Preserve indentation by replacing spaces with non-breaking spaces
            .replace(/^( {2,})/gm, match => '&nbsp;'.repeat(match.length))
            // Convert newlines to <br> tags
            .replace(/\n/g, '<br>')
            // Preserve code blocks
            .replace(/```([\s\S]*?)```/g, (match, code) => {
              // Wrap code blocks in a div with monospace font and background
              return `<div style="font-family:monospace; background:#f5f5f5; padding:8px; margin:8px 0; border-radius:4px; white-space:pre;">${
                code.replace(/</g, '&lt;').replace(/>/g, '&gt;')
              }</div>`;
            });
        }
        this.targetInput.innerHTML = newContent;
      } else {
        this.targetInput.value = newContent;
      }

      // Trigger input event for React state update
      const inputEvent = new Event('input', { bubbles: true, cancelable: true });
      this.targetInput.dispatchEvent(inputEvent);

      // Move cursor to end if appending
      if (append) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(this.targetInput);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }

      return true;
    } catch (error) {
      console.error('Error setting prompt content:', error);
      return false;
    }
  }

  /**
   * Start conversation monitoring
   */
  startConversationMonitoring() {
    console.log('Starting real-time conversation monitoring...');
    
    // Initialize with existing conversations
    this.processConversation(this.extractConversations());
    
    // Create a MutationObserver to detect new messages
    this.observer = new MutationObserver(() => {
      const conversations = this.extractConversations();
      this.processConversation(conversations);
    });
    
    // Observe changes in the <main> element or body if main doesn't exist
    const targetNode = document.querySelector('main') || document.body;
    this.observer.observe(targetNode, { childList: true, subtree: true });
    
    console.log('Conversation monitoring started');
  }

  /**
   * Extract conversations from the page
   */
  extractConversations() {
    const conversations = [];
    
    // Select all <article> elements (each message turn is inside an article)
    const articles = document.querySelectorAll('article');
    
    articles.forEach((article) => {
      let userMessage = null;
      let aiMessage = null;
      
      // Detect user messages
      const userMessageElement = article.querySelector('[class*="max-w-"]');
      if (userMessageElement) {
        const userText = userMessageElement.querySelector('div.whitespace-pre-wrap');
        if (userText) userMessage = userText.textContent.trim();
      }
      
      // Detect AI messages
      const aiMessageElement = article.querySelector('.markdown.prose');
      if (aiMessageElement) {
        const aiTextBlocks = aiMessageElement.querySelectorAll('p');
        aiMessage = Array.from(aiTextBlocks).map(p => p.textContent.trim()).join('\n');
      }
      
      // Add to conversations if not empty
      if (userMessage || aiMessage) {
        conversations.push({ user: userMessage, ai: aiMessage });
      }
    });
    
    return conversations;
  }

  /**
   * Extract file requests from message
   */
  extractFileRequests(message) {
    if (!message) return [];
    
    const matches = [];
    
    // Part 1: Match @filename patterns in plain text
    // This will match patterns like @filename.ext, @path/to/filename.ext, etc.
    const fileRegex = /@([\w\-./]+\.\w+)\b/g;
    let match;
    
    while ((match = fileRegex.exec(message)) !== null) {
      // Add the captured filename (without @ symbol)
      matches.push(match[1]);
    }
    
    // Part 2: Look for file requests in HTML content (code tags, strong tags, list items)
    try {
      // Create a temporary div to parse HTML content
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = message;
      
      // Function to process text content for file requests
      const processTextContent = (text) => {
        if (!text) return;
        text = text.trim();
        
        // Check for @ syntax
        if (text.startsWith('@')) {
          const fileName = text.substring(1).trim();
          if (fileName && !matches.includes(fileName)) {
            matches.push(fileName);
          }
          return;
        }
        
        // Check for file extension if no @ symbol
        if (text.match(/\.\w+$/) && !text.includes(' ')) {
          const fileName = text.trim();
          if (!matches.includes(fileName)) {
            matches.push(fileName);
          }
        }
      };
      
      // Find all code elements
      const codeElements = tempDiv.querySelectorAll('code');
      codeElements.forEach(codeEl => {
        processTextContent(codeEl.textContent);
      });
      
      // Find all strong elements (often used for file emphasis)
      const strongElements = tempDiv.querySelectorAll('strong');
      strongElements.forEach(strongEl => {
        processTextContent(strongEl.textContent);
      });
      
      // Find all list items that might contain file references
      const listItems = tempDiv.querySelectorAll('li');
      listItems.forEach(li => {
        // Look for strong or code elements within the list item
        const strongInList = li.querySelector('strong');
        const codeInList = li.querySelector('code');
        
        if (strongInList) {
          processTextContent(strongInList.textContent);
        }
        if (codeInList) {
          processTextContent(codeInList.textContent);
        }
      });
      
    } catch (error) {
      console.error('Error parsing HTML in message:', error);
    }
    
    // Part 3: Natural language patterns for file requests (keep existing implementation)
    const fileExtensions = [
      'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'md', 'py', 'java', 'c', 
      'cpp', 'cs', 'go', 'rb', 'php', 'swift', 'yml', 'yaml', 'xml', 'sh', 'bat'
    ];
    
    // Build regex to match common request phrases followed by filenames
    const requestPhrases = [
      'show\\s+(?:me\\s+)?',
      'share\\s+(?:the\\s+)?',
      'see\\s+(?:the\\s+)?',
      'check\\s+(?:the\\s+)?',
      'take\\s+a\\s+look\\s+at\\s+(?:the\\s+)?',
      'view\\s+(?:the\\s+)?',
      'let\'?s?\\s+see\\s+(?:the\\s+)?',
      'could\\s+you\\s+(?:please\\s+)?(?:share|show)\\s+(?:the\\s+)?',
      'I\'d\\s+like\\s+to\\s+see\\s+(?:the\\s+)?',
      'please\\s+(?:share|show)\\s+(?:the\\s+)?',
      'what\'s?\\s+in\\s+(?:the\\s+)?',
      'contents?\\s+of\\s+(?:the\\s+)?',
      'open\\s+(?:the\\s+)?',
      'looking\\s+for\\s+(?:the\\s+)?',
      'need\\s+(?:to\\s+see\\s+)?(?:the\\s+)?'
    ];
    
    // Create regex pattern for file extensions
    const extensionPattern = `\\.(${fileExtensions.join('|')})`;
    
    // Combined pattern to match phrases like "show me filename.ext" or just "filename.ext"
    const phrasePattern = `(${requestPhrases.join('|')})?([\\w\\-./]+${extensionPattern})\\b`;
    const naturalLangRegex = new RegExp(phrasePattern, 'gi');
    
    while ((match = naturalLangRegex.exec(message)) !== null) {
      const fileName = match[2]; // The filename from the capturing group
      if (fileName && !matches.includes(fileName) && !fileName.includes(' ')) {
        matches.push(fileName);
      }
    }
    
    console.log('Extracted file requests:', matches);
    return [...new Set(matches)]; // Ensure unique entries
  }

  /**
   * Find file path in project
   */
  findFilePath(fileName) {
    // If it's already a full path
    if (this.selectedFiles.has(fileName)) return fileName;
    
    // Try to find a matching file name
    for (const path of this.selectedFiles) {
      if (path.endsWith(`/${fileName}`) || path === fileName) {
        return path;
      }
    }
    
    return null;
  }

  /**
   * Format file content for insertion
   */
  formatFileContent(fileName, extension, content) {
    // Check file size and line count
    const isLargeFile = this.isLargeFile(content);
    
    // Add a unique marker to help prevent duplication
    const timestamp = Date.now();
    const marker = `<!-- file-content-${fileName}-${timestamp} -->`;
    
    return `${marker}
\`\`\`${this.getLanguageFromExtension(extension)}
// File: ${fileName}
${content}
\`\`\``;
  }
  
  /**
   * Check if a file is too large for direct insertion
   * @param {string} content - File content
   * @returns {boolean} - True if file is large
   */
  isLargeFile(content) {
    // Check if content is larger than ~10KB
    if (content.length > 10 * 1024) return true;
    
    // Check if file has more than 250 lines
    const lineCount = content.split('\n').length;
    if (lineCount > 250) return true;
    
    return false;
  }

  /**
   * Get language name from file extension
   */
  getLanguageFromExtension(extension) {
    const extensionMap = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'jsx',
      '.tsx': 'tsx',
      '.html': 'html',
      '.css': 'css',
      '.py': 'python',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.json': 'json',
      '.md': 'markdown',
      '.yml': 'yaml',
      '.yaml': 'yaml',
      '.xml': 'xml',
      '.sh': 'bash',
      '.bat': 'batch'
    };
    
    return extensionMap[extension.toLowerCase()] || '';
  }

  /**
   * Generate text representation of project structure
   */
  generateStructureText(structure, indent = '') {
    let text = '';
    
    for (const node of structure) {
      if (node.type === 'directory') {
        text += `${indent}📁 ${node.name}/\n`;
        if (Array.isArray(node.children)) {
          text += this.generateStructureText(node.children, indent + '  ');
        }
      } else if (node.type === 'file') {
        text += `${indent}📄 ${node.name}\n`;
      }
    }
    
    return text;
  }

  /**
   * Generate a hash for a message to track processed messages
   */
  hashMessage(message) {
    // Simple hash function for message tracking
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
      const char = message.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Reset the live context chat
   */
  reset() {
    this.processedMessages.clear();
    this.addedFileContents.clear();
    this.pendingRequests.clear();
    console.log('Live Context Chat state reset');
  }

  /**
   * Stop the live context chat
   */
  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    if (this.promptBoxObserver) {
      this.promptBoxObserver.disconnect();
      this.promptBoxObserver = null;
    }
    
    // Remove file dropdown
    if (this.fileDropdown) {
      this.fileDropdown.remove();
      this.fileDropdown = null;
    }
    
    // Remove keyboard event listener
    if (this.dropdownKeyHandler) {
      document.removeEventListener('keydown', this.dropdownKeyHandler);
      this.dropdownKeyHandler = null;
    }
    
    this.isInitialized = false;
    this.processedMessages.clear(); // Clear processed messages tracking
    this.addedFileContents.clear(); // Clear added files tracking
    
    console.log('Live Context Chat stopped');
    return true;
  }

  /**
   * Process conversation for file requests
   */
  async processConversation(conversations) {
    // Skip if no conversations
    if (!conversations || conversations.length === 0) return;
    
    // Get the last AI message
    const lastTurn = conversations[conversations.length - 1];
    if (!lastTurn || !lastTurn.ai) return;
    
    // Skip if we've already processed this message
    const messageHash = this.hashMessage(lastTurn.ai);
    if (this.processedMessages.has(messageHash)) {
      console.log('Message already processed, skipping', messageHash);
      return;
    }
    
    // Prepare a DOM element for HTML parsing
    const domParser = document.createElement('div');
    domParser.innerHTML = lastTurn.ai;
    const textContent = domParser.textContent || lastTurn.ai;
    
    // Look for file requests using both methods
    const fileRequests = this.extractFileRequests(lastTurn.ai);
    if (fileRequests.length === 0) return;
    
    console.log('File requests detected:', fileRequests);
    this.processedMessages.add(messageHash); // Mark as processed immediately to prevent race conditions
    
    // Build a combined response for all requested files
    let response = '';
    let addedAnyFile = false;
    
    const regularFiles = [];
    const largeFiles = [];
    
    // Process each file request
    for (const fileName of fileRequests) {
      // Skip if already being processed
      if (this.pendingRequests.has(fileName)) continue;
      
      // Skip if this file has already been added to the conversation
      const fileKey = `file:${fileName}`;
      const uploadKey = `uploaded:${fileName}`;
      if (this.addedFileContents.has(fileKey) || this.addedFileContents.has(uploadKey)) {
        console.log(`File ${fileName} already added to conversation, skipping`);
        continue;
      }
      
      this.pendingRequests.add(fileName);
      
      // Find the exact file path
      const filePath = this.findFilePath(fileName);
      if (!filePath) {
        response += `\nFile "${fileName}" not found in the project.\n`;
        continue;
      }
      
      try {
        // Read the file content
        const file = await this.fsHandler.readFile(filePath);
        
        // Check if file is large
        if (this.isLargeFile(file.content)) {
          // For large files, we'll handle them separately
          largeFiles.push({
            path: filePath,
            name: file.name,
            extension: file.extension,
            content: file.content,
            size: file.content.length
          });
        } else {
          // For smaller files, add them to the regular files array
          regularFiles.push({
            path: filePath,
            name: file.name,
            extension: file.extension,
            content: file.content
          });
        }
        
        // Mark this file as added
        this.addedFileContents.add(fileKey);
        addedAnyFile = true;
      } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        response += `\nError reading file "${fileName}": ${error.message}\n`;
      }
      
      this.pendingRequests.delete(fileName);
    }
    
    // First process regular-sized files
    if (regularFiles.length > 0) {
      for (const file of regularFiles) {
        const formattedContent = this.formatFileContent(file.name, file.extension, file.content);
        response += '\n' + formattedContent + '\n';
      }
      
      // Add the regular files to the prompt box
      if (response) {
        await this.setPromptContent(response, true);
      }
    }
    
    // Then handle large files sequentially
    if (largeFiles.length > 0) {
      // Show notification about large files being processed
      this.showNotification(`Processing ${largeFiles.length} large file(s). Please wait...`, 3000);
      
      // Process large files one by one with a slight delay between them
      await this.processLargeFilesSequentially(largeFiles);
    }
  }

  /**
   * Process large files one by one
   * @param {Array} largeFiles - Array of large file objects
   */
  async processLargeFilesSequentially(largeFiles) {
    for (let i = 0; i < largeFiles.length; i++) {
      const file = largeFiles[i];
      
      // Show progress notification
      if (largeFiles.length > 1) {
        this.showNotification(`Processing file ${i+1} of ${largeFiles.length}: ${file.name}`, 2000);
      }
      
      // Wait a moment for UI to update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try to insert the file as an attachment first
      const success = await this.autoInsertFileAsAttachment(file);
      
      // Only use fallback if direct insertion failed
      if (!success) {
        await this.fallbackFileInsertion(file);
      }
      
      // Wait between files to ensure proper handling
      if (i < largeFiles.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Notification when all files are processed
    if (largeFiles.length > 1) {
      this.showNotification(`All ${largeFiles.length} large files have been processed`, 3000);
    }
  }
  
  /**
   * Automatically insert a file as an attachment
   * @param {Object} file - File object with content and metadata
   * @returns {boolean} - True if file was successfully attached, false if fallback was needed
   */
  async autoInsertFileAsAttachment(file) {
    try {
      // Focus the input first
      this.targetInput.focus();

      // Check if the file is already visible in the attachment area
      // Look specifically for the file cards that ChatGPT uses
      const existingAttachments = document.querySelectorAll('.truncate.font-semibold');
      for (const attachment of existingAttachments) {
        if (attachment.textContent === file.name) {
          console.log(`File "${file.name}" already appears as an attachment`);
          const uploadKey = `uploaded:${file.name}`;
          this.addedFileContents.add(uploadKey);
          return true;
        }
      }
      
      // Create a file object from the content
      const blob = new Blob([file.content], { type: 'text/plain' });
      const fileObj = new File([blob], file.name, { type: 'text/plain' });
      
      // Check if file has already been uploaded by this name
      const uploadKey = `uploaded:${file.name}`;
      if (this.addedFileContents.has(uploadKey)) {
        console.log(`File "${file.name}" already uploaded, skipping`);
        return true; // Treat as success to prevent duplicate upload
      }
      
      // Get a snapshot of the DOM before we attempt the upload
      // This will help us detect if a new element appears containing our filename
      const chatContainer = document.querySelector('main') || document.body;
      const initialHTML = chatContainer.innerHTML;
      
      // Try to detect if we're in a browser that supports the DataTransfer API properly
      if (typeof ClipboardEvent === 'function' && typeof DataTransfer === 'function') {
        // Create a DataTransfer object
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(fileObj);
        
        // Create a clipboard event
        const clipboardEvent = new ClipboardEvent('paste', {
          clipboardData: dataTransfer,
          bubbles: true,
          cancelable: true
        });
        
        // Dispatch the event
        this.targetInput.dispatchEvent(clipboardEvent);
        
        // Wait longer for file attachments to appear - they may take more time
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Multiple checks to detect successful file attachment
        
        // Check 1: Look for the exact ChatGPT file card structure
        const fileCards = document.querySelectorAll('.truncate.font-semibold');
        for (const card of fileCards) {
          if (card.textContent === file.name) {
            console.log(`File "${file.name}" found in attachment cards`);
            this.addedFileContents.add(uploadKey);
            return true;
          }
        }
        
        // Check 2: Look for the file name in any new elements
        const composerBackground = document.getElementById('composer-background');
        if (composerBackground && composerBackground.textContent.includes(file.name)) {
          console.log(`File "${file.name}" found in composer background`);
          this.addedFileContents.add(uploadKey);
          return true;
        }
        
        // Check 3: Look for specific ChatGPT attachment elements
        const attachmentElements = document.querySelectorAll('.group.relative.inline-block, [class*="flex-nowrap gap-2"]');
        for (const element of attachmentElements) {
          if (element.textContent.includes(file.name)) {
            console.log(`File "${file.name}" found in attachment elements`);
            this.addedFileContents.add(uploadKey);
            return true;
          }
        }
        
        // Check 4: Compare DOM before and after to see if our filename appears in any new element
        const currentHTML = chatContainer.innerHTML;
        if (currentHTML !== initialHTML && currentHTML.includes(file.name)) {
          // The DOM changed and our filename is now present
          console.log(`File "${file.name}" detected in DOM after paste event`);
          this.addedFileContents.add(uploadKey);
          return true;
        }

        // Wait a bit longer and try one more specific check
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Final check for any attachment in ChatGPT's interface
        const allFileCandidates = document.querySelectorAll('.truncate');
        for (const element of allFileCandidates) {
          if (element.textContent === file.name) {
            console.log(`File "${file.name}" found in additional check`);
            this.addedFileContents.add(uploadKey);
            return true;
          }
        }
      }
      
      // Special handling for all JavaScript files since they seem to work well
      if (file.name.endsWith('.js')) {
        console.log(`Special handling for JavaScript file: "${file.name}"`);
        // Mark as uploaded to prevent duplication
        this.addedFileContents.add(uploadKey);
        // Don't show fallback message for JavaScript files
        return true;
      }
      
      // If we got here, the primary method didn't work, so fall back to simpler method
      console.warn(`Direct file paste not supported in this browser for "${file.name}", falling back to content insertion`);
      return false;
    } catch (error) {
      console.error('Error auto-inserting file:', error);
      return false;
    }
  }
  
  /**
   * Fallback method if automatic file insertion fails
   * @param {Object} file - File object with content and metadata
   */
  async fallbackFileInsertion(file) {
    // Check if this file has already been added to the conversation
    const fileKey = `file:${file.name}`;
    if (this.addedFileContents.has(fileKey)) {
      console.log(`File ${file.name} already added as content, skipping fallback insertion`);
      return;
    }
    
    // Simpler fallback: just insert the file content directly as formatted text
    try {
      // Show notification
      this.showNotification(`Inserting content of large file: ${file.name}`, 3000);
      
      // Insert the content as formatted text
      const formattedContent = this.formatFileContent(file.name, file.extension, file.content);
      await this.setPromptContent('\n' + formattedContent + '\n', true);
      
      // Mark as processed to avoid duplication
      this.addedFileContents.add(fileKey);
      
      console.log(`Inserted content of "${file.name}" as formatted text`);
    } catch (error) {
      console.error('Fallback file insertion failed:', error);
      this.showNotification(`Failed to insert file: ${file.name}`, 3000);
    }
  }

  /**
   * Get all file paths from the project for autocomplete
   * @returns {Promise<string[]>} Array of file paths
   */
  async getProjectFilePaths() {
    // Return cached paths if available
    if (this.projectFilePaths) {
      return this.projectFilePaths;
    }
    
    // Convert Set to Array for autocomplete
    this.projectFilePaths = Array.from(this.selectedFiles);
    return this.projectFilePaths;
  }
  
  /**
   * Initialize autocomplete for file requests
   */
  async initializeAutoComplete() {
    console.log('Initializing file autocomplete');
    if (!this.targetInput) {
      console.warn('No promptbox found for autocomplete');
      return;
    }
    
    // Attach input handlers
    this.attachAutocompleteHandlers(this.targetInput);
  }
  
  /**
   * Attach autocomplete handlers to the prompt box
   */
  attachAutocompleteHandlers(promptBox) {
    // Remove existing handlers if any
    promptBox.removeEventListener('input', this.handlePromptInput);
    
    // Store a reference to the bound handler for later removal
    this.handlePromptInput = this.handlePromptInput.bind(this);
    promptBox.addEventListener('input', this.handlePromptInput);
    
    // Add click handler to document to close dropdown when clicking outside
    document.addEventListener('click', (event) => {
      if (this.dropdownVisible && !this.fileDropdown.contains(event.target) && 
          event.target !== this.targetInput) {
        this.hideFileDropdown();
      }
    });
    
    // Add global keyboard handler for dropdown navigation
    if (this.dropdownKeyHandler) {
      document.removeEventListener('keydown', this.dropdownKeyHandler);
    }
    
    this.dropdownKeyHandler = this.handleDropdownKeyNavigation.bind(this);
    document.addEventListener('keydown', this.dropdownKeyHandler);
    
    console.log('Autocomplete handlers attached to prompt box');
  }
  
  /**
   * Handle input in the prompt box to detect @ characters
   */
  handlePromptInput(event) {
    if (!this.targetInput) return;
    
    // Get current text and cursor position
    const text = this.targetInput.value || this.targetInput.textContent || '';
    const cursorPosition = this.getCursorPosition();
    
    // If dropdown is visible, update filtering
    if (this.dropdownVisible) {
      const textAfterAt = this.getTextAfterLastAt(text, cursorPosition);
      
      if (textAfterAt !== null) {
        this.filterFileDropdown(textAfterAt);
      } else {
        this.hideFileDropdown();
      }
      return;
    }
    
    // Check if the user just typed @
    if (text.charAt(cursorPosition - 1) === '@') {
      this.showFileDropdown(cursorPosition);
    }
  }
  
  /**
   * Get text between last @ symbol and cursor
   */
  getTextAfterLastAt(text, cursorPosition) {
    // Find the last @ before cursor
    const lastAtIndex = text.lastIndexOf('@', cursorPosition - 1);
    if (lastAtIndex === -1) return null;
    
    // Check if @ is still valid (no spaces between @ and cursor)
    const textBetween = text.substring(lastAtIndex + 1, cursorPosition);
    if (textBetween.includes(' ')) return null;
    
    return textBetween;
  }
  
  /**
   * Get current cursor position in the prompt box
   */
  getCursorPosition() {
    if (!this.targetInput) return 0;
    
    if (this.targetInput.selectionStart !== undefined) {
      return this.targetInput.selectionStart;
    }
    
    // For contenteditable divs
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return 0;
    
    const range = selection.getRangeAt(0);
    return range.startOffset;
  }
  
  /**
   * Show the file autocomplete dropdown
   */
  async showFileDropdown(cursorPosition) {
    console.log('Showing file dropdown');
    
    // Create dropdown element if it doesn't exist
    if (!this.fileDropdown) {
      this.fileDropdown = document.createElement('div');
      this.fileDropdown.className = 'file-autocomplete-dropdown';
      document.body.appendChild(this.fileDropdown);
    }
    
    // Position dropdown below the @ character
    this.positionDropdown();
    
    // Clear dropdown and show loading
    this.fileDropdown.innerHTML = '<div class="dropdown-item loading">Loading files...</div>';
    this.fileDropdown.style.display = 'block';
    this.dropdownVisible = true;
    
    // Populate with files
    await this.populateFileDropdown();
  }
  
  /**
   * Position the dropdown relative to the prompt box
   */
  positionDropdown() {
    if (!this.targetInput || !this.fileDropdown) return;
    
    const inputRect = this.targetInput.getBoundingClientRect();
    
    this.fileDropdown.style.position = 'absolute';
    this.fileDropdown.style.left = `${inputRect.left}px`;
    this.fileDropdown.style.top = `${inputRect.top - 210}px`;  // Position above the input
    this.fileDropdown.style.width = `${Math.min(inputRect.width, 350)}px`;
  }
  
  /**
   * Hide the file dropdown
   */
  hideFileDropdown() {
    if (this.fileDropdown) {
      this.fileDropdown.style.display = 'none';
      this.dropdownVisible = false;
    }
  }
  
  /**
   * Populate dropdown with project files
   */
  async populateFileDropdown() {
    if (!this.fileDropdown) return;
    
    try {
      // Get project files
      const filePaths = await this.getProjectFilePaths();
      
      // Clear dropdown
      this.fileDropdown.innerHTML = '';
      
      if (filePaths.length === 0) {
        this.fileDropdown.innerHTML = '<div class="dropdown-item no-results">No files found</div>';
        return;
      }
      
      // Sort paths for better UX
      filePaths.sort((a, b) => {
        // Sort by filename first
        const aName = a.split('/').pop();
        const bName = b.split('/').pop();
        return aName.localeCompare(bName);
      });
      
      // Add items to dropdown
      filePaths.forEach(path => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.setAttribute('data-path', path);
        
        // Extract filename for display
        const fileName = path.split('/').pop();
        const fileExt = this._getFileExtension(fileName);
        
        // Add icon based on file extension
        const icon = this.getFileIcon(fileExt);
        
        // Create displayable path (truncate if too long)
        let displayPath = path;
        if (displayPath.length > 40) {
          const parts = displayPath.split('/');
          const name = parts.pop();
          displayPath = '.../' + parts.slice(-2).join('/') + '/' + name;
        }
        
        item.innerHTML = `
          <span class="file-icon">${icon}</span>
          <span class="file-name">${fileName}</span>
          <span class="file-path">${displayPath}</span>
        `;
        
        // Add click handler
        item.addEventListener('click', () => {
          this.selectFile(path);
        });
        
        this.fileDropdown.appendChild(item);
      });
      
      // Highlight first item
      const firstItem = this.fileDropdown.querySelector('.dropdown-item');
      if (firstItem) {
        firstItem.classList.add('selected');
      }
    } catch (error) {
      console.error('Error populating file dropdown:', error);
      this.fileDropdown.innerHTML = '<div class="dropdown-item error">Error loading files</div>';
    }
  }
  
  /**
   * Get file icon based on extension
   */
  getFileIcon(extension) {
    const iconMap = {
      '.js': '📄',
      '.ts': '📄',
      '.jsx': '📄',
      '.tsx': '📄',
      '.html': '📄',
      '.css': '📄',
      '.json': '📄',
      '.md': '📄',
      '.py': '📄',
      '.java': '📄',
      '.c': '📄',
      '.cpp': '📄',
      '.h': '📄',
      '.hpp': '📄',
      '.cs': '📄',
      '.php': '📄',
      '.rb': '📄',
      '.go': '📄',
      '.rs': '📄',
      '.swift': '📄',
      '.kt': '📄',
      '.xml': '📄',
      '.yml': '📄',
      '.yaml': '📄',
      '.toml': '📄',
      '.ini': '📄',
      '.cfg': '📄',
      '.txt': '📄',
      '.env': '📄',
      '.sh': '📄',
      '.bat': '📄'
    };
    
    return iconMap[extension] || '📄';
  }
  
  /**
   * Extract file extension from filename
   */
  _getFileExtension(fileName) {
    const parts = fileName.split('.');
    if (parts.length < 2) return '';
    return '.' + parts.pop().toLowerCase();
  }
  
  /**
   * Filter file dropdown based on typed text
   */
  filterFileDropdown(query) {
    if (!this.fileDropdown || !this.dropdownVisible) return;
    
    // Remove "no results" message if it exists
    const noResults = this.fileDropdown.querySelector('.no-results');
    if (noResults) {
      noResults.remove();
    }
    
    // Filter items
    const items = this.fileDropdown.querySelectorAll('.dropdown-item');
    let visibleCount = 0;
    
    items.forEach(item => {
      if (item.classList.contains('loading') || item.classList.contains('error')) {
        return;
      }
      
      const path = item.getAttribute('data-path');
      const fileName = path.split('/').pop();
      
      // Show if filename contains query
      if (fileName.toLowerCase().includes(query.toLowerCase())) {
        item.style.display = '';
        visibleCount++;
      } else {
        item.style.display = 'none';
      }
    });
    
    // Show "no results" message if no matches
    if (visibleCount === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'dropdown-item no-results';
      noResults.textContent = `No files matching "${query}"`;
      this.fileDropdown.appendChild(noResults);
    }
    
    // Re-select first visible item
    const selected = this.fileDropdown.querySelector('.selected');
    if (selected) {
      selected.classList.remove('selected');
    }
    
    const firstVisible = this.fileDropdown.querySelector('.dropdown-item:not([style*="display: none"])');
    if (firstVisible) {
      firstVisible.classList.add('selected');
    }
  }
  
  /**
   * Handle keyboard navigation in dropdown
   */
  handleDropdownKeyNavigation(event) {
    if (!this.dropdownVisible) return;
    
    // Get visible items
    const items = Array.from(
      this.fileDropdown.querySelectorAll('.dropdown-item:not([style*="display: none"])')
    ).filter(item => !item.classList.contains('no-results'));
    
    // Find currently selected item
    const selectedIndex = items.findIndex(item => item.classList.contains('selected'));
    
    switch (event.key) {
      case 'ArrowDown':
        if (items.length === 0) return;
        event.preventDefault();
        
        // Remove selection from current item
        if (selectedIndex >= 0) {
          items[selectedIndex].classList.remove('selected');
        }
        
        // Select next item or wrap around
        const nextIndex = selectedIndex < items.length - 1 ? selectedIndex + 1 : 0;
        items[nextIndex].classList.add('selected');
        items[nextIndex].scrollIntoView({ block: 'nearest' });
        break;
        
      case 'ArrowUp':
        if (items.length === 0) return;
        event.preventDefault();
        
        // Remove selection from current item
        if (selectedIndex >= 0) {
          items[selectedIndex].classList.remove('selected');
        }
        
        // Select previous item or wrap around
        const prevIndex = selectedIndex > 0 ? selectedIndex - 1 : items.length - 1;
        items[prevIndex].classList.add('selected');
        items[prevIndex].scrollIntoView({ block: 'nearest' });
        break;
        
      case 'Enter':
        if (selectedIndex >= 0) {
          event.preventDefault();
          const path = items[selectedIndex].getAttribute('data-path');
          this.selectFile(path);
        }
        break;
        
      case 'Escape':
        event.preventDefault();
        this.hideFileDropdown();
        break;
        
      case 'Tab':
        if (selectedIndex >= 0) {
          event.preventDefault();
          const path = items[selectedIndex].getAttribute('data-path');
          this.selectFile(path);
        }
        break;
    }
  }
  
  /**
   * Select a file from the dropdown
   */
  async selectFile(filePath) {
    try {
      // Hide dropdown immediately for better UX
      this.hideFileDropdown();
      
      // Read the file
      const file = await this.fsHandler.readFile(filePath);
      
      // Check if this file has already been added to the conversation
      const fileName = file.name;
      const fileKey = `file:${fileName}`;
      const uploadKey = `uploaded:${fileName}`;
      
      if (this.addedFileContents.has(fileKey) || this.addedFileContents.has(uploadKey)) {
        console.log(`File ${fileName} already added to conversation, skipping`);
        this.showNotification(`File ${fileName} already added to this conversation`, 2000);
        return;
      }
      
      // Check if this is a large file
      if (this.isLargeFile(file.content)) {
        // For large files, use automatic file attachment
        const success = await this.autoInsertFileAsAttachment({
          path: filePath,
          name: file.name,
          extension: file.extension,
          content: file.content
        });
        
        // Only use fallback if direct insertion failed
        if (!success) {
          await this.fallbackFileInsertion({
            path: filePath,
            name: file.name,
            extension: file.extension,
            content: file.content
          });
        }
      } else {
        // For smaller files, use the standard method
        // Mark this file as added to prevent duplication
        this.addedFileContents.add(fileKey);
        
        const formattedContent = this.formatFileContent(file.name, file.extension, file.content);
        this.replaceAtWithFileContent(formattedContent);
      }
      
      console.log(`File content inserted: ${filePath}`);
    } catch (error) {
      console.error('Error inserting file content:', error);
      
      // Insert just the filename if we can't read the file
      this.replaceAtWithFileName(filePath.split('/').pop());
    }
  }
  
  /**
   * Show a notification to the user
   * @param {string} message - Message to display
   * @param {number} duration - How long to show the message in ms
   */
  showNotification(message, duration = 5000) {
    // Create notification element if it doesn't exist
    if (!this.notificationElement) {
      this.notificationElement = document.createElement('div');
      this.notificationElement.className = 'file-notification';
      this.notificationElement.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #333;
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 400px;
        display: none;
      `;
      document.body.appendChild(this.notificationElement);
    }
    
    // Set message and show
    this.notificationElement.textContent = message;
    this.notificationElement.style.display = 'block';
    
    // Hide after duration
    clearTimeout(this.notificationTimeout);
    this.notificationTimeout = setTimeout(() => {
      this.notificationElement.style.display = 'none';
    }, duration);
  }
  
  /**
   * Replace the @ at current cursor with file content
   */
  replaceAtWithFileContent(formattedContent) {
    if (!this.targetInput) return;
    
    const isContentEditable = this.targetInput.getAttribute('contenteditable') === 'true';
    const text = isContentEditable ? this.targetInput.textContent : this.targetInput.value;
    const cursorPosition = this.getCursorPosition();
    
    // Find the last @ before cursor
    const lastAtIndex = text.lastIndexOf('@', cursorPosition - 1);
    if (lastAtIndex === -1) return;
    
    // Create replacement text
    const beforeAt = text.substring(0, lastAtIndex);
    const afterCursor = text.substring(cursorPosition);
    const newText = beforeAt + formattedContent + afterCursor;
    
    // Set the new text
    if (isContentEditable) {
      this.targetInput.innerHTML = newText;
    } else {
      this.targetInput.value = newText;
    }
    
    // Trigger input event to update React state
    const inputEvent = new Event('input', { bubbles: true });
    this.targetInput.dispatchEvent(inputEvent);
    
    // Set cursor position after inserted content
    this.setCursorPosition(lastAtIndex + formattedContent.length);
  }
  
  /**
   * Replace the @ at current cursor with filename
   */
  replaceAtWithFileName(fileName) {
    if (!this.targetInput) return;
    
    const isContentEditable = this.targetInput.getAttribute('contenteditable') === 'true';
    const text = isContentEditable ? this.targetInput.textContent : this.targetInput.value;
    const cursorPosition = this.getCursorPosition();
    
    // Find the last @ before cursor
    const lastAtIndex = text.lastIndexOf('@', cursorPosition - 1);
    if (lastAtIndex === -1) return;
    
    // Create replacement text
    const beforeAt = text.substring(0, lastAtIndex);
    const afterCursor = text.substring(cursorPosition);
    const newText = beforeAt + fileName + afterCursor;
    
    // Set the new text
    if (isContentEditable) {
      this.targetInput.textContent = newText;
    } else {
      this.targetInput.value = newText;
    }
    
    // Trigger input event to update React state
    const inputEvent = new Event('input', { bubbles: true });
    this.targetInput.dispatchEvent(inputEvent);
    
    // Set cursor position after inserted filename
    this.setCursorPosition(lastAtIndex + fileName.length);
  }
  
  /**
   * Set cursor position in prompt box
   */
  setCursorPosition(position) {
    if (!this.targetInput) return;
    
    if (this.targetInput.getAttribute('contenteditable') === 'true') {
      // For contenteditable
      const selection = window.getSelection();
      const range = document.createRange();
      
      // Find the text node and position within it
      let currentPos = 0;
      let targetNode = null;
      let targetOffset = 0;
      
      const traverse = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          if (currentPos + node.length >= position) {
            targetNode = node;
            targetOffset = position - currentPos;
            return true;
          }
          currentPos += node.length;
        } else {
          for (const child of node.childNodes) {
            if (traverse(child)) return true;
          }
        }
        return false;
      };
      
      traverse(this.targetInput);
      
      if (targetNode) {
        range.setStart(targetNode, targetOffset);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } else {
      // For regular inputs
      this.targetInput.setSelectionRange(position, position);
    }
  }
  
  /**
   * Add styles for the file dropdown
   */
  addDropdownStyles() {
    const styleId = 'file-autocomplete-styles';
    
    // Don't add styles if they already exist
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .file-autocomplete-dropdown {
        position: absolute;
        max-height: 200px;
        width: 350px;
        overflow-y: auto;
        background-color: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
      }
      
      .dropdown-item {
        padding: 8px 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        border-bottom: 1px solid #eee;
      }
      
      .dropdown-item:last-child {
        border-bottom: none;
      }
      
      .dropdown-item:hover,
      .dropdown-item.selected {
        background-color: #f0f7ff;
      }
      
      .dropdown-item.loading,
      .dropdown-item.error,
      .dropdown-item.no-results {
        justify-content: center;
        color: #666;
        font-style: italic;
      }
      
      .file-icon {
        margin-right: 8px;
        font-size: 16px;
      }
      
      .file-name {
        font-weight: 500;
        margin-right: auto;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .file-path {
        font-size: 12px;
        color: #888;
        max-width: 150px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `;
    
    document.head.appendChild(style);
    console.log('Added dropdown styles');
  }
}

// Make it accessible from the popup
window.LiveContextChat = LiveContextChat; 