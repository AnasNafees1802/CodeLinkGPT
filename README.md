# CodeLinkGPT

> 🔗 Connect your local project files seamlessly with ChatGPT for real-time coding assistance.
> 
> Created by [Anas Nafees](https://www.linkedin.com/in/anas-nafees-a1a466205/)

![CodeLinkGPT Banner](images/banner.svg)

## 🚀 Problem Solved

When using ChatGPT for coding assistance, developers face a challenge: how to provide the AI with access to their project files in real-time? Uploading individual files is cumbersome and interrupts your workflow.

**CodeLinkGPT** solves this by:
1. Creating a direct connection between your local project and ChatGPT
2. Enabling intelligent file requests with autocomplete suggestions
3. Automatically providing file content when requested
4. Maintaining context throughout your chat session

## ✨ Features

- **Live Context AI Chat**: Connect your project directly to ChatGPT
- **Intelligent File Autocomplete**: Type `@` to see file suggestions as you type
- **Smart File Detection**: AI can request files using `@filename.ext` syntax or natural language
- **Automatic Large File Handling**: Seamlessly uploads larger files as attachments
- **Real-time File Access**: ChatGPT can access your project files as needed during the conversation
- **Project Structure Overview**: Share your project structure with ChatGPT for better context
- **Safe & Private**: All operations happen locally in your browser

## 📦 Installation

### Development Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the extension directory
5. The extension should now appear in your Chrome toolbar

### From Chrome Web Store (Coming Soon)

The extension will be available on the Chrome Web Store after initial testing.

## 🔍 Usage

1. Navigate to [ChatGPT](https://chatgpt.com)
2. Click the CodeLinkGPT icon in your Chrome toolbar
3. Click "Live Context AI Chat"
4. Click "Initialize Live Chat" and select your project folder
5. The extension will automatically set up project context
6. Request files in three easy ways:
   - Type `@` and use autocomplete to select files
   - Use the `@filename.ext` syntax (e.g., `@index.js`)
   - Use natural language (e.g., "Show me the manifest.json file")
7. The extension automatically adds file content to your conversation

## ⚙️ How It Works

The extension monitors your conversation with ChatGPT and:
1. Detects when ChatGPT requests a specific file
2. Finds the file in your project
3. Adds the file content to your prompt box automatically
4. Formats the code with proper syntax highlighting
5. For large files, uploads them as attachments to avoid chat clutter

## 🎨 UI/UX Features

- **Clean, Minimalist Interface**: Focus on your conversation without distractions
- **File Autocomplete Dropdown**: Quick access to all project files by typing `@`
- **Visual File Icons**: Easily identify file types at a glance
- **Status Notifications**: Clear feedback when files are processed
- **Responsive Design**: Works seamlessly on any screen size
- **Dark Mode Compatible**: Respects your ChatGPT theme preferences
- **Keyboard Navigation**: Use arrow keys and enter to select files from autocomplete

## ⚠️ Limitations

- The extension requires Chrome's File System Access API, which is only available in Chrome and Chromium-based browsers
- It currently only works on the ChatGPT website
- Binary files and certain file types are excluded

## 🔒 Privacy

CodeLinkGPT operates entirely locally in your browser. No data is sent to any server, and your project files never leave your computer. The extension only requests necessary permissions to access files you explicitly select.

## 👨‍💻 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

<p align="center">
  <sub>Created with ❤️ by <a href="https://www.linkedin.com/in/anas-nafees-a1a466205/">Anas Nafees</a></sub>
</p> 