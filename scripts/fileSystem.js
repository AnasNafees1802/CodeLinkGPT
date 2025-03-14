/**
 * File System Access API handler
 * Provides methods to interact with the user's file system
 */
class FileSystemHandler {
  constructor() {
    this.rootDirectory = null;
    this.projectName = '';
    this.projectPath = '';
  }

  /**
   * Open a directory picker and get user's project folder
   */
  async openProjectFolder() {
    try {
      // Check if File System Access API is available
      if (!window.showDirectoryPicker) {
        throw new Error('Your browser does not support the File System Access API. Please use Chrome or a Chromium-based browser.');
      }

      try {
        // Show directory picker with specific options to trigger permission prompt
        const dirHandle = await window.showDirectoryPicker({
          mode: 'read',
          multiple: false
        });

        // Try to read the directory contents to trigger permission
        try {
          // This will trigger the permission prompt
          await this.verifyDirectoryAccess(dirHandle);
          
          this.rootDirectory = dirHandle;
          this.projectName = dirHandle.name;
          this.projectPath = dirHandle.name;
          
          return {
            name: this.projectName,
            path: this.projectPath,
            handle: this.rootDirectory
          };
        } catch (permError) {
          throw new Error(
            'Unable to read the selected folder. Please ensure:\n' +
            '1. You selected a valid folder\n' +
            '2. The folder is not empty\n' +
            '3. You have permission to access the folder'
          );
        }
      } catch (error) {
        if (error.name === 'AbortError') {
          throw new Error('Project folder selection was cancelled.');
        } else if (error.name === 'SecurityError') {
          throw new Error(
            'Permission denied. Please try these steps:\n' +
            '1. Right-click the extension icon in Chrome\n' +
            '2. Click "This can read site and file data"\n' +
            '3. Select "On all sites"\n' +
            '4. Try opening the project again'
          );
        }
        throw error;
      }
    } catch (error) {
      console.error('Error opening project folder:', error);
      throw new Error(error.message || 'Failed to open project folder. Please try again.');
    }
  }

  /**
   * Verify we can access the directory by trying to read its contents
   */
  async verifyDirectoryAccess(dirHandle) {
    // Try to get the first entry in the directory
    const entries = dirHandle.values();
    try {
      await entries.next();
      return true;
    } catch (error) {
      console.error('Directory access verification failed:', error);
      return false;
    }
  }
  
  /**
   * Get project structure as a tree
   */
  async getProjectStructure() {
    if (!this.rootDirectory) {
      throw new Error('No project folder opened');
    }
    
    return await this._processDirectory(this.rootDirectory);
  }
  
  /**
   * Process a directory and its contents recursively
   */
  async _processDirectory(directoryHandle, path = '') {
    const entries = [];
    
    for await (const entry of directoryHandle.values()) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;
      
      if (entry.kind === 'directory') {
        const children = await this._processDirectory(entry, entryPath);
        entries.push({
          name: entry.name,
          path: entryPath,
          type: 'directory',
          children
        });
      } else {
        // Skip very large files, hidden files, and binaries
        if (this._shouldSkipFile(entry.name)) {
          continue;
        }
        
        entries.push({
          name: entry.name,
          path: entryPath,
          type: 'file',
          extension: this._getFileExtension(entry.name)
        });
      }
    }
    
    // Sort directories first, then files
    return entries.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === 'directory' ? -1 : 1;
    });
  }
  
  /**
   * Read a file's content
   */
  async readFile(filePath) {
    if (!this.rootDirectory) {
      throw new Error('No project folder opened');
    }
    
    try {
      const pathParts = filePath.split('/');
      let currentHandle = this.rootDirectory;
      
      // Navigate to the file
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        if (i === pathParts.length - 1) {
          // This is the file
          const fileHandle = await currentHandle.getFileHandle(part);
          const file = await fileHandle.getFile();
          const content = await file.text();
          
          return {
            name: part,
            path: filePath,
            content,
            extension: this._getFileExtension(part),
            size: file.size
          };
        } else {
          // This is a directory
          currentHandle = await currentHandle.getDirectoryHandle(part);
        }
      }
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      throw new Error(`Failed to read file: ${filePath}`);
    }
  }
  
  /**
   * Save context file to user's file system
   */
  async saveContextFile(contextData, fileName) {
    try {
      // Default name if not provided
      fileName = fileName || `${this.projectName}-context.json`;
      
      // Ensure the contextData is properly formatted and all content is encoded correctly
      if (!contextData || typeof contextData !== 'object') {
        console.error('Invalid context data:', contextData);
        throw new Error('Invalid context data format');
      }
      
      // Make a safe copy of the data to prevent circular references and encoding issues
      const safeData = JSON.parse(JSON.stringify(contextData));
      
      // Add metadata to help parsing
      safeData._metadata = {
        version: '1.0',
        generator: 'CodeLinkGPT',
        exportedAt: new Date().toISOString(),
        totalFiles: safeData.files ? safeData.files.length : 0
      };
      
      // Validate each file entry has content
      if (safeData.files && Array.isArray(safeData.files)) {
        let contentSizeWarning = false;
        for (let i = 0; i < safeData.files.length; i++) {
          const file = safeData.files[i];
          if (!file.content) {
            console.warn(`File ${file.name} has no content, adding placeholder`);
            file.content = "[Content not available]";
          }
          
          // Check for very large files and warn (but still include)
          if (file.content && file.content.length > 1000000) { // 1MB
            console.warn(`File ${file.name} has very large content (${file.content.length} chars)`);
            contentSizeWarning = true;
          }
        }
        
        if (contentSizeWarning) {
          console.warn('Some files are very large, which may cause issues with AI systems');
        }
      }
      
      // Format the JSON with proper indentation
      const formattedJson = JSON.stringify(safeData, null, 2);
      
      // Check if the output is too large (>50MB is probably an issue)
      if (formattedJson.length > 50 * 1024 * 1024) {
        console.error(`Generated context is very large: ${(formattedJson.length / (1024 * 1024)).toFixed(2)}MB`);
        if (!confirm(`The generated context is very large (${(formattedJson.length / (1024 * 1024)).toFixed(2)}MB). This may cause issues. Continue anyway?`)) {
          throw new Error('Context generation cancelled due to large size');
        }
      }
      
      // Show save file picker
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{
          description: 'JSON Files',
          accept: {
            'application/json': ['.json'],
          },
        }],
      });
      
      // Create a writable stream and write the data
      const writable = await fileHandle.createWritable();
      await writable.write(formattedJson);
      await writable.close();
      
      console.log(`Context file saved successfully: ${fileName} (${(formattedJson.length / 1024).toFixed(2)}KB)`);
      return true;
    } catch (error) {
      console.error('Error saving context file:', error);
      throw new Error(`Failed to save context file: ${error.message}`);
    }
  }
  
  /**
   * Determine if a file should be skipped based on name or extension
   */
  _shouldSkipFile(fileName) {
    // Skip hidden files
    if (fileName.startsWith('.')) {
      return true;
    }
    
    // Skip common binary and generated files
    const skipExtensions = [
      '.exe', '.dll', '.obj', '.bin', '.png', '.jpg', '.jpeg', 
      '.gif', '.bmp', '.ico', '.svg', '.mp3', '.mp4', '.avi',
      '.mov', '.pdf', '.zip', '.rar', '.7z', '.tar', '.gz'
    ];
    
    const extension = this._getFileExtension(fileName).toLowerCase();
    return skipExtensions.includes(extension);
  }
  
  /**
   * Get file extension from filename
   */
  _getFileExtension(fileName) {
    const lastDotIndex = fileName.lastIndexOf('.');
    return lastDotIndex === -1 ? '' : fileName.slice(lastDotIndex);
  }
}

// Export the handler
window.FileSystemHandler = FileSystemHandler; 